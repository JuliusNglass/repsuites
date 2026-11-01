import { Logo } from "../components/site/Logo";
import { createFileRoute } from "@tanstack/react-router";
import { SignInCard } from "../components/SignInCard";
import { getSystemStatus } from "../lib/system.functions";

export const Route = createFileRoute("/login")({
  head: () => ({ meta: [{ title: "Log in | RepSuites" }] }),
  loader: async () => getSystemStatus(),
  component: LoginPage,
});

function LoginPage() {
  const status = Route.useLoaderData();
  return (
    <main className="min-h-screen bg-background flex flex-col items-center justify-center p-4 sm:p-6">
      <a href="/" className="mb-6 inline-flex items-center min-h-11" aria-label="RepSuites home">
        <Logo />
      </a>
      <SignInCard isConfigured={status.isConfigured} missingMessage={status.missingMessage} />
      <p className="mt-6 text-sm text-muted-foreground">
        <a href="/forgot-password" className="inline-flex min-h-11 items-center underline">
          Forgot your password?
        </a>
      </p>
    </main>
  );
}
