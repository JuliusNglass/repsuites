import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";

import appCss from "../styles.css?url";
import { reportVibeError } from "../lib/vibe-error-reporting";
import { Toaster } from "../components/ui/sonner";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    try {
      reportVibeError(error, { boundary: "tanstack_root_error_component" });
    } catch {
      // Never let error reporting itself throw and cause a render loop.
    }
  }, [error]);

  let errorMessage = "";
  let errorStack: string | undefined;
  try {
    if (error instanceof Error) {
      errorMessage = error.message || "";
      errorStack = error.stack;
    } else if (typeof error === "string") {
      errorMessage = error;
    } else if (error && typeof error === "object" && "message" in error) {
      errorMessage = String((error as any).message || "");
    } else {
      errorMessage = String(error || "");
    }
    // Truncate very long stacks to avoid blowing up the DOM.
    if (errorStack && errorStack.length > 2000) {
      errorStack = errorStack.slice(0, 2000) + "\n...[truncated]";
    }
  } catch {
    errorMessage = "An unexpected error occurred.";
    errorStack = undefined;
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          This page didn't load
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Something went wrong on our end. You can try refreshing or head back home.
        </p>
        {errorMessage && (
          <div className="mt-4 p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-xs text-left overflow-auto max-h-48 font-mono">
            <p className="font-semibold mb-1">Error details:</p>
            <p className="break-words">{errorMessage}</p>
            {errorStack && (
              <pre className="mt-2 text-[10px] text-destructive/80 whitespace-pre-wrap">
                {errorStack}
              </pre>
            )}
          </div>
        )}
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            type="button"
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Try again
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Go home
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "RepSuites: get found and chosen locally" },
      {
        name: "description",
        content:
          "RepSuites helps local businesses get found on Google and in AI search, win more reviews and turn searches into customers.",
      },
      { name: "author", content: "Accelur8" },
      { property: "og:title", content: "RepSuites: get found and chosen locally" },
      {
        property: "og:description",
        content:
          "RepSuites helps local businesses get found on Google and in AI search, win more reviews and turn searches into customers.",
      },
      { property: "og:type", content: "website" },
      { property: "og:site_name", content: "RepSuites" },
      { property: "og:url", content: "https://repsuites.com/" },
      // Versioned so WhatsApp, Facebook and LinkedIn fetch the new image.
      { property: "og:image", content: "https://repsuites.com/og-image.png?v=2" },
      { property: "og:image:width", content: "1200" },
      { property: "og:image:height", content: "630" },
      {
        property: "og:image:alt",
        content: "RepSuites: more local customers finding you and choosing you",
      },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:image", content: "https://repsuites.com/og-image.png?v=2" },
      { name: "theme-color", content: "#001938" },
    ],
    links: [
      { rel: "icon", href: "/favicon.ico?v=2", sizes: "any" },
      { rel: "icon", href: "/favicon.png?v=2", type: "image/png" },
      { rel: "apple-touch-icon", href: "/apple-touch-icon.png?v=2" },
      { rel: "manifest", href: "/site.webmanifest" },
      {
        rel: "stylesheet",
        href: appCss,
      },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();

  // GoTrue recovery links carry #access_token=...&type=recovery in the hash.
  // If the Supabase project's Site URL sends the link to "/" (or any page
  // other than /reset-password), detect the recovery token here and redirect
  // to the dedicated reset-password page so the form can handle it. This
  // replaces supabase.auth.onAuthStateChange("PASSWORD_RECOVERY") because
  // this project uses server-only auth (no browser Supabase client).
  useEffect(() => {
    if (typeof window === "undefined") return;
    const hash = window.location.hash;
    if (!hash) return;
    const params = new URLSearchParams(hash.replace(/^#/, ""));
    const type = params.get("type");
    if (
      (type === "recovery" || type === "password_recovery") &&
      window.location.pathname !== "/reset-password"
    ) {
      window.location.replace(`/reset-password${hash}`);
    }
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      {/* Required: nested routes render here. Removing <Outlet /> breaks all child routes. */}
      <Outlet />
      {/* Shows the toast() messages used across the app. */}
      <Toaster position="top-center" richColors closeButton />
    </QueryClientProvider>
  );
}
