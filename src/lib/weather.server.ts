/** Prognoza pogody wzdłuż trasy (Open-Meteo, bez klucza API). */
import { decodePolyline } from "./speed-cameras.server";

export type RouteWeatherPoint = {
  /** Etykieta odcinka, np. "Start" / "50%" / "Cel". */
  label: string;
  lat: number;
  lng: number;
  /** Szacowany czas dojazdu do tego punktu (ISO, lokalny czas trasy). */
  at: string;
  temperature: number | null;
  cloudCover: number | null;
  windSpeed: number | null;
  windGusts: number | null;
  precipitation: number | null;
  precipitationChance: number | null;
};

export type RouteWeather = {
  points: RouteWeatherPoint[];
  /** Ostrzeżenie, gdy prognoza nie obejmuje daty wyjazdu. */
  notice: string | null;
};

function haversine(a: [number, number], b: [number, number]): number {
  const toRad = (v: number) => (v * Math.PI) / 180;
  const dLat = toRad(b[0] - a[0]);
  const dLng = toRad(b[1] - a[1]);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a[0])) * Math.cos(toRad(b[0])) * Math.sin(dLng / 2) ** 2;
  return 6371000 * 2 * Math.asin(Math.sqrt(h));
}

/** Wybiera punkty co równy dystans (0%, 25%, 50%, 75%, 100%). */
function pickAlong(points: Array<[number, number]>, count: number) {
  const cum: number[] = [0];
  for (let i = 1; i < points.length; i++) {
    cum.push(cum[i - 1]! + haversine(points[i - 1]!, points[i]!));
  }
  const total = cum[cum.length - 1] ?? 0;
  const out: Array<{ point: [number, number]; fraction: number }> = [];
  for (let i = 0; i < count; i++) {
    const fraction = count === 1 ? 0 : i / (count - 1);
    const target = total * fraction;
    let idx = cum.findIndex((d) => d >= target);
    if (idx < 0) idx = points.length - 1;
    out.push({ point: points[idx]!, fraction });
  }
  return out;
}

function hourKey(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(
    date.getUTCDate(),
  )}T${pad(date.getUTCHours())}:00`;
}

const TZ = "Europe/Warsaw";

/** Przesunięcie strefy (ms) względem UTC w danym momencie. */
function tzOffsetMs(ts: number): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: TZ,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const p: Record<string, string> = {};
  for (const part of dtf.formatToParts(new Date(ts))) p[part.type] = part.value;
  const asUtc = Date.UTC(
    Number(p["year"]),
    Number(p["month"]) - 1,
    Number(p["day"]),
    Number(p["hour"]) === 24 ? 0 : Number(p["hour"]),
    Number(p["minute"]),
    Number(p["second"]),
  );
  return asUtc - ts;
}

/** Zamienia lokalną datę/godzinę wyjazdu (Europe/Warsaw) na moment UTC. */
function localToUtc(date: string, time: string): number {
  const naive = Date.parse(`${date}T${time}:00Z`);
  if (Number.isNaN(naive)) return NaN;
  let ts = naive;
  for (let i = 0; i < 2; i++) ts = naive - tzOffsetMs(ts);
  return ts;
}

const LABELS = ["Start", "25% trasy", "Połowa trasy", "75% trasy", "Cel"];

export async function fetchRouteWeather(input: {
  encodedPolyline: string;
  date: string;
  time: string;
  minutes: number;
}): Promise<RouteWeather> {
  const decoded = decodePolyline(input.encodedPolyline);
  if (decoded.length === 0) return { points: [], notice: "Brak kształtu trasy" };

  const departure = new Date(localToUtc(input.date, input.time || "09:00"));
  if (Number.isNaN(departure.getTime())) {
    return { points: [], notice: "Nieprawidłowa data lub godzina wyjazdu" };
  }

  const samples = pickAlong(decoded, Math.min(5, Math.max(2, decoded.length)));
  const results: RouteWeatherPoint[] = [];
  let notice: string | null = null;

  await Promise.all(
    samples.map(async (sample, i) => {
      const at = new Date(departure.getTime() + sample.fraction * input.minutes * 60000);
      const url =
        `https://api.open-meteo.com/v1/forecast?latitude=${sample.point[0].toFixed(4)}` +
        `&longitude=${sample.point[1].toFixed(4)}` +
        `&hourly=temperature_2m,cloud_cover,wind_speed_10m,wind_gusts_10m,precipitation,precipitation_probability` +
        `&forecast_days=16&timezone=UTC`;
      let hourly: Record<string, Array<number | null>> & { time?: string[] } = {};
      try {
        const res = await fetch(url);
        if (res.ok) hourly = ((await res.json()) as { hourly?: typeof hourly }).hourly ?? {};
      } catch {
        notice = "Serwis pogodowy chwilowo niedostępny";
      }
      const times = (hourly.time as string[] | undefined) ?? [];
      const idx = times.indexOf(hourKey(at));
      if (idx < 0 && times.length > 0) {
        notice = "Prognoza jest dostępna maksymalnie 16 dni w przód";
      }
      onst val = (key: string) => {
  const value = idx >= 0 ? hourly[key]?.[idx] : null;

  if (i === 0 && value === undefined) {
    notice = `Brakuje danych „${key}”. Dostępne pola: ${Object.keys(hourly).join(", ")}`;
  }

  return value ?? null;
};
      results[i] = {
        label: LABELS[Math.round(sample.fraction * 4)] ?? `${Math.round(sample.fraction * 100)}%`,
        lat: sample.point[0],
        lng: sample.point[1],
        at: at.toISOString(),
        temperature: val("temperature_2m"),
        cloudCover: val("cloud_cover"),
        windSpeed: val("wind_speed_10m"),
        windGusts: val("wind_gusts_10m"),
        precipitation: val("precipitation"),
        precipitationChance: val("precipitation_probability"),
      };
    }),
  );

  return { points: results.filter(Boolean), notice };
}
