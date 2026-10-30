// NFC and QR review cards. Ordering returns in Phase 2.
import { createFileRoute } from "@tanstack/react-router";
import { PublicLayout } from "../components/site/PublicLayout";

export const Route = createFileRoute("/cards")({
  head: () => ({ meta: [{ title: "Review cards | RepSuites" }] }),
  component: () => (
    <PublicLayout>
      <section className="max-w-2xl mx-auto px-4 py-16 space-y-4">
        <h1 className="text-3xl md:text-4xl font-bold">Review cards and table stands</h1>
        <p className="text-muted-foreground">
          A tap or a scan takes your customer straight to your Google review page. Cards and stands
          are printed with your branding and work with every phone.
        </p>
        <p className="text-muted-foreground">
          Already have RepSuites cards? They keep working. To order more, request your free
          visibility check and mention cards, and we will be in touch.
        </p>
        <a
          href="/#check"
          className="inline-block rounded-xl bg-primary text-primary-foreground font-bold px-5 py-3"
        >
          Get in touch
        </a>
      </section>
    </PublicLayout>
  ),
});
