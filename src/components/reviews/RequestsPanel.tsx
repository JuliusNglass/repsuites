// Ask for reviews: add customers, send WhatsApp / text from your own phone
// with one tap (free, works in any country), or let RepSuites email them.
// Requests can also start automatically from a webhook (job done, invoice
// paid). Reminders stop when the customer taps a review site, leaves private
// feedback, leaves a matching Google review or unsubscribes.
// No em dashes in this copy (AGENTS.md).
import { useCallback, useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  Copy,
  Loader2,
  Mail,
  RefreshCw,
  Zap,
  MessageCircle,
  MessageSquare,
  Settings2,
  Trash2,
  UserPlus,
} from "lucide-react";
import { toast } from "sonner";
import {
  addRequestsFn,
  getRequestsFn,
  markSentFn,
  rotateTriggerUrlFn,
  saveRequestSettingsFn,
  stopRequestFn,
} from "../../lib/review-requests.functions";
import {
  COOLDOWN_CHOICES,
  COUNTRIES,
  fillMessage,
  last30Counts,
  requestChips,
  looksLikeEmail,
  parseLine,
  smsLink,
  whatsappLink,
  type Channel,
} from "../../lib/review-requests";

type Data = Extract<Awaited<ReturnType<typeof getRequestsFn>>, { ok: true }>;
type Req = Data["requests"][number];

const field =
  "w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40";

const CHIP: Record<string, string> = {
  Sent: "bg-slate-100 text-slate-700",
  "To send": "bg-amber-50 text-amber-800",
  Opened: "bg-sky-50 text-sky-800",
  "Clicked review link": "bg-emerald-50 text-emerald-800",
  "Left feedback": "bg-violet-50 text-violet-800",
  Reviewed: "bg-emerald-100 text-emerald-900",
  "Reminder 1 sent": "bg-slate-100 text-slate-600",
  "Reminder 2 sent": "bg-slate-100 text-slate-600",
  Unsubscribed: "bg-rose-50 text-rose-800",
  Stopped: "bg-slate-100 text-slate-500",
  "Skipped: asked recently": "bg-amber-50 text-amber-800",
  "Skipped: unsubscribed": "bg-rose-50 text-rose-800",
};

// The fields to map in GoHighLevel's Webhook step (Custom Data).
const GHL_FIELDS: [string, string][] = [
  ["name", "{{contact.first_name}} {{contact.last_name}}"],
  ["email", "{{contact.email}}"],
  ["phone", "{{contact.phone}}"],
  ["event", "invoice_paid"],
  ["external_id", "the invoice or job number (pick it from the merge field list)"],
];

function hourLabel(h: number) {
  const ap = h < 12 ? "am" : "pm";
  const n = h % 12 === 0 ? 12 : h % 12;
  return `${n}${ap}`;
}

async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success("Copied");
  } catch {
    toast.error("Could not copy. Select the text and copy it.");
  }
}

function when(iso: string) {
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

export function RequestsPanel() {
  const load = useServerFn(getRequestsFn);
  const add = useServerFn(addRequestsFn);
  const markSent = useServerFn(markSentFn);
  const stop = useServerFn(stopRequestFn);
  const save = useServerFn(saveRequestSettingsFn);
  const rotate = useServerFn(rotateTriggerUrlFn);
  const [showAuto, setShowAuto] = useState(false);
  const [d, setD] = useState<Data | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [contact, setContact] = useState("");
  const [channel, setChannel] = useState<Channel>("whatsapp");
  const [sendNow, setSendNow] = useState(true);
  const [paste, setPaste] = useState("");
  const [showPaste, setShowPaste] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [busy, setBusy] = useState(false);
  const [s, setS] = useState<Data["settings"] | null>(null);

  const refresh = useCallback(async () => {
    const r = await load();
    if (r.ok) {
      setD(r);
      setS((cur) => cur ?? r.settings);
    } else setErr(r.error);
  }, [load]);
  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Choose email automatically when an email address is typed.
  useEffect(() => {
    if (looksLikeEmail(contact)) setChannel("email");
    else if (channel === "email" && /^[+\d]/.test(contact.trim())) setChannel("whatsapp");
  }, [contact]); // eslint-disable-line react-hooks/exhaustive-deps

  const now = Date.now();
  const toSend = useMemo(
    () =>
      (d?.requests ?? []).filter(
        (r) =>
          r.channel !== "email" &&
          (r.status === "due" || r.status === "waiting") &&
          Date.parse(r.dueAt) <= now,
      ),
    [d, now],
  );
  const counts = useMemo(() => last30Counts(d?.requests ?? [], new Date()), [d]);

  if (err) return <p className="text-sm text-destructive">{err}</p>;
  if (!d || !s) return <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />;

  function textFor(r: Req) {
    return fillMessage(r.step === 0 ? d!.settings.message : d!.settings.reminderMessage, {
      name: r.name,
      business: d!.business,
      link: r.link,
    });
  }

  async function addOne() {
    const c = contact.trim();
    if (!c) return;
    const isEmail = looksLikeEmail(c);
    if (channel === "email" && !isEmail) {
      toast.error("Add an email address to send by email.");
      return;
    }
    setBusy(true);
    const r = await add({
      data: {
        people: [{ name, phone: isEmail ? null : c, email: isEmail ? c : null, channel }],
        sendNow,
      },
    }).catch(() => null);
    setBusy(false);
    if (r?.ok && r.skipped) {
      toast.message("Skipped: this customer was asked recently or unsubscribed");
      setName("");
      setContact("");
      await refresh();
    } else if (r?.ok) {
      toast.success(
        channel === "email"
          ? sendNow
            ? "We will email them in the next few minutes"
            : "Added. We will email them later"
          : sendNow
            ? "Added. Tap WhatsApp or Text below to send it"
            : "Added. It will appear below when it is time to send",
      );
      setName("");
      setContact("");
      await refresh();
    } else toast.error(r?.error ?? "Could not add.");
  }

  async function addPasted() {
    const people = paste
      .split(/\r?\n/)
      .map(parseLine)
      .filter((p): p is NonNullable<ReturnType<typeof parseLine>> => !!p)
      .map((p) => ({
        name: p.name,
        phone: p.phone,
        email: p.email,
        channel: (p.phone ? "whatsapp" : "email") as Channel,
      }));
    if (!people.length) {
      toast.error("Put one customer per line: name, then phone or email.");
      return;
    }
    setBusy(true);
    const r = await add({ data: { people, sendNow } }).catch(() => null);
    setBusy(false);
    if (r?.ok) {
      toast.success(
        `${r.added} customer${r.added === 1 ? "" : "s"} added` +
          (r.skipped ? `, ${r.skipped} skipped (asked recently or unsubscribed)` : ""),
      );
      setPaste("");
      setShowPaste(false);
      await refresh();
    } else toast.error(r?.error ?? "Could not add.");
  }

  async function sent(r: Req, how: "whatsapp" | "sms") {
    const text = textFor(r);
    const url =
      how === "whatsapp"
        ? whatsappLink(r.phone, d!.settings.countryCode, text)
        : smsLink(r.phone, d!.settings.countryCode, text);
    if (!url) {
      toast.error("That phone number does not look right.");
      return;
    }
    window.open(url, "_blank", "noopener");
    await markSent({ data: { id: r.id } }).catch(() => null);
    await refresh();
  }

  async function newAddress() {
    if (!window.confirm("Make a new address? The old one will stop working.")) return;
    const r = await rotate().catch(() => null);
    if (r?.ok) {
      toast.success("New address ready. Update it in your other tools.");
      await refresh();
    } else toast.error(r?.error ?? "Could not make a new address.");
  }

  async function saveSettings() {
    setBusy(true);
    const r = await save({ data: s }).catch((e: unknown) => ({
      ok: false as const,
      error:
        e instanceof Error && e.message.includes("{link}")
          ? "Keep {link} in each message."
          : "Check the settings.",
    }));
    setBusy(false);
    if (r.ok) {
      toast.success("Saved");
      setShowSettings(false);
      await refresh();
    } else toast.error(r.error);
  }

  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-border bg-card p-4 space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h3 className="font-bold">Ask a customer for a review</h3>
            <p className="text-xs text-muted-foreground">
              WhatsApp and text messages open on your phone, ready to send. Free, and they come from
              your own number. Emails go automatically.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowSettings((v) => !v)}
            className="shrink-0 rounded-lg border border-border p-2"
            aria-label="Message settings"
          >
            <Settings2 className="w-4 h-4" />
          </button>
        </div>
        <div className="grid sm:grid-cols-[1fr_1.3fr_auto] gap-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Customer name"
            className={field}
          />
          <input
            value={contact}
            onChange={(e) => setContact(e.target.value)}
            placeholder="Mobile number or email"
            className={field}
            inputMode="email"
          />
          <select
            value={channel}
            onChange={(e) => setChannel(e.target.value as Channel)}
            className={field}
            aria-label="Send by"
          >
            <option value="whatsapp">WhatsApp</option>
            <option value="sms">Text</option>
            <option value="email">Email</option>
          </select>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <label className="flex items-center gap-2 text-xs">
            <input
              type="checkbox"
              checked={sendNow}
              onChange={(e) => setSendNow(e.target.checked)}
            />
            Ask now (untick to wait {d.settings.firstDelayHours} hour
            {d.settings.firstDelayHours === 1 ? "" : "s"})
          </label>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setShowPaste((v) => !v)}
              className="rounded-lg border border-border px-3 py-2 text-xs font-semibold"
            >
              Paste a list
            </button>
            <button
              type="button"
              disabled={busy || !contact.trim()}
              onClick={() => void addOne()}
              className="inline-flex items-center gap-1.5 rounded-lg bg-primary text-primary-foreground px-3 py-2 text-xs font-bold disabled:opacity-50"
            >
              {busy ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <UserPlus className="w-3.5 h-3.5" />
              )}
              Add
            </button>
          </div>
        </div>
        {showPaste && (
          <div className="space-y-2">
            <textarea
              value={paste}
              onChange={(e) => setPaste(e.target.value)}
              rows={5}
              placeholder={
                "One customer per line, for example:\nJane Smith, 07700 900123\nTom, tom@example.com"
              }
              className={field}
            />
            <button
              type="button"
              disabled={busy || !paste.trim()}
              onClick={() => void addPasted()}
              className="rounded-lg bg-primary text-primary-foreground px-3 py-2 text-xs font-bold disabled:opacity-50"
            >
              Add these customers
            </button>
          </div>
        )}
        <p className="text-[11px] text-muted-foreground">
          Ask every customer, not only the happy ones, and never offer anything in return. Google
          does not allow either.
        </p>
      </section>

      {showSettings && (
        <section className="rounded-xl border border-border bg-card p-4 space-y-3 text-sm">
          <h3 className="font-bold">Message settings</h3>
          <div className="grid sm:grid-cols-2 gap-3">
            <label className="space-y-1">
              <span className="text-xs font-semibold">Your country (for phone numbers)</span>
              <select
                value={s.countryCode}
                onChange={(e) => setS({ ...s, countryCode: e.target.value })}
                className={field}
              >
                {COUNTRIES.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1">
              <span className="text-xs font-semibold">
                Wait before asking (also for automatic requests)
              </span>
              <select
                value={s.firstDelayHours}
                onChange={(e) => setS({ ...s, firstDelayHours: Number(e.target.value) })}
                className={field}
              >
                {[1, 2, 4, 24, 48].map((h) => (
                  <option key={h} value={h}>
                    {h < 24
                      ? `${h} hour${h === 1 ? "" : "s"}`
                      : `${h / 24} day${h === 24 ? "" : "s"}`}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1">
              <span className="text-xs font-semibold">Don't ask the same customer again for</span>
              <select
                value={s.cooldownDays}
                onChange={(e) =>
                  setS({ ...s, cooldownDays: Number(e.target.value) as 60 | 90 | 180 })
                }
                className={field}
              >
                {COOLDOWN_CHOICES.map((n) => (
                  <option key={n} value={n}>
                    {n} days
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1">
              <span className="text-xs font-semibold">
                Reminders for customers who have not reviewed
              </span>
              <select
                value={s.maxReminders}
                onChange={(e) => setS({ ...s, maxReminders: Number(e.target.value) })}
                className={field}
              >
                <option value={0}>None</option>
                <option value={1}>1 reminder</option>
                <option value={2}>2 reminders</option>
              </select>
            </label>
            {s.maxReminders >= 1 && (
              <label className="space-y-1">
                <span className="text-xs font-semibold">Reminder 1, days after the first ask</span>
                <select
                  value={s.reminder1Days}
                  onChange={(e) => {
                    const v = Number(e.target.value);
                    setS({
                      ...s,
                      reminder1Days: v,
                      reminderDays: v,
                      reminder2Days: Math.max(s.reminder2Days, v + 1),
                    });
                  }}
                  className={field}
                >
                  {[1, 2, 3, 4, 5, 7, 10, 14].map((n) => (
                    <option key={n} value={n}>
                      Day {n}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {s.maxReminders >= 2 && (
              <label className="space-y-1">
                <span className="text-xs font-semibold">Reminder 2, days after the first ask</span>
                <select
                  value={s.reminder2Days}
                  onChange={(e) => setS({ ...s, reminder2Days: Number(e.target.value) })}
                  className={field}
                >
                  {[3, 5, 7, 10, 14, 21, 30]
                    .filter((n) => n > s.reminder1Days)
                    .map((n) => (
                      <option key={n} value={n}>
                        Day {n}
                      </option>
                    ))}
                </select>
              </label>
            )}
            <label className="space-y-1">
              <span className="text-xs font-semibold">Quiet hours: no emails from</span>
              <div className="flex items-center gap-2">
                <select
                  value={s.quietStart}
                  onChange={(e) => setS({ ...s, quietStart: Number(e.target.value) })}
                  className={field}
                  aria-label="Quiet hours start"
                >
                  {Array.from({ length: 24 }, (_, h) => (
                    <option key={h} value={h}>
                      {hourLabel(h)}
                    </option>
                  ))}
                </select>
                <span className="text-xs">to</span>
                <select
                  value={s.quietEnd}
                  onChange={(e) => setS({ ...s, quietEnd: Number(e.target.value) })}
                  className={field}
                  aria-label="Quiet hours end"
                >
                  {Array.from({ length: 24 }, (_, h) => (
                    <option key={h} value={h}>
                      {hourLabel(h)}
                    </option>
                  ))}
                </select>
              </div>
            </label>
          </div>
          <p className="text-[11px] text-muted-foreground">
            Reminders stop as soon as the customer taps a review site, sends private feedback,
            leaves a Google review under the same name (when Google is connected) or unsubscribes.
            If they only opened the link, we skip straight to the last reminder.
          </p>
          <label className="space-y-1 block">
            <span className="text-xs font-semibold">First message</span>
            <textarea
              value={s.message}
              onChange={(e) => setS({ ...s, message: e.target.value })}
              rows={3}
              className={field}
            />
          </label>
          <label className="space-y-1 block">
            <span className="text-xs font-semibold">Reminder</span>
            <textarea
              value={s.reminderMessage}
              onChange={(e) => setS({ ...s, reminderMessage: e.target.value })}
              rows={3}
              className={field}
            />
          </label>
          <label className="space-y-1 block">
            <span className="text-xs font-semibold">Email subject</span>
            <input
              value={s.emailSubject}
              onChange={(e) => setS({ ...s, emailSubject: e.target.value })}
              className={field}
            />
          </label>
          <p className="text-[11px] text-muted-foreground">
            {"{name}"} becomes the customer's first name, {"{business}"} your business name and{" "}
            {"{link}"} their personal review link. Keep {"{link}"} in each message.
          </p>
          <button
            type="button"
            disabled={busy}
            onClick={() => void saveSettings()}
            className="rounded-lg bg-primary text-primary-foreground px-3 py-2 text-xs font-bold disabled:opacity-50"
          >
            Save settings
          </button>
        </section>
      )}

      <section className="rounded-xl border border-border bg-card p-4 space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h3 className="font-bold flex items-center gap-1.5">
              <Zap className="w-4 h-4" /> Ask automatically
            </h3>
            <p className="text-xs text-muted-foreground">
              Send a review request when a job is done or an invoice is paid. We wait{" "}
              {d.settings.firstDelayHours} hour{d.settings.firstDelayHours === 1 ? "" : "s"}, and
              never send between {hourLabel(d.settings.quietStart)} and{" "}
              {hourLabel(d.settings.quietEnd)}.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowAuto((v) => !v)}
            className="shrink-0 rounded-lg border border-border px-3 py-2 text-xs font-semibold"
          >
            {showAuto ? "Hide" : "Set up"}
          </button>
        </div>
        {showAuto && (
          <div className="space-y-3 text-sm">
            {d.triggerUrl ? (
              <div className="space-y-1">
                <span className="text-xs font-semibold">Your private webhook address</span>
                <div className="flex gap-2">
                  <input readOnly value={d.triggerUrl} className={`${field} font-mono text-xs`} />
                  <button
                    type="button"
                    onClick={() => void copyText(d.triggerUrl!)}
                    className="shrink-0 inline-flex items-center gap-1 rounded-lg border border-border px-3 text-xs font-semibold"
                  >
                    <Copy className="w-3.5 h-3.5" /> Copy
                  </button>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Keep it private: anyone with it can add requests.{" "}
                  <button type="button" onClick={() => void newAddress()} className="underline">
                    <RefreshCw className="inline w-3 h-3" /> Make a new address
                  </button>
                </p>
              </div>
            ) : (
              <p className="text-xs text-destructive">Could not make your address. Refresh.</p>
            )}
            <div className="rounded-lg bg-muted/50 p-3 space-y-2">
              <p className="text-xs font-semibold">GoHighLevel</p>
              <p className="text-xs">
                In GoHighLevel, add a Webhook step to your 'Invoice paid' or 'Job won' workflow
                pointing at this address. Method POST. Under Custom Data, add these:
              </p>
              <ul className="space-y-1">
                {GHL_FIELDS.map(([k, v]) => (
                  <li key={k} className="flex items-center gap-2 text-xs">
                    <code className="w-24 shrink-0 font-semibold">{k}</code>
                    <code className="min-w-0 flex-1 truncate text-muted-foreground">{v}</code>
                    {v.startsWith("{{") || !v.includes(" ") ? (
                      <button
                        type="button"
                        aria-label={`Copy ${k}`}
                        onClick={() => void copyText(v)}
                        className="shrink-0 text-muted-foreground"
                      >
                        <Copy className="w-3.5 h-3.5" />
                      </button>
                    ) : null}
                  </li>
                ))}
              </ul>
              <p className="text-[11px] text-muted-foreground">
                For a 'Job won' workflow, set event to job_done. The external_id stops the same job
                or invoice asking twice.
              </p>
            </div>
            <div className="rounded-lg bg-muted/50 p-3 space-y-1">
              <p className="text-xs font-semibold">Zapier, Make or anything else</p>
              <p className="text-xs">
                Send a POST to the address, as JSON or a form, with name, email, phone (optional),
                event (job_done, invoice_paid or manual) and external_id (optional).
              </p>
              <pre className="overflow-x-auto rounded bg-background p-2 text-[11px]">
                {`{"name":"Jane Smith","email":"jane@example.com","phone":"07700 900123","event":"invoice_paid","external_id":"INV-1042"}`}
              </pre>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Customers with an email get an email. Customers with only a phone number appear under
              Ready to send for a one tap WhatsApp or text. Anyone asked in the last{" "}
              {d.settings.cooldownDays} days, or who unsubscribed, is skipped.
            </p>
          </div>
        )}
      </section>

      <section className="rounded-xl border border-border bg-card p-4">
        <h3 className="font-bold text-sm mb-2">Last 30 days</h3>
        <dl className="grid grid-cols-3 sm:grid-cols-6 gap-2 text-center">
          {(
            [
              ["Sent", counts.sent],
              ["Opened", counts.opened],
              ["Clicked", counts.clicked],
              ["Feedback", counts.feedback],
              ["Reviewed", counts.reviewed],
              ["Skipped", counts.skipped],
            ] as const
          ).map(([label, n]) => (
            <div key={label} className="rounded-lg bg-muted/50 py-2">
              <dd className="text-lg font-bold tabular-nums">{n}</dd>
              <dt className="text-[11px] text-muted-foreground">{label}</dt>
            </div>
          ))}
        </dl>
      </section>

      <section className="rounded-xl border border-border bg-card p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-bold">Ready to send ({toSend.length})</h3>
        </div>
        {toSend.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nothing waiting. Reminders appear here when they are due.
          </p>
        ) : (
          <ul className="space-y-2">
            {toSend.map((r) => (
              <li key={r.id} className="rounded-lg border border-border p-3 space-y-2">
                <div className="flex items-center justify-between gap-2 text-sm">
                  <span className="font-semibold truncate">{r.name || r.phone}</span>
                  <span className="text-[11px] text-muted-foreground shrink-0">
                    {r.step === 0 ? "First ask" : `Reminder ${r.step}`}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground line-clamp-2">{textFor(r)}</p>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => void sent(r, "whatsapp")}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-[#25d366] text-white px-3 py-1.5 text-xs font-bold"
                  >
                    <MessageCircle className="w-3.5 h-3.5" /> WhatsApp
                  </button>
                  <button
                    type="button"
                    onClick={() => void sent(r, "sms")}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-semibold"
                  >
                    <MessageSquare className="w-3.5 h-3.5" /> Text
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      void stop({ data: { id: r.id, remove: false } }).then(() => refresh())
                    }
                    className="text-xs text-muted-foreground px-2"
                  >
                    Skip
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-xl border border-border bg-card p-4 space-y-2">
        <h3 className="font-bold">Recent requests</h3>
        {d.requests.length === 0 ? (
          <p className="text-sm text-muted-foreground">No requests yet.</p>
        ) : (
          <ul className="divide-y divide-border">
            {d.requests.slice(0, 50).map((r) => {
              const chips = requestChips(r);
              return (
                <li key={r.id} className="flex items-center justify-between gap-2 py-2 text-sm">
                  <div className="min-w-0">
                    <div className="font-medium truncate flex items-center gap-1.5">
                      {r.channel === "email" ? (
                        <Mail className="w-3.5 h-3.5 text-muted-foreground" />
                      ) : (
                        <MessageCircle className="w-3.5 h-3.5 text-muted-foreground" />
                      )}
                      {r.name || r.email || r.phone}
                    </div>
                    <div className="text-[11px] text-muted-foreground">
                      Added {when(r.createdAt)}
                      {r.source === "webhook"
                        ? r.event === "invoice_paid"
                          ? " (invoice paid)"
                          : r.event === "job_done"
                            ? " (job done)"
                            : " (automatic)"
                        : ""}
                      {r.lastSentAt ? `, last asked ${when(r.lastSentAt)}` : ""}
                      {!r.lastSentAt && r.status === "due" && r.channel === "email"
                        ? `, sends ${new Date(r.dueAt).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}`
                        : ""}
                      {r.error ? `. ${r.error}` : ""}
                    </div>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {chips.map((c) => (
                        <span
                          key={c}
                          className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${CHIP[c] ?? "bg-slate-100 text-slate-600"}`}
                        >
                          {c}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      aria-label="Remove"
                      onClick={() =>
                        void stop({ data: { id: r.id, remove: true } }).then(() => refresh())
                      }
                      className="text-muted-foreground"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
