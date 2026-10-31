// Server-only: the SparkOps report a cleaning business opens (/r/<token> for
// a prospect whose product is SparkOps). The Google part (map grid, rival
// with the most reviews, review gap) is shared with the RepSuites report; the
// rest is about running the business: where the admin hours go, what sounds
// familiar, and how SparkOps helps.
// No em dashes in this copy (AGENTS.md).
import type { Report } from "./prospects.server";
import {
  actionTracker,
  distanceText,
  esc,
  heatMap,
  salesWhatsApp,
  STYLE,
  videoTracker,
  type RenderExtra,
} from "./report-page.server";
import { embedUrl } from "./prospect-video";
import { isUkAddress } from "./prospect-owner";
import { usesMiles } from "./units";
import { OPS_CHECKS, OPS_CUT, OPS_DEFAULTS, opsCalc, reviewScanLine } from "./sparkops";

// The calculator's starting numbers: a team size from the website or the
// reviews when we found one (about 12 cleans each a week), else the defaults.
// Worked example: 8 cleaners x 12 = 96, rounded to 95 cleans a week.
export function opsStart(r: Report) {
  const team = r.ops?.team ?? null;
  if (!team) return { ...OPS_DEFAULTS, from: null as string | null };
  const cleans = Math.min(400, Math.max(5, Math.round((team * 12) / 5) * 5));
  return { ...OPS_DEFAULTS, cleaners: team, cleans, from: r.ops?.teamFrom ?? null };
}

// The SparkOps sales page with the walkthrough video.
export const SPARKOPS_SAMPLE_URL = "https://getsparkops.accelur8.com";

// "Book a 15-minute demo": SPARKOPS_BOOKING_URL when set, else a WhatsApp
// chat with Julius with the words already typed, else an email.
export function sparkBookingLink(name: string): string {
  const url = (process.env["SPARKOPS_BOOKING_URL"] ?? "").trim();
  if (/^https:\/\//.test(url)) return url;
  const wa = salesWhatsApp();
  if (wa)
    return `https://wa.me/${wa}?text=${encodeURIComponent(`Hi Julius, I read the SparkOps report for ${name}. Can we book a 15-minute demo?`)}`;
  return `mailto:julius@accelur8.com?subject=${encodeURIComponent(`SparkOps demo for ${name}`)}`;
}

const SPARK_STYLE = `
body{background:#f3f7f8}
.brand{color:#0b1d3a}.brand .mark{width:28px;height:28px;border-radius:8px;background:#0f766e;display:flex;align-items:center;justify-content:center;flex-shrink:0}
.brand small{font-weight:600;color:#64748b}
.kicker{color:#0f766e}.biz{border-left-color:#14b8a6}
.cta{background:#0f766e;color:#fff;box-shadow:0 1px 0 rgba(15,23,42,.08),0 6px 16px rgba(15,118,110,.3)}
.cta.alt{background:#fff;color:#0b1d3a;box-shadow:inset 0 0 0 2px #0b1d3a}
.found{box-shadow:0 0 0 2px #14b8a6,0 6px 20px rgba(20,184,166,.15)}
.total{background:#f0fdfa;box-shadow:inset 0 0 0 2px #14b8a6}
.worth input[type=range]{accent-color:#0f766e}
.kw button.on,.seg button.on{background:#0b1d3a;border-color:#0b1d3a}
.ctlgrid label{display:block;font-weight:700;margin-top:12px}
.ctl .unit{color:#64748b;font-size:.85rem;white-space:nowrap}
.est{background:#fff7ed;border-radius:10px;padding:10px 12px;font-size:.9rem;margin:12px 0 0}
.tick{list-style:none;margin:0;padding:0}.tick li{border-bottom:1px solid #e2e8f0;padding:10px 0}.tick li:last-child{border-bottom:0}
.tick label{display:flex;gap:12px;align-items:flex-start;cursor:pointer;min-height:40px}
.tick input{width:22px;height:22px;flex-shrink:0;margin:2px 0 0;accent-color:#0f766e}
.tick b{display:block}.tick span.fx{display:block;color:#475569;font-size:.92rem;margin-top:2px}.tick span.fx em{font-style:normal;font-weight:700;color:#0f766e}
.helps{margin:0;padding-left:18px}.helps li{margin:4px 0}
.price{text-align:center;font-weight:700;margin:14px 0 0;color:#0b1d3a}
.vid .steps .n{background:#14b8a6}.vid .steps .arrow{color:#14b8a6}
`;

const MARK = `<span class="mark" aria-hidden="true"><svg viewBox="0 0 24 24" width="18" height="18" fill="#fff"><path d="M13 2 4 14h6l-1 8 9-12h-6z"/></svg></span>`;
const FAVICON = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><rect width="24" height="24" rx="6" fill="#0f766e"/><path d="M13 3 5 14h5.5l-1 7 8-11h-5.5z" fill="#fff"/></svg>')}`;

export function sparkPreviewText(r: Report): { title: string; description: string } {
  return {
    title: `${r.business.name}: where the hours go`,
    description:
      "How you show up on Google, and how much time rota and admin take each week. Prepared by SparkOps.",
  };
}

function gridsOf(r: Report) {
  return r.grids && r.grids.length
    ? r.grids
    : r.grid
      ? [{ keyword: r.maps.keyword, ...r.grid }]
      : [];
}

// The Google side: the weakest map phrase and the nearby rival with the most
// reviews, then a pointer to the hours.
function findings(r: Report, extra: RenderExtra | null): string {
  const items: { icon: string; text: string }[] = [];
  const grids = gridsOf(r);
  if (grids.length) {
    const worst = [...grids].sort((a, b) => a.top3 - b.top3)[0]!;
    items.push({
      icon: worst.top3 >= 20 ? "&#9989;" : "&#128205;",
      text:
        worst.top3 === 0
          ? `When people near you search <b>"${esc(worst.keyword)}"</b>, you are <b>not in the top 3 anywhere</b> on Google Maps.`
          : worst.top3 >= 25
            ? `When people near you search <b>"${esc(worst.keyword)}"</b>, you are <b>in the top 3 everywhere</b>. Great work.`
            : `When people near you search <b>"${esc(worst.keyword)}"</b>, you are in the top 3 in only <b>${worst.top3} of 25 places</b>.`,
    });
  }
  const b = r.business;
  const leader = r.rivals
    .filter((x) => x.reviews > b.reviews)
    .sort((a, c) => c.reviews - a.reviews)[0];
  if (leader) {
    const away =
      leader.km != null
        ? distanceText(leader.km, usesMiles(extra?.center?.lat, extra?.center?.lng))
        : "";
    items.push({
      icon: "&#11088;",
      text: `<b>${esc(leader.name)}</b>${away ? ` (${esc(away)} away)` : ""} has <b>${leader.reviews.toLocaleString("en-GB")} Google reviews</b>. You have ${b.reviews.toLocaleString("en-GB")}. SparkOps asks every client for a review after each clean.`,
    });
  } else if (b.reviews === 0)
    items.push({
      icon: "&#11088;",
      text: `You have <b>no Google reviews yet</b>. SparkOps asks every client for a review after each clean.`,
    });
  const ops = r.ops;
  const scan = reviewScanLine(ops?.reviews);
  if (scan)
    items.push({
      icon: "&#128172;",
      text: `${esc(scan)}${ops?.reviews?.quote ? ` One says: <i>"${esc(ops.reviews.quote)}"</i>.` : ""} Checklists with photos and 'on my way' texts help stop this.`,
    });
  if (ops?.booking === "none")
    items.push({
      icon: "&#128197;",
      text: `<b>No online booking found on your website.</b> SparkOps can give clients a way to book that puts each clean straight on the rota.`,
    });
  if (ops?.hiring)
    items.push({
      icon: "&#129529;",
      text: `Your website says you are looking for cleaners. SparkOps has a <b>recruitment pipeline</b>: applications, interviews and new starters in one place.`,
    });
  items.push({
    icon: "&#9201;",
    text: `Most cleaning owners spend about <b>6 hours a week</b> on rota and admin. <a href="#hours">Work out yours</a>.`,
  });
  return `<div class="card found"><h2 style="margin:0 0 10px">What we found</h2>
${items.map((i) => `<div class="finding"><span class="fi">${i.icon}</span><p>${i.text}</p></div>`).join("")}</div>`;
}

const FIELDS = [
  { id: "cleans", label: "Cleans a week", min: 5, max: 400, step: 5, unit: "cleans" },
  {
    id: "minutes",
    label: "Minutes of admin per clean today",
    min: 1,
    max: 30,
    step: 1,
    unit: "minutes",
  },
  { id: "cleaners", label: "Cleaners", min: 1, max: 50, step: 1, unit: "cleaners" },
  {
    id: "rate",
    label: "What an hour of your time is worth",
    min: 10,
    max: 60,
    step: 1,
    unit: "£ an hour",
  },
] as const;

// "Where the hours go": sliders and the sum step by step. The page script
// runs the same opsCalc as the server, so the numbers always match.
function hoursSection(r: Report, extra: RenderExtra | null): string {
  const { from, ...d } = opsStart(r);
  const c = opsCalc(d);
  const teamNote = from
    ? `Your ${from === "website" ? "website" : "reviews"} mention${from === "website" ? "s" : ""} ${d.cleaners} cleaners, so we started there, with about 12 cleans each a week.`
    : `We started with ${d.cleaners} cleaners as an estimate. Change it to match your team.`;
  const print = extra?.flash === "print";
  const controls = print
    ? `<p class="muted" style="margin:10px 0 0">At ${d.cleans} cleans a week, ${d.minutes} minutes of admin each, ${d.cleaners} cleaners and £${d.rate} an hour:</p>`
    : `<div class="noprint ctlgrid">${FIELDS.map(
        (f) => `<label for="ops-${f.id}">${f.label}</label>
<div class="ctl"><input id="ops-${f.id}-r" type="range" min="${f.min}" max="${f.max}" step="${f.step}" value="${d[f.id]}" aria-label="${f.label}">
<span class="num">${f.id === "rate" ? "£" : ""}<input id="ops-${f.id}" data-k="${f.id}" type="number" inputmode="numeric" min="${f.min}" max="${f.max * 10}" step="1" value="${d[f.id]}" aria-label="${f.label}"></span></div>`,
      ).join("")}</div>`;
  const script = print
    ? ""
    : `<script>(function(){var calc=${opsCalc.toString()};var v=${JSON.stringify(d)};
function draw(){var c=calc(v),L=document.querySelectorAll("#ops-sum li");c.lines.forEach(function(t,i){if(L[i])L[i].innerHTML=t;});document.getElementById("ops-total").innerHTML=c.total;document.getElementById("ops-team").innerHTML=c.team;document.getElementById("ops-week").textContent=String(c.savedWeek).replace(/\\.0$/,"");}
["cleans","minutes","cleaners","rate"].forEach(function(k){var r=document.getElementById("ops-"+k+"-r"),n=document.getElementById("ops-"+k);
r.addEventListener("input",function(){v[k]=+r.value;n.value=r.value;draw();});
n.addEventListener("input",function(){var x=Math.round(+n.value);if(!(x>0))return;v[k]=x;r.value=Math.min(x,+r.max);draw();});});})();</script>`;
  return `<h2 id="hours">Where the hours go</h2>
<div class="card worth"><p style="margin:0">Rota changes, texts to cleaners, chasing timesheets, sending invoices: a few minutes per clean soon adds up. Move the sliders to match your business.</p>
${print ? "" : `<p class="small noprint" style="margin:8px 0 0">${teamNote}</p>`}
${controls}
<p id="ops-team" class="muted" style="margin:12px 0 0">${c.team}</p>
<ol id="ops-sum" class="sum" aria-live="polite">${c.lines.map((l) => `<li>${l}</li>`).join("")}</ol>
<div class="total"><div class="big" id="ops-total">${c.total}</div><div>of your time back each year, about <b id="ops-week">${c.savedWeek}</b> hours a week</div></div>
<p class="est"><b>This is an estimate.</b> We assume SparkOps cuts admin by about ${Math.round(OPS_CUT * 100)}%, because bookings, rotas, timesheets and invoices all happen in one place instead of by text and paper. Your own saving may be more or less.</p></div>${script}`;
}

function checklist(extra: RenderExtra | null): string {
  const script =
    extra?.flash === "print"
      ? ""
      : `<script>(function(){var b=document.querySelectorAll(".tick input"),o=document.getElementById("tick-sum");function draw(){var n=0;b.forEach(function(x){if(x.checked)n++;});o.textContent=n?"You ticked "+n+" of "+b.length+". SparkOps handles every one of them.":"Tick the ones that sound like your week.";}b.forEach(function(x){x.addEventListener("change",draw);});})();</script>`;
  return `<h2>Do any of these sound familiar?</h2>
<div class="card"><ul class="tick">${OPS_CHECKS.map(
    (c, i) =>
      `<li><label for="tk${i}"><input id="tk${i}" type="checkbox"><span><b>${esc(c.pain)}</b><span class="fx"><em>SparkOps:</em> ${esc(c.fix)}</span></span></label></li>`,
  ).join("")}</ul>
<p id="tick-sum" class="muted noprint" aria-live="polite" style="margin:10px 0 0">Tick the ones that sound like your week.</p></div>${script}`;
}

function helps(r: Report): string {
  const book = sparkBookingLink(r.business.name);
  const wa = book.startsWith("https://wa.me/");
  return `<h2 id="helps">How SparkOps helps</h2>
<div class="card"><ul class="helps">
<li>Clients book, and every clean lands on one rota.</li>
<li>Each cleaner sees their day, the address and key code on their phone.</li>
<li>Checklists and photos prove every clean was done.</li>
<li>Timesheets, invoices and review requests happen by themselves.</li>
<li>We set it all up for you, with your services and prices.</li>
</ul>
<a class="cta book noprint" href="${esc(book)}"${wa ? ' target="_blank" rel="noopener"' : ""}>Book a 15-minute demo</a>
<a class="cta alt noprint" style="margin-top:10px" href="${SPARKOPS_SAMPLE_URL}" target="_blank" rel="noopener">See a sample day</a>
${isUkAddress(r.business.address) ? `<p class="price">Plans from £97 a month</p>` : ""}
<p class="small" style="text-align:center;margin:8px 0 0">${wa ? "The demo button opens WhatsApp with a message ready to send." : "A short call. No pressure."}</p></div>`;
}

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
  const book = sparkBookingLink(b.name);
  return `<section class="vid noprint">
<h1>${esc(who)}, I recorded this for you</h1>
${player}
<a class="cta book" href="${esc(book)}"${book.startsWith("https://wa.me/") ? ' target="_blank" rel="noopener"' : ""}>Book a 15-minute demo</a>
<p class="small" style="color:#cbd5e1;text-align:center;margin:12px 0 0">Your full report is below.</p>
</section>${videoTracker(extra.token, v.kind)}`;
}

const VIDEO_STYLE = `
.vid{background:#0b1d3a;color:#fff;border-radius:20px;padding:18px 14px 20px;margin:0 -6px 18px}
.vid h1{color:#fff;font-size:1.45rem;margin:0 0 12px}
.frame{position:relative;width:100%;aspect-ratio:16/9;border-radius:12px;overflow:hidden;background:#000}
.frame iframe{position:absolute;inset:0;width:100%;height:100%;border:0}
.vid video{display:block;width:100%;max-height:75vh;border-radius:12px;background:#000}
.vid .cta{margin-top:16px;font-size:1.2rem;padding:18px;background:#14b8a6;color:#0b1d3a}
`;

export function renderSparkReport(r: Report, extra: RenderExtra | null = null): string {
  const b = r.business;
  const date = new Date(r.createdAt).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  const video = extra ? videoSection(b, extra) : "";
  const heat = r.grid || r.grids?.length ? heatMap(r, extra) : "";
  const mapsLine = !r.maps.checked
    ? ""
    : r.maps.position === null
      ? `<p>Searching <b>"${esc(r.maps.keyword)}"</b> from your own street, you are <b>not in the first 20</b> results on Google Maps.</p>`
      : `<p>Searching <b>"${esc(r.maps.keyword)}"</b> from your own street, you are <b>number ${r.maps.position}</b> on Google Maps.</p>`;
  const g = r.reviewGap;
  const gap = g
    ? `<div class="card"><b>Catching the next business up</b><p style="margin:6px 0 0">${esc(g.leader)} has ${g.leaderReviews} reviews and you have ${b.reviews}. That is a gap of ${g.need}.</p>
<p class="muted" style="margin:6px 0 0">${g.need} reviews &divide; 52 weeks = about <b>${g.perWeekIn12Months} new review${g.perWeekIn12Months === 1 ? "" : "s"} a week</b> to catch them in a year. With a review request after every clean, that comes from the work you already do.</p></div>`
    : "";
  const preview = sparkPreviewText(r);
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><link rel="icon" href="${FAVICON}">
<meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex">
<title>${esc(b.name)}: where the hours go | SparkOps</title><meta property="og:type" content="website"><meta property="og:site_name" content="SparkOps by Accelur8"><meta property="og:title" content="${esc(preview.title)}"><meta property="og:description" content="${esc(preview.description)}"><meta name="description" content="${esc(preview.description)}"><style>${STYLE}${SPARK_STYLE}${video ? VIDEO_STYLE : ""}</style></head><body><main>
<div class="brand">${MARK} SparkOps <small>by Accelur8</small></div>
${video}
<p class="kicker">Your cleaning business, week by week</p>
${video ? `<h2 class="biz">${esc(b.name)}</h2>` : `<h1 class="biz">${esc(b.name)}</h1>`}
<p style="margin:10px 0 0">SparkOps runs the day-to-day of a cleaning business: bookings, rotas, cleaners' app, checklists, invoices and reviews, in one place. We looked at how <b>${esc(b.name)}</b> shows up on Google, and at where the hours go in a normal week.</p>
<p class="muted">${esc(b.address)}<br>Prepared ${date}</p>

${findings(r, extra)}

<div id="map"></div>
${heat || (mapsLine ? `<h2>Where you show up on Google Maps</h2><div class="card">${mapsLine}</div>` : "")}
${gap}

${hoursSection(r, extra)}

${checklist(extra)}

${helps(r)}

<p class="small noprint" style="text-align:center;margin-top:10px"><a href="javascript:window.print()" style="color:#64748b">Save or print this report</a></p>
<p class="small" style="margin-top:24px">Google figures come from Google on the date above and change over time. The hours are an estimate from the numbers you set.</p>
</main>${extra ? actionTracker(extra.token) : ""}${extra?.flash === "print" ? `<script>addEventListener("load",function(){setTimeout(function(){print()},300)})</script>` : ""}</body></html>`;
}
