import { LoginForm } from "@/components/auth/LoginForm";
import { AuthShell } from "@/components/auth/AuthShell";

export default function LoginPage() {
  return (
    <AuthShell
      step="ACCESS / SIGN IN"
      title="Welcome back, operator"
      subtitle="Authenticate to resume your session."
    >
      <LoginForm />
    </AuthShell>
  );
}
