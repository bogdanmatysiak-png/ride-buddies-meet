import { useCallback, useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { planRoute, type RoutePlan } from "@/lib/maps.functions";
import type { RoutePrefs } from "@/lib/route-prefs";

/** Przelicza trasę na żywo po każdej zmianie punktów lub preferencji. */
export function useLiveRoute({
  start,
  end,
  waypoints,
  prefs,
  enabled = true,
  delay = 900,
}: {
  start: string;
  end: string;
  waypoints: string[];
  prefs: RoutePrefs;
  enabled?: boolean;
  delay?: number;
}) {
  const [plan, setPlan] = useState<RoutePlan | null>(null);
  const [planning, setPlanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const computeRoute = useServerFn(planRoute);
  const runRef = useRef(0);

  const ready = start.trim().length > 1 && end.trim().length > 1;
  const signature = JSON.stringify([start.trim(), end.trim(), waypoints, prefs]);

  const run = useCallback(
    async (immediate = false) => {
      if (!ready) return;
      const run = ++runRef.current;
      setPlanning(true);
      setError(null);
      try {
        const result = await computeRoute({
          data: {
            start: start.trim(),
            end: end.trim(),
            waypoints: waypoints.filter((w) => w.trim().length > 1),
            ...prefs,
          },
        });
        if (runRef.current !== run) return;
        setPlan(result);
      } catch (e) {
        if (runRef.current !== run) return;
        setError(e instanceof Error ? e.message : "Nie udało się wyznaczyć trasy");
      } finally {
        if (runRef.current === run || immediate) setPlanning(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ready, signature, computeRoute],
  );

  useEffect(() => {
    if (!enabled || !ready) return;
    const timer = setTimeout(() => void run(), delay);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, ready, signature, delay]);

  return { plan, planning, error, recalc: () => run(true) };
}
