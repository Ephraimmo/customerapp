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
import { reportLovableError } from "../lib/lovable-error-reporting";
import { CartProvider } from "@/lib/cart";
import { AuthProvider } from "@/lib/auth";
import { LocationProvider } from "@/lib/location";
import { Toaster } from "@/components/ui/sonner";
import { TopNav } from "@/components/app/top-nav";
import { HearthLogo } from "@/components/app/logo";
import { BottomNav } from "@/components/app/bottom-nav";
import { CartBar } from "@/components/app/cart-bar";
import { useLiveSync } from "@/lib/firebase-adapters";
import { initPerfLogging } from "@/lib/perf-log";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <HearthLogo className="mb-8 justify-center" />
        <h1 className="text-7xl font-black tracking-tight text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-black tracking-tight text-foreground">Page not found</h2>
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
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <HearthLogo className="mb-8 justify-center" />
        <h1 className="text-xl font-black tracking-tight text-foreground">This page didn't load</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Something went wrong on our end. You can try refreshing or head back home.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 cursor-pointer"
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
      { name: "theme-color", content: "#fb4500" },
      { name: "apple-mobile-web-app-title", content: "Hearth" },
      { name: "application-name", content: "Hearth" },
      { title: "Hearth — Food delivery from local kitchens" },
      {
        name: "description",
        content: "Order from nearby restaurants, customize dishes and track delivery live.",
      },
      { property: "og:title", content: "Hearth — Food delivery" },
      {
        property: "og:description",
        content: "Order from nearby restaurants and track your delivery live.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [
      {
        rel: "stylesheet",
        href: appCss,
      },
      { rel: "icon", href: "/favicon.svg", type: "image/svg+xml" },
      { rel: "alternate icon", href: "/favicon.ico", type: "image/x-icon" },
      { rel: "apple-touch-icon", href: "/favicon.svg" },
      { rel: "mask-icon", href: "/logo-mark.svg", color: "#fb4500" },
      { rel: "manifest", href: "/site.webmanifest" },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Inter:opsz,wght@14..32,100..900&family=JetBrains+Mono:wght@100..800&display=swap",
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

function FirebaseSync() {
  useLiveSync();
  useEffect(() => {
    initPerfLogging();
  }, []);
  return null;
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <LocationProvider>
          <CartProvider>
            <FirebaseSync />
            <TopNav />
            <main>
              {/* Required: nested routes render here. Removing <Outlet /> breaks all child routes. */}
              <Outlet />
            </main>
            {/*
              The fixed bottom chrome lives here, outside the Outlet, so it survives
              navigation instead of unmounting and remounting with every page. Each
              component decides which routes it appears on.
            */}
            <CartBar />
            <BottomNav />
            <Toaster position="top-center" />
          </CartProvider>
        </LocationProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}
