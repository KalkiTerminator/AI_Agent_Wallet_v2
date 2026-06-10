import { SignUpForm } from "@/components/auth/SignUpForm";
import { AuthShell } from "@/components/auth/AuthShell";

export default function SignUpPage() {
  return (
    <AuthShell
      step="ACCESS / REGISTER"
      title="Create your account"
      subtitle="Ten free credits, no card required."
    >
      <SignUpForm />
    </AuthShell>
  );
}
