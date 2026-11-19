// Stage 3 write-error classification. The client never decides whether a
// write is allowed — these helpers only pick an honest screen state from the
// server's message/code, and the raw message must always be preserved.
import { checkInFailureKind, classifyWriteError, type WriteOutcome } from '@/services/data/writes';

function serverError(message: string, code?: string) {
  return { message, code };
}

function failed(message: string, code?: string): Extract<WriteOutcome<unknown>, { ok: false }> {
  return {
    ok: false,
    error: message,
    code: code ?? null,
    kind: classifyWriteError(serverError(message, code)),
  };
}

describe('classifyWriteError', () => {
  it('recognises an AAL2 refusal', () => {
    expect(
      classifyWriteError(serverError('Multi-factor authentication (AAL2) is required.', '42501')),
    ).toBe('aal2');
  });

  it('recognises segregation-of-duties refusals as forbidden', () => {
    expect(
      classifyWriteError(serverError('Self-verification is not permitted.', '42501')),
    ).toBe('forbidden');
    expect(
      classifyWriteError(serverError('Self-reversal is not permitted.', '42501')),
    ).toBe('forbidden');
  });

  it('recognises role refusals', () => {
    expect(
      classifyWriteError(serverError('Only receptionists can record payments.', '42501')),
    ).toBe('forbidden');
    expect(classifyWriteError(serverError('Operation not permitted.', '42501'))).toBe('forbidden');
  });

  it('recognises not-found, overlap, duplicate and conflict codes', () => {
    expect(classifyWriteError(serverError('Freeze not found.', 'P0002'))).toBe('notFound');
    expect(classifyWriteError(serverError('Conflicting key.', '23P01'))).toBe('overlap');
    expect(classifyWriteError(serverError('Duplicate key value.', '23505'))).toBe('duplicate');
    expect(classifyWriteError(serverError('Only verified payments can be reversed.', '55000'))).toBe(
      'conflict',
    );
  });

  it('recognises a network failure and keeps unknown messages unknown', () => {
    expect(classifyWriteError(serverError('Failed to fetch'))).toBe('unavailable');
    expect(classifyWriteError(serverError('Something unexpected happened.'))).toBe('unknown');
  });
});

describe('checkInFailureKind', () => {
  it('maps the unlinked-member refusal', () => {
    expect(checkInFailureKind(failed('No member record is linked to this account.', '42501'))).toBe(
      'unlinked',
    );
  });

  it('maps pending payment (including expired membership wording)', () => {
    expect(checkInFailureKind(failed('A payment is pending verification.', '55000'))).toBe(
      'pendingPayment',
    );
  });

  it('maps replay and expired-token refusals', () => {
    expect(
      checkInFailureKind(
        failed('This attendance token has already been used by this member.', '55000'),
      ),
    ).toBe('replay');
    expect(checkInFailureKind(failed('The attendance token has expired.', '55000'))).toBe(
      'expiredToken',
    );
  });

  it('maps an invalid token and leaves unrelated refusals unclassified', () => {
    expect(checkInFailureKind(failed('The attendance token is invalid.', '55000'))).toBe(
      'invalidToken',
    );
    expect(checkInFailureKind(failed('Unexpected failure.', 'XX000'))).toBeNull();
  });
});
