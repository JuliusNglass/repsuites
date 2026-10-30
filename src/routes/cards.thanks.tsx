// Shop step 4: shown after Stripe takes payment.
// No em dashes in this copy (AGENTS.md).
import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { CheckCircle2 } from "lucide-react";
import { PublicLayout } from "../components/site/PublicLayout";
import { getShopOrder } from "../lib/shop.functions";

export const Route = createFileRoute("/cards/thanks")({
  validateSearch: z.object({ order: z.string().max(40).optional() }),
  head: () => ({
    meta: [{ title: "Order received | RepSuites" }, { name: "robots", content: "noindex" }],
  }),
  component: Thanks,
});

function Thanks() {
  const { order } = Route.useSearch();
  const get = useServerFn(getShopOrder);
  const [name, setName] = useState<string | null>(null);
  useEffect(() => {
    if (!order || !/^[0-9a-f-]{36}$/i.test(order)) return;
    get({ data: { id: order } })
      .then((r) => r.ok && setName(r.businessName))
      .catch(() => null);
  }, [order, get]);

  return (
    <PublicLayout>
      <section className="max-w-xl mx-auto px-4 py-16 text-center">
        <CheckCircle2 className="w-14 h-14 mx-auto text-emerald-600" />
        <h1 className="text-3xl md:text-4xl font-extrabold mt-4">Thank you, your order is in</h1>
        <p className="mt-3 text-muted-foreground">
          {name ? `Cards for ${name} are next in line. ` : ""}A receipt is on its way to your email.
        </p>
        <ol className="mt-8 text-left space-y-3">
          {[
            "We set up your cards to open your review page, and test every one.",
            "We print and post them. Most UK orders arrive within 3 to 7 working days.",
            "Tap one on your own phone to try it, then keep them where customers pay.",
          ].map((t, i) => (
            <li key={t} className="flex gap-3 rounded-xl border border-border bg-card p-4">
              <span className="inline-flex w-7 h-7 shrink-0 rounded-full bg-primary text-primary-foreground font-bold items-center justify-center text-sm">
                {i + 1}
              </span>
              <span>{t}</span>
            </li>
          ))}
        </ol>
        <div className="mt-10 rounded-2xl bg-muted/60 p-6">
          <h2 className="font-bold">Want to know where you rank while you wait?</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Get a free check of how you show up on Google Maps against nearby competitors.
          </p>
          <a
            href="/#check"
            className="mt-4 inline-block rounded-xl bg-primary text-primary-foreground font-bold px-5 py-3"
          >
            Get my free visibility check
          </a>
        </div>
        <Link to="/" className="mt-6 inline-block text-sm text-muted-foreground underline">
          Back to RepSuites
        </Link>
      </section>
    </PublicLayout>
  );
}
