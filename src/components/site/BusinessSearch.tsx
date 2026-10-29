// Business name field with Google listing suggestions. As the person types we
// show up to 5 matching businesses; picking one shows an "Is this you?" card
// they confirm, which fills the rest of the form. If nothing matches (or the
// lookup is not set up) the field works as a normal text box.
// No em dashes in this copy (AGENTS.md).
import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Check, Loader2, MapPin, Star, X } from "lucide-react";
import {
  getBusinessDetails,
  suggestBusinesses,
  type BusinessDetails,
  type BusinessSuggestion,
} from "../../lib/places.functions";

function newSession(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function BusinessSearch({
  value,
  onChange,
  confirmed,
  onConfirm,
}: {
  value: string;
  onChange: (v: string) => void;
  confirmed: BusinessDetails | null;
  onConfirm: (b: BusinessDetails | null) => void;
}) {
  const suggest = useServerFn(suggestBusinesses);
  const details = useServerFn(getBusinessDetails);
  const session = useRef(newSession());
  const [items, setItems] = useState<BusinessSuggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [loading, setLoading] = useState(false);
  const [pending, setPending] = useState<BusinessDetails | null>(null);
  const skipNext = useRef(false);

  // Look up suggestions a moment after typing stops.
  useEffect(() => {
    if (skipNext.current) {
      skipNext.current = false;
      return;
    }
    const q = value.trim();
    if (q.length < 3 || confirmed) {
      setItems([]);
      return;
    }
    let stale = false;
    const t = setTimeout(async () => {
      try {
        const r = await suggest({ data: { q, session: session.current } });
        if (!stale) {
          setItems(r.suggestions);
          setOpen(r.suggestions.length > 0);
          setActive(-1);
        }
      } catch {
        if (!stale) setItems([]);
      }
    }, 300);
    return () => {
      stale = true;
      clearTimeout(t);
    };
  }, [value, confirmed, suggest]);

  const pick = async (s: BusinessSuggestion) => {
    setOpen(false);
    setLoading(true);
    try {
      const r = await details({ data: { placeId: s.placeId, session: session.current } });
      if (r.business) setPending(r.business);
    } catch {
      // keep the typed name; the form still works
    } finally {
      setLoading(false);
      // A new search after this one is a new Google session.
      session.current = newSession();
    }
  };

  if (confirmed) {
    return (
      <div className="space-y-1">
        <span className="text-sm font-semibold">Business</span>
        <div className="rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2.5 flex items-start gap-2">
          <Check className="w-4 h-4 text-emerald-700 mt-0.5 shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-emerald-950 truncate">{confirmed.name}</p>
            <p className="text-xs text-emerald-900/80 truncate">{confirmed.address}</p>
          </div>
          <button
            type="button"
            onClick={() => {
              onConfirm(null);
              setPending(null);
            }}
            className="text-xs font-semibold text-emerald-900 underline underline-offset-2 shrink-0"
          >
            Change
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-1 relative">
      <label className="block space-y-1">
        <span className="text-sm font-semibold">Business name</span>
        <div className="relative">
          <input
            type="text"
            required
            autoComplete="off"
            role="combobox"
            aria-expanded={open}
            aria-controls="business-suggestions"
            aria-autocomplete="list"
            placeholder="Start typing and pick your business"
            value={value}
            onChange={(e) => {
              onChange(e.target.value);
              setPending(null);
            }}
            onFocus={() => items.length > 0 && setOpen(true)}
            onBlur={() => setTimeout(() => setOpen(false), 150)}
            onKeyDown={(e) => {
              if (!open || items.length === 0) return;
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setActive((a) => Math.min(a + 1, items.length - 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setActive((a) => Math.max(a - 1, 0));
              } else if (e.key === "Enter" && active >= 0) {
                e.preventDefault();
                const s = items[active];
                if (s) void pick(s);
              } else if (e.key === "Escape") {
                setOpen(false);
              }
            }}
            className="w-full rounded-lg border border-input bg-background px-3 py-2.5 pr-9"
          />
          {loading && (
            <Loader2 className="w-4 h-4 animate-spin absolute right-3 top-3 text-muted-foreground" />
          )}
        </div>
      </label>

      {open && items.length > 0 && (
        <ul
          id="business-suggestions"
          role="listbox"
          className="absolute z-20 left-0 right-0 mt-1 rounded-lg border border-border bg-card shadow-lg overflow-hidden"
        >
          {items.map((s, i) => (
            <li key={s.placeId} role="option" aria-selected={i === active}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => void pick(s)}
                className={`w-full text-left px-3 py-2.5 flex items-start gap-2 hover:bg-muted ${
                  i === active ? "bg-muted" : ""
                }`}
              >
                <MapPin className="w-4 h-4 mt-0.5 shrink-0 text-muted-foreground" />
                <span className="min-w-0">
                  <span className="block font-medium truncate">{s.name}</span>
                  <span className="block text-xs text-muted-foreground truncate">{s.detail}</span>
                </span>
              </button>
            </li>
          ))}
          <li className="px-3 py-1.5 text-[11px] text-muted-foreground border-t border-border">
            Not listed? Just type your business name.
          </li>
        </ul>
      )}

      {pending && (
        <div className="rounded-xl border border-border bg-muted/40 p-4 mt-2 space-y-3">
          <p className="text-sm font-semibold">Is this your business?</p>
          <div>
            <p className="font-bold">{pending.name}</p>
            <p className="text-sm text-muted-foreground">{pending.address}</p>
            {pending.rating != null && (
              <p className="text-sm mt-1 inline-flex items-center gap-1">
                <Star className="w-4 h-4 fill-amber-400 text-amber-400" />
                {pending.rating.toFixed(1)}
                <span className="text-muted-foreground">
                  ({pending.reviewCount ?? 0} Google review{pending.reviewCount === 1 ? "" : "s"})
                </span>
              </p>
            )}
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => {
                skipNext.current = true;
                onConfirm(pending);
                setPending(null);
                setItems([]);
              }}
              className="rounded-lg bg-primary text-primary-foreground font-semibold px-4 py-2 text-sm inline-flex items-center gap-1.5"
            >
              <Check className="w-4 h-4" /> Yes, that's mine
            </button>
            <button
              type="button"
              onClick={() => setPending(null)}
              className="rounded-lg border border-border px-4 py-2 text-sm inline-flex items-center gap-1.5"
            >
              <X className="w-4 h-4" /> No
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
