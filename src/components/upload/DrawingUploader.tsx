import { useRef, useState, type DragEvent, type ChangeEvent } from "react";
import { FileUp, Loader2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { cn } from "@/lib/utils";
import type { UploadStage } from "@/lib/api/drawings";

const MAX_BYTES = 50 * 1024 * 1024; // Supabase free tier default

type Props = {
  onUpload: (file: File) => Promise<unknown>;
  stage: UploadStage | null;
  error: string | null;
};

function stageMessage(stage: UploadStage): string {
  switch (stage.kind) {
    case "uploading-pdf":
      return "Uploading PDF…";
    case "reading-pdf":
      return "Reading PDF…";
    case "rasterizing":
      return `Rasterizing page ${stage.page} of ${stage.total}…`;
    case "uploading-page":
      return `Uploading page ${stage.page} of ${stage.total}…`;
    case "saving":
      return "Saving metadata…";
    case "done":
      return "Done.";
  }
}

function stagePercent(stage: UploadStage): number {
  switch (stage.kind) {
    case "uploading-pdf":
      return 5;
    case "reading-pdf":
      return 10;
    case "rasterizing":
      return 10 + Math.round(((stage.page - 1) / stage.total) * 80);
    case "uploading-page":
      return 10 + Math.round((stage.page / stage.total) * 80);
    case "saving":
      return 95;
    case "done":
      return 100;
  }
}

export function DrawingUploader({ onUpload, stage, error }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const busy = stage !== null;

  function validate(file: File): string | null {
    if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
      return "Only PDF files are supported.";
    }
    if (file.size > MAX_BYTES) {
      return `File is too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Max 50 MB.`;
    }
    return null;
  }

  async function handle(file: File) {
    setLocalError(null);
    const msg = validate(file);
    if (msg) {
      setLocalError(msg);
      return;
    }
    try {
      await onUpload(file);
    } catch {
      // useDrawings sets a friendly error; we still don't crash here.
    }
  }

  function onDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragOver(false);
    if (busy) return;
    const file = e.dataTransfer.files?.[0];
    if (file) void handle(file);
  }

  function onChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) void handle(file);
    e.target.value = "";
  }

  const message = stage ? stageMessage(stage) : null;
  const percent = stage ? stagePercent(stage) : 0;

  return (
    <div>
      <div
        onDragOver={(e) => {
          e.preventDefault();
          if (!busy) setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        className={cn(
          "rounded-lg border-2 border-dashed p-10 text-center transition-colors",
          dragOver
            ? "border-foreground/40 bg-muted/40"
            : "border-border bg-card",
          busy && "opacity-80",
        )}
      >
        <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-muted">
          {busy ? (
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          ) : (
            <FileUp className="h-5 w-5 text-muted-foreground" />
          )}
        </div>
        <p className="mt-4 text-sm font-medium">
          {busy
            ? message
            : "Drop a PDF here, or choose a file"}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          {busy
            ? "Stay on this page until the upload finishes."
            : "Up to 50 MB. Each page is rasterized at 200 DPI client-side before upload."}
        </p>

        {busy && (
          <div className="mx-auto mt-6 h-1.5 max-w-sm overflow-hidden rounded-full bg-muted">
            <div
              className="h-full bg-foreground transition-all duration-200"
              style={{ width: `${percent}%` }}
            />
          </div>
        )}

        {!busy && (
          <div className="mt-6">
            <Button
              type="button"
              variant="outline"
              className="gap-2"
              onClick={() => inputRef.current?.click()}
            >
              <Upload className="h-4 w-4" />
              Choose PDF
            </Button>
            <input
              ref={inputRef}
              type="file"
              accept="application/pdf,.pdf"
              className="hidden"
              onChange={onChange}
            />
          </div>
        )}
      </div>

      {(error || localError) && (
        <Alert variant="destructive" className="mt-4">
          <AlertDescription>{localError ?? error}</AlertDescription>
        </Alert>
      )}
    </div>
  );
}
