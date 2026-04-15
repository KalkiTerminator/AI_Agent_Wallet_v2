import Link from "next/link";

export default function NotFound() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4">
      <h1 className="text-6xl font-display font-bold text-gradient">404</h1>
      <p className="text-xl text-muted-foreground">Page not found</p>
      <Link href="/" className="px-4 py-2 bg-primary text-primary-foreground rounded-lg">Go home</Link>
    </div>
  );
}
