// The delivered Fix-It Pack (/fix/pack/<key>). Every part has a copy button,
// then the steps in order. The key is a long random code, so only the buyer
// (and their email) has the link. No em dashes (AGENTS.md).
import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { Logo } from "../components/site/Logo";
import { getFixitPack } from "../lib/fixit.functions";

export const Route = createFileRoute("/fix/pack/$key")({
  loader: ({ params }) => getFixitPack({ data: { key: params.key } }),
  head: () => ({
    meta: [{ title: "Your Fix-It Pack | RepSuites" }, { name: "robots", content: "noindex" }],
  }),
  component: PackPage,
});

function CopyBtn({ text }: { text: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        void navigator.clipboard?.writeText(text).then(() => {
          setDone(true);
          setTimeout(() => setDone(false), 1800);
        });
      }}
      className="btn btn-ghost shrink-0 px-4 text-base"
    >
      {done ? (
        <Check className="h-4 w-4 text-success" aria-hidden />
      ) : (
        <Copy className="h-4 w-4" aria-hidden />
      )}
      {done ? "Copied" : "Copy"}
    </button>
  );
}

function Block({ title, text, n }: { title: string; text: string; n?: number }) {
  return (
    <div className="card p-5 sm:p-6 space-y-3">
      <div className="flex items-start justify-between gap-3 border-b border-border pb-3">
        <h3 className="font-sans font-bold text-lg tracking-normal self-center">
          {n ? `${n}. ${title}` : title}
        </h3>
        <CopyBtn text={text} />
      </div>
      <p className="whitespace-pre-line">{text}</p>
    </div>
  );
}

function PackPage() {
  const data = Route.useLoaderData();
  const { key } = Route.useParams();
  if (!data)
    return (
      <main className="max-w-xl mx-auto px-4 py-16 space-y-3">
        <h1 className="text-2xl font-semibold">This pack is not ready yet</h1>
        <p>It usually takes a few minutes. Refresh this page shortly, or check your email.</p>
      </main>
    );
  const { pack, business } = data;
  return (
    <div className="min-h-screen bg-background text-foreground text-base leading-relaxed">
      <header className="border-b border-border/70 bg-background/80 backdrop-blur-md">
        <div className="max-w-3xl mx-auto px-4 h-16 flex items-center">
          <Logo />
        </div>
      </header>
      <main className="max-w-2xl mx-auto px-4 py-10 sm:py-16 space-y-12">
        <section className="space-y-3">
          <p className="eyebrow">Your Google Fix-It Pack</p>
          <h1 className="text-3xl sm:text-4xl font-semibold leading-tight">
            {business ? `Ready for ${business}` : "Your fixes are ready"}
          </h1>
          <p className="text-lg text-muted-foreground">
            Open your Google Business Profile in another tab, then work down this page. Most owners
            finish in about 20 minutes.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-2xl font-semibold">Do it in this order</h2>
          <ol className="card divide-y divide-border">
            {pack.checklist.map((c, i) => (
              <li key={c} className="flex gap-3 p-4 sm:px-5">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-navy text-sm font-bold text-white">
                  {i + 1}
                </span>
                <span>{c}</span>
              </li>
            ))}
          </ol>
        </section>

        <section className="space-y-4">
          <h2 className="text-2xl font-semibold">Your business description</h2>
          <Block title="Paste into: Edit profile, then Description" text={pack.description} />
        </section>

        <section className="space-y-4">
          <h2 className="text-2xl font-semibold">Your categories</h2>
          <Block title="Primary category" text={pack.primaryCategory} />
          <Block title="Additional categories" text={pack.extraCategories.join("\n")} />
        </section>

        <section className="space-y-4">
          <h2 className="text-2xl font-semibold">Your services</h2>
          {pack.services.map((s) => (
            <Block key={s.name} title={s.name} text={s.description} />
          ))}
        </section>

        <section className="space-y-4">
          <h2 className="text-2xl font-semibold">Your 4 Google posts</h2>
          <p className="text-muted-foreground">Post one each week, with a photo of your work.</p>
          {pack.posts.map((p, i) => (
            <Block key={i} n={i + 1} title={`Week ${i + 1}`} text={p} />
          ))}
        </section>

        <section className="space-y-4">
          <h2 className="text-2xl font-semibold">Review replies you can reuse</h2>
          <p className="text-muted-foreground">Swap [Name] for the reviewer's first name.</p>
          {pack.replies.map((r) => (
            <Block key={r.when} title={r.when} text={r.reply} />
          ))}
        </section>

        <section className="surface-navy rounded-3xl p-6 sm:p-8 space-y-4 shadow-[var(--shadow-lift)]">
          <p className="eyebrow !text-primary">Your bonus</p>
          <h2 className="text-2xl font-semibold">Turn on your free month of RepSuites Growth</h2>
          <p className="text-white/85">
            It asks your customers for reviews by text and email, writes your review replies and
            reruns your Google check, so these fixes keep working. Normally £49. No card needed.
            After 30 days you choose to keep it or stay on the free plan.
          </p>
          <Link to="/start" search={{ bonus: key }} className="btn btn-gold btn-lg w-full">
            Turn on my free month
          </Link>
          <p className="text-sm text-white/75">
            Something not right? Reply to the email we sent you and we will fix it.
          </p>
        </section>
      </main>
    </div>
  );
}
