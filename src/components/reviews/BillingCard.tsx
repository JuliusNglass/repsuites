// "Your plan" on the Settings tab: which plan, when it renews, and the way
// to change card, switch to yearly or cancel (Stripe's own billing page).
// No em dashes in this copy (AGENTS.md).
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { CreditCard, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { getMyBilling, openBillingPortal } from "../../lib/shop.functions";

type Billing = Extract<Awaited<ReturnType<typeof getMyBilling>>, { ok: true }>;

const NAMES: Record<string, string> = {
  free: "Free",
  starter: "Starter",
  pro: "Pro",
  gold: "RepSuites Growth",
};

export function BillingCard() {
  const load = useServerFn(getMyBilling);
  const portal = useServerFn(openBillingPortal);
  const [b, setB] = useState<Billing | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    load()
      .then((r) => (r.ok ? setB(r) : null))
      .catch(() => null);
    if (typeof window !== "undefined" && window.location.search.includes("billing=done"))
      toast.success("Thank you. You are on RepSuites Growth. Everything is now switched on.");
  }, [load]);

  if (!b) return null;
  const paid = !!b.status && ["active", "trialing", "past_due"].includes(b.status);
  const renews = b.renews
    ? new Date(b.renews).toLocaleDateString("en-GB", {
        day: "numeric",
        month: "long",
        year: "numeric",
      })
    : null;
  return (
    <section className="rounded-xl border border-border bg-card p-4 flex flex-wrap items-center gap-3">
      <CreditCard className="w-5 h-5 text-muted-foreground" />
      <div className="flex-1 min-w-0">
        <p className="font-bold">Your plan: {NAMES[b.plan] ?? b.plan}</p>
        <p className="text-xs text-muted-foreground">
          {paid
            ? b.status === "past_due"
              ? "Your last payment did not go through. Update your card to keep everything on."
              : renews
                ? `Renews on ${renews}. Change your card, switch to yearly or cancel any time.`
                : "Change your card, switch to yearly or cancel any time."
            : b.plan === "free"
              ? "Free for ever. Upgrade to get AI replies, review requests, Maps rankings and more."
              : "Managed by Accelur8."}
        </p>
      </div>
      {paid && b.canManage ? (
        <button
          type="button"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            const r = await portal().catch(() => null);
            if (r?.ok) window.location.href = r.url;
            else {
              setBusy(false);
              toast.error(r?.error ?? "Could not open billing. Try again.");
            }
          }}
          className="rounded-lg border border-border px-3 py-2 text-sm font-semibold inline-flex items-center gap-1.5 disabled:opacity-50"
        >
          {busy && <Loader2 className="w-4 h-4 animate-spin" />}
          Manage or cancel plan
        </button>
      ) : b.plan === "free" ? (
        <a
          href="/pricing"
          className="rounded-lg bg-primary text-primary-foreground px-3 py-2 text-sm font-bold"
        >
          Upgrade
        </a>
      ) : null}
    </section>
  );
}
