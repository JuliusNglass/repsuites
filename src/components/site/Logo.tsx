// RepSuites logo: the gold shield mark and the wordmark. Crisp at any size
// (the wordmark is text, not an image).
// `compact` hides the wordmark on phones under 420px wide, for headers that
// carry several controls (the link around it must then have an aria-label).
export function Logo({
  className = "",
  compact = false,
}: {
  className?: string;
  compact?: boolean;
}) {
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <img src="/logo-mark.png" alt="" aria-hidden="true" className="h-8 w-8 rounded-md" />
      <span
        className={`text-lg font-extrabold tracking-tight text-foreground ${compact ? "hidden min-[420px]:inline" : ""}`}
      >
        Rep<span className="text-primary-ink">Suites</span>
      </span>
    </span>
  );
}
