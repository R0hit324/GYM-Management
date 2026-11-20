/**
 * Small base64 decoder for PDF bytes returned by expo-print.
 * Pure TypeScript so the issuance pipeline is testable without a native PDF
 * renderer; no secrets and no environment values are involved.
 */

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const LOOKUP = (() => {
  const table = new Int16Array(256).fill(-1);
  for (let i = 0; i < ALPHABET.length; i += 1) table[ALPHABET.charCodeAt(i)] = i;
  return table;
})();

/** Decode standard base64 (padding optional) to bytes. Throws on bad input. */
export function base64ToUint8Array(base64: string): Uint8Array {
  const clean = base64.replace(/\s+/g, '');
  if (!clean) return new Uint8Array(0);
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(clean)) {
    throw new Error('Invalid base64 data.');
  }

  const body = clean.replace(/=+$/, '');
  if (body.length % 4 === 1) throw new Error('Invalid base64 data.');

  const bytes = new Uint8Array(Math.floor((body.length * 3) / 4));
  let byteIndex = 0;
  let buffer = 0;
  let bits = 0;

  for (let i = 0; i < body.length; i += 1) {
    const value = LOOKUP[body.charCodeAt(i)];
    if (value < 0) throw new Error('Invalid base64 data.');
    buffer = (buffer << 6) | value;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      bytes[byteIndex] = (buffer >> bits) & 0xff;
      byteIndex += 1;
    }
  }

  return bytes.slice(0, byteIndex);
}

/** Exact ArrayBuffer copy for the Storage upload API. */
export function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const bytes = base64ToUint8Array(base64);
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}
