// Review sites shown on the QR feedback page (first = the big button) and
// the private feedback customers have sent. No em dashes in this copy.
import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ArrowDown, ArrowUp, Loader2, MessageSquareLock, Plus, Trash2 } from "lucide-react";
import {
  getReviewLinks,
  markFeedbackRead,
  saveReviewLinks,
} from "../../lib/review-links.functions";

type Data = Extract<Awaited<ReturnType<typeof getReviewLinks>>, { ok: true }>;
type Link = { platform: Data["links"][number]["platform"]; label: string; url: string };

const NAMES: Record<Link["platform"], string> = {
  google: "Google",
  facebook: "Facebook",
  tripadvisor: "Tripadvisor",
  trustpilot: "Trustpilot",
  yelp: "Yelp",
  booking: "Booking.com",
  other: "Other site",
};

const field =
  "w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40";

export function ReviewLinksCard({ part }: { part: "links" | "feedback" }) {
  const read = useServerFn(getReviewLinks);
  const save = useServerFn(saveReviewLinks);
  const markRead = useServerFn(markFeedbackRead);
  const [d, setD] = useState<Data | null>(null);
  const [links, setLinks] = useState<Link[]>([]);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    const r = await read();
    if (!r.ok) return setErr(r.error);
    setD(r);
    setLinks(r.links.map(({ platform, label, url }) => ({ platform, label, url })));
    setDirty(false);
  }, [read]);
  useEffect(() => {
    void load();
  }, [load]);

  const change = (next: Link[]) => {
    setLinks(next);
    setDirty(true);
  };
  const move = (i: number, by: number) => {
    const j = i + by;
    if (j < 0 || j >= links.length) return;
    const next = [...links];
    [next[i], next[j]] = [next[j]!, next[i]!];
    change(next);
  };

  if (err) return <p className="text-sm text-destructive">{err}</p>;
  if (!d) return <Loader2 className="w-4 h-4 animate-spin" />;
  const unread = d.feedback.filter((f) => !f.read_at).length;

  return (
    <section className="rounded-xl border border-border bg-card p-5 space-y-4">
      {part === "links" && (
        <>
          <div>
            <h2 className="font-bold">Review sites on your QR page</h2>
            <p className="text-sm text-muted-foreground">
              Customers who scan your code see every site below. The first one is the big button.
              Your Google link from the QR code is used automatically if you do not add one.
            </p>
          </div>

          <ul className="space-y-3">
            {links.map((l, i) => (
              <li key={i} className="rounded-lg border border-border p-3 space-y-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold rounded bg-muted px-2 py-0.5">
                    {i === 0 ? "Main button" : `Option ${i + 1}`}
                  </span>
                  <select
                    value={l.platform}
                    onChange={(e) =>
                      change(
                        links.map((x, k) =>
                          k === i ? { ...x, platform: e.target.value as Link["platform"] } : x,
                        ),
                      )
                    }
                    className="rounded-lg border border-input bg-background px-2 py-1 text-sm"
                  >
                    {Object.entries(NAMES).map(([id, n]) => (
                      <option key={id} value={id}>
                        {n}
                      </option>
                    ))}
                  </select>
                  <span className="ml-auto flex gap-1">
                    <button
                      type="button"
                      aria-label="Move up"
                      onClick={() => move(i, -1)}
                      className="p-1.5 rounded hover:bg-muted"
                    >
                      <ArrowUp className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      aria-label="Move down"
                      onClick={() => move(i, 1)}
                      className="p-1.5 rounded hover:bg-muted"
                    >
                      <ArrowDown className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      aria-label="Remove"
                      onClick={() => change(links.filter((_, k) => k !== i))}
                      className="p-1.5 rounded hover:bg-muted text-destructive"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </span>
                </div>
                {l.platform === "other" && (
                  <input
                    value={l.label}
                    onChange={(e) =>
                      change(links.map((x, k) => (k === i ? { ...x, label: e.target.value } : x)))
                    }
                    placeholder="Site name, for example Checkatrade"
                    className={field}
                  />
                )}
                <input
                  value={l.url}
                  onChange={(e) =>
                    change(links.map((x, k) => (k === i ? { ...x, url: e.target.value } : x)))
                  }
                  placeholder="https://... your review page link"
                  className={field}
                />
              </li>
            ))}
          </ul>

          <div className="flex flex-wrap gap-2">
            {links.length < d.max && (
              <button
                type="button"
                onClick={() =>
                  change([
                    ...links,
                    { platform: links.length ? "facebook" : "google", label: "", url: "" },
                  ])
                }
                className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm"
              >
                <Plus className="w-4 h-4" /> Add a review site
              </button>
            )}
            {dirty && (
              <button
                type="button"
                disabled={saving}
                onClick={async () => {
                  setSaving(true);
                  try {
                    const r = await save({ data: { links: links.filter((l) => l.url.trim()) } });
                    if (r.ok) {
                      toast.success("Saved. Your QR page now shows these sites.");
                      await load();
                    } else toast.error(r.error);
                  } catch {
                    toast.error("Check each link starts with https:// and try again.");
                  }
                  setSaving(false);
                }}
                className="rounded-lg bg-primary text-primary-foreground font-semibold px-4 py-2 text-sm disabled:opacity-50"
              >
                {saving ? "Saving..." : "Save"}
              </button>
            )}
          </div>
        </>
      )}
      {part === "feedback" && (
        <div>
          <h3 className="font-semibold flex items-center gap-2">
            <MessageSquareLock className="w-4 h-4" /> Private feedback
            {unread > 0 && (
              <span className="text-xs rounded-full bg-primary text-primary-foreground px-2">
                {unread} new
              </span>
            )}
          </h3>
          <p className="text-xs text-muted-foreground mb-2">
            Messages customers sent from your QR page instead of, or as well as, a review. You also
            get each one by email.
          </p>
          {d.feedback.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nothing yet.</p>
          ) : (
            <ul className="space-y-2">
              {d.feedback.map((f) => (
                <li
                  key={f.id}
                  className={`rounded-lg border p-3 text-sm ${f.read_at ? "border-border" : "border-primary/50 bg-primary/5"}`}
                >
                  <p className="whitespace-pre-line">{f.message}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {new Date(f.created_at).toLocaleString("en-GB", {
                      dateStyle: "medium",
                      timeStyle: "short",
                    })}
                    {f.name ? ` - ${f.name}` : ""}
                    {f.contact ? ` - ${f.contact}` : ""}
                  </p>
                  {!f.read_at && (
                    <button
                      type="button"
                      onClick={async () => {
                        await markRead({ data: { id: f.id } });
                        await load();
                      }}
                      className="text-xs font-semibold underline underline-offset-2 mt-1"
                    >
                      Mark as read
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}
