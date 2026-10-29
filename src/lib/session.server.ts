// Server-only AES-GCM cookie encryption.
// Key derivation uses HKDF over the DECODED session-secret bytes (canonical
// base64url, >=32 bytes) so secrets are never silently padded/truncated and
// configuration and crypto validation agree. Each logical use gets a distinct
// derived key.

const ALGORITHM = "AES-GCM";
const HKDF_INFO = "repsuites-session-cookie-v1";

// Canonical unpadded base64url validation + decode for the session secret.
// The secret must decode to >=32 bytes AND round-trip exactly, so padding,
// whitespace, alternate encodings, and appended junk are rejected. Format
// validation cannot prove entropy - secrets must be randomly generated
// operationally. Returns the raw decoded bytes (used as the HKDF base key).
export function decodeSessionSecret(secret: string): Uint8Array | null {
  if (!secret) return null;
  // Canonical unpadded base64url characters only.
  if (!/^[A-Za-z0-9_-]+$/.test(secret)) return null;
  const bytes = fromBase64Url(secret);
  if (!bytes || bytes.length < 32) return null;
  // Round-trip: re-encoding must reproduce the input exactly, proving no
  // padding/whitespace/alternate encodings were used.
  if (toBase64Url(bytes) !== secret) return null;
  return bytes;
}

async function importHkKey(secret: string): Promise<CryptoKey> {
  // Use the decoded random bytes as the HKDF base key - never text-encode an
  // arbitrary secret string. Throws on an invalid/weak secret.
  const keyBytes = decodeSessionSecret(secret);
  if (!keyBytes) throw new Error("Invalid session secret");
  const baseKey = await crypto.subtle.importKey("raw", new Uint8Array(keyBytes), "HKDF", false, [
    "deriveKey",
  ]);
  const enc = new TextEncoder();
  return crypto.subtle.deriveKey(
    { name: "HKDF", hash: "SHA-256", salt: new Uint8Array(0), info: enc.encode(HKDF_INFO) },
    baseKey,
    { name: ALGORITHM, length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

function toBase64Url(bytes: Uint8Array): string {
  let binaryStr = "";
  for (let i = 0; i < bytes.length; i++) {
    binaryStr += String.fromCharCode(bytes[i]!);
  }
  return btoa(binaryStr).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(token: string): Uint8Array | null {
  try {
    let base64 = token.replace(/-/g, "+").replace(/_/g, "/");
    while (base64.length % 4) base64 += "=";
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  } catch {
    return null;
  }
}

export async function encryptSessionData(
  data: Record<string, unknown>,
  secret: string,
): Promise<string> {
  const key = await importHkKey(secret);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const enc = new TextEncoder();
  const encoded = enc.encode(JSON.stringify(data));
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt({ name: ALGORITHM, iv }, key, encoded),
  );
  const combined = new Uint8Array(iv.length + ciphertext.length);
  combined.set(iv, 0);
  combined.set(ciphertext, iv.length);
  return toBase64Url(combined);
}

export async function decryptSessionData<T = Record<string, unknown>>(
  token: string,
  secret: string,
): Promise<T | null> {
  try {
    const bytes = fromBase64Url(token);
    if (!bytes || bytes.length < 13) return null;
    const key = await importHkKey(secret);
    const iv = bytes.slice(0, 12);
    const ciphertext = bytes.slice(12);
    const decrypted = await crypto.subtle.decrypt({ name: ALGORITHM, iv }, key, ciphertext);
    const dec = new TextDecoder();
    const parsed = JSON.parse(dec.decode(decrypted));
    // Validate it is an object, not an array / primitive (tamper guard).
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return null;
    return parsed as T;
  } catch {
    return null;
  }
}

// Constant-ish-time comparison helper for secrets/values where timing matters.
export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
