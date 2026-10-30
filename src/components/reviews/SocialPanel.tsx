// Facebook and Instagram on the Posts tab: connect the business's Page, pick
// one if there are several, and choose per post where it also goes.
// No em dashes in this copy (AGENTS.md).
import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Facebook, Instagram, Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  chooseMetaPageFn,
  disconnectMetaFn,
  getMetaFn,
  getPostChannelsFn,
  metaConnectFn,
  setPostChannelsFn,
} from "../../lib/meta.functions";
import { channelText } from "../../lib/social";

type Meta = Extract<Awaited<ReturnType<typeof getMetaFn>>, { ok: true }>;
type Channels = Extract<Awaited<ReturnType<typeof getPostChannelsFn>>, { ok: true }>["posts"];

export function SocialPanel({
  posts,
}: {
  posts: { id: string; summary: string; status: string; publishAt: string }[];
}) {
  const load = useServerFn(getMetaFn);
  const loadChannels = useServerFn(getPostChannelsFn);
  const connect = useServerFn(metaConnectFn);
  const choose = useServerFn(chooseMetaPageFn);
  const disconnect = useServerFn(disconnectMetaFn);
  const setChannels = useServerFn(setPostChannelsFn);
  const [m, setM] = useState<Meta | null>(null);
  const [blocked, setBlocked] = useState<string | null>(null);
  const [ch, setCh] = useState<Channels>([]);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    const r = await load().catch(() => null);
    if (r?.ok) setM(r);
    else setBlocked(r?.error ?? null);
    const c = await loadChannels().catch(() => null);
    if (c?.ok) setCh(c.posts);
  }, [load, loadChannels]);
  useEffect(() => {
    void refresh();
    if (typeof window !== "undefined") {
      const q = new URLSearchParams(window.location.search).get("meta");
      if (q === "connected") toast.success("Facebook connected.");
      else if (q === "nopage")
        toast.error("No Facebook Page was shared. Try again and tick your Page.");
      else if (q && q !== "connected") toast.error("Facebook was not connected. Try again.");
    }
  }, [refresh]);

  if (blocked)
    return (
      <section className="rounded-xl border border-border bg-card p-4">
        <p className="font-bold flex items-center gap-1.5">
          <Facebook className="w-4 h-4" /> Facebook and Instagram
        </p>
        <p className="text-sm text-muted-foreground mt-1">{blocked}</p>
      </section>
    );
  if (!m) return null;
  if (!m.ready)
    return (
      <section className="rounded-xl border border-border bg-card p-4">
        <p className="font-bold flex items-center gap-1.5">
          <Facebook className="w-4 h-4" /> <Instagram className="w-4 h-4" /> Facebook and Instagram
        </p>
        <p className="text-sm text-muted-foreground mt-1">
          Facebook and Instagram are coming soon. Your posts will go there too, at the same time as
          Google.
        </p>
      </section>
    );

  const c = m.connection;
  const upcoming = posts.filter((p) => p.status === "draft" || p.status === "scheduled");
  const recent = posts.filter((p) => p.status === "posted" || p.status === "failed").slice(0, 6);
  const flags = (id: string) => ch.find((x) => x.id === id);

  return (
    <section className="rounded-xl border border-border bg-card p-4 space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <p className="font-bold flex items-center gap-1.5 flex-1 min-w-0">
          <Facebook className="w-4 h-4" /> <Instagram className="w-4 h-4" /> Facebook and Instagram
        </p>
        {c?.status === "connected" && (
          <button
            type="button"
            onClick={async () => {
              await disconnect().catch(() => null);
              await refresh();
            }}
            className="text-xs text-muted-foreground font-semibold"
          >
            Disconnect
          </button>
        )}
      </div>

      {(!c || c.status === "needs_reconnect") && (
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">
            {c?.status === "needs_reconnect"
              ? "Facebook needs connecting again."
              : "Post the same updates to your Facebook Page and Instagram, at the same time as Google."}
          </p>
          <button
            type="button"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              const r = await connect().catch(() => null);
              if (r?.ok) window.location.href = r.url;
              else {
                setBusy(false);
                toast.error(r?.error ?? "Could not start. Try again.");
              }
            }}
            className="rounded-lg bg-[#1877F2] text-white px-3 py-2 text-sm font-bold inline-flex items-center gap-1.5 disabled:opacity-60"
          >
            {busy && <Loader2 className="w-4 h-4 animate-spin" />} Connect Facebook and Instagram
          </button>
        </div>
      )}

      {c?.status === "choose_page" && (
        <div className="space-y-2">
          <p className="text-sm">{c.error ?? "Which Facebook Page is this business?"}</p>
          {c.pages.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={async () => {
                const r = await choose({ data: { pageId: p.id } }).catch(() => null);
                if (r?.ok) toast.success(`Connected to ${p.name}.`);
                else toast.error(r?.error ?? "Could not save. Try again.");
                await refresh();
              }}
              className="block w-full text-left rounded-lg border border-border px-3 py-2 text-sm hover:border-primary"
            >
              <b>{p.name}</b>
              <span className="block text-xs text-muted-foreground">
                {p.igUsername
                  ? `Instagram: @${p.igUsername}`
                  : "No Instagram business account linked"}
              </span>
            </button>
          ))}
        </div>
      )}

      {c?.status === "connected" && (
        <>
          <p className="text-sm text-muted-foreground">
            Connected to <b>{c.pageName}</b>
            {c.igUsername ? (
              <>
                {" "}
                and Instagram <b>@{c.igUsername}</b>
              </>
            ) : (
              ". No Instagram business account is linked to this Page, so only Facebook gets posts."
            )}
            . Posts go out at the same time as Google. Instagram only takes posts with a picture.
          </p>
          {upcoming.length > 0 && (
            <ul className="divide-y divide-border text-xs">
              {upcoming.map((p) => {
                const f = flags(p.id);
                const fb = f?.facebook ?? true;
                const ig = f?.instagram ?? true;
                const save = async (facebook: boolean, instagram: boolean) => {
                  setCh((cur) =>
                    cur.some((x) => x.id === p.id)
                      ? cur.map((x) => (x.id === p.id ? { ...x, facebook, instagram } : x))
                      : cur,
                  );
                  const r = await setChannels({ data: { id: p.id, facebook, instagram } }).catch(
                    () => null,
                  );
                  if (!r?.ok) toast.error(r?.error ?? "Could not save.");
                };
                return (
                  <li key={p.id} className="py-2 flex flex-wrap items-center gap-3">
                    <span className="flex-1 min-w-0 truncate">
                      {new Date(p.publishAt).toLocaleDateString("en-GB", {
                        day: "numeric",
                        month: "short",
                      })}
                      : {p.summary}
                    </span>
                    <label className="inline-flex items-center gap-1">
                      <input
                        type="checkbox"
                        checked={fb}
                        onChange={(e) => void save(e.target.checked, ig)}
                      />
                      Facebook
                    </label>
                    <label className="inline-flex items-center gap-1">
                      <input
                        type="checkbox"
                        checked={ig}
                        disabled={!c.igUsername}
                        onChange={(e) => void save(fb, e.target.checked)}
                      />
                      Instagram
                    </label>
                  </li>
                );
              })}
            </ul>
          )}
          {recent.length > 0 && (
            <ul className="text-xs space-y-1">
              {recent.map((p) => {
                const f = flags(p.id);
                if (!f) return null;
                return (
                  <li key={p.id} className="text-muted-foreground">
                    <span className="text-foreground">{p.summary.slice(0, 50)}...</span>{" "}
                    {f.facebook && channelText("Facebook", f.fbStatus, f.fbError)}
                    {f.facebook && f.instagram && ". "}
                    {f.instagram && channelText("Instagram", f.igStatus, f.igError)}
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}
    </section>
  );
}
