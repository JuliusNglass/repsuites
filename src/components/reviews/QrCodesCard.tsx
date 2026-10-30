// The business's QR codes: what each one points to, scans in the last 30
// days, and a PNG to download for printing. No em dashes in this copy.
import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { QRCodeCanvas } from "qrcode.react";
import { Download, QrCode } from "lucide-react";
import { getMyQrCodes } from "../../lib/qr.functions";

type Code = Extract<Awaited<ReturnType<typeof getMyQrCodes>>, { ok: true }>["codes"][number];

function OneCode({ c }: { c: Code }) {
  const wrap = useRef<HTMLDivElement>(null);
  const download = () => {
    const canvas = wrap.current?.querySelector("canvas");
    if (!canvas) return;
    const a = document.createElement("a");
    a.href = canvas.toDataURL("image/png");
    a.download = `repsuites-qr-${c.label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.png`;
    a.click();
  };
  return (
    <li className="flex items-center gap-4 py-3">
      <div ref={wrap} className="shrink-0 rounded-lg border border-border bg-white p-1.5">
        <QRCodeCanvas value={c.url} size={512} style={{ width: 72, height: 72 }} marginSize={2} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="font-semibold truncate">{c.label}</p>
        <p className="text-xs text-muted-foreground">
          {c.working ? "Opens your review page" : "Not linked to a Google listing yet"}
          {" - "}
          {c.scans30} scan{c.scans30 === 1 ? "" : "s"} in the last 30 days
        </p>
      </div>
      <button
        type="button"
        onClick={download}
        className="shrink-0 inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm"
      >
        <Download className="w-4 h-4" /> PNG
      </button>
    </li>
  );
}

export function QrCodesCard() {
  const read = useServerFn(getMyQrCodes);
  const [codes, setCodes] = useState<Code[] | null>(null);
  useEffect(() => {
    read()
      .then((r) => setCodes(r.ok ? r.codes : []))
      .catch(() => setCodes([]));
  }, [read]);
  return (
    <section className="rounded-xl border border-border bg-card p-5">
      <h2 className="font-bold flex items-center gap-2 mb-1">
        <QrCode className="w-5 h-5" /> Review QR codes
      </h2>
      <p className="text-sm text-muted-foreground mb-2">
        Customers scan these on cards and table stands to reach your review page.
      </p>
      {codes === null ? (
        <p className="text-sm text-muted-foreground">Loading...</p>
      ) : codes.length === 0 ? (
        <p className="text-sm text-muted-foreground">No QR codes for this business yet.</p>
      ) : (
        <ul className="divide-y divide-border">
          {codes.map((c) => (
            <OneCode key={c.id} c={c} />
          ))}
        </ul>
      )}
    </section>
  );
}
