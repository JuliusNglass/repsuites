// After a Fix-It Pack payment. Confirms what happens next, then offers the
// monthly plan as the natural next step. No em dashes (AGENTS.md).
import { createFileRoute, Link } from "@tanstack/react-router";
import { z } from "zod";
import { CheckCircle2 } from "lucide-react";
import { Logo } from "../components/site/Logo";

export const Route = createFileRoute("/fix/thanks")({
  validateSearch: z.object({ r: z.string().optional() }),
  head: () => ({
    meta: [{ title: "Thank you | RepSuites" }, { name: "robots", content: "noindex" }],
  }),
  component: Thanks,
});

function Thanks() {
  const { r } = Route.useSearch();
  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col text-base leading-relaxed">
      <header className="border-b border-border">
        <div className="max-w-3xl mx-auto px-4 h-16 flex items-center">
          <Logo />
        </div>
      </header>
      <main className="flex-1 w-full max-w-xl mx-auto px-4 py-10 space-y-8">
        <section className="space-y-3">
          <CheckCircle2 className="h-12 w-12 text-primary" aria-hidden />
          <h1 className="text-3xl font-bold">Thank you. We are on it.</h1>
          <p className="text-lg text-muted-foreground">
            Your payment went through and a receipt is on its way. We will send your Google fixes by
            email and WhatsApp within 48 hours (working days).
          </p>
        </section>
        <section className="rounded-2xl border-2 border-primary bg-card p-5 sm:p-6 space-y-3">
          <p className="font-semibold text-primary">While you wait</p>
          <h2 className="text-2xl font-bold">Keep the reviews coming in, every week</h2>
          <p>
            Fixing your profile gets you seen. Steady new reviews keep you there. RepSuites sends
            review requests for you, gives you a QR card for the counter or van, and reruns your
            Google check each month so you can see the change.
          </p>
          <Link
            to="/start"
            search={r ? { r } : {}}
            className="flex min-h-14 w-full items-center justify-center rounded-full bg-primary px-6 text-lg font-bold text-primary-foreground"
          >
            Start free
          </Link>
          <p className="text-center text-sm text-muted-foreground">
            Free review page and QR code. No card needed.{" "}
            <Link to="/pricing" className="underline">
              See plans
            </Link>
          </p>
        </section>
      </main>
    </div>
  );
}
