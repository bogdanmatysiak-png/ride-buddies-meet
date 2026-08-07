import { useState } from "react";
import { toast } from "sonner";
import { optimizeWaypoints } from "@/lib/maps.functions";
import type { RoutePrefs } from "@/lib/route-prefs";

export type OptimizeMode = "fast" | "scenic";

/** Ustawia punkty „przez” w kolejności najszybszej albo bardziej malowniczej trasy. */
export function useOptimizeWaypoints({
  start,
  end,
  waypoints,
  prefs,
  onChange,
}: {
  start: string;
  end: string;
  waypoints: string[];
  prefs: RoutePrefs;
  onChange: (next: string[]) => void;
}) {
  const [optimizing, setOptimizing] = useState(false);
  const [mode, setMode] = useState<OptimizeMode>("fast");

  async function optimize(nextMode: OptimizeMode = mode) {
    if (optimizing) return;
    setMode(nextMode);
    setOptimizing(true);
    try {
      const result = await optimizeWaypoints({
        data: {
          start,
          end,
          waypoints,
          mode: nextMode,
          avoidHighways: prefs.avoidHighways,
          avoidTolls: prefs.avoidTolls,
          avoidFerries: prefs.avoidFerries,
        },
      });
      onChange(result.waypoints);
      toast.success(
        `${nextMode === "scenic" ? "Malownicza" : "Najszybsza"} kolejność: ${result.km} km, ok. ${Math.floor(
          result.minutes / 60,
        )} h ${result.minutes % 60} min · ${result.turns} zakrętów`,
      );
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Nie udało się ułożyć kolejności punktów",
      );
    } finally {
      setOptimizing(false);
    }
  }

  const canOptimize =
    waypoints.length >= 2 && start.trim().length > 1 && end.trim().length > 1 && !optimizing;

  return { optimize, optimizing, canOptimize, mode, setMode };
}