import { useState } from "react";
import { FileText, Loader2, RefreshCw, Sparkles, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { timeAgo } from "@/lib/format";
import { useSignedUrls } from "@/hooks/useDrawings";
import type { DrawingPage, DrawingWithPages } from "@/types/db";

type Props = {
  drawing: DrawingWithPages;
  onDelete: () => Promise<void>;
  onExtract: (pageId: string) => Promise<unknown>;
};

function statusBadge(page: DrawingPage) {
  switch (page.extraction_status) {
    case "pending":
      return <Badge variant="outline">Pending</Badge>;
    case "extracting":
      return (
        <Badge variant="secondary" className="gap-1">
          <Loader2 className="h-3 w-3 animate-spin" />
          Extracting
        </Badge>
      );
    case "extracted":
      return <Badge>Extracted</Badge>;
    case "reviewed":
      return <Badge>Reviewed</Badge>;
    case "failed":
      return <Badge variant="destructive">Failed</Badge>;
  }
}

export function DrawingCard({ drawing, onDelete, onExtract }: Props) {
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [busyPageIds, setBusyPageIds] = useState<Set<string>>(new Set());
  const [pageError, setPageError] = useState<string | null>(null);
  const [batchRunning, setBatchRunning] = useState(false);

  const paths = drawing.pages.map((p) => p.image_path);
  const { urls } = useSignedUrls(paths);

  const pendingPages = drawing.pages.filter(
    (p) =>
      p.extraction_status === "pending" || p.extraction_status === "failed",
  );

  async function handleDelete() {
    if (!confirm(`Delete "${drawing.original_filename}" and all its pages?`)) {
      return;
    }
    setDeleteError(null);
    setDeleting(true);
    try {
      await onDelete();
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : "Delete failed.");
      setDeleting(false);
    }
  }

  function markBusy(id: string, busy: boolean) {
    setBusyPageIds((prev) => {
      const next = new Set(prev);
      if (busy) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  async function extractOne(pageId: string) {
    setPageError(null);
    markBusy(pageId, true);
    try {
      await onExtract(pageId);
    } catch (err) {
      setPageError(err instanceof Error ? err.message : "Extraction failed.");
    } finally {
      markBusy(pageId, false);
    }
  }

  async function extractAll() {
    if (pendingPages.length === 0) return;
    setPageError(null);
    setBatchRunning(true);
    for (const page of pendingPages) {
      markBusy(page.id, true);
      try {
        await onExtract(page.id);
      } catch (err) {
        setPageError(err instanceof Error ? err.message : "Extraction failed.");
        markBusy(page.id, false);
        break;
      }
      markBusy(page.id, false);
    }
    setBatchRunning(false);
  }

  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-3">
            <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-muted">
              <FileText className="h-4 w-4 text-muted-foreground" />
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">
                {drawing.original_filename}
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {drawing.page_count}{" "}
                {drawing.page_count === 1 ? "page" : "pages"} · Uploaded{" "}
                {timeAgo(drawing.created_at)}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {pendingPages.length > 0 && (
              <Button
                size="sm"
                className="gap-2"
                disabled={batchRunning}
                onClick={extractAll}
              >
                {batchRunning ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Sparkles className="h-4 w-4" />
                )}
                Extract {pendingPages.length}
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              className="gap-2 text-destructive hover:text-destructive"
              disabled={deleting}
              onClick={handleDelete}
            >
              <Trash2 className="h-4 w-4" />
              Delete
            </Button>
          </div>
        </div>

        {(deleteError || pageError) && (
          <Alert variant="destructive" className="mt-4">
            <AlertDescription>{deleteError ?? pageError}</AlertDescription>
          </Alert>
        )}

        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {drawing.pages.map((page) => {
            const url = urls[page.image_path];
            const aspect = page.image_width / page.image_height || 1;
            const busy =
              busyPageIds.has(page.id) ||
              page.extraction_status === "extracting";
            const canExtract =
              page.extraction_status === "pending" ||
              page.extraction_status === "failed";

            return (
              <div
                key={page.id}
                className="overflow-hidden rounded-md border bg-muted/40"
              >
                <div
                  className="relative w-full bg-[#1f2937]"
                  style={{ aspectRatio: aspect }}
                >
                  {url ? (
                    <img
                      src={url}
                      alt={`${drawing.original_filename} page ${page.page_number}`}
                      loading="lazy"
                      className="h-full w-full object-contain"
                    />
                  ) : (
                    <div className="absolute inset-0 animate-pulse bg-muted" />
                  )}
                </div>
                <div className="space-y-1.5 px-2.5 py-2 text-xs">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-muted-foreground">
                      Page {page.page_number}
                    </span>
                    {statusBadge(page)}
                  </div>
                  {canExtract && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-7 w-full gap-1.5 text-xs"
                      disabled={busy || batchRunning}
                      onClick={() => extractOne(page.id)}
                    >
                      {busy ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : page.extraction_status === "failed" ? (
                        <RefreshCw className="h-3 w-3" />
                      ) : (
                        <Sparkles className="h-3 w-3" />
                      )}
                      {page.extraction_status === "failed"
                        ? "Retry"
                        : "Extract"}
                    </Button>
                  )}
                  {page.extraction_status === "failed" &&
                    page.extraction_error && (
                      <p
                        className="truncate text-[10px] text-destructive"
                        title={page.extraction_error}
                      >
                        {page.extraction_error}
                      </p>
                    )}
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
