import { useRef, useState } from "react";
import { Header } from "@/components/layout/Header";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { probePdfVectors, type VectorProbeResult } from "@/lib/pdfVectors";

/**
 * Dev-only feasibility probe for Stage 1 of the PDF vector-extraction plan.
 * Pick a drawing PDF; this walks every page's pdf.js operator list and
 * reports stroke colours, path counts, and raw diagnostics. The output is
 * meant to be copied and pasted back for analysis.
 */
export function VectorProbePage() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<string | null>(null);

  async function handleFile(file: File) {
    setError(null);
    setReport(null);
    setBusy(true);
    try {
      const result = await probePdfVectors(file, file.name);
      setReport(formatReport(result));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Probe failed.");
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
          Stage 1 feasibility check for PDF vector extraction. Select a
          drawing PDF — this reads every page's vector operator list and
          reports the stroke colours and path counts. Copy the result below
          and paste it back into the chat.
        </p>

        <div className="mt-6 flex items-center gap-3">
          <input
            ref={inputRef}
            type="file"
            accept="application/pdf,.pdf"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void handleFile(f);
              e.target.value = "";
            }}
          />
          <Button
            onClick={() => inputRef.current?.click()}
            disabled={busy}
          >
            {busy ? "Analyzing…" : "Choose PDF"}
          </Button>
          {report && (
            <Button
              variant="outline"
              onClick={() => {
                void navigator.clipboard.writeText(report);
              }}
            >
              Copy report
            </Button>
          )}
        </div>

        {error && (
          <Alert variant="destructive" className="mt-6">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {report && (
          <textarea
            readOnly
            value={report}
            className="mt-6 h-[60vh] w-full rounded-md border bg-card p-3 font-mono text-xs"
            onFocus={(e) => e.target.select()}
          />
        )}
      </main>
    </div>
  );
}

function formatReport(result: VectorProbeResult): string {
  const lines: string[] = [];
  lines.push(`=== VECTOR PROBE: ${result.fileName} ===`);
  lines.push(`Pages: ${result.pageCount}`);
  lines.push("");

  for (const page of result.pages) {
    lines.push(`--- Page ${page.pageNumber} (${page.pageWidthPt} x ${page.pageHeightPt} pt) ---`);
    if (page.error) {
      lines.push(`  ERROR: ${page.error}`);
      lines.push("");
      continue;
    }
    lines.push(`  total ops: ${page.totalOps}`);
    lines.push(
      `  constructPath: ${page.constructPathCount} | stroked: ${page.strokedPathCount} | filled: ${page.filledPathCount}`,
    );
    lines.push(`  distinct line widths: ${page.distinctLineWidths.join(", ") || "none"}`);

    lines.push(`  stroke colours (colour: stroked-path count):`);
    if (page.strokeColors.length === 0) {
      lines.push(`    (none)`);
    } else {
      for (const c of page.strokeColors) {
        lines.push(`    ${c.color}: ${c.strokedPaths}`);
      }
    }

    lines.push(`  op histogram (top 25):`);
    for (const op of page.opHistogram.slice(0, 25)) {
      lines.push(`    ${op.name}: ${op.count}`);
    }

    lines.push(`  raw colour-op samples:`);
    if (page.rawColorOpSamples.length === 0) {
      lines.push(`    (none)`);
    } else {
      for (const s of page.rawColorOpSamples) {
        lines.push(`    ${s}`);
      }
    }
    lines.push("");
  }
  return lines.join("\n");
}
