// Server-only: asks an AI assistant that searches the web the questions a
// customer would ask ("best plumber in Newport?") and records whether it
// names the business. Needs REPSUITES_ANTHROPIC_API_KEY (a workspace key).
import {
  applyNoStoreHeaders,
  requireProtectedRequest,
  verifyRequestOriginAsync,
} from "./auth.server";
import { serviceRead, serviceWrite } from "./supabase-service.server";
import { featureBlockedFor } from "./tenant-access.server";
import { aiQuestions, readAnswer, type AiAnswer } from "./ai-visibility";

const EDITORS = ["owner", "admin", "super_admin", "manager"];

async function guard(write: boolean) {
  applyNoStoreHeaders();
  const g = await requireProtectedRequest({ requireTenant: true });
  if (!g.ok) return { ok: false as const, error: g.error || "Sign in again." };
  if (!EDITORS.includes(g.session.role || ""))
    return { ok: false as const, error: "Access denied." };
  const tenantId = g.session.active_tenant_id!;
  const blocked = await featureBlockedFor(g.session.access_token, tenantId, "ai_visibility");
  if (blocked) return { ok: false as const, error: blocked };
  if (write && !(await verifyRequestOriginAsync()))
    return { ok: false as const, error: "Please refresh the page and try again." };
  return { ok: true as const, tenantId, userId: g.session.user_id };
}

async function businessName(tenantId: string) {
  const [c, t] = await Promise.all([
    serviceRead<{ location_title: string | null }[]>(
      `google_connections?select=location_title&tenant_id=eq.${tenantId}`,
      "",
    ),
    serviceRead<{ name: string }[]>(`tenants?select=name&id=eq.${tenantId}`, ""),
  ]);
  return c.data?.[0]?.location_title || t.data?.[0]?.name || "";
}

export async function readAiVisibility() {
  const g = await guard(false);
  if (!g.ok) return g;
  const [s, last] = await Promise.all([
    serviceRead<{ service: string | null; town: string | null }[]>(
      `ai_visibility_settings?select=service,town&tenant_id=eq.${g.tenantId}`,
      "",
    ),
    serviceRead<
      {
        created_at: string;
        results: AiAnswer[];
        named: number;
        total: number;
        error: string | null;
      }[]
    >(
      `ai_visibility_checks?select=created_at,results,named,total,error&tenant_id=eq.${g.tenantId}&order=created_at.desc&limit=1`,
      "",
    ),
  ]);
  const l = last.data?.[0];
  return {
    ok: true as const,
    ready: !!(process.env["REPSUITES_ANTHROPIC_API_KEY"] ?? "").trim(),
    service: s.data?.[0]?.service ?? "",
    town: s.data?.[0]?.town ?? "",
    latest: l
      ? { at: l.created_at, results: l.results, named: l.named, total: l.total, error: l.error }
      : null,
  };
}

async function ask(question: string, town: string): Promise<{ text: string } | { error: string }> {
  const key = (process.env["REPSUITES_ANTHROPIC_API_KEY"] ?? "").trim();
  if (!key) return { error: "AI is not switched on yet." };
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      signal: AbortSignal.timeout(90000),
      body: JSON.stringify({
        model: (process.env["REPSUITES_AI_SEARCH_MODEL"] ?? "").trim() || "claude-sonnet-5-5",
        max_tokens: 900,
        system:
          "You are a helpful assistant answering a member of the public who wants a local business. " +
          "Search the web, then recommend real businesses as you normally would. " +
          'Finish with JSON only on the last line: {"businesses": ["name", ...]} listing the businesses you recommended, best first.',
        tools: [
          {
            type: "web_search_20250305",
            name: "web_search",
            max_uses: 3,
            user_location: { type: "approximate", city: town.slice(0, 60) },
          },
        ],
        messages: [{ role: "user", content: question }],
      }),
    });
    if (!res.ok) {
      const b = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
      return {
        error: `AI check failed (${res.status}): ${String(b?.error?.message ?? "").slice(0, 140)}`,
      };
    }
    const body = (await res.json()) as { content?: { type: string; text?: string }[] };
    return {
      text: (body.content ?? [])
        .filter((c) => c.type === "text")
        .map((c) => c.text ?? "")
        .join("\n"),
    };
  } catch {
    return { error: "The AI check timed out. Try again shortly." };
  }
}

export async function runAiVisibility(input: { service: string; town: string }) {
  const g = await guard(true);
  if (!g.ok) return g;
  const service = input.service.trim().slice(0, 80);
  const town = input.town.trim().slice(0, 80);
  if (service.length < 3 || town.length < 2)
    return { ok: false as const, error: "Add what you do and your town." };
  await serviceWrite("ai_visibility_settings?on_conflict=tenant_id", "", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates" },
    body: {
      tenant_id: g.tenantId,
      service,
      town,
      updated_by: g.userId,
      updated_at: new Date().toISOString(),
    },
  });
  // At most one check an hour per business, to keep AI costs predictable.
  const recent = await serviceRead<{ id: string }[]>(
    `ai_visibility_checks?select=id&tenant_id=eq.${g.tenantId}&error=is.null&created_at=gte.${new Date(Date.now() - 3600_000).toISOString()}&limit=1`,
    "",
  );
  if (recent.data?.length)
    return { ok: false as const, error: "Checked in the last hour. Try again later." };
  const business = await businessName(g.tenantId);
  const questions = aiQuestions(service, town);
  const answers = await Promise.all(questions.map((q) => ask(q, town)));
  const failed = answers.find((a) => "error" in a) as { error: string } | undefined;
  const results: AiAnswer[] = answers
    .map((a, i) => ("text" in a ? readAnswer(questions[i]!, a.text, business) : null))
    .filter((a): a is AiAnswer => !!a);
  const named = results.filter((r) => r.named).length;
  await serviceWrite("ai_visibility_checks", "", {
    method: "POST",
    body: {
      tenant_id: g.tenantId,
      results,
      named,
      total: results.length,
      error: results.length ? null : (failed?.error ?? "No answer."),
    },
  });
  if (!results.length) return { ok: false as const, error: failed?.error ?? "No answer." };
  return { ok: true as const };
}
