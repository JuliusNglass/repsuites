// Design a printable review card (table stand, business card, sticker and
// more) or an online picture for one QR code, in four numbered steps with a
// live preview, then download a print-ready PDF (or PNG).
// No em dashes in this copy (AGENTS.md).
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { QRCodeCanvas } from "qrcode.react";
import {
  CheckCircle2,
  ChevronDown,
  Copy,
  Download,
  ExternalLink,
  ImagePlus,
  Loader2,
  Printer,
  X,
} from "lucide-react";
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
import { markQrDownloadedFn } from "../../lib/qr.functions";
import {
  defaultFormat,
  defaultMessage,
  a4Sheet,
  downloadA4Sheet,
  downloadPdf,
  downloadPng,
  FORMAT_GROUPS,
  FORMATS,
  isDigital,
  MESSAGES,
  messageOrder,
  renderDesign,
  sheetText,
  sizeText,
  THEMES,
  type Design,
  type PrintFormat,
} from "../../lib/print-design";
import { fieldClass } from "../ui/field";

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

// A tiny outline of each format's shape for the format buttons.
function Thumb({ format }: { format: PrintFormat }) {
  const f = FORMATS[format];
  const w = f.px ? 30 : f.wMm >= f.hMm ? 26 : Math.round((26 * f.wMm) / f.hMm);
  const h = f.px ? 10 : f.wMm >= f.hMm ? Math.round((26 * f.hMm) / f.wMm) : 26;
  const q = Math.min(w, h) * 0.5;
  return (
    <svg width="32" height="28" viewBox="0 0 32 28" aria-hidden="true" className="shrink-0">
      {f.round ? (
        <circle
          cx="16"
          cy="14"
          r="12"
          className="fill-primary/15 stroke-primary"
          strokeWidth="1.2"
        />
      ) : (
        <rect
          x={16 - w / 2}
          y={14 - h / 2}
          width={w}
          height={h}
          rx="1.5"
          className="fill-primary/15 stroke-primary"
          strokeWidth="1.2"
        />
      )}
      <rect
        x={f.px || format === "card" ? 16 + w / 2 - q - 2 : 16 - q / 2}
        y={14 - q / 2}
        width={q}
        height={q}
        className="fill-foreground/70"
      />
    </svg>
  );
}

function Step({ n, title, children }: { n: number; title: string; children: ReactNode }) {
  return (
    <section className="space-y-2">
      <h3 className="flex items-center gap-2 font-bold">
        <span className="w-6 h-6 rounded-full bg-primary text-primary-foreground text-sm inline-flex items-center justify-center shrink-0">
          {n}
        </span>
        {title}
      </h3>
      <div className="pl-0 sm:pl-8 space-y-2">{children}</div>
    </section>
  );
}

const field = fieldClass;

export function PrintDesigner({
  url,
  business,
  hospitality = false,
  onClose,
  onDownloaded,
}: {
  url: string;
  business: string;
  // Restaurants, cafes, bars and hotels start on the table stand; everyone
  // else on the business card.
  hospitality?: boolean;
  onClose: () => void;
  // Called after any download, e.g. to tick "Print your QR code".
  onDownloaded?: () => void;
}) {
  const qrWrap = useRef<HTMLDivElement>(null);
  const preview = useRef<HTMLDivElement>(null);
  const [format, setFormat] = useState<PrintFormat>(() => defaultFormat(hospitality));
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
  const order = useMemo(() => messageOrder(hospitality), [hospitality]);
  const [msg, setMsg] = useState(() => defaultMessage(hospitality));
  const [headline, setHeadline] = useState(() => MESSAGES[defaultMessage(hospitality)]!.headline);
  const [sub, setSub] = useState(() => MESSAGES[defaultMessage(hospitality)]!.sub);
  const [logo, setLogo] = useState<HTMLImageElement | null>(null);
  const [photo, setPhoto] = useState<HTMLImageElement | null>(null);
  const [footer, setFooter] = useState(true);
  const [busy, setBusy] = useState<"pdf" | "a4" | null>(null);
  const [done, setDone] = useState(false);
  const [moreColours, setMoreColours] = useState(false);
  const [qrReady, setQrReady] = useState(false);
  const markDownloaded = useServerFn(markQrDownloadedFn);

  useEffect(() => setQrReady(true), []);

  const design = useMemo((): Design | null => {
    const [qr, powered] = Array.from(qrWrap.current?.querySelectorAll("canvas") ?? []);
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
      ...(powered ? { poweredQr: powered } : {}),
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
    // Small cards are drawn a little bigger so the words can be read.
    const f = FORMATS[design.format];
    const scale = f.px ? 1 : f.wMm <= 60 ? 0.6 : f.wMm <= 110 ? 0.4 : 0.3;
    const c = renderDesign(design, true, scale);
    c.className = `max-w-full h-auto shadow-lg ${f.round ? "rounded-full" : "rounded-lg"}`;
    c.style.maxHeight = "45vh";
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
  const finished = () => {
    setDone(true);
    void markDownloaded().catch(() => null);
    onDownloaded?.();
  };
  const run = async (kind: "pdf" | "a4" | "png") => {
    if (!design) return;
    if (kind === "png") {
      downloadPng(design);
      return finished();
    }
    setBusy(kind);
    try {
      await (kind === "a4" ? downloadA4Sheet(design) : downloadPdf(design));
      finished();
    } catch {
      toast.error("Could not make the PDF. Try again.");
    }
    setBusy(null);
  };
  const digital = isDigital(format);
  const sheet = digital ? null : a4Sheet(FORMATS[format].wMm, FORMATS[format].hMm);
  const chooseTheme = (id: string) => {
    setThemeId(id);
    void saveBrandLook({ data: { standTheme: id } }).catch(() => null);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center">
      <div className="bg-background w-full sm:max-w-4xl max-h-[95vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl p-4 sm:p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="font-bold text-lg">Make a review card</h2>
            <p className="text-base text-muted-foreground">
              Four quick steps. The preview updates as you go.
            </p>
          </div>
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
          {/* Small "Powered by RepSuites" code on the stand. */}
          <QRCodeCanvas
            value="https://repsuites.com/?utm_source=stand"
            size={500}
            level="M"
            marginSize={0}
          />
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          <div className="min-w-0 space-y-6 order-2 md:order-1">
            <Step n={1} title="Choose what to print">
              {FORMAT_GROUPS.map((g) => (
                <div key={g.id} className="space-y-1.5">
                  <p className="text-base font-semibold text-muted-foreground">{g.title}</p>
                  <div className="grid sm:grid-cols-2 gap-2">
                    {(Object.keys(FORMATS) as PrintFormat[])
                      .filter((f) => FORMATS[f].group === g.id)
                      .map((f) => (
                        <button
                          key={f}
                          type="button"
                          onClick={() => setFormat(f)}
                          aria-pressed={format === f}
                          className={`flex items-center gap-2.5 rounded-lg border px-3 py-2 text-left ${
                            format === f ? "border-primary bg-primary/10" : "border-border"
                          }`}
                        >
                          <Thumb format={f} />
                          <span className="min-w-0">
                            <span className="block text-base font-semibold leading-tight">
                              {FORMATS[f].label}
                            </span>
                            <span className="block text-base text-muted-foreground leading-tight">
                              Best for: {FORMATS[f].bestFor}
                            </span>
                          </span>
                        </button>
                      ))}
                  </div>
                </div>
              ))}
            </Step>

            <Step n={2} title="Choose the words">
              <label className="block space-y-1">
                <span className="text-base font-semibold">Business name</span>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  maxLength={60}
                  className={field}
                />
              </label>
              <div className="space-y-1">
                <span className="text-base font-semibold">Message</span>
                <select
                  aria-label="Message on the card"
                  value={msg}
                  onChange={(e) => {
                    const i = Number(e.target.value);
                    setMsg(i);
                    setHeadline(MESSAGES[i]!.headline);
                    setSub(MESSAGES[i]!.sub);
                  }}
                  className={field}
                >
                  {order.map((i) => (
                    <option key={i} value={i}>
                      {MESSAGES[i]!.headline}
                    </option>
                  ))}
                </select>
                <input
                  value={headline}
                  onChange={(e) => setHeadline(e.target.value)}
                  maxLength={60}
                  aria-label="Headline"
                  className={field}
                />
                {FORMATS[format].small || isDigital(format) ? (
                  <p className="text-base text-muted-foreground">
                    This size only shows the headline, so keep it short
                    {headline.length > 32 ? " (yours is quite long)" : ""}.
                  </p>
                ) : (
                  <textarea
                    value={sub}
                    onChange={(e) => setSub(e.target.value)}
                    maxLength={140}
                    rows={2}
                    aria-label="Second line"
                    className={field}
                  />
                )}
                <p className="text-base text-muted-foreground">
                  Keep it open to every customer and do not offer anything in return for a review.
                  Google does not allow either.
                </p>
              </div>
              {format !== "coaster" && format !== "sticker" && format !== "square" && (
                <label className="flex items-center gap-2 text-base">
                  <input
                    type="checkbox"
                    checked={footer}
                    onChange={(e) => setFooter(e.target.checked)}
                  />
                  Show a short "scan the code" line
                </label>
              )}
            </Step>

            <Step n={3} title="Your look">
              <div className="space-y-1">
                <span className="text-base font-semibold">Colours</span>
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
                <button
                  type="button"
                  onClick={() => setMoreColours((v) => !v)}
                  aria-expanded={moreColours}
                  className="inline-flex items-center gap-1 text-base font-semibold underline underline-offset-2 py-1"
                >
                  More colours
                  <ChevronDown
                    className={`w-3.5 h-3.5 transition-transform ${moreColours ? "rotate-180" : ""}`}
                  />
                </button>
                {moreColours && (
                  <div className="rounded-lg border border-border p-3 space-y-2">
                    <span className="text-base font-semibold">Your brand colours (hex codes)</span>
                    {(
                      [
                        ["Primary (background)", primaryHex, setPrimaryHex, primary, "#0b1d3a"],
                        [
                          "Secondary (highlight)",
                          secondaryHex,
                          setSecondaryHex,
                          secondary,
                          "#f5b324",
                        ],
                      ] as const
                    ).map(([label, val, set, ok, eg]) => (
                      <label key={label} className="flex items-center gap-2 text-base">
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
                      className="w-full rounded-lg border border-border px-3 py-1.5 text-base font-semibold disabled:opacity-50"
                    >
                      {savingBrand ? "Saving..." : "Save as this business's brand colours"}
                    </button>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-2">
                <label className="rounded-lg border border-dashed border-border px-3 py-3 text-base cursor-pointer text-center">
                  <ImagePlus className="w-4 h-4 mx-auto mb-1" />
                  {logo ? "Change logo" : "Add your logo"}
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => void pick(e.target.files?.[0], setLogo, "logo")}
                  />
                </label>
                <label className="rounded-lg border border-dashed border-border px-3 py-3 text-base cursor-pointer text-center">
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
                <div className="flex flex-wrap gap-3 text-base">
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
            </Step>

            <Step n={4} title="Download">
              <p className="text-base text-muted-foreground">
                Size: <b>{sizeText(format)}</b>
                {digital ? "" : ", with 3 mm extra round the edge (bleed) at 300 dpi"}
              </p>
              <div className="flex flex-col gap-2">
                {!digital && (
                  <button
                    type="button"
                    disabled={!design || !!busy}
                    onClick={() => void run("pdf")}
                    className="rounded-lg bg-primary text-primary-foreground font-semibold px-4 py-2.5 inline-flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    {busy === "pdf" ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Download className="w-4 h-4" />
                    )}
                    PDF for a print shop
                  </button>
                )}
                {!digital && sheet && sheet.count > 0 && (
                  <button
                    type="button"
                    disabled={!design || !!busy}
                    onClick={() => void run("a4")}
                    className="rounded-lg border border-primary text-foreground font-semibold px-4 py-2.5 inline-flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    {busy === "a4" ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Printer className="w-4 h-4" />
                    )}
                    A4 sheet to print at home ({sheetText(format)})
                  </button>
                )}
                <button
                  type="button"
                  disabled={!design}
                  onClick={() => void run("png")}
                  className={
                    digital
                      ? "rounded-lg bg-primary text-primary-foreground font-semibold px-4 py-2.5 inline-flex items-center justify-center gap-2 disabled:opacity-50"
                      : "rounded-lg border border-border px-4 py-2.5 text-base font-semibold inline-flex items-center justify-center gap-2 disabled:opacity-50"
                  }
                >
                  <Download className="w-4 h-4" />{" "}
                  {digital ? "Download picture (PNG)" : "Picture (PNG)"}
                </button>
              </div>
              {isDigital(format) ? (
                <div className="rounded-lg border border-border bg-muted/40 p-3 text-base space-y-2">
                  <p>
                    Add the picture to your email signature, invoices or WhatsApp. In an email, link
                    the picture to your review page so people can tap it:
                  </p>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 min-w-0 truncate rounded bg-background border border-border px-2 py-1">
                      {url}
                    </code>
                    <button
                      type="button"
                      onClick={() =>
                        void navigator.clipboard
                          .writeText(url)
                          .then(() => toast.success("Link copied"))
                          .catch(() => toast.error("Could not copy the link."))
                      }
                      className="shrink-0 inline-flex items-center gap-1 rounded border border-border px-2 py-1 font-semibold"
                    >
                      <Copy className="w-3.5 h-3.5" /> Copy
                    </button>
                  </div>
                </div>
              ) : (
                <div className="rounded-lg border border-amber-300 bg-amber-50 text-amber-950 dark:bg-amber-950/30 dark:text-amber-100 p-3 text-base space-y-1">
                  <p className="font-semibold">Tip</p>
                  <p>
                    On a phone: open the PDF, tap Share, then Print. Or take it to any print shop.
                  </p>
                  <p>
                    The A4 sheet prints on plain paper or card at home. Print at actual size (100%),
                    then cut on the grey lines.
                    {sheet?.tight ? " Your printer may leave a thin white edge. Trim it off." : ""}
                  </p>
                  <p>
                    For a print shop or online printer (e.g. Vistaprint, Solopress), use the PDF for
                    a print shop and ask for the size shown.
                  </p>
                  <p className="text-base">
                    The dotted line in the preview shows where it is cut. It is not printed.
                  </p>
                </div>
              )}
            </Step>
          </div>

          <div className="min-w-0 order-1 md:order-2 md:sticky md:top-0 md:self-start flex flex-col items-center gap-2 bg-muted/40 rounded-xl p-4 min-h-[10rem]">
            <p className="text-base font-semibold text-muted-foreground">
              Preview: {FORMATS[format].label}
            </p>
            <div ref={preview} className="flex items-center justify-center w-full min-w-0" />
            <button
              type="button"
              disabled={!design || !!busy}
              onClick={() => void run(digital ? "png" : "pdf")}
              className="mt-1 w-full max-w-xs rounded-lg bg-primary text-primary-foreground font-semibold px-4 py-2.5 inline-flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {busy === "pdf" ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Download className="w-4 h-4" />
              )}
              {digital ? "Download picture" : "Download PDF"}
            </button>
            {!digital && (
              <p className="text-base text-muted-foreground text-center">
                Printing at home? Use the A4 sheet in step 4.
              </p>
            )}
            {done && (
              <div
                role="status"
                className="w-full max-w-xs rounded-lg border border-emerald-300 bg-emerald-50 text-emerald-950 dark:bg-emerald-950/30 dark:text-emerald-100 p-3 text-base space-y-1"
              >
                <p className="font-semibold inline-flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4" /> Done. Scan it with another phone to test
                </p>
                <a
                  href={url}
                  target="_blank"
                  rel="noopener"
                  className="inline-flex items-center gap-1 font-semibold underline underline-offset-2"
                >
                  Open my review page <ExternalLink className="w-3.5 h-3.5" />
                </a>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
