// The business's QR codes: what each one points to, scans in the last 30
// days, and a PNG to download for printing. No em dashes in this copy.
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useServerFn } from "@tanstack/react-start";
import { QRCodeCanvas } from "qrcode.react";
import { AlertTriangle, Download, Printer, QrCode } from "lucide-react";
import { PrintDesigner } from "./PrintDesigner";
import { getMyQrCodes, markQrDownloadedFn } from "../../lib/qr.functions";

type Code = Extract<Awaited<ReturnType<typeof getMyQrCodes>>, { ok: true }>["codes"][number];

function OneCode({
  c,
  business,
  hospitality,
}: {
  c: Code;
  business: string;
  hospitality: boolean;
}) {
  const [designing, setDesigning] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const markDownloaded = useServerFn(markQrDownloadedFn);
  const download = () => {
    const canvas = wrap.current?.querySelector("canvas");
    if (!canvas) return;
    const a = document.createElement("a");
    a.href = canvas.toDataURL("image/png");
    a.download = `repsuites-qr-${c.label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.png`;
    a.click();
    void markDownloaded().catch(() => null);
  };
  return (
    <li className="flex flex-wrap items-center gap-3 py-3">
      <div ref={wrap} className="shrink-0 rounded-lg border border-border bg-white p-1.5">
        <QRCodeCanvas value={c.url} size={512} style={{ width: 72, height: 72 }} marginSize={2} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="font-semibold truncate">{c.label}</p>
        {c.working ? (
          <p className="text-xs text-muted-foreground">
            Opens your review page - {c.scans30} scan{c.scans30 === 1 ? "" : "s"} in the last 30
            days
          </p>
        ) : (
          <div className="mt-1 rounded-md border border-amber-300 bg-amber-50 px-2 py-1.5 text-xs text-amber-900 dark:bg-amber-950/30 dark:text-amber-100">
            <p className="font-semibold inline-flex items-center gap-1">
              <AlertTriangle className="w-3.5 h-3.5" /> Not linked to a Google listing yet
            </p>
            <p>
              To fix it, connect your Google profile on the Settings tab. This code then links up by
              itself within about 30 minutes. Until then it will not open your review page.
            </p>
          </div>
        )}
      </div>
      <button
        type="button"
        onClick={() => setDesigning(true)}
        className="shrink-0 inline-flex items-center gap-1.5 rounded-lg bg-primary text-primary-foreground px-3 py-1.5 text-sm font-semibold"
      >
        <Printer className="w-4 h-4" /> Design print
      </button>
      {designing && (
        <PrintDesigner
          url={c.url}
          business={c.label === "Main code" ? business : `${business} ${c.label}`}
          hospitality={hospitality}
          onClose={() => {
            setDesigning(false);
            // Posts redraw their review cards with any new logo or background.
            window.dispatchEvent(new Event("repsuites:branding"));
          }}
        />
      )}
      <button
        type="button"
        onClick={download}
        className="shrink-0 inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm"
      >
        <Download className="w-4 h-4" /> QR only (image)
      </button>
    </li>
  );
}

export function QrCodesCard({ business }: { business: string }) {
  const read = useServerFn(getMyQrCodes);
  const [codes, setCodes] = useState<Code[] | null>(null);
  const [hospitality, setHospitality] = useState(false);
  useEffect(() => {
    read()
      .then((r) => {
        setCodes(r.ok ? r.codes : []);
        if (r.ok) setHospitality(r.hospitality);
      })
      .catch(() => setCodes([]));
  }, [read]);
  return (
    <section className="rounded-xl border border-border bg-card p-5">
      <h2 className="font-bold flex items-center gap-2 mb-1">
        <QrCode className="w-5 h-5" /> Review QR codes
      </h2>
      <p className="text-sm text-muted-foreground mb-2">
        Print your code on cards or stands and give it to customers. Tap Design print to make one.
      </p>
      {codes === null ? (
        <p className="text-sm text-muted-foreground">Loading...</p>
      ) : codes.length === 0 ? (
        <p className="text-sm text-muted-foreground">No QR codes for this business yet.</p>
      ) : (
        <ul className="divide-y divide-border">
          {codes.map((c) => (
            <OneCode key={c.id} c={c} business={business} hospitality={hospitality} />
          ))}
        </ul>
      )}
    </section>
  );
}

// Opens the print designer straight on the business's main QR code (from
// the Posts tab and the welcome card). If there is no code yet, it falls
// back to the QR card tab.
export function useMainQrDesigner(business: string, onDownloaded?: () => void) {
  const read = useServerFn(getMyQrCodes);
  const [open, setOpen] = useState(false);
  const [main, setMain] = useState<{ url: string; hospitality: boolean } | null>(null);
  const [loading, setLoading] = useState(false);
  const start = async () => {
    if (main) return setOpen(true);
    setLoading(true);
    const r = await read().catch(() => null);
    setLoading(false);
    const code = r?.ok ? (r.codes.find((c) => c.label === "Main code") ?? r.codes[0]) : null;
    if (!r?.ok || !code) {
      window.location.hash = "qr";
      window.location.reload();
      return;
    }
    setMain({ url: code.url, hospitality: r.hospitality });
    setOpen(true);
  };
  const designer: ReactNode =
    open && main ? (
      <PrintDesigner
        url={main.url}
        business={business}
        hospitality={main.hospitality}
        {...(onDownloaded ? { onDownloaded } : {})}
        onClose={() => {
          setOpen(false);
          window.dispatchEvent(new Event("repsuites:branding"));
        }}
      />
    ) : null;
  return { start, loading, designer };
}

// A small link on the Posts tab: make a printable review card for the main
// code without leaving the tab.
export function PrintCardButton({ business }: { business: string }) {
  const { start, loading, designer } = useMainQrDesigner(business);
  return (
    <div className="rounded-xl border border-border bg-card px-4 py-3 flex flex-wrap items-center justify-between gap-2">
      <p className="text-sm text-muted-foreground">
        Want reviews from people you meet in person? Print your review code.
      </p>
      <button
        type="button"
        disabled={loading}
        onClick={() => void start()}
        className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm font-semibold disabled:opacity-50"
      >
        <Printer className="w-4 h-4" /> Make a printable review card
      </button>
      {designer}
    </div>
  );
}
