import { Navigate, useParams } from "react-router-dom";

/** Quotation — placeholder shell, real content in Phase 4. */
export function QuotationPage() {
  const { id } = useParams<{ id: string }>();
  if (!id) return <Navigate to="/dashboard" replace />;
  return (
    <div className="p-6">
      <h1 className="text-2xl font-semibold tracking-tight">Quotation</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Customer-facing quote — height-band line items, tier walls,
        engineering, mobe / de-mobe, plus any Extra Over additions.
      </p>
      <div className="mt-6 rounded-md border border-dashed bg-card p-8 text-center text-sm text-muted-foreground">
        Quotation builder arrives in Phase 4.
      </div>
    </div>
  );
}
