// Shop step 2: find the business, choose the message and quantities, watch the
// card update, then pay on Stripe. (This address is also printed on older
// cards as "Powered by RepSuites", so it doubles as a landing page.)
// No em dashes in this copy (AGENTS.md).
import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { ArrowLeft, Check, Loader2, Lock, Truck } from "lucide-react";
import { toast } from "sonner";
import { PublicLayout } from "../components/site/PublicLayout";
import { BusinessSearch } from "../components/site/BusinessSearch";
import { CARD_MESSAGES, CardPreview, StandPreview } from "../components/shop/CardPreview";
import type { BusinessDetails } from "../lib/places.functions";
import { CARD_PACKS, STAND_PACKS, each, findCardPack, findStandPack, money } from "../lib/shop";
import { shopStatus, startCardCheckout } from "../lib/shop.functions";

export const Route = createFileRoute("/cards/order")({
  validateSearch: z.object({
    cards: z.string().max(20).optional(),
    stands: z.string().max(20).optional(),
    back: z.coerce.number().optional(),
  }),
  head: () => ({ meta: [{ title: "Design your review cards | RepSuites" }] }),
  component: Order,
});

function Order() {
  const search = Route.useSearch();
  const status = useServerFn(shopStatus);
  const checkout = useServerFn(startCardCheckout);
  const [ready, setReady] = useState<boolean | null>(null);
  const [name, setName] = useState("");
  const [biz, setBiz] = useState<BusinessDetails | null>(null);
  const [msgIdx, setMsgIdx] = useState(0);
  const [custom, setCustom] = useState("");
  const initialStand = findStandPack(search.stands)?.id ?? null;
  const [cards, setCards] = useState<string | null>(
    findCardPack(search.cards)?.id ?? (initialStand ? null : "cards-3"),
  );
  const [stands, setStands] = useState<string | null>(initialStand);
  const [paying, setPaying] = useState(false);
  const [view, setView] = useState<"card" | "stand">(initialStand ? "stand" : "card");

  useEffect(() => {
    status()
      .then((r) => setReady(r.ready))
      .catch(() => setReady(false));
  }, [status]);

  const message = msgIdx === -1 ? custom.trim() || "Your message here" : CARD_MESSAGES[msgIdx]!;
  const shown = biz?.name ?? name.trim();
  const c = findCardPack(cards);
  const s = findStandPack(stands);
  const total = (c?.pence ?? 0) + (s?.pence ?? 0);
  const canPay = !!shown && shown.length >= 2 && total > 0 && !paying;

  async function pay() {
    if (!canPay) return;
    setPaying(true);
    try {
      const r = await checkout({
        data: {
          cards,
          stands,
          businessName: shown,
          ...(biz ? { placeId: biz.placeId } : {}),
          ...(msgIdx === -1 && custom.trim()
            ? { message: custom.trim() }
            : msgIdx >= 0
              ? { message }
              : {}),
        },
      });
      if (r.ok) window.location.href = r.url;
      else {
        toast.error(r.error);
        setPaying(false);
      }
    } catch {
      toast.error("Something went wrong. Try again.");
      setPaying(false);
    }
  }

  return (
    <PublicLayout>
      <div className="max-w-6xl mx-auto px-4 pt-6 pb-32 md:pb-16">
        <Link
          to="/cards"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground"
        >
          <ArrowLeft className="w-4 h-4" /> Back
        </Link>
        <h1 className="text-3xl md:text-4xl font-extrabold mt-3">Design your review cards</h1>
        {search.back ? (
          <p className="mt-2 text-sm text-muted-foreground">
            No payment was taken. Your choices are below whenever you are ready.
          </p>
        ) : (
          <p className="mt-2 text-muted-foreground">
            Three quick choices. Your card updates as you go.
          </p>
        )}

        <div className="mt-8 grid md:grid-cols-[1fr_minmax(0,420px)] gap-8 md:gap-12 items-start">
          {/* Choices */}
          <div className="space-y-8 order-2 md:order-1">
            <section>
              <h2 className="font-bold mb-1">1. Your business</h2>
              <p className="text-sm text-muted-foreground mb-3">
                Find it on Google so the card opens your own review page.
              </p>
              <BusinessSearch value={name} onChange={setName} confirmed={biz} onConfirm={setBiz} />
            </section>

            <section>
              <h2 className="font-bold mb-3">2. The message on your card</h2>
              <div className="space-y-2">
                {CARD_MESSAGES.map((m, i) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setMsgIdx(i)}
                    className={`w-full text-left rounded-xl border px-4 py-3 text-sm flex gap-3 items-start ${msgIdx === i ? "border-foreground bg-card" : "border-border"}`}
                  >
                    <span
                      className={`mt-0.5 w-4 h-4 rounded-full border shrink-0 flex items-center justify-center ${msgIdx === i ? "bg-foreground border-foreground" : "border-muted-foreground"}`}
                    >
                      {msgIdx === i && <Check className="w-3 h-3 text-background" />}
                    </span>
                    {m}
                  </button>
                ))}
                <div
                  className={`rounded-xl border px-4 py-3 ${msgIdx === -1 ? "border-foreground bg-card" : "border-border"}`}
                >
                  <label className="text-sm font-semibold flex items-center gap-2">
                    <input
                      type="radio"
                      checked={msgIdx === -1}
                      onChange={() => setMsgIdx(-1)}
                      className="accent-foreground"
                    />
                    Write my own
                  </label>
                  {msgIdx === -1 && (
                    <>
                      <input
                        value={custom}
                        onChange={(e) => setCustom(e.target.value.slice(0, 60))}
                        placeholder="e.g. Thanks for visiting! Tap to tell us how we did."
                        className="mt-2 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                        autoFocus
                      />
                      <p className="text-xs text-muted-foreground mt-1">{custom.length}/60</p>
                    </>
                  )}
                </div>
              </div>
            </section>

            <section>
              <h2 className="font-bold mb-3">3. How many</h2>
              <p className="text-sm font-semibold mb-2">NFC cards</p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {CARD_PACKS.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => {
                      setCards(cards === p.id ? null : p.id);
                      setView("card");
                    }}
                    className={`relative rounded-xl border p-3 text-left ${cards === p.id ? "border-foreground bg-card ring-2 ring-primary/40" : "border-border"}`}
                  >
                    {p.badge && (
                      <span className="absolute -top-2 right-2 rounded-full bg-primary text-primary-foreground text-[10px] font-bold px-1.5">
                        {p.badge}
                      </span>
                    )}
                    <div className="text-xs text-muted-foreground">
                      {p.qty} card{p.qty === 1 ? "" : "s"}
                    </div>
                    <div className="text-xl font-extrabold">{money(p.pence)}</div>
                    <div className="text-[11px] text-muted-foreground">{each(p)} each</div>
                  </button>
                ))}
              </div>
              <p className="text-sm font-semibold mt-5 mb-2">
                Add an A5 table stand{" "}
                <span className="font-normal text-muted-foreground">(optional)</span>
              </p>
              <div className="grid grid-cols-2 gap-2">
                {STAND_PACKS.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => {
                      setStands(stands === p.id ? null : p.id);
                      setView("stand");
                    }}
                    className={`relative rounded-xl border p-3 text-left ${stands === p.id ? "border-foreground bg-card ring-2 ring-primary/40" : "border-border"}`}
                  >
                    {p.badge && (
                      <span className="absolute -top-2 right-2 rounded-full bg-primary text-primary-foreground text-[10px] font-bold px-1.5">
                        {p.badge}
                      </span>
                    )}
                    <div className="text-xs text-muted-foreground">
                      {p.qty} stand{p.qty === 1 ? "" : "s"}
                    </div>
                    <div className="text-xl font-extrabold">{money(p.pence)}</div>
                  </button>
                ))}
              </div>
            </section>
          </div>

          {/* Preview and summary */}
          <aside className="order-1 md:order-2 md:sticky md:top-20 space-y-4">
            <div className="rounded-3xl bg-muted/60 p-6 sm:p-8">
              <div className="flex justify-center gap-1 mb-5 text-xs font-semibold">
                {(["card", "stand"] as const).map((v) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setView(v)}
                    className={`rounded-full px-3 py-1 ${view === v ? "bg-foreground text-background" : "text-muted-foreground"}`}
                  >
                    {v === "card" ? "Card" : "Table stand"}
                  </button>
                ))}
              </div>
              {view === "card" ? (
                <CardPreview name={shown} message={message} />
              ) : (
                <div className="w-1/2 mx-auto">
                  <StandPreview name={shown} message={message} />
                </div>
              )}
              <p className="text-center text-xs text-muted-foreground mt-4">
                Preview. The QR code on your cards opens your own review page.
              </p>
            </div>

            <div className="hidden md:block rounded-2xl border border-border bg-card p-5">
              <Summary c={c} s={s} total={total} />
              <PayButton ready={ready} canPay={canPay} paying={paying} total={total} onPay={pay} />
              {!shown && (
                <p className="text-xs text-muted-foreground mt-2 text-center">
                  Add your business name to continue.
                </p>
              )}
            </div>
          </aside>
        </div>
      </div>

      {/* Phone checkout bar */}
      <div className="md:hidden fixed bottom-0 inset-x-0 z-30 p-3 bg-background/95 backdrop-blur border-t border-border">
        <div className="flex items-center justify-between text-sm mb-2">
          <span className="text-muted-foreground">
            {[
              c && `${c.qty} card${c.qty === 1 ? "" : "s"}`,
              s && `${s.qty} stand${s.qty === 1 ? "" : "s"}`,
            ]
              .filter(Boolean)
              .join(" + ") || "Nothing chosen"}
          </span>
          <span className="font-extrabold text-lg">{money(total)}</span>
        </div>
        <PayButton ready={ready} canPay={canPay} paying={paying} total={total} onPay={pay} />
      </div>
    </PublicLayout>
  );
}

function Summary({
  c,
  s,
  total,
}: {
  c: ReturnType<typeof findCardPack>;
  s: ReturnType<typeof findStandPack>;
  total: number;
}) {
  return (
    <div className="space-y-2 text-sm">
      {c && (
        <div className="flex justify-between">
          <span>
            {c.qty} NFC card{c.qty === 1 ? "" : "s"}
          </span>
          <span>{money(c.pence)}</span>
        </div>
      )}
      {s && (
        <div className="flex justify-between">
          <span>
            {s.qty} A5 stand{s.qty === 1 ? "" : "s"}
          </span>
          <span>{money(s.pence)}</span>
        </div>
      )}
      <div className="flex justify-between text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <Truck className="w-4 h-4" /> UK delivery
        </span>
        <span>Free</span>
      </div>
      <div className="flex justify-between border-t border-border pt-2 font-extrabold text-lg">
        <span>Total</span>
        <span>{money(total)}</span>
      </div>
    </div>
  );
}

function PayButton({
  ready,
  canPay,
  paying,
  total,
  onPay,
}: {
  ready: boolean | null;
  canPay: boolean;
  paying: boolean;
  total: number;
  onPay: () => void;
}) {
  if (ready === false)
    return (
      <a
        href="mailto:support@repsuites.com?subject=Review%20card%20order"
        className="mt-4 flex items-center justify-center rounded-xl bg-primary text-primary-foreground font-bold py-3.5"
      >
        Online payment opens soon. Email us to order
      </a>
    );
  return (
    <>
      <button
        type="button"
        onClick={onPay}
        disabled={!canPay || ready === null}
        className="mt-4 w-full flex items-center justify-center gap-2 rounded-xl bg-primary text-primary-foreground font-bold py-3.5 disabled:opacity-50"
      >
        {paying ? <Loader2 className="w-4 h-4 animate-spin" /> : <Lock className="w-4 h-4" />}
        Pay {money(total)} securely
      </button>
      <p className="mt-2 text-[11px] text-center text-muted-foreground">
        Card, Apple Pay or Google Pay via Stripe. Delivery address on the next page.
      </p>
    </>
  );
}
