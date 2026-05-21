import { Navigate, useParams } from "react-router-dom";

/** Materials Order — placeholder shell, real content in Phase 4. */
export function MaterialsOrderPage() {
  const { id } = useParams<{ id: string }>();
  if (!id) return <Navigate to="/dashboard" replace />;
  return (
    <div className="p-6">
      <h1 className="text-2xl font-semibold tracking-tight">
        Materials Order
      </h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Consolidated procurement list — concrete, steel, sleepers, geofab,
        ag line, gravel, fence brackets.
      </p>
      <div className="mt-6 rounded-md border border-dashed bg-card p-8 text-center text-sm text-muted-foreground">
        Materials list arrives in Phase 4 once the engine is ported.
      </div>
    </div>
  );
}
