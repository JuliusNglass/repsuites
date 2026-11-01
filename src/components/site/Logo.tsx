// RepSuites logo: the gold shield mark and the wordmark. Crisp at any size
// (the wordmark is text, not an image).
export function Logo({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <img src="/logo-mark.png" alt="" aria-hidden="true" className="h-8 w-8 rounded-md" />
      <span className="text-lg font-extrabold tracking-tight text-foreground">
        Rep<span className="text-primary-ink">Suites</span>
      </span>
    </span>
  );
}
