// Server-only: the shareable insight report a prospect opens (/r/<token>).
// Plain HTML so it loads instantly on a phone and prints cleanly to PDF.
// No em dashes in this copy (AGENTS.md).
import type { Report } from "./prospects.server";
import type { ProspectSnapshot } from "./prospect-connect.server";
import { gridInsight, joinSides, sideOf, gridSpots } from "./report-map";
import { usesMiles } from "./units";
import { embedUrl, type VideoKind } from "./prospect-video";
import {
  READING_HEAD,
  READING_STYLE,
  RANK_PIN_STYLE,
  rankBand,
  rankLegend,
  rankText,
  rankWords,
  readingToggle,
} from "./reading";
import {
  money,
  saleFor,
  saleRange,
  saleSumLines,
  saleSymbol,
  showsGrowthPrice,
  yearlyValue,
} from "./sale-value";

export function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

function bookingLink(name: string): string {
  const url = (process.env["REPSUITES_BOOKING_URL"] ?? "").trim();
  if (/^https:\/\//.test(url)) return url;
  const subject = encodeURIComponent(`Google visibility report for ${name}`);
  return `mailto:julius@accelur8.com?subject=${subject}`;
}

function agencyBrand(branding?: RenderExtra["branding"]) {
  const name = (process.env["REPSUITES_REPORT_BRAND_NAME"] ?? "RepSuites").trim().slice(0, 80);
  const phone = (process.env["REPSUITES_REPORT_BRAND_PHONE"] ?? "").trim().slice(0, 40);
  const email = (process.env["REPSUITES_REPORT_BRAND_EMAIL"] ?? "").trim().slice(0, 200);
  return {
    name: branding?.agency_name?.trim().slice(0, 80) || name || "RepSuites",
    phone: branding?.phone?.trim().slice(0, 40) || phone,
    email: branding?.email?.trim().slice(0, 200) || email,
  };
}

function scoreColour(n: number): string {
  return n >= 75 ? "#047857" : n >= 50 ? "#b45309" : "#b91c1c";
}

export const STYLE = `
*{box-sizing:border-box}body{margin:0;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;background:#f6faf9;color:#0f172a;line-height:1.5}
main{max-width:42rem;margin:0 auto;padding:24px 18px 40px}
.brand{display:flex;align-items:center;gap:8px;font-weight:800;margin-bottom:20px}.top{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:10px;margin-bottom:20px}.top .brand{margin:0}.brand img{width:28px;height:28px;border-radius:6px}
h1{font-size:1.55rem;line-height:1.2;margin:0 0 4px}.kicker{margin:0 0 4px;font-size:1rem;font-weight:700;color:#7a5200}.biz{font-size:2rem;font-weight:800;line-height:1.15;margin:0 0 6px;color:#0b1d3a;border-left:6px solid #f5b324;padding-left:12px}h2{font-size:1.3rem;line-height:1.3;margin:28px 0 10px}
.muted{color:#475569;font-size:1rem}
.card{background:#fff;border:1px solid #e2e8f0;border-radius:16px;padding:16px;margin:12px 0}
.score{display:flex;align-items:center;gap:16px}.dial{width:84px;height:84px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:1.8rem;font-weight:800;color:#fff;flex-shrink:0}
.bar{height:8px;background:#e2e8f0;border-radius:4px;overflow:hidden;margin-top:4px}.bar>span{display:block;height:100%;background:#0f172a}
table{width:100%;border-collapse:collapse;font-size:1rem}td,th{padding:10px 6px;border-bottom:1px solid #e2e8f0;text-align:left}th{font-size:.95rem;color:#334155;font-weight:700}
tr.you td{font-weight:700;background:#fffbeb}
.fix{border-left:4px solid #f59e0b;padding:10px 12px;background:#fff;border-radius:8px;margin:8px 0}.fix.high{border-color:#dc2626}
.fix b{display:block}.fix span{color:#334155;font-size:1rem}.fix .tag{display:inline-block;font-size:.875rem;font-weight:700;color:#334155;background:#fef3c7;border-radius:999px;padding:2px 10px;margin-bottom:6px}.fix.high .tag{background:#fee2e2;color:#991b1b}
.cta{display:block;text-align:center;background:#f5b324;color:#0f172a;font-weight:800;text-decoration:none;border-radius:14px;padding:16px;font-size:1.05rem;margin-top:16px}
.small{font-size:1rem;color:#475569}a.small,.small a{color:#334155}
.found{border:2px solid #f5b324}.finding{display:flex;gap:10px;align-items:flex-start;margin:10px 0}.finding p{margin:0;font-size:1.0625rem}.fi{font-size:1.3rem;line-height:1.3}
.map{position:relative;aspect-ratio:1;max-width:560px;margin:0 auto;border-radius:12px;overflow:hidden;background:#e8eef0;z-index:0}
.kw{display:flex;flex-wrap:wrap;gap:6px;margin:0 0 10px}.kw button{border:1px solid #64748b;background:#fff;color:#0b1b33;border-radius:999px;padding:8px 14px;font:inherit;font-size:1rem;cursor:pointer}.kw button.on{background:#0f172a;color:#fff;border-color:#0f172a}
.pin{position:absolute;transform:translate(-50%,-50%);width:32px;height:32px;font-size:.875rem;border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.45)}.pin.rk-missing{border:0;box-shadow:0 0 0 2px #fff,0 1px 4px rgba(0,0,0,.45)}
.pin.home{width:40px;height:40px;background:#0b1b33;border-radius:50%;z-index:3}
.pin.home .rank{position:absolute;right:-12px;top:-12px;min-width:28px;height:28px;padding:0 4px;font-size:.875rem;border:2px solid #fff}
.rpin{position:absolute;transform:translate(-50%,-110%) rotate(-45deg);width:24px;height:24px;border-radius:50% 50% 50% 0;background:#475569;display:flex;align-items:center;justify-content:center;border:2px solid #fff;box-shadow:0 1px 3px rgba(0,0,0,.35)}.rpin span{transform:rotate(45deg);color:#fff;font-weight:800;font-size:.875rem}
.rkey{display:inline-block;width:24px;height:24px;border-radius:50%;background:#475569;color:#fff;text-align:center;font-size:.875rem;line-height:24px}.leaflet-container{font:inherit;font-size:.875rem}.map .leaflet-control-attribution a{color:#0b4f8a;text-decoration:underline}.map .leaflet-bar a{width:44px!important;height:44px!important;line-height:44px!important;font-size:22px!important}
.worth .ctl{display:flex;align-items:center;gap:10px;margin:12px 0 8px}.worth input[type=range]{flex:1;min-width:0;accent-color:#0f172a;height:28px}
.worth .num{display:flex;align-items:center;border:1px solid #64748b;border-radius:10px;background:#fff;padding:0 8px;flex-shrink:0}.worth .num input{width:5.5em;border:0;font:inherit;font-weight:700;font-size:1.05rem;padding:8px 2px;background:transparent}.worth .num:focus-within{outline:3px solid #0b1b33;outline-offset:2px}.worth .num input:focus-visible{outline:none;box-shadow:none}
.seg{display:inline-flex;border:1px solid #64748b;border-radius:999px;overflow:hidden}.seg button{border:0;background:#fff;color:#0b1b33;font:inherit;font-size:1rem;padding:8px 18px;cursor:pointer}.seg button.on{background:#0f172a;color:#fff}
.sum{margin:14px 0 0;padding:0 0 0 1.4em;font-size:1.0625rem}.sum li{padding:8px 0;border-bottom:1px dashed #e2e8f0}.sum li b{white-space:nowrap}
.total{margin:14px 0 0;background:#fffbeb;border:2px solid #f5b324;border-radius:14px;padding:14px;text-align:center}.total .big{font-size:2rem;font-weight:800;line-height:1.1;color:#0b1d3a}
@page{size:A4;margin:16mm 15mm 17mm}
@media print{
  html,body{background:#fff!important;color:#0f172a;font-size:10.5pt}
  body{line-height:1.42}
  main{max-width:none;width:100%;padding:0}
  .cta,.noprint{display:none!important}
  .top{margin-bottom:10mm;border-bottom:1px solid #cbd5e1;padding-bottom:4mm}
  .brand img{width:22px;height:22px}
  .kicker{font-size:11pt;margin-top:4mm}
  .biz{font-size:25pt;max-width:150mm}
  h2{font-size:17pt;margin:0 0 5mm;break-after:avoid}
  h3{font-size:13pt;break-after:avoid}
  p,li,td,th{font-size:10.5pt}
  .card{break-inside:avoid;box-shadow:none;border:1px solid #cbd5e1;border-radius:8px;margin:0 0 5mm;padding:5mm}
  .found{break-after:page}
  #map{break-before:page}
  .screen-grids{break-after:page}
  .print-grids{break-before:page}
  .print-grids h2{margin-top:0}
  .print-grids .card{break-inside:avoid-page}
  #worth{break-before:page}
  #score{break-before:page}
  .presentation-close{break-before:page}
  .presentation-close .card{margin-bottom:4mm}
  table{font-size:10pt}
  td,th{padding:6px 5px}
  .map{max-width:155mm}
  .small{font-size:9pt}
}

.print-grids{display:none}
.grid-pair{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8mm}.grid-pair h4{text-align:center;margin:0 0 3mm}
.report-tools{position:sticky;top:8px;z-index:999;display:flex;flex-wrap:wrap;gap:8px;justify-content:center;margin:0 0 18px;padding:8px;background:rgba(246,250,249,.96);border:1px solid #cbd5e1;border-radius:14px;backdrop-filter:blur(8px)}.report-tools button,.report-tools a{min-height:40px;border:1px solid #64748b;border-radius:10px;background:#fff;color:#0f172a;padding:8px 12px;font:inherit;font-weight:700;text-decoration:none;cursor:pointer}.report-tools .primary{background:var(--report-primary);color:#fff;border-color:var(--report-primary)}
@media(max-width:620px){.grid-pair{grid-template-columns:1fr}}
@media print{.screen-grids{display:none!important}.print-grids{display:block}.print-grids .rk{print-color-adjust:exact;-webkit-print-color-adjust:exact}.print-grids .card{break-inside:avoid}.grid-pair>div>div[role=img]{max-width:68mm!important;gap:1.5mm!important}}

/* Polish: crisper text, balanced headings, steady numbers, softer depth, tactile buttons, 40px targets */
body{-webkit-font-smoothing:antialiased;-moz-osx-font-smoothing:grayscale}
h1,h2,h3,.biz{text-wrap:balance}p,li,.finding p{text-wrap:pretty}
h2{font-size:1.15rem;letter-spacing:-.01em;margin:32px 0 10px}
.card{border:0;border-radius:20px;padding:18px;box-shadow:0 0 0 1px rgba(15,23,42,.06),0 1px 2px rgba(15,23,42,.04),0 4px 12px rgba(15,23,42,.04)}
.found{box-shadow:0 0 0 2px #f5b324,0 6px 20px rgba(245,179,36,.15)}
.map,.worth .num,.total,.sum{border-radius:10px}
.total{border:0;box-shadow:inset 0 0 0 2px #f5b324}
.big,#ws-total,.sum,.dial,td,.worth .num input{font-variant-numeric:tabular-nums}
td:nth-child(n+2),th:nth-child(n+2){text-align:right}
.fix{border-left-width:4px;border-radius:12px;box-shadow:0 0 0 1px rgba(15,23,42,.06),0 1px 2px rgba(15,23,42,.04)}
.cta{transition-property:transform,box-shadow,filter;transition-duration:.15s;transition-timing-function:ease-out;box-shadow:0 1px 0 rgba(15,23,42,.08),0 6px 16px rgba(245,179,36,.35)}
.cta:hover{filter:brightness(1.03)}.cta:active{transform:scale(.97)}
.seg button,.kw button{min-height:44px;transition-property:background-color,color,transform;transition-duration:.15s}.seg button:active,.kw button:active{transform:scale(.97)}
.worth input[type=range]{height:44px}
.worth input[type=range]::-webkit-slider-thumb{width:26px;height:26px}
.brand img{outline:1px solid rgba(15,23,42,.08);outline-offset:-1px}
@media (prefers-reduced-motion:reduce){.cta,.seg button,.kw button{transition:none}}
${READING_STYLE}${RANK_PIN_STYLE}`;

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
export function distanceText(km: number, miles: boolean): string {
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
    return `<div class="noprint">${note}<h2 id="real">See your real numbers</h2><div class="card">
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
    return `<div class="small" style="color:${up ? "#047857" : "#b91c1c"};font-weight:700">${up ? '<span aria-hidden="true">&#9650;</span> Up' : '<span aria-hidden="true">&#9660;</span> Down'} from ${fmt(before)}</div>`;
  };
  const tile = (label: string, now: number, before: number) =>
    `<div style="background:#f8fafc;border-radius:12px;padding:12px"><div style="font-size:1.5rem;font-weight:800">${fmt(now)}</div><div style="font-size:1rem">${label}</div>${delta(now, before)}</div>`;
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
  return `${note}<h2 id="real">Your real numbers from Google</h2><div class="card">
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
<p class="small" style="margin:14px 0 0">We keep these figures, not access to your profile. <a href="${connect}">Update my numbers</a></p></div>`;
}

// The 5 by 5 check drawn as pins on a real map people can zoom and drag
// (Leaflet with OpenStreetMap), the business as a house and its nearest
// rivals as lettered grey pins. With several search phrases, buttons switch
// between them. Without a location, or if the map cannot load, the plain
// grid of dots shows instead.
// One pin: its band (colour and shape, see reading.ts), what it shows and
// what a screen reader says.
function rankPin(v: number | null) {
  return { b: rankBand(v), t: rankText(v), w: rankWords(v) };
}

export function heatMap(r: Report, extra: RenderExtra | null): string {
  const b = r.business;
  const grids =
    r.grids && r.grids.length ? r.grids : r.grid ? [{ keyword: r.maps.keyword, ...r.grid }] : [];
  if (!grids.length) return "";
  const competitors = grids
    .flatMap((g) => g.competitors ?? [])
    .filter((c, i, all) => !!c.ranks && all.findIndex((x) => x.placeId === c.placeId) === i);
  const selectedCompetitor =
    competitors.find((c) => c.placeId === extra?.competitorId) ?? competitors[0] ?? null;
  const center = grids[0]!.center ?? extra?.center ?? null;
  const miles = usesMiles(center?.lat, center?.lng);
  const spacingKm = grids[0]!.spacingKm ?? (miles ? 0.8 : 1);
  const legend = `${rankLegend()}<p class="small" style="text-align:center;margin:8px auto 0">The number on each pin is where you came on Google Maps from that spot.</p>`;
  // Plain words: "in the top 3 in 6 of the 25 places", "not in the top 3
  // anywhere", "in the top 3 everywhere".
  // The top card already says "X of 25"; this explains the shape: your own
  // street, one and two steps out, and the sides (and rivals) you lose on.
  const step = distanceText(Math.round(spacingKm * 10) / 10, miles);
  const twoSteps = distanceText(Math.round(spacingKm * 2 * 10) / 10, miles);
  const summaryOf = (g: (typeof grids)[number]) => {
    if (g.ranks.includes(-1))
      return `Some search spots could not be checked for "${esc(g.keyword)}". Unknown spots are not evidence of a low ranking. Rerun this check before drawing conclusions.`;
    const k = `"${esc(g.keyword)}"`;
    if (g.top3 >= 25)
      return `When people near you search ${k}, you are in the top 3 everywhere we checked, up to ${esc(twoSteps)} away. The job now is staying there: rivals catch up with fresh reviews.`;
    const s = gridInsight(g.ranks, g.size);
    const home =
      s.home === null
        ? `From your own street you are <b>not in the top 20</b> for ${k}.`
        : s.home <= 3
          ? `From your own street you are <b>number ${s.home}</b> for ${k}.`
          : `Even from your own street you are only <b>number ${s.home}</b> for ${k}.`;
    const ringText = (top3: number, total: number) =>
      top3 === 0
        ? `you are <b>not in the top 3 in any of the ${total} spots</b>`
        : top3 === total
          ? `you are <b>in the top 3 in all ${total} spots</b>`
          : `you are in the top 3 in <b>${top3} of the ${total} spots</b>`;
    const rings = `About ${esc(step)} away, ${ringText(s.near.top3, s.near.total)}. About ${esc(twoSteps)} away, ${ringText(s.far.top3, s.far.total)}.`;
    let sides = "";
    if (s.weak.length && s.weak.length < 4) {
      const lost = center
        ? r.rivals
            .filter((x) => x.lat != null && x.lng != null)
            .filter((x) => s.weak.includes(sideOf(center, { lat: x.lat!, lng: x.lng! })))
            .map((x) => esc(x.name))
        : [];
      sides = ` You are weakest to the <b>${joinSides(s.weak)}</b>${lost.length ? `, where ${joinSides(lost)} ${lost.length === 1 ? "is" : "are"}` : ""}.`;
    } else if (s.weak.length === 4) sides = " Beyond your own street you drop away on every side.";
    return `${home} ${rings}${sides}`;
  };
  const dots = (g: (typeof grids)[number]) =>
    `<div role="img" aria-label="${esc(`Grid of ${g.ranks.length} search spots for "${g.keyword}". You are in the top 3 in ${g.top3} of them.`)}" style="display:grid;grid-template-columns:repeat(${g.size},1fr);gap:8px;max-width:340px;margin:0 auto">${g.ranks
      .map((v) => {
        const d = rankPin(v);
        return `<div class="rk rk-${d.b}" style="aspect-ratio:1;font-size:1rem">${d.t}</div>`;
      })
      .join("")}</div>`;
  const printable = `<div class="print-grids"><h2>Ranking grids for every search phrase</h2><p class="small">Checked ${esc(r.createdAt)}. Each grid is read from north-west to south-east. The centre spot is the business. Numbers are observed positions in the top 20; a dash means not found and a question mark means not checked.</p>${grids
    .map((g) => {
      const rival = selectedCompetitor
        ? g.competitors?.find((c) => c.placeId === selectedCompetitor.placeId && c.ranks)
        : null;
      return `<section class="card"><h3>${esc(g.keyword)}</h3><p class="small">${g.size} by ${g.size} search spots, ${esc(g.spacing ?? "not recorded")} apart.</p><div class="grid-pair"><div><h4>${esc(b.name)} (you)</h4>${dots(g)}</div>${rival ? `<div><h4>${esc(rival.name)}</h4>${dots({ ...g, ranks: rival.ranks! })}</div>` : ""}</div><p>${summaryOf(g)}</p></section>`;
    })
    .join("")}${rankLegend()}</div>`;
  const tabs =
    grids.length > 1
      ? `<div class="kw noprint" role="group" aria-label="Search phrase">${grids.map((g, i) => `<button type="button" data-i="${i}" aria-pressed="${i === 0 ? "true" : "false"}"${i === 0 ? ' class="on"' : ""}>${esc(g.keyword)}</button>`).join("")}</div>`
      : "";
  const competitorTabs = competitors.length
    ? `<div class="cmp noprint"><p class="small" style="margin:12px 0 6px"><b>Compare with</b> - changing this uses the saved scan and does not run a paid check.</p><div class="kw" role="group" aria-label="Business shown on the map"><button type="button" data-cmp="" aria-pressed="true" class="on">${esc(b.name)} (you)</button>${competitors.map((c) => `<button type="button" data-cmp="${esc(c.placeId)}" aria-pressed="false">${esc(c.name)}</button>`).join("")}</div></div>`
    : "";
  const furthest = distanceText(Math.round(spacingKm * 2 * 10) / 10, miles);
  const intro = `<p style="margin:0 0 8px">We searched Google Maps from 25 places around you, up to ${esc(furthest)} away. This is what a customer standing there would see.</p>
<ul style="margin:0 0 12px;padding-left:1.2em"><li>Each pin shows where you came in the list from that place.</li><li>The house is you.</li><li>Pinch, or use + and −, to zoom in.</li></ul>`;
  if (!center || !extra)
    return `${printable}<div class="screen-grids"><h2>Where you show up across your area</h2><div class="card">${intro}${dots(grids[0]!)}${legend}<p style="margin:14px 0 0">${summaryOf(grids[0]!)}</p></div></div>`;
  const spots = gridSpots(center, 5, spacingKm).map((p) => [
    Math.round(p.lat * 1e6) / 1e6,
    Math.round(p.lng * 1e6) / 1e6,
  ]);
  const data = {
    c: [center.lat, center.lng],
    spots,
    name: b.name,
    grids: grids.map((g) => ({
      k: g.keyword,
      pins: g.ranks.map((v) => rankPin(v)),
      s: summaryOf(g),
      competitors: (g.competitors ?? [])
        .filter((c) => c.ranks?.length === g.ranks.length)
        .map((c) => ({
          id: c.placeId,
          name: c.name,
          pins: c.ranks!.map((v) => rankPin(v)),
          top3: c.top3,
          found: c.found,
        })),
    })),
    rivals: r.rivals
      .filter((x) => x.lat != null && x.lng != null)
      .map((x, i) => ({ l: "ABC"[i], n: x.name, at: [x.lat, x.lng] })),
  };
  const json = JSON.stringify(data).replace(/</g, "\\u003c");
  const rivalKey = data.rivals.length
    ? `<p class="small" style="margin:8px 0 0">${data.rivals.map((x) => `<b class="rkey">${x.l}</b> ${esc(x.n)}`).join(" &nbsp; ")}</p>`
    : "";
  return `${printable}<div class="screen-grids"><h2>Where you show up across your area</h2><div class="card">${intro}${tabs}${competitorTabs}
<div id="rmap" class="map" role="region" aria-label="Map of where you show up. The words under the map say the same thing."><div id="rmap-fallback" style="padding:16px">${dots(grids[0]!)}</div></div>
${legend}${rivalKey}<p id="rmap-sum" aria-live="polite" style="margin:14px 0 0">${summaryOf(grids[0]!)}</p></div></div>
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css">
<script src="https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js"></script>
<script>(function(){var D=${json};if(!window.L)return;var el=document.getElementById("rmap");document.getElementById("rmap-fallback").remove();
var m=L.map(el,{scrollWheelZoom:false,zoomSnap:0.5});L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png",{maxZoom:19,attribution:"&copy; OpenStreetMap"}).addTo(m);
m.fitBounds(L.latLngBounds(D.spots),{padding:[24,24]});el.addEventListener("wheel",function(e){if(e.ctrlKey){e.preventDefault();m.setZoom(m.getZoom()-e.deltaY*0.02);}},{passive:false});var layer=L.layerGroup().addTo(m);
var house='<svg viewBox="0 0 24 24" width="18" height="18" fill="#fff"><path d="M12 3 2 11h3v9h5v-6h4v6h5v-9h3z"/></svg>';
var keyword=0,target="";function draw(){layer.clearLayers();var g=D.grids[keyword],c=target&&g.competitors.find(function(x){return x.id===target}),pins=c?c.pins:g.pins,label=c?c.name:D.name;D.spots.forEach(function(p,j){var d=pins[j];var html=j===12?'<div class="pin home">'+house+'<span class="rank rk rk-'+d.b+'">'+d.t+'</span></div>':'<div class="pin rk rk-'+d.b+'">'+d.t+'</div>';
L.marker(p,{icon:L.divIcon({className:"",html:html,iconSize:[0,0]}),zIndexOffset:j===12?1000:0,keyboard:false}).bindTooltip(j===12?label+": "+d.w:"From here: "+d.w).addTo(layer);});
D.rivals.forEach(function(x){L.marker(x.at,{icon:L.divIcon({className:"",html:'<div class="rpin"><span>'+x.l+'</span></div>',iconSize:[0,0]}),keyboard:false}).bindTooltip(x.n).addTo(layer);});
document.getElementById("rmap-sum").innerHTML=c?'<b>'+c.name+'</b> is in the top 3 in <b>'+c.top3+' of '+pins.length+' spots</b> and appears in the top 20 in '+c.found+'. This is the same saved search used for your grid.':g.s;}
draw();document.querySelectorAll(".kw button[data-i]").forEach(function(b){b.addEventListener("click",function(){document.querySelectorAll(".kw button[data-i]").forEach(function(x){x.classList.remove("on");x.setAttribute("aria-pressed","false");});b.classList.add("on");b.setAttribute("aria-pressed","true");keyword=+b.getAttribute("data-i");draw();});});document.querySelectorAll(".cmp button").forEach(function(b){b.addEventListener("click",function(){document.querySelectorAll(".cmp button").forEach(function(x){x.classList.remove("on");x.setAttribute("aria-pressed","false");});b.classList.add("on");b.setAttribute("aria-pressed","true");target=b.getAttribute("data-cmp")||"";draw();});});})();</script>`;
}

// The Maps part of the score uses the whole area (all search phrases), not
// just the business's own street. Worked example: top 3 in 6 of 25 places
// and 4th to 10th in 10 more is (6 + 0.4 x 10) / 25 = 0.4 of the 25 points,
// so 10 points.
export function areaPoints(grids: { ranks: (number | null)[] }[]): number | null {
  if (
    !grids.length ||
    grids.some(
      (g) =>
        !g.ranks.length ||
        g.ranks.some((v) => v !== null && (!Number.isInteger(v) || v < 1 || v > 20)),
    )
  )
    return null;
  const each = grids.map((g) => {
    const top3 = g.ranks.filter((v) => v !== null && v >= 1 && v <= 3).length;
    const near = g.ranks.filter((v) => v !== null && v >= 4 && v <= 10).length;
    return (top3 + 0.4 * near) / g.ranks.length;
  });
  return Math.round((each.reduce((t, x) => t + x, 0) / each.length) * 25);
}

function gridsOf(r: Report) {
  return r.grids && r.grids.length
    ? r.grids
    : r.grid
      ? [{ keyword: r.maps.keyword, ...r.grid }]
      : [];
}

// Score, parts and fixes as shown, worked out again from the area checks.
export function scoreView(r: Report) {
  const grids = gridsOf(r);
  const area = areaPoints(grids);
  const parts = r.parts.map((p) =>
    p.label === "Position on Google Maps" && area !== null
      ? { label: "Showing in the top 3 on Google Maps around you", got: area, max: 25 }
      : p,
  );
  const got = parts.reduce((t, x) => t + x.got, 0);
  const max = parts.reduce((t, x) => t + x.max, 0);
  const score = max ? Math.round((got / max) * 100) : r.score;
  const fixes = [...r.fixes];
  for (const g of grids.slice(1))
    if (!g.ranks.includes(-1) && g.top3 < 13)
      fixes.push({
        title:
          g.top3 === 0
            ? `For "${g.keyword}" you are not in the top 3 on Google Maps anywhere around you`
            : `For "${g.keyword}" you are in the top 3 in only ${g.top3} of the 25 places around you`,
        why: "People searching for this nearby see other businesses first. More recent reviews that mention it, and posts about it, help you move up.",
        priority: g.top3 < 6 ? "high" : "medium",
      });
  // Checked again here so older reports show them too.
  const has = (t: string) => fixes.some((f) => f.title.toLowerCase().includes(t));
  if (r.business.reviews === 0 && !has("no google reviews"))
    fixes.unshift({
      title: "You have no Google reviews yet",
      why: "Most people skip a business with no reviews and call the next one. Your first 10 reviews make the biggest difference of all.",
      priority: "high",
    });
  if (r.business.rating !== null && r.business.rating < 4 && !has("rating"))
    fixes.push({
      title: `Your rating is ${r.business.rating.toFixed(1)} stars`,
      why: "Many people only look at businesses with 4 stars or more. Asking every customer for a review, and replying to the unhappy ones, lifts it.",
      priority: "high",
    });
  if (!fixes.length && score < 70)
    fixes.push({
      title: "Get a steady flow of new reviews",
      why: "Recent reviews are one of the main things Google uses to decide who shows first. A review QR code at the till or on the van keeps them coming in.",
      priority: "medium",
    });
  fixes.sort((a, b) => (a.priority === b.priority ? 0 : a.priority === "high" ? -1 : 1));
  return { score, parts, fixes };
}

// "What we found": the 3 things an owner most needs to know, at the top.
function findings(
  r: Report,
  view: ReturnType<typeof scoreView>,
  extra: RenderExtra | null,
  rows: { name: string; reviews: number; you: boolean; away: string }[],
  sale: Sale,
  hasVideo = false,
): string {
  const items: { icon: string; text: string }[] = [];
  const grids = gridsOf(r);
  if (grids.some((g) => !g.ranks.includes(-1))) {
    const worst = [...grids]
      .filter((g) => !g.ranks.includes(-1))
      .sort((a, b) => a.top3 - b.top3)[0]!;
    items.push({
      icon: worst.top3 >= 20 ? "&#9989;" : "&#128205;",
      text:
        worst.top3 === 0
          ? `When people near you search <b>"${esc(worst.keyword)}"</b>, you are <b>not in the top 3 anywhere</b> on Google Maps. They see other businesses first.`
          : worst.top3 >= 25
            ? `When people near you search <b>"${esc(worst.keyword)}"</b>, you are <b>in the top 3 everywhere</b>. Great work.`
            : `When people near you search <b>"${esc(worst.keyword)}"</b>, you are in the top 3 in only <b>${worst.top3} of 25 places</b>. In the rest, they see other businesses first.`,
    });
  }
  if (r.business.reviews === 0)
    items.push({
      icon: "&#11088;",
      text: `You have <b>no Google reviews yet</b>. Most people skip a business with no reviews and call the next one.`,
    });
  // The top card shows the nearby rival with the MOST reviews (the real
  // threat); "Catching the next business up" further down keeps the
  // reachable next target.
  const leader = r.rivals
    .filter((x) => x.reviews > r.business.reviews)
    .sort((a, b) => b.reviews - a.reviews)[0];
  if (leader) {
    const rival = rows.find((x) => !x.you && x.name === leader.name);
    items.push({
      icon: "&#11088;",
      text: `<b>${esc(leader.name)}</b>${rival?.away ? ` (${esc(rival.away)} away)` : ""} has <b>${leader.reviews.toLocaleString("en-GB")} Google reviews</b>. You have ${r.business.reviews.toLocaleString("en-GB")}. Google and customers both favour the business with more reviews.`,
    });
  }
  const snap = extra?.snapshot;
  if (snap) {
    const c = snap.current;
    const perWeek = Math.round((c.calls + c.directions + c.websiteClicks) / 13);
    items.push({
      icon: "&#128222;",
      text: `About <b>${perWeek} people a week</b> already call you, ask for directions or visit your website from Google. Showing higher means more of them.`,
    });
  } else if (extra) {
    items.push({
      icon: "&#128222;",
      text: `Want to know how many people call you from Google each week? <a href="#real">See your real numbers</a>. It takes one minute.`,
    });
  }
  if (!items.length) return "";
  return `<div class="card found"><h2 style="margin:0 0 10px">What we found</h2>
${items.map((i) => `<div class="finding"><span class="fi" aria-hidden="true">${i.icon}</span><p>${i.text}</p></div>`).join("")}
${
  hasVideo
    ? `<div class="noprint" style="display:flex;flex-wrap:wrap;gap:10px;align-items:center;margin-top:12px"><a class="cta" style="margin:0;flex:1;min-width:200px;padding:12px;background:#0b1d3a;color:#fff" href="#map">See where you show up</a><a href="#score" class="small" style="color:#334155">Your score: <b>${view.score}/100</b></a></div>`
    : `<div class="noprint" style="margin-top:14px"><a class="cta" style="margin:0" href="${extra ? `/start?r=${encodeURIComponent(extra.token)}` : "/start"}">Start free: get your review QR card</a>
<p class="small" style="text-align:center;margin:8px 0 0">No card needed. Print it today.</p>
<p style="display:flex;flex-wrap:wrap;justify-content:space-between;gap:8px;margin:12px 0 0;font-size:1rem"><a href="#map" style="color:#0b1d3a;font-weight:700">See where you show up &#8595;</a><a href="#score" class="small" style="color:#334155">Your score: <b>${view.score}/100</b></a></p></div>`
}</div>`;
}

type Sale = ReturnType<typeof saleFor>;

// "What 1 more customer is worth": the yearly value of one extra customer
// at the owner's lowest price, with the sum shown step by step. The slider
// and the A day / A week buttons update the sum in the page (no framework).
function worthSection(r: Report, sale: Sale, extra: RenderExtra | null): string {
  const cur = sale.currency;
  const sym = saleSymbol(cur);
  const range = saleRange(cur);
  const max = Math.max(range.max, sale.amount);
  const lines = saleSumLines(sale.amount, sale.period, cur);
  const total = money(yearlyValue(sale.amount, sale.period), cur);
  const growth = showsGrowthPrice(r.business.address)
    ? `<p style="margin:12px 0 0">RepSuites Growth is £49 a month (£588 a year).</p>`
    : "";
  const print = extra?.flash === "print";
  const start = extra ? `/start?r=${encodeURIComponent(extra.token)}` : "/start";
  const controls = print
    ? `<p class="muted" style="margin:10px 0 0">At ${esc(money(sale.amount, cur))} ${sale.period === "week" ? "a week" : "a day"}:</p>`
    : `<div class="noprint"><label for="ws-range" style="display:block;font-weight:700;margin-top:12px">Your lowest price</label>
<div class="ctl"><input id="ws-range" type="range" min="${range.min}" max="${max}" step="${range.step}" value="${sale.amount}" aria-label="Your lowest price">
<span class="num">${sym}<input id="ws-num" type="number" inputmode="numeric" min="1" max="${max * 100}" step="1" value="${sale.amount}" aria-label="Your lowest price in ${cur === "NGN" ? "naira" : "pounds"}"></span></div>
<div class="seg" role="group" aria-label="How often"><button type="button" data-p="day"${sale.period === "day" ? ' class="on" aria-pressed="true"' : ' aria-pressed="false"'}>A day</button><button type="button" data-p="week"${sale.period === "week" ? ' class="on" aria-pressed="true"' : ' aria-pressed="false"'}>A week</button></div></div>`;
  const script = print
    ? ""
    : `<script>(function(){var S=${JSON.stringify(sym)},a=${sale.amount},p=${JSON.stringify(sale.period)};var rg=document.getElementById("ws-range"),nm=document.getElementById("ws-num");
function m(n){return S+Math.round(n).toLocaleString("en-GB");}
function draw(){var y=p==="week"?52:312,L=document.querySelectorAll("#ws-sum li");
L[0].innerHTML="1 extra customer a "+p+" &times; <b>"+m(a)+"</b> = <b>"+m(a)+"</b> a "+p;
L[1].innerHTML=p==="week"?"52 weeks a year":"Open 6 days a week: 6 &times; 52 = <b>312</b> days a year";
L[2].innerHTML="<b>"+m(a)+"</b> &times; "+y+" = <b>"+m(a*y)+"</b> a year in extra sales";
document.getElementById("ws-total").textContent=m(a*y);}
rg.addEventListener("input",function(){a=+rg.value;nm.value=a;draw();});
nm.addEventListener("input",function(){var v=Math.round(+nm.value);if(!(v>0))return;a=v;rg.value=Math.min(v,+rg.max);draw();});
document.querySelectorAll(".worth .seg button").forEach(function(b){b.addEventListener("click",function(){p=b.getAttribute("data-p");document.querySelectorAll(".worth .seg button").forEach(function(x){var on=x===b;x.classList.toggle("on",on);x.setAttribute("aria-pressed",on?"true":"false");});draw();});});})();</script>`;
  // Bold the money in the server-drawn lines, as the script does.
  const bold = (t: string) => esc(t).replace(/([£₦][\d,]+|\b312\b(?= days))/g, "<b>$1</b>");
  return `<h2 id="worth">What 1 more customer is worth</h2>
<div class="card worth"><p style="margin:0">You do not need lots more customers. Here is what just one more is worth, at your lowest price.</p>
${controls}
<ol id="ws-sum" class="sum" aria-live="polite">${lines.map((l) => `<li>${bold(l)}</li>`).join("")}</ol>
<div class="total"><div class="big" id="ws-total">${total}</div><div>a year in extra sales, from 1 more customer</div></div>
${growth}
<p class="small" style="margin:12px 0 0">This is not a forecast. It shows what one extra customer would add at the price you set. Change the price to match yours.</p>
<h3 style="margin:18px 0 8px;font-size:1rem">How we help you win that customer</h3>
<ul class="small" style="margin:0;padding-left:18px;font-size:1rem;line-height:1.5">
<li>Your own review page and QR code, so happy customers leave reviews in seconds.</li>
<li>Unhappy customers message you privately first, not on Google.</li>
<li>With Growth, we check this map again every month, so you can see yourself move up.</li>
</ul>
<a class="cta noprint" href="${start}">Start free</a>
<p class="small noprint" style="text-align:center;margin:8px 0 0">No card needed. Takes 2 minutes.</p></div>${script}`;
}

function presentationClose(
  r: Report,
  b: Report["business"],
  view: ReturnType<typeof scoreView>,
): string {
  const date = esc(r.createdAt);
  const actions = view.fixes.slice(0, 6);
  const actionRows = actions
    .map((a, i) => {
      const timing = i < 2 ? "This week" : i < 4 ? "This month" : "Every month";
      const effort = /reviews?|posts?|reply/i.test(a.title) ? "Ongoing" : "Low to medium";
      const proof = /review/i.test(a.title)
        ? "Review count, recency and response evidence"
        : /maps|google/i.test(a.title)
          ? "A repeat scan at the same search spots"
          : "A repeat evidence check";
      return `<tr><th>${timing}</th><td><b>${esc(a.title)}</b><br><span class="small">Why: ${esc(a.why)}<br>Effort: ${effort}. Confidence: evidence-led recommendation, not a guarantee.<br>Verify with: ${proof}.</span></td></tr>`;
    })
    .join("");
  return `<section class="presentation-close">
<h2>Your evidence-led action plan</h2>
<div class="card"><table>${actionRows || `<tr><th>This month</th><td>Keep reviews and profile evidence current, then repeat the same local search check.</td></tr>`}</table><p class="small"><b>Approval rule:</b> review every recommendation before changing a website or Google profile. Record the baseline first, then verify the result against comparable evidence.</p></div>
<h2>Proof and next step</h2>
<div class="card"><p><b>What this report proves:</b> how ${esc(b.name)} appeared in the checked Google searches and public profile evidence on ${date}.</p><p><b>What it does not prove:</b> private Google performance data, ownership status, conversion rate, or guaranteed future rankings.</p><p style="margin-bottom:0"><b>Recommended next step:</b> agree the first three fixes, record the baseline, and schedule the next comparable check.</p></div>
</section>`;
}

export interface RenderExtra {
  token: string;
  snapshot: ProspectSnapshot | null;
  flash: string;
  center?: { lat: number; lng: number } | null;
  video?: { kind: VideoKind; url: string } | null;
  contactName?: string | null;
  ogImage?: string | null;
  minSalePence?: number | null;
  salePeriod?: string | null;
  competitorId?: string | null;
  branding?: {
    agency_name: string | null;
    primary_hex: string | null;
    secondary_hex: string | null;
    logo_url: string | null;
    phone: string | null;
    email: string | null;
  } | null;
}

// Julius's WhatsApp, used when REPSUITES_SALES_WHATSAPP is not set.
const DEFAULT_SALES_WHATSAPP = "447512584332";

// Digits only, for a wa.me link. Worked example: "+44 7512 584332" gives
// "447512584332". Empty if it is too short or long to be a phone number.
export function salesWhatsApp(
  raw = (process.env["REPSUITES_SALES_WHATSAPP"] ?? "").trim() || DEFAULT_SALES_WHATSAPP,
): string {
  const d = raw.replace(/\D/g, "");
  return d.length >= 8 && d.length <= 15 ? d : "";
}

const VIDEO_STYLE = `
.vid{background:#0f172a;color:#fff;border-radius:20px;padding:18px 14px 20px;margin:0 -6px 18px}
.vid h1{color:#fff;font-size:1.45rem;margin:0 0 12px}
.frame{position:relative;width:100%;aspect-ratio:16/9;border-radius:12px;overflow:hidden;background:#000}
.frame iframe{position:absolute;inset:0;width:100%;height:100%;border:0}
.vid video{display:block;width:100%;max-height:75vh;border-radius:12px;background:#000}
.vid .cta{margin-top:16px;font-size:1.2rem;padding:18px}
.steps{list-style:none;margin:16px 0 0;padding:0}
.steps li{display:flex;align-items:center;gap:12px;font-size:1.05rem;font-weight:600}
.steps .n{flex-shrink:0;width:36px;height:36px;border-radius:50%;background:#f5b324;color:#0f172a;display:flex;align-items:center;justify-content:center;font-weight:800}
.steps .arrow{color:#f5b324;font-size:1.2rem;line-height:1;padding:4px 0 4px 10px}
.wa{display:block;text-align:center;border:2px solid #25d366;color:#fff;text-decoration:none;border-radius:14px;padding:13px;font-weight:700;margin-top:16px}
`;

// Tells us when the prospect taps the WhatsApp chat or booking link, so the
// pipeline moves them to Replied and Julius gets an alert.
export function actionTracker(token: string): string {
  const t = JSON.stringify(token);
  return `<script>(function(){var T=${t};function send(e){var b=JSON.stringify({t:T,e:e});if(navigator.sendBeacon&&navigator.sendBeacon("/api/report-video",new Blob([b],{type:"text/plain"})))return;fetch("/api/report-video",{method:"POST",body:b,keepalive:true}).catch(function(){});}document.querySelectorAll("a.wa").forEach(function(a){a.addEventListener("click",function(){send("chat")});});document.querySelectorAll("a.book").forEach(function(a){a.addEventListener("click",function(){send("call")});});})();</script>`;
}

// Sends plays and 25, 50, 75 and 100 percent marks to /api/report-video.
// Files and YouTube report progress; Vimeo too, through its message API.
// Loom only tells us it was tapped (Loom shows its own view figures).
export function videoTracker(token: string, kind: VideoKind): string {
  const t = JSON.stringify(token);
  const common = `var T=${t},sent={},played=false;function send(e,p){var k=e+p;if(sent[k])return;sent[k]=1;var b=JSON.stringify({t:T,e:e,p:p});if(navigator.sendBeacon&&navigator.sendBeacon("/api/report-video",new Blob([b],{type:"text/plain"})))return;fetch("/api/report-video",{method:"POST",body:b,keepalive:true}).catch(function(){});}
function play(){if(!played){played=true;send("play",0);}}function at(pct){[25,50,75,100].forEach(function(m){if(pct>=m-1)send("progress",m);});}`;
  if (kind === "file")
    return `<script>(function(){${common}var v=document.getElementById("pv");if(!v)return;v.addEventListener("play",play);v.addEventListener("timeupdate",function(){if(v.duration)at(v.currentTime/v.duration*100);});v.addEventListener("ended",function(){at(100);});})();</script>`;
  if (kind === "youtube")
    return `<script>(function(){${common}var timer;window.onYouTubeIframeAPIReady=function(){var p=new YT.Player("pv",{events:{onStateChange:function(e){if(e.data===1){play();clearInterval(timer);timer=setInterval(function(){var d=p.getDuration();if(d)at(p.getCurrentTime()/d*100);},2000);}else{clearInterval(timer);}if(e.data===0)at(100);}}});};var s=document.createElement("script");s.src="https://www.youtube.com/iframe_api";document.head.appendChild(s);})();</script>`;
  if (kind === "vimeo")
    return `<script>(function(){${common}var f=document.getElementById("pv");function post(m,v){f.contentWindow.postMessage(JSON.stringify({method:m,value:v}),"*");}
window.addEventListener("message",function(ev){if(!/vimeo\\.com$/.test(new URL(ev.origin).hostname))return;var d;try{d=typeof ev.data==="string"?JSON.parse(ev.data):ev.data;}catch(x){return;}if(!d)return;if(d.event==="ready"){post("addEventListener","play");post("addEventListener","playProgress");post("addEventListener","finish");}
if(d.event==="play")play();if(d.event==="playProgress"&&d.data){play();at(d.data.percent*100);}if(d.event==="finish")at(100);});})();</script>`;
  // Loom: the page loses focus to the player when it is tapped.
  return `<script>(function(){${common}var f=document.getElementById("pv");window.addEventListener("blur",function(){setTimeout(function(){if(document.activeElement===f)play();},0);});})();</script>`;
}

// The personal video at the very top, with one clear next step under it.
function videoSection(b: Report["business"], extra: RenderExtra): string {
  const v = extra.video;
  if (!v) return "";
  const embed = embedUrl(v.kind, v.url);
  if (v.kind !== "file" && !embed) return "";
  const who = (extra.contactName ?? "").trim().split(/\s+/)[0] || b.name;
  const player =
    v.kind === "file"
      ? `<video id="pv" src="${esc(v.url)}" controls playsinline preload="metadata"></video>`
      : `<div class="frame"><iframe id="pv" src="${esc(embed!)}" title="A video for ${esc(b.name)}" allow="autoplay; fullscreen; picture-in-picture; encrypted-media" allowfullscreen></iframe></div>`;
  const wa = salesWhatsApp();
  const waLink = wa
    ? `<a class="wa" href="https://wa.me/${wa}?text=${encodeURIComponent(`Hi, I watched the video about ${b.name}. Can we have a quick chat?`)}" target="_blank" rel="noopener">Prefer a quick chat? Message me on WhatsApp</a>`
    : "";
  return `<section class="vid noprint">
<h1>${esc(who)}, I recorded this for you</h1>
${player}
<a class="cta" href="/start?r=${encodeURIComponent(extra.token)}">Start free</a>
<ol class="steps" aria-label="How to start">
<li><span class="n">1</span>Tap Start free</li>
<li class="arrow" aria-hidden="true">&#8595;</li>
<li><span class="n">2</span>Type your email and a password</li>
<li class="arrow" aria-hidden="true">&#8595;</li>
<li><span class="n">3</span>Print your QR code</li>
</ol>
${waLink}
<p class="small" style="color:#cbd5e1;text-align:center;margin:12px 0 0">Free. No card needed. Your full report is below.</p>
</section>${videoTracker(extra.token, v.kind)}`;
}

// The words WhatsApp and email show under the link.
export function previewText(r: Report): { title: string; description: string } {
  const top = scoreView(r).fixes[0]?.title;
  return {
    title: `${r.business.name}, your Google report`,
    description: top ?? "Your local visibility score, your nearest rivals and what to fix first.",
  };
}

export function profileEvidence(r: Report): string {
  const b = r.business;
  const a = r.profileAudit;
  const rows = [
    ["Website", b.website || "Not supplied by Google"],
    ["Phone", b.phone || "Not supplied by Google"],
    [
      "Opening hours",
      b.hasHours ? "Opening hours supplied by Google" : "No opening hours supplied by Google",
    ],
    ["Category", b.category || "Not supplied by Google"],
  ];
  const detailed = a
    ? [
        [
          "Business description",
          a.description
            ? `${a.description.length} characters observed`
            : "No public description observed",
        ],
        [
          "Categories",
          a.categories
            ? `${a.categories} relevant categor${a.categories === 1 ? "y" : "ies"} observed`
            : "No specific category observed",
        ],
        [
          "Photos",
          a.photos
            ? `${a.photos} public photo references returned by Google`
            : "No photo references returned by Google",
        ],
        [
          "Review recency",
          a.newestReviewDays === null
            ? "Not available"
            : a.newestReviewDays === 0
              ? "A review was published today"
              : `Newest returned review was ${a.newestReviewDays} day${a.newestReviewDays === 1 ? "" : "s"} old`,
        ],
      ]
    : [];
  return `<h2>Google profile audit evidence</h2><div class="card"><p class="small">Source: Google Places, recorded ${esc(r.createdAt)}. Public profile evidence only. Missing information needs owner review, especially for service-area businesses.</p><table><tr><th>Check</th><th>Observation</th></tr>${[...rows, ...detailed].map(([label, value]) => `<tr><th>${esc(label!)}</th><td>${esc(value!)}</td></tr>`).join("")}</table><h3>Not established by this public check</h3><p class="small">Ownership and verification, suspension status, private performance, services, review reply rate and post activity. Connect the profile or confirm these with the owner before recommending a change.</p><p class="small">Review counts and ratings describe the profile, not enquiry or conversion performance.</p></div>`;
}

export function websiteEvidence(r: Report): string {
  const a = r.websiteAudit;
  if (!a) return "";
  const intro = `<h2>Website audit</h2><div class="card"><p class="small">Checked ${esc(a.checkedAt)}. Static homepage HTML only. JavaScript content, speed, accessibility and conversions were not measured.</p>`;
  if (a.status !== "checked")
    return `${intro}<p>${a.status === "no_website" ? "No website was supplied by Google." : "The website could not be checked. No negative findings were inferred."}</p></div>`;
  return `${intro}<p class="small">Source: ${esc(a.url)}</p>${a.findings.map((f) => `<div class="fix"><b>${esc(f.label)}: ${f.status === "pass" ? "Observed" : "Review"}</b><p>${esc(f.evidence)}</p>${f.status === "review" ? `<p><b>Suggested next step</b>${esc(f.recommendation)}</p>` : ""}</div>`).join("")}<p class="small">Review suggestions before changing the website. These observations do not establish lost customers or guarantee ranking changes.</p></div>`;
}

function richerEvidence(r: Report): string {
  const visual = r.websiteVisuals?.business;
  const website = visual
    ? `<h2>What a customer sees on your website</h2><div class="card"><img src="${esc(visual.screenshot)}" alt="Mobile view of ${esc(r.business.name)} website" style="display:block;width:100%;max-height:520px;object-fit:contain;border-radius:10px;border:1px solid #cbd5e1"><p class="small">Lighthouse mobile capture from ${esc(visual.url)}${visual.performance == null ? "" : `. Performance score: ${visual.performance}/100`}. This is visual evidence, not a conversion claim.</p></div>`
    : "";
  const ai = r.aiVisibility;
  const assistants = ai?.answers
    .map(
      (answer) =>
        `<div class="fix ${answer.named ? "" : "high"}"><span class="tag">${answer.named ? "Named you" : "Did not name you"}</span><b>${esc(answer.question)}</b><span>${answer.businesses.length ? `Businesses named: ${esc(answer.businesses.join(", "))}` : "No usable business list was returned."}</span>${answer.evidence?.provider ? `<p class="small">${esc(answer.evidence.provider)} ${esc(answer.evidence.model)}, checked ${esc(answer.evidence.checkedAt)}.</p>` : ""}</div>`,
    )
    .join("");
  const visibility = ai
    ? `<h2>What AI assistants recommend</h2><div class="card"><p class="small">These are dated public-search observations. Answers vary, so they are evidence to monitor, not a promise of future visibility.</p>${assistants || `<p>${esc(ai.error || "No usable AI answer was recorded.")}</p>`}</div>`
    : "";
  return website + visibility;
}

export function renderReport(r: Report, extra: RenderExtra | null = null): string {
  const b = r.business;
  const agency = agencyBrand(extra?.branding ?? undefined);
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
  const heat = gridsOf(r).length ? heatMap(r, extra) : "";
  const comparison = gridsOf(r)
    .filter((g) => g.competitors?.length)
    .map(
      (g) =>
        `<h2>Who shows up for &quot;${esc(g.keyword)}&quot;</h2><div class="card"><p class="small">Same ${g.ranks.length} search spots, checked ${esc(date)}. Average position includes only spots where the business appeared in the top 20.</p><table><tr><th>Business</th><th>Top 3 spots</th><th>Found</th><th>Average</th></tr><tr class="you"><td>${esc(b.name)} (you)</td><td>${g.top3}</td><td>${g.found}</td><td>${g.average ?? "-"}</td></tr>${g.competitors!.map((c) => `<tr><td>${esc(c.name)}</td><td>${c.top3}</td><td>${c.found}</td><td>${c.average ?? "-"}</td></tr>`).join("")}</table></div>`,
    )
    .join("");
  const g = r.reviewGap;
  const gap = g
    ? `<div class="card"><b>Catching the next business up</b><p style="margin:6px 0 0">${esc(g.leader)} has ${g.leaderReviews} reviews and you have ${b.reviews}. That is a gap of ${g.need}.</p>
<p class="muted" style="margin:6px 0 0">To catch them in a year, you need about <b>${g.perWeekIn12Months} new review${g.perWeekIn12Months === 1 ? "" : "s"} a week</b>. The easy way: ask every customer, every day.</p></div>`
    : "";
  const view = scoreView(r);
  const sale = saleFor(r, {
    minSalePence: extra?.minSalePence ?? null,
    salePeriod: extra?.salePeriod ?? null,
  });
  const video = extra ? videoSection(b, extra) : "";
  const headline = findings(r, view, extra, rows, sale, !!video);
  const preview = previewText(r);
  const ogImage =
    extra?.ogImage && /^https:\/\//.test(extra.ogImage)
      ? extra.ogImage
      : "https://repsuites.com/og-image.png?v=2";
  const envPrimary = (process.env["REPSUITES_REPORT_PRIMARY"] ?? "").trim();
  const envSecondary = (process.env["REPSUITES_REPORT_SECONDARY"] ?? "").trim();
  const envLogo = (process.env["REPSUITES_REPORT_LOGO"] ?? "").trim();
  const primary =
    extra?.branding?.primary_hex && /^#[0-9a-f]{6}$/i.test(extra.branding.primary_hex)
      ? extra.branding.primary_hex
      : /^#[0-9a-f]{6}$/i.test(envPrimary)
        ? envPrimary
        : "#0b1d3a";
  const secondary =
    extra?.branding?.secondary_hex && /^#[0-9a-f]{6}$/i.test(extra.branding.secondary_hex)
      ? extra.branding.secondary_hex
      : /^#[0-9a-f]{6}$/i.test(envSecondary)
        ? envSecondary
        : "#f5b324";
  const logo =
    extra?.branding?.logo_url && /^https:\/\//i.test(extra.branding.logo_url)
      ? extra.branding.logo_url
      : /^https:\/\//i.test(envLogo)
        ? envLogo
        : "/logo-mark.png";
  const reportUrl = extra ? `/r/${encodeURIComponent(extra.token)}` : "";
  const tools = extra
    ? `<nav class="report-tools noprint" aria-label="Report actions"><button type="button" id="copy-report">Copy share link</button><a href="${reportUrl}/pdf" class="primary">Download PDF</a><button type="button" id="present-report">Presentation mode</button></nav>`
    : "";
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><link rel="icon" href="/favicon.ico?v=2" sizes="any"><link rel="icon" href="/favicon.png?v=2" type="image/png"><link rel="apple-touch-icon" href="/apple-touch-icon.png?v=2">
<meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex">
<title>${esc(b.name)}: how you show up on Google</title><meta property="og:type" content="website"><meta property="og:site_name" content="RepSuites"><meta property="og:title" content="${esc(preview.title)}"><meta property="og:description" content="${esc(preview.description)}"><meta name="description" content="${esc(preview.description)}"><meta property="og:image" content="${esc(ogImage)}"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="630"><meta name="twitter:card" content="summary_large_image"><meta name="twitter:image" content="${esc(ogImage)}">${READING_HEAD}<style>:root{--report-primary:${primary};--report-accent:${secondary}}${STYLE}${video ? VIDEO_STYLE : ""}.biz{color:var(--report-primary);border-left-color:var(--report-accent)}.cta{background:var(--report-accent)}.found{border-color:var(--report-accent)}</style></head><body><main>
<div class="top"><div class="brand"><img src="${esc(logo)}" alt=""> ${esc(agency.name)}</div>${readingToggle()}</div>
${tools}
${video}
<p class="kicker">How you show up on Google</p>
${video ? `<h2 class="biz">${esc(b.name)}</h2>` : `<h1 class="biz">${esc(b.name)}</h1>`}
<p style="margin:10px 0 0">RepSuites helps local businesses get found and chosen on Google. We checked how <b>${esc(b.name)}</b> shows up when people nearby search for what you do. Here is what we found, what it could be worth, and how to fix it.</p>
<p class="muted">${esc(b.address)}<br>Prepared ${date}${b.mapsUrl && /^https:\/\/(www\.)?(maps\.)?google\.[a-z.]+\//.test(b.mapsUrl) ? ` &middot; <a href="${esc(b.mapsUrl)}" target="_blank" rel="noopener" style="color:#334155">See your Google profile</a>` : ""}</p>

${headline}

<div id="map"></div>
${heat || (mapsLine ? `<h2>Where you show up on Google Maps</h2><div class="card">${mapsLine}</div>` : "")}

${comparison}

${profileEvidence(r)}

${websiteEvidence(r)}
${richerEvidence(r)}

${worthSection(r, sale, extra)}

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
${view.fixes.length ? `<ol style="list-style:none;margin:0;padding:0">${view.fixes.map((f) => `<li class="fix ${f.priority}" style="max-width:none"><span class="tag">${f.priority === "high" ? "Do this first" : "Worth doing"}</span><b>${esc(f.title)}</b><span>${esc(f.why)}</span></li>`).join("")}</ol>` : `<div class="card">Your Google profile is in good shape. The next step is a steady flow of new reviews.</div>`}

<div class="noprint"><a class="cta" href="${extra ? `/start?r=${encodeURIComponent(extra.token)}` : "/start"}">Start free</a>
<p class="small" style="text-align:center;margin:8px 0 0">Free review page and QR code. No card needed.</p>
<p class="small" style="text-align:center;margin:6px 0 0"><a class="book" href="${esc(bookingLink(b.name))}" style="color:#334155">Or book a free 15-minute call</a></p></div>
${presentationClose(r, b, view)}
<h2 id="score">How we worked out your score</h2>
<div class="card score"><div class="dial" style="background:${scoreColour(view.score)}">${view.score}</div>
<div><b>Your local visibility score, out of 100</b><p class="muted" style="margin:4px 0 0">Built from Google's own data about your business and the businesses around you.</p></div></div>
<div class="card">${view.parts
    .map(
      (p) =>
        `<div style="margin:8px 0"><div style="display:flex;justify-content:space-between;font-size:1rem"><span>${esc(p.label)}</span><b>${p.got} / ${p.max}</b></div><div class="bar"><span style="width:${Math.round((p.got / p.max) * 100)}%"></span></div></div>`,
    )
    .join("")}</div>
<p class="small noprint" style="text-align:center;margin-top:10px"><a href="javascript:window.print()" style="color:#334155">Save or print this report</a></p>
<p class="small" style="margin-top:24px">Figures come from Google on the date above and change over time.</p>
${agency.phone || agency.email ? `<p class="small"><b>${esc(agency.name)}</b>${agency.phone ? ` · ${esc(agency.phone)}` : ""}${agency.email ? ` · ${esc(agency.email)}` : ""}</p>` : ""}
</main>${extra ? actionTracker(extra.token) : ""}${extra ? `<script>(function(){var copy=document.getElementById("copy-report"),present=document.getElementById("present-report");if(copy)copy.addEventListener("click",function(){navigator.clipboard.writeText(location.origin+${JSON.stringify(reportUrl)}).then(function(){copy.textContent="Link copied";setTimeout(function(){copy.textContent="Copy share link"},1600)}).catch(function(){prompt("Copy this report link",location.origin+${JSON.stringify(reportUrl)})});});if(present)present.addEventListener("click",function(){if(document.documentElement.requestFullscreen)document.documentElement.requestFullscreen().catch(function(){});document.querySelector(".found")?.scrollIntoView({behavior:"smooth"});});})();</script>` : ""}${extra?.flash === "print" ? `<script>addEventListener("load",function(){setTimeout(function(){print()},300)})</script>` : ""}</body></html>`;
}

export function reportNotFound(): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><link rel="icon" href="/favicon.ico?v=2" sizes="any"><link rel="icon" href="/favicon.png?v=2" type="image/png"><link rel="apple-touch-icon" href="/apple-touch-icon.png?v=2"><meta name="viewport" content="width=device-width,initial-scale=1"><title>RepSuites</title><style>${STYLE}</style></head><body><main style="text-align:center"><h1>Report not found</h1><p class="muted">This link may have been replaced. Ask the person who sent it for a fresh one.</p></main></body></html>`;
}

