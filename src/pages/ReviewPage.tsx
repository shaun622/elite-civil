import { useState } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import { ArrowLeft, CheckCircle2, Lock, Unlock } from "lucide-react";
import { Header } from "@/components/layout/Header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { DrawingViewer } from "@/components/review/DrawingViewer";
import { MeasurementTable } from "@/components/review/MeasurementTable";
import { ExtractionMeta } from "@/components/review/ExtractionMeta";
import { WarningsPanel } from "@/components/review/WarningsPanel";
import { useReview } from "@/hooks/useReview";

export function ReviewPage() {
  const { projectId, pageId } = useParams<{
    projectId: string;
    pageId: string;
  }>();
  const review = useReview(pageId);
  const [selectedSegmentId, setSelectedSegmentId] = useState<string | null>(
    null,
  );
  const [hoveredSegmentId, setHoveredSegmentId] = useState<string | null>(
    null,
  );

  if (!projectId || !pageId) {
    return <Navigate to="/dashboard" replace />;
  }

  return (
    <div className="flex min-h-screen flex-col bg-muted/20">
      <Header />

      <main className="flex flex-1 flex-col px-6 py-6">
        <Link
          to={`/projects/${projectId}`}
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Project
        </Link>

        {review.loading && (
          <div className="mt-6 h-[60vh] animate-pulse rounded-lg border bg-card" />
        )}

        {!review.loading && review.error && (
          <Alert variant="destructive" className="mt-6">
            <AlertDescription>{review.error}</AlertDescription>
          </Alert>
        )}

        {!review.loading && review.bundle && (
          <>
            <div className="mt-4 flex flex-wrap items-end justify-between gap-3">
              <div>
                <h1 className="text-2xl font-semibold tracking-tight">
                  Page {review.bundle.page.page_number}
                </h1>
                <p className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                  <span>
                    {review.bundle.segments.length} wall segment
                    {review.bundle.segments.length === 1 ? "" : "s"}
                  </span>
                  <span>·</span>
                  <span>
                    {review.bundle.dimensions.length} dimension label
                    {review.bundle.dimensions.length === 1 ? "" : "s"}
                  </span>
                  {review.bundle.extraction.reviewed && (
                    <>
                      <span>·</span>
                      <Badge>Reviewed</Badge>
                    </>
                  )}
                </p>
              </div>

              {review.bundle.extraction.reviewed ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="gap-2"
                  onClick={review.reopen}
                >
                  <Unlock className="h-4 w-4" />
                  Reopen review
                </Button>
              ) : (
                <Button
                  type="button"
                  size="sm"
                  className="gap-2"
                  onClick={review.confirmReview}
                >
                  <CheckCircle2 className="h-4 w-4" />
                  Confirm &amp; lock
                </Button>
              )}
            </div>

            {review.actionError && (
              <Alert variant="destructive" className="mt-4">
                <AlertDescription>{review.actionError}</AlertDescription>
              </Alert>
            )}

            <div className="mt-4 grid flex-1 grid-cols-1 gap-4 lg:grid-cols-5">
              <div className="lg:col-span-3">
                <div className="h-[70vh] min-h-[420px] overflow-hidden rounded-lg border bg-[#1f2937]">
                  <DrawingViewer
                    imageUrl={review.imageUrl}
                    imageWidth={review.bundle.page.image_width}
                    imageHeight={review.bundle.page.image_height}
                    extraction={review.bundle.extraction}
                    dimensions={review.bundle.dimensions}
                    segments={review.bundle.segments}
                    selectedSegmentId={selectedSegmentId}
                    hoveredSegmentId={hoveredSegmentId}
                    onSelectSegment={setSelectedSegmentId}
                    onHoverSegment={setHoveredSegmentId}
                  />
                </div>
              </div>

              <div className="space-y-4 lg:col-span-2">
                <ExtractionMeta extraction={review.bundle.extraction} />
                <WarningsPanel warnings={review.bundle.extraction.warnings} />
                {review.bundle.extraction.reviewed && (
                  <Alert>
                    <Lock className="h-4 w-4" />
                    <AlertDescription>
                      This page is locked. Reopen to edit measurements.
                    </AlertDescription>
                  </Alert>
                )}
                <MeasurementTable
                  segments={review.bundle.segments}
                  selectedSegmentId={selectedSegmentId}
                  hoveredSegmentId={hoveredSegmentId}
                  savingId={review.savingId}
                  locked={review.bundle.extraction.reviewed}
                  onSelect={setSelectedSegmentId}
                  onHover={setHoveredSegmentId}
                  onSave={review.saveSegment}
                  onAdd={review.addSegment}
                  onDelete={review.removeSegment}
                />
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
