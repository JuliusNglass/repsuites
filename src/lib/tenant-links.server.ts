// Server-only: the web address RepSuites links use. Every business is served
// from repsuites.com (the only address registered with Google sign-in).
export const SHARED_ORIGIN = "https://repsuites.com";

export async function linkOrigin(_tenantId: string): Promise<string> {
  return SHARED_ORIGIN;
}
