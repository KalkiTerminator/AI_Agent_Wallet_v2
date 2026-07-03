import { Suspense } from "react";
import { SignUpForm } from "@/components/auth/SignUpForm";
import { AuthShell } from "@/components/auth/AuthShell";
import { CREDIT_TIERS } from "@autohub/shared";

export default function SignUpPage() {
  return (
    <AuthShell
      step="ACCESS / REGISTER"
      title="Create your account"
      subtitle={`${CREDIT_TIERS.FREE.creditsOnSignup} free credits, no card required.`}
    >
      {/* SignUpForm reads ?intent= via useSearchParams — needs a Suspense boundary */}
      <Suspense>
        <SignUpForm />
      </Suspense>
    </AuthShell>
  );
}
