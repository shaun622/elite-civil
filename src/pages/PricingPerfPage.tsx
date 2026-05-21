import { Navigate, useParams } from "react-router-dom";

/** Pricing & Performance — placeholder shell, real content in Phase 4. */
export function PricingPerfPage() {
  const { id } = useParams<{ id: string }>();
  if (!id) return <Navigate to="/dashboard" replace />;
  return (
    <div className="p-6">
      <h1 className="text-2xl font-semibold tracking-tight">
        Pricing &amp; Performance
      </h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Configure crew type, labour rates, machine rates, post sizes, and
        performance assumptions for this project.
      </p>
      <div className="mt-6 rounded-md border border-dashed bg-card p-8 text-center text-sm text-muted-foreground">
        Pricing &amp; Performance editor arrives in Phase 4, once the project
        config column is added to <code>projects</code> in Phase 2.
      </div>
    </div>
  );
}
