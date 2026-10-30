// Design a printable review coaster or A5 table stand for one QR code, with a
// live preview, then download a print-ready PDF (or PNG).
// No em dashes in this copy (AGENTS.md).
import { useEffect, useMemo, useRef, useState } from "react";
import { QRCodeCanvas } from "qrcode.react";
import { Download, ImagePlus, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { brandTheme, normaliseHex } from "../../lib/brand";
import {
  getBranding,
  saveBrandBackground,
  saveBranding,
  saveBrandLogo,
  saveBrandLook,
} from "../../lib/brand.functions";
import { loadPicture } from "../../lib/review-card";
import {
  downloadPdf,
  downloadPng,
  FORMATS,
  MESSAGES,
  renderDesign,
  THEMES,
  type Design,
  type PrintFormat,
} from "../../lib/print-design";

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    if (!/^image\/(png|jpe?g|webp|svg\+xml)$/.test(file.type)) return reject(new Error("type"));
    if (file.size > 15 * 1024 * 1024) return reject(new Error("size"));
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("load"));
    img.src = url;
  });
}

// A smaller copy of a picture as a data URL, so it can be saved for next time.
function shrink(img: HTMLImageElement, maxW: number, type: "image/png" | "image/jpeg"): string {
  const k = Math.min(1, maxW / img.width);
  const c = document.createElement("canvas");
  c.width = Math.round(img.width * k);
  c.height = Math.round(img.height * k);
  c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
  return c.toDataURL(type, 0.85);
}

const field =
  "w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40";

export function PrintDesigner({
  url,
  business,
  onClose,
}: {
  url: string;
  business: string;
  onClose: () => void;
}) {
  const qrWrap = useRef<HTMLDivElement>(null);
  const preview = useRef<HTMLDivElement>(null);
  const [format, setFormat] = useState<PrintFormat>("a5");
  const [themeId, setThemeId] = useState(THEMES[0]!.id);
  // Brand colours as hex codes, saved per business.
  const loadBrand = useServerFn(getBranding);
  const storeBrand = useServerFn(saveBranding);
  const [primaryHex, setPrimaryHex] = useState("");
  const [secondaryHex, setSecondaryHex] = useState("");
  const [savingBrand, setSavingBrand] = useState(false);
  const primary = normaliseHex(primaryHex);
  const secondary = normaliseHex(secondaryHex);
  useEffect(() => {
    void loadBrand()
      .then((r) => {
        if (!r.ok) return;
        if (r.primary) {
          setPrimaryHex(r.primary);
          setThemeId("brand");
        }
        if (r.secondary) setSecondaryHex(r.secondary);
        // The QR stand look saved last time: theme, logo and background photo.
        if (r.standTheme && (r.standTheme !== "brand" || r.primary)) setThemeId(r.standTheme);
        if (r.logo) void loadPicture(r.logo).then((i) => i && setLogo(i));
        if (r.background) void loadPicture(r.background).then((i) => i && setPhoto(i));
      })
      .catch(() => null);
  }, [loadBrand]);
  async function keepBrand() {
    if (primaryHex && !primary) {
      toast.error("Primary colour: use a hex code like #0b1d3a.");
      return;
    }
    if (secondaryHex && !secondary) {
      toast.error("Secondary colour: use a hex code like #f5b324.");
      return;
    }
    setSavingBrand(true);
    const r = await storeBrand({ data: { primary, secondary } }).catch(() => null);
    setSavingBrand(false);
    if (r?.ok) toast.success("Brand colours saved for this business");
    else toast.error(r?.error ?? "Could not save the colours.");
  }
  const [name, setName] = useState(business);
  const [msg, setMsg] = useState(0);
  const [headline, setHeadline] = useState(MESSAGES[0]!.headline);
  const [sub, setSub] = useState(MESSAGES[0]!.sub);
  const [logo, setLogo] = useState<HTMLImageElement | null>(null);
  const [photo, setPhoto] = useState<HTMLImageElement | null>(null);
  const [footer, setFooter] = useState(true);
  const [busy, setBusy] = useState(false);
  const [qrReady, setQrReady] = useState(false);

  useEffect(() => setQrReady(true), []);

  const design = useMemo((): Design | null => {
    const qr = qrWrap.current?.querySelector("canvas");
    if (!qr || !qrReady) return null;
    return {
      format,
      business: name.trim() || business,
      headline: headline.trim(),
      sub: sub.trim(),
      theme:
        themeId === "brand" && primary
          ? brandTheme(primary, secondary)
          : (THEMES.find((t) => t.id === themeId) ?? THEMES[0]!),
      logo,
      photo,
      qr,
      footer,
    };
  }, [
    format,
    name,
    business,
    headline,
    sub,
    themeId,
    primary,
    secondary,
    logo,
    photo,
    footer,
    qrReady,
  ]);

  // Redraw the small preview whenever something changes.
  useEffect(() => {
    if (!design || !preview.current) return;
    const c = renderDesign(design, true, 0.3);
    c.className = "max-w-full h-auto rounded-lg shadow-lg";
    c.style.maxHeight = "60vh";
    preview.current.replaceChildren(c);
  }, [design]);

  const pick = async (
    file: File | undefined,
    set: (i: HTMLImageElement) => void,
    kind: "logo" | "photo",
  ) => {
    if (!file) return;
    let img: HTMLImageElement;
    try {
      img = await loadImage(file);
    } catch {
      toast.error("Use a PNG, JPG or WEBP image under 15 MB.");
      return;
    }
    set(img);
    // Remembered for next time and used on review cards for Google posts.
    const r =
      kind === "logo"
        ? await saveBrandLogo({ data: { png: shrink(img, 800, "image/png") } }).catch(() => null)
        : await saveBrandBackground({ data: { jpeg: shrink(img, 1600, "image/jpeg") } }).catch(
            () => null,
          );
    if (r && !r.ok) toast.error(r.error);
  };
  const forget = (kind: "logo" | "photo") => {
    if (kind === "logo") {
      setLogo(null);
      void saveBrandLogo({ data: { png: null } }).catch(() => null);
    } else {
      setPhoto(null);
      void saveBrandBackground({ data: { jpeg: null } }).catch(() => null);
    }
  };
  const chooseTheme = (id: string) => {
    setThemeId(id);
    void saveBrandLook({ data: { standTheme: id } }).catch(() => null);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center">
      <div className="bg-background w-full sm:max-w-4xl max-h-[95vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl p-4 sm:p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-bold text-lg">Design a printable review card</h2>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="p-2 rounded hover:bg-muted"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Hidden, large QR code used for the artwork. */}
        <div ref={qrWrap} className="hidden">
          <QRCodeCanvas value={url} size={1400} level="M" marginSize={0} />
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          <div className="space-y-4 order-2 md:order-1">
            <div className="grid grid-cols-2 gap-2">
              {(Object.keys(FORMATS) as PrintFormat[]).map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => setFormat(f)}
                  className={`rounded-lg border px-3 py-2 text-sm font-semibold ${
                    format === f ? "border-primary bg-primary/10" : "border-border"
                  }`}
                >
                  {FORMATS[f].label}
                </button>
              ))}
            </div>

            <label className="block space-y-1">
              <span className="text-sm font-semibold">Business name</span>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={60}
                className={field}
              />
            </label>

            <div className="space-y-1">
              <span className="text-sm font-semibold">Message</span>
              <select
                value={msg}
                onChange={(e) => {
                  const i = Number(e.target.value);
                  setMsg(i);
                  setHeadline(MESSAGES[i]!.headline);
                  setSub(MESSAGES[i]!.sub);
                }}
                className={field}
              >
                {MESSAGES.map((m, i) => (
                  <option key={i} value={i}>
                    {m.headline}
                  </option>
                ))}
              </select>
              <input
                value={headline}
                onChange={(e) => setHeadline(e.target.value)}
                maxLength={60}
                className={field}
              />
              <textarea
                value={sub}
                onChange={(e) => setSub(e.target.value)}
                maxLength={140}
                rows={2}
                className={field}
              />
              <p className="text-[11px] text-muted-foreground">
                Keep it open to every customer and do not offer anything in return for a review.
                Google does not allow either.
              </p>
            </div>

            <div className="space-y-1">
              <span className="text-sm font-semibold">Colours</span>
              <div className="flex flex-wrap gap-2">
                {primary && (
                  <button
                    type="button"
                    title="Your brand colours"
                    aria-label="Your brand colours"
                    onClick={() => chooseTheme("brand")}
                    className={`w-9 h-9 rounded-full border-2 ${themeId === "brand" ? "border-primary" : "border-border"}`}
                    style={{
                      background: `linear-gradient(135deg, ${primary} 60%, ${secondary ?? primary} 60%)`,
                    }}
                  />
                )}
                {THEMES.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    title={t.name}
                    aria-label={t.name}
                    onClick={() => chooseTheme(t.id)}
                    className={`w-9 h-9 rounded-full border-2 ${themeId === t.id ? "border-primary" : "border-border"}`}
                    style={{ background: `linear-gradient(135deg, ${t.bg[0]}, ${t.bg[1]})` }}
                  />
                ))}
              </div>
              <div className="rounded-lg border border-border p-3 space-y-2">
                <span className="text-xs font-semibold">Your brand colours (hex codes)</span>
                {(
                  [
                    ["Primary (background)", primaryHex, setPrimaryHex, primary, "#0b1d3a"],
                    ["Secondary (highlight)", secondaryHex, setSecondaryHex, secondary, "#f5b324"],
                  ] as const
                ).map(([label, val, set, ok, eg]) => (
                  <label key={label} className="flex items-center gap-2 text-xs">
                    <input
                      type="color"
                      value={ok ?? eg}
                      onChange={(e) => {
                        set(e.target.value);
                        setThemeId("brand");
                      }}
                      className="w-9 h-9 rounded-md border border-border bg-background p-0.5 cursor-pointer shrink-0"
                      aria-label={label}
                    />
                    <span className="w-32 shrink-0 text-muted-foreground">{label}</span>
                    <input
                      value={val}
                      onChange={(e) => {
                        set(e.target.value);
                        if (normaliseHex(e.target.value)) setThemeId("brand");
                      }}
                      placeholder={eg}
                      maxLength={7}
                      spellCheck={false}
                      className={`${field} font-mono uppercase ${val && !ok ? "border-destructive" : ""}`}
                    />
                  </label>
                ))}
                <button
                  type="button"
                  disabled={savingBrand || !primary}
                  onClick={() => void keepBrand()}
                  className="w-full rounded-lg border border-border px-3 py-1.5 text-xs font-semibold disabled:opacity-50"
                >
                  {savingBrand ? "Saving..." : "Save as this business's brand colours"}
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <label className="rounded-lg border border-dashed border-border px-3 py-3 text-sm cursor-pointer text-center">
                <ImagePlus className="w-4 h-4 mx-auto mb-1" />
                {logo ? "Change logo" : "Add your logo"}
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => void pick(e.target.files?.[0], setLogo, "logo")}
                />
              </label>
              <label className="rounded-lg border border-dashed border-border px-3 py-3 text-sm cursor-pointer text-center">
                <ImagePlus className="w-4 h-4 mx-auto mb-1" />
                {photo ? "Change photo" : "Background photo"}
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => void pick(e.target.files?.[0], setPhoto, "photo")}
                />
              </label>
            </div>
            {(logo || photo) && (
              <div className="flex gap-3 text-xs">
                {logo && (
                  <button type="button" className="underline" onClick={() => forget("logo")}>
                    Remove logo
                  </button>
                )}
                {photo && (
                  <button type="button" className="underline" onClick={() => forget("photo")}>
                    Remove photo
                  </button>
                )}
              </div>
            )}
            {format === "a5" && (
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={footer}
                  onChange={(e) => setFooter(e.target.checked)}
                />
                Show "Point your phone camera at the code"
              </label>
            )}

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                disabled={!design || busy}
                onClick={async () => {
                  if (!design) return;
                  setBusy(true);
                  try {
                    await downloadPdf(design);
                  } catch {
                    toast.error("Could not make the PDF. Try again.");
                  }
                  setBusy(false);
                }}
                className="flex-1 rounded-lg bg-primary text-primary-foreground font-semibold px-4 py-2.5 inline-flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {busy ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Download className="w-4 h-4" />
                )}
                Print-ready PDF
              </button>
              <button
                type="button"
                disabled={!design}
                onClick={() => design && downloadPng(design)}
                className="rounded-lg border border-border px-4 py-2.5 font-semibold"
              >
                PNG
              </button>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Exact size with 3 mm bleed at 300 dpi. The dotted pink line in the preview is where it
              is cut; it is not printed.
            </p>
          </div>

          <div className="order-1 md:order-2 flex items-start justify-center bg-muted/40 rounded-xl p-4 min-h-[16rem]">
            <div ref={preview} className="flex items-center justify-center w-full" />
          </div>
        </div>
      </div>
    </div>
  );
}
