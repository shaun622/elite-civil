import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  Archive,
  ArchiveRestore,
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  LayoutGrid,
  List,
  Search,
  Trash2,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DraftInput } from "@/components/ui/draft-input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { timeAgo } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useProjects } from "@/hooks/useProjects";
import { useOrg } from "@/hooks/useOrg";
import {
  archiveProject,
  deleteProject,
  restoreProject,
  updateProject,
} from "@/lib/api/projects";
import { ProjectCard } from "@/components/projects/ProjectCard";
import type { Project, ProjectStatus, TakeoffStatus } from "@/types/db";

const aud = new Intl.NumberFormat("en-AU", {
  style: "currency",
  currency: "AUD",
  maximumFractionDigits: 0,
});

const TAKEOFF_STATUS: { value: TakeoffStatus; label: string }[] = [
  { value: "not_started", label: "Not started" },
  { value: "in_progress", label: "In progress" },
  { value: "quoted", label: "Quoted" },
  { value: "won", label: "Won" },
  { value: "lost", label: "Lost" },
];

type SortKey = "name" | "quote" | "created" | "due" | "total" | "status";
type NonArchived = "all" | "active" | "draft";
type View = "table" | "grid";

const STATUS_RANK: Record<ProjectStatus, number> = {
  active: 0,
  draft: 1,
  archived: 2,
};

const VIEW_KEY = "takeoffmate.projectsView";

export function ProjectsTable({
  projects,
  values,
  valuesLoading,
}: {
  projects: Project[];
  values: Map<string, number>;
  valuesLoading: boolean;
}) {
  const navigate = useNavigate();
  const { refresh } = useProjects();
  const { canManageMembers } = useOrg();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<NonArchived>("all");
  const [archived, setArchived] = useState(false);
  const [view, setView] = useState<View>(() =>
    localStorage.getItem(VIEW_KEY) === "grid" ? "grid" : "table",
  );
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({
    key: "created",
    dir: -1,
  });

  function setViewMode(v: View) {
    setView(v);
    try {
      localStorage.setItem(VIEW_KEY, v);
    } catch {
      /* ignore */
    }
  }

  function toggleSort(key: SortKey) {
    setSort((s) =>
      s.key === key ? { key, dir: s.dir === 1 ? -1 : 1 } : { key, dir: 1 },
    );
  }

  const base = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = projects;
    if (archived) list = list.filter((p) => p.status === "archived");
    else {
      list = list.filter((p) => p.status !== "archived");
      if (statusFilter !== "all") {
        list = list.filter((p) => p.status === statusFilter);
      }
    }
    if (q) {
      list = list.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          (p.client_name ?? "").toLowerCase().includes(q),
      );
    }
    return list;
  }, [projects, search, statusFilter, archived]);

  const rows = useMemo(() => {
    const dir = sort.dir;
    const val = (p: Project): string | number => {
      switch (sort.key) {
        case "name":
          return p.name.toLowerCase();
        case "quote":
          return (p.quote_number ?? "").toLowerCase();
        case "created":
          return p.created_at;
        case "due":
          return p.due_date ?? "";
        case "total":
          return values.get(p.id) ?? 0;
        case "status":
          return STATUS_RANK[p.status];
      }
    };
    return [...base].sort((a, b) => {
      const av = val(a);
      const bv = val(b);
      if (typeof av === "number" && typeof bv === "number") {
        return dir * (av - bv);
      }
      return (
        dir *
        String(av).localeCompare(String(bv), undefined, { numeric: true })
      );
    });
  }, [base, sort, values]);

  async function onArchiveToggle(p: Project) {
    try {
      if (p.status === "archived") await restoreProject(p.id);
      else await archiveProject(p.id);
      await refresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Could not update project.");
    }
  }

  async function onDelete(p: Project) {
    if (
      !confirm(
        `Delete "${p.name}"? This permanently removes the project and all its drawings and walls. This can't be undone.`,
      )
    ) {
      return;
    }
    try {
      await deleteProject(p.id);
      await refresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Could not delete project.");
    }
  }

  async function onField(p: Project, patch: Parameters<typeof updateProject>[1]) {
    try {
      await updateProject(p.id, patch);
      await refresh();
    } catch {
      /* ignore — non-critical inline edit */
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search projects…"
            className="h-9 w-56 pl-8"
          />
        </div>

        <div className="flex items-center gap-1 rounded-md border p-0.5">
          {(
            [
              ["all", "All"],
              ["active", "Active"],
              ["draft", "Draft"],
            ] as [NonArchived, string][]
          ).map(([val, label]) => (
            <button
              key={val}
              type="button"
              disabled={archived}
              onClick={() => setStatusFilter(val)}
              className={cn(
                "rounded px-2.5 py-1 text-xs font-medium transition-colors disabled:opacity-40",
                !archived && statusFilter === val
                  ? "bg-foreground text-background"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {label}
            </button>
          ))}
        </div>

        <Button
          type="button"
          variant={archived ? "default" : "outline"}
          size="sm"
          className="h-9 gap-1.5"
          onClick={() => setArchived((a) => !a)}
          title="Show archived projects"
        >
          <Archive className="h-3.5 w-3.5" />
          Archived
        </Button>

        <div className="ml-auto flex items-center gap-2">
          <span className="text-xs text-muted-foreground">
            {rows.length} {rows.length === 1 ? "project" : "projects"}
          </span>
          <div className="flex items-center gap-0.5 rounded-md border p-0.5">
            <button
              type="button"
              onClick={() => setViewMode("table")}
              title="List view"
              className={cn(
                "rounded p-1.5 transition-colors",
                view === "table"
                  ? "bg-muted text-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <List className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => setViewMode("grid")}
              title="Grid view"
              className={cn(
                "rounded p-1.5 transition-colors",
                view === "grid"
                  ? "bg-muted text-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <LayoutGrid className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      {view === "grid" ? (
        rows.length === 0 ? (
          <EmptyRow />
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {rows.map((p) => (
              <ProjectCard key={p.id} project={p} />
            ))}
          </div>
        )
      ) : (
        <div className="rounded-lg border">
          <Table>
            <TableHeader className="[&_th]:bg-muted/40">
              <TableRow>
                <SortHead label="Project" sortKey="name" sort={sort} onSort={toggleSort} />
                <SortHead label="Quote #" sortKey="quote" sort={sort} onSort={toggleSort} className="w-24" />
                <SortHead label="Created" sortKey="created" sort={sort} onSort={toggleSort} className="w-28" />
                <SortHead label="Due date" sortKey="due" sort={sort} onSort={toggleSort} className="w-36" />
                <TableHead className="w-36">Takeoff status</TableHead>
                <SortHead label="Total (ex GST)" sortKey="total" sort={sort} onSort={toggleSort} className="w-32 text-right" align="right" />
                <SortHead label="Status" sortKey="status" sort={sort} onSort={toggleSort} className="w-24" />
                <TableHead className="w-20 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((p) => {
                const v = values.get(p.id);
                return (
                  <TableRow
                    key={p.id}
                    className="cursor-pointer"
                    onClick={() => navigate(`/projects/${p.id}`)}
                  >
                    <TableCell>
                      <Link
                        to={`/projects/${p.id}`}
                        onClick={(e) => e.stopPropagation()}
                        className="font-medium text-foreground hover:underline"
                      >
                        {p.name}
                      </Link>
                      {p.client_name && (
                        <div className="text-xs text-muted-foreground">
                          {p.client_name}
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {p.quote_number || "—"}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {timeAgo(p.created_at)}
                    </TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <DraftInput
                        type="date"
                        value={p.due_date ?? ""}
                        onCommit={(val) => void onField(p, { due_date: val || null })}
                        className="h-8 w-32 text-sm"
                      />
                    </TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <Select
                        value={p.takeoff_status ?? "not_started"}
                        onValueChange={(val) =>
                          void onField(p, {
                            takeoff_status: val as TakeoffStatus,
                          })
                        }
                      >
                        <SelectTrigger className="h-8 w-32 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {TAKEOFF_STATUS.map((s) => (
                            <SelectItem key={s.value} value={s.value}>
                              {s.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell className="text-right text-sm tabular-nums">
                      {v == null || valuesLoading ? (
                        <span className="text-muted-foreground">…</span>
                      ) : (
                        aud.format(v)
                      )}
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={p.status} />
                    </TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center justify-end gap-0.5">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-muted-foreground"
                          title={
                            p.status === "archived"
                              ? "Restore project"
                              : "Archive project"
                          }
                          onClick={() => void onArchiveToggle(p)}
                        >
                          {p.status === "archived" ? (
                            <ArchiveRestore className="h-3.5 w-3.5" />
                          ) : (
                            <Archive className="h-3.5 w-3.5" />
                          )}
                        </Button>
                        {canManageMembers && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-muted-foreground hover:text-destructive"
                            title="Delete project"
                            onClick={() => void onDelete(p)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
              {rows.length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={8}
                    className="py-8 text-center text-sm text-muted-foreground"
                  >
                    {archived
                      ? "No archived projects."
                      : "No projects match your search."}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

function EmptyRow() {
  return (
    <div className="rounded-lg border py-10 text-center text-sm text-muted-foreground">
      No projects match your search.
    </div>
  );
}

function SortHead({
  label,
  sortKey,
  sort,
  onSort,
  className,
  align,
}: {
  label: string;
  sortKey: SortKey;
  sort: { key: SortKey; dir: 1 | -1 };
  onSort: (key: SortKey) => void;
  className?: string;
  align?: "right";
}) {
  const active = sort.key === sortKey;
  return (
    <TableHead className={className}>
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className={cn(
          "inline-flex items-center gap-1 hover:text-foreground",
          align === "right" && "flex-row-reverse",
          active ? "text-foreground" : "",
        )}
      >
        {label}
        {active ? (
          sort.dir === 1 ? (
            <ArrowUp className="h-3 w-3" />
          ) : (
            <ArrowDown className="h-3 w-3" />
          )
        ) : (
          <ArrowUpDown className="h-3 w-3 opacity-40" />
        )}
      </button>
    </TableHead>
  );
}

function StatusBadge({ status }: { status: ProjectStatus }) {
  if (status === "archived") return <Badge variant="muted">Archived</Badge>;
  if (status === "draft") return <Badge variant="outline">Draft</Badge>;
  return (
    <Badge className="border-emerald-200 bg-emerald-100 text-emerald-800">
      Active
    </Badge>
  );
}
