// NFC review cards and table stands: the sales page for the shop funnel.
// Landing > /cards/order (design and choose) > Stripe Checkout > /cards/thanks.
// No em dashes in this copy (AGENTS.md).
import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import {
  ArrowRight,
  BadgeCheck,
  ChevronDown,
  Clock,
  Hand,
  ShieldCheck,
  Smartphone,
  Star,
  Truck,
} from "lucide-react";
import { PublicLayout } from "../components/site/PublicLayout";
import { CARD_MESSAGES, CardPreview, StandPreview } from "../components/shop/CardPreview";
import { CARD_PACKS, STAND_PACKS, each, money } from "../lib/shop";

export const Route = createFileRoute("/cards")({
  head: () => ({
    meta: [
      { title: "Google review cards and table stands | RepSuites" },
      {
        name: "description",
        content:
          "NFC review cards and A5 table stands printed with your business name. Customers tap or scan and your review page opens. From £15, free UK delivery.",
      },
    ],
  }),
  component: Cards,
});

const steps = [
  {
    icon: Hand,
    title: "Hand it over as they pay",
    text: "Your customer taps the card on their phone, or scans the QR code. No app, nothing to download.",
  },
  {
    icon: Smartphone,
    title: "Your review page opens",
    text: "One clear page with your Google button, plus any other review sites you choose.",
  },
  {
    icon: Star,
    title: "The review is posted",
    text: "They write a few words and tap post. Done in under a minute, while the visit is still fresh.",
  },
];

const reasons = [
  {
    icon: Clock,
    title: "Asks at the right moment",
    text: "Most happy customers mean to leave a review and then forget. The card asks while they are still smiling at your counter.",
  },
  {
    icon: Smartphone,
    title: "Works with every phone",
    text: "Newer iPhones and Androids read the tap. Any phone camera reads the QR code on the same card.",
  },
  {
    icon: ShieldCheck,
    title: "Follows Google's rules",
    text: "Every customer gets the same invitation, with no filtering and no rewards, so your reviews stay safe.",
  },
  {
    icon: BadgeCheck,
    title: "Change it any time",
    text: "Point the card at a new review site from your dashboard. The card never needs reprinting.",
  },
];

const faqs = [
  {
    q: "Which phones can tap the card?",
    a: "iPhone XS and newer, and most Android phones from the last few years. Any phone can scan the QR code printed on the same card, so nobody is left out.",
  },
  {
    q: "Do I need a RepSuites plan?",
    a: "No. The cards work on their own. A plan adds the reviews inbox, replies, ranking reports and more, if you want them later.",
  },
  {
    q: "How long does delivery take?",
    a: "We set up and test your cards, then post them. Most UK orders arrive within 3 to 7 working days. Delivery is free.",
  },
  {
    q: "What if my business is not on Google yet?",
    a: "Order anyway and leave the business search blank. We will contact you and point the card at the review site you use.",
  },
  {
    q: "Is it allowed to ask for Google reviews this way?",
    a: "Yes. Google allows businesses to ask customers for reviews. What it does not allow is only asking happy customers or offering rewards, and our cards do neither.",
  },
];

function Cards() {
  const [open, setOpen] = useState<number | null>(0);
  const from = money(CARD_PACKS[0]!.pence);
  return (
    <PublicLayout>
      {/* Hero */}
      <section className="px-4 pt-12 pb-14 md:pt-20 md:pb-20 overflow-hidden">
        <div className="max-w-6xl mx-auto grid md:grid-cols-2 gap-10 md:gap-14 items-center">
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-4">
              NFC review cards and table stands
            </p>
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-extrabold tracking-tight leading-[1.06]">
              One tap. <span className="text-primary">One more 5-star review.</span>
            </h1>
            <p className="mt-5 text-lg text-muted-foreground max-w-xl">
              Your happy customers already want to help. Give them a card they tap on their phone
              and your Google review page opens. Printed with your name, delivered free.
            </p>
            <div className="mt-8 flex flex-col sm:flex-row gap-3">
              <Link
                to="/cards/order"
                className="rounded-xl bg-primary text-primary-foreground font-bold px-6 py-3.5 text-base inline-flex items-center justify-center gap-2"
              >
                Design my cards <ArrowRight className="w-4 h-4" />
              </Link>
              <a
                href="#prices"
                className="rounded-xl border border-border px-6 py-3.5 text-base font-semibold text-center"
              >
                See prices
              </a>
            </div>
            <ul className="mt-6 flex flex-wrap gap-x-5 gap-y-2 text-sm text-muted-foreground">
              <li className="flex items-center gap-1.5">
                <Truck className="w-4 h-4" /> Free UK delivery
              </li>
              <li className="flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4" /> Secure payment by Stripe
              </li>
              <li className="flex items-center gap-1.5">
                <BadgeCheck className="w-4 h-4" /> From {from}
              </li>
            </ul>
          </div>
          <div className="relative h-[300px] sm:h-[380px]">
            <div className="absolute inset-0 rounded-[2rem] bg-primary/15 rotate-3" />
            <div className="absolute left-[4%] top-[12%] w-[70%] -rotate-6">
              <CardPreview name="The Corner Cafe" message={CARD_MESSAGES[0]!} />
            </div>
            <div className="absolute right-[4%] bottom-[2%] w-[34%] rotate-3">
              <StandPreview name="The Corner Cafe" message={CARD_MESSAGES[1]!} />
            </div>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="px-4 py-14 bg-muted/40">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-3xl md:text-4xl font-bold text-center mb-10">
            From counter to review in under a minute
          </h2>
          <ol className="grid md:grid-cols-3 gap-5">
            {steps.map((s, i) => (
              <li key={s.title} className="rounded-2xl border border-border bg-card p-6">
                <div className="flex items-center gap-3 mb-3">
                  <span className="inline-flex w-8 h-8 rounded-full bg-primary text-primary-foreground font-bold items-center justify-center">
                    {i + 1}
                  </span>
                  <s.icon className="w-5 h-5" />
                </div>
                <h3 className="text-lg font-bold mb-1.5">{s.title}</h3>
                <p className="text-muted-foreground">{s.text}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* Why it works */}
      <section className="px-4 py-14">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-3xl md:text-4xl font-bold text-center mb-3">
            Why a card beats asking
          </h2>
          <p className="text-center text-muted-foreground mb-10 max-w-2xl mx-auto">
            People choose the business with more recent reviews. A card turns "I must leave you a
            review" into a review today.
          </p>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {reasons.map((r) => (
              <div key={r.title} className="rounded-2xl border border-border bg-card p-6">
                <div className="w-11 h-11 rounded-xl bg-primary/15 flex items-center justify-center mb-4">
                  <r.icon className="w-5 h-5" />
                </div>
                <h3 className="font-bold mb-2">{r.title}</h3>
                <p className="text-sm text-muted-foreground">{r.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Prices */}
      <section id="prices" className="px-4 py-14 bg-muted/40 scroll-mt-16">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-3xl md:text-4xl font-bold text-center mb-3">Simple prices</h2>
          <p className="text-center text-muted-foreground mb-10">
            One-off payment. Free UK delivery. No subscription needed.
          </p>
          <h3 className="font-bold mb-3">NFC review cards</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {CARD_PACKS.map((p) => (
              <Link
                key={p.id}
                to="/cards/order"
                search={{ cards: p.id }}
                className={`relative rounded-2xl border bg-card p-5 hover:border-foreground transition ${p.badge ? "border-primary ring-2 ring-primary/30" : "border-border"}`}
              >
                {p.badge && (
                  <span className="absolute -top-2.5 left-4 rounded-full bg-primary text-primary-foreground text-[11px] font-bold px-2 py-0.5">
                    {p.badge}
                  </span>
                )}
                <div className="text-sm text-muted-foreground">
                  {p.qty} card{p.qty === 1 ? "" : "s"}
                </div>
                <div className="text-3xl font-extrabold mt-1">{money(p.pence)}</div>
                <div className="text-xs text-muted-foreground mt-1">{each(p)} each</div>
              </Link>
            ))}
          </div>
          <h3 className="font-bold mt-8 mb-3">A5 table stands</h3>
          <div className="grid sm:grid-cols-2 gap-3">
            {STAND_PACKS.map((p) => (
              <Link
                key={p.id}
                to="/cards/order"
                search={{ stands: p.id }}
                className="relative rounded-2xl border border-border bg-card p-5 flex items-center justify-between hover:border-foreground transition"
              >
                <div>
                  <div className="text-sm text-muted-foreground">
                    {p.qty} stand{p.qty === 1 ? "" : "s"} with NFC and QR code
                  </div>
                  <div className="text-3xl font-extrabold mt-1">{money(p.pence)}</div>
                </div>
                {p.badge && (
                  <span className="rounded-full bg-primary text-primary-foreground text-xs font-bold px-2.5 py-1">
                    {p.badge}
                  </span>
                )}
              </Link>
            ))}
          </div>
          <p className="text-sm text-muted-foreground mt-6 text-center">
            Worked out: if just one new customer picks you because of your reviews, they can pay for
            a {money(CARD_PACKS[1]!.pence)} pack of cards on their first visit.
          </p>
        </div>
      </section>

      {/* FAQ */}
      <section className="px-4 py-14">
        <div className="max-w-3xl mx-auto">
          <h2 className="text-3xl md:text-4xl font-bold text-center mb-8">Questions</h2>
          <div className="divide-y divide-border rounded-2xl border border-border bg-card">
            {faqs.map((f, i) => (
              <div key={f.q}>
                <button
                  type="button"
                  onClick={() => setOpen(open === i ? null : i)}
                  className="w-full flex items-center justify-between gap-4 text-left px-5 py-4 font-semibold"
                  aria-expanded={open === i}
                >
                  {f.q}
                  <ChevronDown
                    className={`w-4 h-4 shrink-0 transition ${open === i ? "rotate-180" : ""}`}
                  />
                </button>
                {open === i && <p className="px-5 pb-4 text-muted-foreground">{f.a}</p>}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Final call to action */}
      <section className="px-4 pb-24 md:pb-16">
        <div className="max-w-4xl mx-auto rounded-3xl bg-foreground text-background p-8 md:p-12 text-center">
          <h2 className="text-3xl md:text-4xl font-bold">See your card before you buy</h2>
          <p className="mt-3 text-background/75 max-w-xl mx-auto">
            Type your business name and watch your card appear. It takes about a minute.
          </p>
          <Link
            to="/cards/order"
            className="mt-7 inline-flex items-center gap-2 rounded-xl bg-primary text-primary-foreground font-bold px-7 py-3.5"
          >
            Design my cards <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </section>

      {/* Sticky button on phones */}
      <div className="md:hidden fixed bottom-0 inset-x-0 z-30 p-3 bg-background/95 backdrop-blur border-t border-border">
        <Link
          to="/cards/order"
          className="flex items-center justify-center gap-2 rounded-xl bg-primary text-primary-foreground font-bold py-3.5"
        >
          Design my cards, from {from}
        </Link>
      </div>
    </PublicLayout>
  );
}
