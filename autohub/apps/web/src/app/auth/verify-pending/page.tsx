export default function VerifyPendingPage() {
  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="glass rounded-2xl p-8 max-w-md w-full text-center space-y-4">
        <div className="text-4xl">📧</div>
        <h1 className="font-display font-bold text-xl">Check your email</h1>
        <p className="text-sm text-muted-foreground">
          We sent a verification link to your email address. Click the link to activate your account.
        </p>
        <p className="text-xs text-muted-foreground">
          Didn&apos;t receive it? Check your spam folder or{" "}
          <a href="/auth/login" className="text-primary hover:underline">sign in</a>{" "}
          to resend.
        </p>
      </div>
    </div>
  );
}
