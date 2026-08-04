import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Trophy } from "lucide-react";
import { fetchRides, levelLabel, ridesQueryKey } from "@/lib/rides";
import { average, fetchRatings, formatScore, ratingsQueryKey } from "@/lib/ratings";
import { Stars } from "@/components/Stars";

export const Route = createFileRoute("/ranking")({
  head: () => ({
    meta: [
      { title: "Ranking prowadzących i tras — Motor Trip" },
      {
        name: "description",
        content:
          "Zobacz, którzy prowadzący i które trasy motocyklowe zebrały najlepsze oceny w skali od 1 do 5.",
      },
      { property: "og:title", content: "Ranking prowadzących i tras — Motor Trip" },
      {
        property: "og:description",
        content: "Oceny wypraw motocyklowych w skali 1–5 — najlepsi prowadzący i najlepsze trasy.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: RankingPage,
});

function RankingPage() {
  const { data: rides = [], isLoading: loadingRides } = useQuery({
    queryKey: ridesQueryKey,
    queryFn: fetchRides,
  });
  const { data: ratings = [], isLoading: loadingRatings } = useQuery({
    queryKey: ratingsQueryKey,
    queryFn: fetchRatings,
  });
  const [tab, setTab] = useState<"hosts" | "rides">("hosts");
  const loading = loadingRides || loadingRatings;

  const scoresByRide = new Map<string, number[]>();
  for (const r of ratings) {
    scoresByRide.set(r.rideId, [...(scoresByRide.get(r.rideId) ?? []), r.score]);
  }

  const rideRanking = rides
    .map((ride) => {
      const scores = scoresByRide.get(ride.id) ?? [];
      return { ride, avg: average(scores), count: scores.length };
    })
    .filter((row) => row.count > 0)
    .sort((a, b) => b.avg - a.avg || b.count - a.count);

  const hostMap = new Map<string, { host: string; scores: number[]; ridesCount: number }>();
  for (const ride of rides) {
    const key = ride.hostId ?? ride.host;
    const entry = hostMap.get(key) ?? { host: ride.host, scores: [], ridesCount: 0 };
    entry.ridesCount += 1;
    entry.scores.push(...(scoresByRide.get(ride.id) ?? []));
    hostMap.set(key, entry);
  }
  const hostRanking = [...hostMap.entries()]
    .map(([key, entry]) => ({
      key,
      host: entry.host,
      avg: average(entry.scores),
      count: entry.scores.length,
      ridesCount: entry.ridesCount,
    }))
    .filter((row) => row.count > 0)
    .sort((a, b) => b.avg - a.avg || b.count - a.count);

  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="flex items-center gap-2 text-4xl text-foreground">
        <Trophy className="h-7 w-7 text-primary" />
        Ranking
      </h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Uczestnicy oceniają wyprawy w skali od 1 do 5 — z tych ocen powstaje ranking prowadzących i
        tras.
      </p>

      <div className="mt-5 flex gap-2">
        {(
          [
            { key: "hosts", label: "Prowadzący" },
            { key: "rides", label: "Trasy" },
          ] as const
        ).map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`rounded-full border px-4 py-1.5 text-xs font-semibold uppercase tracking-wider transition-colors ${
              tab === t.key
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-card text-muted-foreground hover:border-primary/50"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {loading && (
        <p className="mt-6 rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          Liczymy oceny…
        </p>
      )}

      {!loading && tab === "hosts" && (
        <ol className="mt-5 space-y-3">
          {hostRanking.map((row, index) => (
            <li
              key={row.key}
              className="flex items-center gap-3 rounded-lg border border-border bg-card p-4"
            >
              <Place index={index} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-xl text-foreground">{row.host}</p>
                <p className="text-xs uppercase tracking-wider text-muted-foreground">
                  {row.ridesCount} wypraw · {row.count} ocen
                </p>
              </div>
              <div className="shrink-0 text-right">
                <Stars value={row.avg} />
                <p className="text-sm font-semibold text-primary">{formatScore(row.avg)} / 5</p>
              </div>
            </li>
          ))}
          {hostRanking.length === 0 && <Empty />}
        </ol>
      )}

      {!loading && tab === "rides" && (
        <ol className="mt-5 space-y-3">
          {rideRanking.map((row, index) => (
            <li
              key={row.ride.id}
              className="flex items-center gap-3 rounded-lg border border-border bg-card p-4"
            >
              <Place index={index} />
              <div className="min-w-0 flex-1">
                <Link
                  to="/wyprawa/$id"
                  params={{ id: row.ride.id }}
                  className="block truncate text-xl text-foreground hover:text-primary"
                >
                  {row.ride.title}
                </Link>
                <p className="text-xs uppercase tracking-wider text-muted-foreground">
                  {levelLabel[row.ride.level]} · {row.ride.km} km · {row.count} ocen
                </p>
              </div>
              <div className="shrink-0 text-right">
                <Stars value={row.avg} />
                <p className="text-sm font-semibold text-primary">{formatScore(row.avg)} / 5</p>
              </div>
            </li>
          ))}
          {rideRanking.length === 0 && <Empty />}
        </ol>
      )}
    </main>
  );
}

function Place({ index }: { index: number }) {
  return (
    <span
      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full font-display text-xl ${
        index === 0
          ? "bg-primary text-primary-foreground"
          : "border border-border bg-secondary text-muted-foreground"
      }`}
    >
      {index + 1}
    </span>
  );
}

function Empty() {
  return (
    <li className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
      Nikt jeszcze nie wystawił oceny. Wróć z trasy i oceń wyprawę.
    </li>
  );
}