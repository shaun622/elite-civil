import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Header } from "@/components/layout/Header";

export function LandingPage() {
  return (
    <div className="min-h-screen bg-background">
      <Header />

      <main className="container py-24">
        <div className="mx-auto max-w-3xl text-center">
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
            Elite Civil
          </p>
          <h1 className="mt-4 text-balance text-5xl font-semibold tracking-tight sm:text-6xl">
            TakeoffMate
          </h1>
          <p className="mt-6 text-balance text-lg text-muted-foreground sm:text-xl">
            Upload a drawing, get accurate retaining wall measurements in 30
            seconds — with a visual audit trail showing exactly what the AI
            read.
          </p>

          <div className="mt-10 flex items-center justify-center gap-3">
            <Button asChild size="lg">
              <Link to="/signup">Get started</Link>
            </Button>
            <Button asChild variant="outline" size="lg">
              <Link to="/login">Sign in</Link>
            </Button>
          </div>

          <p className="mt-6 text-sm text-muted-foreground">
            3 free drawings · No card required
          </p>
        </div>

        <div className="mx-auto mt-24 grid max-w-4xl gap-6 sm:grid-cols-3">
          {[
            {
              title: "Upload",
              body: "Drag a PDF onto the project workspace.",
            },
            {
              title: "Extract",
              body: "Claude reads every dimension and groups them into wall segments.",
            },
            {
              title: "Review & export",
              body: "Verify each measurement against the original drawing, then export branded CSV or PDF.",
            },
          ].map((item) => (
            <div
              key={item.title}
              className="rounded-lg border bg-card p-5 text-left"
            >
              <h3 className="text-sm font-semibold">{item.title}</h3>
              <p className="mt-1.5 text-sm text-muted-foreground">
                {item.body}
              </p>
            </div>
          ))}
        </div>
      </main>

      <footer className="border-t">
        <div className="container flex h-14 items-center justify-between text-xs text-muted-foreground">
          <span>© Elite Civil</span>
          <span>Australia &amp; New Zealand</span>
        </div>
      </footer>
    </div>
  );
}
