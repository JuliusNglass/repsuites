/* eslint-disable @typescript-eslint/no-explicit-any -- Anthropic response blocks are checked field by field. */
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
import {
  aiQuestions,
  cleanService,
  domainOf,
  hasList,
  readAnswer,
  type AiAnswer,
} from "./ai-visibility";

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
  const [s, checks] = await Promise.all([
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
      `ai_visibility_checks?select=created_at,results,named,total,error&tenant_id=eq.${g.tenantId}&order=created_at.desc&limit=6`,
      "",
    ),
  ]);
  const history = checks.data ?? [];
  const l = history[0];
  return {
    ok: true as const,
    business: await businessName(g.tenantId),
    ready: !!(process.env["REPSUITES_ANTHROPIC_API_KEY"] ?? "").trim(),
    service: s.data?.[0]?.service ?? "",
    town: s.data?.[0]?.town ?? "",
    latest: l
      ? { at: l.created_at, results: l.results, named: l.named, total: l.total, error: l.error }
      : null,
    history: history.map((x) => ({
      at: x.created_at,
      named: x.named,
      total: x.total,
      error: x.error,
    })),
  };
}

type Asked =
  | { text: string; sources: string[]; evidence: NonNullable<AiAnswer["evidence"]> }
  | { error: string };

// Ask once; if the answer has no readable list, ask again (answers vary).
export async function ask(question: string, town: string): Promise<Asked> {
  const first = await askOnce(question, town);
  if ("error" in first || hasList(first.text)) return first;
  const second = await askOnce(question, town);
  if ("error" in second) return second;
  return hasList(second.text)
    ? second
    : {
        error:
          "The assistant did not return a usable business list. No visibility conclusion was recorded.",
      };
}

async function askOnce(question: string, town: string): Promise<Asked> {
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
          "Answer in a few short lines. Then, ALWAYS, finish with one line of JSON exactly like " +
          '{"businesses": ["Business name", "Business name"]} listing every business you recommended, best first ' +
          "(use [] if you recommended none). Nothing after the JSON.",
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
    const body = (await res.json()) as { content?: any[]; model?: string };
    const content = body.content ?? [];
    // The websites it read: search results and the pages it cited.
    const urls: string[] = [];
    for (const c of content) {
      if (c?.type === "web_search_tool_result" && Array.isArray(c.content))
        for (const r of c.content) if (typeof r?.url === "string") urls.push(r.url);
      if (c?.type === "text" && Array.isArray(c.citations))
        for (const r of c.citations) if (typeof r?.url === "string") urls.push(r.url);
    }
    return {
      text: content
        .filter((c) => c?.type === "text")
        .map((c) => String(c.text ?? ""))
        .join("\n"),
      sources: urls.map(domainOf).filter((d): d is string => !!d),
      evidence: {
        provider: "Anthropic",
        model: String(
          body.model ?? process.env["REPSUITES_AI_SEARCH_MODEL"] ?? "claude-sonnet-5-5",
        ),
        checkedAt: new Date().toISOString(),
        urls: [...new Set(urls)].filter((u) => /^https?:\/\//i.test(u)).slice(0, 12),
        excerpt: content
          .filter((c) => c?.type === "text")
          .map((c) => String(c.text ?? ""))
          .join("\n")
          .slice(0, 3000),
      },
    };
  } catch {
    return { error: "The AI check timed out. Try again shortly." };
  }
}

// The same question to the other assistants customers use. Each one is
// optional: with no key it is left out, never guessed. Only the first
// question goes to these (each answer costs money).
const LIST_RULE =
  'Answer in a few short lines. Then, ALWAYS, finish with one line of JSON exactly like {"businesses": ["Business name", "Business name"]} listing every business you recommended, best first (use [] if you recommended none). Nothing after the JSON.';

type Provider = {
  name: string;
  key: string;
  model: string;
  call: (
    key: string,
    model: string,
    question: string,
  ) => Promise<{ text: string; urls: string[]; model?: string }>;
};

// One OpenRouter key reaches ChatGPT, Gemini and Perplexity, each using its
// own maker's web search ("native"), so the answer is what that assistant
// would really say. Used instead of the direct keys when it is set.
// The newest everyday model from a maker on OpenRouter: no batch, preview,
// image, audio or top-price "pro" variants. Worked example: from
// openai/gpt-6.1-sol, openai/gpt-6.1-sol-pro and openai/gpt-6.1-sol:batch it
// keeps openai/gpt-6.1-sol. One outside call, cached for the request.
let modelList: Promise<{ id: string; created: number }[]> | null = null;
export function chooseModel(list: { id: string; created: number }[], maker: string): string | null {
  const skip =
    /:|pro\b|-pro|preview|image|audio|nano|banana|embed|tts|realtime|transcribe|deep-research|reasoning-pro|omni/i;
  const family: Record<string, RegExp> = {
    openai: /^openai\/gpt-/,
    google: /^google\/gemini-/,
    perplexity: /^perplexity\/sonar/,
  };
  const re = family[maker];
  if (!re) return null;
  const ok = list.filter((m) => re.test(m.id) && !skip.test(m.id.split("/")[1]!));
  ok.sort((a, b) => b.created - a.created);
  return ok[0]?.id ?? null;
}
async function pickOpenRouterModel(maker: string): Promise<string | null> {
  modelList ??= fetch("https://openrouter.ai/api/v1/models", { signal: AbortSignal.timeout(15000) })
    .then((r) => r.json())
    .then((b: any) =>
      (b?.data ?? []).map((m: any) => ({ id: String(m.id), created: Number(m.created) || 0 })),
    )
    .catch(() => []);
  return chooseModel(await modelList, maker);
}

function viaOpenRouter(key: string): Provider[] {
  const env = (k: string) => (process.env[k] ?? "").trim();
  const call = (label: string) => async (k: string, model: string, question: string) => {
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${k}`,
        "content-type": "application/json",
        "HTTP-Referer": "https://repsuites.com",
        "X-Title": "RepSuites",
      },
      signal: AbortSignal.timeout(60000),
      body: JSON.stringify({
        model,
        messages: [
          {
            role: "system",
            content: `You help a member of the public find a local business. Search the web. ${LIST_RULE}`,
          },
          { role: "user", content: question },
        ],
        tools: [
          { type: "openrouter:web_search", parameters: { engine: "native", max_results: 5 } },
        ],
      }),
    });
    if (!res.ok)
      throw new Error(
        `${label} via OpenRouter ${res.status}: ${(await res.text().catch(() => "")).slice(0, 160)}`,
      );
    const b = (await res.json()) as any;
    const msg = b.choices?.[0]?.message ?? {};
    const urls = (msg.annotations ?? [])
      .map((a: any) => a?.url_citation?.url)
      .filter((u: unknown): u is string => typeof u === "string");
    const text =
      typeof msg.content === "string"
        ? msg.content
        : Array.isArray(msg.content)
          ? msg.content.map((c: any) => String(c?.text ?? "")).join("\n")
          : "";
    return { text, urls, model: b.model };
  };
  return [
    {
      name: "OpenAI",
      key,
      model: env("REPSUITES_OPENROUTER_OPENAI_MODEL") || "auto:openai",
      call: call("ChatGPT"),
    },
    {
      name: "Google Gemini",
      key,
      model: env("REPSUITES_OPENROUTER_GEMINI_MODEL") || "auto:google",
      call: call("Gemini"),
    },
    {
      name: "Perplexity",
      key,
      model: env("REPSUITES_OPENROUTER_PERPLEXITY_MODEL") || "auto:perplexity",
      call: call("Perplexity"),
    },
  ];
}

export function otherProviders(): Provider[] {
  const env = (k: string) => (process.env[k] ?? "").trim();
  const router = env("REPSUITES_OPENROUTER_API_KEY");
  if (router) return viaOpenRouter(router);
  const list: Provider[] = [
    {
      name: "OpenAI",
      key: env("REPSUITES_OPENAI_API_KEY"),
      model: env("REPSUITES_OPENAI_SEARCH_MODEL") || "gpt-5-search-api",
      call: async (key, model, question) => {
        const res = await fetch("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: { Authorization: `Bearer ${key}`, "content-type": "application/json" },
          signal: AbortSignal.timeout(60000),
          body: JSON.stringify({
            model,
            web_search_options: {},
            messages: [
              {
                role: "system",
                content: `You help a member of the public find a local business. Search the web. ${LIST_RULE}`,
              },
              { role: "user", content: question },
            ],
          }),
        });
        if (!res.ok)
          throw new Error(
            `OpenAI ${res.status}: ${(await res.text().catch(() => "")).slice(0, 160)}`,
          );
        const b = (await res.json()) as any;
        const msg = b.choices?.[0]?.message ?? {};
        const urls = (msg.annotations ?? [])
          .map((a: any) => a?.url_citation?.url)
          .filter((u: unknown): u is string => typeof u === "string");
        return { text: String(msg.content ?? ""), urls, model: b.model };
      },
    },
    {
      name: "Google Gemini",
      key: env("REPSUITES_GEMINI_API_KEY"),
      model: env("REPSUITES_GEMINI_MODEL") || "gemini-3.5-flash",
      call: async (key, model, question) => {
        const res = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
          {
            method: "POST",
            headers: { "x-goog-api-key": key, "content-type": "application/json" },
            signal: AbortSignal.timeout(60000),
            body: JSON.stringify({
              systemInstruction: {
                parts: [
                  { text: `You help a member of the public find a local business. ${LIST_RULE}` },
                ],
              },
              contents: [{ role: "user", parts: [{ text: question }] }],
              tools: [{ google_search: {} }],
            }),
          },
        );
        if (!res.ok)
          throw new Error(
            `Gemini ${res.status}: ${(await res.text().catch(() => "")).slice(0, 160)}`,
          );
        const b = (await res.json()) as any;
        const cand = b.candidates?.[0] ?? {};
        const urls = (cand.groundingMetadata?.groundingChunks ?? [])
          .map((c: any) => c?.web?.uri)
          .filter((u: unknown): u is string => typeof u === "string");
        return {
          text: (cand.content?.parts ?? []).map((p: any) => String(p?.text ?? "")).join("\n"),
          urls,
          model: b.modelVersion,
        };
      },
    },
    {
      name: "Perplexity",
      key: env("REPSUITES_PERPLEXITY_API_KEY"),
      model: env("REPSUITES_PERPLEXITY_MODEL") || "sonar",
      call: async (key, model, question) => {
        const res = await fetch("https://api.perplexity.ai/chat/completions", {
          method: "POST",
          headers: { Authorization: `Bearer ${key}`, "content-type": "application/json" },
          signal: AbortSignal.timeout(60000),
          body: JSON.stringify({
            model,
            messages: [
              {
                role: "system",
                content: `You help a member of the public find a local business. ${LIST_RULE}`,
              },
              { role: "user", content: question },
            ],
          }),
        });
        if (!res.ok)
          throw new Error(
            `Perplexity ${res.status}: ${(await res.text().catch(() => "")).slice(0, 160)}`,
          );
        const b = (await res.json()) as any;
        const urls = (b.citations ?? b.search_results?.map((r: any) => r?.url) ?? []).filter(
          (u: unknown): u is string => typeof u === "string",
        );
        return { text: String(b.choices?.[0]?.message?.content ?? ""), urls, model: b.model };
      },
    },
  ];
  return list.filter((p) => p.key);
}

export async function askProvider(p: Provider, question: string): Promise<Asked> {
  try {
    const r = await p.call(p.key, p.model, question);
    if (!hasList(r.text))
      return {
        error: `${p.name} did not return a usable business list. No conclusion was recorded.`,
      };
    return {
      text: r.text,
      sources: r.urls.map(domainOf).filter((d): d is string => !!d),
      evidence: {
        provider: p.name,
        model: String(r.model || p.model),
        checkedAt: new Date().toISOString(),
        urls: [...new Set(r.urls)].filter((u) => /^https?:\/\//i.test(u)).slice(0, 12),
        excerpt: r.text.slice(0, 3000),
      },
    };
  } catch (err) {
    const why = String((err as Error)?.message ?? err).slice(0, 220);
    console.error("AI provider failed", p.name, p.model, why);
    return { error: `${p.name} could not be checked (${why.slice(0, 120)}).` };
  }
}

export async function runAiVisibility(input: { service: string; town: string }) {
  const g = await guard(true);
  if (!g.ok) return g;
  const service = (cleanService(input.service) || input.service.trim()).slice(0, 80);
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
  // At most one check every 10 minutes per business, to keep AI costs predictable.
  const recent = await serviceRead<{ id: string }[]>(
    `ai_visibility_checks?select=id&tenant_id=eq.${g.tenantId}&error=is.null&created_at=gte.${new Date(Date.now() - 600_000).toISOString()}&limit=1`,
    "",
  );
  if (recent.data?.length)
    return { ok: false as const, error: "Checked in the last 10 minutes. Try again shortly." };
  const business = await businessName(g.tenantId);
  const questions = aiQuestions(service, town);
  const answers = await Promise.all(questions.map((q) => ask(q, town)));
  const failed = answers.find((a) => "error" in a) as { error: string } | undefined;
  const results: AiAnswer[] = answers
    .map((a, i) =>
      "text" in a
        ? { ...readAnswer(questions[i]!, a.text, business, a.sources), evidence: a.evidence }
        : null,
    )
    .filter((a): a is NonNullable<typeof a> => !!a);
  const named = results.filter((r) => r.named).length;
  await serviceWrite("ai_visibility_checks", "", {
    method: "POST",
    body: {
      tenant_id: g.tenantId,
      results,
      named,
      total: results.length,
      error: failed?.error ?? (results.length ? null : "No answer."),
    },
  });
  if (!results.length) return { ok: false as const, error: failed?.error ?? "No answer." };
  return { ok: true as const };
}
