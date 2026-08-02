import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import heroImage from "@/assets/hero-ride.jpg";
import { RideCard } from "@/components/RideCard";
import { fetchRides, levelLabel, ridesQueryKey, type RideLevel } from "@/lib/rides";
import { useSession } from "@/hooks/useAuth";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
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
    ],
  }),
  component: Index,
});

const filters: Array<{ key: RideLevel | "all"; label: string }> = [
  { key: "all", label: "Wszystkie" },
  { key: "chill", label: levelLabel.chill },
  { key: "sport", label: levelLabel.sport },
  { key: "adventure", label: levelLabel.adventure },
];

function Index() {
  const { data: rides = [], isLoading } = useQuery({
    queryKey: ridesQueryKey,
    queryFn: fetchRides,
  });
  const { user } = useSession();
  const [filter, setFilter] = useState<RideLevel | "all">("all");
  const visible = [...rides]
    .filter((r) => filter === "all" || r.level === filter)
    .sort((a, b) => a.date.localeCompare(b.date));

  return (
    <main>
      <section className="relative overflow-hidden">
        <img
          src={heroImage}
          alt="Grupa motocyklistów na górskiej drodze podczas zachodu słońca"
          width={1280}
          height={1600}
          className="absolute inset-0 h-full w-full object-cover opacity-45"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/70 to-background/30" />
        <div className="relative mx-auto max-w-3xl px-4 pb-10 pt-16">
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-primary">
            Wyprawy motocyklowe
          </p>
          <h1 className="mt-3 text-5xl text-foreground sm:text-6xl">
            Nie jedź sam.
            <br />
            Znajdź ekipę na weekend.
          </h1>
          <p className="mt-4 max-w-md text-sm text-muted-foreground">
            Motor Trip to miejsce, w którym motocykliści umawiają się na wspólne trasy — od
            spokojnych przejażdżek po szuter w Bieszczadach.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <a
              href="#wyprawy"
              className="rounded-md bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-ember transition-opacity hover:opacity-90"
            >
              Zobacz wyprawy
            </a>
            <Link
              to="/nowa"
              className="rounded-md border border-border bg-card/70 px-5 py-2.5 text-sm font-semibold text-foreground transition-colors hover:border-primary/60"
            >
              Ogłoś własną
            </Link>
          </div>
        </div>
      </section>

      <section id="wyprawy" className="mx-auto max-w-3xl px-4 py-8">
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-3xl text-foreground">Nadchodzące</h2>
          <span className="text-xs uppercase tracking-wider text-muted-foreground">
            {visible.length} tras
          </span>
        </div>
        <div className="mt-4 flex gap-2 overflow-x-auto pb-1">
          {filters.map((f) => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-semibold uppercase tracking-wider transition-colors ${
                filter === f.key
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-card text-muted-foreground hover:border-primary/50"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
        <div className="mt-5 space-y-3">
          {visible.map((ride) => (
            <RideCard key={ride.id} ride={ride} currentUserId={user?.id ?? null} />
          ))}
          {isLoading && (
            <p className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
              Ładujemy trasy…
            </p>
          )}
          {!isLoading && visible.length === 0 && (
            <p className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
              Brak wypraw w tej kategorii. Może ogłosisz swoją?
            </p>
          )}
        </div>
      </section>
    </main>
  );
}
