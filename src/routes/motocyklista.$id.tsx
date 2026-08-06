import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Bike, MapPin, Radio } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { fetchRides, formatDate, ridesQueryKey } from "@/lib/rides";

export const Route = createFileRoute("/motocyklista/$id")({
  head: () => ({
    meta: [
      { title: "Profil motocyklisty — Motor Trip" },
      {
        name: "description",
        content:
          "Zobacz motocykl, miasto, interkom i wyprawy tego motocyklisty w społeczności Motor Trip.",
      },
      { property: "og:title", content: "Profil motocyklisty — Motor Trip" },
      { property: "og:description", content: "Motocykl, interkom i wyprawy tego kierowcy." },
      { property: "og:type", content: "profile" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: RiderProfile,
});

function RiderProfile() {
  const { id } = Route.useParams();

  const { data: profile, isLoading } = useQuery({
    queryKey: ["public-profile", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, nick, bike, city, intercom, intercom_type")
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const { data: rides = [] } = useQuery({ queryKey: ridesQueryKey, queryFn: fetchRides });
  const hosted = rides.filter((r) => r.hostId === id);
  const joined = rides.filter((r) => r.hostId !== id && r.riderIds.includes(id));

  if (isLoading) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-16 text-center text-sm text-muted-foreground">
        Ładujemy profil…
      </main>
    );
  }

  if (!profile) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-16 text-center">
        <h1 className="text-3xl text-foreground">Nie ma takiego motocyklisty</h1>
        <Link to="/" className="mt-4 inline-block text-sm font-semibold text-primary">
          Wróć do listy
        </Link>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-3xl px-4 py-6">
      <Link
        to="/"
        className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground hover:text-primary"
      >
        <ArrowLeft className="h-4 w-4" /> Wszystkie wyprawy
      </Link>

      <div className="mt-4 rounded-lg border border-border bg-dusk p-5">
        <h1 className="text-4xl text-foreground">{profile.nick}</h1>
        <div className="mt-3 flex flex-wrap gap-3 text-sm text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <Bike className="h-4 w-4 text-primary" /> {profile.bike || "Motocykl nieznany"}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <MapPin className="h-4 w-4 text-primary" /> {profile.city || "Miasto nieznane"}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Radio className="h-4 w-4 text-primary" />
            {profile.intercom
              ? profile.intercom_type
                ? `Interkom — ${profile.intercom_type}`
                : "Interkom — tak"
              : "Bez interkomu"}
          </span>
        </div>
      </div>

      <RideList title="Prowadzi wyprawy" rides={hosted} />
      <RideList title="Jedzie z ekipą" rides={joined} />
    </main>
  );
}

function RideList({
  title,
  rides,
}: {
  title: string;
  rides: Array<{ id: string; title: string; date: string; km: number }>;
}) {
  return (
    <section className="mt-4 rounded-lg border border-border bg-card p-5">
      <h2 className="text-2xl text-foreground">{title}</h2>
      {rides.length === 0 ? (
        <p className="mt-2 text-sm text-muted-foreground">Nic tutaj jeszcze nie ma.</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {rides.map((r) => (
            <li key={r.id}>
              <Link
                to="/wyprawa/$id"
                params={{ id: r.id }}
                className="flex items-center justify-between rounded-md border border-border bg-secondary px-3 py-2 text-sm text-foreground hover:border-primary/60"
              >
                <span className="font-semibold">{r.title}</span>
                <span className="text-xs text-muted-foreground">
                  {formatDate(r.date)} · {r.km} km
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}