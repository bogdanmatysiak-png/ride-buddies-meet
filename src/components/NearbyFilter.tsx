import { useState } from "react";
import { RADIUS_OPTIONS, getBrowserLocation, type RadiusOption } from "@/lib/geo";
import { NearbyRadiusMap, type RideMarker } from "@/components/NearbyRadiusMap";
import type { Coords } from "@/lib/geo";

type Props = {
  originLabel: string;
  radius: RadiusOption | null;
  error: string | null;
  isLoading: boolean;
  hasOrigin: boolean;
  origin: Coords | null;
  markers: RideMarker[];
  onRadius: (r: RadiusOption | null) => void;
  onCoords: (coords: { lat: number; lng: number }, label: string) => void;
  onAddress: (address: string) => void;
  onError: (message: string) => void;
  onClear: () => void;
};

export function NearbyFilter({
  originLabel,
  radius,
  error,
  isLoading,
  hasOrigin,
  origin,
  markers,
  onRadius,
  onCoords,
  onAddress,
  onError,
  onClear,
}: Props) {
  const [city, setCity] = useState("");
  const [locating, setLocating] = useState(false);
  const [showMap, setShowMap] = useState(false);

  const useMyLocation = async () => {
    setLocating(true);
    try {
      const coords = await getBrowserLocation();
      onCoords(coords, "Twoja lokalizacja");
      if (!radius) onRadius(50);
    } catch (e) {
      onError(e instanceof Error ? e.message : "Nie udało się pobrać lokalizacji");
    } finally {
      setLocating(false);
    }
  };

  return (
    <div className="mt-5 rounded-lg border border-border bg-card/60 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-foreground">
          Wyprawy w okolicy
        </h3>
        {hasOrigin && (
          <button
            onClick={onClear}
            className="text-xs uppercase tracking-wider text-muted-foreground hover:text-primary"
          >
            Wyczyść
          </button>
        )}
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <button
          onClick={useMyLocation}
          disabled={locating}
          className="rounded-md border border-border bg-card px-3 py-2 text-xs font-semibold text-foreground transition-colors hover:border-primary/60 disabled:opacity-60"
        >
          {locating ? "Szukam…" : "Użyj mojej lokalizacji"}
        </button>
        <form
          className="flex flex-1 gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            const value = city.trim();
            if (value.length < 2) return;
            onAddress(value);
            if (!radius) onRadius(50);
          }}
        >
          <input
            value={city}
            onChange={(e) => setCity(e.target.value)}
            placeholder="albo wpisz miasto, np. Kraków"
            className="min-w-[10rem] flex-1 rounded-md border border-border bg-background px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground"
          />
          <button
            type="submit"
            className="rounded-md bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground"
          >
            Ustaw
          </button>
        </form>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {RADIUS_OPTIONS.map((r) => (
          <button
            key={r}
            onClick={() => onRadius(radius === r ? null : r)}
            className={`rounded-full border px-3 py-1.5 text-xs font-semibold uppercase tracking-wider transition-colors ${
              radius === r
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-card text-muted-foreground hover:border-primary/50"
            }`}
          >
            {r} km
          </button>
        ))}
      </div>

      <p className="mt-3 text-xs text-muted-foreground">
        {error
          ? error
          : hasOrigin
            ? radius
              ? `Pokazujemy starty do ${radius} km od: ${originLabel}${isLoading ? " — liczymy odległości…" : ""}`
              : `Lokalizacja: ${originLabel}. Wybierz promień.`
            : "Wskaż punkt odniesienia, a pokażemy tylko wyprawy startujące w wybranym promieniu."}
      </p>

      <button
        onClick={() => setShowMap((v) => !v)}
        className="mt-3 rounded-md border border-border bg-card px-3 py-2 text-xs font-semibold text-foreground transition-colors hover:border-primary/60"
      >
        {showMap ? "Ukryj mapę promienia" : "Wyznacz promień na mapie"}
      </button>

      {showMap && (
        <NearbyRadiusMap
          origin={origin}
          radius={radius}
          markers={markers}
          onOrigin={onCoords}
          onRadius={onRadius}
        />
      )}
    </div>
  );
}
