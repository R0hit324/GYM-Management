/**
 * WS-8 — consent, legal documents and privacy request contracts.
 *
 * These are client-side tests only. The database authority is in
 * supabase/tests/0012_privacy_consent_validation.sql and remains
 * NOT VERIFIED in this environment (no local Supabase/Docker).
 */
import type { AppSupabaseClient } from '@/services/supabase/client';
import { getSupabaseClient } from '@/services/supabase/client';
import {
  INITIAL_JOIN_CONSENT,
  buildJoinConsentEvents,
  consentTypeLabel,
  isJoinConsentComplete,
  listMyConsentRecords,
  missingMandatoryConsents,
  recordConsent,
  recordConsents,
  type ConsentChoiceState,
} from '@/services/consent';
import {
  listMyPrivacyRequests,
  privacyRequestStateLabel,
  privacyRequestTypeLabel,
  requestPrivacyAction,
  resolvePrivacyRequest,
} from '@/services/privacy';
import {
  LEGAL_DOCUMENTS,
  LEGAL_DRAFT_LABEL,
  LEGAL_PLACEHOLDERS,
  getLegalDocument,
} from '@/constants/legal';

jest.mock('@/services/supabase/client', () => ({
  getSupabaseClient: jest.fn(),
}));

const mockedGetClient = getSupabaseClient as jest.MockedFunction<typeof getSupabaseClient>;

const USER_ID = 'member-1111';

function makeClient(options: { session?: boolean } = {}) {
  const rpc = jest.fn();
  const getSession = jest.fn().mockResolvedValue({
    data: { session: options.session === false ? null : { user: { id: USER_ID } } },
    error: null,
  });
  const client = { auth: { getSession }, rpc } as unknown as AppSupabaseClient;
  mockedGetClient.mockResolvedValue(client);
  return { client, rpc, getSession };
}

beforeEach(() => {
  mockedGetClient.mockReset();
  mockedGetClient.mockResolvedValue(null);
});

describe('join consent defaults and gating', () => {
  it('starts with every choice unselected', () => {
    expect(INITIAL_JOIN_CONSENT).toEqual({
      privacyPolicy: false,
      termsOfService: false,
      marketing: false,
    });
    expect(Object.isFrozen(INITIAL_JOIN_CONSENT)).toBe(true);
  });

  it('reports both mandatory documents as missing initially', () => {
    expect(missingMandatoryConsents(INITIAL_JOIN_CONSENT)).toEqual([
      'privacy_policy',
      'terms_of_service',
    ]);
    expect(isJoinConsentComplete(INITIAL_JOIN_CONSENT)).toBe(false);
  });

  it('does not treat marketing as mandatory', () => {
    const state: ConsentChoiceState = {
      privacyPolicy: false,
      termsOfService: true,
      marketing: true,
    };
    expect(missingMandatoryConsents(state)).toEqual(['privacy_policy']);
    expect(isJoinConsentComplete(state)).toBe(false);
  });

  it('completes when both mandatory documents are accepted, with or without marketing', () => {
    expect(
      isJoinConsentComplete({ privacyPolicy: true, termsOfService: true, marketing: false }),
    ).toBe(true);
    expect(
      isJoinConsentComplete({ privacyPolicy: true, termsOfService: true, marketing: true }),
    ).toBe(true);
  });

  it('builds mandatory acceptances plus the actual marketing choice', () => {
    const events = buildJoinConsentEvents({
      privacyPolicy: true,
      termsOfService: true,
      marketing: false,
    });

    expect(events).toHaveLength(3);
    expect(events[0]).toMatchObject({
      type: 'privacy_policy',
      accepted: true,
      version: LEGAL_DOCUMENTS.privacy.version,
      source: 'member_join',
    });
    expect(events[1]).toMatchObject({
      type: 'terms_of_service',
      accepted: true,
      version: LEGAL_DOCUMENTS.terms.version,
      source: 'member_join',
    });
    expect(events[2]).toMatchObject({
      type: 'marketing',
      accepted: false,
      source: 'member_join',
    });
  });

  it('records marketing acceptance only when the optional box is checked', () => {
    const events = buildJoinConsentEvents({
      privacyPolicy: true,
      termsOfService: true,
      marketing: true,
    });
    expect(events.find((event) => event.type === 'marketing')?.accepted).toBe(true);
  });
});

describe('legal document integrity', () => {
  it('marks both documents as drafts with the same versioned identifier', () => {
    expect(LEGAL_DRAFT_LABEL).toMatch(/DRAFT/);
    expect(LEGAL_DOCUMENTS.privacy.draft).toBe(true);
    expect(LEGAL_DOCUMENTS.terms.draft).toBe(true);
    expect(LEGAL_DOCUMENTS.privacy.version).toBe(LEGAL_DOCUMENTS.terms.version);
    expect(LEGAL_DOCUMENTS.privacy.version).toMatch(/draft/);
  });

  it('covers the 22 required privacy topics', () => {
    const ids = LEGAL_DOCUMENTS.privacy.sections.map((section) => section.id);
    expect(ids).toHaveLength(22);
    expect(ids).toEqual(
      expect.arrayContaining([
        'introduction',
        'controller',
        'information-collected',
        'information-you-provide',
        'automatic-collection',
        'membership-attendance',
        'payments-receipts',
        'authentication-security',
        'purposes',
        'access-sharing',
        'third-parties',
        'supabase-hosting',
        'notifications',
        'retention',
        'security',
        'rights',
        'account-deletion',
        'correction',
        'breach',
        'minors',
        'changes',
        'contact',
      ]),
    );
  });

  it('covers the required Terms topics', () => {
    const ids = LEGAL_DOCUMENTS.terms.sections.map((section) => section.id);
    expect(ids).toEqual(
      expect.arrayContaining([
        'acceptance',
        'registration',
        'accurate-information',
        'account-security',
        'member-responsibilities',
        'membership-validity',
        'attendance-rules',
        'qr-rules',
        'freeze',
        'fees-payments',
        'payment-recording',
        'receipts',
        'discounts',
        'cancellation-refunds',
        'prohibited-use',
        'fraud-abuse',
        'staff-owner',
        'availability',
        'suspension-termination',
        'liability',
        'disputes',
        'changes',
        'contact',
      ]),
    );
  });

  it('keeps owner-dependent facts as explicit placeholders', () => {
    const allText = [
      ...LEGAL_DOCUMENTS.privacy.sections,
      ...LEGAL_DOCUMENTS.terms.sections,
    ]
      .flatMap((section) => [
        ...(section.paragraphs ?? []),
        ...(section.bullets ?? []),
      ])
      .join(' ');

    for (const placeholder of LEGAL_PLACEHOLDERS) {
      expect(allText).toContain(placeholder);
    }
    expect(allText).not.toMatch(/\bGDPR compliant\b/i);
    expect(allText).not.toMatch(/\bISO 27001\b/i);
  });

  it('resolves only the two known documents', () => {
    expect(getLegalDocument('privacy')?.id).toBe('privacy');
    expect(getLegalDocument('terms')?.id).toBe('terms');
    expect(getLegalDocument('refunds')).toBeNull();
    expect(getLegalDocument(undefined)).toBeNull();
  });
});

describe('consent RPC client', () => {
  it('refuses to call the server when there is no session', async () => {
    const { rpc } = makeClient({ session: false });

    const outcome = await recordConsent({
      type: 'privacy_policy',
      version: 'v1',
      accepted: true,
      source: 'member_join',
    });

    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.kind).toBe('unauthenticated');
    expect(rpc).not.toHaveBeenCalled();
  });

  it('sends only the consent fields — never a target user id', async () => {
    const { rpc } = makeClient();
    rpc.mockResolvedValue({ data: 'consent-1', error: null });

    const outcome = await recordConsent({
      type: 'terms_of_service',
      version: '2026-11-20-draft.1',
      accepted: true,
      source: 'member_join',
    });

    expect(outcome).toEqual({ ok: true, ids: ['consent-1'] });
    expect(rpc).toHaveBeenCalledWith('record_consent', {
      p_consent_type: 'terms_of_service',
      p_document_version: '2026-11-20-draft.1',
      p_accepted: true,
      p_source: 'member_join',
    });
    const args = rpc.mock.calls[0][1] as Record<string, unknown>;
    expect(args).not.toHaveProperty('p_user_id');
    expect(args).not.toHaveProperty('user_id');
    expect(args).not.toHaveProperty('auth_user_id');
  });

  it('preserves a server refusal and classifies it', async () => {
    const { rpc } = makeClient();
    rpc.mockResolvedValue({
      data: null,
      error: { code: '42501', message: 'Authentication required.' },
    });

    const outcome = await recordConsent({
      type: 'privacy_policy',
      version: 'v1',
      accepted: true,
      source: 'member_join',
    });

    expect(outcome).toEqual({
      ok: false,
      kind: 'unauthenticated',
      error: 'Authentication required.',
      recorded: 0,
    });
  });

  it('stops a batch at the first failure and reports what was recorded', async () => {
    const { rpc } = makeClient();
    rpc
      .mockResolvedValueOnce({ data: 'consent-1', error: null })
      .mockResolvedValueOnce({ data: null, error: { code: '22023', message: 'Bad version.' } });

    const outcome = await recordConsents(
      buildJoinConsentEvents({ privacyPolicy: true, termsOfService: true, marketing: false }),
    );

    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.recorded).toBe(1);
      expect(outcome.kind).toBe('invalid');
      expect(outcome.error).toBe('Bad version.');
    }
    expect(rpc).toHaveBeenCalledTimes(2);
  });

  it('reports success only when every event was appended', async () => {
    const { rpc } = makeClient();
    rpc
      .mockResolvedValueOnce({ data: 'c1', error: null })
      .mockResolvedValueOnce({ data: 'c2', error: null })
      .mockResolvedValueOnce({ data: 'c3', error: null });

    const outcome = await recordConsents(
      buildJoinConsentEvents({ privacyPolicy: true, termsOfService: true, marketing: true }),
    );

    expect(outcome).toEqual({ ok: true, ids: ['c1', 'c2', 'c3'] });
  });

  it('maps the member consent history and keeps the server order', async () => {
    const order = jest.fn().mockResolvedValue({
      data: [
        {
          id: 'c1',
          consent_type: 'privacy_policy',
          document_version: 'v1',
          accepted: true,
          source: 'member_join',
          recorded_at: '2026-11-20T10:00:00.000Z',
        },
      ],
      error: null,
    });
    const select = jest.fn().mockReturnValue({ order });
    const from = jest.fn().mockReturnValue({ select });
    const client = {
      auth: { getSession: jest.fn().mockResolvedValue({ data: { session: { user: { id: USER_ID } } } }) },
      from,
    } as unknown as AppSupabaseClient;
    mockedGetClient.mockResolvedValue(client);

    const result = await listMyConsentRecords();

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data[0]).toEqual({
        id: 'c1',
        type: 'privacy_policy',
        version: 'v1',
        accepted: true,
        source: 'member_join',
        recordedAt: '2026-11-20T10:00:00.000Z',
      });
    }
    expect(from).toHaveBeenCalledWith('consent_records');
  });

  it('labels every consent type without claiming acceptance', () => {
    expect(consentTypeLabel('privacy_policy')).toBe('Privacy Policy');
    expect(consentTypeLabel('terms_of_service')).toBe('Terms of Service');
    expect(consentTypeLabel('marketing')).toBe('Marketing messages');
  });
});

describe('privacy request RPC client', () => {
  it('refuses a request without a session', async () => {
    const { rpc } = makeClient({ session: false });
    const result = await requestPrivacyAction('account_deletion', 'please');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.kind).toBe('unauthenticated');
    expect(rpc).not.toHaveBeenCalled();
  });

  it('sends the request type and trimmed details with no user id', async () => {
    const { rpc } = makeClient();
    rpc.mockResolvedValue({ data: 'req-1', error: null });

    const result = await requestPrivacyAction('data_export', '  account and payments  ');

    expect(result).toEqual({ ok: true, data: 'req-1' });
    expect(rpc).toHaveBeenCalledWith('request_privacy_action', {
      p_request_type: 'data_export',
      p_details: 'account and payments',
    });
    const args = rpc.mock.calls[0][1] as Record<string, unknown>;
    expect(args).not.toHaveProperty('p_user_id');
    expect(args).not.toHaveProperty('auth_user_id');
  });

  it('sends null for a blank optional note', async () => {
    const { rpc } = makeClient();
    rpc.mockResolvedValue({ data: 'req-2', error: null });

    await requestPrivacyAction('privacy_inquiry', '   ');

    expect(rpc).toHaveBeenCalledWith('request_privacy_action', {
      p_request_type: 'privacy_inquiry',
      p_details: null,
    });
  });

  it('only lists the signed-in user rows and maps the result', async () => {
    const eq = jest.fn().mockResolvedValue({
      data: [
        {
          id: 'req-1',
          auth_user_id: USER_ID,
          request_type: 'data_export',
          details: null,
          state: 'submitted',
          resolution_note: null,
          created_at: '2026-11-20T10:00:00.000Z',
          resolved_at: null,
        },
      ],
      error: null,
    });
    const order = jest.fn().mockReturnValue({ eq });
    const select = jest.fn().mockReturnValue({ order });
    const from = jest.fn().mockReturnValue({ select });
    const client = {
      auth: { getSession: jest.fn().mockResolvedValue({ data: { session: { user: { id: USER_ID } } } }) },
      from,
    } as unknown as AppSupabaseClient;
    mockedGetClient.mockResolvedValue(client);

    const result = await listMyPrivacyRequests();

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data[0]).toMatchObject({
        id: 'req-1',
        authUserId: USER_ID,
        requestType: 'data_export',
        state: 'submitted',
      });
    }
    expect(eq).toHaveBeenCalledWith('auth_user_id', USER_ID);
  });

  it('sends an owner resolution with the request id, state and note', async () => {
    const { rpc } = makeClient();
    rpc.mockResolvedValue({ data: 'req-1', error: null });

    const result = await resolvePrivacyRequest('req-1', 'completed', '  action recorded  ');

    expect(result).toEqual({ ok: true, data: 'req-1' });
    expect(rpc).toHaveBeenCalledWith('resolve_privacy_request', {
      p_request_id: 'req-1',
      p_state: 'completed',
      p_note: 'action recorded',
    });
  });

  it('preserves a server refusal for a non-owner', async () => {
    const { rpc } = makeClient();
    rpc.mockResolvedValue({
      data: null,
      error: { code: '42501', message: 'Insufficient role for this operation.' },
    });

    const result = await resolvePrivacyRequest('req-1', 'completed');

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.kind).toBe('forbidden');
      expect(result.error).toBe('Insufficient role for this operation.');
    }
  });

  it('labels request types and states for the screens', () => {
    expect(privacyRequestTypeLabel('account_deletion')).toBe('Account deletion');
    expect(privacyRequestTypeLabel('data_export')).toBe('Copy of my data');
    expect(privacyRequestTypeLabel('data_correction')).toBe('Correct my details');
    expect(privacyRequestTypeLabel('privacy_inquiry')).toBe('Privacy question');
    expect(privacyRequestStateLabel('submitted')).toBe('Submitted');
    expect(privacyRequestStateLabel('in_review')).toBe('In review');
    expect(privacyRequestStateLabel('completed')).toBe('Completed');
    expect(privacyRequestStateLabel('rejected')).toBe('Rejected');
    expect(privacyRequestStateLabel('cancelled')).toBe('Cancelled');
  });
});
