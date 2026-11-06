import { createFileRoute } from "@tanstack/react-router";
import { jsPDF } from "jspdf";
import { serviceRead } from "../lib/supabase-service.server";
import type { Report } from "../lib/prospects.server";

const clean = (value: unknown) => String(value ?? "").replace(/[\u2013\u2014]/g, "-");

function reportPdf(report: Report, brand: any) {
  const doc = new jsPDF({ unit: "mm", format: "a4", compress: true });
  const primary = /^#[0-9a-f]{6}$/i.test(brand?.primary_hex ?? "")
    ? brand.primary_hex
    : "#0b1d3a";
  const accent = /^#[0-9a-f]{6}$/i.test(brand?.secondary_hex ?? "")
    ? brand.secondary_hex
    : "#f5b324";
  const agency = clean(brand?.agency_name || "RepSuites");
  const width = 210;
  const margin = 17;
  let y = 18;
  let page = 1;
  const header = () => {
    doc.setTextColor(primary);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.text(agency, margin, 12);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(80);
    doc.text(`${page}`, width - margin, 12, { align: "right" });
    doc.setDrawColor(accent);
    doc.setLineWidth(0.7);
    doc.line(margin, 15, width - margin, 15);
    y = 24;
  };
  const newPage = () => {
    doc.addPage();
    page++;
    header();
  };
  const ensure = (height: number) => {
    if (y + height > 280) newPage();
  };
  const heading = (text: string, size = 18) => {
    ensure(size + 8);
    doc.setTextColor(primary);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(size);
    const lines = doc.splitTextToSize(clean(text), width - margin * 2);
    doc.text(lines, margin, y);
    y += lines.length * (size * 0.43) + 5;
  };
  const para = (text: string, bold = false) => {
    doc.setTextColor(35);
    doc.setFont("helvetica", bold ? "bold" : "normal");
    doc.setFontSize(10.5);
    const lines = doc.splitTextToSize(clean(text), width - margin * 2);
    ensure(lines.length * 5 + 3);
    doc.text(lines, margin, y);
    y += lines.length * 5 + 3;
  };
  header();
  heading("How you show up on Google", 12);
  heading(report.business.name, 25);
  para(report.business.address);
  para(`Local visibility score: ${report.score}/100`, true);
  para(
    `Prepared ${new Date(report.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}. Evidence changes over time.`,
  );
  heading("The short version");
  report.fixes.slice(0, 3).forEach((fix, index) => {
    para(`${index + 1}. ${fix.title}`, true);
    para(fix.why);
  });
  newPage();
  heading("Where you show up on Google Maps");
  para(`Search phrase: ${report.maps.keyword || "Not recorded"}`);
  para(
    report.maps.checked
      ? report.maps.position == null
        ? "Not found in the first 20 from the business location."
        : `Position ${report.maps.position} from the business location.`
      : "A centre-point rank was not available.",
  );
  for (const grid of report.grids ?? (report.grid ? [{ ...report.grid, keyword: report.maps.keyword }] : [])) {
    heading(grid.keyword, 14);
    para(`${grid.size} x ${grid.size} grid. Top 3 in ${grid.top3} of ${grid.ranks.length} spots. Found in ${grid.found}. Average position ${grid.average ?? "not available"}.`);
  }
  heading("Nearest competitors");
  report.rivals.forEach((rival) =>
    para(`${rival.name}: ${rival.rating ?? "-"} stars, ${rival.reviews} reviews${rival.km == null ? "" : `, ${rival.km} km away`}.`),
  );
  newPage();
  heading("Evidence and recommendations");
  para(`Google rating: ${report.business.rating ?? "not available"}. Reviews: ${report.business.reviews}.`);
  report.websiteAudit?.findings.forEach((finding) => {
    para(`${finding.label}: ${finding.evidence}`, true);
    if (finding.status === "review") para(finding.recommendation);
  });
  report.aiVisibility?.answers.forEach((answer) =>
    para(`${answer.named ? "Named" : "Not named"} for "${answer.question}". ${answer.businesses.join(", ")}`),
  );
  heading("Approved action plan");
  report.fixes.forEach((fix, index) => {
    const timing = index < 2 ? "This week" : index < 4 ? "This month" : "Ongoing";
    para(`${timing}: ${fix.title}`, true);
    para(`Why: ${fix.why}`);
  });
  heading("Next proof point", 15);
  para("Record the baseline, approve the change, assign an owner and due date, then repeat the same evidence check before marking it verified.");
  if (brand?.phone || brand?.email) para(`${agency}${brand.phone ? ` | ${brand.phone}` : ""}${brand.email ? ` | ${brand.email}` : ""}`, true);
  return doc.output("arraybuffer");
}

export const Route = createFileRoute("/r/$token/pdf")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const token = String(params.token || "");
        if (!/^[A-Za-z0-9_-]{20,64}$/.test(token)) return new Response("Not found", { status: 404 });
        const rows = await serviceRead<{ report: Report; created_by: string | null }[]>(
          `prospects?select=report,created_by&report_token=eq.${token}`,
          "",
        );
        const row = rows.data?.[0];
        if (!row?.report) return new Response("Not found", { status: 404 });
        const branding = row.created_by
          ? await serviceRead<any[]>(`agency_report_branding?select=agency_name,primary_hex,secondary_hex,phone,email&user_id=eq.${row.created_by}`, "")
          : null;
        const bytes = reportPdf(row.report, branding?.data?.[0]);
        const filename = clean(row.report.business.name).replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").slice(0, 80) || "report";
        return new Response(bytes, {
          headers: {
            "Content-Type": "application/pdf",
            "Content-Disposition": `attachment; filename="${filename}-visibility-report.pdf"`,
            "Cache-Control": "no-store",
          },
        });
      },
    },
  },
});

