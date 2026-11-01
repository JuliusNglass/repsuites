// Ask tab: "Ask past customers". Upload a CSV or paste a list, see who can
// be asked, pick a gentle daily rate and the wording, then start, pause or
// stop. Requests go through the normal queue (don't ask again window, quiet
// hours, opt-outs, unsubscribe link). Phone-only customers appear under
// Ready to send. No em dashes in this copy (AGENTS.md).
import { useCallback, useEffect, useId, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { History, Loader2, Pause, Play, Square, Upload } from "lucide-react";
import { toast } from "sonner";
import {
  getCampaignsFn,
  previewCampaignFn,
  startCampaignFn,
  updateCampaignFn,
} from "../../lib/campaigns.functions";
import {
  CAMPAIGN_MAX,
  CAMPAIGN_MESSAGE,
  CAMPAIGN_SUBJECT,
  RATE_DEFAULT,
  RATE_MAX,
  RATE_MIN,
  clampRate,
  parseContacts,
  type Contact,
  type PreviewCounts,
} from "../../lib/campaigns";
import { fillMessage } from "../../lib/review-requests";

type Data = Extract<Awaited<ReturnType<typeof getCampaignsFn>>, { ok: true }>;

const field =
  "w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40";

const STATUS: Record<string, string> = {
  running: "Running",
  paused: "Paused",
  stopped: "Stopped",
  finished: "Finished",
};

function n(x: number) {
  return x.toLocaleString("en-GB");
}

export function PastCustomersCard() {
  const load = useServerFn(getCampaignsFn);
  const preview = useServerFn(previewCampaignFn);
  const start = useServerFn(startCampaignFn);
  const update = useServerFn(updateCampaignFn);
  const ids = useId();
  const [d, setD] = useState<Data | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [contacts, setContacts] = useState<Contact[] | null>(null);
  const [unreadable, setUnreadable] = useState(0);
  const [counts, setCounts] = useState<PreviewCounts | null>(null);
  const [cooldown, setCooldown] = useState(90);
  const [rate, setRate] = useState(RATE_DEFAULT);
  const [message, setMessage] = useState(CAMPAIGN_MESSAGE);
  const [subject, setSubject] = useState(CAMPAIGN_SUBJECT);
  const [lawful, setLawful] = useState(false);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    const r = await load().catch(() => null);
    if (r?.ok) setD(r);
    else setErr(r?.error ?? "Could not load.");
  }, [load]);
  useEffect(() => {
    void refresh();
  }, [refresh]);

  if (err) return <p className="text-sm text-destructive">{err}</p>;
  if (!d) return null;

  const c = d.campaign;
  const active = c && (c.status === "running" || c.status === "paused");

  async function readFile(f: File | undefined) {
    if (!f) return;
    if (f.size > 2_000_000) {
      toast.error("That file is too big. Keep it under 2 MB.");
      return;
    }
    setText(await f.text());
    setContacts(null);
    setCounts(null);
  }

  async function check() {
    const r = parseContacts(text);
    setUnreadable(r.unreadable);
    if (!r.contacts.length) {
      toast.error("We could not find any email addresses or phone numbers in that list.");
      return;
    }
    const list = r.contacts.slice(0, 5000);
    setBusy(true);
    const p = await preview({ data: { contacts: list } }).catch(() => null);
    setBusy(false);
    if (p?.ok) {
      setContacts(list);
      setCounts(p.counts);
      setCooldown(p.cooldownDays);
    } else toast.error(p?.error ?? "Could not check the list.");
  }

  async function go() {
    if (!contacts || !counts) return;
    if (!message.includes("{link}")) {
      toast.error("Keep {link} in the message.");
      return;
    }
    setBusy(true);
    const r = await start({
      data: {
        contacts,
        dailyRate: clampRate(rate),
        message,
        emailSubject: subject,
        lawfulBasis: lawful,
      },
    }).catch(() => null);
    setBusy(false);
    if (r?.ok) {
      toast.success(
        `Started. ${n(r.total)} past customers will be asked, about ${n(clampRate(rate))} a day.`,
      );
      setOpen(false);
      setText("");
      setContacts(null);
      setCounts(null);
      setLawful(false);
      await refresh();
    } else toast.error(r?.error ?? "Could not start.");
  }

  async function set(status: "running" | "paused" | "stopped") {
    if (!c) return;
    if (
      status === "stopped" &&
      !window.confirm("Stop this campaign? Customers not asked yet will not be asked.")
    )
      return;
    setBusy(true);
    const r = await update({ data: { id: c.id, status } }).catch(() => null);
    setBusy(false);
    if (!r?.ok) toast.error(r?.error ?? "Could not save.");
    await refresh();
  }

  async function changeRate(v: number) {
    if (!c) return;
    const r = await update({ data: { id: c.id, dailyRate: clampRate(v) } }).catch(() => null);
    if (r?.ok) toast.success(`Now about ${clampRate(v)} a day`);
    else toast.error(r?.error ?? "Could not save.");
    await refresh();
  }

  const days = counts?.ready ? Math.ceil(counts.ready / clampRate(rate)) : 0;
  const sample = fillMessage(message, {
    name: contacts?.[0]?.name || "Jane",
    business: d.business,
    link: "https://repsuites.com/q/...",
  });

  return (
    <section
      className="rounded-xl border border-border bg-card p-4 space-y-3"
      aria-labelledby={`${ids}-title`}
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 id={`${ids}-title`} className="font-bold flex items-center gap-1.5">
            <History className="w-4 h-4" aria-hidden="true" /> Ask past customers
          </h3>
          <p className="text-xs text-muted-foreground">
            Have a list of past customers but only a few reviews? Upload it and we ask a few each
            day, so it feels personal and stays safe for your email.
          </p>
        </div>
        {!c && !open && (
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="shrink-0 rounded-lg border border-border px-3 py-2 text-xs font-semibold"
          >
            Start
          </button>
        )}
      </div>

      {c && progressBlock()}

      {open && !active && (
        <div className="space-y-3 text-sm">
          <div className="space-y-1">
            <label htmlFor={`${ids}-file`} className="text-xs font-semibold block">
              1. Upload a CSV file, or paste your list below
            </label>
            <input
              id={`${ids}-file`}
              type="file"
              accept=".csv,.txt,text/csv,text/plain"
              onChange={(e) => void readFile(e.target.files?.[0])}
              className="block text-xs"
            />
            <p className="text-[11px] text-muted-foreground">
              Columns: name, email, phone, last job date (optional). A header row helps but is not
              needed. Up to {n(CAMPAIGN_MAX)} customers per campaign.
            </p>
            <label htmlFor={`${ids}-paste`} className="sr-only">
              Paste your list
            </label>
            <textarea
              id={`${ids}-paste`}
              value={text}
              onChange={(e) => {
                setText(e.target.value);
                setContacts(null);
                setCounts(null);
              }}
              rows={5}
              placeholder={
                "name,email,phone,last job date\nJane Smith,jane@example.com,07700 900123,14/03/2025"
              }
              className={`${field} font-mono text-xs`}
            />
            <button
              type="button"
              disabled={busy || !text.trim()}
              onClick={() => void check()}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs font-semibold disabled:opacity-50"
            >
              {busy ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
              ) : (
                <Upload className="w-3.5 h-3.5" aria-hidden="true" />
              )}
              Check the list
            </button>
          </div>

          {counts && (
            <div className="space-y-3">
              <div className="rounded-lg bg-muted/50 p-3" role="status">
                <p className="text-xs font-semibold mb-2">
                  {n(counts.ready)} of {n(counts.rows + unreadable)} can be asked
                </p>
                <dl className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-1 text-xs">
                  {(
                    [
                      ["By email", counts.validEmails],
                      ["Phone only (you tap to send)", counts.phoneOnly],
                      ["Listed twice", counts.duplicates],
                      [`Asked in the last ${cooldown} days`, counts.askedRecently],
                      ["Unsubscribed", counts.unsubscribed],
                      ["No usable email or phone", counts.badEmails + unreadable],
                      ...(counts.overCap
                        ? [[`Over the ${n(CAMPAIGN_MAX)} limit`, counts.overCap]]
                        : []),
                    ] as [string, number][]
                  ).map(([label, v]) => (
                    <div key={label} className="flex justify-between gap-2">
                      <dt className="text-muted-foreground">{label}</dt>
                      <dd className="font-semibold tabular-nums">{n(v)}</dd>
                    </div>
                  ))}
                </dl>
              </div>

              <div className="space-y-1">
                <label htmlFor={`${ids}-rate`} className="text-xs font-semibold block">
                  2. How many to ask each day ({RATE_MIN} to {RATE_MAX})
                </label>
                <input
                  id={`${ids}-rate`}
                  type="number"
                  min={RATE_MIN}
                  max={RATE_MAX}
                  step={5}
                  value={rate}
                  onChange={(e) => setRate(Number(e.target.value))}
                  onBlur={() => setRate(clampRate(rate))}
                  className={`${field} max-w-[8rem]`}
                />
                <p className="text-[11px] text-muted-foreground">
                  {counts.ready
                    ? `At ${clampRate(rate)} a day this takes about ${days} day${days === 1 ? "" : "s"}. `
                    : ""}
                  Fewer a day is gentler and safer. Nothing goes out in your quiet hours.
                </p>
              </div>

              <div className="space-y-1">
                <label htmlFor={`${ids}-msg`} className="text-xs font-semibold block">
                  3. Your message
                </label>
                <textarea
                  id={`${ids}-msg`}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  rows={3}
                  maxLength={600}
                  className={field}
                />
                <label htmlFor={`${ids}-subj`} className="text-xs font-semibold block">
                  Email subject
                </label>
                <input
                  id={`${ids}-subj`}
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  maxLength={150}
                  className={field}
                />
                <p className="text-[11px] text-muted-foreground">
                  {"{name}"} becomes their first name, {"{business}"} your business name and{" "}
                  {"{link}"} their review link. Every email has an unsubscribe link. Reminders
                  follow your Ask settings.
                </p>
                <p className="text-xs rounded-lg border border-border p-2">
                  <span className="font-semibold">Preview: </span>
                  {sample}
                </p>
              </div>

              <label className="flex items-start gap-2 text-xs">
                <input
                  type="checkbox"
                  checked={lawful}
                  onChange={(e) => setLawful(e.target.checked)}
                  className="mt-0.5"
                />
                <span>
                  These are all real past customers of {d.business}, and I am allowed to contact
                  them (for example, they gave me their details when they used us and have not asked
                  me to stop).
                </span>
              </label>

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={busy || !lawful || !counts.ready}
                  onClick={() => void go()}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-primary text-primary-foreground px-3 py-2 text-xs font-bold disabled:opacity-50"
                >
                  {busy ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
                  ) : (
                    <Play className="w-3.5 h-3.5" aria-hidden="true" />
                  )}
                  Start asking {n(counts.ready)} customers
                </button>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="rounded-lg border border-border px-3 py-2 text-xs font-semibold"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
          <p className="text-[11px] text-muted-foreground">
            We stop by ourselves if more than 5 in 100 emails bounce, or more than 2 in 100 people
            unsubscribe, in a day, and tell you why.
          </p>
        </div>
      )}
    </section>
  );

  function progressBlock() {
    if (!c) return null;
    const p = d!.progress;
    return (
      <div className="rounded-lg border border-border p-3 space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
          <p>
            <span className="font-semibold">{STATUS[c.status] ?? c.status}</span>
            <span className="text-muted-foreground">
              {" "}
              · {n(c.total)} customers, about {c.dailyRate} a day · started{" "}
              {new Date(c.createdAt).toLocaleDateString("en-GB", {
                day: "numeric",
                month: "short",
              })}
            </span>
          </p>
          {active && (
            <div className="flex flex-wrap gap-2">
              {c.status === "running" ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void set("paused")}
                  className="inline-flex items-center gap-1 rounded-lg border border-border px-3 py-1.5 text-xs font-semibold disabled:opacity-50"
                >
                  <Pause className="w-3.5 h-3.5" aria-hidden="true" /> Pause
                </button>
              ) : (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void set("running")}
                  className="inline-flex items-center gap-1 rounded-lg border border-border px-3 py-1.5 text-xs font-semibold disabled:opacity-50"
                >
                  <Play className="w-3.5 h-3.5" aria-hidden="true" /> Resume
                </button>
              )}
              <button
                type="button"
                disabled={busy}
                onClick={() => void set("stopped")}
                className="inline-flex items-center gap-1 rounded-lg border border-border px-3 py-1.5 text-xs font-semibold disabled:opacity-50"
              >
                <Square className="w-3.5 h-3.5" aria-hidden="true" /> Stop
              </button>
            </div>
          )}
        </div>
        {c.stopReason && c.status !== "running" && (
          <p
            className={`text-xs ${c.stopReason.startsWith("Stopped automatically") ? "text-destructive" : "text-muted-foreground"}`}
            role="status"
          >
            {c.stopReason}
          </p>
        )}
        {p && (
          <dl className="grid grid-cols-3 sm:grid-cols-5 gap-2 text-center">
            {(
              [
                ["Waiting", p.waiting],
                ["Queued", p.queued],
                ["Sent", p.sent],
                ["Clicked", p.clicked],
                ["Reviewed", p.reviewed],
              ] as const
            ).map(([label, v]) => (
              <div key={label} className="rounded-lg bg-muted/50 py-2">
                <dd className="text-lg font-bold tabular-nums">{n(v)}</dd>
                <dt className="text-[11px] text-muted-foreground">{label}</dt>
              </div>
            ))}
          </dl>
        )}
        {p && p.skipped > 0 && (
          <p className="text-[11px] text-muted-foreground">
            {n(p.skipped)} skipped at send time (asked recently or unsubscribed).
          </p>
        )}
        {active && (
          <label className="flex items-center gap-2 text-xs">
            <span>Ask about</span>
            <select
              value={c.dailyRate}
              onChange={(e) => void changeRate(Number(e.target.value))}
              className="rounded-lg border border-input bg-background px-2 py-1 text-xs"
            >
              {[...new Set([10, 15, 25, 40, 50, 75, 100, c.dailyRate])]
                .sort((a, b) => a - b)
                .map((v) => (
                  <option key={v} value={v}>
                    {v}
                  </option>
                ))}
            </select>
            <span>a day</span>
          </label>
        )}
        {!active && !open && (
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="text-xs font-semibold underline"
          >
            Start a new campaign
          </button>
        )}
      </div>
    );
  }
}
