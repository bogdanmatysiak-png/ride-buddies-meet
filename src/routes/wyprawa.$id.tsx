import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, CalendarDays, MapPin, Route as RouteIcon, Users } from "lucide-react";
import { toast } from "sonner";
import {
  fetchRides,
  formatDate,
  joinRide,
  leaveRide,
  levelLabel,
  ridesQueryKey,
} from "@/lib/rides";
import { useSession } from "@/hooks/useAuth";
import { RouteMap } from "@/components/RouteMap";
import { RideChat } from "@/components/RideChat";

export const Route = createFileRoute("/wyprawa/$id")({
  head: () => ({
    meta: [
      { title: "Szczegóły wyprawy — Zakręt" },
      {
        name: "description",
        content: "Trasa, tempo, zbiórka i lista uczestników wspólnej wyprawy motocyklowej.",
      },
      { property: "og:title", content: "Szczegóły wyprawy — Zakręt" },
      {
        property: "og:description",
        content: "Sprawdź trasę i dołącz do ekipy motocyklistów.",
      },
    ],
  }),
  component: RideDetail,
});

function RideDetail() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useSession();
  const { data: rides = [], isLoading } = useQuery({
    queryKey: ridesQueryKey,
    queryFn: fetchRides,
  });
  const ride = rides.find((r) => r.id === id);

  if (!ride) {
    if (isLoading) {
      return (
        <main className="mx-auto max-w-3xl px-4 py-16 text-center text-sm text-muted-foreground">
          Ładujemy wyprawę…
        </main>
      );
    }
    return (
      <main className="mx-auto max-w-3xl px-4 py-16 text-center">
        <h1 className="text-3xl text-foreground">Nie ma takiej wyprawy</h1>
        <Link to="/" className="mt-4 inline-block text-sm font-semibold text-primary">
          Wróć do listy
        </Link>
      </main>
    );
  }

  const free = ride.spots - ride.riders.length;
  const joined = !!user && ride.riderIds.includes(user.id);

  return (
    <main className="mx-auto max-w-3xl px-4 py-6">
      <Link
        to="/"
        className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground hover:text-primary"
      >
        <ArrowLeft className="h-4 w-4" /> Wszystkie wyprawy
      </Link>

      <div className="mt-4 rounded-lg border border-border bg-dusk p-5">
        <span className="rounded-sm bg-secondary px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          {levelLabel[ride.level]}
        </span>
        <h1 className="mt-3 text-4xl text-foreground">{ride.title}</h1>
        <p className="mt-2 text-sm font-semibold text-primary">
          Prowadzi {ride.host}
        </p>
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-3">
        <Fact icon={<CalendarDays className="h-4 w-4" />} label="Zbiórka">
          {formatDate(ride.date)}, {ride.time}
        </Fact>
        <Fact icon={<RouteIcon className="h-4 w-4" />} label="Dystans">
          {ride.km} km
        </Fact>
        <Fact icon={<MapPin className="h-4 w-4" />} label="Trasa">
          {ride.start} → {ride.end}
        </Fact>
        <Fact icon={<Users className="h-4 w-4" />} label="Ekipa">
          {ride.riders.length}/{ride.spots} {free > 0 ? `(${free} wolne)` : "(pełna)"}
        </Fact>
      </dl>

      <section className="mt-5 rounded-lg border border-border bg-card p-5">
        <h2 className="text-2xl text-foreground">O trasie</h2>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          {ride.description}
        </p>
        <RouteMap start={ride.start} end={ride.end} className="mt-4" />
        <a
          href={`https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(
            ride.start,
          )}&destination=${encodeURIComponent(ride.end)}&travelmode=driving`}
          target="_blank"
          rel="noreferrer"
          className="mt-3 inline-block text-xs font-semibold uppercase tracking-wider text-primary"
        >
          Otwórz w Google Maps
        </a>
      </section>

      <section className="mt-4 rounded-lg border border-border bg-card p-5">
        <h2 className="text-2xl text-foreground">Kto jedzie</h2>
        <ul className="mt-3 flex flex-wrap gap-2">
          {ride.riders.map((r) => (
            <li
              key={r}
              className="rounded-full border border-border bg-secondary px-3 py-1 text-sm text-foreground"
            >
              {r}
            </li>
          ))}
        </ul>
      </section>

      <RideChat rideId={ride.id} currentUserId={user?.id} hostId={ride.hostId} />

      <button
        onClick={async () => {
          if (!user) {
            navigate({ to: "/auth", search: { redirect: `/wyprawa/${ride.id}` } });
            return;
          }
          try {
            if (joined) {
              await leaveRide(ride.id, user.id);
              toast.success("Wypisano z wyprawy");
            } else {
              await joinRide(ride.id, user.id);
              toast.success("Jesteś zapisany. Do zobaczenia na zbiórce!");
            }
            await queryClient.invalidateQueries({ queryKey: ridesQueryKey });
          } catch (error) {
            toast.error(error instanceof Error ? error.message : "Nie udało się zapisać");
          }
        }}
        disabled={!!user && !joined && free <= 0}
        className={`mt-6 w-full rounded-md px-5 py-3 text-sm font-semibold transition-opacity disabled:opacity-50 ${
          joined
            ? "border border-border bg-card text-foreground"
            : "bg-primary text-primary-foreground shadow-ember hover:opacity-90"
        }`}
      >
        {!user
          ? "Zaloguj się, aby dołączyć"
          : joined
            ? "Wypisz mnie"
            : free > 0
              ? "Dołączam do ekipy"
              : "Brak miejsc"}
      </button>
    </main>
  );
}

function Fact({
  icon,
  label,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <dt className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        <span className="text-primary">{icon}</span>
        {label}
      </dt>
      <dd className="mt-1 text-sm font-semibold text-foreground">{children}</dd>
    </div>
  );
}