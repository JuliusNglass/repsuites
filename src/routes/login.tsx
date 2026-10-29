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
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4 sm:p-6">
      <a href="/" className="mb-6">
        <img src="/logo-full.png" alt="RepSuites" className="h-9 w-auto" />
      </a>
      <SignInCard isConfigured={status.isConfigured} missingMessage={status.missingMessage} />
      <p className="mt-6 text-xs text-muted-foreground">
        <a href="/forgot-password" className="underline">Forgot your password?</a>
      </p>
    </div>
  );
}
