// Server-only: builds and stores Customer Insights for a business.
import { serviceRead, serviceWrite } from "./supabase-service.server";
import {
  insightFacts,
  insightsPrompt,
  INSIGHTS_SYSTEM,
  parseInsightSummary,
  type InsightFacts,
  type InsightSummary,
} from "./insights";

export interface StoredInsights {
  createdAt: string;
  facts: InsightFacts;
  summary: InsightSummary | null;
  error: string | null;
}

export async function latestInsights(tenantId: string): Promise<StoredInsights | null> {
  const r = await serviceRead<
    {
      created_at: string;
      facts: InsightFacts;
      summary: InsightSummary | null;
      error: string | null;
    }[]
  >(
    `customer_insights?select=created_at,facts,summary,error&tenant_id=eq.${tenantId}&order=created_at.desc&limit=1`,
    "",
  );
  const x = r.data?.[0];
  return x ? { createdAt: x.created_at, facts: x.facts, summary: x.summary, error: x.error } : null;
}

async function askClaude(prompt: string): Promise<{ text: string } | { error: string }> {
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
      signal: AbortSignal.timeout(60000),
      body: JSON.stringify({
        model: (process.env["REPSUITES_INSIGHTS_MODEL"] ?? "").trim() || "claude-sonnet-5-5",
        max_tokens: 2000,
        system: INSIGHTS_SYSTEM,
        // A fixed form the answer must fill in, so it always comes back readable.
        tools: [
          {
            name: "customer_insights",
            description: "Record the summary of customer feedback for the owner.",
            input_schema: {
              type: "object",
              properties: {
                headline: { type: "string" },
                praises: { type: "array", items: { $ref: "#/$defs/theme" }, maxItems: 3 },
                complaints: { type: "array", items: { $ref: "#/$defs/theme" }, maxItems: 3 },
                people: {
                  type: "array",
                  maxItems: 5,
                  items: {
                    type: "object",
                    properties: {
                      name: { type: "string" },
                      mentions: { type: "integer" },
                      tone: { type: "string", enum: ["positive", "mixed", "negative"] },
                    },
                    required: ["name", "mentions", "tone"],
                  },
                },
                trend: { type: "string" },
                action: {
                  type: "object",
                  properties: { title: { type: "string" }, why: { type: "string" } },
                  required: ["title", "why"],
                },
              },
              required: ["headline", "praises", "complaints", "people", "trend", "action"],
              $defs: {
                theme: {
                  type: "object",
                  properties: {
                    theme: { type: "string" },
                    mentions: { type: "integer" },
                    quote: { type: "string" },
                  },
                  required: ["theme", "mentions", "quote"],
                },
              },
            },
          },
        ],
        // Some models refuse a forced tool; "auto" plus the system instruction works on all.
        tool_choice: { type: "auto" },
        messages: [{ role: "user", content: prompt }],
      }),
    });
    if (!res.ok) {
      const b = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
      const why = String(b?.error?.message ?? "").slice(0, 160);
      return { error: `The summary could not be written (${res.status}${why ? `: ${why}` : ""}).` };
    }
    const body = (await res.json()) as {
      content?: { type: string; text?: string; input?: unknown }[];
    };
    const used = (body.content ?? []).find((c) => c.type === "tool_use");
    return {
      text: used
        ? JSON.stringify(used.input ?? {})
        : (body.content ?? [])
            .filter((c) => c.type === "text")
            .map((c) => c.text ?? "")
            .join(""),
    };
  } catch {
    return { error: "The summary could not be written. Try again shortly." };
  }
}

export async function buildInsights(tenantId: string, business: string): Promise<StoredInsights> {
  // Look back a year (and the year before, for comparison); the period used is
  // 90 days when there is enough to say, otherwise up to 12 months.
  const since = new Date(Date.now() - 730 * 86400000).toISOString();
  const [rv, fb] = await Promise.all([
    serviceRead<
      { stars: number; comment: string | null; created_at_google: string; reply: string | null }[]
    >(
      `google_reviews?select=stars,comment,created_at_google,reply&tenant_id=eq.${tenantId}&created_at_google=gte.${since}&order=created_at_google.desc&limit=500`,
      "",
    ),
    serviceRead<{ message: string; created_at: string }[]>(
      `private_feedback?select=message,created_at&tenant_id=eq.${tenantId}&created_at=gte.${since}&order=created_at.desc&limit=300`,
      "",
    ),
  ]);
  const reviews = (rv.data ?? []).map((r) => ({
    stars: Number(r.stars) || 0,
    comment: r.comment ?? "",
    at: r.created_at_google,
    replied: !!r.reply,
  }));
  const feedback = (fb.data ?? []).map((f) => ({ message: f.message, at: f.created_at }));
  const now = new Date();
  let periodDays = 90;
  let facts = insightFacts(reviews, feedback, now, periodDays);
  for (const d of [180, 365]) {
    if (facts.withText >= 8) break;
    periodDays = d;
    facts = insightFacts(reviews, feedback, now, periodDays);
  }

  let summary: InsightSummary | null = null;
  let error: string | null = null;
  if (facts.withText < 2) {
    error =
      "Not enough written feedback yet. A summary needs at least 2 reviews or messages with words in them.";
  } else {
    const start = now.getTime() - periodDays * 86400000;
    const recentR = reviews.filter((r) => Date.parse(r.at) >= start);
    const recentF = feedback.filter((f) => Date.parse(f.at) >= start);
    const out = await askClaude(insightsPrompt(business, facts, recentR, recentF));
    if ("error" in out) error = out.error;
    else {
      summary = parseInsightSummary(out.text);
      if (!summary) error = "The summary came back in the wrong shape. Try again.";
    }
  }
  const createdAt = new Date().toISOString();
  await serviceWrite("customer_insights", "", {
    method: "POST",
    body: {
      tenant_id: tenantId,
      created_at: createdAt,
      period_days: periodDays,
      facts,
      summary,
      error,
    },
  });
  return { createdAt, facts, summary, error };
}
