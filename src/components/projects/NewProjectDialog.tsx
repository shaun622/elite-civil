import { useState, type FormEvent, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
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

export function NewProjectDialog({ trigger }: { trigger: ReactNode }) {
  const navigate = useNavigate();
  const { create } = useProjects();

  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [clientName, setClientName] = useState("");
  const [siteAddress, setSiteAddress] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setName("");
    setClientName("");
    setSiteAddress("");
    setNotes("");
    setError(null);
    setSubmitting(false);
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const project = await create({
        name,
        client_name: clientName,
        site_address: siteAddress,
        notes,
      });
      setOpen(false);
      reset();
      navigate(`/projects/${project.id}`);
    } catch (err) {
      // Surface Supabase PostgrestError messages too — they aren't
      // `instanceof Error`, they're plain objects with a `.message`.
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

      <DialogContent>
        <DialogHeader>
          <DialogTitle>New project</DialogTitle>
          <DialogDescription>
            Group drawings, measurements, and exports under a single client or
            site.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} className="space-y-4">
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <div className="space-y-2">
            <Label htmlFor="project-name">Project name</Label>
            <Input
              id="project-name"
              required
              autoFocus
              maxLength={120}
              placeholder="e.g. 12 Murray Street retaining walls"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="project-client">Client</Label>
            <Input
              id="project-client"
              maxLength={120}
              placeholder="e.g. Smith Family"
              value={clientName}
              onChange={(e) => setClientName(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="project-address">Site address</Label>
            <Input
              id="project-address"
              maxLength={200}
              placeholder="e.g. 12 Murray St, Pyrmont NSW"
              value={siteAddress}
              onChange={(e) => setSiteAddress(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="project-notes">Notes</Label>
            <Textarea
              id="project-notes"
              rows={3}
              maxLength={2000}
              placeholder="Optional"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>

          <DialogFooter className="gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={submitting || !name.trim()}>
              {submitting ? "Creating…" : "Create project"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
