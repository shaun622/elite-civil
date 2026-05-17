import { useState } from "react";
import { FileText, Trash2 } from "lucide-react";
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
};

function statusBadge(page: DrawingPage) {
  switch (page.extraction_status) {
    case "pending":
      return <Badge variant="outline">Pending</Badge>;
    case "extracting":
      return <Badge variant="secondary">Extracting…</Badge>;
    case "extracted":
      return <Badge>Extracted</Badge>;
    case "reviewed":
      return <Badge>Reviewed</Badge>;
    case "failed":
      return <Badge variant="destructive">Failed</Badge>;
  }
}

export function DrawingCard({ drawing, onDelete }: Props) {
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const paths = drawing.pages.map((p) => p.image_path);
  const { urls } = useSignedUrls(paths);

  async function handleDelete() {
    if (!confirm(`Delete "${drawing.original_filename}" and all its pages?`)) {
      return;
    }
    setError(null);
    setDeleting(true);
    try {
      await onDelete();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed.");
      setDeleting(false);
    }
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

        {error && (
          <Alert variant="destructive" className="mt-4">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {drawing.pages.map((page) => {
            const url = urls[page.image_path];
            const aspect = page.image_width / page.image_height || 1;
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
                <div className="flex items-center justify-between gap-2 px-2.5 py-2 text-xs">
                  <span className="text-muted-foreground">
                    Page {page.page_number}
                  </span>
                  {statusBadge(page)}
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
