import { useEffect, useMemo, useState } from "react";
import { Clock } from "lucide-react";

type Props = {
  date: string;
  time: string;
  durationMinutes: number | null;
  km: number;
};

function parseStart(date: string, time: string): Date {
  return new Date(`${date}T${time}:00`);
}

function formatDuration(ms: number): string {
  if (ms <= 0) return "0h 0m 0s";
  const totalSeconds = Math.ceil(ms / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const parts = [
    days > 0 ? `${days}d` : "",
    `${hours}h`,
    `${String(minutes).padStart(2, "0")}m`,
    `${String(seconds).padStart(2, "0")}s`,
  ].filter(Boolean);
  return parts.join(" ");
}

function formatDurationShort(ms: number): string {
  if (ms <= 0) return "0h 0m";
  const totalSeconds = Math.ceil(ms / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const parts = [days > 0 ? `${days}d` : "", `${hours}h`, `${minutes}m`].filter(Boolean);
  return parts.join(" ");
}

function formatStamp(d: Date): string {
  return d.toLocaleString("pl-PL", {
    weekday: "short",
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function RideCountdown({ date, time, durationMinutes, km }: Props) {
  const start = useMemo(() => parseStart(date, time), [date, time]);
  const fallbackMinutes = useMemo(() => {
    if (durationMinutes != null) return durationMinutes;
    return Math.max(1, Math.round(km * 1.2));
  }, [durationMinutes, km]);
  const end = useMemo(
    () => new Date(start.getTime() + fallbackMinutes * 60 * 1000),
    [start, fallbackMinutes],
  );

  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const toStart = start.getTime() - now.getTime();
  const toEnd = end.getTime() - now.getTime();

  if (toEnd <= 0) {
    return (
      <div className="mt-4 rounded-lg border border-border bg-card px-4 py-3 text-sm">
        <div className="flex items-center gap-2">
          <Clock className="h-4 w-4 shrink-0 text-primary" />
          <span className="text-muted-foreground">Wyprawa zakończona</span>
        </div>
        <Schedule start={start} end={end} />
      </div>
    );
  }

  if (toStart <= 0) {
    return (
      <div className="mt-4 rounded-lg border border-border bg-card px-4 py-3 text-sm">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-muted-foreground">
          <Clock className="h-4 w-4 shrink-0 text-primary" />
          <span>Wyprawa w trakcie</span>
          <span className="text-foreground">
            Do końca: <span className="font-semibold text-primary">{formatDuration(toEnd)}</span>
          </span>
        </div>
        <Schedule start={start} end={end} />
      </div>
    );
  }

  return (
    <div className="mt-4 rounded-lg border border-border bg-card px-4 py-3 text-sm">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-muted-foreground">
        <Clock className="h-4 w-4 shrink-0 text-primary" />
        <span>Do startu:</span>
        <span className="font-semibold tabular-nums text-foreground">{formatDuration(toStart)}</span>
      </div>
      <div className="mt-1 text-muted-foreground sm:pl-6">
        Do końca wyjazdu: <span className="font-semibold text-foreground">{formatDurationShort(toEnd)}</span>
      </div>
      <Schedule start={start} end={end} />
    </div>
  );
}

function Schedule({ start, end }: { start: Date; end: Date }) {
  return (
    <dl className="mt-2 grid grid-cols-1 gap-1 border-t border-border pt-2 text-xs text-muted-foreground sm:grid-cols-2">
      <div className="flex flex-wrap gap-x-1.5">
        <dt className="font-semibold uppercase tracking-wider">Start:</dt>
        <dd className="text-foreground">{formatStamp(start)}</dd>
      </div>
      <div className="flex flex-wrap gap-x-1.5">
        <dt className="font-semibold uppercase tracking-wider">Koniec (ok.):</dt>
        <dd className="text-foreground">{formatStamp(end)}</dd>
      </div>
    </dl>
  );
}
