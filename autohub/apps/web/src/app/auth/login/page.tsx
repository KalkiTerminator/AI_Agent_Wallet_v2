import { LoginForm } from "@/components/auth/LoginForm";

export default function LoginPage() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="glass p-8 rounded-xl w-full max-w-md">
        <h1 className="text-2xl font-display font-bold mb-6">Sign in to AutoHub</h1>
        <LoginForm />
      </div>
    </div>
  );
}
