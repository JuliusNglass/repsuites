// Signed-in home. Phase 1 shell: shows who is signed in. The reviews,
// Google and ranking tools arrive in Phase 2.
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { getSessionInfo, signOut } from "../lib/auth.functions";

export const Route = createFileRoute("/dashboard")({
  head: () => ({ meta: [{ title: "Dashboard | RepSuites" }] }),
  loader: async () => getSessionInfo(),
  component: Dashboard,
});

function Dashboard() {
  const s = Route.useLoaderData();
  const navigate = useNavigate();
  const out = useServerFn(signOut);
  if (!s.ok) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 text-center">
        <div>
          <p className="mb-4">Please log in to continue.</p>
          <a href="/login" className="rounded-lg bg-primary text-primary-foreground font-semibold px-4 py-2">
            Log in
          </a>
        </div>
      </div>
    );
  }
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border px-4 h-16 flex items-center justify-between">
        <img src="/logo-full.png" alt="RepSuites" className="h-8 w-auto" />
        <button
          type="button"
          className="text-sm text-muted-foreground"
          onClick={async () => {
            await out();
            navigate({ to: "/" });
          }}
        >
          Sign out
        </button>
      </header>
      <main className="max-w-3xl mx-auto p-6 space-y-4">
        <h1 className="text-2xl font-bold">Welcome back</h1>
        <p className="text-muted-foreground">Signed in as {s.email}.</p>
        <div className="rounded-xl border border-border bg-card p-5">
          <p className="font-semibold mb-1">We are moving RepSuites to a faster home</p>
          <p className="text-sm text-muted-foreground">
            Your account and your QR codes have come across. Your reviews inbox, Google tools and
            reports will appear here shortly. Your printed review cards keep working throughout.
          </p>
        </div>
      </main>
    </div>
  );
}
