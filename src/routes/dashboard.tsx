// Signed-in home: pick the business (agency staff can open any of them),
// then its Google profile, reviews, posts and performance.
// No em dashes in this copy (AGENTS.md).
import { RequestsPanel } from "../components/reviews/RequestsPanel";
import { Logo } from "../components/site/Logo";
import { createFileRoute, useNavigate, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  BarChart3,
  Building2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Home,
  LogOut,
  Megaphone,
  MoreHorizontal,
  Plus,
  QrCode,
  Search,
  Settings,
  Star,
  Users,
} from "lucide-react";
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
import { AccountingCard } from "../components/reviews/AccountingCard";
import { PastCustomersCard } from "../components/reviews/PastCustomersCard";
import { HomeSummary } from "../components/reviews/HomeSummary";

export const Route = createFileRoute("/dashboard")({
  head: () => ({ meta: [{ title: "Dashboard | RepSuites" }] }),
  loader: async () => listMyBusinesses(),
  component: Dashboard,
});

// Four tabs; the less used pages live under More. Old #hash links still work.
const TABS = [
  { id: "home", label: "Home", icon: Home },
  { id: "ask", label: "Customers", icon: Users },
  { id: "reviews", label: "Reviews", icon: Star },
  { id: "more", label: "More", icon: MoreHorizontal },
] as const;
const MORE = [
  { id: "qr", label: "QR card and review link", icon: QrCode },
  { id: "results", label: "Results and Google ranking", icon: BarChart3 },
  { id: "posts", label: "Google posts and print card", icon: Megaphone },
  { id: "settings", label: "Account, billing and Google", icon: Settings },
] as const;
type TabId = (typeof TABS)[number]["id"] | (typeof MORE)[number]["id"];
const ALL_IDS: string[] = [...TABS, ...MORE].map((t) => t.id);
const navOf = (t: TabId) => (MORE.some((m) => m.id === t) ? "more" : t);

function Dashboard() {
  const s = Route.useLoaderData();
  const navigate = useNavigate();
  const router = useRouter();
  const out = useServerFn(signOut);
  const choose = useServerFn(selectTenant);
  const [picking, setPicking] = useState(false);
  const [adding, setAdding] = useState(false);
  const [tab, setTabState] = useState<TabId>(() => {
    if (typeof window === "undefined") return "home";
    const h = window.location.hash.slice(1);
    return ALL_IDS.includes(h) ? (h as TabId) : "home";
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
            className="inline-flex items-center min-h-11 rounded-lg bg-primary text-primary-foreground font-semibold px-4 py-2"
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
      <header className="border-b border-border/70 bg-background/80 backdrop-blur-md px-4 h-16 flex items-center justify-between gap-3">
        <a
          href="/"
          className="shrink-0 inline-flex items-center min-h-11"
          aria-label="RepSuites home"
        >
          <Logo compact={many} />
        </a>
        <div className="flex items-center gap-3 min-w-0">
          {many && (
            <button
              type="button"
              onClick={() => setPicking((v) => !v)}
              className="min-w-0 inline-flex items-center gap-2 rounded-lg border border-border px-3 py-1.5 text-base"
            >
              <Building2 className="w-4 h-4 shrink-0" />
              <span className="truncate max-w-[40vw] sm:max-w-xs">
                {active?.name ?? "Choose a business"}
              </span>
              <ChevronDown className="w-4 h-4 shrink-0" />
            </button>
          )}
          {s.agency && (
            <a href="/prospects" className="text-base font-semibold shrink-0">
              Prospects
            </a>
          )}
          <button
            type="button"
            className="text-base text-muted-foreground shrink-0"
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
                  className="inline-flex items-center gap-1 rounded-lg border border-border bg-background px-3 py-2 text-base font-semibold"
                >
                  <Plus className="w-4 h-4" />
                  Add a business
                </button>
              ))}
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-3 text-muted-foreground" />
              <input
                autoFocus
                aria-label="Search your businesses"
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
                    className={`w-full text-left px-3 py-2.5 text-base hover:bg-muted ${
                      b.id === s.activeId ? "font-semibold" : ""
                    }`}
                  >
                    {b.name}
                  </button>
                </li>
              ))}
              {filtered.length === 0 && (
                <li className="px-3 py-2.5 text-base text-muted-foreground">No match.</li>
              )}
            </ul>
          </div>
        </div>
      )}

      {active && (
        <nav
          aria-label="Sections"
          className="hidden sm:block sticky top-0 z-10 border-b border-border bg-background/85 backdrop-blur-md backdrop-saturate-150"
        >
          <div className="max-w-3xl mx-auto px-4 flex gap-1">
            {TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                aria-current={navOf(tab) === t.id ? "page" : undefined}
                className={`min-h-12 px-4 py-3 text-base font-semibold border-b-[3px] transition-colors ${
                  navOf(tab) === t.id
                    ? "border-primary text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </nav>
      )}
      {active && (
        <nav
          aria-label="Sections"
          className="sm:hidden fixed bottom-0 inset-x-0 z-20 border-t border-border bg-background/95 backdrop-blur-md pb-[env(safe-area-inset-bottom)]"
        >
          <div className="grid grid-cols-4">
            {TABS.map((t) => {
              const on = navOf(tab) === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setTab(t.id)}
                  aria-current={on ? "page" : undefined}
                  className={`min-h-16 flex flex-col items-center justify-center gap-1 text-sm font-semibold transition-colors ${
                    on ? "text-foreground" : "text-muted-foreground"
                  }`}
                >
                  <t.icon
                    className={`w-6 h-6 transition-transform ${on ? "scale-110" : ""}`}
                    aria-hidden="true"
                  />
                  {t.label}
                </button>
              );
            })}
          </div>
        </nav>
      )}

      <main className="max-w-3xl mx-auto px-4 pt-6 pb-28 sm:px-6 sm:py-8 space-y-6">
        <div className="space-y-1">
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">
            {active?.name ?? "Welcome back"}
          </h1>
          <p className="text-base text-muted-foreground">
            Signed in as {s.email}
            {s.agency ? " (Accelur8 team)" : ""}
          </p>
        </div>
        {!s.agency && <EmailCheckBar />}
        {!active && <p className="text-muted-foreground">Choose a business to get started.</p>}
        {active && welcome && !s.agency && tab === "home" && (
          <WelcomeCard
            key={`w-${active.id}`}
            business={active.name}
            googleConnected={s.googleConnected}
            qrDownloaded={s.qrDownloaded}
            welcome={welcome}
            onTab={setTab}
          />
        )}
        {active && tab === "home" && (
          <HomeSummary
            key={`h-${active.id}`}
            googleConnected={s.googleConnected}
            qrDownloaded={s.qrDownloaded}
            onTab={setTab}
          />
        )}
        {active && tab === "more" && (
          <ul className="divide-y divide-border rounded-2xl border border-border bg-card">
            {MORE.map((m) => (
              <li key={m.id}>
                <button
                  type="button"
                  onClick={() => setTab(m.id)}
                  className="w-full min-h-14 flex items-center gap-3 px-4 py-3 text-left text-base"
                >
                  <m.icon className="w-5 h-5 shrink-0" aria-hidden="true" />
                  <span className="flex-1">{m.label}</span>
                  <ChevronRight className="w-4 h-4 text-muted-foreground" aria-hidden="true" />
                </button>
              </li>
            ))}
            <li>
              <button
                type="button"
                onClick={async () => {
                  await out();
                  navigate({ to: "/" });
                }}
                className="w-full min-h-14 flex items-center gap-3 px-4 py-3 text-left text-base text-muted-foreground"
              >
                <LogOut className="w-5 h-5 shrink-0" aria-hidden="true" /> Sign out
              </button>
            </li>
          </ul>
        )}
        {active && navOf(tab) === "more" && tab !== "more" && (
          <button
            type="button"
            onClick={() => setTab("more")}
            className="inline-flex items-center gap-1 min-h-11 text-base font-semibold text-muted-foreground"
          >
            <ChevronLeft className="w-4 h-4" aria-hidden="true" /> More
          </button>
        )}
        {active && tab === "reviews" && (
          <>
            <div
              role="group"
              aria-label="Which reviews to show"
              className="inline-flex rounded-xl bg-muted p-1 text-base font-semibold"
            >
              <button
                type="button"
                onClick={() => setInbox("google")}
                aria-pressed={inbox === "google"}
                className={`min-h-10 rounded-lg px-4 py-1.5 transition-colors ${inbox === "google" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"}`}
              >
                Google reviews
              </button>
              <button
                type="button"
                onClick={() => setInbox("private")}
                aria-pressed={inbox === "private"}
                className={`min-h-10 rounded-lg px-4 py-1.5 transition-colors ${inbox === "private" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"}`}
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
        {active && tab === "ask" && <PastCustomersCard key={`past-${active.id}`} />}
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
        {active && tab === "settings" && <AccountingCard key={`ac-${active.id}`} />}
        {active && tab === "settings" && <AccessHelpCard key={`a-${active.id}`} />}
      </main>
    </div>
  );
}
