// "Plan my month": 4 AI-written Google posts, one a week, that the owner
// checks and approves. No em dashes in this copy (AGENTS.md).
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { CalendarDays, ImageOff, ImagePlus, Images, Loader2, Sparkles, X } from "lucide-react";
import {
  approveGooglePostsFn,
  changePostPictureFn,
  editGooglePostFn,
  planGooglePostsFn,
  removePostPictureFn,
  saveCardPictureFn,
  listBackgroundPhotosFn,
  pickGooglePhotoBackgroundFn,
} from "../../lib/post-plan.functions";
import { getBranding, saveBrandBackground, saveBrandLook } from "../../lib/brand.functions";
import { CARD_STYLES, cardLook, chosenStyle, type SavedLook } from "../../lib/card-style";
import { loadPicture, drawReviewCard } from "../../lib/review-card";
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
  // Picture shown full size (tap a thumbnail to check it before approving).
  const [viewing, setViewing] = useState<string | null>(null);
  const drawing = useRef(new Set<string>());
  // The business's saved look (logo, QR stand photo and colours, card style).
  const [look, setLook] = useState<SavedLook | null>(null);
  const [styleBusy, setStyleBusy] = useState(false);
  const [background, setBackgroundUrl] = useState<string | null>(null);
  const loadLook = useCallback(async () => {
    const b = await getBranding().catch(() => null);
    setLook(
      b && b.ok
        ? {
            background: b.background,
            standTheme: b.standTheme,
            primary: b.primary,
            cardStyle: b.cardStyle,
          }
        : { background: null, standTheme: null, primary: null, cardStyle: null },
    );
    setBackgroundUrl(b && b.ok ? b.background : null);
  }, []);
  // Read the saved look when this opens, when the page gets focus again, and
  // when the QR designer closes (it can change the logo and background).
  useEffect(() => {
    void loadLook();
    const again = () => void loadLook();
    window.addEventListener("focus", again);
    window.addEventListener("repsuites:branding", again);
    return () => {
      window.removeEventListener("focus", again);
      window.removeEventListener("repsuites:branding", again);
    };
  }, [loadLook]);
  // "Change background" chooser.
  const [choosing, setChoosing] = useState(false);
  const [photos, setPhotos] = useState<
    { url: string; thumb: string; byCustomer?: boolean }[] | null
  >(null);
  const [bgBusy, setBgBusy] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const afterBackground = async (ok: boolean, error?: string) => {
    if (ok) {
      toast.success("Background changed. Your cards are being redrawn.");
      drawing.current.clear();
      await loadLook();
      await onChanged();
      setChoosing(false);
    } else toast.error(error ?? "Could not change the background. Try again.");
    setBgBusy(false);
  };
  const hasCards = drafts.some((d) => d.imageKind === "card");

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
      const logo = b && b.ok && b.logo ? await loadPicture(b.logo) : null;
      const chosen =
        b && b.ok
          ? cardLook({
              background: b.background,
              standTheme: b.standTheme,
              primary: b.primary,
              cardStyle: b.cardStyle,
            })
          : ({ kind: "brand" } as const);
      const photo = chosen.kind === "photo" ? await loadPicture(chosen.url) : null;
      const themeId = chosen.kind === "brand" ? "brand" : chosen.themeId;
      let saved = 0;
      for (const d of todo) {
        drawing.current.add(d.id);
        const png = drawReviewCard({
          business,
          quote: d.imageQuote!,
          by: d.imageBy,
          primary,
          secondary,
          logo,
          themeId,
          photo,
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
      {viewing && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Picture full size"
          onClick={() => setViewing(null)}
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4 cursor-zoom-out"
        >
          <img
            src={viewing}
            alt="Picture for this post, full size"
            className="max-w-full max-h-[85vh] rounded-xl shadow-2xl"
          />
          <button
            type="button"
            onClick={() => setViewing(null)}
            className="absolute top-4 right-4 rounded-full bg-white text-black px-3 py-1 text-sm font-bold"
          >
            Close
          </button>
        </div>
      )}
      {choosing && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Change background"
          className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4"
          onClick={() => !bgBusy && setChoosing(false)}
        >
          <div
            className="w-full max-w-lg max-h-[85vh] overflow-y-auto rounded-xl bg-card p-4 space-y-3"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h3 className="font-bold">Change background</h3>
              <button
                type="button"
                aria-label="Close"
                onClick={() => setChoosing(false)}
                className="p-1 rounded hover:bg-muted"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-base text-muted-foreground">
              Used behind your review cards and on your QR stand. We darken it a little so the words
              are easy to read.
            </p>
            {background && (
              <div className="flex items-center gap-3">
                <img
                  src={background}
                  alt="Your background now"
                  className="w-20 h-20 rounded-lg object-cover border border-border"
                />
                <span className="text-base text-muted-foreground">Your background now</span>
              </div>
            )}
            <div className="flex flex-wrap gap-2">
              <input
                ref={fileInput}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  e.target.value = "";
                  if (!f) return;
                  setBgBusy(true);
                  const jpeg = await photoToJpeg(f).catch(() => null);
                  if (!jpeg) return afterBackground(false, "That photo could not be read.");
                  const r = await saveBrandBackground({ data: { jpeg } }).catch(() => null);
                  await afterBackground(!!r?.ok, r && !r.ok ? r.error : undefined);
                }}
              />
              <button
                type="button"
                disabled={bgBusy}
                onClick={() => fileInput.current?.click()}
                className="rounded-lg bg-primary text-primary-foreground px-3 py-1.5 text-base font-semibold inline-flex items-center gap-1.5 disabled:opacity-50"
              >
                <ImagePlus className="w-3.5 h-3.5" /> Upload a photo
              </button>
              {background && (
                <button
                  type="button"
                  disabled={bgBusy}
                  onClick={async () => {
                    setBgBusy(true);
                    const r = await saveBrandBackground({ data: { jpeg: null } }).catch(() => null);
                    await afterBackground(!!r?.ok, r && !r.ok ? r.error : undefined);
                  }}
                  className="rounded-lg border border-border px-3 py-1.5 text-base font-semibold disabled:opacity-50"
                >
                  Remove background
                </button>
              )}
              {bgBusy && <Loader2 className="w-4 h-4 animate-spin self-center" />}
            </div>
            <div>
              <p className="text-base font-semibold mb-1.5">Or pick one of your Google photos</p>
              {photos === null ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : photos.length === 0 ? (
                <p className="text-base text-muted-foreground">
                  No Google photos found. Connect Google, or upload a photo.
                </p>
              ) : (
                <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                  {photos.map((p) => (
                    <button
                      key={p.url}
                      type="button"
                      disabled={bgBusy}
                      onClick={async () => {
                        setBgBusy(true);
                        const r = await pickGooglePhotoBackgroundFn({ data: { url: p.url } }).catch(
                          () => null,
                        );
                        await afterBackground(!!r?.ok, r && !r.ok ? r.error : undefined);
                      }}
                      className="relative aspect-square rounded-lg overflow-hidden border border-border hover:ring-2 hover:ring-primary disabled:opacity-50"
                    >
                      <img src={p.thumb} alt="" className="w-full h-full object-cover" />
                      {p.byCustomer && (
                        <span className="absolute bottom-0 inset-x-0 bg-black/70 text-white text-sm leading-tight px-1 py-0.5">
                          Customer photo
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              )}
              <p className="text-base text-muted-foreground mt-1.5">
                Customer photos belong to the customer who took them. Only use one if you are happy
                to.
              </p>
            </div>
          </div>
        </div>
      )}
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-base font-bold flex items-center gap-1.5">
            <Sparkles className="w-4 h-4" /> Plan my month
          </h2>
          {hasCards && look && (
            <label className="flex flex-wrap items-center gap-2 text-base">
              <span className="font-semibold">Card style</span>
              <select
                value={chosenStyle(look)}
                disabled={styleBusy}
                onChange={async (e) => {
                  const id = e.target.value;
                  setStyleBusy(true);
                  const r = await saveBrandLook({ data: { cardStyle: id } }).catch(() => null);
                  if (r?.ok) {
                    setLook({ ...look, cardStyle: id });
                    drawing.current.clear();
                    await onChanged();
                  } else toast.error(r && !r.ok ? r.error : "Could not change the style.");
                  setStyleBusy(false);
                }}
                className="rounded-lg border border-input bg-background px-2 py-1 text-base"
              >
                {CARD_STYLES(look).map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                  </option>
                ))}
              </select>
              {styleBusy && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              <button
                type="button"
                onClick={() => {
                  setChoosing(true);
                  if (!photos)
                    void listBackgroundPhotosFn()
                      .then((r) => setPhotos(r.ok ? r.photos : []))
                      .catch(() => setPhotos([]));
                }}
                className="inline-flex items-center gap-1 rounded-lg border border-border bg-background px-2 py-1 font-semibold"
              >
                {background ? (
                  <img src={background} alt="" className="w-5 h-5 rounded object-cover" />
                ) : (
                  <ImagePlus className="w-3.5 h-3.5" />
                )}
                Change background
              </button>
              <span className="text-muted-foreground">
                Review cards use your logo and this look.
              </span>
            </label>
          )}
          <p className="text-base text-muted-foreground">
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
            className="rounded-lg bg-primary text-primary-foreground px-3 py-1.5 text-base font-semibold inline-flex items-center gap-1.5 disabled:opacity-50"
          >
            {busy === "plan" && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            {busy === "plan" ? "Writing (about 30 seconds)" : "Plan my month"}
          </button>
        )}
      </div>

      {drafts.length > 0 && (
        <>
          <p className="text-base font-semibold">
            {drafts.length} post{drafts.length === 1 ? "" : "s"} ready. Approve them and we post one
            each week.
          </p>
          <ul className="space-y-2">
            {drafts.map((p) => (
              <li key={p.id} className="rounded-lg border border-border bg-card p-3 space-y-1.5">
                <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
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
                    <button
                      type="button"
                      onClick={() => setViewing(p.imageUrl)}
                      aria-label="See this picture full size"
                      className="shrink-0"
                    >
                      <img
                        src={p.imageUrl}
                        alt="Picture for this post"
                        className="w-20 h-20 rounded-lg object-cover border border-border bg-muted hover:opacity-90"
                      />
                    </button>
                  ) : (
                    <div className="w-20 h-20 rounded-lg border border-dashed border-border bg-muted flex items-center justify-center text-base text-muted-foreground text-center p-1">
                      {p.imageKind === "card" ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        "No picture"
                      )}
                    </div>
                  )}
                  <div className="flex flex-col items-start gap-1 text-base">
                    <span className="text-muted-foreground">
                      {p.imageKind === "google"
                        ? p.imageBy === "customer"
                          ? "A customer's photo from Google (tap to see it). Only use it if you are happy to."
                          : "A photo from your Google profile (tap to see it)"
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
                  aria-label="Post text"
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
                  className="w-full rounded-lg border border-input bg-background px-3 py-2 text-base"
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
            className="w-full rounded-lg bg-primary text-primary-foreground px-3 py-2.5 text-base font-bold inline-flex items-center justify-center gap-1.5 disabled:opacity-50"
          >
            {busy === "approve" && <Loader2 className="w-4 h-4 animate-spin" />} Approve all
          </button>
        </>
      )}
    </section>
  );
}

// A phone photo made smaller (at most 1600px wide) and saved as a JPEG.
async function photoToJpeg(file: File): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((ok, bad) => {
      const i = new Image();
      i.onload = () => ok(i);
      i.onerror = bad;
      i.src = url;
    });
    const k = Math.min(1, 1600 / img.width);
    const c = document.createElement("canvas");
    c.width = Math.round(img.width * k);
    c.height = Math.round(img.height * k);
    c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
    return c.toDataURL("image/jpeg", 0.85);
  } finally {
    URL.revokeObjectURL(url);
  }
}
