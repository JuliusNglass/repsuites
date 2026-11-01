// Header and footer for the public RepSuites pages.
// No em dashes in this copy (AGENTS.md).
import { Logo } from "./Logo";
import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";

export function PublicLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      <header className="sticky top-0 z-40 bg-background/90 backdrop-blur border-b border-border">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between gap-3">
          <Link to="/" className="flex items-center min-h-11 shrink-0" aria-label="RepSuites home">
            <Logo />
          </Link>
          {/* Every link is at least 44px tall and never wraps. Below 420px "Cards"
              moves to the footer so the header fits on the smallest phones. */}
          <nav className="flex items-center gap-1 sm:gap-4 text-base whitespace-nowrap">
            <Link
              to="/cards"
              className="hidden min-[420px]:inline-flex items-center min-h-11 text-muted-foreground hover:text-foreground px-2"
            >
              Cards
            </Link>
            <Link
              to="/pricing"
              className="hidden sm:inline-flex items-center min-h-11 px-2 text-muted-foreground hover:text-foreground"
            >
              Pricing
            </Link>
            <Link
              to="/login"
              className="inline-flex items-center min-h-11 text-muted-foreground hover:text-foreground px-2"
            >
              Log in
            </Link>
            <a
              href="/start"
              className="inline-flex items-center min-h-11 rounded-lg bg-primary text-primary-foreground font-semibold px-3 sm:px-4"
            >
              Start free
            </a>
          </nav>
        </div>
      </header>
      <main className="flex-1">{children}</main>
      <footer className="border-t border-border py-8 px-4">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-muted-foreground">
          <span>
            © {new Date().getFullYear()} Accelur8 Ltd. RepSuites is a product by Accelur8.
          </span>
          <div className="flex flex-wrap justify-center gap-x-4 [&_a]:inline-flex [&_a]:items-center [&_a]:min-h-11 [&_a]:px-1">
            <Link to="/cards" className="hover:text-foreground">
              Review cards
            </Link>
            <Link to="/privacy" className="hover:text-foreground">
              Privacy Policy
            </Link>
            <Link to="/google-business-profile" className="hover:text-foreground">
              Google connection
            </Link>
            <Link to="/pricing" className="hover:text-foreground">
              Pricing
            </Link>
            <Link to="/terms" className="hover:text-foreground">
              Terms of Service
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}

// Readable styling for text pages (privacy, terms, Google connection).
export const textPageClass = [
  "max-w-3xl mx-auto px-4 pt-12 pb-20 leading-relaxed",
  "[&_h1]:text-3xl [&_h1]:md:text-4xl [&_h1]:font-bold [&_h1]:mb-2",
  "[&_h2]:text-xl [&_h2]:font-bold [&_h2]:mt-10 [&_h2]:mb-3",
  "[&_p]:mb-4 [&_p]:text-muted-foreground [&_strong]:text-foreground",
  "[&_ul]:list-disc [&_ul]:pl-6 [&_ul]:mb-4 [&_ul]:space-y-1.5 [&_li]:text-muted-foreground",
  "[&_a]:underline [&_a]:underline-offset-2 [&_a]:text-foreground",
  "[&_code]:text-sm [&_code]:bg-muted [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:rounded",
].join(" ");
