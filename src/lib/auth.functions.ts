// Sign-in, sign-out and password reset server functions.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import {
  applyNoStoreHeaders,
  performSelectTenant,
  performSignIn,
  performSignOut,
  requireProtectedRequest,
} from "./auth.server";
import {
  checkRecoveryToken,
  resetPasswordWithToken,
  sendResetEmail,
} from "./password-reset.server";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const signIn = createServerFn({ method: "POST" })
  .validator((data: { email: string; password: string }) =>
    z.object({ email: z.string().email(), password: z.string().min(1) }).parse(data),
  )
  .handler(async ({ data }) => performSignIn(data.email, data.password));

export const selectTenant = createServerFn({ method: "POST" })
  .validator((data: { tenant_id: string }) =>
    z.object({ tenant_id: z.string().regex(UUID_RE, "invalid tenant id") }).parse(data),
  )
  .handler(async ({ data }) => performSelectTenant(data.tenant_id));

export const signOut = createServerFn({ method: "POST" }).handler(async () => performSignOut());

// Who is signed in (for the dashboard shell).
export const getSessionInfo = createServerFn({ method: "GET" }).handler(async () => {
  applyNoStoreHeaders();
  const g = await requireProtectedRequest({ requireTenant: false });
  if (!g.ok) return { ok: false as const, error: g.error };
  return {
    ok: true as const,
    email: g.user?.email ?? null,
    role: g.session.role ?? null,
    tenantId: g.session.active_tenant_id ?? null,
  };
});

export const forgotPassword = createServerFn({ method: "POST" })
  .validator((data: { email: string }) =>
    z
      .object({ email: z.string().min(1).max(320) })
      .strict()
      .parse(data),
  )
  .handler(async ({ data }) => sendResetEmail(data.email));

export const verifyRecoveryToken = createServerFn({ method: "GET" })
  .validator((data: { accessToken: string }) =>
    z
      .object({ accessToken: z.string().min(1) })
      .strict()
      .parse(data),
  )
  .handler(async ({ data }) => checkRecoveryToken(data.accessToken));

export const resetPassword = createServerFn({ method: "POST" })
  .validator((data: { accessToken: string; newPassword: string; confirm: string }) =>
    z
      .object({
        accessToken: z.string().min(1),
        newPassword: z.string().min(12).max(256),
        confirm: z.string().min(12).max(256),
      })
      .strict()
      .parse(data),
  )
  .handler(async ({ data }) =>
    resetPasswordWithToken(data.accessToken, data.newPassword, data.confirm),
  );
