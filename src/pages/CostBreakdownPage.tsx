import { Navigate, useParams } from "react-router-dom";

/** Cost Breakdown — placeholder shell, real content in Phase 4. */
export function CostBreakdownPage() {
  const { id } = useParams<{ id: string }>();
  if (!id) return <Navigate to="/dashboard" replace />;
  return (
    <div className="p-6">
      <h1 className="text-2xl font-semibold tracking-tight">Cost Breakdown</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Itemised cost (drilling, posting, wall building, backfill,
        engineering) with per-line manual quantity overrides.
      </p>
      <div className="mt-6 rounded-md border border-dashed bg-card p-8 text-center text-sm text-muted-foreground">
        Real breakdown lands in Phase 4 once the engine is ported.
      </div>
    </div>
  );
}
