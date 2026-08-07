import { useState } from "react";
import { toast } from "sonner";
import { optimizeWaypoints } from "@/lib/maps.functions";
import type { RoutePrefs } from "@/lib/route-prefs";

/** Ustawia punkty „przez” w kolejności dającej najszybszą trasę (Google Routes). */
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

  async function optimize() {
    if (optimizing) return;
    setOptimizing(true);
    try {
      const result = await optimizeWaypoints({
        data: {
          start,
          end,
          waypoints,
          avoidHighways: prefs.avoidHighways,
          avoidTolls: prefs.avoidTolls,
          avoidFerries: prefs.avoidFerries,
        },
      });
      onChange(result.waypoints);
      toast.success(
        `Ułożyłem kolejność: ${result.km} km, ok. ${Math.floor(result.minutes / 60)} h ${
          result.minutes % 60
        } min`,
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

  return { optimize, optimizing, canOptimize };
}