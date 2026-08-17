import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { CloudSun, Droplets, Thermometer, Wind } from "lucide-react";
import { forecastRouteWeather, type RouteWeather as RouteWeatherData } from "@/lib/weather.functions";

function hhmm(iso: string) {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}

const num = (v: number | null, unit: string, digits = 0) =>
  v === null || v === undefined ? "—" : `${v.toFixed(digits)}${unit}`;

/** Prognoza pogody na godzinę wyjazdu w kilku punktach wyznaczonej trasy. */
export function RouteWeather({
  encodedPolyline,
  date,
  time,
  minutes,
  className = "",
}: {
  encodedPolyline: string | null;
  date: string;
  time: string;
  minutes: number;
  className?: string;
}) {
  const forecast = useServerFn(forecastRouteWeather);
  const [data, setData] = useState<RouteWeatherData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ready = !!encodedPolyline && /^\d{4}-\d{2}-\d{2}$/.test(date) && /^\d{2}:\d{2}/.test(time);

  useEffect(() => {
    if (!ready) {
      setData(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    forecast({
      data: {
        encodedPolyline: encodedPolyline!,
        date,
        time: time.slice(0, 5),
        minutes: Math.round(minutes),
      },
    })
      .then((res) => {
        if (!cancelled) setData(res);
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "Nie udało się pobrać pogody");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, encodedPolyline, date, time, minutes]);

  if (!ready) {
    return (
      <div className={`rounded-lg border border-border bg-card p-4 ${className}`}>
        <Header />
        <p className="mt-2 text-xs text-muted-foreground">
          Przelicz trasę oraz podaj datę i godzinę wyjazdu, żeby zobaczyć prognozę.
        </p>
      </div>
    );
  }

  return (
    <div className={`rounded-lg border border-border bg-card p-4 ${className}`}>
      <Header />
      {loading && <p className="mt-2 text-xs text-muted-foreground">Sprawdzam pogodę na trasie…</p>}
      {error && <p className="mt-2 text-xs text-destructive">{error}</p>}
      {data?.notice && <p className="mt-2 text-xs text-primary">{data.notice}</p>}
      {data && data.points.length > 0 && (
        <ul className="mt-3 space-y-2">
          {data.points.map((p) => (
            <li key={p.label + p.at} className="rounded-md border border-border bg-secondary/40 p-3">
              <div className="flex items-baseline justify-between">
                <span className="text-xs font-semibold uppercase tracking-wider text-foreground">
                  {p.label}
                </span>
                <span className="text-[11px] text-muted-foreground">ok. {hhmm(p.at)}</span>
              </div>
              <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-muted-foreground sm:grid-cols-4">
                <Metric icon={<Thermometer className="h-3.5 w-3.5" />} label="Temperatura">
                  {num(p.temperature, " °C")}
                </Metric>
                <Metric icon={<CloudSun className="h-3.5 w-3.5" />} label="Zachmurzenie">
                  {num(p.cloudCover, " %")}
                </Metric>
                <Metric icon={<Wind className="h-3.5 w-3.5" />} label="Wiatr">
                  {num(p.windSpeed, " km/h")}
                  {p.windGusts !== null && ` (do ${p.windGusts.toFixed(0)})`}
                </Metric>
                <Metric icon={<Droplets className="h-3.5 w-3.5" />} label="Deszcz">
                  {num(p.precipitation, " mm", 1)}
                  {p.precipitationChance !== null && ` · ${p.precipitationChance.toFixed(0)}%`}
                </Metric>
              </div>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-2 text-[11px] text-muted-foreground">
        Dane: Open-Meteo. Godziny to szacowany czas dojazdu do kolejnych punktów trasy.
      </p>
    </div>
  );
}

function Header() {
  return (
    <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
      Pogoda na trasie
    </span>
  );
}

function Metric({
  icon,
  label,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <span className="flex items-center gap-1 text-[10px] uppercase tracking-wider">
        <span className="text-primary">{icon}</span>
        {label}
      </span>
      <span className="mt-0.5 block text-sm font-semibold text-foreground">{children}</span>
    </div>
  );
}
