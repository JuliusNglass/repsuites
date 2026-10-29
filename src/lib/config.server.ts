// Server-only configuration reader and guard.
// Reads keys inside functions at request time (Cloudflare Workers / serverless
// runtime compliant). No module-scope secret access.

import { decodeSessionSecret } from "./session.server";

// Fixed production project - the only backend this app may talk to.
export const PRODUCTION_SUPABASE_URL = "https://ljosiwovyixvvxokyuel.supabase.co";

// Fixed production project ref - used to verify legacy JWT keys belong to this
// project only.
export const PRODUCTION_PROJECT_REF = "ljosiwovyixvvxokyuel";

// The staging project. A deployment talks to staging only when it is
// explicitly configured with REPSUITES_SUPABASE_PROJECT set to this ref; any
// other value (or none) means production. No other project is ever allowed.
export const STAGING_PROJECT_REF = "ckapvrahthzdnkmekdus";

export function activeProjectRef(): string {
  const v = (process.env["REPSUITES_SUPABASE_PROJECT"] ?? "").trim();
  return v === STAGING_PROJECT_REF ? STAGING_PROJECT_REF : PRODUCTION_PROJECT_REF;
}

export function activeSupabaseUrl(): string {
  return `https://${activeProjectRef()}.supabase.co`;
}

export interface SparkOpsConfig {
  url: string;
  publishableKey: string;
  sessionSecret: string;
  appOrigin: string;
  isConfigured: boolean;
  missing: string[];
}

function nonEmpty(v: string | undefined): string {
  return (v ?? "").trim();
}

// A Supabase access/publishable key is a JWT. Its payload contains a `role`
// claim ("anon" for publishable keys, "service_role" for the secret key) and
// a `ref` claim with the project ref. We accept ONLY the publishable (anon)
// key for the fixed staging project and reject service/admin/secret/legacy
// service keys and keys for any other project.
function parseJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3 || !parts[1]) return null;
    let b64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    while (b64.length % 4) b64 += "=";
    const json = atob(b64);
    const parsed = JSON.parse(json);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return null;
    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
}

function isStringClaim(v: unknown): v is string {
  return typeof v === "string" && v.length > 0;
}

// Validate the publishable key. Allowed: the modern `sb_publishable_` prefix
// OR a parsed legacy JWT with role === "anon" whose ref === the fixed staging
// project ref. Reject service/admin/secret keys, malformed keys, and keys for
// any other project.
function validatePublishableKey(key: string): { ok: boolean; reason?: string } {
  if (!key) return { ok: false, reason: "empty" };

  // Modern publishable keys: must start with sb_publishable_ and be long
  // enough to be a real token. Reject sb_secret_*, sb_service_*, etc.
  if (key.startsWith("sb_")) {
    if (key.startsWith("sb_publishable_")) {
      return key.length >= 20 ? { ok: true } : { ok: false, reason: "too_short" };
    }
    return { ok: false, reason: "service_or_secret_prefix_rejected" };
  }

  // Legacy JWT publishable (anon) keys: parse and verify role + project ref.
  const payload = parseJwtPayload(key);
  if (!payload) return { ok: false, reason: "malformed_key" };
  const role = payload["role"];
  if (isStringClaim(role) && role === "anon") {
    const ref = payload["ref"];
    if (isStringClaim(ref) && ref === activeProjectRef()) {
      return { ok: true };
    }
    return { ok: false, reason: "wrong_project_ref" };
  }
  return { ok: false, reason: "not_anon_role" };
}

// The session secret must be canonical unpadded base64url that decodes to
// >=32 bytes AND round-trips exactly (bytes.toString('base64url') === secret).
// This rejects padding, whitespace, alternate encodings, and appended junk
// like a valid secret followed by '!'. Format validation cannot prove
// entropy - the secret MUST be randomly generated operationally; we only
// enforce a single unambiguous random-secret format. The same decode is used
// by the crypto layer so configuration and encryption agree.
function validateSessionSecret(secret: string): { ok: boolean; bytes: number } {
  const bytes = decodeSessionSecret(secret);
  return bytes ? { ok: true, bytes: bytes.length } : { ok: false, bytes: 0 };
}

// The trusted deployment origin must be an HTTPS origin ONLY - no credentials,
// path, query, or hash, and no trailing slash. The raw input must EXACTLY
// equal the parsed origin (scheme://host[:port]) so a path-, query-, or
// hash-bearing URL cannot be silently stripped into a trusted origin.
function canonicaliseOrigin(origin: string): { ok: boolean; canonical?: string } {
  if (!origin) return { ok: false };
  try {
    const u = new URL(origin);
    if (u.protocol !== "https:") return { ok: false };
    if (u.username || u.password) return { ok: false };
    if (u.pathname !== "/") return { ok: false };
    if (u.search) return { ok: false };
    if (u.hash) return { ok: false };
    // Raw input must equal the canonical origin exactly (origin-only).
    if (origin !== u.origin) return { ok: false };
    return { ok: true, canonical: u.origin };
  } catch {
    return { ok: false };
  }
}

export function getSupabaseConfig(): SparkOpsConfig {
  const url = activeSupabaseUrl();
  const publishableKey = nonEmpty(process.env["REPSUITES_PUBLISHABLE_KEY"]);
  const sessionSecret = nonEmpty(process.env["REPSUITES_SESSION_SECRET"]);
  const appOriginRaw = nonEmpty(process.env["REPSUITES_APP_ORIGIN"]);

  const missing: string[] = [];

  // Publishable key: reject service/admin/secret/malformed and wrong-project keys.
  const keyCheck = validatePublishableKey(publishableKey);
  if (!publishableKey || !keyCheck.ok) {
    missing.push("REPSUITES_PUBLISHABLE_KEY (publishable/anon key for this project)");
  }

  // Session secret: canonical base64url >=32 decoded bytes, no weak fallback.
  const secretCheck = validateSessionSecret(sessionSecret);
  if (!sessionSecret || !secretCheck.ok) {
    // Explain setup failure without returning any credential content.
    const reason = !sessionSecret
      ? "value missing"
      : typeof atob !== "function" || typeof btoa !== "function"
        ? "server decoder unavailable"
        : !/^[A-Za-z0-9_-]+$/.test(sessionSecret)
          ? "invalid encoding characters"
          : sessionSecret.length < 43
            ? "encoded value too short"
            : "noncanonical encoding or insufficient decoded bytes";
    missing.push(`REPSUITES_SESSION_SECRET (base64url, >=32 random bytes; ${reason})`);
  }

  // App origin: HTTPS-origin only, canonicalised (no path/query/hash/creds).
  const originCheck = canonicaliseOrigin(appOriginRaw);
  if (!appOriginRaw || !originCheck.ok) {
    missing.push("REPSUITES_APP_ORIGIN (https origin)");
  }

  const appOrigin = originCheck.canonical ?? appOriginRaw;

  return {
    url,
    publishableKey,
    sessionSecret,
    appOrigin,
    isConfigured: missing.length === 0,
    missing,
  };
}

export class ConfigRequiredError extends Error {
  missing: string[];
  constructor(missing: string[]) {
    super("CONFIGURATION_REQUIRED");
    this.name = "ConfigRequiredError";
    this.missing = missing;
  }
}

export function assertConfigured(): SparkOpsConfig {
  const cfg = getSupabaseConfig();
  if (!cfg.isConfigured) throw new ConfigRequiredError(cfg.missing);
  return cfg;
}

// Sanitised, user-facing description of missing configuration (no secrets).
export function describeMissingConfig(missing: string[]): string {
  if (!missing.length) return "";
  return `Setup required - missing configuration: ${missing.join(", ")}.`;
}
