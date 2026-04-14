"use client";
import { useCallback, useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { apiClient } from "@/lib/api-client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  CheckCircle,
  XCircle,
  Loader2,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import type { ToolUsageRow } from "@/types";

const PAGE_SIZE = 20;

export default function UsagePage() {
  const { data: session } = useSession();
  const [rows, setRows] = useState<ToolUsageRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);

  const fetchUsage = useCallback(async () => {
    if (!session?.apiToken) return;
    setLoading(true);
    try {
      const res = await apiClient.get<{
        data: ToolUsageRow[];
        meta: { page: number; limit: number; total: number };
      }>(
        `/api/tools/usage?page=${page}&limit=${PAGE_SIZE}`,
        session.apiToken
      );
      setRows(res.data);
      setTotal(res.meta.total);
    } finally {
      setLoading(false);
    }
  }, [session?.apiToken, page]);

  useEffect(() => {
    fetchUsage();
  }, [fetchUsage]);

  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <div className="p-6 space-y-4">
      <div>
        <h1 className="font-display font-bold text-xl">Usage History</h1>
        <p className="text-xs text-muted-foreground mt-0.5">
          {total} total executions
        </p>
      </div>

      <div className="glass rounded-xl overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-xs">Tool</TableHead>
              <TableHead className="text-xs">Status</TableHead>
              <TableHead className="text-xs text-right">Credits</TableHead>
              <TableHead className="text-xs">Date</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              Array.from({ length: 8 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell>
                    <Skeleton className="h-4 w-32" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-4 w-16" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-4 w-8 ml-auto" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-4 w-24" />
                  </TableCell>
                </TableRow>
              ))
            ) : rows.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={4}
                  className="text-center text-xs text-muted-foreground py-12"
                >
                  No usage history yet. Run a tool to get started.
                </TableCell>
              </TableRow>
            ) : (
              rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="text-xs font-medium">
                    {row.toolId}
                  </TableCell>
                  <TableCell>
                    {row.status === "success" ? (
                      <Badge
                        variant="outline"
                        className="text-[10px] text-success border-success/30 gap-1"
                      >
                        <CheckCircle className="h-2.5 w-2.5" />
                        success
                      </Badge>
                    ) : row.status === "failed" ? (
                      <Badge
                        variant="outline"
                        className="text-[10px] text-destructive border-destructive/30 gap-1"
                      >
                        <XCircle className="h-2.5 w-2.5" />
                        failed
                      </Badge>
                    ) : (
                      <Badge variant="secondary" className="text-[10px] gap-1">
                        <Loader2 className="h-2.5 w-2.5 animate-spin" />
                        {row.status}
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-xs text-right font-mono">
                    {row.creditsUsed}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {new Date(row.createdAt).toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground">
            Page {page} of {totalPages}
          </p>
          <div className="flex gap-1">
            <Button
              variant="outline"
              size="sm"
              className="h-7 w-7 p-0"
              disabled={page === 1}
              onClick={() => setPage((p) => p - 1)}
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-7 w-7 p-0"
              disabled={page === totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
