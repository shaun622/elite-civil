import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowUpRight, FileText, Loader2, RefreshCw, Ruler, Sparkles, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { timeAgo } from "@/lib/format";
import { useSignedUrls } from "@/hooks/useDrawings";
import type { DrawingPage, DrawingWithPages } from "@/types/db";

type Props = {
  drawing: DrawingWithPages;
  projectId: string;
  onDelete: () => Promise<void>;
  onExtract: (
    pageId: string,
    opts?: { force?: boolean },
  ) => Promise<unknown>;
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

export function DrawingCard({ drawing, projectId, onDelete, onExtract }: Props) {
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

  async function extractOne(pageId: string, opts: { force?: boolean } = {}) {
    setPageError(null);
    markBusy(pageId, true);
    try {
      await onExtract(pageId, opts);
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

            const canReview =
              page.extraction_status === "extracted" ||
              page.extraction_status === "reviewed";
            const thumbInner = url ? (
              <img
                src={url}
                alt={`${drawing.original_filename} page ${page.page_number}`}
                loading="lazy"
                className="h-full w-full object-contain"
              />
            ) : (
              <div className="absolute inset-0 animate-pulse bg-muted" />
            );

            return (
              <div
                key={page.id}
                className="overflow-hidden rounded-md border bg-muted/40"
              >
                {canReview ? (
                  <Link
                    to={`/projects/${projectId}/pages/${page.id}`}
                    className="group relative block w-full bg-[#1f2937]"
                    style={{ aspectRatio: aspect }}
                  >
                    {thumbInner}
                    <div className="absolute inset-0 flex items-center justify-center bg-black/0 opacity-0 transition group-hover:bg-black/30 group-hover:opacity-100">
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-background/95 px-3 py-1.5 text-xs font-medium text-foreground shadow">
                        Review
                        <ArrowUpRight className="h-3.5 w-3.5" />
                      </span>
                    </div>
                  </Link>
                ) : (
                  <div
                    className="relative w-full bg-[#1f2937]"
                    style={{ aspectRatio: aspect }}
                  >
                    {thumbInner}
                  </div>
                )}
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
                  {canReview && (
                    <div className="flex gap-1">
                      <Button
                        asChild
                        variant="outline"
                        size="sm"
                        className="h-7 flex-1 gap-1.5 text-xs"
                      >
                        <Link to={`/projects/${projectId}/pages/${page.id}`}>
                          <ArrowUpRight className="h-3 w-3" />
                          Review
                        </Link>
                      </Button>
                      {page.extraction_status === "extracted" && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          disabled={busy || batchRunning}
                          onClick={() => {
                            if (
                              confirm(
                                "Re-run extraction on this page? This will replace the existing extraction and uses one API call.",
                              )
                            ) {
                              void extractOne(page.id, { force: true });
                            }
                          }}
                          title="Re-run extraction"
                        >
                          {busy ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <RefreshCw className="h-3 w-3" />
                          )}
                        </Button>
                      )}
                    </div>
                  )}
                  <Button
                    asChild
                    variant="ghost"
                    size="sm"
                    className="h-7 w-full gap-1.5 text-xs"
                  >
                    <Link
                      to={`/projects/${projectId}/pages/${page.id}/measure`}
                    >
                      <Ruler className="h-3 w-3" />
                      Measure from PDF
                    </Link>
                  </Button>
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
