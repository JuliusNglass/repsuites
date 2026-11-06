import { createFileRoute } from "@tanstack/react-router";
import { jsPDF } from "jspdf";
import { serviceRead } from "../lib/supabase-service.server";
import type { Report } from "../lib/prospects.server";
import { scoreView } from "../lib/report-page.server";
import { relevantMapCompetitor } from "../lib/rank-grid";
import { gridSpots } from "../lib/report-map";

const clean = (value: unknown) =>
  String(value ?? "")
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/[^\x09\x0A\x0D\x20-\x7E\u00A0-\u00FF]/g, "");

type Brand = {
  agency_name?: string | null;
  primary_hex?: string | null;
  secondary_hex?: string | null;
  phone?: string | null;
  email?: string | null;
};

type MapTile = { data: Uint8Array; col: number; row: number };

function mapPixel(lat: number, lng: number, zoom: number) {
  const scale = 256 * 2 ** zoom;
  const sin = Math.sin((lat * Math.PI) / 180);
  return {
    x: ((lng + 180) / 360) * scale,
    y: (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * scale,
  };
}

async function osmMap(center?: { lat: number; lng: number } | null) {
  if (!center) return null;
  const zoom = 13;
  const point = mapPixel(center.lat, center.lng, zoom);
  const viewportPixels = 256 * 3;
  const topLeftX = point.x - viewportPixels / 2;
  const topLeftY = point.y - viewportPixels / 2;
  const baseX = Math.floor(topLeftX / 256);
  const baseY = Math.floor(topLeftY / 256);
  const tiles = (
    await Promise.all(
      Array.from({ length: 16 }, async (_, index): Promise<MapTile | null> => {
        const col = index % 4;
        const row = Math.floor(index / 4);
        try {
          const response = await fetch(
            `https://tile.openstreetmap.org/${zoom}/${baseX + col}/${baseY + row}.png`,
            { headers: { "User-Agent": "RepSuites/1.0 (https://repsuites.com)" } },
          );
          if (!response.ok) return null;
          return { data: new Uint8Array(await response.arrayBuffer()), col, row };
        } catch {
          return null;
        }
      }),
    )
  ).filter((tile): tile is MapTile => tile !== null);
  return tiles.length === 16 ? { tiles, zoom, baseX, baseY, topLeftX, topLeftY } : null;
}

function serviceCategory(report: Report) {
  const category = clean(report.business.category).trim();
  if (!category || /^(service|services|establishment|business)$/i.test(category)) {
    return clean(report.maps.keyword || "Main service").replace(/\b\w/g, (letter) =>
      letter.toUpperCase(),
    );
  }
  return category;
}

async function reportPdf(report: Report, brand: Brand) {
  const doc = new jsPDF({ unit: "mm", format: "a4", compress: true });
  const primary = /^#[0-9a-f]{6}$/i.test(brand.primary_hex ?? "") ? brand.primary_hex! : "#0b1d3a";
  const accent = /^#[0-9a-f]{6}$/i.test(brand.secondary_hex ?? "")
    ? brand.secondary_hex!
    : "#f5b324";
  const agency = clean(brand.agency_name || "RepSuites");
  const view = scoreView(report);
  const grids = report.grids?.length
    ? report.grids
    : report.grid
      ? [{ ...report.grid, keyword: report.maps.keyword }]
      : [];
  const grid = grids[0];
  const mapCenter = grid?.center ?? null;
  const map = await osmMap(mapCenter);
  const keywordTerms = report.maps.keyword
    .toLocaleLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((term) => term.length > 3 && !["company", "service", "services", "near"].includes(term));
  const rivals = report.rivals.filter(
    (r) =>
      relevantMapCompetitor({ title: r.name, category: r.kind }, report.maps.keyword) ||
      keywordTerms.some((term) => r.name.toLocaleLowerCase().includes(term)),
  );
  const irrelevantNames = report.rivals
    .filter((r) => !relevantMapCompetitor({ title: r.name, category: r.kind }, report.maps.keyword))
    .map((r) => r.name.toLocaleLowerCase());
  const fixes = [
    ...view.fixes.filter((fix) => {
      const copy = `${fix.title} ${fix.why}`.toLocaleLowerCase();
      return !irrelevantNames.some((name) => copy.includes(name));
    }),
    ...(report.websiteAudit?.findings ?? [])
      .filter((finding) => ["title", "h1", "description", "phone", "schema"].includes(finding.id))
      .map((finding) => ({
        title: `Improve ${finding.label.toLocaleLowerCase()}`,
        why: finding.recommendation,
      })),
  ].filter(
    (fix, index, all) =>
      all.findIndex(
        (candidate) => candidate.title.toLocaleLowerCase() === fix.title.toLocaleLowerCase(),
      ) === index,
  );
  const W = 210;
  const M = 16;
  const CW = W - M * 2;
  let y = 24;
  let page = 1;

  const footer = () => {
    doc.setDrawColor("#dbe5ef");
    doc.line(M, 284, W - M, 284);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor("#64748b");
    doc.text("Discover. Diagnose. Prioritise. Prove.", M, 290);
    doc.text(String(page), W - M, 290, { align: "right" });
  };
  const header = (chapter = "LOCAL VISIBILITY GROWTH PLAN") => {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(primary);
    doc.text(agency, M, 11);
    doc.setFont("helvetica", "normal");
    doc.setTextColor("#64748b");
    doc.text(chapter, W - M, 11, { align: "right" });
    doc.setDrawColor(accent);
    doc.setLineWidth(0.8);
    doc.line(M, 15, W - M, 15);
    y = 24;
  };
  const newPage = (chapter: string) => {
    footer();
    doc.addPage();
    page += 1;
    header(chapter);
  };
  const ensure = (height: number) => {
    if (y + height > 279) newPage("LOCAL VISIBILITY GROWTH PLAN");
  };
  const heading = (text: string, size = 20) => {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(size);
    const lines = doc.splitTextToSize(clean(text), CW);
    ensure(lines.length * size * 0.4 + 7);
    doc.setTextColor(primary);
    doc.text(lines, M, y);
    y += lines.length * size * 0.4 + 5;
  };
  const para = (text: string, bold = false, size = 10) => {
    doc.setFont("helvetica", bold ? "bold" : "normal");
    doc.setFontSize(size);
    const lines = doc.splitTextToSize(clean(text), CW);
    ensure(lines.length * 4.6 + 3);
    doc.setTextColor("#26364a");
    doc.text(lines, M, y);
    y += lines.length * 4.6 + 3;
  };
  const label = (text: string) => {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor("#64748b");
    doc.text(clean(text).toUpperCase(), M, y);
    y += 5;
  };
  const box = (x: number, top: number, w: number, h: number, fill = "#f8fafc") => {
    doc.setFillColor(fill);
    doc.setDrawColor("#dbe5ef");
    doc.roundedRect(x, top, w, h, 3, 3, "FD");
  };
  const metric = (x: number, top: number, w: number, value: string, title: string) => {
    box(x, top, w, 28);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(primary);
    doc.setFontSize(18);
    doc.text(clean(value), x + 5, top + 11);
    doc.setFont("helvetica", "normal");
    doc.setTextColor("#526273");
    doc.setFontSize(8);
    doc.text(doc.splitTextToSize(clean(title), w - 10), x + 5, top + 19);
  };

  // 1. Executive diagnosis.
  header();
  label("Prepared for");
  y += 1;
  heading(report.business.name, 18);
  para(report.business.address);
  para(
    `Prepared ${new Date(report.createdAt).toLocaleDateString("en-GB", {
      day: "numeric",
      month: "long",
      year: "numeric",
    })}. Evidence changes over time.`,
    false,
    9,
  );
  y += 4;
  label("Your Google visibility at a glance");
  const spots = grid?.ranks.length ?? 0;
  const coverage = spots ? Math.round(((grid?.top3 ?? 0) / spots) * 100) : 0;
  para(
    grid
      ? grid.top3 > 0
        ? `You show up well near your strongest location, but customers across most of the area see other businesses first for "${grid.keyword}". Make your service and location clearer, build recent reviews and check the same area again.`
        : `You did not reach the top three anywhere we checked for "${grid.keyword}". Customers are seeing other businesses first.`
      : "This report records what customers can see today. Run an area search to see where your business appears across town.",
    true,
    12,
  );
  const gap = 4;
  const mw = (CW - gap * 3) / 4;
  const mt = y + 2;
  metric(M, mt, mw, grid ? `${grid.top3}/${spots}` : "-", "places where you are top 3");
  metric(M + mw + gap, mt, mw, grid ? `${coverage}%` : "-", "of the area is top 3");
  metric(
    M + (mw + gap) * 2,
    mt,
    mw,
    grid?.average == null ? "-" : grid.average.toFixed(1),
    "average place when found",
  );
  metric(M + (mw + gap) * 3, mt, mw, `${view.score}/100`, "overall visibility score");
  y = mt + 37;
  heading("What matters first", 16);
  fixes.slice(0, 3).forEach((fix, index) => {
    box(M, y, CW, 28, index === 0 ? "#fff7ed" : "#f8fafc");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(primary);
    doc.text(doc.splitTextToSize(`${index + 1}. ${clean(fix.title)}`, CW - 12), M + 6, y + 8);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.setTextColor("#526273");
    doc.text(doc.splitTextToSize(clean(fix.why), CW - 12).slice(0, 3), M + 6, y + 17);
    y += 32;
  });

  // 2. Visual ranking evidence.
  newPage("01 / LOCAL MAP VISIBILITY");
  heading("Where customers see you on Google Maps", 21);
  para(
    grid
      ? `We searched Google Maps from ${spots} places around your business for "${grid.keyword}". Each circle shows where you appeared from that place.`
      : "We do not have an area map for this report yet.",
  );
  if (grid && map && mapCenter) {
    const mapSize = 150;
    const mapLeft = (W - mapSize) / 2;
    const mapTop = y + 2;
    const viewportPixels = 256 * 3;
    const tileSize = mapSize / 3;
    doc.saveGraphicsState();
    doc.rect(mapLeft, mapTop, mapSize, mapSize);
    doc.clip();
    map.tiles.forEach((tile) => {
      doc.addImage(
        tile.data,
        "PNG",
        mapLeft + (((map.baseX + tile.col) * 256 - map.topLeftX) / viewportPixels) * mapSize,
        mapTop + (((map.baseY + tile.row) * 256 - map.topLeftY) / viewportPixels) * mapSize,
        tileSize,
        tileSize,
      );
    });
    const points = gridSpots(mapCenter, grid.size || 5, grid.spacingKm ?? 0.8);
    grid.ranks.forEach((rank, index) => {
      const point = mapPixel(points[index]!.lat, points[index]!.lng, map.zoom);
      const x = mapLeft + ((point.x - map.topLeftX) / viewportPixels) * mapSize;
      const yy = mapTop + ((point.y - map.topLeftY) / viewportPixels) * mapSize;
      const fill =
        rank == null ? "#64748b" : rank <= 3 ? "#15803d" : rank <= 10 ? "#f59e0b" : "#dc2626";
      doc.setFillColor(fill);
      doc.setDrawColor("#ffffff");
      doc.circle(x, yy, 4.1, "FD");
      doc.setTextColor("#ffffff");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(7);
      doc.text(rank == null ? "-" : String(rank), x, yy + 1.4, { align: "center" });
    });
    doc.restoreGraphicsState();
    doc.setDrawColor("#cbd5e1");
    doc.rect(mapLeft, mapTop, mapSize, mapSize);
    doc.setFillColor("#ffffff");
    doc.setDrawColor("#cbd5e1");
    doc.roundedRect(mapLeft + 3, mapTop + mapSize - 10, 56, 7, 1.5, 1.5, "FD");
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6.5);
    doc.setTextColor("#475569");
    doc.text("Map data © OpenStreetMap contributors", mapLeft + 5, mapTop + mapSize - 5.5);
    y = mapTop + mapSize + 7;
    para(
      "Green 1-3: customers see you first   Amber 4-10: customers may need to scroll   Red 11-20: hard to find   Grey: not found",
    );
  } else if (grid) {
    const size = grid.size || Math.round(Math.sqrt(grid.ranks.length));
    const cell = 18;
    const left = (W - size * cell) / 2;
    const top = y + 4;
    grid.ranks.forEach((rank, index) => {
      const x = left + (index % size) * cell;
      const yy = top + Math.floor(index / size) * cell;
      const fill =
        rank == null ? "#eef2f7" : rank <= 3 ? "#15803d" : rank <= 10 ? "#f59e0b" : "#dc2626";
      doc.setFillColor(fill);
      doc.setDrawColor("#ffffff");
      doc.roundedRect(x, yy, cell - 1, cell - 1, 2, 2, "FD");
      doc.setTextColor(rank == null ? "#64748b" : "#ffffff");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      doc.text(rank == null ? "-" : String(rank), x + 8.5, yy + 11, { align: "center" });
    });
    y = top + size * cell + 10;
    para("Green 1-3: seen first   Amber 4-10: needs a scroll   Red 11-20: weak   Grey: not found");
    y += 4;
    heading("Expert interpretation", 16);
    para(
      grid.top3 >= Math.ceil(spots * 0.75)
        ? "Coverage is strong. Protect the advantage with accurate profile information, consistent recent reviews and repeat scans."
        : "Visibility is concentrated rather than market-wide. Improve service-and-location relevance, strengthen recent proof and repeat this exact scan to verify movement.",
      true,
      11,
    );
  }

  // 3. Competition and profile evidence.
  newPage("02 / MARKET AND PROFILE EVIDENCE");
  heading("The businesses customers see before you", 21);
  para("We only include businesses that offer the same kind of service.");
  const gridCompetitors = grid?.competitors ?? [];
  const tableRows = [
    {
      name: `${report.business.name} (you)`,
      top3: grid?.top3 ?? 0,
      found: grid?.found ?? 0,
      average: grid?.average ?? null,
    },
    ...gridCompetitors.slice(0, 5),
  ];
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.5);
  doc.setTextColor("#64748b");
  doc.text("BUSINESS", M + 5, y);
  doc.text("TOP 3", M + 118, y, { align: "center" });
  doc.text("FOUND", M + 142, y, { align: "center" });
  doc.text("AVERAGE", W - M - 5, y, { align: "right" });
  y += 4;
  tableRows.forEach((row, index) => {
    box(M, y, CW, 15, index === 0 ? "#fffbeb" : "#f8fafc");
    doc.setFont("helvetica", index === 0 ? "bold" : "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(primary);
    doc.text(doc.splitTextToSize(clean(row.name), 100).slice(0, 2), M + 5, y + 6);
    doc.setTextColor("#526273");
    doc.text(String(row.top3), M + 118, y + 8, { align: "center" });
    doc.text(String(row.found), M + 142, y + 8, { align: "center" });
    doc.text(row.average == null ? "-" : row.average.toFixed(1), W - M - 5, y + 8, {
      align: "right",
    });
    y += 18;
  });
  y += 5;
  heading("What Google shows about your business", 17);
  const profile = report.profileAudit;
  const evidence: Array<[string, string]> = [
    ["Main service", serviceCategory(report)],
    ["Phone", report.business.phone || "No phone shown on Google"],
    ["Opening hours", report.business.hasHours ? "Shown on Google" : "Not shown on Google"],
    [
      "Photos",
      profile?.photos
        ? `${profile.photos} photos found`
        : "Google did not return a reliable count; check your profile",
    ],
    [
      "Review recency",
      profile?.newestReviewAt
        ? new Date(profile.newestReviewAt).toLocaleDateString("en-GB")
        : `${report.business.reviews} reviews; Google did not return the review dates`,
    ],
  ];
  evidence.forEach(([name, value]) => {
    box(M, y, CW, 14);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(primary);
    doc.text(name, M + 5, y + 8);
    doc.setFont("helvetica", "normal");
    doc.setTextColor("#526273");
    doc.text(doc.splitTextToSize(clean(value), 125).slice(0, 2), M + 47, y + 8);
    y += 17;
  });

  // 4. Prescriptive website diagnosis.
  newPage("03 / WEBSITE DIAGNOSIS");
  heading("What to improve on your website", 21);
  para(
    "We checked whether your website clearly says what you do, where you work, why customers should trust you and how they can contact you.",
  );
  const topic = report.maps.keyword || report.business.category || "main service";
  const town = report.business.town || "the service area";
  const advice: Record<string, [string, string, string]> = {
    title: [
      "HIGH / LOW EFFORT",
      "Put the primary service and location first, remove repetition and retain the brand.",
      `${topic} ${town} | ${report.business.name}`,
    ],
    h1: [
      "HIGH / LOW EFFORT",
      "Use one visible main heading that identifies the service and location.",
      `${topic} in ${town}`,
    ],
    description: [
      "MEDIUM / LOW EFFORT",
      "Lead with service and area, add proof and finish with a clear next step.",
      `${report.business.name} provides ${topic} in ${town}. See proof and request a quote.`,
    ],
    viewport: [
      "VERIFY MANUALLY",
      "Keep the mobile viewport; test text size, tap targets and one full enquiry.",
      "Complete an enquiry on a real phone.",
    ],
    phone: [
      "HIGH VALUE / 5 MINUTES",
      "Keep tap-to-call visible and confirm the number matches Google.",
      report.business.phone || "Confirm the preferred sales number.",
    ],
    schema: [
      "MEDIUM / SPECIALIST",
      "Check the hidden business details that Google reads: your name, website, phone, service and area.",
      "Ask your website expert to test the business details Google reads.",
    ],
  };
  (report.websiteAudit?.findings ?? []).forEach((finding) => {
    const item = advice[finding.id] ?? [
      "REVIEW",
      finding.recommendation,
      "Repeat the same evidence check after approval.",
    ];
    box(M, y, CW, 35, finding.status === "pass" ? "#f8fafc" : "#fff7ed");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(finding.status === "pass" ? "#047857" : "#b45309");
    doc.text(item[0], M + 5, y + 6);
    doc.setTextColor(primary);
    doc.setFontSize(11);
    doc.text(clean(finding.label), M + 5, y + 13);
    doc.setFont("helvetica", "normal");
    doc.setTextColor("#526273");
    doc.setFontSize(8);
    doc.text(
      doc.splitTextToSize(`Observed: ${clean(finding.evidence)}`, 78).slice(0, 3),
      M + 5,
      y + 19,
    );
    doc.setTextColor("#26364a");
    doc.text(doc.splitTextToSize(`Action: ${clean(item[1])}`, 82).slice(0, 3), M + 91, y + 7);
    doc.setFont("helvetica", "bold");
    doc.text(doc.splitTextToSize(`Example: ${clean(item[2])}`, 82).slice(0, 3), M + 91, y + 22);
    y += 39;
  });

  // 5. Approved 90-day plan.
  newPage("04 / PRIORITISED ACTION PLAN");
  heading("Your 90-day local visibility plan", 21);
  para(
    "Choose who will do each action and by when. Then run the same checks again to see what changed.",
  );
  fixes.slice(0, 6).forEach((fix, index) => {
    const when = index < 2 ? "DAYS 1-14" : index < 4 ? "DAYS 15-45" : "DAYS 46-90";
    const verify = /review/i.test(fix.title)
      ? "Review count, latest review date and response evidence."
      : /maps|google/i.test(fix.title)
        ? "Repeat the same phrase at the same grid points."
        : "Repeat the same dated evidence check.";
    box(M, y, CW, 32, index < 2 ? "#fff7ed" : "#f8fafc");
    doc.setFont("helvetica", "bold");
    doc.setTextColor(index < 2 ? "#b45309" : "#2563eb");
    doc.setFontSize(8);
    doc.text(when, M + 5, y + 6);
    doc.setTextColor(primary);
    doc.setFontSize(10);
    doc.text(doc.splitTextToSize(clean(fix.title), CW - 10).slice(0, 2), M + 5, y + 13);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor("#526273");
    doc.text(doc.splitTextToSize(`Why: ${clean(fix.why)}`, 108).slice(0, 2), M + 5, y + 22);
    doc.text(doc.splitTextToSize(`Verify: ${verify}`, 56).slice(0, 2), M + 120, y + 22);
    y += 36;
  });
  // 6. Commercial case and handoff.
  newPage("05 / OPPORTUNITY AND NEXT PROOF");
  heading("What one more customer could be worth to you", 21);
  para(
    "This example shows what one additional customer a week could add to your yearly sales. It is an example, not a promise.",
  );
  const pounds = !report.business.address.toLowerCase().includes("nigeria");
  const example = pounds ? 60 : 30000;
  const symbol = pounds ? "£" : "N";
  box(M, y, CW, 47, "#fffbeb");
  doc.setFont("helvetica", "bold");
  doc.setTextColor(primary);
  doc.setFontSize(28);
  doc.text(`${symbol}${(example * 52).toLocaleString("en-GB")}`, M + 8, y + 16);
  doc.setFontSize(12);
  doc.text("a year from one additional customer a week", M + 8, y + 27);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor("#526273");
  doc.text(
    `This example uses ${symbol}${example.toLocaleString("en-GB")} per customer. Replace it with what one customer normally spends with you.`, 
    M + 8,
    y + 38,
  );
  y += 58;
  heading("What this report shows you", 16);
  para(
    `You can see how your business appeared in the Google searches we checked on ${new Date(report.createdAt).toLocaleDateString("en-GB")}, along with the public information on your Google profile and website.`, 
  );
  heading("What this report cannot show you", 16);
  para(
    "We cannot see your private Google figures, how many website visitors became customers or what your future position will be. No one can guarantee a Google ranking.",
  );
  heading("Your next step", 16);
  para(
    "Choose the first three actions, decide who will do them and set a date for each one. Save these results, then run the same check again so you can see what changed.",
    true,
  );
  y += 7;
  box(M, y, CW, 35, primary);
  doc.setTextColor("#ffffff");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.text("Discover. Diagnose. Prioritise. Prove.", M + 7, y + 11);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text(
    clean(
      `${agency}${brand.phone ? ` | ${brand.phone}` : ""}${brand.email ? ` | ${brand.email}` : ""}`,
    ),
    M + 7,
    y + 23,
  );
  footer();
  return doc.output("arraybuffer");
}

export const Route = createFileRoute("/r/$token/pdf")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const token = String(params.token || "");
        if (!/^[A-Za-z0-9_-]{20,64}$/.test(token))
          return new Response("Not found", { status: 404 });
        const rows = await serviceRead<{ report: Report; created_by: string | null }[]>(
          `prospects?select=report,created_by&report_token=eq.${token}`,
          "",
        );
        const row = rows.data?.[0];
        if (!row?.report) return new Response("Not found", { status: 404 });
        const branding = row.created_by
          ? await serviceRead<Brand[]>(
              `agency_report_branding?select=agency_name,primary_hex,secondary_hex,phone,email&user_id=eq.${row.created_by}`,
              "",
            )
          : null;
        const bytes = await reportPdf(row.report, branding?.data?.[0] ?? {});
        const filename =
          clean(row.report.business.name)
            .replace(/[^a-z0-9]+/gi, "-")
            .replace(/^-|-$/g, "")
            .slice(0, 80) || "report";
        return new Response(bytes, {
          headers: {
            "Content-Type": "application/pdf",
            "Content-Disposition": `attachment; filename="${filename}-visibility-growth-plan.pdf"`,
            "Cache-Control": "no-store",
          },
        });
      },
    },
  },
});

