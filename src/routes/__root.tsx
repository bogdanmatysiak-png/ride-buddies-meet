import { QueryClient, QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  useNavigate,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";
import { Menu, X } from "lucide-react";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { Toaster } from "@/components/ui/sonner";
import { supabase } from "@/integrations/supabase/client";
import { useSession, useIsAdmin } from "@/hooks/useAuth";
import { NotificationBell } from "@/components/NotificationBell";

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
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          This page didn't load
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Something went wrong on our end. You can try refreshing or head back home.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
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
      { title: "Motor Trip — umów się na wspólną wyprawę motocyklową" },
      {
        name: "description",
        content:
          "Przeglądaj nadchodzące wyprawy motocyklowe, dołącz do ekipy albo ogłoś własną trasę. Beskidy, Mazury, Bieszczady i wybrzeże.",
      },
      { property: "og:title", content: "Motor Trip — umów się na wspólną wyprawę motocyklową" },
      {
        property: "og:description",
        content: "Przeglądaj nadchodzące wyprawy motocyklowe, dołącz do ekipy albo ogłoś własną trasę. Beskidy, Mazury, Bieszczady i wybrzeże.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: "Motor Trip — umów się na wspólną wyprawę motocyklową" },
      { name: "twitter:description", content: "Przeglądaj nadchodzące wyprawy motocyklowe, dołącz do ekipy albo ogłoś własną trasę. Beskidy, Mazury, Bieszczady i wybrzeże." },
      { property: "og:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/7189800b-7a73-4d1a-9f8f-286f9db0db17/id-preview-23a320f1--b4e20236-8294-4664-a20f-3034c8b138f6.lovable.app-1785574572872.png" },
      { name: "twitter:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/7189800b-7a73-4d1a-9f8f-286f9db0db17/id-preview-23a320f1--b4e20236-8294-4664-a20f-3034c8b138f6.lovable.app-1785574572872.png" },
    ],
    links: [
      {
        rel: "stylesheet",
        href: appCss,
      },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Barlow:wght@400;500;600;700&display=swap",
      },
      { rel: "icon", href: "/favicon.ico", type: "image/x-icon" },
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
  const router = useRouter();

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event !== "SIGNED_IN" && event !== "SIGNED_OUT" && event !== "USER_UPDATED") return;
      router.invalidate();
      if (event !== "SIGNED_OUT") queryClient.invalidateQueries();
    });
    return () => sub.subscription.unsubscribe();
  }, [router, queryClient]);

  return (
    <QueryClientProvider client={queryClient}>
      <div className="min-h-screen bg-background">
        <header className="sticky top-0 z-50 w-full border-b border-border/60 bg-background/85 shadow-sm backdrop-blur">
          <div className="mx-auto grid max-w-3xl grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-4 py-3">
            <Link to="/" className="flex min-w-0 items-center gap-2">
              <span className="h-6 w-1.5 shrink-0 rounded-full bg-primary" />
              <span className="truncate font-display text-2xl tracking-wide text-foreground">
                MOTOR TRIP
              </span>
            </Link>
            <AuthNav />
          </div>
        </header>
        {/* Required: nested routes render here. Removing <Outlet /> breaks all child routes. */}
        <Outlet />
        <footer className="mx-auto flex max-w-3xl flex-col items-center justify-between gap-3 px-4 py-10 text-xs text-muted-foreground sm:flex-row">
          <span>Motor Trip — jeździmy razem, wracamy wszyscy. Kask i ubezpieczenie po twojej stronie.</span>
          <Link
            to="/polityka-prywatnosci"
            className="text-muted-foreground transition-colors hover:text-primary"
          >
            Polityka prywatności
          </Link>
        </footer>
      </div>
      <Toaster />
    </QueryClientProvider>
  );
}

function AuthNav() {
  const { session, loading } = useSession();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const isAdmin = useIsAdmin(session?.user.id);
  const [open, setOpen] = useState(false);

  if (loading) return <span className="h-8 w-24" />;

  if (!session) {
    return (
      <nav className="flex items-center gap-2">
        <Link
          to="/ranking"
          className="text-xs font-semibold uppercase tracking-wider text-muted-foreground hover:text-primary"
        >
          Ranking
        </Link>
        <Link
          to="/auth"
          className="shrink-0 rounded-md bg-primary px-3 py-1.5 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90"
        >
          Zaloguj się
        </Link>
      </nav>
    );
  }

  const links = [
    { to: "/nowa", label: "Ogłoś wyprawę" },
    { to: "/grupy", label: "Grupy" },
    { to: "/zaproszenia", label: "Zaproszenia" },
    { to: "/profil", label: "Profil" },
    { to: "/zglos-fotoradar", label: "Zgłoś fotoradar" },
    { to: "/ranking", label: "Ranking" },
    ...(isAdmin ? [{ to: "/admin", label: "Statystyki" }] : []),
  ] as const;

  const signOut = async () => {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  };

  return (
    <div className="flex shrink-0 items-center gap-2">
      <NotificationBell userId={session.user.id} />

      {/* Compact menu on small screens */}
      <div className="relative lg:hidden">
        <button
          type="button"
          aria-label="Menu"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
          className="grid h-9 w-9 place-items-center rounded-md border border-border text-foreground transition-colors hover:border-primary/60"
        >
          <Menu className="h-4 w-4" />
        </button>
        {open && (
          <>
            <button
              type="button"
              aria-label="Zamknij menu"
              onClick={() => setOpen(false)}
              className="fixed inset-0 z-40 cursor-default"
            />
            <div className="absolute right-0 z-50 mt-2 w-56 overflow-hidden rounded-lg border border-border bg-card shadow-ember">
              <div className="flex items-center justify-between border-b border-border px-3 py-2">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Menu
                </span>
                <button
                  type="button"
                  aria-label="Zamknij"
                  onClick={() => setOpen(false)}
                  className="text-muted-foreground hover:text-primary"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <nav className="flex flex-col py-1">
                {links.map((l) => (
                  <Link
                    key={l.to}
                    to={l.to}
                    onClick={() => setOpen(false)}
                    className="px-3 py-2 text-sm font-semibold text-foreground hover:bg-accent hover:text-primary"
                  >
                    {l.label}
                  </Link>
                ))}
                <button
                  onClick={() => {
                    setOpen(false);
                    void signOut();
                  }}
                  className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground hover:bg-accent hover:text-primary"
                >
                  Wyloguj
                </button>
              </nav>
            </div>
          </>
        )}
      </div>

      {/* Full nav on large screens */}
      <nav className="hidden items-center gap-2 lg:flex">
        <Link
          to="/ranking"
          className="text-xs font-semibold uppercase tracking-wider text-muted-foreground hover:text-primary"
        >
          Ranking
        </Link>
        {isAdmin && (
          <Link
            to="/admin"
            className="text-xs font-semibold uppercase tracking-wider text-muted-foreground hover:text-primary"
          >
            Statystyki
          </Link>
        )}
        <Link
          to="/nowa"
          className="rounded-md bg-primary px-3 py-1.5 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90"
        >
          Ogłoś wyprawę
        </Link>
        <Link
          to="/grupy"
          className="rounded-md border border-border px-3 py-1.5 text-sm font-semibold text-foreground transition-colors hover:border-primary/60"
        >
          Grupy
        </Link>
        <Link
          to="/zaproszenia"
          className="rounded-md border border-border px-3 py-1.5 text-sm font-semibold text-foreground transition-colors hover:border-primary/60"
        >
          Zaproszenia
        </Link>
        <Link
          to="/profil"
          className="rounded-md border border-border px-3 py-1.5 text-sm font-semibold text-foreground transition-colors hover:border-primary/60"
        >
          Profil
        </Link>
        <Link
          to="/zglos-fotoradar"
          className="rounded-md border border-border px-3 py-1.5 text-sm font-semibold text-foreground transition-colors hover:border-primary/60"
        >
          Zgłoś fotoradar
        </Link>
        <button
          onClick={() => void signOut()}
          className="text-xs uppercase tracking-wider text-muted-foreground hover:text-primary"
        >
          Wyloguj
        </button>
      </nav>
    </div>
  );
}
