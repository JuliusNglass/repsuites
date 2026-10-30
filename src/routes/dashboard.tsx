// Signed-in home: pick the business (agency staff can open any of them),
// then its Google profile, reviews, posts and performance.
// No em dashes in this copy (AGENTS.md).
import { createFileRoute, useNavigate, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Building2, ChevronDown, Search } from "lucide-react";
import { selectTenant, signOut } from "../lib/auth.functions";
import { listMyBusinesses } from "../lib/businesses.functions";
import { GooglePanel } from "../components/reviews/GooglePanel";
import { QrCodesCard } from "../components/reviews/QrCodesCard";
import { ReviewLinksCard } from "../components/reviews/ReviewLinksCard";

export const Route = createFileRoute("/dashboard")({
  head: () => ({ meta: [{ title: "Dashboard | RepSuites" }] }),
  loader: async () => listMyBusinesses(),
  component: Dashboard,
});

function Dashboard() {
  const s = Route.useLoaderData();
  const navigate = useNavigate();
  const router = useRouter();
  const out = useServerFn(signOut);
  const choose = useServerFn(selectTenant);
  const [picking, setPicking] = useState(false);
  const [q, setQ] = useState("");

  const list = s.ok ? s.businesses : [];
  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    return t ? list.filter((b) => b.name.toLowerCase().includes(t)) : list;
  }, [q, list]);

  if (!s.ok) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 text-center">
        <div>
          <p className="mb-4">Please log in to continue.</p>
          <a
            href="/login"
            className="rounded-lg bg-primary text-primary-foreground font-semibold px-4 py-2"
          >
            Log in
          </a>
        </div>
      </div>
    );
  }

  const active = list.find((b) => b.id === s.activeId) ?? null;
  const many = list.length > 1;

  const switchTo = async (id: string) => {
    const r = await choose({ data: { tenant_id: id } });
    if (!r.ok) {
      toast.error(r.error || "Could not open that business.");
      return;
    }
    setPicking(false);
    setQ("");
    await router.invalidate();
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border px-4 h-16 flex items-center justify-between gap-3">
        <a href="/" className="shrink-0">
          <img src="/logo-full.png" alt="RepSuites" className="h-8 w-auto" />
        </a>
        <div className="flex items-center gap-3 min-w-0">
          {many && (
            <button
              type="button"
              onClick={() => setPicking((v) => !v)}
              className="min-w-0 inline-flex items-center gap-2 rounded-lg border border-border px-3 py-1.5 text-sm"
            >
              <Building2 className="w-4 h-4 shrink-0" />
              <span className="truncate max-w-[40vw] sm:max-w-xs">
                {active?.name ?? "Choose a business"}
              </span>
              <ChevronDown className="w-4 h-4 shrink-0" />
            </button>
          )}
          <button
            type="button"
            className="text-sm text-muted-foreground shrink-0"
            onClick={async () => {
              await out();
              navigate({ to: "/" });
            }}
          >
            Sign out
          </button>
        </div>
      </header>

      {picking && (
        <div className="border-b border-border bg-muted/30 px-4 py-4">
          <div className="max-w-3xl mx-auto space-y-3">
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-3 text-muted-foreground" />
              <input
                autoFocus
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder={`Search ${list.length} businesses`}
                className="w-full rounded-lg border border-input bg-background pl-9 pr-3 py-2.5"
              />
            </div>
            <ul className="max-h-80 overflow-y-auto rounded-lg border border-border bg-card divide-y divide-border">
              {filtered.slice(0, 200).map((b) => (
                <li key={b.id}>
                  <button
                    type="button"
                    onClick={() => void switchTo(b.id)}
                    className={`w-full text-left px-3 py-2.5 text-sm hover:bg-muted ${
                      b.id === s.activeId ? "font-semibold" : ""
                    }`}
                  >
                    {b.name}
                  </button>
                </li>
              ))}
              {filtered.length === 0 && (
                <li className="px-3 py-2.5 text-sm text-muted-foreground">No match.</li>
              )}
            </ul>
          </div>
        </div>
      )}

      <main className="max-w-4xl mx-auto p-4 sm:p-6 space-y-5">
        <div>
          <h1 className="text-2xl font-bold">{active?.name ?? "Welcome back"}</h1>
          <p className="text-sm text-muted-foreground">
            Signed in as {s.email}
            {s.agency ? " (Accelur8 team)" : ""}
          </p>
        </div>
        {active ? (
          <>
            <GooglePanel key={active.id} />
            <QrCodesCard key={`qr-${active.id}`} />
            <ReviewLinksCard key={`links-${active.id}`} />
          </>
        ) : (
          <p className="text-muted-foreground">Choose a business to get started.</p>
        )}
      </main>
    </div>
  );
}
