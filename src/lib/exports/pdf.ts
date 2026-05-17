import { PDFDocument, StandardFonts, rgb, type PDFFont } from "pdf-lib";
import type { ExportBundle, ExportPage } from "@/lib/exports/data";
import type { Bbox } from "@/types/db";
import { formatLength } from "@/lib/format";

const A4_WIDTH = 595.28;
const A4_HEIGHT = 841.89;
const MARGIN = 36;
const FONT_SIZE = 10;
const HEADER_FONT_SIZE = 14;

const COLOR_WALL_RGB = [0.231, 0.51, 0.965] as const; // #3b82f6
const COLOR_SCALE_RGB = [0.918, 0.702, 0.031] as const; // #eab308
const COLOR_USER_RGB = [0.659, 0.333, 0.969] as const; // #a855f7

const MAX_ANNOTATED_LONG_EDGE = 1800; // px — keep PDF file size sane

export async function buildProjectPdf(
  bundle: ExportBundle,
): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const helv = await pdf.embedFont(StandardFonts.Helvetica);
  const helvBold = await pdf.embedFont(StandardFonts.HelveticaBold);

  drawCoverPage(pdf, helv, helvBold, bundle);
  drawSummaryPages(pdf, helv, helvBold, bundle);

  for (const page of bundle.pages) {
    await drawAuditTrailPage(pdf, helv, helvBold, page, bundle);
  }

  return pdf.save();
}

export async function downloadProjectPdf(
  bundle: ExportBundle,
): Promise<void> {
  const bytes = await buildProjectPdf(bundle);
  // Cast to satisfy newer TS lib types that distinguish ArrayBuffer
  // from SharedArrayBuffer — pdf-lib returns a regular ArrayBuffer.
  const blob = new Blob([bytes as BlobPart], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = sanitizeFilename(`${bundle.project.name}-takeoff.pdf`);
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function sanitizeFilename(name: string): string {
  return name.replace(/[\\/:*?"<>|]/g, "_").trim() || "takeoff.pdf";
}

function drawCoverPage(
  pdf: PDFDocument,
  helv: PDFFont,
  helvBold: PDFFont,
  bundle: ExportBundle,
) {
  const page = pdf.addPage([A4_WIDTH, A4_HEIGHT]);
  const top = A4_HEIGHT - MARGIN;
  let y = top;

  page.drawText("Elite Civil — TakeoffMate", {
    x: MARGIN,
    y: y - 14,
    size: 11,
    font: helvBold,
    color: rgb(0.4, 0.4, 0.4),
  });
  y -= 60;

  page.drawText("Retaining Wall Takeoff", {
    x: MARGIN,
    y,
    size: 26,
    font: helvBold,
    color: rgb(0.07, 0.09, 0.15),
  });
  y -= 28;

  page.drawText(bundle.project.name, {
    x: MARGIN,
    y,
    size: 18,
    font: helv,
    color: rgb(0.27, 0.34, 0.45),
  });
  y -= 36;

  const metaLines: [string, string][] = [
    ["Client", bundle.project.client_name ?? "—"],
    ["Site address", bundle.project.site_address ?? "—"],
    ["Generated", new Date().toLocaleString()],
    ["Pages included", String(bundle.pages.length)],
  ];

  const totals = computeTotals(bundle);
  metaLines.push([
    "Total wall segments",
    String(totals.segmentCount),
  ]);
  metaLines.push([
    "Total linear length",
    totals.totalLengthMm > 0
      ? `${formatLength(totals.totalLengthMm)} (sum of populated lengths)`
      : "—",
  ]);

  for (const [k, v] of metaLines) {
    page.drawText(k, {
      x: MARGIN,
      y,
      size: FONT_SIZE,
      font: helvBold,
      color: rgb(0.45, 0.5, 0.58),
    });
    page.drawText(v, {
      x: MARGIN + 110,
      y,
      size: FONT_SIZE,
      font: helv,
      color: rgb(0.1, 0.12, 0.18),
    });
    y -= 18;
  }

  if (bundle.project.notes) {
    y -= 14;
    page.drawText("Notes", {
      x: MARGIN,
      y,
      size: FONT_SIZE,
      font: helvBold,
      color: rgb(0.45, 0.5, 0.58),
    });
    y -= 14;
    drawWrappedText(
      page,
      bundle.project.notes,
      helv,
      FONT_SIZE,
      MARGIN,
      y,
      A4_WIDTH - MARGIN * 2,
      14,
      rgb(0.1, 0.12, 0.18),
    );
  }

  drawFooter(page, helv);
}

function drawSummaryPages(
  pdf: PDFDocument,
  helv: PDFFont,
  helvBold: PDFFont,
  bundle: ExportBundle,
) {
  const headers = ["Drawing", "Pg", "Label", "Length", "Height", "Thick", "Conf"];
  const colWidths = [120, 24, 200, 60, 60, 50, 40];

  let page = pdf.addPage([A4_WIDTH, A4_HEIGHT]);
  let y = A4_HEIGHT - MARGIN;

  page.drawText("Wall Segment Summary", {
    x: MARGIN,
    y: y - 16,
    size: HEADER_FONT_SIZE,
    font: helvBold,
    color: rgb(0.07, 0.09, 0.15),
  });
  y -= 36;

  // Header row
  drawSummaryRow(page, helvBold, headers, colWidths, MARGIN, y, true);
  y -= 16;
  page.drawLine({
    start: { x: MARGIN, y: y + 4 },
    end: { x: A4_WIDTH - MARGIN, y: y + 4 },
    thickness: 0.5,
    color: rgb(0.7, 0.74, 0.8),
  });
  y -= 6;

  let firstSegmentOnPage = true;

  for (const exportPage of bundle.pages) {
    for (const seg of exportPage.segments) {
      if (y < MARGIN + 40) {
        drawFooter(page, helv);
        page = pdf.addPage([A4_WIDTH, A4_HEIGHT]);
        y = A4_HEIGHT - MARGIN;
        // Repeat header on continuation
        page.drawText("Wall Segment Summary (continued)", {
          x: MARGIN,
          y: y - 16,
          size: HEADER_FONT_SIZE,
          font: helvBold,
          color: rgb(0.07, 0.09, 0.15),
        });
        y -= 36;
        drawSummaryRow(page, helvBold, headers, colWidths, MARGIN, y, true);
        y -= 16;
        page.drawLine({
          start: { x: MARGIN, y: y + 4 },
          end: { x: A4_WIDTH - MARGIN, y: y + 4 },
          thickness: 0.5,
          color: rgb(0.7, 0.74, 0.8),
        });
        y -= 6;
        firstSegmentOnPage = true;
      }

      const row = [
        truncate(exportPage.drawing.original_filename, 22),
        String(exportPage.page.page_number),
        truncate(seg.label ?? "—", 40),
        formatLength(seg.length_mm),
        formatLength(seg.height_mm),
        formatLength(seg.thickness_mm),
        seg.confidence.toFixed(2),
      ];
      drawSummaryRow(page, helv, row, colWidths, MARGIN, y, false);
      y -= 14;
      firstSegmentOnPage = false;
    }
  }

  if (firstSegmentOnPage) {
    page.drawText("No wall segments to report.", {
      x: MARGIN,
      y,
      size: FONT_SIZE,
      font: helv,
      color: rgb(0.45, 0.5, 0.58),
    });
  }

  drawFooter(page, helv);
}

function drawSummaryRow(
  page: ReturnType<PDFDocument["addPage"]>,
  font: PDFFont,
  cells: string[],
  widths: number[],
  startX: number,
  y: number,
  header: boolean,
) {
  let x = startX;
  for (let i = 0; i < cells.length; i++) {
    const isNumeric = i >= 3 && i <= 6; // length, height, thick, conf
    const cell = cells[i];
    const w = widths[i];
    const text = String(cell);
    const textWidth = font.widthOfTextAtSize(text, FONT_SIZE);
    const tx = isNumeric ? x + w - textWidth - 4 : x + 2;
    page.drawText(text, {
      x: tx,
      y,
      size: FONT_SIZE,
      font,
      color: header ? rgb(0.4, 0.45, 0.52) : rgb(0.1, 0.12, 0.18),
    });
    x += w + 4;
  }
}

async function drawAuditTrailPage(
  pdf: PDFDocument,
  helv: PDFFont,
  helvBold: PDFFont,
  exportPage: ExportPage,
  bundle: ExportBundle,
) {
  // Render the page with annotations baked in to a canvas, encode JPEG,
  // and embed into the PDF.
  const annotated = await renderAnnotatedPng(exportPage);
  if (!annotated) {
    // Image unavailable — produce a text-only page so we at least record the
    // segments even if the drawing didn't load.
    const page = pdf.addPage([A4_WIDTH, A4_HEIGHT]);
    page.drawText(
      `Could not load drawing image for ${exportPage.drawing.original_filename} (page ${exportPage.page.page_number}).`,
      {
        x: MARGIN,
        y: A4_HEIGHT - MARGIN - 14,
        size: FONT_SIZE,
        font: helv,
        color: rgb(0.7, 0.1, 0.1),
      },
    );
    drawFooter(page, helv);
    return;
  }

  // Choose page orientation matching the image aspect.
  const landscape = annotated.width > annotated.height;
  const pageWidth = landscape ? A4_HEIGHT : A4_WIDTH;
  const pageHeight = landscape ? A4_WIDTH : A4_HEIGHT;
  const page = pdf.addPage([pageWidth, pageHeight]);

  // Title strip
  const titleY = pageHeight - MARGIN;
  page.drawText(
    `${exportPage.drawing.original_filename} — Page ${exportPage.page.page_number}`,
    {
      x: MARGIN,
      y: titleY - 12,
      size: 11,
      font: helvBold,
      color: rgb(0.07, 0.09, 0.15),
    },
  );
  const meta = `${exportPage.extraction.view_type} · ${exportPage.extraction.scale_text ?? "no scale"} · ${exportPage.segments.length} wall${
    exportPage.segments.length === 1 ? "" : "s"
  } · confidence ${
    exportPage.extraction.overall_confidence === null
      ? "—"
      : `${Math.round(exportPage.extraction.overall_confidence * 100)}%`
  }`;
  page.drawText(meta, {
    x: MARGIN,
    y: titleY - 26,
    size: 9,
    font: helv,
    color: rgb(0.45, 0.5, 0.58),
  });

  // Fit image into the remaining space.
  const availTop = titleY - 36;
  const availBottom = MARGIN + 30; // leave room for footer
  const availH = availTop - availBottom;
  const availW = pageWidth - MARGIN * 2;
  const fitScale = Math.min(
    availW / annotated.width,
    availH / annotated.height,
  );
  const drawW = annotated.width * fitScale;
  const drawH = annotated.height * fitScale;
  const drawX = MARGIN + (availW - drawW) / 2;
  const drawY = availBottom + (availH - drawH) / 2;

  const embedded = await pdf.embedJpg(annotated.bytes);
  page.drawImage(embedded, { x: drawX, y: drawY, width: drawW, height: drawH });

  drawFooter(page, helv);
  void bundle; // bundle reserved for future use (e.g. logo on every page)
}

function drawFooter(
  page: ReturnType<PDFDocument["addPage"]>,
  font: PDFFont,
) {
  const { width } = page.getSize();
  const text =
    "Measurements extracted by AI and reviewed by user. Verify against original drawings before quoting or construction.";
  const size = 7.5;
  const textWidth = font.widthOfTextAtSize(text, size);
  page.drawText(text, {
    x: (width - textWidth) / 2,
    y: 18,
    size,
    font,
    color: rgb(0.45, 0.5, 0.58),
  });
}

function drawWrappedText(
  page: ReturnType<PDFDocument["addPage"]>,
  text: string,
  font: PDFFont,
  size: number,
  x: number,
  startY: number,
  maxWidth: number,
  lineHeight: number,
  color: ReturnType<typeof rgb>,
): number {
  const words = text.split(/\s+/);
  let line = "";
  let y = startY;
  for (const w of words) {
    const tryLine = line.length ? `${line} ${w}` : w;
    if (font.widthOfTextAtSize(tryLine, size) > maxWidth && line) {
      page.drawText(line, { x, y, size, font, color });
      y -= lineHeight;
      line = w;
    } else {
      line = tryLine;
    }
  }
  if (line) {
    page.drawText(line, { x, y, size, font, color });
    y -= lineHeight;
  }
  return y;
}

function truncate(s: string, n: number): string {
  if (s.length <= n) return s;
  return s.slice(0, n - 1) + "…";
}

function computeTotals(bundle: ExportBundle) {
  let segmentCount = 0;
  let totalLengthMm = 0;
  for (const p of bundle.pages) {
    segmentCount += p.segments.length;
    for (const s of p.segments) {
      if (s.length_mm !== null) totalLengthMm += s.length_mm;
    }
  }
  return { segmentCount, totalLengthMm };
}

/* ----------------- Annotated page rasterization ----------------- */

type AnnotatedImage = {
  bytes: Uint8Array;
  width: number;
  height: number;
};

async function renderAnnotatedPng(
  exportPage: ExportPage,
): Promise<AnnotatedImage | null> {
  if (!exportPage.imageUrl) return null;

  const img = await loadImage(exportPage.imageUrl);
  if (!img) return null;

  // Downscale to keep PDF size manageable.
  const longEdge = Math.max(img.naturalWidth, img.naturalHeight);
  const scale =
    longEdge > MAX_ANNOTATED_LONG_EDGE
      ? MAX_ANNOTATED_LONG_EDGE / longEdge
      : 1;
  const targetW = Math.round(img.naturalWidth * scale);
  const targetH = Math.round(img.naturalHeight * scale);

  const canvas = document.createElement("canvas");
  canvas.width = targetW;
  canvas.height = targetH;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, targetW, targetH);
  ctx.drawImage(img, 0, 0, targetW, targetH);

  // Extractor coords are in original-image-pixel space; scale them onto
  // the (possibly downscaled) annotation canvas.
  drawAnnotations(
    ctx,
    exportPage,
    targetW,
    targetH,
    targetW / img.naturalWidth,
    targetH / img.naturalHeight,
  );

  const blob: Blob | null = await new Promise((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", 0.85),
  );
  // Free canvas eagerly.
  canvas.width = 0;
  canvas.height = 0;
  if (!blob) return null;
  const bytes = new Uint8Array(await blob.arrayBuffer());
  return { bytes, width: targetW, height: targetH };
}

function loadImage(url: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

/**
 * Convert an extractor bbox (image-pixel space, relative to the original
 * rasterized page) into the downscaled annotation canvas. `sx` / `sy` are
 * canvasDimension / originalDimension. Clamped to the canvas bounds.
 */
function bboxToCanvas(
  bbox: Bbox,
  sx: number,
  sy: number,
  canvasW: number,
  canvasH: number,
): { x: number; y: number; w: number; h: number } {
  const [x1, y1, x2, y2] = bbox;
  const cx = (v: number) => Math.max(0, Math.min(canvasW, v * sx));
  const cy = (v: number) => Math.max(0, Math.min(canvasH, v * sy));
  const left = cx(Math.min(x1, x2));
  const top = cy(Math.min(y1, y2));
  const right = cx(Math.max(x1, x2));
  const bottom = cy(Math.max(y1, y2));
  return { x: left, y: top, w: Math.max(0, right - left), h: Math.max(0, bottom - top) };
}

function rgbCss([r, g, b]: readonly [number, number, number], alpha = 1) {
  return `rgba(${Math.round(r * 255)},${Math.round(g * 255)},${Math.round(b * 255)},${alpha})`;
}

function drawAnnotations(
  ctx: CanvasRenderingContext2D,
  exportPage: ExportPage,
  w: number,
  h: number,
  sx: number,
  sy: number,
) {
  const strokeBase = Math.max(2, Math.min(w, h) / 600);

  // Scale bbox (yellow)
  if (exportPage.extraction.scale_bbox) {
    ctx.lineWidth = strokeBase;
    ctx.setLineDash([8, 4]);
    ctx.strokeStyle = rgbCss(COLOR_SCALE_RGB, 0.85);
    const r = bboxToCanvas(exportPage.extraction.scale_bbox, sx, sy, w, h);
    ctx.strokeRect(r.x, r.y, r.w, r.h);
    ctx.setLineDash([]);
  }

  // Dimensions are deliberately omitted from the printed audit trail —
  // segments are the primary deliverable here, and dimension boxes tend
  // to be visual noise once a page is shrunk to A4.

  // Wall segments (blue / purple for user-added)
  for (const seg of exportPage.segments) {
    const color = seg.user_added ? COLOR_USER_RGB : COLOR_WALL_RGB;
    ctx.lineWidth = Math.max(strokeBase * 1.2, Math.min(w, h) / 400);
    ctx.strokeStyle = rgbCss(color, 0.85);

    // Polyline
    if (seg.polyline.length >= 2) {
      ctx.beginPath();
      seg.polyline.forEach(([px, py], idx) => {
        const x = Math.max(0, Math.min(w, px * sx));
        const y = Math.max(0, Math.min(h, py * sy));
        if (idx === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();
    }

    // Label bbox + text
    if (seg.label_bbox) {
      const r = bboxToCanvas(seg.label_bbox, sx, sy, w, h);
      ctx.lineWidth = strokeBase;
      ctx.strokeRect(r.x, r.y, r.w, r.h);

      if (seg.label) {
        const fontSize = Math.max(12, Math.min(20, Math.min(w, h) / 80));
        ctx.font = `bold ${fontSize}px sans-serif`;
        ctx.fillStyle = "#ffffff";
        ctx.strokeStyle = rgbCss(color, 1);
        ctx.lineWidth = 3;
        // Outline for readability
        ctx.strokeText(seg.label, r.x, Math.max(r.y - 4, fontSize + 2));
        ctx.fillStyle = rgbCss(color, 1);
        ctx.fillText(seg.label, r.x, Math.max(r.y - 4, fontSize + 2));
      }
    }
  }

}
