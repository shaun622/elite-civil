import type { ExportBundle, ExportPage } from "@/lib/exports/data";
import type { WallSegment } from "@/types/db";

const COLUMNS = [
  "drawing",
  "page",
  "view_type",
  "wall_label",
  "length_mm",
  "height_mm",
  "thickness_mm",
  "confidence",
  "source",
  "user_edited",
  "notes",
  "scale_text",
  "units",
];

function csvEscape(v: unknown): string {
  if (v === null || v === undefined) return "";
  const s = String(v);
  // RFC 4180: quote if contains comma, quote, or newline. Double internal quotes.
  if (/[",\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function sourceLabel(segment: WallSegment): string {
  if (segment.user_added) return "user_added";
  if (segment.user_edited) return "ai_edited";
  if (segment.confidence < 0.6) return "ai_scaled";
  return "ai_extracted";
}

function pageRows(page: ExportPage): string[][] {
  if (page.segments.length === 0) {
    return [
      [
        page.drawing.original_filename,
        String(page.page.page_number),
        page.extraction.view_type,
        "(no wall segments extracted)",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        page.extraction.scale_text ?? "",
        page.extraction.units,
      ],
    ];
  }
  return page.segments.map((seg) => [
    page.drawing.original_filename,
    String(page.page.page_number),
    page.extraction.view_type,
    seg.label ?? "",
    seg.length_mm === null ? "" : String(seg.length_mm),
    seg.height_mm === null ? "" : String(seg.height_mm),
    seg.thickness_mm === null ? "" : String(seg.thickness_mm),
    seg.confidence.toFixed(2),
    sourceLabel(seg),
    seg.user_edited ? "true" : "false",
    seg.notes ?? "",
    page.extraction.scale_text ?? "",
    page.extraction.units,
  ]);
}

export function buildCsv(bundle: ExportBundle): string {
  const lines: string[] = [];
  lines.push(COLUMNS.map(csvEscape).join(","));
  for (const page of bundle.pages) {
    for (const row of pageRows(page)) {
      lines.push(row.map(csvEscape).join(","));
    }
  }
  return lines.join("\r\n") + "\r\n";
}

export function downloadCsv(bundle: ExportBundle): void {
  const csv = buildCsv(bundle);
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = sanitizeFilename(`${bundle.project.name}-takeoff.csv`);
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function sanitizeFilename(name: string): string {
  return name.replace(/[\\/:*?"<>|]/g, "_").trim() || "takeoff.csv";
}
