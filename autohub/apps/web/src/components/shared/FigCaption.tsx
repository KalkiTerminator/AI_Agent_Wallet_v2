/**
 * `fig. NN — caption` motif that closes instrument panels and sections.
 */
export function FigCaption({ n, children }: { n: string; children: React.ReactNode }) {
  return (
    <p className="font-mono text-[10px] tracking-[0.14em] text-muted-foreground/70">
      <span className="text-muted-foreground">fig. {n}</span> — {children}
    </p>
  );
}
