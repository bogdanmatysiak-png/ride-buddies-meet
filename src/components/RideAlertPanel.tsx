import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  disableRideAlert,
  fetchRideAlert,
  rideAlertQueryKey,
  saveRideAlert,
} from "@/lib/ride-alerts";
import { useBrowserNotifications } from "@/hooks/useBrowserNotifications";
import type { Coords, RadiusOption } from "@/lib/geo";

const HOUR_OPTIONS = [6, 12, 24, 48] as const;

/** Alerty o nowych i zbliżających się wyprawach w wybranym promieniu. */
export function RideAlertPanel({
  userId,
  origin,
  originLabel,
  radius,
}: {
  userId: string;
  origin: Coords | null;
  originLabel: string;
  radius: RadiusOption | null;
}) {
  const queryClient = useQueryClient();
  const { permission, request } = useBrowserNotifications(userId);
  const { data: alert } = useQuery({
    queryKey: rideAlertQueryKey(userId),
    queryFn: () => fetchRideAlert(userId),
  });

  const [notifyNew, setNotifyNew] = useState(true);
  const [notifySoon, setNotifySoon] = useState(true);
  const [hoursBefore, setHoursBefore] = useState<number>(24);

  useEffect(() => {
    if (!alert) return;
    setNotifyNew(alert.notifyNew);
    setNotifySoon(alert.notifySoon);
    setHoursBefore(alert.hoursBefore);
  }, [alert]);

  const save = useMutation({
    mutationFn: async () => {
      if (!origin || !radius) throw new Error("Najpierw wskaż punkt i promień");
      await saveRideAlert(userId, {
        origin,
        radius,
        label: originLabel,
        notifyNew,
        notifySoon,
        hoursBefore,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: rideAlertQueryKey(userId) });
      toast.success("Alerty włączone dla tego promienia");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const stop = useMutation({
    mutationFn: () => disableRideAlert(userId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: rideAlertQueryKey(userId) });
      toast.success("Alerty wyłączone");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="mt-3 rounded-lg border border-border bg-card/60 p-4">
      <h3 className="text-sm font-semibold uppercase tracking-wider text-foreground">
        Alerty o wyprawach w promieniu
      </h3>

      <div className="mt-3 space-y-2 text-sm text-foreground">
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={notifyNew}
            onChange={(e) => setNotifyNew(e.target.checked)}
            className="h-4 w-4 accent-primary"
          />
          Nowa wyprawa startuje w moim promieniu
        </label>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={notifySoon}
            onChange={(e) => setNotifySoon(e.target.checked)}
            className="h-4 w-4 accent-primary"
          />
          Wyprawa zbliża się do startu
        </label>
      </div>

      {notifySoon && (
        <div className="mt-3 flex flex-wrap gap-2">
          {HOUR_OPTIONS.map((h) => (
            <button
              key={h}
              onClick={() => setHoursBefore(h)}
              className={`rounded-full border px-3 py-1.5 text-xs font-semibold uppercase tracking-wider transition-colors ${
                hoursBefore === h
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-card text-muted-foreground hover:border-primary/50"
              }`}
            >
              {h} h przed
            </button>
          ))}
        </div>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          onClick={() => save.mutate()}
          disabled={!origin || !radius || save.isPending}
          className="rounded-md bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground disabled:opacity-60"
        >
          {alert ? "Zapisz alerty" : "Włącz alerty"}
        </button>
        {alert && (
          <button
            onClick={() => stop.mutate()}
            disabled={stop.isPending}
            className="rounded-md border border-border bg-card px-4 py-2 text-xs font-semibold text-foreground hover:border-primary/60"
          >
            Wyłącz alerty
          </button>
        )}
        {permission !== "granted" && permission !== "unsupported" && (
          <button
            onClick={() => request()}
            className="rounded-md border border-border bg-card px-4 py-2 text-xs font-semibold text-foreground hover:border-primary/60"
          >
            Włącz powiadomienia w przeglądarce
          </button>
        )}
      </div>

      <p className="mt-3 text-xs text-muted-foreground">
        {alert
          ? `Alerty aktywne: ${alert.radiusKm} km od ${alert.label || "wskazanego punktu"}. Wpisy trafiają do centrum powiadomień${permission === "granted" ? " i jako powiadomienia przeglądarki" : ""}.`
          : origin && radius
            ? `Zapisz alerty dla promienia ${radius} km od: ${originLabel}.`
            : "Ustaw najpierw punkt odniesienia i promień powyżej."}
      </p>
    </div>
  );
}