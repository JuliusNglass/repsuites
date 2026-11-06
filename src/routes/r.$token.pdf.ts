import { createFileRoute } from "@tanstack/react-router";
import { jsPDF } from "jspdf";
import { serviceRead } from "../lib/supabase-service.server";
import type { Report } from "../lib/prospects.server";
import { scoreView } from "../lib/report-page.server";
import { relevantMapCompetitor } from "../lib/rank-grid";

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

function reportPdf(report: Report, brand: Brand) {
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
  const rivals = report.rivals.filter((r) =>
    relevantMapCompetitor({ title: r.name, category: r.kind }, report.maps.keyword),
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
      .filter((finding) => finding.status !== "pass")
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
  label("Executive diagnosis");
  const spots = grid?.ranks.length ?? 0;
  const coverage = spots ? Math.round(((grid?.top3 ?? 0) / spots) * 100) : 0;
  para(
    grid
      ? grid.top3 > 0
        ? `The business is visible near its strongest location but loses prominence across most of the checked area for "${grid.keyword}". The priority is broader local relevance, proof and review momentum.`
        : `The business did not reach the top three at any checked location for "${grid.keyword}". Customers are consistently being shown alternatives first.`
      : "This report establishes the public profile and website baseline. A comparable area scan is needed to diagnose geographic visibility.",
    true,
    12,
  );
  const gap = 4;
  const mw = (CW - gap * 3) / 4;
  const mt = y + 2;
  metric(M, mt, mw, grid ? `${grid.top3}/${spots}` : "-", "top-three map positions");
  metric(M + mw + gap, mt, mw, grid ? `${coverage}%` : "-", "local top-three coverage");
  metric(
    M + (mw + gap) * 2,
    mt,
    mw,
    grid?.average == null ? "-" : grid.average.toFixed(1),
    "average visible position",
  );
  metric(M + (mw + gap) * 3, mt, mw, `${view.score}/100`, "evidence score");
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
  heading("Where customers find you on Google Maps", 21);
  para(
    grid
      ? `We checked ${spots} equally spaced search locations for "${grid.keyword}". Each square shows the position seen from that location.`
      : "No area grid was recorded for this report.",
  );
  if (grid) {
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
  heading("Your competitive position", 21);
  para("Only businesses relevant to the target service are included.");
  const tableRows = [
    {
      name: `${report.business.name} (you)`,
      rating: report.business.rating,
      reviews: report.business.reviews,
      km: null,
    },
    ...rivals.slice(0, 5),
  ];
  tableRows.forEach((row, index) => {
    box(M, y, CW, 15, index === 0 ? "#fffbeb" : "#f8fafc");
    doc.setFont("helvetica", index === 0 ? "bold" : "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(primary);
    doc.text(doc.splitTextToSize(clean(row.name), 96).slice(0, 2), M + 5, y + 6);
    doc.setTextColor("#526273");
    doc.text(row.rating == null ? "-" : `${row.rating.toFixed(1)} stars`, M + 108, y + 8);
    doc.text(`${row.reviews} reviews`, M + 136, y + 8);
    doc.text(row.km == null ? "-" : `${row.km.toFixed(1)} km`, W - M - 5, y + 8, {
      align: "right",
    });
    y += 18;
  });
  y += 5;
  heading("Google Business Profile evidence", 17);
  const profile = report.profileAudit;
  const evidence: Array<[string, string]> = [
    ["Category", report.business.category || "Needs owner confirmation"],
    ["Phone", report.business.phone || "No public phone returned"],
    ["Opening hours", report.business.hasHours ? "Returned by Google" : "No hours returned"],
    [
      "Photos",
      profile?.photos
        ? `${profile.photos} public photo references`
        : "No reliable count returned; verify in the profile",
    ],
    [
      "Review recency",
      profile?.newestReviewAt
        ? new Date(profile.newestReviewAt).toLocaleDateString("en-GB")
        : `${report.business.reviews} reviews; dates not returned`,
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
  heading("What the website should do next", 21);
  para(
    "We assess service relevance, location relevance, trust and the enquiry journey - not merely whether an HTML element exists.",
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
      "Validate name, URL, phone, category and service area.",
      "Use Rich Results Test and Schema.org Validator.",
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
    "Approve each action, assign an owner and due date, then verify it against the recorded baseline.",
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
  y += 2;
  heading("The proof cycle", 16);
  para(
    "Record baseline > approve change > assign owner and date > publish > repeat comparable evidence > retain, revise or reverse.",
    true,
  );

  // 6. Commercial case and handoff.
  newPage("05 / OPPORTUNITY AND NEXT PROOF");
  heading("Turn visibility into a measurable growth case", 21);
  para(
    "Use the business's real minimum sale value to model one additional customer. This is scenario planning, not a revenue forecast.",
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
    `Example using ${symbol}${example.toLocaleString("en-GB")} per customer. Replace it with the owner's real value.`,
    M + 8,
    y + 38,
  );
  y += 58;
  heading("What this report proves", 16);
  para(
    `It records how ${report.business.name} appeared in the checked Google searches, public profile and returned website evidence on ${new Date(report.createdAt).toLocaleDateString("en-GB")}.`,
  );
  heading("What it does not prove", 16);
  para(
    "It does not establish private Google performance, ownership, conversion rate, lost revenue or guaranteed future rankings.",
  );
  heading("Recommended next step", 16);
  para(
    "Agree the first three actions, assign owners and dates, record the baseline, then schedule a comparable repeat check.",
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
        const bytes = reportPdf(row.report, branding?.data?.[0] ?? {});
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

