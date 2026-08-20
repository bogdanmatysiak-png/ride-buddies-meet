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

const RATE_LIMIT_NOTICE = "Serwis pogodowy jest chwilowo obciążony. Spróbuj ponownie za kilka minut.";
const RATE_LIMIT_STALE_NOTICE =
  "Serwis pogodowy jest chwilowo obciążony. Wyświetlam ostatnią dostępną prognozę.";
const STALE_NOTICE = "Wyświetlam ostatnią dostępną prognozę. Odświeżenie może potrwać kilka minut.";
const BOTH_FAILED_NOTICE = "Nie udało się pobrać prognozy. Spróbuj ponownie za kilka minut.";

/** Limit czasu jednego żądania do dostawcy prognozy. */
const REQUEST_TIMEOUT_MS = 8000;
/** Maksymalna liczba równoległych żądań do Visual Crossing. */
const VC_CONCURRENCY = 2;
/** Tolerancja dopasowania godziny prognozy do czasu punktu trasy. */
const MATCH_TOLERANCE_MS = 3600000;

/** Cache prognoz: świeży 10 minut, użyteczny (stale) do 60 minut, maks. 50 wpisów. */
const CACHE_TTL_MS = 600000;
const CACHE_STALE_MS = 3600000;
/** Globalny cooldown po HTTP 429 z Open-Meteo. */
const COOLDOWN_MS = 300000;
const CACHE_MAX_ENTRIES = 50;
const cache = new Map<string, { storedAt: number; value: RouteWeather }>();
let cooldownUntil = 0;
const inflight = new Map<string, Promise<void>>();

function cacheKey(input: { encodedPolyline: string; date: string; time: string; minutes: number }) {
  return `${input.date}|${input.time}|${Math.round(input.minutes)}|${input.encodedPolyline}`;
}

/** Tylko dla testów: czyści pamięć podręczną, cooldown i odświeżenia w tle. */
export function __clearRouteWeatherCache() {
  cache.clear();
  cooldownUntil = 0;
  inflight.clear();
}

/** Tylko dla testów: czeka na zakończenie odświeżeń w tle. */
export async function __routeWeatherPending() {
  await Promise.all([...inflight.values()]);
}

function storeInCache(key: string, value: RouteWeather) {
  if (!cache.has(key) && cache.size >= CACHE_MAX_ENTRIES) {
    const oldest = cache.keys().next();
    if (!oldest.done) cache.delete(oldest.value);
  }
  cache.set(key, { storedAt: Date.now(), value });
}

/** Uruchamia jedno odświeżenie w tle dla danego klucza (bez równoległych duplikatów). */
function scheduleRefresh(
  key: string,
  input: { encodedPolyline: string; date: string; time: string; minutes: number },
  decoded: Array<[number, number]>,
  departure: Date,
) {
  if (inflight.has(key)) return;
  const promise = (async () => {
    try {
      const { value, cacheable } = await computeRouteWeather(input, decoded, departure);
      if (cacheable) storeInCache(key, value);
    } catch {
      // Zachowujemy starą, poprawną prognozę.
    } finally {
      inflight.delete(key);
    }
  })();
  promise.catch(() => {});
  inflight.set(key, promise);
}

type HourlyBlock = Record<string, Array<number | null> | string[] | undefined>;

async function fetchWithTimeout(url: string): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

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

  const key = cacheKey(input);
  const cached = cache.get(key);
  const now = Date.now();
  const age = cached ? now - cached.storedAt : Infinity;
  if (cached && age <= CACHE_TTL_MS) return cached.value;
  const usableStale = cached && age <= CACHE_STALE_MS ? cached : null;
  const cooling = cooldownUntil > now;

  if (usableStale) {
    if (!cooling) scheduleRefresh(key, input, decoded, departure);
    return {
      points: usableStale.value.points,
      notice: cooling ? RATE_LIMIT_STALE_NOTICE : STALE_NOTICE,
    };
  }
  if (cached) cache.delete(key);
  if (cooling) return { points: [], notice: RATE_LIMIT_NOTICE };

  const { value, cacheable } = await computeRouteWeather(input, decoded, departure);
  if (cacheable) storeInCache(key, value);
  return value;
}

type Sample = { point: [number, number]; fraction: number };

type ProviderResult = {
  points: RouteWeatherPoint[];
  /** true, gdy wszystkie punkty mają dopasowane i kompletne dane. */
  complete: boolean;
  notice: string | null;
};

function pointAt(
  sample: Sample,
  departure: Date,
  minutes: number,
): { at: Date; label: string } {
  return {
    at: new Date(departure.getTime() + sample.fraction * minutes * 60000),
    label:
      LABELS[Math.round(sample.fraction * 4)] ?? `${Math.round(sample.fraction * 100)}%`,
  };
}

function emptyPoint(sample: Sample, departure: Date, minutes: number): RouteWeatherPoint {
  const { at, label } = pointAt(sample, departure, minutes);
  return {
    label,
    lat: sample.point[0],
    lng: sample.point[1],
    at: at.toISOString(),
    temperature: null,
    cloudCover: null,
    windSpeed: null,
    windGusts: null,
    precipitation: null,
    precipitationChance: null,
  };
}

/** Indeks najbliższej godziny prognozy (tolerancja 1 h) albo -1. */
function nearestIndex(timestamps: number[], target: number): number {
  let best = -1;
  let bestDiff = Infinity;
  for (let i = 0; i < timestamps.length; i++) {
    const ts = timestamps[i]!;
    const diff = Math.abs(ts - target);
    if (!Number.isNaN(ts) && diff < bestDiff) {
      bestDiff = diff;
      best = i;
    }
  }
  return best >= 0 && bestDiff <= MATCH_TOLERANCE_MS ? best : -1;
}

type OpenMeteoOutcome =
  | { ok: true; blocks: HourlyBlock[] }
  | { ok: false; rateLimited: boolean; notice: string };

async function fetchOpenMeteo(samples: Sample[]): Promise<OpenMeteoOutcome> {
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${samples.map((s) => s.point[0].toFixed(4)).join(",")}` +
    `&longitude=${samples.map((s) => s.point[1].toFixed(4)).join(",")}` +
    `&hourly=temperature_2m,cloud_cover,wind_speed_10m,wind_gusts_10m,precipitation,precipitation_probability` +
    `&forecast_days=16&timezone=UTC`;
  try {
    const res = await fetchWithTimeout(url);
    if (!res.ok) {
      if (res.status === 429) cooldownUntil = Date.now() + COOLDOWN_MS;
      return {
        ok: false,
        rateLimited: res.status === 429,
        notice:
          res.status === 429
            ? RATE_LIMIT_NOTICE
            : `Serwis pogodowy odpowiedział błędem (${res.status})`,
      };
    }
    const json = (await res.json()) as { hourly?: HourlyBlock } | Array<{ hourly?: HourlyBlock }>;
    const list = Array.isArray(json) ? json : [json];
    return { ok: true, blocks: list.map((entry) => entry?.hourly ?? {}) };
  } catch {
    return { ok: false, rateLimited: false, notice: "Serwis pogodowy chwilowo niedostępny" };
  }
}

function mapOpenMeteo(
  samples: Sample[],
  blocks: HourlyBlock[],
  departure: Date,
  minutes: number,
): ProviderResult {
  let notice: string | null = null;
  let complete = true;
  const points = samples.map((sample, i) => {
    const { at, label } = pointAt(sample, departure, minutes);
    const hourly = blocks[i] ?? blocks[0] ?? {};
    const times = (hourly["time"] as string[] | undefined) ?? [];
    if (times.length === 0) {
      complete = false;
      notice = notice ?? "Serwis pogodowy nie zwrócił danych godzinowych";
    }
    let idx = times.indexOf(hourKey(at));
    if (idx < 0 && times.length > 0) {
      idx = nearestIndex(
        times.map((t) => Date.parse(`${t}Z`)),
        at.getTime(),
      );
      if (idx < 0) {
        complete = false;
        notice = "Prognoza jest dostępna maksymalnie 16 dni w przód";
      }
    }
    const val = (key: string) => {
      if (idx < 0) return null;
      const value = (hourly[key] as Array<number | null> | undefined)?.[idx];
      if (typeof value !== "number") {
        complete = false;
        notice =
          notice ?? "Serwis pogodowy zwrócił niepełne dane — część wartości może być nieznana";
        return null;
      }
      return value;
    };
    return {
      label,
      lat: sample.point[0],
      lng: sample.point[1],
      at: at.toISOString(),
      temperature: val("temperature_2m"),
      cloudCover: val("cloud_cover"),
      windSpeed: val("wind_speed_10m"),
      windGusts: val("wind_gusts_10m"),
      precipitation: val("precipitation"),
      precipitationChance: val("precipitation_probability"),
    } satisfies RouteWeatherPoint;
  });
  return { points, complete, notice };
}

/** Lokalna data (Europe/Warsaw) w formacie YYYY-MM-DD. */
function localDate(ts: number): string {
  const d = new Date(ts + tzOffsetMs(ts));
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

type VcHour = {
  datetimeEpoch?: number;
  temp?: number | null;
  cloudcover?: number | null;
  windspeed?: number | null;
  windgust?: number | null;
  precip?: number | null;
  precipprob?: number | null;
};

/** Uruchamia zadania z ograniczoną równoległością. */
async function mapWithLimit<T, R>(
  items: T[],
  limit: number,
  task: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const out = new Array<R>(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      out[index] = await task(items[index]!, index);
    }
  });
  await Promise.all(workers);
  return out;
}

/** Zapasowy dostawca prognozy (Timeline API, jednostki metryczne). */
async function fetchVisualCrossing(
  samples: Sample[],
  departure: Date,
  minutes: number,
): Promise<ProviderResult | null> {
  const key = process.env["VISUAL_CROSSING_API_KEY"];
  if (!key) return null;

  let complete = true;
  let notice: string | null = null;

  const points = await mapWithLimit(samples, VC_CONCURRENCY, async (sample) => {
    const { at, label } = pointAt(sample, departure, minutes);
    const day = localDate(at.getTime());
    const url =
      `https://weather.visualcrossing.com/VisualCrossingWebServices/rest/services/timeline/` +
      `${sample.point[0].toFixed(4)},${sample.point[1].toFixed(4)}/${day}/${day}` +
      `?unitGroup=metric&include=hours&contentType=json` +
      `&elements=datetimeEpoch,temp,cloudcover,windspeed,windgust,precip,precipprob` +
      `&key=${encodeURIComponent(key)}`;
    try {
      const res = await fetchWithTimeout(url);
      if (!res.ok) {
        complete = false;
        return emptyPoint(sample, departure, minutes);
      }
      const json = (await res.json()) as { days?: Array<{ hours?: VcHour[] }> };
      const hours = (json.days ?? []).flatMap((d) => d.hours ?? []);
      const idx = nearestIndex(
        hours.map((h) => (typeof h.datetimeEpoch === "number" ? h.datetimeEpoch * 1000 : NaN)),
        at.getTime(),
      );
      if (idx < 0) {
        complete = false;
        return emptyPoint(sample, departure, minutes);
      }
      const hour = hours[idx]!;
      const num = (value: number | null | undefined) => {
        if (typeof value !== "number") {
          complete = false;
          return null;
        }
        return value;
      };
      return {
        label,
        lat: sample.point[0],
        lng: sample.point[1],
        at: at.toISOString(),
        temperature: num(hour.temp),
        cloudCover: num(hour.cloudcover),
        windSpeed: num(hour.windspeed),
        windGusts: num(hour.windgust),
        precipitation: num(hour.precip),
        precipitationChance: num(hour.precipprob),
      } satisfies RouteWeatherPoint;
    } catch {
      complete = false;
      return emptyPoint(sample, departure, minutes);
    }
  });

  if (!complete) notice = BOTH_FAILED_NOTICE;
  return { points, complete, notice };
}

async function computeRouteWeather(
  input: { encodedPolyline: string; date: string; time: string; minutes: number },
  decoded: Array<[number, number]>,
  departure: Date,
  options: { skipOpenMeteo?: boolean } = {},
): Promise<{ value: RouteWeather; cacheable: boolean }> {
  const samples = pickAlong(decoded, Math.min(5, Math.max(2, decoded.length)));

  let primary: ProviderResult | null = null;
  let primaryNotice: string | null = null;

  if (!options.skipOpenMeteo) {
    const outcome = await fetchOpenMeteo(samples);
    if (outcome.ok) {
      primary = mapOpenMeteo(samples, outcome.blocks, departure, input.minutes);
      if (primary.complete) return { value: { points: primary.points, notice: null }, cacheable: true };
      primaryNotice = primary.notice;
    } else {
      primaryNotice = outcome.notice;
    }
  } else {
    primaryNotice = RATE_LIMIT_NOTICE;
  }

  // Fallback: Visual Crossing (klucz wyłącznie serwerowy).
  const backup = await fetchVisualCrossing(samples, departure, input.minutes);
  if (backup?.complete) {
    return { value: { points: backup.points, notice: null }, cacheable: true };
  }
  if (backup) {
    return { value: { points: [], notice: BOTH_FAILED_NOTICE }, cacheable: false };
  }

  // Brak zapasowego dostawcy — zachowaj dotychczasowe zachowanie Open-Meteo.
  if (primary && primary.points.some((p) => p.temperature !== null)) {
    return { value: { points: primary.points, notice: primary.notice }, cacheable: false };
  }
  return { value: { points: [], notice: primaryNotice ?? BOTH_FAILED_NOTICE }, cacheable: false };
}
