// Report story mode: 5 or 6 full-screen cards people tap through, like phone
// stories, before the full report. Pure (builds HTML), so it can be tested.
// Every number comes from the report itself. No em dashes in this copy.

export type StoryInput = {
  business: string;
  score: number;
  keyword: string | null;
  ranks: (number | null)[] | null; // 25 spots, -1 = not checked, null = not in top 20
  top3: number | null;
  reviews: number;
  newestReviewDays: number | null;
  leader: { name: string; reviews: number } | null;
  fixes: string[];
  fixUrl: string | null;
  cleaning: boolean;
};

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

function age(days: number): string {
  if (days < 14) return `${days} day${days === 1 ? "" : "s"}`;
  if (days < 70) return `${Math.round(days / 7)} weeks`;
  if (days < 730) return `${Math.round(days / 30)} months`;
  return `over ${Math.floor(days / 365)} year${days >= 730 ? "s" : ""}`;
}

// Same colours, shapes and marks as the full report's map pins.
function dot(v: number | null, i: number): string {
  const band =
    v === -1 ? "unknown" : v === null ? "missing" : v <= 3 ? "top3" : v <= 10 ? "near" : "far";
  const t = v === -1 ? "?" : v === null ? "&#10005;" : String(v);
  return `<span class="sd sd-${band}${i === 12 ? " you" : ""}" style="animation-delay:${0.15 + i * 0.06}s">${t}</span>`;
}

export function storyCards(s: StoryInput): string[] {
  const cards: string[] = [];
  const biz = esc(s.business);
  cards.push(
    `<p class="sk">Your free Google Check</p><h2>${biz}</h2><div class="sbig">${s.score}<small>/100</small></div><p>How easy you are to find on Google, in 60 seconds. Tap to go on.</p>`,
  );
  if (s.ranks && s.ranks.length === 25 && s.top3 !== null) {
    const verdict =
      s.top3 >= 20
        ? "You are in the top 3 almost everywhere. Great work."
        : s.top3 === 0
          ? "In every spot, people see other businesses first."
          : "In the other spots, people see other businesses first.";
    cards.push(
      `<p class="sk">Google Maps around you</p><h2>Top 3 in ${s.top3} of 25 spots</h2><div class="sgrid" aria-label="Your Google Maps position in 25 spots around you">${s.ranks.map(dot).join("")}</div><p>When people search <b>"${esc(s.keyword ?? "")}"</b>. ${verdict}</p><p class="sl"><i class="sd-top3"></i>Top 3 <i class="sd-near"></i>4 to 10 <i class="sd-far"></i>11 to 20 <i class="sd-missing"></i>Missing</p>`,
    );
  }
  if (s.leader && s.leader.reviews > s.reviews) {
    const max = Math.max(s.leader.reviews, 1);
    const w = (n: number) => Math.max(3, Math.round((n / max) * 100));
    cards.push(
      `<p class="sk">Who is beating you</p><h2>${esc(s.leader.name)} has ${s.leader.reviews.toLocaleString("en-GB")} reviews</h2><div class="sbar"><span>${esc(s.leader.name)}</span><b style="width:${w(s.leader.reviews)}%"></b><em>${s.leader.reviews.toLocaleString("en-GB")}</em></div><div class="sbar you"><span>You</span><b style="width:${w(s.reviews)}%"></b><em>${s.reviews.toLocaleString("en-GB")}</em></div><p>Google and customers both favour the business with more reviews.</p>`,
    );
  }
  if (s.newestReviewDays !== null && s.reviews > 0) {
    const fresh = s.newestReviewDays <= 30;
    cards.push(
      `<p class="sk">Your reviews</p><h2>Your newest review is ${age(s.newestReviewDays)} old</h2><p>${fresh ? "Nice and recent. Keep them coming: Google favours businesses with fresh reviews." : "Google favours businesses with recent reviews. A few new ones this month would help you move up."}</p>`,
    );
  } else if (s.reviews === 0) {
    cards.push(
      `<p class="sk">Your reviews</p><h2>You have no Google reviews yet</h2><p>Most people skip a business with no reviews and call the next one. Your first 10 make the biggest difference.</p>`,
    );
  }
  if (s.fixes.length)
    cards.push(
      `<p class="sk">Fix these first</p><h2>Your top ${Math.min(3, s.fixes.length)} fixes</h2><ol class="sf">${s.fixes
        .slice(0, 3)
        .map((f) => `<li>${esc(f)}</li>`)
        .join("")}</ol>`,
    );
  cards.push(
    `<p class="sk">What next?</p><h2>Want us to do the fixes for you?</h2><p>We write every fix from your report, ready to copy into Google. £27 one-off, about 90p a day for a month.</p>${s.fixUrl ? `<a class="sbtn" href="${esc(s.fixUrl)}">Fix it for me</a>` : ""}<button type="button" class="sbtn ghost" data-close>See my full report</button>${s.cleaning ? `<p class="small">Run a cleaning team? <a href="https://ops.accelur8clientwork.com/cleaning">See SparkOps</a>, the app we built for cleaning businesses.</p>` : ""}`,
  );
  return cards;
}

const STORY_STYLE = `.story,.story *{box-sizing:border-box}.story{position:fixed;inset:0;z-index:9999;background:linear-gradient(180deg,var(--report-primary,#0b1d3a),#06101f);color:#fff;display:flex;flex-direction:column;font-size:18px;line-height:1.5}
.story[hidden]{display:none}.sbars{display:flex;gap:5px;padding:14px 16px 0}.sbars i{flex:1;height:4px;border-radius:4px;background:rgba(255,255,255,.25);overflow:hidden}.sbars i b{display:block;height:100%;width:0;background:#fff}.sbars i.done b{width:100%}.sbars i.on b{animation:sfill 7s linear forwards}
@keyframes sfill{to{width:100%}}.stop{display:flex;justify-content:flex-end;padding:8px 12px}.sx{background:none;border:0;color:#fff;font:inherit;font-size:16px;text-decoration:underline;min-height:44px;cursor:pointer}
.scard{flex:1;display:none;flex-direction:column;justify-content:center;max-width:520px;margin:0 auto;padding:0 22px 40px;width:100%}.scard.on{display:flex;animation:sin .35s ease}
@keyframes sin{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:none}}
.scard h2{font-size:clamp(26px,7vw,36px);line-height:1.15;margin:0 0 14px;color:#fff}.sk{margin:0 0 8px;color:var(--report-accent,#f5b324);font-weight:700}
.sbig{font-size:84px;font-weight:800;line-height:1;margin:6px 0 14px}.sbig small{font-size:28px;opacity:.7}
.sgrid{display:grid;grid-template-columns:repeat(5,1fr);gap:8px;margin:6px 0 16px;max-width:340px}.sd{aspect-ratio:1;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:15px;color:#fff;opacity:0;transform:scale(.3);animation:spop .35s ease forwards}
@keyframes spop{to{opacity:1;transform:none}}.sd-top3{background:#1f6fd1;border-radius:50%}.sd-near{background:#f0a020;color:#0b1b33!important;border-radius:28%!important}.sd-far{background:#d93a3f;border-radius:8%!important}.sd-missing{background:#1e293b;border:2px solid #fff;font-size:20px!important}.sd-unknown{background:#e2e8f0;color:#334155!important}.sd.you{box-shadow:0 0 0 3px var(--report-accent,#f5b324)}.sl{font-size:15px;opacity:.85}.sl i{display:inline-block;width:14px;height:14px;border-radius:50%;margin:0 4px 0 10px;vertical-align:middle}
.sbar{display:grid;grid-template-columns:1fr;gap:4px;margin:0 0 14px}.sbar span{font-weight:700}.sbar b{display:block;height:22px;border-radius:8px;background:rgba(255,255,255,.55);animation:sgrow 1s ease}.sbar.you b{background:var(--report-accent,#f5b324)}.sbar em{font-style:normal;font-size:15px}
@keyframes sgrow{from{width:0}}.sf{padding-left:22px}.sf li{margin:0 0 12px}
.sbtn{display:flex;align-items:center;justify-content:center;text-align:center;min-height:52px;border-radius:14px;background:var(--report-accent,#f5b324);color:#0b1424;font-weight:800;text-decoration:none;margin:14px 0 0;border:0;font:inherit;font-weight:800;cursor:pointer;width:100%}.sbtn.ghost{background:transparent;color:#fff;border:1px solid rgba(255,255,255,.5)}
.story .small{font-size:15px;opacity:.85;margin-top:16px}.story .small a{color:#fff}
@media (prefers-reduced-motion:reduce){.scard.on,.sd,.sbar b{animation:none;opacity:1;transform:none}.sbars i.on b{animation:none;width:100%}}
@media print{.story{display:none!important}}`;

// The overlay: shown on the first open of the report in this browser tab.
// Tap right or wait to go on, tap left to go back, "Skip" for the full report.
export function storyMode(s: StoryInput, token: string): string {
  const cards = storyCards(s);
  if (cards.length < 3) return "";
  const t = JSON.stringify(token);
  return `<style>${STORY_STYLE}</style><div class="story noprint" id="story" hidden role="dialog" aria-label="Your report in 60 seconds"><div class="sbars">${cards.map(() => "<i><b></b></i>").join("")}</div><div class="stop"><button type="button" class="sx" data-close>Skip to full report</button></div>${cards.map((c) => `<section class="scard">${c}</section>`).join("")}</div>
<script>(function(){var T=${t},el=document.getElementById("story");if(!el)return;var q=new URLSearchParams(location.search);if(q.has("full")||q.has("print"))return;try{if(sessionStorage.getItem("rs_story_"+T))return;}catch(e){}
var cs=[].slice.call(el.querySelectorAll(".scard")),bs=[].slice.call(el.querySelectorAll(".sbars i")),i=0,tm,rm=matchMedia("(prefers-reduced-motion: reduce)").matches;
function send(n){var b=JSON.stringify({t:T,e:"story",p:n});try{if(navigator.sendBeacon&&navigator.sendBeacon("/api/report-video",new Blob([b],{type:"text/plain"})))return;}catch(e){}fetch("/api/report-video",{method:"POST",body:b,keepalive:true}).catch(function(){});}
function show(n){i=Math.max(0,Math.min(cs.length-1,n));cs.forEach(function(c,j){c.classList.toggle("on",j===i)});bs.forEach(function(b,j){b.className=j<i?"done":j===i?"on":""});send(i+1);clearTimeout(tm);if(!rm&&i<cs.length-1)tm=setTimeout(function(){show(i+1)},7000);}
function close(){clearTimeout(tm);el.hidden=true;document.body.style.overflow="";try{sessionStorage.setItem("rs_story_"+T,"1")}catch(e){}}
el.addEventListener("click",function(e){if(e.target.closest("a,button"))return;if(e.clientX<window.innerWidth*0.3)show(i-1);else if(i<cs.length-1)show(i+1);});
[].slice.call(el.querySelectorAll("[data-close]")).forEach(function(b){b.addEventListener("click",close)});
document.addEventListener("keydown",function(e){if(el.hidden)return;if(e.key==="ArrowRight")show(i+1);if(e.key==="ArrowLeft")show(i-1);if(e.key==="Escape")close();});
el.hidden=false;document.body.style.overflow="hidden";show(0);})();</script>`;
}
