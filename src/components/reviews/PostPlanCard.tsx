// "Plan my month": 4 AI-written Google posts, one a week, that the owner
// checks and approves. No em dashes in this copy (AGENTS.md).
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { CalendarDays, ImageOff, Images, Loader2, Sparkles } from "lucide-react";
import {
  approveGooglePostsFn,
  changePostPictureFn,
  editGooglePostFn,
  planGooglePostsFn,
  removePostPictureFn,
  saveCardPictureFn,
} from "../../lib/post-plan.functions";
import { getBranding } from "../../lib/brand.functions";
import { drawReviewCard } from "../../lib/review-card";
import { cancelGooglePostFn } from "../../lib/google-business.functions";

interface Draft {
  id: string;
  summary: string;
  actionType: string | null;
  publishAt: string;
  imageUrl: string | null;
  imageKind: "google" | "card" | null;
  imageQuote: string | null;
  imageBy: string | null;
}

const BUTTON: Record<string, string> = {
  LEARN_MORE: "Learn more",
  CALL: "Call now",
  BOOK: "Book",
  ORDER: "Order online",
};

export function PostPlanCard({
  drafts,
  business,
  onChanged,
}: {
  drafts: Draft[];
  business: string;
  onChanged: () => Promise<void>;
}) {
  const [busy, setBusy] = useState<"plan" | "approve" | null>(null);
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [picBusy, setPicBusy] = useState<string | null>(null);
  const drawing = useRef(new Set<string>());

  // Review cards are drawn here, on the owner's screen, then saved where
  // Google can fetch them when the post goes out.
  useEffect(() => {
    const todo = drafts.filter(
      (d) => d.imageKind === "card" && !d.imageUrl && d.imageQuote && !drawing.current.has(d.id),
    );
    if (!todo.length) return;
    void (async () => {
      const b = await getBranding().catch(() => null);
      const primary = b && b.ok ? b.primary : null;
      const secondary = b && b.ok ? b.secondary : null;
      let saved = 0;
      for (const d of todo) {
        drawing.current.add(d.id);
        const png = drawReviewCard({
          business,
          quote: d.imageQuote!,
          by: d.imageBy,
          primary,
          secondary,
        });
        const r = await saveCardPictureFn({ data: { id: d.id, png } }).catch(() => null);
        if (r?.ok) saved++;
      }
      if (saved) await onChanged();
    })();
  }, [drafts, business, onChanged]);

  const picture = async (id: string, action: "change" | "remove") => {
    setPicBusy(id);
    const r = await (
      action === "change"
        ? changePostPictureFn({ data: { id } })
        : removePostPictureFn({ data: { id } })
    ).catch(() => null);
    if (r?.ok) drawing.current.delete(id);
    else toast.error(r?.error ?? "Something went wrong. Try again.");
    await onChanged();
    setPicBusy(null);
  };

  return (
    <section className="rounded-xl border border-primary/40 bg-primary/5 p-4 space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-sm font-bold flex items-center gap-1.5">
            <Sparkles className="w-4 h-4" /> Plan my month
          </h2>
          <p className="text-xs text-muted-foreground">
            We write 4 posts from what your customers say, one for each week. You check them, then
            we post one every Tuesday at 11am.
          </p>
        </div>
        {drafts.length === 0 && (
          <button
            type="button"
            disabled={busy !== null}
            onClick={async () => {
              setBusy("plan");
              const r = await planGooglePostsFn().catch(() => null);
              setBusy(null);
              if (r?.ok) toast.success(`${r.count} posts ready to check`);
              else toast.error(r?.error ?? "Something went wrong. Try again.");
              await onChanged();
            }}
            className="rounded-lg bg-primary text-primary-foreground px-3 py-1.5 text-xs font-semibold inline-flex items-center gap-1.5 disabled:opacity-50"
          >
            {busy === "plan" && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            {busy === "plan" ? "Writing (about 30 seconds)" : "Plan my month"}
          </button>
        )}
      </div>

      {drafts.length > 0 && (
        <>
          <p className="text-sm font-semibold">
            {drafts.length} post{drafts.length === 1 ? "" : "s"} ready. Approve them and we post one
            each week.
          </p>
          <ul className="space-y-2">
            {drafts.map((p) => (
              <li key={p.id} className="rounded-lg border border-border bg-card p-3 space-y-1.5">
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <CalendarDays className="w-3.5 h-3.5" />
                  {new Date(p.publishAt).toLocaleString("en-GB", {
                    weekday: "short",
                    day: "numeric",
                    month: "short",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                  {p.actionType && <span>Button: {BUTTON[p.actionType] ?? p.actionType}</span>}
                  <button
                    type="button"
                    onClick={async () => {
                      await cancelGooglePostFn({ data: { id: p.id } });
                      await onChanged();
                    }}
                    className="ml-auto font-semibold"
                  >
                    Delete
                  </button>
                </div>
                <div className="flex items-center gap-3">
                  {p.imageUrl ? (
                    <img
                      src={p.imageUrl}
                      alt="Picture for this post"
                      className="w-20 h-20 rounded-lg object-cover border border-border bg-muted"
                    />
                  ) : (
                    <div className="w-20 h-20 rounded-lg border border-dashed border-border bg-muted flex items-center justify-center text-[10px] text-muted-foreground text-center p-1">
                      {p.imageKind === "card" ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        "No picture"
                      )}
                    </div>
                  )}
                  <div className="flex flex-col items-start gap-1 text-xs">
                    <span className="text-muted-foreground">
                      {p.imageKind === "google"
                        ? "A photo from your Google profile"
                        : p.imageKind === "card"
                          ? "A card with a customer's review"
                          : "Text only"}
                    </span>
                    <button
                      type="button"
                      disabled={picBusy === p.id}
                      onClick={() => void picture(p.id, "change")}
                      className="font-semibold inline-flex items-center gap-1 disabled:opacity-50"
                    >
                      <Images className="w-3.5 h-3.5" />
                      {p.imageKind ? "Change picture" : "Add a picture"}
                    </button>
                    {p.imageKind && (
                      <button
                        type="button"
                        disabled={picBusy === p.id}
                        onClick={() => void picture(p.id, "remove")}
                        className="text-muted-foreground inline-flex items-center gap-1 disabled:opacity-50"
                      >
                        <ImageOff className="w-3.5 h-3.5" /> No picture
                      </button>
                    )}
                  </div>
                </div>
                <textarea
                  value={edits[p.id] ?? p.summary}
                  onChange={(e) => setEdits((x) => ({ ...x, [p.id]: e.target.value }))}
                  onBlur={async () => {
                    const text = edits[p.id];
                    if (text === undefined || text === p.summary) return;
                    const r = await editGooglePostFn({ data: { id: p.id, summary: text } }).catch(
                      () => null,
                    );
                    if (r?.ok) toast.success("Saved");
                    else toast.error(r?.error ?? "Could not save.");
                  }}
                  rows={4}
                  maxLength={1500}
                  className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
                />
              </li>
            ))}
          </ul>
          <button
            type="button"
            disabled={busy !== null}
            onClick={async () => {
              setBusy("approve");
              const r = await approveGooglePostsFn().catch(() => null);
              setBusy(null);
              if (r?.ok) toast.success("Approved. We will post one each week.");
              else toast.error(r?.error ?? "Something went wrong. Try again.");
              setEdits({});
              await onChanged();
            }}
            className="w-full rounded-lg bg-primary text-primary-foreground px-3 py-2.5 text-sm font-bold inline-flex items-center justify-center gap-1.5 disabled:opacity-50"
          >
            {busy === "approve" && <Loader2 className="w-4 h-4 animate-spin" />} Approve all
          </button>
        </>
      )}
    </section>
  );
}
