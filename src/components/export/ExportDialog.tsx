import { useState, type ReactNode } from "react";
import { Download, FileSpreadsheet, FileText, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { downloadCsv } from "@/lib/exports/csv";
import { downloadProjectPdf } from "@/lib/exports/pdf";
import { loadExportBundle } from "@/lib/exports/data";

type Format = "csv" | "pdf";

export function ExportDialog({
  projectId,
  trigger,
}: {
  projectId: string;
  trigger: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [format, setFormat] = useState<Format>("csv");
  const [reviewedOnly, setReviewedOnly] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  async function onGenerate() {
    setError(null);
    setDone(null);
    setBusy(true);
    try {
      const bundle = await loadExportBundle(projectId, { reviewedOnly });
      if (bundle.pages.length === 0) {
        setError(
          reviewedOnly
            ? "No reviewed pages yet. Confirm at least one review or untick the filter."
            : "Nothing to export — no extracted pages in this project.",
        );
        return;
      }
      if (format === "csv") {
        downloadCsv(bundle);
      } else {
        await downloadProjectPdf(bundle);
      }
      setDone(
        `Generated ${format.toUpperCase()} with ${bundle.pages.length} page${bundle.pages.length === 1 ? "" : "s"} and ${countSegments(bundle)} wall segments.`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Export failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) {
          setError(null);
          setDone(null);
          setBusy(false);
        }
      }}
    >
      <DialogTrigger asChild>{trigger}</DialogTrigger>

      <DialogContent>
        <DialogHeader>
          <DialogTitle>Export takeoff</DialogTitle>
          <DialogDescription>
            Download wall measurements for this project. PDF includes the
            drawing pages with annotations baked in.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-2">
            <FormatCard
              icon={<FileSpreadsheet className="h-5 w-5" />}
              label="CSV"
              description="Spreadsheet-ready data — one row per wall segment."
              selected={format === "csv"}
              onSelect={() => setFormat("csv")}
            />
            <FormatCard
              icon={<FileText className="h-5 w-5" />}
              label="Branded PDF"
              description="Cover, summary table, annotated drawings, footer disclaimer."
              selected={format === "pdf"}
              onSelect={() => setFormat("pdf")}
            />
          </div>

          <label className="flex cursor-pointer items-center gap-2 rounded-md border bg-card px-3 py-2 text-sm">
            <input
              type="checkbox"
              checked={reviewedOnly}
              onChange={(e) => setReviewedOnly(e.target.checked)}
              className="h-4 w-4"
            />
            <span>Only include pages I&apos;ve reviewed and locked</span>
          </label>

          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          {done && (
            <Alert>
              <AlertDescription>{done}</AlertDescription>
            </Alert>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => setOpen(false)}
            disabled={busy}
          >
            Close
          </Button>
          <Button type="button" onClick={onGenerate} disabled={busy} className="gap-2">
            {busy ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Download className="h-4 w-4" />
            )}
            {busy
              ? format === "pdf"
                ? "Building PDF…"
                : "Generating…"
              : `Generate ${format.toUpperCase()}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function countSegments(bundle: {
  pages: { segments: unknown[] }[];
}) {
  let n = 0;
  for (const p of bundle.pages) n += p.segments.length;
  return n;
}

function FormatCard({
  icon,
  label,
  description,
  selected,
  onSelect,
}: {
  icon: ReactNode;
  label: string;
  description: string;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={[
        "flex flex-col gap-1 rounded-md border bg-card p-3 text-left transition-colors",
        selected
          ? "border-foreground ring-2 ring-foreground/10"
          : "border-border hover:border-foreground/40",
      ].join(" ")}
    >
      <div className="flex items-center gap-2 text-sm font-semibold">
        {icon}
        {label}
      </div>
      <p className="text-xs text-muted-foreground">{description}</p>
    </button>
  );
}
