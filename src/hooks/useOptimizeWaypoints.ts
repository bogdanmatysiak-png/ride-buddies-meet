import { useState } from "react";
import { toast } from "sonner";
import { optimizeWaypoints, planRoute } from "@/lib/maps.functions";
import type { RoutePrefs } from "@/lib/route-prefs";

export type OptimizeMode = "fast" | "scenic";

export type OrderStats = { km: number; minutes: number; turns: number };

export type OrderComparison = {
  mode: OptimizeMode;
  before: OrderStats;
  after: OrderStats;
  changed: boolean;
};

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
  const [comparison, setComparison] = useState<OrderComparison | null>(null);

  async function optimize(nextMode: OptimizeMode = mode) {
    if (optimizing) return;
    setMode(nextMode);
    setOptimizing(true);
    try {
      const scenic = nextMode === "scenic";
      const avoid = {
        avoidHighways: scenic ? true : prefs.avoidHighways,
        avoidTolls: scenic ? true : prefs.avoidTolls,
        avoidFerries: prefs.avoidFerries,
      };
      // Stan „przed” liczymy dla aktualnej kolejności punktów, tymi samymi ustawieniami.
      const before = await planRoute({
        data: { start, end, waypoints, curvy: false, ...avoid },
      });
      const result = await optimizeWaypoints({
        data: {
          start,
          end,
          waypoints,
          mode: nextMode,
          ...avoid,
        },
      });
      onChange(result.waypoints);
      setComparison({
        mode: nextMode,
        before: { km: before.km, minutes: before.minutes, turns: before.turns },
        after: { km: result.km, minutes: result.minutes, turns: result.turns },
        changed: result.waypoints.join("|") !== waypoints.join("|"),
      });
      toast.success(
        `${nextMode === "scenic" ? "Malownicza" : "Najszybsza"} kolejność: ${result.km} km, ok. ${Math.floor(
          result.minutes / 60,
        )} h ${result.minutes % 60} min · ${result.turns} zakrętów`,
      );
    } catch (error) {
      setComparison(null);
      toast.error(
        error instanceof Error ? error.message : "Nie udało się ułożyć kolejności punktów",
      );
    } finally {
      setOptimizing(false);
    }
  }

  const canOptimize =
    waypoints.length >= 2 && start.trim().length > 1 && end.trim().length > 1 && !optimizing;

  return { optimize, optimizing, canOptimize, mode, setMode, comparison };
}