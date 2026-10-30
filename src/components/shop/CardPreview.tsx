// Live mock-ups of the NFC review card and the A5 table stand, showing the
// customer's own business name and message as they type.
// No em dashes in this copy (AGENTS.md).
import { QRCodeSVG } from "qrcode.react";
import { Star, Wifi } from "lucide-react";

const NAVY = "#0f1f33";
const GOLD = "#f5b324";

function Stars({ size = 14 }: { size?: number }) {
  return (
    <div className="flex gap-0.5" aria-hidden>
      {[0, 1, 2, 3, 4].map((i) => (
        <Star key={i} style={{ width: size, height: size, color: GOLD, fill: GOLD }} />
      ))}
    </div>
  );
}

export function CardPreview({
  name,
  message,
  className = "",
}: {
  name: string;
  message: string;
  className?: string;
}) {
  return (
    <div
      className={`relative aspect-[85.6/54] w-full rounded-[6%/9.5%] overflow-hidden shadow-2xl ${className}`}
      style={{ background: `linear-gradient(135deg, ${NAVY} 0%, #1b3556 100%)` }}
      role="img"
      aria-label={`Review card for ${name || "your business"}`}
    >
      <div
        className="absolute -right-10 -top-10 w-40 h-40 rounded-full opacity-20"
        style={{ background: GOLD }}
      />
      <div className="absolute inset-0 p-[6%] flex gap-[5%] text-white">
        <div className="flex-1 min-w-0 flex flex-col">
          <div className="text-sm sm:text-lg font-extrabold leading-tight line-clamp-2">
            {name || "Your Business"}
          </div>
          <div className="mt-1.5">
            <Stars />
          </div>
          <div className="mt-auto text-[11px] sm:text-xs leading-snug text-white/85 line-clamp-3">
            {message}
          </div>
          <div
            className="mt-2 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider"
            style={{ color: GOLD }}
          >
            <Wifi className="w-3.5 h-3.5 rotate-90" /> Tap or scan
          </div>
        </div>
        <div className="shrink-0 self-center bg-white rounded-lg p-1.5 w-[30%]">
          <QRCodeSVG value="https://repsuites.com" className="w-full h-auto" level="M" />
        </div>
      </div>
    </div>
  );
}

export function StandPreview({
  name,
  message,
  className = "",
}: {
  name: string;
  message: string;
  className?: string;
}) {
  return (
    <div className={`relative ${className}`} role="img" aria-label="A5 table stand">
      <div
        className="aspect-[148/210] w-full rounded-xl shadow-2xl overflow-hidden flex flex-col items-center text-center p-[8%] text-white"
        style={{ background: `linear-gradient(180deg, ${NAVY} 0%, #1b3556 100%)` }}
      >
        <div className="text-base sm:text-lg font-extrabold leading-tight line-clamp-2">
          {name || "Your Business"}
        </div>
        <div className="mt-2">
          <Stars size={12} />
        </div>
        <div className="mt-3 text-[11px] sm:text-xs text-white/85 leading-snug line-clamp-4">
          {message}
        </div>
        <div className="mt-auto bg-white rounded-lg p-2 w-[55%]">
          <QRCodeSVG value="https://repsuites.com" className="w-full h-auto" level="M" />
        </div>
        <div
          className="mt-2 text-[10px] font-semibold uppercase tracking-wider"
          style={{ color: GOLD }}
        >
          Tap your phone here
        </div>
      </div>
      <div className="mx-auto h-3 w-[70%] rounded-b-lg bg-slate-300/80" />
    </div>
  );
}

export const CARD_MESSAGES = [
  "Enjoyed your visit? A quick review helps a small business like ours more than you know.",
  "Thank you for choosing us. Tell others what you thought in 30 seconds.",
  "Loved it? Tap here to leave us a review. It takes less than a minute.",
];
