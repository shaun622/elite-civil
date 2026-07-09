import type { ReactNode } from "react";
import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";

const SECTIONS: { id: string; title: string }[] = [
  { id: "getting-started", title: "Getting started" },
  { id: "projects", title: "Projects" },
  { id: "measure", title: "Measuring from PDF" },
  { id: "review", title: "Walls & RLs" },
  { id: "takeoff", title: "Take Off" },
  { id: "pricing", title: "Pricing & Performance" },
  { id: "cost", title: "Cost Breakdown" },
  { id: "materials", title: "Materials Order" },
  { id: "quotation", title: "Quotation" },
  { id: "heightbands", title: "Height bands & printing" },
  { id: "team", title: "Team & access" },
  { id: "faq", title: "FAQ" },
];

export function HelpPage() {
  return (
    <main className="container py-8">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Documentation
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            How Elite Civil turns a plan into a priced retaining-wall quote.
          </p>
        </div>
        <Button
          variant="outline"
          className="gap-2 print:hidden"
          onClick={() => window.print()}
        >
          <Printer className="h-4 w-4" />
          Print / save PDF
        </Button>
      </div>

      <div className="mt-6 grid gap-10 lg:grid-cols-[200px_1fr]">
        <nav className="sticky top-4 hidden self-start text-sm print:hidden lg:block">
          <p className="mb-2 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            On this page
          </p>
          <ul className="space-y-1">
            {SECTIONS.map((s) => (
              <li key={s.id}>
                <a
                  href={`#${s.id}`}
                  className="text-muted-foreground hover:text-foreground"
                >
                  {s.title}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <div className="max-w-2xl space-y-8 text-sm leading-relaxed text-muted-foreground">
          <Section id="getting-started" title="Getting started">
            <P>
              Elite Civil prices sleeper-and-steel retaining walls straight from
              a PDF plan. The flow is: create a project, measure the walls off
              the drawing, set their heights from the RLs, then review the
              take-off, materials order and customer quote.
            </P>
            <P>
              New here? Hit <B>Take virtual tour</B> on the dashboard for a
              two-minute walkthrough.
            </P>
          </Section>

          <Section id="projects" title="Projects">
            <P>
              A <B>project</B> holds everything for one job: the drawings, the
              measured walls, the pricing config, the materials order and the
              quote. Create one from the dashboard with <B>Create project</B>{" "}
              (give it a name, client and site).
            </P>
            <P>
              The projects table lets you search, sort any column, filter by
              status, set a due date, and see each job's quote total. Owners and
              admins can archive or delete a project from the row actions.
            </P>
          </Section>

          <Section id="measure" title="Measuring from PDF">
            <P>
              Open a project and go to <B>Measure from PDF</B>. Upload the plan;
              each page becomes reviewable. On a page:
            </P>
            <UL
              items={[
                "Calibrate the scale — click two points a known distance apart and enter the real distance. Everything measures off this.",
                "Trace each wall along its line; the length is read from the plan.",
                "You can drag wall endpoints, add or delete vertices, and rename or regroup walls into lots.",
              ]}
            />
          </Section>

          <Section id="review" title="Walls & RLs">
            <P>
              Heights come from the reduced levels (RLs) on the plan. Select a
              wall and use <B>Grab RLs</B> — box the top and bottom level numbers
              and we read them and set the height. You can pick which two numbers
              are the top/bottom, or swap them.
            </P>
            <P>
              If a wall's stations cross a height band (e.g. mostly under 1.6 m
              but part of it over), it's <B>split automatically</B> into sections
              for pricing — the same as if you'd drawn two walls. Type a manual
              height to override and price it as one wall.
            </P>
            <P>
              The “Summary by height band” panel totals walls, length and area
              per band. You set the bands (ranges) and the embedment round-up
              there — they're saved on the project and shared with your team.
            </P>
          </Section>

          <Section id="takeoff" title="Take Off">
            <P>
              <B>Take Off</B> is the full quantity breakdown per wall: posts,
              concrete, gravel, holes, bays, sleepers and hours. Walls are
              grouped by lot with subtotals. You can add manual walls here too,
              and edit lot / type / height inline.
            </P>
            <P>
              Steel posts allow for 1:1 in-ground embedment (a 2.2 m wall gets a
              4.4 m post), and the post size comes from the wall's retained
              height.
            </P>
          </Section>

          <Section id="pricing" title="Pricing & Performance">
            <P>
              This is the project's rate card: labour and machine rates,
              material prices, engineering (post sizes, hole depth, embedment
              ratio), performance (crew speeds) and admin (markup, margin). Every
              downstream number — cost, materials, quote — reads from here.
            </P>
            <P>
              <B>Extra Over Bands</B> set the per-height-band price multiplier and
              the <B>quote label</B> that prints for each band. Changes save
              automatically.
            </P>
          </Section>

          <Section id="cost" title="Cost Breakdown">
            <P>
              A line-by-line internal cost estimate (drilling, posting, wall
              building, backfill, engineering) with category totals. You can
              override any line's quantity; the totals follow. This is your cost
              basis, before markup and margin.
            </P>
          </Section>

          <Section id="materials" title="Materials Order">
            <P>
              A procurement list — concrete, steel posts, fence brackets,
              sleepers, gravel and more — priced at cost. Each category is a
              collapsible section. Steel shows an <B>order total per post type</B>{" "}
              (size + length) across the whole job, plus a per-lot breakdown so
              you can stage deliveries by location.
            </P>
          </Section>

          <Section id="quotation" title="Quotation">
            <P>
              The customer-facing quote. Everything is editable and display-only
              — nothing here changes your take-off or cost figures:
            </P>
            <UL
              items={[
                "Override any line's rate, quantity or description; a reset arrow restores the calculated value.",
                "Hide a line, or add your own custom lines; the totals follow.",
                "Edit the header (client, quote number), the wall-summary figures, and the Terms, Inclusions, Exclusions and design-parameter blocks.",
                "Add Extra-Over items for variations (site access, tree removal, etc.).",
                "Print / save PDF gives a clean contract with all the edit controls hidden.",
              ]}
            />
          </Section>

          <Section id="heightbands" title="Height bands & printing">
            <P>
              On any Measure/Review page, the drawing toolbar can colour walls by
              height band, multi-colour a wall by its sections, badge each wall
              with its length and m², and turn the plan greyscale (<B>B&amp;W
              drawing</B>) so the colours stand out on busy plans.
            </P>
            <P>
              <B>Print summary</B> captures the whole drawing (regardless of your
              zoom) plus the height-band table — a tidy sheet to send a client.
            </P>
          </Section>

          <Section id="team" title="Team & access">
            <P>
              Your company is one account. Owners and admins can invite team
              members (Owner / Admin / Editor / Viewer) from Settings. Everyone
              in the company sees the company's projects; a project can be marked
              restricted so only chosen members (plus owners/admins) can open it.
            </P>
          </Section>

          <Section id="faq" title="FAQ">
            <P>
              <B>Why doesn't the dashboard "Quote Total" match the Quotation
              page?</B> The dashboard card uses the cost + markup + margin model;
              once you override lines on the Quotation, that page becomes the
              source of truth for the customer number.
            </P>
            <P>
              <B>A wall shows two colours / prices.</B> Its RLs cross a height
              band, so it's split into sections. Set a manual height to treat it
              as one wall.
            </P>
            <P>
              <B>Colours don't print.</B> We render them so they print on every
              browser — if a chip is ever missing, make sure you're on the latest
              version (bottom of the sidebar).
            </P>
          </Section>
        </div>
      </div>
    </main>
  );
}

function Section({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-4 space-y-2">
      <h2 className="text-base font-semibold text-foreground">{title}</h2>
      {children}
    </section>
  );
}

function P({ children }: { children: ReactNode }) {
  return <p>{children}</p>;
}

function B({ children }: { children: ReactNode }) {
  return <span className="font-medium text-foreground">{children}</span>;
}

function UL({ items }: { items: string[] }) {
  return (
    <ul className="list-disc space-y-1 pl-5">
      {items.map((it, i) => (
        <li key={i}>{it}</li>
      ))}
    </ul>
  );
}
