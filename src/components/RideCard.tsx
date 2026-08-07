import { Link } from "@tanstack/react-router";
import { MapPin, Users, Route as RouteIcon } from "lucide-react";
import { formatDate, freeSpots, isUnlimited, levelLabel, spotsLabel, type Ride } from "@/lib/rides";

export function RideCard({
  ride,
  currentUserId,
  distanceKm,
}: {
  ride: Ride;
  currentUserId?: string | null;
  distanceKm?: number | null;
}) {
  const free = freeSpots(ride.spots, ride.riders.length);
  const joined = !!currentUserId && ride.riderIds.includes(currentUserId);
  return (
    <Link
      to="/wyprawa/$id"
      params={{ id: ride.id }}
      className="group block rounded-lg border border-border bg-card p-4 transition-colors hover:border-primary/60"
    >
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-2xl text-foreground">{ride.title}</h3>
        <span className="shrink-0 rounded-sm bg-secondary px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          {levelLabel[ride.level]}
        </span>
      </div>
      <p className="mt-1 text-sm font-semibold text-primary">
        {formatDate(ride.date)} · {ride.time}
      </p>
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <MapPin className="h-4 w-4 text-primary/80" />
          {ride.start} → {ride.end}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <RouteIcon className="h-4 w-4 text-primary/80" />
          {ride.km} km
        </span>
        <span className="inline-flex items-center gap-1.5">
          <Users className="h-4 w-4 text-primary/80" />
          {ride.riders.length}/{spotsLabel(ride.spots)}
        </span>
        {typeof distanceKm === "number" && (
          <span className="inline-flex items-center gap-1.5 text-primary">
            ~{distanceKm} km od Ciebie
          </span>
        )}
      </div>
      <p className="mt-3 text-xs uppercase tracking-wider text-muted-foreground">
        Prowadzi {ride.host} ·{" "}
        {joined ? (
          <span className="text-primary">jesteś zapisany</span>
        ) : isUnlimited(ride.spots) ? (
          "bez limitu miejsc"
        ) : free > 0 ? (
          `wolne miejsca: ${free}`
        ) : (
          "brak miejsc"
        )}
      </p>
    </Link>
  );
}