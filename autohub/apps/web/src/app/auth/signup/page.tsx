import { SignUpForm } from "@/components/auth/SignUpForm";

export default function SignUpPage() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="glass p-8 rounded-xl w-full max-w-md">
        <h1 className="text-2xl font-display font-bold mb-6">Create your account</h1>
        <SignUpForm />
      </div>
    </div>
  );
}
