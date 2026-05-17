import { useEffect, useState, type FormEvent, type ReactNode } from "react";
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
import type { Project, ProjectUpdate } from "@/types/db";

type Props = {
  project: Project;
  onSave: (patch: ProjectUpdate) => Promise<unknown>;
  trigger: ReactNode;
};

export function EditProjectDialog({ project, onSave, trigger }: Props) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(project.name);
  const [clientName, setClientName] = useState(project.client_name ?? "");
  const [siteAddress, setSiteAddress] = useState(project.site_address ?? "");
  const [notes, setNotes] = useState(project.notes ?? "");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setName(project.name);
    setClientName(project.client_name ?? "");
    setSiteAddress(project.site_address ?? "");
    setNotes(project.notes ?? "");
    setError(null);
  }, [open, project]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await onSave({
        name,
        client_name: clientName,
        site_address: siteAddress,
        notes,
      });
      setOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save project.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit project</DialogTitle>
          <DialogDescription>
            Update the project details and notes.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} className="space-y-4">
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <div className="space-y-2">
            <Label htmlFor="edit-name">Project name</Label>
            <Input
              id="edit-name"
              required
              maxLength={120}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="edit-client">Client</Label>
            <Input
              id="edit-client"
              maxLength={120}
              value={clientName}
              onChange={(e) => setClientName(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="edit-address">Site address</Label>
            <Input
              id="edit-address"
              maxLength={200}
              value={siteAddress}
              onChange={(e) => setSiteAddress(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="edit-notes">Notes</Label>
            <Textarea
              id="edit-notes"
              rows={3}
              maxLength={2000}
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
              {submitting ? "Saving…" : "Save changes"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
