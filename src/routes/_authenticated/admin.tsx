import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { BarChart3, Gauge, Route as RouteIcon, Users } from "lucide-react";
import { useSession, useIsAdmin } from "@/hooks/useAuth";
import { adminStatsQueryKey, fetchAdminStats, formatNumber } from "@/lib/stats";

export const Route = createFileRoute("/_authenticated/admin")({
  head: () => ({
    meta: [
      { title: "Statystyki administratora — Motor Trip" },
      {
        name: "description",
        content:
          "Panel administratora Motor Trip: liczba zarejestrowanych motocyklistów i suma przejechanych kilometrów.",
      },
      { property: "og:title", content: "Statystyki administratora — Motor Trip" },
      {
        property: "og:description",
        content: "Liczba zarejestrowanych użytkowników i przejechane kilometry w Motor Trip.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AdminStatsPage,
});

function AdminStatsPage() {
  const { user } = useSession();
  const isAdmin = useIsAdmin(user?.id);
  const { data, isLoading } = useQuery({
    queryKey: adminStatsQueryKey,
    queryFn: fetchAdminStats,
    enabled: isAdmin,
  });

  if (!isAdmin) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-8">
        <h1 className="text-4xl text-foreground">Statystyki</h1>
        <p className="mt-3 rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          Ta sekcja jest dostępna tylko dla administratora.{" "}
          <Link to="/" className="text-primary hover:underline">
            Wróć na stronę główną
          </Link>
          .
        </p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="flex items-center gap-2 text-4xl text-foreground">
        <BarChart3 className="h-7 w-7 text-primary" />
        Statystyki
      </h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Podgląd administratora — stan społeczności i przejechane trasy.
      </p>

      {isLoading || !data ? (
        <p className="mt-6 rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          Liczymy statystyki…
        </p>
      ) : (
        <>
          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            <Stat
              icon={<Users className="h-5 w-5 text-primary" />}
              label="Zarejestrowani użytkownicy"
              value={formatNumber(data.users)}
              hint="Wszystkie konta z profilem"
            />
            <Stat
              icon={<Gauge className="h-5 w-5 text-primary" />}
              label="Przejechane kilometry"
              value={`${formatNumber(data.kmDone)} km`}
              hint={`${formatNumber(data.ridesDone)} zakończonych wypraw`}
            />
          </div>

          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <Stat
              icon={<RouteIcon className="h-5 w-5 text-primary" />}
              label="Kilometry przed nami"
              value={`${formatNumber(data.kmPlanned)} km`}
              hint={`${formatNumber(data.ridesTotal - data.ridesDone)} zaplanowanych wypraw`}
            />
            <Stat
              icon={<Gauge className="h-5 w-5 text-primary" />}
              label="Kilometry uczestników"
              value={`${formatNumber(data.riderKmDone)} km`}
              hint="Suma km × liczba jadących"
            />
          </div>
        </>
      )}
    </main>
  );
}

function Stat({
  icon,
  label,
  value,
  hint,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-5">
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {icon}
        {label}
      </div>
      <p className="mt-3 font-display text-4xl text-foreground">{value}</p>
      <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
    </div>
  );
}
