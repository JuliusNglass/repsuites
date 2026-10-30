// Ask for reviews: add customers, send WhatsApp / text from your own phone
// with one tap (free, works in any country), or let RepSuites email them.
// Reminders stop as soon as the customer opens their link.
// No em dashes in this copy (AGENTS.md).
import { useCallback, useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  Loader2,
  Mail,
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
  saveRequestSettingsFn,
  stopRequestFn,
} from "../../lib/review-requests.functions";
import {
  COUNTRIES,
  fillMessage,
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

const STATUS: Record<string, { label: string; cls: string }> = {
  due: { label: "To send", cls: "bg-amber-50 text-amber-800" },
  waiting: { label: "Asked", cls: "bg-slate-100 text-slate-700" },
  opened: { label: "Opened link", cls: "bg-emerald-50 text-emerald-800" },
  finished: { label: "Asked, no reply", cls: "bg-slate-100 text-slate-500" },
  stopped: { label: "Stopped", cls: "bg-slate-100 text-slate-500" },
};

function when(iso: string) {
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

export function RequestsPanel() {
  const load = useServerFn(getRequestsFn);
  const add = useServerFn(addRequestsFn);
  const markSent = useServerFn(markSentFn);
  const stop = useServerFn(stopRequestFn);
  const save = useServerFn(saveRequestSettingsFn);
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
  const stats = useMemo(() => {
    const all = d?.requests ?? [];
    const asked = all.filter((r) => r.lastSentAt).length;
    const opened = all.filter((r) => r.openedAt).length;
    return { asked, opened, rate: asked ? Math.round((opened / asked) * 100) : 0 };
  }, [d]);

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
    if (r?.ok) {
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
      toast.success(`${r.added} customer${r.added === 1 ? "" : "s"} added`);
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
              <span className="text-xs font-semibold">When not asking straight away, wait</span>
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
              <span className="text-xs font-semibold">Reminders if the link is not opened</span>
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
            <label className="space-y-1">
              <span className="text-xs font-semibold">Days between messages</span>
              <select
                value={s.reminderDays}
                onChange={(e) => setS({ ...s, reminderDays: Number(e.target.value) })}
                className={field}
              >
                {[2, 3, 5, 7].map((n) => (
                  <option key={n} value={n}>
                    {n} days
                  </option>
                ))}
              </select>
            </label>
          </div>
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
        <div className="flex items-center justify-between">
          <h3 className="font-bold">Ready to send ({toSend.length})</h3>
          <span className="text-xs text-muted-foreground">
            {stats.asked} asked, {stats.opened} opened ({stats.rate}%)
          </span>
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
              const st = STATUS[r.status] ?? STATUS["waiting"]!;
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
                      {r.lastSentAt ? `, last asked ${when(r.lastSentAt)}` : ""}
                      {r.error ? `. ${r.error}` : ""}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span
                      className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${st.cls}`}
                    >
                      {st.label}
                    </span>
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
