/**
 * Secure receipt storage contract (Production Readiness Stage 2B, WS-4).
 *
 * The bucket is PRIVATE: no public URL is ever produced here. Downloads use
 * short-lived signed URLs created by the caller's authenticated Supabase
 * session, so Storage RLS (not this module) decides who may read an object.
 *
 * Security posture:
 *  - only the publishable client is used; no service-role key exists here;
 *  - object names are deterministic UUID paths (`{member}/{payment}.pdf`),
 *    which also blocks traversal/name injection;
 *  - uploads are PDF-only and size-limited;
 *  - signed URLs are short-lived (default 5 minutes, hard maximum 1 hour).
 */
export const RECEIPT_BUCKET = 'receipts';
export const RECEIPT_MIME_TYPE = 'application/pdf';
export const RECEIPT_MAX_BYTES = 5 * 1024 * 1024;
export const RECEIPT_SIGNED_URL_TTL_SECONDS = 300;
export const RECEIPT_MAX_SIGNED_URL_TTL_SECONDS = 3600;

const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const UUID_RE = new RegExp(`^${UUID}$`, 'i');
const OBJECT_PATH_RE = new RegExp(`^${UUID}/${UUID}\\.pdf$`, 'i');

export interface ReceiptStorageError {
  message: string;
  statusCode?: number | string;
  name?: string;
}

export interface ReceiptUploadOptions {
  upsert?: boolean;
}

export interface ReceiptUploadResult {
  ok: boolean;
  error?: ReceiptStorageError;
}

export interface ReceiptSignedUrlResult {
  ok: boolean;
  url?: string;
  expiresInSeconds: number;
  error?: ReceiptStorageError;
}

export interface ReceiptStorage {
  readonly bucket: string;
  upload(path: string, data: ArrayBuffer, options?: ReceiptUploadOptions): Promise<ReceiptUploadResult>;
  createSignedUrl(path: string, expiresInSeconds?: number): Promise<ReceiptSignedUrlResult>;
}

/** Minimal structural view of the Supabase storage client (mockable in tests). */
export interface ReceiptStorageBucketLike {
  upload(
    path: string,
    file: ArrayBuffer,
    options?: { contentType?: string; upsert?: boolean; cacheControl?: string },
  ): Promise<{ data?: unknown; error: ReceiptStorageError | null }>;
  createSignedUrl(
    path: string,
    expiresIn: number,
  ): Promise<{ data: { signedUrl: string } | null; error: ReceiptStorageError | null }>;
}

export interface ReceiptStorageClientLike {
  storage: { from(bucket: string): ReceiptStorageBucketLike };
}

export function isUuid(value: string): boolean {
  return UUID_RE.test(value);
}

export function isValidReceiptObjectPath(path: string): boolean {
  return OBJECT_PATH_RE.test(path);
}

/**
 * Deterministic private object path. Invalid (non-UUID) ids are refused
 * rather than sanitised, so a caller can never address another folder.
 */
export function receiptObjectPath(
  memberId: string,
  paymentId: string,
): { ok: true; path: string } | { ok: false; error: string } {
  if (!isUuid(memberId) || !isUuid(paymentId)) {
    return { ok: false, error: 'Receipt objects require server-issued UUID identifiers.' };
  }
  return { ok: true, path: `${memberId.toLowerCase()}/${paymentId.toLowerCase()}.pdf` };
}

export function errorMessage(error: unknown, fallback: string): string {
  if (error && typeof error === 'object' && 'message' in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === 'string' && message.trim()) return message;
  }
  if (typeof error === 'string' && error.trim()) return error;
  return fallback;
}

/**
 * Supabase Storage returns a conflict when the identical object already
 * exists. That is a safe success for our immutable, deterministic path —
 * it means a previous attempt uploaded the same receipt.
 */
export function isAlreadyStoredError(error: ReceiptStorageError | undefined): boolean {
  if (!error) return false;
  if (error.statusCode === 409 || error.statusCode === '409') return true;
  return /already exists|already been uploaded|duplicate|resource already exists/i.test(error.message);
}

export function clampSignedUrlTtl(seconds: number | undefined): number {
  if (!Number.isFinite(seconds ?? NaN)) return RECEIPT_SIGNED_URL_TTL_SECONDS;
  const value = Math.floor(seconds as number);
  if (value <= 0) return RECEIPT_SIGNED_URL_TTL_SECONDS;
  return Math.min(value, RECEIPT_MAX_SIGNED_URL_TTL_SECONDS);
}

/** Wrap the shared Supabase client in the narrow receipt-storage contract. */
export function createReceiptStorage(client: ReceiptStorageClientLike): ReceiptStorage {
  const bucket = client.storage.from(RECEIPT_BUCKET);
  return {
    bucket: RECEIPT_BUCKET,
    async upload(path, data, options) {
      if (!isValidReceiptObjectPath(path)) {
        return { ok: false, error: { message: 'Invalid receipt object path.' } };
      }
      if (!(data instanceof ArrayBuffer) || data.byteLength === 0) {
        return { ok: false, error: { message: 'The receipt PDF is empty.' } };
      }
      if (data.byteLength > RECEIPT_MAX_BYTES) {
        return { ok: false, error: { message: 'The receipt PDF exceeds the storage size limit.' } };
      }
      try {
        const { error } = await bucket.upload(path, data, {
          contentType: RECEIPT_MIME_TYPE,
          upsert: options?.upsert ?? false,
          cacheControl: '3600',
        });
        return error ? { ok: false, error } : { ok: true };
      } catch (error) {
        return { ok: false, error: { message: errorMessage(error, 'The receipt upload failed.') } };
      }
    },
    async createSignedUrl(path, expiresInSeconds) {
      const expiresIn = clampSignedUrlTtl(expiresInSeconds);
      if (!isValidReceiptObjectPath(path)) {
        return {
          ok: false,
          expiresInSeconds: expiresIn,
          error: { message: 'Invalid receipt object path.' },
        };
      }
      try {
        const { data, error } = await bucket.createSignedUrl(path, expiresIn);
        if (error) return { ok: false, expiresInSeconds: expiresIn, error };
        if (!data?.signedUrl) {
          return {
            ok: false,
            expiresInSeconds: expiresIn,
            error: { message: 'No signed URL was returned.' },
          };
        }
        return { ok: true, url: data.signedUrl, expiresInSeconds: expiresIn };
      } catch (error) {
        return {
          ok: false,
          expiresInSeconds: expiresIn,
          error: { message: errorMessage(error, 'The receipt link could not be created.') },
        };
      }
    },
  };
}
