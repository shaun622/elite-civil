import { Link } from "react-router-dom";
import { Check } from "lucide-react";
import { Header } from "@/components/layout/Header";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";

type Tier = {
  id: "trial" | "starter" | "pro";
  name: string;
  price: string;
  cadence: string;
  drawings: string;
  storage: string;
  features: string[];
  cta: string;
  ctaTarget: string;
  highlight?: boolean;
};

const TIERS: Tier[] = [
  {
    id: "trial",
    name: "Trial",
    price: "Free",
    cadence: "no card required",
    drawings: "3 drawings (lifetime)",
    storage: "200 MB storage",
    features: [
      "Full extraction + review workflow",
      "CSV and branded PDF exports",
      "Manual edits and audit trail",
    ],
    cta: "Start free",
    ctaTarget: "/signup",
  },
  {
    id: "starter",
    name: "Starter",
    price: "AUD $39",
    cadence: "per month",
    drawings: "30 drawings / month",
    storage: "5 GB storage",
    features: [
      "Everything in Trial",
      "Branded PDF exports with your company details",
      "Re-run extraction when drawings change",
      "Email support",
    ],
    cta: "Choose Starter",
    ctaTarget: "/settings",
    highlight: true,
  },
  {
    id: "pro",
    name: "Pro",
    price: "AUD $89",
    cadence: "per month",
    drawings: "Unlimited drawings",
    storage: "50 GB storage",
    features: [
      "Everything in Starter",
      "Priority extraction queue",
      "Bulk project export",
      "Priority support",
    ],
    cta: "Choose Pro",
    ctaTarget: "/settings",
  },
];

export function PricingPage() {
  const { user } = useAuth();

  return (
    <div className="min-h-screen bg-background">
      <Header />

      <main className="container py-16">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
            Pricing
          </p>
          <h1 className="mt-3 text-balance text-4xl font-semibold tracking-tight sm:text-5xl">
            Simple plans for AU/NZ retaining wall installers
          </h1>
          <p className="mt-5 text-balance text-base text-muted-foreground sm:text-lg">
            Pay only for the volume you need. Every plan includes the full
            extraction + review workflow and exports — the only difference is
            the monthly drawing budget and storage cap.
          </p>
        </div>

        <div className="mx-auto mt-14 grid max-w-5xl gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {TIERS.map((tier) => (
            <div
              key={tier.id}
              className={cn(
                "flex flex-col rounded-lg border bg-card p-6",
                tier.highlight && "border-foreground shadow-lg",
              )}
            >
              <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                {tier.name}
              </h3>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="text-3xl font-semibold tracking-tight">
                  {tier.price}
                </span>
                <span className="text-sm text-muted-foreground">
                  {tier.cadence}
                </span>
              </div>

              <div className="mt-5 space-y-1.5 border-y py-4 text-sm">
                <p className="font-medium">{tier.drawings}</p>
                <p className="text-muted-foreground">{tier.storage}</p>
              </div>

              <ul className="mt-4 space-y-2 text-sm">
                {tier.features.map((f) => (
                  <li key={f} className="flex items-start gap-2">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>

              <Button
                asChild
                className="mt-6 w-full"
                variant={tier.highlight ? "default" : "outline"}
              >
                <Link to={user ? tier.ctaTarget : "/signup"}>{tier.cta}</Link>
              </Button>
            </div>
          ))}
        </div>

        <p className="mx-auto mt-10 max-w-xl text-center text-xs text-muted-foreground">
          All prices in AUD. Cancel anytime. Trial converts only if you
          explicitly upgrade — your card is never auto-charged.
        </p>
      </main>
    </div>
  );
}
