/**
 * Receipt issuance orchestration (Production Readiness Stage 2B, WS-4).
 *
 * Order matters and is deliberate:
 *
 *   validate -> render -> upload (private bucket) -> attach path -> issue flag
 *
 * A upload/render failure therefore happens BEFORE any payment metadata is
 * touched, and the one-way `receipt_issued` flag is only set after the PDF
 * is safely stored and its deterministic path recorded. Retries are safe:
 * an identical existing object is accepted and the path attach is
 * idempotent. Payment money/state/verifier columns are never written here.
 */
import type { Member, MembershipPlan, PaymentRecord } from '@/types/domain';
import type { WriteOutcome } from '@/services/data';

import { base64ToArrayBuffer } from './encoding';
import { buildReceiptView, type ReceiptViewModel } from './receipt';
import { renderReceiptHtml } from './render';
import {
  isAlreadyStoredError,
  receiptObjectPath,
  type ReceiptStorage,
} from './storage';

export type ReceiptIssueFailureCode =
  | 'not_verified'
  | 'reversal_entry'
  | 'fully_reversed'
  | 'member_mismatch'
  | 'storage_unavailable'
  | 'invalid_path'
  | 'render_failed'
  | 'upload_failed'
  | 'attach_failed'
  | 'issue_failed';

export interface ReceiptIssueInput {
  payment: PaymentRecord;
  member: Member;
  plan: MembershipPlan | null;
  reversedAmount?: number;
  issuedAt?: string;
}

export interface ReceiptIssueDeps {
  /** Null when the build has no storage configuration / is demo-only. */
  storage: ReceiptStorage | null;
  renderPdf: (html: string) => Promise<{ base64: string }>;
  attachPath: (paymentId: string, path: string) => Promise<WriteOutcome<string>>;
  issueFlag: (paymentId: string) => Promise<WriteOutcome<string>>;
}

export type ReceiptIssueOutcome =
  | {
      ok: true;
      duplicate: boolean;
      path: string;
      receiptNumber: string;
      view: ReceiptViewModel;
    }
  | { ok: false; code: ReceiptIssueFailureCode; error: string };

export async function issueReceiptDocument(
  input: ReceiptIssueInput,
  deps: ReceiptIssueDeps,
): Promise<ReceiptIssueOutcome> {
  // The receipt folder comes from the member record, so the two records must
  // describe the same person; otherwise a caller could aim a payment at
  // another member's folder.
  if (input.payment.memberId !== input.member.id) {
    return {
      ok: false,
      code: 'member_mismatch',
      error: 'The payment does not belong to the member on this receipt.',
    };
  }

  const built = buildReceiptView({
    payment: input.payment,
    member: input.member,
    plan: input.plan,
    reversedAmount: input.reversedAmount ?? 0,
    issuedAt: input.issuedAt,
  });
  if (!built.ok) {
    return { ok: false, code: built.code, error: built.error };
  }
  const view = built.view;

  // Idempotent no-op: a stored receipt already exists for this payment.
  if (input.payment.receiptIssued && input.payment.receiptPath) {
    return {
      ok: true,
      duplicate: true,
      path: input.payment.receiptPath,
      receiptNumber: view.receiptNumber,
      view,
    };
  }

  if (!deps.storage) {
    return {
      ok: false,
      code: 'storage_unavailable',
      error: 'Receipt storage is not configured for this build.',
    };
  }

  const pathResult = receiptObjectPath(input.member.id, input.payment.id);
  if (!pathResult.ok) {
    return { ok: false, code: 'invalid_path', error: pathResult.error };
  }
  const path = pathResult.path;

  let base64: string;
  try {
    base64 = (await deps.renderPdf(renderReceiptHtml(view))).base64;
  } catch {
    return {
      ok: false,
      code: 'render_failed',
      error: 'The receipt PDF could not be rendered on this device.',
    };
  }

  let bytes: ArrayBuffer;
  try {
    bytes = base64ToArrayBuffer(base64);
  } catch {
    return {
      ok: false,
      code: 'render_failed',
      error: 'The receipt PDF could not be prepared for storage.',
    };
  }

  const uploaded = await deps.storage.upload(path, bytes, { upsert: false });
  if (!uploaded.ok && !isAlreadyStoredError(uploaded.error)) {
    return {
      ok: false,
      code: 'upload_failed',
      error: uploaded.error?.message ?? 'The receipt PDF could not be stored.',
    };
  }

  // Record the deterministic path before the one-way issue flag, so a flag
  // is never set for a payment whose PDF failed to store.
  const attached = await deps.attachPath(input.payment.id, path);
  if (!attached.ok) {
    return { ok: false, code: 'attach_failed', error: attached.error };
  }

  if (!input.payment.receiptIssued) {
    const issued = await deps.issueFlag(input.payment.id);
    if (!issued.ok) {
      return { ok: false, code: 'issue_failed', error: issued.error };
    }
  }

  return {
    ok: true,
    duplicate: input.payment.receiptIssued,
    path,
    receiptNumber: view.receiptNumber,
    view,
  };
}
