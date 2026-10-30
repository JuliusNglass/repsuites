// Pure helpers for the 6-digit email code. Client-safe.

// A random 6-digit code, 000000 to 999999, from the secure random source.
export function newCode(): string {
  const n = crypto.getRandomValues(new Uint32Array(1))[0]! % 1_000_000;
  return String(n).padStart(6, "0");
}

// Exactly 6 digits (spaces around are fine).
export function codeOk(code: string): boolean {
  return /^\d{6}$/.test(code.trim());
}
