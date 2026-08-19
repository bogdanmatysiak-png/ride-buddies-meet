import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Crosshair, ExternalLink, Loader2, Navigation } from "lucide-react";
import { routeFromGps } from "@/lib/maps.functions";
import { GpsRouteMap } from "@/components/GpsRouteMap";

type Step = { text: string; km: number; maneuver: string };
type Variant = { km: number; minutes: number; polyline: string; steps: Step[] };
type Result = { fastest: Variant; shortest: Variant; origin?: { lat: number; lng: number } };
type Show = "fastest" | "shortest" | "both";

const SHOW_LABELS: Array<{ id: Show; label: string }> = [
  { id: "fastest", label: "Najszybsza" },
  { id: "shortest", label: "Najkrótsza" },
  { id: "both", label: "Oba warianty" },
];

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
  const [show, setShow] = useState<Show>("both");

  const detailVariant: "fastest" | "shortest" = show === "shortest" ? "shortest" : "fastest";
  const detail = result ? result[detailVariant] : null;
  const mapsUrl = result
    ? `https://www.google.com/maps/dir/?api=1&origin=${
        result.origin ? `${result.origin.lat},${result.origin.lng}` : ""
      }&destination=${encodeURIComponent(destination)}&travelmode=driving`
    : "";

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
        <>
          <dl className="mt-2 grid grid-cols-1 gap-1 border-t border-border pt-2 text-xs text-muted-foreground sm:grid-cols-2">
            <div className="flex flex-wrap items-center gap-x-1.5">
              <span className="h-2 w-4 rounded-full bg-primary" aria-hidden />
              <dt className="font-semibold uppercase tracking-wider">Najszybsza:</dt>
              <dd className="text-foreground">
                {result.fastest.km} km · {fmt(result.fastest.minutes)}
              </dd>
            </div>
            <div className="flex flex-wrap items-center gap-x-1.5">
              <span className="h-2 w-4 rounded-full bg-sky-400" aria-hidden />
              <dt className="font-semibold uppercase tracking-wider">Najkrótsza:</dt>
              <dd className="text-foreground">
                {result.shortest.km} km · {fmt(result.shortest.minutes)}
              </dd>
            </div>
          </dl>

          <div className="mt-2 flex flex-wrap gap-1.5">
            {SHOW_LABELS.map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => setShow(opt.id)}
                aria-pressed={show === opt.id}
                className={`rounded-sm border px-2 py-1 text-[11px] font-semibold uppercase tracking-wider ${
                  show === opt.id
                    ? "border-primary text-primary"
                    : "border-border text-muted-foreground hover:text-foreground"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          <GpsRouteMap
            fastest={result.fastest}
            shortest={result.shortest}
            show={show}
            className="mt-2"
          />

          <a
            href={mapsUrl}
            target="_blank"
            rel="noreferrer"
            className="mt-2 inline-flex items-center gap-1.5 rounded-sm border border-primary px-2.5 py-1 text-xs font-semibold uppercase tracking-wider text-primary hover:bg-primary/10"
          >
            <ExternalLink className="h-3.5 w-3.5 shrink-0" />
            Otwórz w Google Maps
          </a>

          {detail && detail.steps.length > 0 && (
            <div className="mt-3 border-t border-border pt-2">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Punkty po drodze —{" "}
                {detailVariant === "shortest" ? "najkrótsza" : "najszybsza"}
              </p>
              <ol className="mt-1.5 max-h-64 space-y-1.5 overflow-y-auto pr-1">
                {detail.steps.map((s, i) => (
                  <li key={`${i}-${s.text}`} className="flex gap-2 text-xs">
                    <span className="mt-0.5 shrink-0 text-[10px] font-bold text-primary">
                      {i + 1}.
                    </span>
                    <span className="min-w-0 flex-1 text-foreground">{s.text}</span>
                    <span className="shrink-0 text-muted-foreground">{s.km} km</span>
                  </li>
                ))}
              </ol>
            </div>
          )}
        </>
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
