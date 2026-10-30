// Server-only: the shareable insight report a prospect opens (/r/<token>).
// Plain HTML so it loads instantly on a phone and prints cleanly to PDF.
// No em dashes in this copy (AGENTS.md).
import type { Report } from "./prospects.server";
import type { ProspectSnapshot } from "./prospect-connect.server";
import { gridSpots, pinAt, zoomFor } from "./report-map";
import { usesMiles } from "./units";

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

function bookingLink(name: string): string {
  const url = (process.env["REPSUITES_BOOKING_URL"] ?? "").trim();
  if (/^https:\/\//.test(url)) return url;
  const subject = encodeURIComponent(`Google visibility report for ${name}`);
  return `mailto:julius@accelur8.com?subject=${subject}`;
}

function scoreColour(n: number): string {
  return n >= 75 ? "#059669" : n >= 50 ? "#d97706" : "#dc2626";
}

const STYLE = `
*{box-sizing:border-box}body{margin:0;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;background:#f6faf9;color:#0f172a;line-height:1.5}
main{max-width:44rem;margin:0 auto;padding:28px 18px 40px}
.brand{display:flex;align-items:center;gap:8px;font-weight:800;margin-bottom:20px}.brand img{width:28px;height:28px;border-radius:6px}
h1{font-size:1.55rem;line-height:1.2;margin:0 0 4px}h2{font-size:1.1rem;margin:28px 0 10px}
.muted{color:#64748b;font-size:.9rem}
.card{background:#fff;border:1px solid #e2e8f0;border-radius:16px;padding:16px;margin:12px 0}
.score{display:flex;align-items:center;gap:16px}.dial{width:84px;height:84px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:1.8rem;font-weight:800;color:#fff;flex-shrink:0}
.bar{height:8px;background:#e2e8f0;border-radius:4px;overflow:hidden;margin-top:4px}.bar>span{display:block;height:100%;background:#0f172a}
table{width:100%;border-collapse:collapse;font-size:.95rem}td,th{padding:8px 6px;border-bottom:1px solid #e2e8f0;text-align:left}th{font-size:.8rem;color:#64748b;font-weight:600}
tr.you td{font-weight:700;background:#fffbeb}
.fix{border-left:4px solid #f59e0b;padding:10px 12px;background:#fff;border-radius:8px;margin:8px 0}.fix.high{border-color:#dc2626}
.fix b{display:block}.fix span{color:#475569;font-size:.92rem}
.cta{display:block;text-align:center;background:#f5b324;color:#0f172a;font-weight:800;text-decoration:none;border-radius:14px;padding:16px;font-size:1.05rem;margin-top:16px}
.small{font-size:.8rem;color:#64748b}
.map{position:relative;aspect-ratio:1;max-width:520px;margin:0 auto;border-radius:12px;overflow:hidden;background:#e8eef0}
.map img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
.pin{position:absolute;transform:translate(-50%,-50%);width:30px;height:30px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:.72rem;border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.35)}
.pin.home{width:38px;height:38px;background:#0f172a;z-index:3}
.pin.home .rank{position:absolute;right:-10px;top:-10px;min-width:22px;height:22px;padding:0 4px;border-radius:11px;font-size:.68rem;display:flex;align-items:center;justify-content:center;border:2px solid #fff}
.rpin{position:absolute;transform:translate(-50%,-100%);width:22px;height:22px;border-radius:50% 50% 50% 0;rotate:-45deg;background:#475569;color:#fff;font-weight:800;font-size:.7rem;display:flex;align-items:center;justify-content:center;border:2px solid #fff;z-index:2;box-shadow:0 1px 3px rgba(0,0,0,.35)}
.rkey{display:inline-block;width:16px;height:16px;border-radius:50%;background:#475569;color:#fff;text-align:center;font-size:.65rem;line-height:16px}
@media print{.cta,.noprint{display:none}body{background:#fff}.card{break-inside:avoid}}
`;

const FLASH: Record<string, string> = {
  connected: "Done. Your real numbers from Google are below.",
  cancelled: "No problem. Nothing was shared.",
  noprofile:
    "That Google account does not look after a Business Profile. Try the account you use for your profile.",
  permission:
    "Google did not give permission to read the figures, so nothing was shared. Tick the box on Google's screen to try again.",
  expired: "That took a little long. Please try again.",
  failed: "Google could not give us the figures just now. Please try again in a few minutes.",
  unavailable: "This is not available just now. Please try again later.",
};

// "0.4 miles" or "1.2 km". Worked example: 1.6 km divided by 1.609 is about 1 mile.
function distanceText(km: number, miles: boolean): string {
  if (!miles) return `${km.toFixed(1)} km`;
  const m = Math.round((km / 1.609344) * 10) / 10;
  return `${m} mile${m === 1 ? "" : "s"}`;
}

function fmt(n: number): string {
  return Math.round(n).toLocaleString("en-GB");
}

// "See your real numbers": the invitation, or the figures once shared.
function realNumbers(token: string, snap: ProspectSnapshot | null, flash: string): string {
  const note = FLASH[flash]
    ? `<div class="card" style="border-color:${flash === "connected" ? "#059669" : "#f59e0b"}">${esc(FLASH[flash]!)}</div>`
    : "";
  const connect = `/api/prospect-connect?r=${encodeURIComponent(token)}`;
  if (!snap)
    return `<div class="noprint">${note}<h2>See your real numbers</h2><div class="card">
<p style="margin:0">Google keeps private figures only the owner can see: how many people <b>called you</b>, <b>asked for directions</b> and <b>visited your website</b> from your Google profile, and the words they searched. Sign in with the Google account you use for your profile to add them to this report.</p>
<a class="cta" style="margin-top:14px" href="${connect}">See my real numbers</a>
<p class="small" style="margin:10px 0 0">Free, and takes a minute. We read the figures once and keep no access to your profile afterwards. Google will ask you to allow RepSuites; you can remove it any time in your Google account under Security, Third-party connections.</p></div></div>`;
  const c = snap.current;
  const pv = snap.previous;
  const views = c.searchViews + c.mapsViews;
  const viewsBefore = pv.searchViews + pv.mapsViews;
  const leads = c.calls + c.directions + c.websiteClicks;
  const leadsBefore = pv.calls + pv.directions + pv.websiteClicks;
  const delta = (now: number, before: number) => {
    if (before <= 0) return "";
    const up = now >= before;
    return `<div class="small" style="color:${up ? "#059669" : "#dc2626"}">${up ? "Up" : "Down"} from ${fmt(before)}</div>`;
  };
  const tile = (label: string, now: number, before: number) =>
    `<div style="background:#f8fafc;border-radius:12px;padding:12px"><div style="font-size:1.5rem;font-weight:800">${fmt(now)}</div><div style="font-size:.88rem">${label}</div>${delta(now, before)}</div>`;
  const perWeek = Math.round(leads / 13);
  const words = snap.searchTerms.length
    ? `<p style="margin:16px 0 6px"><b>What people typed to find you</b> <span class="small">(${esc(snap.searchMonth)})</span></p><ul style="margin:0;padding-left:18px">${snap.searchTerms
        .map(
          (t) =>
            `<li>${esc(t.term)} <span class="small">(${t.under ? "under " : ""}${fmt(t.count)})</span></li>`,
        )
        .join("")}</ul>`
    : "";
  const when = new Date(snap.at).toLocaleDateString("en-GB", { day: "numeric", month: "long" });
  return `${note}<h2>Your real numbers from Google</h2><div class="card">
<p class="muted" style="margin:0 0 12px">${esc(snap.title)}, last 3 months (to ${esc(new Date(snap.period.end + "T12:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "long" }))}). Read from Google on ${esc(when)}.</p>
<div style="display:grid;grid-template-columns:repeat(2,1fr);gap:8px">
${tile("times your profile was seen", views, viewsBefore)}
${tile("phone calls", c.calls, pv.calls)}
${tile("requests for directions", c.directions, pv.directions)}
${tile("website visits", c.websiteClicks, pv.websiteClicks)}
</div>
<p style="margin:14px 0 0">That is about <b>${fmt(perWeek)} people a week</b> getting in touch with you from Google${leadsBefore > 0 && leads !== leadsBefore ? ` (${leads > leadsBefore ? "up" : "down"} from ${fmt(Math.round(leadsBefore / 13))})` : ""}.</p>
<p class="muted" style="margin:8px 0 0">More reviews and more top 3 spots on the map mean more of these.</p>
${words}
<p class="small" style="margin:14px 0 0">We keep these figures, not access to your profile. <a href="${connect}" style="color:#64748b">Update my numbers</a></p></div>`;
}

const HOUSE = `<svg viewBox="0 0 24 24" width="18" height="18" fill="#fff" aria-hidden="true"><path d="M12 3 2 11h3v9h5v-6h4v6h5v-9h3z"/></svg>`;

// The 5 by 5 check drawn as pins on a real Google map, the business as a
// house in the middle and its nearest rivals as lettered grey pins. If the
// map picture cannot load, the pins still show on a plain background.
function heatMap(r: Report, extra: RenderExtra | null): string {
  const hm = r.grid!;
  const b = r.business;
  const center = hm.center ?? extra?.center ?? null;
  const miles = usesMiles(center?.lat, center?.lng);
  const spacingKm = hm.spacingKm ?? (miles ? 0.8 : 1);
  const colour = (v: number | null) =>
    v === -1
      ? { bg: "#94a3b8", fg: "#fff", t: "?" }
      : v === null
        ? { bg: "#dc2626", fg: "#fff", t: "20+" }
        : v <= 3
          ? { bg: "#059669", fg: "#fff", t: String(v) }
          : v <= 10
            ? { bg: "#f59e0b", fg: "#111", t: String(v) }
            : { bg: "#ef4444", fg: "#fff", t: String(v) };
  const summary = `<p style="margin:14px 0 0">You are in the <b>top 3 in ${hm.top3} of 25 spots</b>${hm.found < 25 ? `, and not in the first 20 results in ${25 - hm.found}` : ""}. The top 3 get most of the calls, so every red or amber pin is customers going elsewhere.</p>`;
  const intro = `<p style="margin:0 0 12px">We searched <b>"${esc(r.maps.keyword)}"</b> on Google Maps from 25 spots around you, each ${esc(hm.spacing)} apart, as a customer standing there would. Each pin shows where you came in the results from that spot. The house is you.</p>`;
  const legend = `<p class="small" style="text-align:center;margin:10px 0 0"><span style="color:#059669">&#9679;</span> top 3 &nbsp; <span style="color:#f59e0b">&#9679;</span> 4 to 10 &nbsp; <span style="color:#ef4444">&#9679;</span> 11 or lower &nbsp; <span style="color:#dc2626">&#9679;</span> not in the first 20</p>`;
  if (!center || !extra) {
    // No location stored: the plain grid.
    const dots = hm.ranks
      .map((v) => {
        const d = colour(v);
        return `<div style="aspect-ratio:1;border-radius:50%;background:${d.bg};color:${d.fg};display:flex;align-items:center;justify-content:center;font-weight:800;font-size:.85rem">${d.t}</div>`;
      })
      .join("");
    return `<h2>Where you show up across your area</h2><div class="card">${intro}<div style="display:grid;grid-template-columns:repeat(${hm.size},1fr);gap:8px;max-width:340px;margin:0 auto">${dots}</div>${legend}${summary}</div>`;
  }
  const zoom = zoomFor(center.lat, spacingKm);
  const spots = gridSpots(center, hm.size, spacingKm);
  const mid = Math.floor((hm.size * hm.size) / 2);
  const pins = spots
    .map((pt, i) => {
      const at = pinAt(center, zoom, pt);
      if (!at) return "";
      const d = colour(hm.ranks[i] ?? -1);
      // The middle spot is the business itself: shown by the house instead.
      if (i === mid)
        return `<div class="pin home" style="left:${at.x}%;top:${at.y}%" title="${esc(b.name)}: number ${hm.ranks[i] ?? "20+"} here">${HOUSE}<span class="rank" style="background:${d.bg};color:${d.fg}">${d.t}</span></div>`;
      return `<div class="pin" style="left:${at.x}%;top:${at.y}%;background:${d.bg};color:${d.fg}">${d.t}</div>`;
    })
    .join("");
  const letters = "ABC";
  const shown = r.rivals
    .map((x, i) => ({
      x,
      i,
      at: x.lat != null && x.lng != null ? pinAt(center, zoom, { lat: x.lat, lng: x.lng }) : null,
    }))
    .filter((v) => v.at);
  const rivalPins = shown
    .map(
      ({ x, i, at }) =>
        `<div class="rpin" style="left:${at!.x}%;top:${at!.y}%" title="${esc(x.name)}">${letters[i]}</div>`,
    )
    .join("");
  const rivalKey = shown.length
    ? `<p class="small" style="margin:8px 0 0">${shown.map(({ x, i }) => `<b class="rkey">${letters[i]}</b> ${esc(x.name)}`).join(" &nbsp; ")}</p>`
    : "";
  const mapLink = b.mapsUrl
    ? `<p class="small noprint" style="margin:8px 0 0;text-align:center"><a href="${esc(b.mapsUrl)}" target="_blank" rel="noopener" style="color:#64748b">Open your business in Google Maps</a></p>`
    : "";
  return `<h2>Where you show up across your area</h2><div class="card">${intro}
<div class="map"><img src="/api/report-map?r=${encodeURIComponent(extra.token)}" alt="Map of the area around ${esc(b.name)}" onerror="this.remove()">${pins}${rivalPins}</div>
${legend}${rivalKey}${mapLink}${summary}</div>`;
}

export interface RenderExtra {
  token: string;
  snapshot: ProspectSnapshot | null;
  flash: string;
  center?: { lat: number; lng: number } | null;
}

export function renderReport(r: Report, extra: RenderExtra | null = null): string {
  const b = r.business;
  const date = new Date(r.createdAt).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  const rows = [
    {
      name: `${b.name} (you)`,
      rating: b.rating,
      reviews: b.reviews,
      you: true,
      away: "",
      kind: "",
    },
    ...r.rivals.map((x) => ({
      name: x.name,
      rating: x.rating,
      reviews: x.reviews,
      you: false,
      away:
        x.km != null ? distanceText(x.km, usesMiles(extra?.center?.lat, extra?.center?.lng)) : "",
      kind: x.kind ?? "",
    })),
  ];
  const mapsLine = !r.maps.checked
    ? ""
    : r.maps.position === null
      ? `<p>Searching <b>"${esc(r.maps.keyword)}"</b> from your own street, you are <b>not in the first 20</b> results on Google Maps.</p>`
      : `<p>Searching <b>"${esc(r.maps.keyword)}"</b> from your own street, you are <b>number ${r.maps.position}</b> on Google Maps.${r.maps.position <= 3 ? " That is the top 3. Well done." : " The first 3 are the ones most people tap."}</p>`;
  // Heatmap: one coloured dot per spot, the business in the middle.
  const hm = r.grid;
  const dot = (v: number | null) =>
    v === -1
      ? { bg: "#e2e8f0", fg: "#64748b", t: "?" }
      : v === null
        ? { bg: "#dc2626", fg: "#fff", t: "20+" }
        : v <= 3
          ? { bg: "#059669", fg: "#fff", t: String(v) }
          : v <= 10
            ? { bg: "#f59e0b", fg: "#111", t: String(v) }
            : { bg: "#ef4444", fg: "#fff", t: String(v) };
  const heat = hm ? heatMap(r, extra) : "";
  const g = r.reviewGap;
  const gap = g
    ? `<div class="card"><b>Catching the next business up</b><p style="margin:6px 0 0">${esc(g.leader)} has ${g.leaderReviews} reviews and you have ${b.reviews}. That is a gap of ${g.need}.</p>
<p class="muted" style="margin:6px 0 0">To catch them in a year, you need about <b>${g.perWeekIn12Months} new review${g.perWeekIn12Months === 1 ? "" : "s"} a week</b>. The easy way: ask every customer, every day.</p></div>`
    : "";
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><link rel="icon" href="/favicon.ico?v=2" sizes="any"><link rel="icon" href="/favicon.png?v=2" type="image/png"><link rel="apple-touch-icon" href="/apple-touch-icon.png?v=2">
<meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex">
<title>${esc(b.name)}: how you show up on Google</title><meta property="og:title" content="${esc(b.name)}: how you show up on Google"><meta property="og:description" content="Your local visibility score, your nearest rivals and what to fix first."><meta property="og:image" content="https://repsuites.com/og-image.png?v=2"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="630"><meta name="twitter:card" content="summary_large_image"><style>${STYLE}</style></head><body><main>
<div class="brand"><img src="/logo-mark.png" alt=""> RepSuites</div>
<h1>${esc(b.name)}: how you show up on Google</h1>
<p class="muted">${esc(b.address)}<br>Prepared ${date}</p>

<div class="card score"><div class="dial" style="background:${scoreColour(r.score)}">${r.score}</div>
<div><b>Your local visibility score, out of 100</b><p class="muted" style="margin:4px 0 0">Built from Google's own data about your business and the businesses around you.</p></div></div>
<div class="card">${r.parts
    .map(
      (p) =>
        `<div style="margin:8px 0"><div style="display:flex;justify-content:space-between;font-size:.92rem"><span>${esc(p.label)}</span><b>${p.got} / ${p.max}</b></div><div class="bar"><span style="width:${Math.round((p.got / p.max) * 100)}%"></span></div></div>`,
    )
    .join("")}</div>

${heat || (mapsLine ? `<h2>Where you show up on Google Maps</h2><div class="card">${mapsLine}</div>` : "")}

<h2>You and your nearest rivals</h2>
<div class="card"><table><tr><th>Business</th><th>Rating</th><th>Google reviews</th></tr>
${rows
  .map(
    (x) =>
      `<tr class="${x.you ? "you" : ""}"><td>${esc(x.name)}${x.kind || x.away ? `<div class="small">${esc([x.kind, x.away ? `${x.away} away` : ""].filter(Boolean).join(", "))}</div>` : ""}</td><td>${x.rating === null ? "-" : x.rating.toFixed(1)}</td><td>${x.reviews}</td></tr>`,
  )
  .join("")}</table></div>
${gap}

${extra ? realNumbers(extra.token, extra.snapshot, extra.flash) : ""}

<h2>What to fix first</h2>
${r.fixes.length ? r.fixes.map((f) => `<div class="fix ${f.priority}"><b>${esc(f.title)}</b><span>${esc(f.why)}</span></div>`).join("") : `<div class="card">Your Google profile is in good shape. The next step is a steady flow of new reviews.</div>`}

<a class="cta" href="${esc(bookingLink(b.name))}">Book a free 15-minute call to fix this</a>
<p class="small noprint" style="text-align:center;margin-top:10px"><a href="javascript:window.print()" style="color:#64748b">Save or print this report</a></p>
<p class="small" style="margin-top:24px">Figures come from Google on the date above and change over time. The Maps position is one search from your business's own location.</p>
</main>${extra?.flash === "print" ? `<script>addEventListener("load",function(){setTimeout(function(){print()},300)})</script>` : ""}</body></html>`;
}

export function reportNotFound(): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><link rel="icon" href="/favicon.ico?v=2" sizes="any"><link rel="icon" href="/favicon.png?v=2" type="image/png"><link rel="apple-touch-icon" href="/apple-touch-icon.png?v=2"><meta name="viewport" content="width=device-width,initial-scale=1"><title>RepSuites</title><style>${STYLE}</style></head><body><main style="text-align:center"><h1>Report not found</h1><p class="muted">This link may have been replaced. Ask the person who sent it for a fresh one.</p></main></body></html>`;
}
