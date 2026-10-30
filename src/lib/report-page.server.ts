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
  const gap = r.reviewGap
    ? `<div class="card"><b>Closing the review gap</b><p style="margin:6px 0 0">${esc(r.reviewGap.leader)} has ${r.reviewGap.leaderReviews} reviews and you have ${b.reviews}. That is a gap of ${r.reviewGap.need}.</p>
<p class="muted" style="margin:6px 0 0">Worked out simply: ${r.reviewGap.need} reviews needed, divided by 5 new reviews a week, is about <b>${r.reviewGap.weeksAt5} weeks</b>. Asking every customer, every day, is how businesses get there.</p></div>`
    : "";
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex">
<title>${esc(b.name)}: how you show up on Google</title><style>${STYLE}</style></head><body><main>
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

${mapsLine ? `<h2>Where you show up on Google Maps</h2><div class="card">${mapsLine}</div>` : ""}

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
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>RepSuites</title><style>${STYLE}</style></head><body><main style="text-align:center"><h1>Report not found</h1><p class="muted">This link may have been replaced. Ask the person who sent it for a fresh one.</p></main></body></html>`;
}
