import { loadPdf } from "@/lib/pdfRender";

/**
 * Renders a PDF page into a grid of full-resolution tiles for the Stage II
 * AI pass. Sending the whole sheet as one image means it is downsampled to
 * the model's image cap, blurring small annotations (wall-height numbers).
 * Tiling keeps every tile under that cap, so small text reaches the model
 * sharp.
 */

// Must match VECTOR_SCALE in vectorWalls.ts — tiles are in the same 200-DPI
// pixel space as the extracted vectors and the stored page PNG, so the AI's
// coordinates line up with the measured wall geometry.
const RENDER_SCALE = 200 / 72;
// Target tile size (px). Kept under Opus 4.7's ~2576 px no-downsample
// threshold so each tile reaches the model at full resolution.
const TARGET_TILE_PX = 2400;
// Tiles overlap so an annotation straddling a grid line is whole in one
// tile; the edge function de-duplicates the overlap.
const OVERLAP_PX = 200;

export type DrawingTile = {
  /** PNG bytes, base64-encoded (no data: prefix). */
  base64: string;
  /** Tile origin in full-page 200-DPI pixels. */
  originX: number;
  originY: number;
  width: number;
  height: number;
};

export type PageTiles = {
  pageWidth: number;
  pageHeight: number;
  tiles: DrawingTile[];
};

export async function renderPageTiles(
  file: ArrayBuffer,
  pageNumber: number,
): Promise<PageTiles> {
  const pdf = await loadPdf(file);
  const page = await pdf.getPage(pageNumber);
  const viewport = page.getViewport({ scale: RENDER_SCALE });
  const pageWidth = Math.round(viewport.width);
  const pageHeight = Math.round(viewport.height);

  // Render the whole page once at full resolution.
  const full = document.createElement("canvas");
  full.width = pageWidth;
  full.height = pageHeight;
  const fctx = full.getContext("2d");
  if (!fctx) throw new Error("Could not create a canvas to render the PDF.");
  fctx.fillStyle = "#ffffff";
  fctx.fillRect(0, 0, pageWidth, pageHeight);
  await page.render({ canvasContext: fctx, viewport }).promise;

  const cols = Math.max(1, Math.ceil(pageWidth / TARGET_TILE_PX));
  const rows = Math.max(1, Math.ceil(pageHeight / TARGET_TILE_PX));
  const baseW = pageWidth / cols;
  const baseH = pageHeight / rows;

  const tileCanvas = document.createElement("canvas");
  const tctx = tileCanvas.getContext("2d");
  if (!tctx) throw new Error("Could not create a canvas to render the PDF.");

  const tiles: DrawingTile[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x0 = Math.max(0, Math.floor(c * baseW - OVERLAP_PX));
      const y0 = Math.max(0, Math.floor(r * baseH - OVERLAP_PX));
      const x1 = Math.min(pageWidth, Math.ceil((c + 1) * baseW + OVERLAP_PX));
      const y1 = Math.min(pageHeight, Math.ceil((r + 1) * baseH + OVERLAP_PX));
      const w = x1 - x0;
      const h = y1 - y0;
      tileCanvas.width = w;
      tileCanvas.height = h;
      tctx.drawImage(full, x0, y0, w, h, 0, 0, w, h);
      const dataUrl = tileCanvas.toDataURL("image/png");
      tiles.push({
        base64: dataUrl.slice(dataUrl.indexOf(",") + 1),
        originX: x0,
        originY: y0,
        width: w,
        height: h,
      });
    }
  }

  return { pageWidth, pageHeight, tiles };
}
