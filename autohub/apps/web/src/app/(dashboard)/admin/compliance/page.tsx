"use client";
import { useCallback, useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { redirect } from "next/navigation";
import { apiClient } from "@/lib/api-client";
import { DsarQueue } from "@/components/admin/DsarQueue";

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

export default function CompliancePage() {
  const { data: session, status } = useSession();
  const [dsars, setDsars] = useState<Dsar[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (status === "authenticated" && session?.user?.role !== "admin") {
      redirect("/dashboard");
    }
  }, [status, session]);

  const fetchDsars = useCallback(async () => {
    if (!session?.apiToken) return;
    try {
      const res = await apiClient.get<{ data: Dsar[] }>("/api/admin/compliance/dsar", session.apiToken);
      setDsars(res.data);
    } finally {
      setLoading(false);
    }
  }, [session?.apiToken]);

  useEffect(() => { fetchDsars(); }, [fetchDsars]);

  function handleResolved(updated: Dsar) {
    setDsars((prev) => prev.map((d) => d.id === updated.id ? updated : d));
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="font-display font-bold text-xl">Compliance</h1>
        <p className="text-xs text-muted-foreground mt-0.5">Data subject requests — 30 day response SLA</p>
      </div>
      <DsarQueue dsars={dsars} loading={loading} onResolved={handleResolved} />
    </div>
  );
}
