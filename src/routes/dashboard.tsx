// Signed-in home: pick the business (agency staff can open any of them),
// then its Google profile, reviews, posts and performance.
// No em dashes in this copy (AGENTS.md).
import { RequestsPanel } from "../components/reviews/RequestsPanel";
import { Logo } from "../components/site/Logo";
import { createFileRoute, useNavigate, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Building2, ChevronDown, ChevronRight, Plus, Search } from "lucide-react";
import { selectTenant, signOut } from "../lib/auth.functions";
import { listMyBusinesses } from "../lib/businesses.functions";
import { GooglePanel } from "../components/reviews/GooglePanel";
import { PrintCardButton, QrCodesCard } from "../components/reviews/QrCodesCard";
import { ReviewLinksCard } from "../components/reviews/ReviewLinksCard";
import { WelcomeCard } from "../components/reviews/WelcomeCard";
import { EmailCheckBar } from "../components/reviews/EmailCheckBar";
import { BillingCard } from "../components/reviews/BillingCard";
import { AccessHelpCard } from "../components/reviews/AccessHelpCard";
import { AddBusinessForm } from "../components/agency/AddBusinessForm";

export const Route = createFileRoute("/dashboard")({
  head: () => ({ meta: [{ title: "Dashboard | RepSuites" }] }),
  loader: async () => listMyBusinesses(),
  component: Dashboard,
});

const TABS = [
  { id: "reviews", label: "Reviews" },
  { id: "qr", label: "QR card" },
  { id: "ask", label: "Ask" },
  { id: "results", label: "Results" },
  { id: "posts", label: "Posts" },
  { id: "settings", label: "Settings" },
] as const;
type TabId = (typeof TABS)[number]["id"];

function Dashboard() {
  const s = Route.useLoaderData();
  const navigate = useNavigate();
  const router = useRouter();
  const out = useServerFn(signOut);
  const choose = useServerFn(selectTenant);
  const [picking, setPicking] = useState(false);
  const [adding, setAdding] = useState(false);
  const [tab, setTabState] = useState<TabId>(() => {
    if (typeof window === "undefined") return "reviews";
    const h = window.location.hash.slice(1);
    return TABS.some((t) => t.id === h) ? (h as TabId) : "reviews";
  });
  const setTab = (t: TabId) => {
    setTabState(t);
    window.history.replaceState(null, "", `#${t}`);
    window.scrollTo({ top: 0 });
  };
  const [inbox, setInbox] = useState<"google" | "private">("google");
  const [welcome] = useState(
    () => typeof window !== "undefined" && window.location.search.includes("welcome=1"),
  );
  const [q, setQ] = useState("");
  // Phones: the tab bar scrolls sideways; a fade and arrow on the right show
  // there is more until the end is reached.
  const tabBar = useRef<HTMLDivElement>(null);
  const [moreTabs, setMoreTabs] = useState(false);
  const checkTabs = () => {
    const el = tabBar.current;
    if (el) setMoreTabs(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
  };
  useEffect(() => {
    checkTabs();
    window.addEventListener("resize", checkTabs);
    return () => window.removeEventListener("resize", checkTabs);
  });

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
  const many = list.length > 1 || s.agency;

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
          <Logo />
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
          {s.agency && (
            <a href="/prospects" className="text-sm font-semibold shrink-0">
              Prospects
            </a>
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
            {s.agency &&
              (adding ? (
                <AddBusinessForm
                  onCancel={() => setAdding(false)}
                  onDone={async (id) => {
                    setAdding(false);
                    await switchTo(id);
                  }}
                />
              ) : (
                <button
                  type="button"
                  onClick={() => setAdding(true)}
                  className="inline-flex items-center gap-1 rounded-lg border border-border bg-background px-3 py-2 text-sm font-semibold"
                >
                  <Plus className="w-4 h-4" />
                  Add a business
                </button>
              ))}
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

      {active && (
        <nav className="sticky top-0 z-10 border-b border-border bg-background/95 backdrop-blur">
          <div className="relative max-w-4xl mx-auto">
            <div
              ref={tabBar}
              onScroll={checkTabs}
              className="px-2 sm:px-4 flex gap-1 overflow-x-auto no-scrollbar scroll-smooth"
            >
              {TABS.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setTab(t.id)}
                  className={`shrink-0 px-3 py-3 text-sm font-semibold border-b-2 ${
                    tab === t.id
                      ? "border-primary text-foreground"
                      : "border-transparent text-muted-foreground"
                  }`}
                >
                  {t.label}
                </button>
              ))}
              <span className="shrink-0 w-6" aria-hidden="true" />
            </div>
            {moreTabs && (
              <button
                type="button"
                aria-label="More tabs"
                onClick={() => tabBar.current?.scrollBy({ left: 160 })}
                className="absolute right-0 top-0 bottom-0 w-12 flex items-center justify-end pr-1 bg-gradient-to-l from-background via-background/90 to-transparent text-muted-foreground"
              >
                <ChevronRight className="w-5 h-5" />
              </button>
            )}
          </div>
        </nav>
      )}

      <main className="max-w-4xl mx-auto p-4 sm:p-6 space-y-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold">{active?.name ?? "Welcome back"}</h1>
          <p className="text-xs sm:text-sm text-muted-foreground">
            Signed in as {s.email}
            {s.agency ? " (Accelur8 team)" : ""}
          </p>
        </div>
        {!s.agency && <EmailCheckBar />}
        {!active && <p className="text-muted-foreground">Choose a business to get started.</p>}
        {active && s.plan === "free" && !s.agency && (tab === "reviews" || welcome) && (
          <WelcomeCard
            key={`w-${active.id}`}
            business={active.name}
            googleConnected={s.googleConnected}
            qrDownloaded={s.qrDownloaded}
            welcome={welcome}
            onTab={setTab}
          />
        )}
        {active && tab === "reviews" && (
          <>
            <div className="inline-flex rounded-lg border border-border p-0.5 text-xs font-semibold">
              <button
                type="button"
                onClick={() => setInbox("google")}
                className={`rounded-md px-3 py-1.5 ${inbox === "google" ? "bg-muted" : ""}`}
              >
                Google reviews
              </button>
              <button
                type="button"
                onClick={() => setInbox("private")}
                className={`rounded-md px-3 py-1.5 ${inbox === "private" ? "bg-muted" : ""}`}
              >
                Private messages
              </button>
            </div>
            {inbox === "google" ? (
              <GooglePanel key={`r-${active.id}`} tab="reviews" />
            ) : (
              <ReviewLinksCard key={`f-${active.id}`} part="feedback" />
            )}
          </>
        )}
        {active && tab === "ask" && <RequestsPanel key={`a-${active.id}`} />}
        {active && tab === "results" && <GooglePanel key={`g-${active.id}`} tab="results" />}
        {active && tab === "posts" && (
          <>
            <PrintCardButton key={`pc-${active.id}`} business={active.name} />
            <GooglePanel key={`p-${active.id}`} tab="posts" />
          </>
        )}
        {active && tab === "qr" && (
          <>
            <QrCodesCard key={`qr-${active.id}`} business={active.name} />
            <ReviewLinksCard key={`l-${active.id}`} part="links" />
          </>
        )}
        {active && tab === "settings" && !s.agency && <BillingCard key={`b-${active.id}`} />}
        {active && tab === "settings" && <GooglePanel key={`s-${active.id}`} tab="settings" />}
        {active && tab === "settings" && <AccessHelpCard key={`a-${active.id}`} />}
      </main>
    </div>
  );
}
