import * as pdfjsLib from "pdfjs-dist";
import workerSrc from "pdfjs-dist/build/pdf.worker.min.mjs?url";

pdfjsLib.GlobalWorkerOptions.workerSrc = workerSrc;

const PDF_BASE_DPI = 72;

export type RasterizedPage = {
  pageNumber: number;
  blob: Blob;
  width: number;
  height: number;
};

export type PdfDocument = pdfjsLib.PDFDocumentProxy;

export async function loadPdf(file: File | ArrayBuffer): Promise<PdfDocument> {
  const data = file instanceof ArrayBuffer ? file : await file.arrayBuffer();
  return pdfjsLib.getDocument({ data }).promise;
}

export async function rasterizePage(
  pdf: PdfDocument,
  pageNumber: number,
  dpi: number = 200,
): Promise<RasterizedPage> {
  const page = await pdf.getPage(pageNumber);
  const viewport = page.getViewport({ scale: dpi / PDF_BASE_DPI });
  const width = Math.floor(viewport.width);
  const height = Math.floor(viewport.height);

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Failed to acquire canvas 2D context.");

  await page.render({ canvasContext: ctx, viewport }).promise;

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("PNG encode failed."))),
      "image/png",
    );
  });

  // Free canvas memory eagerly — large drawings can run hundreds of MB.
  canvas.width = 0;
  canvas.height = 0;

  return { pageNumber, blob, width, height };
}
