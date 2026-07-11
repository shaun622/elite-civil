import { useState, type FormEvent, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { FileText, MapPin, UserRound } from "lucide-react";
import { useProjects } from "@/hooks/useProjects";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import type { ProjectInsert } from "@/types/db";

export function NewProjectDialog({ trigger }: { trigger: ReactNode }) {
  const navigate = useNavigate();
  const { create } = useProjects();

  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [projectNumber, setProjectNumber] = useState("");
  const [description, setDescription] = useState("");
  const [clientName, setClientName] = useState("");
  const [contactName, setContactName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [street, setStreet] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [postcode, setPostcode] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setName("");
    setProjectNumber("");
    setDescription("");
    setClientName("");
    setContactName("");
    setContactEmail("");
    setDueDate("");
    setStreet("");
    setCity("");
    setState("");
    setPostcode("");
    setError(null);
    setSubmitting(false);
  }

  async function onCreate(e: FormEvent, goToDrawings: boolean) {
    e.preventDefault();
    if (!name.trim()) {
      setError("Name is required.");
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      const payload: ProjectInsert = {
        name,
        quote_number: projectNumber || null,
        description: description || null,
        client_name: clientName || null,
        contact_name: contactName || null,
        contact_email: contactEmail || null,
        due_date: dueDate || null,
        site_address: street || null,
        site_city: city || null,
        site_state: state || null,
        site_postcode: postcode || null,
      };
      const project = await create(payload);
      setOpen(false);
      reset();
      // Prefer the slug; fall back to the UUID for pre-migration rows (the
      // route resolver accepts either).
      const seg = project.slug ?? project.id;
      navigate(goToDrawings ? `/projects/${seg}/drawings` : `/projects/${seg}`);
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : (err as { message?: string } | null)?.message ??
            "Could not create project.";
      setError(message);
      setSubmitting(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset();
      }}
    >
      <DialogTrigger asChild>{trigger}</DialogTrigger>

      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Create new project</DialogTitle>
          <DialogDescription>
            Group drawings, measurements, quotes and materials under one client
            or site.
          </DialogDescription>
        </DialogHeader>

        <form
          onSubmit={(e) => void onCreate(e, false)}
          className="max-h-[70vh] space-y-4 overflow-y-auto pr-1"
        >
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {/* Project info */}
          <Section icon={FileText} title="Project info">
            <div className="grid gap-3 sm:grid-cols-[1fr_150px]">
              <Field label="Project name" required>
                <Input
                  required
                  autoFocus
                  maxLength={120}
                  placeholder="e.g. 12 Murray Street retaining walls"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </Field>
              <Field label="Project / quote #">
                <Input
                  maxLength={40}
                  placeholder="Optional"
                  value={projectNumber}
                  onChange={(e) => setProjectNumber(e.target.value)}
                />
              </Field>
            </div>
            <Field label="Description">
              <Textarea
                rows={2}
                maxLength={2000}
                placeholder="Brief project description (optional)"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </Field>
          </Section>

          {/* Assignment & scope */}
          <Section icon={UserRound} title="Client & schedule">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Client">
                <Input
                  maxLength={120}
                  placeholder="e.g. Smith Family"
                  value={clientName}
                  onChange={(e) => setClientName(e.target.value)}
                />
              </Field>
              <Field label="Due date">
                <Input
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                />
              </Field>
              <Field label="Contact name">
                <Input
                  maxLength={120}
                  placeholder="e.g. John Smith"
                  value={contactName}
                  onChange={(e) => setContactName(e.target.value)}
                />
              </Field>
              <Field label="Contact email">
                <Input
                  type="email"
                  maxLength={160}
                  placeholder="e.g. john@example.com"
                  value={contactEmail}
                  onChange={(e) => setContactEmail(e.target.value)}
                />
              </Field>
            </div>
          </Section>

          {/* Job site */}
          <Section icon={MapPin} title="Job site address">
            <Field label="Street address">
              <Input
                maxLength={200}
                placeholder="e.g. 12 Murray St"
                value={street}
                onChange={(e) => setStreet(e.target.value)}
              />
            </Field>
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="City / suburb">
                <Input
                  maxLength={80}
                  placeholder="Pyrmont"
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                />
              </Field>
              <Field label="State">
                <Input
                  maxLength={40}
                  placeholder="NSW"
                  value={state}
                  onChange={(e) => setState(e.target.value)}
                />
              </Field>
              <Field label="Postcode">
                <Input
                  maxLength={12}
                  placeholder="2009"
                  value={postcode}
                  onChange={(e) => setPostcode(e.target.value)}
                />
              </Field>
            </div>
          </Section>
        </form>

        <DialogFooter className="gap-2 sm:justify-between">
          <Button
            type="button"
            variant="outline"
            onClick={() => setOpen(false)}
            disabled={submitting}
          >
            Cancel
          </Button>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={submitting || !name.trim()}
              onClick={(e) => void onCreate(e, true)}
            >
              Create & add drawings
            </Button>
            <Button
              type="button"
              disabled={submitting || !name.trim()}
              onClick={(e) => void onCreate(e, false)}
            >
              {submitting ? "Creating…" : "Create project"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Section({
  icon: Icon,
  title,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-3 rounded-lg border p-4">
      <div className="flex items-center gap-2">
        <Icon className="h-4 w-4 text-muted-foreground" />
        <h3 className="text-sm font-semibold">{title}</h3>
      </div>
      {children}
    </div>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-muted-foreground">
        {label}
        {required && <span className="ml-0.5 text-destructive">*</span>}
      </Label>
      {children}
    </div>
  );
}
