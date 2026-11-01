// Server-only: send an email from noreply@repsuites.com through Resend.
// Needs REPSUITES_RESEND_API_KEY; without it nothing is sent and the caller
// gets a clear error.
export async function sendEmail(input: {
  to: string;
  subject: string;
  html: string;
  text?: string;
  replyTo?: string;
  headers?: Record<string, string>;
}): Promise<{ ok: true; id?: string } | { ok: false; error: string }> {
  const key = (process.env["REPSUITES_RESEND_API_KEY"] ?? "").trim();
  if (!key) return { ok: false, error: "Email is not set up yet." };
  try {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      signal: AbortSignal.timeout(15000),
      body: JSON.stringify({
        from: "RepSuites <noreply@repsuites.com>",
        to: [input.to],
        subject: input.subject.slice(0, 200),
        html: input.html,
        ...(input.text ? { text: input.text } : {}),
        ...(input.replyTo ? { reply_to: input.replyTo } : {}),
        ...(input.headers ? { headers: input.headers } : {}),
      }),
    });
    if (r.ok) {
      // Resend returns the email id, used to match bounce reports.
      const sent = (await r.json().catch(() => null)) as { id?: unknown } | null;
      return typeof sent?.id === "string" ? { ok: true, id: sent.id } : { ok: true };
    }
    const body = (await r.json().catch(() => null)) as { message?: string } | null;
    return {
      ok: false,
      error: `Email could not be sent: ${String(body?.message ?? r.status).slice(0, 150)}`,
    };
  } catch {
    return { ok: false, error: "Email could not be sent. Try again." };
  }
}
