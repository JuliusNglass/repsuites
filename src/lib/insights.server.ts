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
        max_tokens: 1200,
        system: INSIGHTS_SYSTEM,
        messages: [{ role: "user", content: prompt }],
      }),
    });
    if (!res.ok) return { error: `The summary could not be written (${res.status}).` };
    const body = (await res.json()) as { content?: { type: string; text?: string }[] };
    return {
      text: (body.content ?? [])
        .filter((c) => c.type === "text")
        .map((c) => c.text ?? "")
        .join(""),
    };
  } catch {
    return { error: "The summary could not be written. Try again shortly." };
  }
}

export async function buildInsights(
  tenantId: string,
  business: string,
  periodDays = 90,
): Promise<StoredInsights> {
  const since = new Date(Date.now() - 2 * periodDays * 86400000).toISOString();
  const [rv, fb] = await Promise.all([
    serviceRead<
      { stars: number; comment: string | null; created_at_google: string; reply: string | null }[]
    >(
      `google_reviews?select=stars,comment,created_at_google,reply&tenant_id=eq.${tenantId}&created_at_google=gte.${since}&order=created_at_google.desc&limit=400`,
      "",
    ),
    serviceRead<{ message: string; created_at: string }[]>(
      `private_feedback?select=message,created_at&tenant_id=eq.${tenantId}&created_at=gte.${since}&order=created_at.desc&limit=200`,
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
  const facts = insightFacts(reviews, feedback, new Date(), periodDays);

  let summary: InsightSummary | null = null;
  let error: string | null = null;
  if (facts.withText < 2) {
    error =
      "Not enough written feedback yet. A summary needs at least 2 reviews or messages with words in them.";
  } else {
    const start = Date.now() - periodDays * 86400000;
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
