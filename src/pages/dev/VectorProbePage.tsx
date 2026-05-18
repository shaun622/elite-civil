import { useRef, useState } from "react";
import { Header } from "@/components/layout/Header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  extractPdfPageVectors,
  probePdfVectors,
  type PageVectors,
  type VectorProbeResult,
} from "@/lib/pdfVectors";

/**
 * Dev-only feasibility + preview tool for the PDF vector-extraction plan.
 * Pick a drawing PDF: the probe reports stroke colours and path counts,
 * and the preview renders a chosen page's vector paths to a canvas so we
 * can confirm the orange/pink/red linework really is the retaining walls.
 */
export function VectorProbePage() {
  const inputRef = useRef<HTMLInputElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<string | null>(null);

  const [pageNum, setPageNum] = useState("6");
  const [isolate, setIsolate] = useState("#dd6e00,#ff00bf,#b80000");
  const [renderInfo, setRenderInfo] = useState<string | null>(null);

  async function onPickFile(f: File) {
    setFile(f);
    setError(null);
    setReport(null);
    setRenderInfo(null);
    setBusy(true);
    try {
      const result = await probePdfVectors(f, f.name);
      setReport(formatReport(result));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Probe failed.");
    } finally {
      setBusy(false);
    }
  }

  async function renderPage() {
    if (!file) return;
    setError(null);
    setBusy(true);
    try {
      const n = Math.max(1, parseInt(pageNum, 10) || 1);
      const vectors = await extractPdfPageVectors(file, n, 2);
      drawVectors(canvasRef.current, vectors, parseIsolate(isolate));
      const isolated = parseIsolate(isolate);
      const hit = vectors.paths.filter((p) =>
        isolated.has(p.color.toLowerCase()),
      ).length;
      setRenderInfo(
        `Page ${n}: ${vectors.paths.length} stroked paths total` +
          (isolated.size > 0
            ? ` · ${hit} match the isolated colour(s)`
            : ""),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Render failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen bg-muted/20">
      <Header />
      <main className="container py-10">
        <h1 className="text-2xl font-semibold tracking-tight">
          Vector probe (dev)
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          PDF vector-extraction tool. Pick a drawing PDF — the probe reports
          stroke colours and path counts; the preview below renders a page's
          vector linework. Use the isolate field to grey out everything
          except the wall colours and confirm they trace the walls.
        </p>

        <div className="mt-6 flex flex-wrap items-center gap-3">
          <input
            ref={inputRef}
            type="file"
            accept="application/pdf,.pdf"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void onPickFile(f);
              e.target.value = "";
            }}
          />
          <Button onClick={() => inputRef.current?.click()} disabled={busy}>
            {busy ? "Working…" : file ? "Choose another PDF" : "Choose PDF"}
          </Button>
          {file && (
            <span className="text-sm text-muted-foreground">{file.name}</span>
          )}
        </div>

        {error && (
          <Alert variant="destructive" className="mt-6">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {file && (
          <div className="mt-6 rounded-lg border bg-card p-4">
            <h2 className="text-sm font-semibold">Page preview</h2>
            <div className="mt-3 flex flex-wrap items-end gap-3">
              <div className="grid gap-1.5">
                <Label htmlFor="pageNum" className="text-xs">
                  Page number
                </Label>
                <Input
                  id="pageNum"
                  value={pageNum}
                  onChange={(e) => setPageNum(e.target.value)}
                  className="h-9 w-24"
                />
              </div>
              <div className="grid flex-1 gap-1.5">
                <Label htmlFor="isolate" className="text-xs">
                  Isolate colours (comma-separated hex, blank = show all)
                </Label>
                <Input
                  id="isolate"
                  value={isolate}
                  onChange={(e) => setIsolate(e.target.value)}
                  className="h-9"
                />
              </div>
              <Button onClick={renderPage} disabled={busy}>
                Render page
              </Button>
            </div>
            {renderInfo && (
              <p className="mt-3 text-xs text-muted-foreground">{renderInfo}</p>
            )}
            <div className="mt-3 overflow-auto rounded-md border bg-white">
              <canvas ref={canvasRef} className="block" />
            </div>
          </div>
        )}

        {report && (
          <textarea
            readOnly
            value={report}
            className="mt-6 h-[40vh] w-full rounded-md border bg-card p-3 font-mono text-xs"
            onFocus={(e) => e.target.select()}
          />
        )}
      </main>
    </div>
  );
}

function parseIsolate(text: string): Set<string> {
  return new Set(
    text
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter((s) => /^#[0-9a-f]{6}$/.test(s)),
  );
}

function drawVectors(
  canvas: HTMLCanvasElement | null,
  vectors: PageVectors,
  isolated: Set<string>,
) {
  if (!canvas) return;
  const maxW = 1400;
  const scale = Math.min(1, maxW / vectors.width);
  canvas.width = Math.round(vectors.width * scale);
  canvas.height = Math.round(vectors.height * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  const hasIsolation = isolated.size > 0;

  // Draw non-isolated paths first (faint), then isolated paths bold on top.
  for (const pass of [0, 1]) {
    for (const path of vectors.paths) {
      const match = isolated.has(path.color.toLowerCase());
      if (hasIsolation && pass === 0 && match) continue;
      if (hasIsolation && pass === 1 && !match) continue;
      if (!hasIsolation && pass === 1) continue;

      const faint = hasIsolation && !match;
      ctx.strokeStyle = faint ? "#e2e2e2" : path.color;
      ctx.lineWidth = faint ? 0.5 : match ? 2.5 : 0.7;
      ctx.beginPath();
      const pts = path.points;
      ctx.moveTo(pts[0] * scale, pts[1] * scale);
      for (let k = 2; k + 1 < pts.length; k += 2) {
        ctx.lineTo(pts[k] * scale, pts[k + 1] * scale);
      }
      ctx.stroke();
    }
  }
}

function formatReport(result: VectorProbeResult): string {
  const lines: string[] = [];
  lines.push(`=== VECTOR PROBE: ${result.fileName} ===`);
  lines.push(`Pages: ${result.pageCount}`);
  lines.push("");
  for (const page of result.pages) {
    lines.push(
      `--- Page ${page.pageNumber} (${page.pageWidthPt} x ${page.pageHeightPt} pt) ---`,
    );
    if (page.error) {
      lines.push(`  ERROR: ${page.error}`);
      lines.push("");
      continue;
    }
    lines.push(
      `  stroked: ${page.strokedPathCount} | filled: ${page.filledPathCount}`,
    );
    lines.push(`  stroke colours:`);
    for (const c of page.strokeColors) {
      lines.push(`    ${c.color}: ${c.strokedPaths}`);
    }
    lines.push("");
  }
  return lines.join("\n");
}
