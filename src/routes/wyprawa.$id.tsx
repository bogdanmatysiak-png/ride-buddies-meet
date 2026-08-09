import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, CalendarDays, Camera, MapPin, Route as RouteIcon, Users } from "lucide-react";
import { toast } from "sonner";
import {
  fetchRides,
  formatDate,
  freeSpots,
  isUnlimited,
  joinRide,
  leaveRide,
  levelLabel,
  ridesQueryKey,
  spotsLabel,
} from "@/lib/rides";
import { useIsAdmin, useSession } from "@/hooks/useAuth";
import { RouteMap } from "@/components/RouteMap";
import { RideChat } from "@/components/RideChat";
import { RideRatings } from "@/components/RideRatings";
import { cameraSourcesText } from "@/lib/camera-sources";

export const Route = createFileRoute("/wyprawa/$id")({
  head: () => ({
    meta: [
      { title: "Szczegóły wyprawy — Motor Trip" },
      {
        name: "description",
        content: "Trasa, tempo, zbiórka i lista uczestników wspólnej wyprawy motocyklowej.",
      },
      { property: "og:title", content: "Szczegóły wyprawy — Motor Trip" },
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
  const isAdmin = useIsAdmin(user?.id);
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

  const free = freeSpots(ride.spots, ride.riders.length);
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
          Prowadzi{" "}
          {ride.hostId ? (
            <Link
              to="/motocyklista/$id"
              params={{ id: ride.hostId }}
              className="underline underline-offset-2 hover:opacity-80"
            >
              {ride.host}
            </Link>
          ) : (
            ride.host
          )}
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
          {[ride.start, ...(ride.waypoints ?? []), ride.end].join(" → ")}
        </Fact>
        <Fact icon={<Users className="h-4 w-4" />} label="Ekipa">
          {ride.riders.length}/{spotsLabel(ride.spots)}{" "}
          {isUnlimited(ride.spots)
            ? "(bez limitu)"
            : free > 0
              ? `(${free} wolne)`
              : "(pełna)"}
        </Fact>
        <Fact icon={<Users className="h-4 w-4" />} label="Interkom">
          {ride.intercom ? (ride.intercomType ? `Tak — ${ride.intercomType}` : "Tak") : "Nie"}
        </Fact>
        <Fact icon={<Camera className="h-4 w-4" />} label="Kontrole prędkości">
          {ride.cameras === null && ride.sectionChecks === null
            ? "Brak danych"
            : `Fotoradary: ${ride.cameras ?? 0} · odcinkowe: ${ride.sectionChecks ?? 0}`}
          {(ride.cameras !== null || ride.sectionChecks !== null) && (
            <span className="mt-1 block text-[11px] font-normal text-muted-foreground">
              Źródła: {cameraSourcesText(ride.cameraSources)}
            </span>
          )}
          <Link
            to="/zglos-fotoradar"
            className="mt-1 block text-[11px] font-semibold uppercase tracking-wider text-primary"
          >
            Zgłoś fotoradar
          </Link>
        </Fact>
        {ride.groupName && (
          <Fact icon={<Users className="h-4 w-4" />} label="Grupa">
            {ride.groupName}
          </Fact>
        )}
      </dl>

      <section className="mt-5 rounded-lg border border-border bg-card p-5">
        <h2 className="text-2xl text-foreground">O trasie</h2>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          {ride.description}
        </p>
        {(ride.waypoints ?? []).length > 0 && (
          <p className="mt-3 text-sm text-muted-foreground">
            <span className="font-semibold text-primary">Przez: </span>
            {ride.waypoints.join(" · ")}
          </p>
        )}
        <RouteMap
          start={ride.start}
          end={ride.end}
          waypoints={ride.waypoints ?? []}
          className="mt-4"
        />
        <p className="mt-2 text-xs text-muted-foreground">
          Trasa wyznaczana bez autostrad i dróg ekspresowych — wybieramy wariant z największą
          liczbą zakrętów i widoków.
        </p>
        <a
          href={`https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(
            ride.start,
          )}&destination=${encodeURIComponent(
            ride.end,
          )}${
            (ride.waypoints ?? []).length
              ? `&waypoints=${ride.waypoints.map((w) => encodeURIComponent(w)).join("|")}`
              : ""
          }&travelmode=driving&avoid=highways|tolls|ferries`}
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
          {ride.riderIds.map((riderId, i) => (
            <li key={riderId}>
              <Link
                to="/motocyklista/$id"
                params={{ id: riderId }}
                className="inline-block rounded-full border border-border bg-secondary px-3 py-1 text-sm text-foreground transition-colors hover:border-primary hover:text-primary"
              >
                {ride.riders[i] ?? "Motocyklista"}
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <RideRatings
        rideId={ride.id}
        hostName={ride.host}
        hostId={ride.hostId}
        currentUserId={user?.id}
        isAdmin={isAdmin}
      />

      <RideChat
        rideId={ride.id}
        currentUserId={user?.id}
        hostId={ride.hostId}
        isAdmin={isAdmin}
      />

      {isAdmin && (
        <Link
          to="/edytuj/$id"
          params={{ id: ride.id }}
          className="mt-4 inline-flex rounded-md border border-primary px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-primary transition-colors hover:bg-primary hover:text-primary-foreground"
        >
          Administrator: edytuj wyprawę
        </Link>
      )}

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