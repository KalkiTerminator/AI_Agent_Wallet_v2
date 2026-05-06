"use client";
import { useState } from "react";
import { useSession } from "next-auth/react";
import { apiClient } from "@/lib/api-client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertTriangle } from "lucide-react";

interface Dsar {
  id: string;
  userId: string;
  userEmail: string | null;
  requestType: string;
  status: string;
  requestNotes: string | null;
  resolutionNotes: string | null;
  dueDate: string;
  createdAt: string;
}

interface Props {
  dsars: Dsar[];
  loading: boolean;
  onResolved: (updated: Dsar) => void;
}

function DueDateBadge({ dueDate }: { dueDate: string }) {
  const daysLeft = Math.ceil((new Date(dueDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
  const daysElapsed = 30 - daysLeft;
  if (daysElapsed >= 30) return <Badge variant="destructive" className="text-[10px]">OVERDUE</Badge>;
  if (daysElapsed >= 25) return <Badge className="text-[10px] bg-amber-500">{daysLeft}d left</Badge>;
  return <Badge variant="secondary" className="text-[10px]">{daysLeft}d left</Badge>;
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    pending: "bg-muted text-muted-foreground",
    in_progress: "bg-blue-500/10 text-blue-500 border-blue-500/30",
    completed: "bg-success/10 text-success border-success/30",
    rejected: "bg-destructive/10 text-destructive border-destructive/30",
  };
  return <Badge variant="outline" className={`text-[10px] ${map[status] ?? ""}`}>{status.replace("_", " ")}</Badge>;
}

export function DsarQueue({ dsars, loading, onResolved }: Props) {
  const { data: session } = useSession();
  const [selected, setSelected] = useState<Dsar | null>(null);
  const [newStatus, setNewStatus] = useState("in_progress");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);

  async function handleResolve() {
    if (!selected || !session?.apiToken) return;
    setBusy(true);
    try {
      const res = await apiClient.patch<{ data: Dsar }>(
        `/api/admin/compliance/dsar/${selected.id}`,
        { status: newStatus, resolutionNotes: notes },
        session.apiToken
      );
      onResolved(res.data);
      setSelected(null);
      setNotes("");
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-12 rounded-xl" />)}</div>;
  if (dsars.length === 0) return <p className="text-xs text-muted-foreground py-4 text-center">No data subject requests.</p>;

  return (
    <>
      <div className="glass rounded-xl overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-xs">User</TableHead>
              <TableHead className="text-xs">Type</TableHead>
              <TableHead className="text-xs">Submitted</TableHead>
              <TableHead className="text-xs">Due</TableHead>
              <TableHead className="text-xs">Status</TableHead>
              <TableHead className="text-xs text-right">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {dsars.map((dsar) => (
              <TableRow key={dsar.id}>
                <TableCell className="text-xs">{dsar.userEmail ?? dsar.userId.slice(0, 8)}</TableCell>
                <TableCell className="text-xs font-medium">{dsar.requestType}</TableCell>
                <TableCell className="text-xs text-muted-foreground">{new Date(dsar.createdAt).toLocaleDateString()}</TableCell>
                <TableCell><DueDateBadge dueDate={dsar.dueDate} /></TableCell>
                <TableCell><StatusBadge status={dsar.status} /></TableCell>
                <TableCell className="text-right">
                  {dsar.status !== "completed" && dsar.status !== "rejected" && (
                    <Button size="sm" variant="outline" className="h-6 text-[10px]" onClick={() => { setSelected(dsar); setNewStatus("in_progress"); setNotes(dsar.resolutionNotes ?? ""); }}>
                      Resolve
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <Sheet open={!!selected} onOpenChange={(o) => { if (!o) setSelected(null); }}>
        <SheetContent>
          <SheetHeader>
            <SheetTitle className="text-sm">Resolve DSAR</SheetTitle>
          </SheetHeader>
          {selected && (
            <div className="space-y-4 mt-4">
              <div className="glass rounded-xl p-3 space-y-1">
                <p className="text-xs text-muted-foreground">User</p>
                <p className="text-sm font-medium">{selected.userEmail}</p>
                <p className="text-xs text-muted-foreground mt-1">Request</p>
                <p className="text-sm font-medium capitalize">{selected.requestType}</p>
                {selected.requestNotes && (
                  <>
                    <p className="text-xs text-muted-foreground mt-1">Notes from user</p>
                    <p className="text-xs">{selected.requestNotes}</p>
                  </>
                )}
              </div>
              <div className="space-y-2">
                <p className="text-xs font-medium">Update status</p>
                <Select value={newStatus} onValueChange={setNewStatus}>
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="in_progress" className="text-xs">In Progress</SelectItem>
                    <SelectItem value="completed" className="text-xs">Completed</SelectItem>
                    <SelectItem value="rejected" className="text-xs">Rejected</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <p className="text-xs font-medium">Resolution notes</p>
                <Textarea
                  className="text-xs min-h-[100px]"
                  placeholder="Describe how the request was handled…"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />
              </div>
              {new Date(selected.dueDate) < new Date() && (
                <div className="flex items-center gap-1.5 text-destructive text-xs">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  This request is overdue (30-day GDPR limit exceeded)
                </div>
              )}
              <Button className="w-full h-8 text-xs" onClick={handleResolve} disabled={busy}>
                {busy ? "Saving…" : "Save resolution"}
              </Button>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </>
  );
}
