// Link-in-bio page for TikTok, Instagram, Facebook and YouTube Shorts.
// One tap per offer, each tagged so we can see which app sent the lead.
// Sold as Accelur8. No em dashes (AGENTS.md).
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { ArrowRight, ClipboardCheck, Clapperboard } from "lucide-react";

export const Route = createFileRoute("/go")({
  validateSearch: z.object({ src: z.string().max(20).optional() }),
  head: () => ({
    meta: [
      { title: "Accelur8 | Start here" },
      {
        name: "description",
        content:
          "More Google reviews, a stronger cleaning business, and videos without being on camera.",
      },
    ],
  }),
  component: GoPage,
});

function GoPage() {
  const { src } = Route.useSearch();
  const s = (src ?? "bio").replace(/[^a-z0-9-]/gi, "").toLowerCase() || "bio";
  const utm = (content: string) =>
    `utm_source=${encodeURIComponent(s)}&utm_medium=social&utm_content=${content}`;
  const links = [
    {
      href: `https://ops.accelur8clientwork.com/scorecard?${utm("scorecard")}`,
      icon: ClipboardCheck,
      title: "Run a cleaning business? Find your bottleneck",
      sub: "Free 2-minute scorecard",
    },
    {
      href: `https://repsuites.com/videos?${utm("videos")}`,
      icon: Clapperboard,
      title: "Videos for your business, no face needed",
      sub: "From £50",
    },
  ];
  return (
    <div className="min-h-screen bg-background text-foreground text-base leading-relaxed">
      <main className="max-w-md mx-auto px-4 py-10 space-y-6">
        <div className="text-center space-y-2 animate-in fade-in slide-in-from-bottom-2">
          <p className="font-extrabold text-2xl tracking-tight">
            Accelur<span className="text-gold">8</span>
          </p>
          <p className="text-muted-foreground">Pick what you need today.</p>
        </div>
        <ul className="space-y-3">
          {links.map((l, i) => (
            <li
              key={l.title}
              className="animate-in fade-in slide-in-from-bottom-2"
              style={{ animationDelay: `${(i + 1) * 80}ms`, animationFillMode: "both" }}
            >
              <a
                href={l.href}
                className="card p-4 flex items-center gap-4 transition-transform hover:-translate-y-0.5 active:scale-[0.99] focus-visible:outline focus-visible:outline-2 focus-visible:outline-gold"
              >
                <span className="h-11 w-11 shrink-0 rounded-full bg-gold/20 grid place-items-center">
                  <l.icon className="h-5 w-5" aria-hidden />
                </span>
                <span className="flex-1">
                  <span className="block font-semibold">{l.title}</span>
                  <span className="block text-sm text-muted-foreground">{l.sub}</span>
                </span>
                <ArrowRight className="h-5 w-5 text-muted-foreground" aria-hidden />
              </a>
            </li>
          ))}
        </ul>
      </main>
    </div>
  );
}
