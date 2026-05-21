import { Navigate, useParams } from "react-router-dom";

/** Tracking — placeholder shell, real content in Phase 4. */
export function TrackingPage() {
  const { id } = useParams<{ id: string }>();
  if (!id) return <Navigate to="/dashboard" replace />;
  return (
    <div className="p-6">
      <h1 className="text-2xl font-semibold tracking-tight">Tracking</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        End-of-month log: hours on site per phase, crew, machine, quantity
        delivered.
      </p>
      <div className="mt-6 rounded-md border border-dashed bg-card p-8 text-center text-sm text-muted-foreground">
        Tracking log arrives in Phase 4.
      </div>
    </div>
  );
}
