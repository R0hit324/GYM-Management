/**
 * WS-4 — receipt issuance, secure storage and authorization tests.
 *
 * Storage is mocked: no network, no bucket, no real member data. All
 * authorization decisions remain server-side (Storage RLS + RPCs); these
 * tests prove the client pipeline cannot bypass them and fails safely.
 */
import type {
  ReceiptIssueDeps,
  ReceiptIssueOutcome,
  ReceiptStorage,
  ReceiptStorageClientLike,
} from '@/services/receipts';
import {
  RECEIPT_MAX_BYTES,
  RECEIPT_SIGNED_URL_TTL_SECONDS,
  base64ToArrayBuffer,
  base64ToUint8Array,
  clampSignedUrlTtl,
  createReceiptStorage,
  isAlreadyStoredError,
  isValidReceiptObjectPath,
  issueReceiptDocument,
  receiptObjectPath,
} from '@/services/receipts';
import type { WriteOutcome } from '@/services/data';
import type { Member, MembershipPlan, PaymentRecord } from '@/types/domain';

const PAYMENT_ID = '11111111-1111-4111-8111-111111111111';
const MEMBER_ID = '22222222-2222-4222-8222-222222222222';
const PLAN_ID = '33333333-3333-4333-8333-333333333333';
const RECEIPT_PATH = `${MEMBER_ID}/${PAYMENT_ID}.pdf`;

function makeMember(overrides: Partial<Member> = {}): Member {
  return {
    id: MEMBER_ID,
    name: 'Mira Kapoor',
    phone: '+919876543210',
    email: 'mira@example.com',
    planId: PLAN_ID,
    status: 'active',
    membershipEnd: '2027-12-31',
    priceLocked: 1500,
    discountPct: 0,
    lastAttendance: null,
    joinedOn: '2026-01-10',
    followUp: { status: 'none' },
    ...overrides,
  };
}

function makePlan(overrides: Partial<MembershipPlan> = {}): MembershipPlan {
  return {
    id: PLAN_ID,
    name: 'Monthly Strength',
    duration: 'monthly',
    price: 1500,
    currency: 'INR',
    isActive: true,
    ...overrides,
  };
}

function makePayment(overrides: Partial<PaymentRecord> = {}): PaymentRecord {
  return {
    id: PAYMENT_ID,
    memberId: MEMBER_ID,
    memberName: 'Mira Kapoor',
    planId: PLAN_ID,
    originalPrice: 1500,
    discountPct: 0,
    payable: 1500,
    method: 'upi',
    utr: 'UTR-2026-0001',
    state: 'verified',
    receiptIssued: false,
    createdAt: '2026-11-05T09:00:00.000Z',
    verifiedAt: '2026-11-05T09:30:00.000Z',
    entryType: 'payment',
    ...overrides,
  };
}

const TEST_PDF_BASE64 = 'JVBERi0xLjQgdGVzdCByZWNlaXB0'; // "%PDF-1.4 test receipt"

function makeStorage() {
  return {
    bucket: 'receipts',
    upload: jest.fn(
      async (
        _path: string,
        _data: ArrayBuffer,
      ): Promise<{ ok: boolean; error?: { message: string; statusCode?: number } }> => ({ ok: true }),
    ),
    createSignedUrl: jest.fn(async (_path: string, _ttl: number) => ({
      ok: true,
      url: 'https://example.supabase.co/storage/v1/signed/receipt',
      expiresInSeconds: RECEIPT_SIGNED_URL_TTL_SECONDS,
    })),
  };
}

function makeDeps(overrides: Partial<ReceiptIssueDeps> = {}): ReceiptIssueDeps {
  return {
    storage: makeStorage() as unknown as ReceiptStorage,
    renderPdf: jest.fn(async (_html: string) => ({ base64: TEST_PDF_BASE64 })),
    attachPath: jest.fn(async (): Promise<WriteOutcome<string>> => ({ ok: true, data: PAYMENT_ID })),
    issueFlag: jest.fn(async (): Promise<WriteOutcome<string>> => ({ ok: true, data: PAYMENT_ID })),
    ...overrides,
  };
}

function input(overrides: {
  payment?: Partial<PaymentRecord>;
  member?: Partial<Member>;
  plan?: MembershipPlan | null;
  reversedAmount?: number;
} = {}) {
  return {
    payment: makePayment(overrides.payment),
    member: makeMember(overrides.member),
    plan: overrides.plan === undefined ? makePlan() : overrides.plan,
    reversedAmount: overrides.reversedAmount,
  };
}

function expectSuccess(outcome: ReceiptIssueOutcome) {
  if (!outcome.ok) throw new Error(`expected success, got ${outcome.code}: ${outcome.error}`);
  return outcome;
}

function expectFailure(outcome: ReceiptIssueOutcome) {
  if (outcome.ok) throw new Error('expected failure, got success');
  return outcome;
}

describe('receipt object naming', () => {
  it('builds a deterministic member/payment PDF path and lowercases UUIDs', () => {
    expect(receiptObjectPath(MEMBER_ID.toUpperCase(), PAYMENT_ID)).toEqual({
      ok: true,
      path: RECEIPT_PATH,
    });
  });

  it('refuses non-UUID ids and traversal-shaped paths', () => {
    expect(receiptObjectPath('member-1', PAYMENT_ID).ok).toBe(false);
    expect(receiptObjectPath(MEMBER_ID, 'payment-1').ok).toBe(false);
    expect(receiptObjectPath('../other', PAYMENT_ID).ok).toBe(false);
    expect(isValidReceiptObjectPath(RECEIPT_PATH)).toBe(true);
    expect(isValidReceiptObjectPath('../../etc/passwd')).toBe(false);
    expect(isValidReceiptObjectPath(`${MEMBER_ID}/${PAYMENT_ID}.png`)).toBe(false);
  });
});

describe('base64 PDF transfer', () => {
  it('round-trips PDF bytes', () => {
    const text = '%PDF-1.4 WS4 receipt';
    const encoded = 'JVBERi0xLjQgV1M0IHJlY2VpcHQ=';
    const bytes = base64ToUint8Array(encoded);
    expect(String.fromCharCode(...bytes)).toBe(text);
    expect(base64ToArrayBuffer(encoded).byteLength).toBe(text.length);
  });

  it('rejects malformed base64', () => {
    expect(() => base64ToUint8Array('***not-base64***')).toThrow();
  });
});

describe('storage adapter authorization and limits', () => {
  function makeClient() {
    const upload = jest.fn(
      async (): Promise<{
        data?: unknown;
        error: { message: string; statusCode?: number } | null;
      }> => ({ error: null }),
    );
    const createSignedUrl = jest.fn(
      async (): Promise<{
        data: { signedUrl: string } | null;
        error: { message: string } | null;
      }> => ({
        data: { signedUrl: 'https://example.supabase.co/storage/v1/signed/receipt' },
        error: null,
      }),
    );
    const from = jest.fn(() => ({ upload, createSignedUrl }));
    const client: ReceiptStorageClientLike = { storage: { from } };
    return { client, upload, createSignedUrl, from };
  }

  it('always uses the private receipts bucket and PDF content type', async () => {
    const { client, from, upload } = makeClient();
    const storage = createReceiptStorage(client);
    const result = await storage.upload(RECEIPT_PATH, new ArrayBuffer(8));
    expect(result.ok).toBe(true);
    expect(storage.bucket).toBe('receipts');
    expect(from).toHaveBeenCalledWith('receipts');
    expect(upload).toHaveBeenCalledWith(RECEIPT_PATH, expect.any(ArrayBuffer), {
      contentType: 'application/pdf',
      upsert: false,
      cacheControl: '3600',
    });
  });

  it('refuses invalid paths, empty files and oversized files before calling Storage', async () => {
    const { client, upload } = makeClient();
    const storage = createReceiptStorage(client);

    await expect(storage.upload('../../evil.pdf', new ArrayBuffer(8))).resolves.toMatchObject({
      ok: false,
    });
    await expect(storage.upload(RECEIPT_PATH, new ArrayBuffer(0))).resolves.toMatchObject({
      ok: false,
    });
    await expect(
      storage.upload(RECEIPT_PATH, new ArrayBuffer(RECEIPT_MAX_BYTES + 1)),
    ).resolves.toMatchObject({ ok: false });
    expect(upload).not.toHaveBeenCalled();
  });

  it('propagates an upload error without inventing success', async () => {
    const { client, upload } = makeClient();
    upload.mockResolvedValueOnce({ error: { message: 'new row violates row-level security policy' } });
    const storage = createReceiptStorage(client);
    const result = await storage.upload(RECEIPT_PATH, new ArrayBuffer(8));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error?.message).toContain('row-level security');
  });

  it('treats an identical existing object as safe (idempotent retry)', () => {
    expect(isAlreadyStoredError({ message: 'The resource already exists' })).toBe(true);
    expect(isAlreadyStoredError({ message: 'Duplicate', statusCode: 409 })).toBe(true);
    expect(isAlreadyStoredError({ message: 'network down' })).toBe(false);
  });

  it('creates short-lived signed URLs and clamps the expiry', async () => {
    const { client, createSignedUrl } = makeClient();
    const storage = createReceiptStorage(client);

    const normal = await storage.createSignedUrl(RECEIPT_PATH);
    expect(normal.ok).toBe(true);
    expect(normal.expiresInSeconds).toBe(RECEIPT_SIGNED_URL_TTL_SECONDS);
    expect(createSignedUrl).toHaveBeenLastCalledWith(
      RECEIPT_PATH,
      RECEIPT_SIGNED_URL_TTL_SECONDS,
    );

    const long = await storage.createSignedUrl(RECEIPT_PATH, 99999);
    expect(long.expiresInSeconds).toBe(3600);
    expect(createSignedUrl).toHaveBeenLastCalledWith(RECEIPT_PATH, 3600);
    expect(clampSignedUrlTtl(0)).toBe(RECEIPT_SIGNED_URL_TTL_SECONDS);
  });

  it('refuses a signed URL for an invalid path', async () => {
    const { client, createSignedUrl } = makeClient();
    const storage = createReceiptStorage(client);
    const result = await storage.createSignedUrl('other/object.pdf');
    expect(result.ok).toBe(false);
    expect(createSignedUrl).not.toHaveBeenCalled();
  });
});

describe('receipt issuance', () => {
  it('renders, uploads, attaches the path and only then issues the flag', async () => {
    const storage = makeStorage();
    const deps = makeDeps({ storage: storage as unknown as ReceiptStorage });
    const outcome = expectSuccess(await issueReceiptDocument(input(), deps));

    expect(outcome.duplicate).toBe(false);
    expect(outcome.path).toBe(RECEIPT_PATH);
    expect(outcome.receiptNumber).toBe('RCPT-20261105-11111111');

    const render = deps.renderPdf as jest.Mock;
    expect(render).toHaveBeenCalledTimes(1);
    expect(String(render.mock.calls[0][0])).toContain('RCPT-20261105-11111111');
    expect(String(render.mock.calls[0][0])).toContain('Mira Kapoor');
    expect(storage.upload).toHaveBeenCalledWith(RECEIPT_PATH, expect.any(ArrayBuffer), {
      upsert: false,
    });

    const attachOrder = (deps.attachPath as jest.Mock).mock.invocationCallOrder[0];
    const issueOrder = (deps.issueFlag as jest.Mock).mock.invocationCallOrder[0];
    expect(attachOrder).toBeLessThan(issueOrder);
  });

  it('fails closed when storage is not configured (no rendering, no writes)', async () => {
    const deps = makeDeps({ storage: null });
    const outcome = expectFailure(await issueReceiptDocument(input(), deps));
    expect(outcome.code).toBe('storage_unavailable');
    expect(deps.renderPdf).not.toHaveBeenCalled();
    expect(deps.attachPath).not.toHaveBeenCalled();
    expect(deps.issueFlag).not.toHaveBeenCalled();
  });

  it.each([
    ['awaitingVerification', 'not_verified'],
    ['rejected', 'not_verified'],
  ] as const)('refuses a %s payment (%s)', async (state, code) => {
    const deps = makeDeps();
    const outcome = expectFailure(await issueReceiptDocument(input({ payment: { state } }), deps));
    expect(outcome.code).toBe(code);
    expect(deps.renderPdf).not.toHaveBeenCalled();
    expect(deps.issueFlag).not.toHaveBeenCalled();
  });

  it('refuses reversal entries and fully reversed payments', async () => {
    const reversal = expectFailure(
      await issueReceiptDocument(
        input({ payment: { entryType: 'reversal', reversalOf: PAYMENT_ID } }),
        makeDeps(),
      ),
    );
    expect(reversal.code).toBe('reversal_entry');

    const full = expectFailure(
      await issueReceiptDocument(input({ reversedAmount: 1500 }), makeDeps()),
    );
    expect(full.code).toBe('fully_reversed');
  });

  it('refuses a payment that belongs to a different member', async () => {
    const deps = makeDeps();
    const outcome = expectFailure(
      await issueReceiptDocument(
        input({ member: { id: '44444444-4444-4444-8444-444444444444' } }),
        deps,
      ),
    );
    expect(outcome.code).toBe('member_mismatch');
    expect(deps.renderPdf).not.toHaveBeenCalled();
    expect(deps.issueFlag).not.toHaveBeenCalled();
  });

  it('does no storage or metadata work when PDF rendering fails', async () => {
    const storage = makeStorage();
    const deps = makeDeps({
      storage: storage as unknown as ReceiptStorage,
      renderPdf: jest.fn(async () => {
        throw new Error('native renderer unavailable');
      }),
    });
    const outcome = expectFailure(await issueReceiptDocument(input(), deps));
    expect(outcome.code).toBe('render_failed');
    expect(storage.upload).not.toHaveBeenCalled();
    expect(deps.attachPath).not.toHaveBeenCalled();
    expect(deps.issueFlag).not.toHaveBeenCalled();
  });

  it('treats malformed PDF bytes as a render failure', async () => {
    const storage = makeStorage();
    const deps = makeDeps({
      storage: storage as unknown as ReceiptStorage,
      renderPdf: jest.fn(async () => ({ base64: '***' })),
    });
    const outcome = expectFailure(await issueReceiptDocument(input(), deps));
    expect(outcome.code).toBe('render_failed');
    expect(storage.upload).not.toHaveBeenCalled();
  });

  it('does not attach or issue when upload fails', async () => {
    const storage = makeStorage();
    storage.upload.mockResolvedValueOnce({ ok: false, error: { message: 'storage unavailable' } });
    const deps = makeDeps({ storage: storage as unknown as ReceiptStorage });
    const outcome = expectFailure(await issueReceiptDocument(input(), deps));
    expect(outcome.code).toBe('upload_failed');
    expect(deps.attachPath).not.toHaveBeenCalled();
    expect(deps.issueFlag).not.toHaveBeenCalled();
  });

  it('accepts an already-stored identical object on retry', async () => {
    const storage = makeStorage();
    storage.upload.mockResolvedValueOnce({
      ok: false,
      error: { message: 'The resource already exists', statusCode: 409 },
    });
    const deps = makeDeps({ storage: storage as unknown as ReceiptStorage });
    expectSuccess(await issueReceiptDocument(input(), deps));
    expect(deps.attachPath).toHaveBeenCalledWith(PAYMENT_ID, RECEIPT_PATH);
    expect(deps.issueFlag).toHaveBeenCalledTimes(1);
  });

  it('is an idempotent no-op when the receipt is already stored', async () => {
    const storage = makeStorage();
    const deps = makeDeps({ storage: storage as unknown as ReceiptStorage });
    const outcome = expectSuccess(
      await issueReceiptDocument(
        input({ payment: { receiptIssued: true, receiptPath: RECEIPT_PATH } }),
        deps,
      ),
    );
    expect(outcome.duplicate).toBe(true);
    expect(outcome.path).toBe(RECEIPT_PATH);
    expect(deps.renderPdf).not.toHaveBeenCalled();
    expect(storage.upload).not.toHaveBeenCalled();
    expect(deps.attachPath).not.toHaveBeenCalled();
    expect(deps.issueFlag).not.toHaveBeenCalled();
  });

  it('completes a missing path without re-issuing an already-issued flag', async () => {
    const deps = makeDeps();
    const outcome = expectSuccess(
      await issueReceiptDocument(input({ payment: { receiptIssued: true } }), deps),
    );
    expect(outcome.duplicate).toBe(true);
    expect(deps.attachPath).toHaveBeenCalledWith(PAYMENT_ID, RECEIPT_PATH);
    expect(deps.issueFlag).not.toHaveBeenCalled();
  });

  it('never sets the issue flag when the path attach is refused', async () => {
    const deps = makeDeps({
      attachPath: jest.fn(async (): Promise<WriteOutcome<string>> => ({
        ok: false,
        error: 'Receipt path does not match the payment.',
        code: '55000',
        kind: 'conflict',
      })),
    });
    const outcome = expectFailure(await issueReceiptDocument(input(), deps));
    expect(outcome.code).toBe('attach_failed');
    expect(deps.issueFlag).not.toHaveBeenCalled();
  });

  it('reports a failed one-way issue without claiming success', async () => {
    const deps = makeDeps({
      issueFlag: jest.fn(async (): Promise<WriteOutcome<string>> => ({
        ok: false,
        error: 'A receipt has already been issued for this payment.',
        code: '55000',
        kind: 'conflict',
      })),
    });
    const outcome = expectFailure(await issueReceiptDocument(input(), deps));
    expect(outcome.code).toBe('issue_failed');
    expect(deps.attachPath).toHaveBeenCalledTimes(1);
  });

  it('always derives the upload folder from the member on the receipt', async () => {
    const storage = makeStorage();
    const deps = makeDeps({ storage: storage as unknown as ReceiptStorage });
    expectSuccess(await issueReceiptDocument(input(), deps));
    const [path] = storage.upload.mock.calls[0];
    expect(path).toBe(`${MEMBER_ID}/${PAYMENT_ID}.pdf`);
    expect(path.startsWith(`${MEMBER_ID}/`)).toBe(true);
  });
});
