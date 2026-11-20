/** Receipt service barrel — shared by screens and tests. */
export {
  RECEIPT_GYM,
  buildReceiptView,
  formatReceiptDate,
  formatReceiptMoney,
  receiptEligibility,
  receiptNumberFor,
  type ReceiptBuildResult,
  type ReceiptEligibilityFailure,
  type ReceiptSource,
  type ReceiptStatus,
  type ReceiptViewModel,
} from './receipt';
export { escapeHtml, renderReceiptHtml } from './render';
export {
  RECEIPT_BUCKET,
  RECEIPT_MAX_BYTES,
  RECEIPT_MAX_SIGNED_URL_TTL_SECONDS,
  RECEIPT_MIME_TYPE,
  RECEIPT_SIGNED_URL_TTL_SECONDS,
  clampSignedUrlTtl,
  createReceiptStorage,
  errorMessage,
  isAlreadyStoredError,
  isValidReceiptObjectPath,
  isUuid,
  receiptObjectPath,
  type ReceiptSignedUrlResult,
  type ReceiptStorage,
  type ReceiptStorageBucketLike,
  type ReceiptStorageClientLike,
  type ReceiptStorageError,
  type ReceiptUploadOptions,
  type ReceiptUploadResult,
} from './storage';
export { base64ToArrayBuffer, base64ToUint8Array } from './encoding';
export {
  issueReceiptDocument,
  type ReceiptIssueDeps,
  type ReceiptIssueFailureCode,
  type ReceiptIssueInput,
  type ReceiptIssueOutcome,
} from './issue';
