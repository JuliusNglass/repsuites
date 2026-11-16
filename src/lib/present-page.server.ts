// Live call presentation built from a prospect's own free check:
// /r/<token>/present. Seven chalkboard scenes that follow the questions in
// the owner's head, from "why do they show up and I don't" to "what does it
// cost me". Arrow keys, space or a click move on. Self-contained HTML.
// Framing: the Fix-It Pack is the foundation; Growth is what moves the
// ranking. No promised positions or review counts, no money-back promise.
// No em dashes in this copy (AGENTS.md).
import type { Report } from "./prospects.server";
import { esc } from "./report-page.server";
import { FIXIT_PRICE } from "./fixit";
import { GROWTH } from "./shop";

function gbp(pence: number): string {
  const p = pence / 100;
  return `£${Number.isInteger(p) ? p : p.toFixed(2)}`;
}

function gridOf(r: Report) {
  const g = r.grids?.[0] ?? (r.grid ? { keyword: r.maps.keyword, ...r.grid } : null);
  return g && g.ranks?.length === 25 ? g : null;
}

function cells(ranks: (number | null)[]): string {
  return ranks
    .map((x, i) => {
      const centre = i === 12;
      const cls = x === -1 ? "n" : x === null ? "x" : x <= 3 ? "a" : x <= 10 ? "b" : "c";
      const label = x === -1 ? "" : x === null ? "20+" : String(x);
      return `<span class="cell ${cls}${centre ? " me" : ""}">${label}</span>`;
    })
    .join("");
}

export function renderPresentation(r: Report, token: string): string {
  const b = r.business;
  const name = esc(b.name);
  const town = esc(b.town || "your area");
  const g = gridOf(r);
  const keyword = esc(g?.keyword ?? r.maps.keyword ?? "your service");
  const top3 = g?.top3 ?? null;
  const rivals = [...(r.rivals ?? [])]
    .sort((a, c) => (c.reviews ?? 0) - (a.reviews ?? 0))
    .slice(0, 3);
  const leader = rivals[0];
  const reviewsNow = b.reviews ?? 0;
  const recent = r.profileAudit?.reviewsLast90Days ?? null;
  const newest = b.newestReviewDays;
  const growthDay = GROWTH.monthPence / 30;
  const fix = FIXIT_PRICE;
  const growth = gbp(GROWTH.monthPence);
  const perDay = `£${(growthDay / 100).toFixed(2)}`;
  const fixesCount = r.fixes?.length ?? 0;

  const rivalRows = [
    { n: b.name, rev: reviewsNow, rating: b.rating, me: true },
    ...rivals.map((x) => ({ n: x.name, rev: x.reviews ?? 0, rating: x.rating, me: false })),
  ];
  const maxRev = Math.max(1, ...rivalRows.map((x) => x.rev));
  const bars = rivalRows
    .map(
      (x) =>
        `<div class="bar${x.me ? " me" : ""}"><span class="bn">${esc(x.n)}</span><span class="bt"><i style="--w:${Math.max(4, Math.round((x.rev / maxRev) * 100))}%"></i></span><span class="bv">${x.rev}${x.rating ? ` · ${x.rating.toFixed(1)}★` : ""}</span></div>`,
    )
    .join("");

  const mapLine =
    top3 === null
      ? `When someone near you searches <b>"${keyword}"</b>, other businesses are shown first.`
      : top3 === 0
        ? `When someone near you searches <b>"${keyword}"</b>, you are not in the top 3 anywhere on this map.`
        : `When someone near you searches <b>"${keyword}"</b>, you are in the top 3 in only <b>${top3} of 25</b> spots.`;

  const scenes = [
    // 1. Their world
    `<section class="scene" data-n="1">
      <p class="kicker">Your free Google check</p>
      <h1>${name}</h1>
      <p class="say">"We do good work. So why isn't the phone ringing like it should?"</p>
      <p class="sub">Let's look at what your customers see on Google in ${town}.</p>
    </section>`,
    // 2. The map
    `<section class="scene" data-n="2">
      <p class="kicker">Why do they show up and I don't?</p>
      <div class="split">
        <div class="grid">${g ? cells(g.ranks) : `<p class="sub">Map check not available for this business.</p>`}</div>
        <div>
          <h2>${mapLine}</h2>
          <p class="sub">Each square is a spot around you. <span class="key a">1-3</span> means customers see you. <span class="key x">20+</span> means they see someone else.</p>
          ${leader ? `<p class="sub">Most reviewed rival nearby: <b>${esc(leader.name)}</b>.</p>` : ""}
        </div>
      </div>
    </section>`,
    // 3. Rivals
    `<section class="scene" data-n="3">
      <p class="kicker">What are they doing that I'm not?</p>
      <h2>Google trusts businesses that get <b>steady, recent reviews</b>, reply to them and stay active.</h2>
      <div class="bars">${bars}</div>
      <p class="sub">${
        recent !== null
          ? `You have had <b>${recent}</b> new review${recent === 1 ? "" : "s"} in the last 90 days.`
          : newest !== null
            ? `Your newest review is <b>${newest} days</b> old.`
            : "Recent reviews matter more than old ones."
      } Rivals who keep collecting them move up.</p>
    </section>`,
    // 4. Fix-It = foundation
    `<section class="scene" data-n="4">
      <p class="kicker">So what's the first step?</p>
      <div class="split">
        <div>
          <h2>The <b>Fix-It Pack</b> is the foundation.</h2>
          <ul class="ticks">
            <li>${fixesCount ? `Your ${fixesCount} gaps fixed, in order` : "Every gap from your check, fixed in order"}</li>
            <li>Right categories, description and services</li>
            <li>Ready to paste in minutes. One-off ${fix}</li>
          </ul>
          <p class="sub">A solid profile is the starting line. On its own it does not keep you moving up.</p>
        </div>
        <figure class="shot"><img src="/present/qr.jpg" alt="RepSuites QR card screen"></figure>
      </div>
    </section>`,
    // 5. Growth = engine
    `<section class="scene" data-n="5">
      <p class="kicker">"Will that be enough?"</p>
      <h2><b>Growth</b> is what moves your ranking, week after week.</h2>
      <div class="three">
        <figure class="shot"><img src="/present/ask.jpg" alt="Asking past customers for reviews"><figcaption>Asks your customers for reviews, a few a day</figcaption></figure>
        <figure class="shot"><img src="/present/rev.jpg" alt="AI review replies"><figcaption>Replies to every review for you</figcaption></figure>
        <figure class="shot"><img src="/present/post.jpg" alt="Weekly Google posts"><figcaption>Posts on Google every week</figcaption></figure>
      </div>
    </section>`,
    // 6. Proof
    `<section class="scene" data-n="6">
      <p class="kicker">"How will I know it's working?"</p>
      <div class="split">
        <figure class="shot"><img src="/present/res.jpg" alt="Monthly results report"></figure>
        <div>
          <h2>Every month you see <b>where you started</b> and <b>where you are now</b>.</h2>
          <ul class="ticks">
            <li>Your map position for "${keyword}"</li>
            <li>New reviews, calls and direction requests</li>
            <li>One thing we focus on next month</li>
          </ul>
        </div>
      </div>
    </section>`,
    // 7. Cost and next step
    `<section class="scene" data-n="7">
      <p class="kicker">"What does it cost me?"</p>
      <div class="price">
        <div class="pcard"><p class="pk">Foundation</p><p class="pp">${fix}</p><p class="pd">Fix-It Pack, one-off</p></div>
        <div class="pcard hi"><p class="pk">Growth</p><p class="pp">${growth}<small>/month</small></p><p class="pd">About ${perDay} a day. Less than a coffee.</p></div>
      </div>
      <h2>One extra customer a month more than pays for it.</h2>
      <p class="sub">No contract. Cancel any time. Your monthly report shows exactly what is moving.</p>
    </section>`,
  ];

  return `<!DOCTYPE html><html lang="en-GB"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex">
<title>${name} | Your Google growth plan</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Caveat:wght@600;700&family=Lexend:wght@400;600;700&display=swap" rel="stylesheet">
<style>
*{box-sizing:border-box;margin:0}
html,body{height:100%;background:#0f1a14;font-family:Lexend,system-ui,sans-serif;color:#f3f1e7;overflow:hidden}
.board{position:fixed;inset:0;margin:auto;width:min(100vw,177.78vh);height:min(100vh,56.25vw);
 background:radial-gradient(120% 90% at 30% 20%,#2c4a3b 0%,#1c3328 55%,#13241c 100%);
 box-shadow:inset 0 0 0 14px #6b4b2a,inset 0 0 0 18px #4a321b,inset 0 0 120px rgba(0,0,0,.55);container-type:size}
.board:before{content:"";position:absolute;inset:0;opacity:.12;pointer-events:none;
 background-image:repeating-linear-gradient(115deg,rgba(255,255,255,.05) 0 2px,transparent 2px 9px)}
.scene{position:absolute;inset:0;padding:7cqh 7cqw;display:flex;flex-direction:column;justify-content:center;gap:2.6cqh;opacity:0;visibility:hidden;transition:opacity .5s}
.scene.on{opacity:1;visibility:visible}
.kicker{font-family:Caveat,cursive;font-size:4.6cqh;color:#ffd166}
h1{font-family:Caveat,cursive;font-size:13cqh;line-height:1;color:#fff}
h2{font-size:4.4cqh;line-height:1.35;font-weight:600;max-width:60cqw}
h2 b,.sub b{color:#ffd166}
.say{font-family:Caveat,cursive;font-size:6cqh;color:#e8e4d4}
.sub{font-size:2.9cqh;line-height:1.5;color:#d9d6c8;max-width:62cqw}
.split{display:grid;grid-template-columns:1fr 1.15fr;gap:4cqw;align-items:center}
.grid{display:grid;grid-template-columns:repeat(5,1fr);gap:1cqh;width:min(44cqh,38cqw);aspect-ratio:1}
.cell{display:grid;place-items:center;border-radius:1.2cqh;font-weight:700;font-size:2.6cqh;border:2px dashed rgba(255,255,255,.35)}
.cell.a{background:rgba(79,209,138,.35);border-color:#4fd18a}
.cell.b{background:rgba(255,209,102,.25);border-color:#ffd166}
.cell.c,.cell.x{background:rgba(255,122,89,.22);border-color:#ff7a59}
.cell.me{outline:3px solid #fff;outline-offset:2px}
.key{padding:0 .6em;border-radius:.4em;font-weight:700}.key.a{background:rgba(79,209,138,.4)}.key.x{background:rgba(255,122,89,.4)}
.bars{display:grid;gap:1.6cqh;max-width:70cqw}
.bar{display:grid;grid-template-columns:24cqw 1fr 12cqw;gap:1.5cqw;align-items:center;font-size:2.7cqh}
.bn{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.bt{height:3cqh;border-bottom:2px dashed rgba(255,255,255,.3)}
.bt i{display:block;height:100%;width:0;background:#e8e4d4;border-radius:.6cqh;opacity:.85}
.bar.me .bn,.bar.me .bv{color:#ffd166;font-weight:700}.bar.me .bt i{background:#ffd166}
.on .bt i{animation:grow 1.2s .4s ease forwards}
@keyframes grow{to{width:var(--w)}}
.ticks{list-style:none;display:grid;gap:1.4cqh;font-size:3cqh;padding:0}
.ticks li:before{content:"✓ ";color:#4fd18a;font-weight:700}
.shot{background:#fff;border-radius:1.4cqh;overflow:hidden;box-shadow:0 2cqh 5cqh rgba(0,0,0,.5);transform:rotate(-1deg)}
.shot img{display:block;width:100%}
.shot figcaption{color:#1c3328;font-size:2.3cqh;font-weight:600;padding:1.2cqh 1.4cqh}
.three{display:grid;grid-template-columns:repeat(3,1fr);gap:2.5cqw}
.three .shot:nth-child(2){transform:rotate(1deg)}
.price{display:flex;gap:3cqw}
.pcard{border:2px dashed rgba(255,255,255,.4);border-radius:2cqh;padding:2.5cqh 3cqw;min-width:24cqw}
.pcard.hi{border:3px solid #ffd166;background:rgba(255,209,102,.1)}
.pk{font-family:Caveat,cursive;font-size:4cqh;color:#ffd166}.pp{font-size:8cqh;font-weight:700}.pp small{font-size:3cqh;font-weight:400}.pd{font-size:2.6cqh;color:#d9d6c8}
.on h1,.on h2,.on .say{animation:write .9s ease both}
.on .sub,.on .ticks,.on .bars,.on .grid,.on .price{animation:fade .8s .5s ease both}
.on .shot{animation:pin .8s .7s ease both}
@keyframes write{from{clip-path:inset(0 100% 0 0)}to{clip-path:inset(0 0 0 0)}}
@keyframes fade{from{opacity:0;transform:translateY(1.5cqh)}to{opacity:1;transform:none}}
@keyframes pin{from{opacity:0;transform:translateY(3cqh) rotate(-4deg)}}
.nav{position:fixed;bottom:2vh;left:50%;transform:translateX(-50%);display:flex;gap:8px;align-items:center;z-index:5}
.nav button{font:inherit;font-weight:700;background:rgba(0,0,0,.45);color:#fff;border:1px solid rgba(255,255,255,.3);border-radius:10px;padding:8px 14px;cursor:pointer}
.dots{display:flex;gap:6px}.dots i{width:9px;height:9px;border-radius:50%;background:rgba(255,255,255,.3)}.dots i.on{background:#ffd166}
.nav a{color:#ffd166;font-weight:700;text-decoration:none;margin-left:10px}
@media (prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important}.bt i{width:var(--w)}}
</style></head><body>
<main class="board" id="b" aria-live="polite">${scenes.join("")}</main>
<nav class="nav" aria-label="Slides"><button id="p" aria-label="Previous">◀</button><span class="dots">${scenes.map(() => "<i></i>").join("")}</span><button id="n" aria-label="Next">▶</button><a href="/r/${esc(token)}" target="_blank" rel="noopener">Full report</a></nav>
<script>
(function(){var s=[].slice.call(document.querySelectorAll('.scene')),d=[].slice.call(document.querySelectorAll('.dots i')),i=0;
function go(n){i=Math.max(0,Math.min(s.length-1,n));s.forEach(function(x,k){x.classList.toggle('on',k===i)});d.forEach(function(x,k){x.classList.toggle('on',k===i)});history.replaceState(null,'','#'+(i+1))}
var h=parseInt(location.hash.slice(1),10);go(h>0?h-1:0);
document.getElementById('n').onclick=function(){go(i+1)};document.getElementById('p').onclick=function(){go(i-1)};
document.getElementById('b').onclick=function(){go(i+1)};
addEventListener('keydown',function(e){if(e.key==='ArrowRight'||e.key===' '||e.key==='PageDown'){e.preventDefault();go(i+1)}if(e.key==='ArrowLeft'||e.key==='PageUp'){go(i-1)}if(e.key==='Home')go(0)});
})();
</script></body></html>`;
}
