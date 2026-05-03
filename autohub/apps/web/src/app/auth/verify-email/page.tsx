"use client";
import { Suspense, useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Loader2, CheckCircle, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

function VerifyEmailContent() {
  const params = useSearchParams();
  const router = useRouter();
  const token = params.get("token");
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!token) { setStatus("error"); setMessage("Missing token"); return; }
    fetch(`${API_BASE}/api/auth/verify-email?token=${encodeURIComponent(token)}`, {
      redirect: "manual",
    }).then((res) => {
      if (res.ok || res.status === 302 || res.type === "opaqueredirect") {
        setStatus("success");
      } else {
        return res.json().then((d) => { setStatus("error"); setMessage(d.error ?? "Verification failed"); });
      }
    }).catch(() => { setStatus("error"); setMessage("Network error"); });
  }, [token]);

  if (status === "loading") return (
    <div className="min-h-screen flex items-center justify-center">
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
    </div>
  );

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="glass rounded-2xl p-8 max-w-md w-full text-center space-y-4">
        {status === "success" ? (
          <>
            <CheckCircle className="h-12 w-12 text-success mx-auto" />
            <h1 className="font-display font-bold text-xl">Email verified!</h1>
            <p className="text-sm text-muted-foreground">Your account is now active.</p>
            <Button onClick={() => router.push("/dashboard")} className="w-full">Go to Dashboard</Button>
          </>
        ) : (
          <>
            <AlertCircle className="h-12 w-12 text-destructive mx-auto" />
            <h1 className="font-display font-bold text-xl">Verification failed</h1>
            <p className="text-sm text-muted-foreground">{message}</p>
            <Button variant="outline" onClick={() => router.push("/auth/login")} className="w-full">Back to Login</Button>
          </>
        )}
      </div>
    </div>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    }>
      <VerifyEmailContent />
    </Suspense>
  );
}
