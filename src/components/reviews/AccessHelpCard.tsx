// "Give us access" on the Settings tab: three plain ways to let RepSuites (or
// the Accelur8 team) work on a business's Google profile, plus the Accelur8
// tracker for chasing Google access requests. No em dashes in this copy.
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { ChevronDown, Copy, KeyRound, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { getAccessHelpFn, saveAccessHelpFn } from "../../lib/access-help.functions";
import { googleConnectUrlFn } from "../../lib/google-business.functions";
import { ACCESS_STATUSES, chaseOn, type AccessStatus } from "../../lib/access-help";

type Data = Extract<Awaited<ReturnType<typeof getAccessHelpFn>>, { ok: true }>;

function Step({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <li className="flex gap-2">
      <span className="shrink-0 w-5 h-5 rounded-full bg-primary/15 text-xs font-bold flex items-center justify-center">
        {n}
      </span>
      <span>{children}</span>
    </li>
  );
}

function Path({
  title,
  open,
  onToggle,
  children,
}: {
  title: string;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-border">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="w-full flex items-center justify-between gap-2 p-3 text-left text-sm font-semibold"
      >
        {title}
        <ChevronDown className={`w-4 h-4 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && <div className="px-3 pb-3 text-sm space-y-2">{children}</div>}
    </div>
  );
}

export function AccessHelpCard() {
  const load = useServerFn(getAccessHelpFn);
  const save = useServerFn(saveAccessHelpFn);
  const connect = useServerFn(googleConnectUrlFn);
  const [d, setD] = useState<Data | null>(null);
  const [open, setOpen] = useState<number | null>(null);
  const [t, setT] = useState<NonNullable<Data["tracker"]> | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    load()
      .then((r) => {
        if (r.ok) {
          setD(r);
          setT(r.tracker);
        }
      })
      .catch(() => null);
    // Opened from the welcome checklist ("let us do it for you").
    try {
      if (sessionStorage.getItem("open-access-help")) {
        sessionStorage.removeItem("open-access-help");
        setOpen(1);
        setTimeout(
          () => document.getElementById("access")?.scrollIntoView({ block: "start" }),
          300,
        );
      }
    } catch {
      // storage blocked: the card simply starts closed
    }
  }, [load]);

  if (!d) return null;
  const email = d.managerEmail;
  const today = new Date().toISOString().slice(0, 10);
  const chase = t ? chaseOn(t.status, t.requestedOn, today) : null;
  const day = (iso: string) =>
    new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-GB", {
      weekday: "short",
      day: "numeric",
      month: "short",
    });

  return (
    <section id="access" className="rounded-xl border border-border bg-card p-4 space-y-3">
      <div>
        <h3 className="font-bold flex items-center gap-1.5">
          <KeyRound className="w-4 h-4" /> Give us access to your Google profile
        </h3>
        <p className="text-xs text-muted-foreground mt-1">
          Pick the way that suits you. You always stay the owner of your Google profile. We only
          help to run it, and you can remove us at any time.
        </p>
      </div>

      <Path
        title="1. Connect Google here (quickest)"
        open={open === 0}
        onToggle={() => setOpen(open === 0 ? null : 0)}
      >
        <p>Sign in with the Google account you use for your business profile. It takes 1 minute.</p>
        <button
          type="button"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            const r = await connect().catch(() => null);
            if (r?.ok) window.location.href = r.url;
            else {
              setBusy(false);
              toast.error((r && !r.ok && r.error) || "Could not start. Try again.");
            }
          }}
          className="rounded-lg bg-primary text-primary-foreground px-3 py-2 font-bold inline-flex items-center gap-1.5 disabled:opacity-50"
        >
          {busy && <Loader2 className="w-4 h-4 animate-spin" />} Connect Google
        </button>
      </Path>

      <Path
        title="2. Add us as a manager (best if we run it for you)"
        open={open === 1}
        onToggle={() => setOpen(open === 1 ? null : 1)}
      >
        <ol className="space-y-1.5">
          <Step n={1}>Open Google Maps on your phone and go to your business profile.</Step>
          <Step n={2}>Tap the three dots, then Business Profile settings.</Step>
          <Step n={3}>Tap People and access, then Add.</Step>
          <Step n={4}>
            Type this email: <b className="break-all">{email}</b>{" "}
            <button
              type="button"
              onClick={async () => {
                await navigator.clipboard.writeText(email).catch(() => null);
                toast.success("Email copied");
              }}
              className="inline-flex items-center gap-1 text-xs font-semibold underline"
            >
              <Copy className="w-3 h-3" /> Copy
            </button>
          </Step>
          <Step n={5}>Choose Manager (not Owner), then Invite. That is it.</Step>
        </ol>
        <p className="text-xs text-muted-foreground">
          You stay the owner. A manager can reply to reviews and post updates, but cannot remove you
          or delete your profile.
        </p>
      </Path>

      <Path
        title="3. I do not know who controls my Google profile"
        open={open === 2}
        onToggle={() => setOpen(open === 2 ? null : 2)}
      >
        <p>
          This happens a lot. An old staff member, a past agency or a family member may have set it
          up. Google has a proper way to sort it:
        </p>
        <ol className="space-y-1.5">
          <Step n={1}>
            Go to{" "}
            <a
              href="https://business.google.com/add"
              target="_blank"
              rel="noopener"
              className="underline font-semibold"
            >
              business.google.com/add
            </a>{" "}
            and search for your business.
          </Step>
          <Step n={2}>
            If someone else controls it, Google shows Request access. Use your own Google email and
            choose Owner.
          </Step>
          <Step n={3}>Google emails whoever controls it now. They have up to 7 days to reply.</Step>
          <Step n={4}>
            If they approve, you are in. If nobody replies in 7 days, Google usually lets you claim
            it by checking you are the real business, often with a short video of your shop front,
            sign and inside.
          </Step>
          <Step n={5}>Once you are the owner, add us as a manager (way 2 above).</Step>
        </ol>
        <p className="text-xs text-muted-foreground">
          We are happy to help with this in person, including filming the short video.
        </p>
      </Path>

      {d.agency && t && (
        <div className="rounded-lg bg-muted/60 p-3 space-y-2 text-sm">
          <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
            Access help (Accelur8 team only)
          </p>
          <div className="grid sm:grid-cols-3 gap-2">
            <label className="text-xs space-y-1">
              <span>Status</span>
              <select
                value={t.status}
                onChange={(e) => setT({ ...t, status: e.target.value as AccessStatus })}
                className="w-full rounded-lg border border-input bg-background px-2 py-1.5 text-sm"
              >
                {ACCESS_STATUSES.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs space-y-1">
              <span>Request sent on</span>
              <input
                type="date"
                value={t.requestedOn ?? ""}
                onChange={(e) => setT({ ...t, requestedOn: e.target.value || null })}
                className="w-full min-w-0 rounded-lg border border-input bg-background px-2 py-1.5 text-sm"
              />
            </label>
            <label className="text-xs space-y-1">
              <span>Video check on</span>
              <input
                type="date"
                value={t.videoOn ?? ""}
                onChange={(e) => setT({ ...t, videoOn: e.target.value || null })}
                className="w-full min-w-0 rounded-lg border border-input bg-background px-2 py-1.5 text-sm"
              />
            </label>
          </div>
          <textarea
            value={t.note}
            onChange={(e) => setT({ ...t, note: e.target.value.slice(0, 1000) })}
            rows={2}
            placeholder="Notes, e.g. old agency controls it, owner asked them on Monday"
            className="w-full rounded-lg border border-input bg-background px-2 py-1.5 text-sm"
          />
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={async () => {
                const r = await save({ data: t }).catch(() => null);
                if (r?.ok) toast.success("Saved");
                else toast.error(r?.error ?? "Could not save.");
              }}
              className="rounded-lg bg-primary text-primary-foreground px-3 py-1.5 text-xs font-bold"
            >
              Save
            </button>
            {chase && (
              <span
                className={`text-xs ${chase <= today ? "text-destructive font-bold" : "text-muted-foreground"}`}
              >
                Chase on {day(chase)}
              </span>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
