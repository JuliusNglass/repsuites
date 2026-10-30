// Server-only: the shareable insight report a prospect opens (/r/<token>).
// Plain HTML so it loads instantly on a phone and prints cleanly to PDF.
// No em dashes in this copy (AGENTS.md).
import type { Report } from "./prospects.server";

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
@media print{.cta,.noprint{display:none}body{background:#fff}.card{break-inside:avoid}}
`;

export function renderReport(r: Report): string {
  const b = r.business;
  const date = new Date(r.createdAt).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  const rows = [
    { name: `${b.name} (you)`, rating: b.rating, reviews: b.reviews, you: true },
    ...r.rivals.map((x) => ({ name: x.name, rating: x.rating, reviews: x.reviews, you: false })),
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
  const heat = hm
    ? `<h2>Where you show up across your area</h2><div class="card">
<p style="margin:0 0 12px">We searched <b>"${esc(r.maps.keyword)}"</b> from 25 spots around you, each ${esc(hm.spacing)} apart, as a customer standing there would. The middle dot is your street.</p>
<div style="display:grid;grid-template-columns:repeat(${hm.size},1fr);gap:8px;max-width:340px;margin:0 auto">${hm.ranks
        .map((v, i) => {
          const d = dot(v);
          const mid = i === Math.floor((hm.size * hm.size) / 2);
          return `<div style="aspect-ratio:1;border-radius:50%;background:${d.bg};color:${d.fg};display:flex;align-items:center;justify-content:center;font-weight:800;font-size:.85rem;${mid ? "box-shadow:0 0 0 3px #0f172a" : ""}">${d.t}</div>`;
        })
        .join("")}</div>
<p class="small" style="text-align:center;margin:10px 0 0"><span style="color:#059669">&#9679;</span> top 3 &nbsp; <span style="color:#f59e0b">&#9679;</span> 4 to 10 &nbsp; <span style="color:#ef4444">&#9679;</span> 11 or lower</p>
<p style="margin:14px 0 0">You are in the <b>top 3 in ${hm.top3} of 25 spots</b>${hm.found < 25 ? `, and not in the first 20 results in ${25 - hm.found}` : ""}. The top 3 get most of the calls, so every red or amber dot is customers going elsewhere.</p></div>`
    : "";
  const g = r.reviewGap;
  const gap = g
    ? `<div class="card"><b>Catching the next business up</b><p style="margin:6px 0 0">${esc(g.leader)} has ${g.leaderReviews} reviews and you have ${b.reviews}. That is a gap of ${g.need}.</p>
<p class="muted" style="margin:6px 0 0">Worked out simply: ${g.need} reviews divided by 52 weeks is about <b>${g.perWeekIn12Months} new review${g.perWeekIn12Months === 1 ? "" : "s"} a week</b> to catch them within a year, or ${g.perWeekIn6Months} a week to do it in 6 months. Asking every customer, every day, is how businesses get there.</p></div>`
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
      `<tr class="${x.you ? "you" : ""}"><td>${esc(x.name)}</td><td>${x.rating === null ? "-" : x.rating.toFixed(1)}</td><td>${x.reviews}</td></tr>`,
  )
  .join("")}</table></div>
${gap}

<h2>What to fix first</h2>
${r.fixes.length ? r.fixes.map((f) => `<div class="fix ${f.priority}"><b>${esc(f.title)}</b><span>${esc(f.why)}</span></div>`).join("") : `<div class="card">Your Google profile is in good shape. The next step is a steady flow of new reviews.</div>`}

<a class="cta" href="${esc(bookingLink(b.name))}">Book a free 15-minute call to fix this</a>
<p class="small noprint" style="text-align:center;margin-top:10px"><a href="javascript:window.print()" style="color:#64748b">Save or print this report</a></p>
<p class="small" style="margin-top:24px">Figures come from Google on the date above and change over time. The Maps position is one search from your business's own location.</p>
</main></body></html>`;
}

export function reportNotFound(): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><link rel="icon" href="/favicon.ico?v=2" sizes="any"><link rel="icon" href="/favicon.png?v=2" type="image/png"><link rel="apple-touch-icon" href="/apple-touch-icon.png?v=2"><meta name="viewport" content="width=device-width,initial-scale=1"><title>RepSuites</title><style>${STYLE}</style></head><body><main style="text-align:center"><h1>Report not found</h1><p class="muted">This link may have been replaced. Ask the person who sent it for a fresh one.</p></main></body></html>`;
}
