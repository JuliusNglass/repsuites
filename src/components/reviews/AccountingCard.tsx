// Connections: "Ask automatically when an invoice is paid". Connect
// QuickBooks Online, Xero or FreeAgent and every paid invoice queues a review
// request for that customer (same rules as the Ask tab). No Zapier needed.
// No em dashes in this copy (AGENTS.md).
import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Link2, Loader2, RefreshCw, Unplug } from "lucide-react";
import { toast } from "sonner";
import {
  accountingCheckNowFn,
  accountingConnectFn,
  accountingDisconnectFn,
  getAccountingFn,
} from "../../lib/accounting.functions";
import { PROVIDER_NAMES, isProvider, type Provider } from "../../lib/accounting";

type Data = Extract<Awaited<ReturnType<typeof getAccountingFn>>, { ok: true }>;

const RESULT: Record<string, string> = {
  connected: "Connected. Paid invoices from now on will ask for a review.",
  cancelled: "Connection cancelled. Nothing was changed.",
  expired: "That took too long. Please click Connect again.",
  noorg: "We could not find an organisation in that account. Please try again.",
  failed: "Could not connect. Please try again.",
};

function ago(iso: string | null): string {
  if (!iso) return "not yet";
  const mins = Math.round((Date.now() - Date.parse(iso)) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} minute${mins === 1 ? "" : "s"} ago`;
  const h = Math.round(mins / 60);
  if (h < 24) return `${h} hour${h === 1 ? "" : "s"} ago`;
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

export function AccountingCard() {
  const load = useServerFn(getAccountingFn);
  const connect = useServerFn(accountingConnectFn);
  const disconnect = useServerFn(accountingDisconnectFn);
  const checkNow = useServerFn(accountingCheckNowFn);
  const [d, setD] = useState<Data | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState<Provider | null>(null);

  const refresh = useCallback(async () => {
    const r = await load().catch(() => null);
    if (r?.ok) setD(r);
    else setErr(r?.error ?? "Could not load connections.");
  }, [load]);

  useEffect(() => {
    void refresh();
    // Back from QuickBooks, Xero or FreeAgent: say what happened, tidy the address.
    const q = new URLSearchParams(window.location.search);
    const result = q.get("acct");
    if (result) {
      const p = q.get("p");
      const msg = RESULT[result] ?? RESULT["failed"]!;
      const who = isProvider(p) ? `${PROVIDER_NAMES[p]}: ` : "";
      if (result === "connected") toast.success(who + msg);
      else toast.error(who + msg);
      q.delete("acct");
      q.delete("p");
      const rest = q.toString();
      window.history.replaceState(
        null,
        "",
        `${window.location.pathname}${rest ? `?${rest}` : ""}${window.location.hash}`,
      );
    }
  }, [refresh]);

  async function start(p: Provider) {
    setBusy(p);
    const r = await connect({ data: { provider: p } }).catch(() => null);
    if (r?.ok) {
      window.location.href = r.url;
      return;
    }
    setBusy(null);
    toast.error(r?.error ?? "Could not start the connection.");
  }

  async function stop(p: Provider) {
    if (
      !window.confirm(
        `Disconnect ${PROVIDER_NAMES[p]}? Paid invoices will stop asking for reviews. Requests already added stay.`,
      )
    )
      return;
    setBusy(p);
    const r = await disconnect({ data: { provider: p } }).catch(() => null);
    setBusy(null);
    if (r?.ok) toast.success("Disconnected");
    else toast.error(r?.error ?? "Could not disconnect.");
    await refresh();
  }

  async function now(p: Provider) {
    setBusy(p);
    await checkNow({ data: { provider: p } }).catch(() => null);
    setBusy(null);
    toast.success("We will check for paid invoices within 10 minutes.");
  }

  return (
    <section
      className="rounded-xl border border-border bg-card p-4 space-y-3"
      aria-labelledby="acct-title"
    >
      <div>
        <h3 id="acct-title" className="font-bold">
          Ask automatically when an invoice is paid
        </h3>
        <p className="text-xs text-muted-foreground">
          Connect your accounting software. When a customer pays an invoice, we add a review request
          for them, using your message, wait time and quiet hours from the Ask tab. Only invoices
          paid after you connect are used.
        </p>
      </div>
      {err && (
        <p role="alert" className="text-sm text-destructive">
          {err}
        </p>
      )}
      {!d && !err && (
        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" aria-label="Loading" />
      )}
      {d && (
        <ul className="divide-y divide-border">
          {d.providers.map((x) => {
            const c = x.connection;
            const isBusy = busy === x.provider;
            return (
              <li
                key={x.provider}
                className="py-3 flex flex-wrap items-start justify-between gap-2"
              >
                <div className="min-w-0 text-sm">
                  <p className="font-semibold">{x.name}</p>
                  {!c && (
                    <p className="text-xs text-muted-foreground">
                      {x.ready ? "Not connected" : "Coming soon"}
                    </p>
                  )}
                  {c && (
                    <div className="text-xs text-muted-foreground space-y-0.5">
                      <p>
                        {c.status === "connected" ? "Connected" : "Needs reconnecting"}
                        {c.accountName ? ` to ${c.accountName}` : ""}
                      </p>
                      <p>
                        Last checked {ago(c.lastSyncAt)}. {c.queuedTotal} review request
                        {c.queuedTotal === 1 ? "" : "s"} added so far.
                      </p>
                      {c.lastError && (
                        <p className="text-destructive" role="status">
                          {c.lastError}
                        </p>
                      )}
                    </div>
                  )}
                </div>
                <div className="flex flex-wrap gap-2 shrink-0">
                  {!x.ready && !c && (
                    <button
                      type="button"
                      disabled
                      className="rounded-lg border border-border px-3 py-2 text-xs font-semibold opacity-60"
                    >
                      Coming soon
                    </button>
                  )}
                  {x.ready && (!c || c.status === "needs_reconnect") && (
                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={() => void start(x.provider)}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-primary text-primary-foreground px-3 py-2 text-xs font-bold disabled:opacity-50"
                    >
                      {isBusy ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
                      ) : (
                        <Link2 className="w-3.5 h-3.5" aria-hidden="true" />
                      )}
                      {c ? "Reconnect" : "Connect"}
                      <span className="sr-only"> {x.name}</span>
                    </button>
                  )}
                  {c?.status === "connected" && (
                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={() => void now(x.provider)}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs font-semibold disabled:opacity-50"
                    >
                      <RefreshCw className="w-3.5 h-3.5" aria-hidden="true" /> Check now
                      <span className="sr-only"> {x.name}</span>
                    </button>
                  )}
                  {c && (
                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={() => void stop(x.provider)}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs font-semibold disabled:opacity-50"
                    >
                      <Unplug className="w-3.5 h-3.5" aria-hidden="true" /> Disconnect
                      <span className="sr-only"> {x.name}</span>
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <p className="text-xs text-muted-foreground">
        We only read invoices and customer contact details. Anyone asked recently, or who
        unsubscribed, is skipped. Customers with only a phone number appear under Ready to send in
        the Ask tab.
      </p>
    </section>
  );
}
