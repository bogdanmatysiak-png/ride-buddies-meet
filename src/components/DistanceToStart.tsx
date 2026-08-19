import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Crosshair, Loader2, Navigation } from "lucide-react";
import { routeFromGps } from "@/lib/maps.functions";

type Result = {
  fastest: { km: number; minutes: number };
  shortest: { km: number; minutes: number };
};

function fmt(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

/** Odległość z bieżącej lokalizacji (GPS) do miejsca zbiórki wyprawy. */
export function DistanceToStart({ destination }: { destination: string }) {
  const compute = useServerFn(routeFromGps);
  const [result, setResult] = useState<Result | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const locate = () => {
    if (!navigator.geolocation) {
      setError("Twoja przeglądarka nie udostępnia lokalizacji");
      return;
    }
    setLoading(true);
    setError(null);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const res = await compute({
            data: {
              lat: pos.coords.latitude,
              lng: pos.coords.longitude,
              destination,
            },
          });
          setResult(res);
        } catch (e) {
          setError(e instanceof Error ? e.message : "Nie udało się policzyć odległości");
        } finally {
          setLoading(false);
        }
      },
      () => {
        setLoading(false);
        setError("Nie udało się pobrać lokalizacji GPS");
      },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  };

  return (
    <div className="mt-3 rounded-lg border border-border bg-card px-4 py-3 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="flex items-center gap-2 text-muted-foreground">
          <Navigation className="h-4 w-4 shrink-0 text-primary" />
          Twoja odległość do zbiórki
        </span>
        <button
          type="button"
          onClick={locate}
          disabled={loading}
          className="inline-flex items-center gap-1.5 rounded-sm border border-border px-2.5 py-1 text-xs font-semibold uppercase tracking-wider text-foreground hover:border-primary hover:text-primary disabled:opacity-60"
        >
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Crosshair className="h-3.5 w-3.5" />}
          {result ? "Odśwież" : "Z mojego GPS"}
        </button>
      </div>

      {result && (
        <dl className="mt-2 grid grid-cols-1 gap-1 border-t border-border pt-2 text-xs text-muted-foreground sm:grid-cols-2">
          <div className="flex flex-wrap gap-x-1.5">
            <dt className="font-semibold uppercase tracking-wider">Najszybsza:</dt>
            <dd className="text-foreground">
              {result.fastest.km} km · {fmt(result.fastest.minutes)}
            </dd>
          </div>
          <div className="flex flex-wrap gap-x-1.5">
            <dt className="font-semibold uppercase tracking-wider">Najkrótsza:</dt>
            <dd className="text-foreground">
              {result.shortest.km} km · {fmt(result.shortest.minutes)}
            </dd>
          </div>
        </dl>
      )}

      {error && <p className="mt-2 text-xs text-destructive">{error}</p>}
      {!result && !error && (
        <p className="mt-1 text-xs text-muted-foreground">
          Do {destination} — kliknij, żeby policzyć trasę z Twojej lokalizacji.
        </p>
      )}
    </div>
  );
}
