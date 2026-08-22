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

export type WeatherProvider = "open-meteo" | "visual-crossing" | "weatherapi" | "openweather";

export type RouteWeather = {
  points: RouteWeatherPoint[];
  /** Ostrzeżenie, gdy prognoza nie obejmuje daty wyjazdu. */
  notice: string | null;
  /** Diagnostyka (bez danych tajnych): faktycznie użyte źródło danych. */
  provider: WeatherProvider | null;
  /** Wszystkie źródła użyte dla prezentowanych punktów (gdy więcej niż jedno). */
  providers?: WeatherProvider[];
  /** Dostawcy wypróbowani przed sukcesem (kolejność prób). */
  fallbacksTried?: WeatherProvider[];
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

/**
 * Wybiera dokładnie 3 reprezentatywne punkty trasy: początek, punkt najbliższy
 * połowie dystansu i cel. Przy bardzo krótkiej/nietypowej geometrii zwraca
 * mniejszą liczbę rzeczywiście różnych punktów (bez duplikatów).
 */
function pickRepresentative(points: Array<[number, number]>): Sample[] {
  if (points.length === 0) return [];
  const cum: number[] = [0];
  for (let i = 1; i < points.length; i++) {
    cum.push(cum[i - 1]! + haversine(points[i - 1]!, points[i]!));
  }
  const last = points.length - 1;
  const total = cum[last] ?? 0;
  // Punkt najbliższy połowie dystansu (a przy zerowym dystansie — środek geometrii).
  let midIdx = Math.floor(last / 2);
  if (total > 0) {
    let bestDiff = Infinity;
    for (let i = 0; i <= last; i++) {
      const diff = Math.abs(cum[i]! - total / 2);
      if (diff < bestDiff) {
        bestDiff = diff;
        midIdx = i;
      }
    }
  }
  const indexes = [...new Set([0, midIdx, last])].sort((a, b) => a - b);
  const labels =
    indexes.length === 3
      ? ["Początek", "Połowa trasy", "Cel"]
      : indexes.length === 2
        ? ["Początek", "Cel"]
        : ["Początek"];
  return indexes.map((idx, i) => ({
    point: points[idx]!,
    fraction: total > 0 ? (cum[idx] ?? 0) / total : idx === 0 ? 0 : 1,
    label: labels[i]!,
  }));
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

/** Dokładnie 3 prezentowane punkty trasy. */
const MAX_POINTS = 3;


const RATE_LIMIT_NOTICE = "Serwis pogodowy jest chwilowo obciążony. Spróbuj ponownie za kilka minut.";
const RATE_LIMIT_STALE_NOTICE =
  "Serwis pogodowy jest chwilowo obciążony. Wyświetlam ostatnią dostępną prognozę.";
const STALE_NOTICE = "Wyświetlam ostatnią dostępną prognozę. Odświeżenie może potrwać kilka minut.";
const BOTH_FAILED_NOTICE = "Nie udało się pobrać prognozy. Spróbuj ponownie za kilka minut.";

/** Limit czasu jednego żądania do dostawcy prognozy. */
const REQUEST_TIMEOUT_MS = 8000;
/** Maksymalna liczba równoległych żądań do Visual Crossing (sekwencyjnie). */
const VC_CONCURRENCY = 1;
/** Maksymalna liczba punktów trasy pobieranych z Visual Crossing. */
const VC_MAX_POINTS = 3;
/** Globalny cooldown po HTTP 429 z Visual Crossing. */
const VC_COOLDOWN_MS = 600000;
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
let vcCooldownUntil = 0;
const inflight = new Map<string, Promise<void>>();


function cacheKey(input: { encodedPolyline: string; date: string; time: string; minutes: number }) {
  return `${input.date}|${input.time}|${Math.round(input.minutes)}|${input.encodedPolyline}`;
}

/** Tylko dla testów: czyści pamięć podręczną, cooldown i odświeżenia w tle. */
export function __clearRouteWeatherCache() {
  cache.clear();
  cooldownUntil = 0;
  vcCooldownUntil = 0;
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

/** Tymczasowe logi diagnostyczne (bez kluczy, URL-i i danych użytkowników). */
function audit(event: string, details: Record<string, unknown> = {}) {
  console.log("[weather-audit]", JSON.stringify({ event, ...details }));
}

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
  if (decoded.length === 0) return { points: [], notice: "Brak kształtu trasy", provider: null };

  const departure = new Date(localToUtc(input.date, input.time || "09:00"));
  if (Number.isNaN(departure.getTime())) {
    return { points: [], notice: "Nieprawidłowa data lub godzina wyjazdu", provider: null };
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
    audit("decision", { decision: "stale-cache", cooling, ageMinutes: Math.round(age / 60000) });
    return {
      ...usableStale.value,
      points: usableStale.value.points,
      notice: cooling ? RATE_LIMIT_STALE_NOTICE : STALE_NOTICE,
    };
  }
  if (cached) cache.delete(key);
  if (cooling) {
    // W czasie cooldownu pomijamy Open-Meteo i próbujemy zapasowych dostawców.
    if (!hasAnyFallbackKey()) {
      return { points: [], notice: RATE_LIMIT_NOTICE, provider: null };
    }

    const cooled = await computeRouteWeather(input, decoded, departure, { skipOpenMeteo: true });
    if (cooled.cacheable) storeInCache(key, cooled.value);
    return cooled.value;
  }

  const { value, cacheable } = await computeRouteWeather(input, decoded, departure);
  if (cacheable) storeInCache(key, value);
  return value;
}

type Sample = { point: [number, number]; fraction: number; label: string };

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
    label: sample.label,
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

/** Bufor bezpieczeństwa (1 h) przed pierwszym i po ostatnim punkcie trasy. */
const WINDOW_BUFFER_MS = 3600000;
/** Horyzont prognozy Open-Meteo. */
const FORECAST_HORIZON_MS = 16 * 86400000;

/** Zakres czasu potrzebny dla punktów trasy (z buforem 1 h). */
function routeWindow(
  samples: Sample[],
  departure: Date,
  minutes: number,
): { from: number; to: number } {
  const stamps = samples.map((s) => pointAt(s, departure, minutes).at.getTime());
  return {
    from: Math.min(...stamps) - WINDOW_BUFFER_MS,
    to: Math.max(...stamps) + WINDOW_BUFFER_MS,
  };
}

/** Data UTC (YYYY-MM-DD). */
function utcDate(ts: number): string {
  return new Date(ts).toISOString().slice(0, 10);
}

async function fetchOpenMeteo(
  samples: Sample[],
  departure: Date,
  minutes: number,
): Promise<OpenMeteoOutcome> {
  const window = routeWindow(samples, departure, minutes);
  if (window.from > Date.now() + FORECAST_HORIZON_MS) {
    audit("open-meteo", { status: null, timeout: false, rejectReason: "beyond-horizon" });
    return {
      ok: false,
      rateLimited: false,
      notice: "Prognoza jest dostępna maksymalnie 16 dni w przód",
    };
  }
  // Minimalny zakres dat: od daty UTC początku okna do lokalnej daty (Europe/Warsaw)
  // końca okna — pokrywa granicę dni i zmianę czasu przy mapowaniu w UTC.
  const startDate = utcDate(window.from);
  const endDate = localDate(window.to);
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${samples.map((s) => s.point[0].toFixed(4)).join(",")}` +
    `&longitude=${samples.map((s) => s.point[1].toFixed(4)).join(",")}` +
    `&hourly=temperature_2m,cloud_cover,wind_speed_10m,wind_gusts_10m,precipitation,precipitation_probability` +
    `&start_date=${startDate}&end_date=${endDate}&timezone=UTC`;

  try {
    const res = await fetchWithTimeout(url);
    if (!res.ok) {
      if (res.status === 429) cooldownUntil = Date.now() + COOLDOWN_MS;
      audit("open-meteo", {
        status: res.status,
        timeout: false,
        rejectReason: res.status === 429 ? "rate-limited" : "http-error",
        selectedPoints: samples.length,
      });
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
    const blocks = list.map((entry) => entry?.hourly ?? {});
    audit("open-meteo", {
      status: res.status,
      timeout: false,
      blocks: blocks.length,
      hours: blocks.map((b) => ((b["time"] as string[] | undefined) ?? []).length),
      selectedPoints: samples.length,
      rejectReason: null,
    });
    return { ok: true, blocks };
  } catch (e) {
    const timeout = e instanceof Error && e.name === "AbortError";
    audit("open-meteo", {
      status: null,
      timeout,
      rejectReason: timeout ? "timeout" : "network-error",
      selectedPoints: samples.length,
    });
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
    const missing: string[] = [];
    const val = (key: string, auditName: string) => {
      if (idx < 0) {
        missing.push(auditName);
        return null;
      }
      const value = (hourly[key] as Array<number | null> | undefined)?.[idx];
      if (typeof value !== "number") {
        complete = false;
        missing.push(auditName);
        notice =
          notice ?? "Serwis pogodowy zwrócił niepełne dane — część wartości może być nieznana";
        return null;
      }
      return value;
    };
    const mapped = {
      label,
      lat: sample.point[0],
      lng: sample.point[1],
      at: at.toISOString(),
      temperature: val("temperature_2m", "temp"),
      cloudCover: val("cloud_cover", "cloudcover"),
      windSpeed: val("wind_speed_10m", "windspeed"),
      windGusts: val("wind_gusts_10m", "windgust"),
      precipitation: val("precipitation", "precip"),
      precipitationChance: val("precipitation_probability", "precipprob"),
    } satisfies RouteWeatherPoint;
    if (missing.length > 0 || idx < 0) {
      audit("open-meteo-point", {
        label,
        matched: idx >= 0,
        diffMinutes:
          idx >= 0 && times[idx]
            ? Math.round((Date.parse(`${times[idx]}Z`) - at.getTime()) / 60000)
            : null,
        missingFields: missing,
      });
    }
    return mapped;
  });
  return { points, complete, notice };
}

/** Lokalna data (Europe/Warsaw) w formacie YYYY-MM-DD. */
function localDate(ts: number): string {
  const d = new Date(ts + tzOffsetMs(ts));
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

/** Lokalny czas (Europe/Warsaw) w formacie YYYY-MM-DDTHH:00:00 (pełna godzina). */
function localDateTime(ts: number): string {
  const d = new Date(ts + tzOffsetMs(ts));
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${localDate(ts)}T${pad(d.getUTCHours())}:00:00`;
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

/** Indeksy punktów pobieranych z fallbacku (te same, co prezentowane; maks. 3). */
function representativeIndexes(count: number, max = VC_MAX_POINTS): number[] {
  return Array.from({ length: Math.min(count, max) }, (_, i) => i);
}


/** Zapasowy dostawca prognozy (Timeline API, jednostki metryczne). */
async function fetchVisualCrossing(
  samples: Sample[],
  departure: Date,
  minutes: number,
): Promise<ProviderResult | null> {
  const key = process.env["VISUAL_CROSSING_API_KEY"];
  const now = Date.now();
  const cooling = vcCooldownUntil > now;
  audit("visual-crossing-start", {
    hasVisualCrossingKey: !!key,
    selectedPoints: samples.length,
    skippedByCooldown: cooling,
  });
  if (!key) return null;
  if (cooling) {
    audit("visual-crossing", {
      complete: false,
      requests: 0,
      skippedByCooldown: true,
      rejectReason: "cooldown",
      cooldownRemainingMinutes: Math.ceil((vcCooldownUntil - now) / 60000),
    });
    return {
      points: samples.map((s) => emptyPoint(s, departure, minutes)),
      complete: false,
      notice: BOTH_FAILED_NOTICE,
    };
  }

  let complete = true;
  let notice: string | null = null;
  let rateLimited = false;
  let requests = 0;

  const wanted = representativeIndexes(samples.length);
  const fetched = new Map<number, RouteWeatherPoint>();

  await mapWithLimit(wanted, VC_CONCURRENCY, async (sampleIndex) => {
    const sample = samples[sampleIndex]!;
    const { at, label } = pointAt(sample, departure, minutes);
    if (rateLimited) {
      // Po 429 nie wykonujemy kolejnych żądań dla tej trasy.
      complete = false;
      audit("visual-crossing-point", {
        label,
        status: null,
        timeout: false,
        rejectReason: "rate-limited",
        skippedByCooldown: true,
      });
      return;
    }
    // Najkrótszy obsługiwany zakres: daty lokalne lokalizacji (zwykle 1 dzień) z include=hours.
    // Zakres ISO datetime bywa odrzucany, więc trzymamy się dat — dopasowanie po datetimeEpoch (±60 min).
    const from = localDateTime(at.getTime() - WINDOW_BUFFER_MS).slice(0, 10);
    const to = localDateTime(at.getTime() + WINDOW_BUFFER_MS).slice(0, 10);
    const range = from === to ? from : `${from}/${to}`;
    const url =
      `https://weather.visualcrossing.com/VisualCrossingWebServices/rest/services/timeline/` +
      `${sample.point[0].toFixed(4)},${sample.point[1].toFixed(4)}/${range}` +
      `?unitGroup=metric&include=hours&contentType=json` +
      `&elements=datetimeEpoch,temp,cloudcover,windspeed,windgust,precip,precipprob` +
      `&key=${encodeURIComponent(key)}`;

    try {
      requests++;
      const res = await fetchWithTimeout(url);
      if (!res.ok) {
        complete = false;
        if (res.status === 429) {
          rateLimited = true;
          vcCooldownUntil = Date.now() + VC_COOLDOWN_MS;
          audit("visual-crossing-rate-limit", {
            cooldownMinutes: Math.round(VC_COOLDOWN_MS / 60000),
            requests,
          });
        }
        audit("visual-crossing-point", {
          label,
          status: res.status,
          timeout: false,
          rejectReason: res.status === 429 ? "rate-limited" : "http-error",
        });
        return;
      }
      const json = (await res.json()) as { days?: Array<{ hours?: VcHour[] }> };
      const days = json.days ?? [];
      const hours = days.flatMap((d) => d.hours ?? []);
      const idx = nearestIndex(
        hours.map((h) => (typeof h.datetimeEpoch === "number" ? h.datetimeEpoch * 1000 : NaN)),
        at.getTime(),
      );
      if (idx < 0) {
        complete = false;
        audit("visual-crossing-point", {
          label,
          status: res.status,
          timeout: false,
          days: days.length,
          hours: hours.length,
          rejectReason: "no-hour-match",
          missingFields: ["temp", "cloudcover", "windspeed", "windgust", "precip", "precipprob"],
        });
        return;
      }
      const hour = hours[idx]!;
      const missing: string[] = [];
      const num = (value: number | null | undefined, auditName: string) => {
        if (typeof value !== "number") {
          complete = false;
          missing.push(auditName);
          return null;
        }
        return value;
      };
      const mapped = {
        label,
        lat: sample.point[0],
        lng: sample.point[1],
        at: at.toISOString(),
        temperature: num(hour.temp, "temp"),
        cloudCover: num(hour.cloudcover, "cloudcover"),
        windSpeed: num(hour.windspeed, "windspeed"),
        windGusts: num(hour.windgust, "windgust"),
        precipitation: num(hour.precip, "precip"),
        precipitationChance: num(hour.precipprob, "precipprob"),
      } satisfies RouteWeatherPoint;
      fetched.set(sampleIndex, mapped);
      audit("visual-crossing-point", {
        label,
        status: res.status,
        timeout: false,
        days: days.length,
        hours: hours.length,
        diffMinutes:
          typeof hour.datetimeEpoch === "number"
            ? Math.round((hour.datetimeEpoch * 1000 - at.getTime()) / 60000)
            : null,
        missingFields: missing,
        rejectReason: missing.length > 0 ? "missing-fields" : null,
      });
    } catch (e) {
      complete = false;
      const timeout = e instanceof Error && e.name === "AbortError";
      audit("visual-crossing-point", {
        label,
        status: null,
        timeout,
        rejectReason: timeout ? "timeout" : "network-error",
      });
    }
  });

  // Punktów nieobjętych zapytaniem nie interpolujemy — brak danych to jawne null.
  const points = samples.map((sample, i) => {
    const own = fetched.get(i);
    return own ?? emptyPoint(sample, departure, minutes);
  });

  // Pełne pokrycie = każdy punkt trasy ma własną prognozę. Bez tego wynik nie jest
  // kompletny i nie może wejść do świeżego cache (UI oczekuje danych dla wszystkich punktów).
  const fullCoverage = fetched.size === samples.length;
  if (!fullCoverage) complete = false;
  if (!complete) notice = BOTH_FAILED_NOTICE;
  audit("visual-crossing", {
    complete,
    fullCoverage,
    selectedPoints: points.length,
    fetchedPoints: fetched.size,
    requests,
    rateLimited,
    skippedByCooldown: false,
    rejectReason: rateLimited
      ? "rate-limited"
      : complete
        ? null
        : fullCoverage
          ? "incomplete"
          : "partial-coverage",
  });
  return { points, complete, notice };
}

// ---------------------------------------------------------------------------
// Dostawcy 3 i 4: WeatherAPI.com oraz OpenWeather (5 day / 3 hour forecast).
// Klucze wyłącznie serwerowe; brak klucza = dostawca pomijany bez błędu.
// ---------------------------------------------------------------------------

type PointFields = Omit<RouteWeatherPoint, "label" | "lat" | "lng" | "at">;

/** Osobne cooldowny po HTTP 429 dla każdego dodatkowego dostawcy. */
const PROVIDER_COOLDOWN_MS = 600000;
const providerCooldowns: Record<"weatherapi" | "openweather", number> = {
  weatherapi: 0,
  openweather: 0,
};

function hasAnyFallbackKey(): boolean {
  return (
    !!process.env["VISUAL_CROSSING_API_KEY"] ||
    !!process.env["WEATHERAPI_API_KEY"] ||
    !!process.env["OPENWEATHER_API_KEY"]
  );
}

function completeFields(p: RouteWeatherPoint): boolean {
  return (
    p.temperature !== null &&
    p.cloudCover !== null &&
    p.windSpeed !== null &&
    p.windGusts !== null &&
    p.precipitation !== null &&
    p.precipitationChance !== null
  );
}

/**
 * Sekwencyjnie pobiera prognozę dla punktów trasy z dostawcy „punkt po punkcie”.
 * Zwraca null, gdy nie ma klucza (dostawca pomijany).
 */
async function fetchPerPointProvider(opts: {
  name: "weatherapi" | "openweather";
  keyName: "WEATHERAPI_API_KEY" | "OPENWEATHER_API_KEY";
  samples: Sample[];
  departure: Date;
  minutes: number;
  buildUrl: (sample: Sample, at: Date, key: string) => string;
  extract: (json: unknown, at: Date) => PointFields | null;
}): Promise<ProviderResult | null> {
  const key = process.env[opts.keyName];
  if (!key) {
    audit(`${opts.name}-skip`, { reason: "no-key" });
    return null;
  }
  const now = Date.now();
  if (providerCooldowns[opts.name] > now) {
    audit(opts.name, {
      complete: false,
      requests: 0,
      skippedByCooldown: true,
      rejectReason: "cooldown",
      cooldownRemainingMinutes: Math.ceil((providerCooldowns[opts.name] - now) / 60000),
    });
    return {
      points: opts.samples.map((s) => emptyPoint(s, opts.departure, opts.minutes)),
      complete: false,
      notice: BOTH_FAILED_NOTICE,
    };
  }

  const wanted = representativeIndexes(opts.samples.length, MAX_POINTS);
  const fetched = new Map<number, RouteWeatherPoint>();
  let requests = 0;
  let rateLimited = false;

  for (const index of wanted) {
    if (rateLimited) break;
    const sample = opts.samples[index]!;
    const { at, label } = pointAt(sample, opts.departure, opts.minutes);
    try {
      requests++;
      const res = await fetchWithTimeout(opts.buildUrl(sample, at, key));
      if (!res.ok) {
        if (res.status === 429) {
          rateLimited = true;
          providerCooldowns[opts.name] = Date.now() + PROVIDER_COOLDOWN_MS;
          audit(`${opts.name}-rate-limit`, {
            cooldownMinutes: Math.round(PROVIDER_COOLDOWN_MS / 60000),
            requests,
          });
        }
        audit(`${opts.name}-point`, {
          label,
          status: res.status,
          timeout: false,
          rejectReason: res.status === 429 ? "rate-limited" : "http-error",
        });
        continue;
      }
      let json: unknown;
      try {
        json = await res.json();
      } catch {
        audit(`${opts.name}-point`, { label, status: res.status, rejectReason: "invalid-json" });
        continue;
      }
      const fields = opts.extract(json, at);
      if (!fields) {
        audit(`${opts.name}-point`, { label, status: res.status, rejectReason: "no-hour-match" });
        continue;
      }
      const mapped: RouteWeatherPoint = {
        label,
        lat: sample.point[0],
        lng: sample.point[1],
        at: at.toISOString(),
        ...fields,
      };
      if (!completeFields(mapped)) {
        audit(`${opts.name}-point`, { label, status: res.status, rejectReason: "missing-fields" });
        continue;
      }
      fetched.set(index, mapped);
      audit(`${opts.name}-point`, { label, status: res.status, rejectReason: null });
    } catch (e) {
      const timeout = e instanceof Error && e.name === "AbortError";
      audit(`${opts.name}-point`, {
        label,
        status: null,
        timeout,
        rejectReason: timeout ? "timeout" : "network-error",
      });
    }
  }

  const points = opts.samples.map(
    (sample, i) => fetched.get(i) ?? emptyPoint(sample, opts.departure, opts.minutes),
  );
  const complete = fetched.size === opts.samples.length;
  audit(opts.name, {
    complete,
    requests,
    rateLimited,
    fetchedPoints: fetched.size,
    selectedPoints: points.length,
    rejectReason: rateLimited ? "rate-limited" : complete ? null : "partial-coverage",
  });
  return { points, complete, notice: complete ? null : BOTH_FAILED_NOTICE };
}

type WapiHour = {
  time_epoch?: number;
  temp_c?: number | null;
  cloud?: number | null;
  wind_kph?: number | null;
  gust_kph?: number | null;
  precip_mm?: number | null;
  chance_of_rain?: number | null;
};

/** Minimalna liczba dni forecast.json (1-3) potrzebna dla czasu przejazdu. */
function weatherApiDays(at: Date): number {
  const days = Math.ceil((at.getTime() + WINDOW_BUFFER_MS - Date.now()) / 86400000) + 1;
  return Math.min(Math.max(days, 1), 3);
}

async function fetchWeatherApi(
  samples: Sample[],
  departure: Date,
  minutes: number,
): Promise<ProviderResult | null> {
  return fetchPerPointProvider({
    name: "weatherapi",
    keyName: "WEATHERAPI_API_KEY",
    samples,
    departure,
    minutes,
    buildUrl: (sample, at, key) =>
      `https://api.weatherapi.com/v1/forecast.json?key=${encodeURIComponent(key)}` +
      `&q=${sample.point[0].toFixed(4)},${sample.point[1].toFixed(4)}` +
      `&days=${weatherApiDays(at)}&aqi=no&alerts=no`,
    extract: (json, at) => {
      const data = json as { forecast?: { forecastday?: Array<{ hour?: WapiHour[] }> } };
      const hours = (data.forecast?.forecastday ?? []).flatMap((d) => d.hour ?? []);
      const idx = nearestIndex(
        hours.map((h) => (typeof h.time_epoch === "number" ? h.time_epoch * 1000 : NaN)),
        at.getTime(),
      );
      if (idx < 0) return null;
      const h = hours[idx]!;
      const num = (v: number | null | undefined) => (typeof v === "number" ? v : null);
      return {
        temperature: num(h.temp_c),
        cloudCover: num(h.cloud),
        windSpeed: num(h.wind_kph),
        windGusts: num(h.gust_kph),
        precipitation: num(h.precip_mm),
        precipitationChance: num(h.chance_of_rain),
      };
    },
  });
}

type OwEntry = {
  dt?: number;
  main?: { temp?: number | null };
  clouds?: { all?: number | null };
  wind?: { speed?: number | null; gust?: number | null };
  rain?: Record<string, number | undefined>;
  snow?: Record<string, number | undefined>;
  pop?: number | null;
};

/** Rekordy OpenWeather są 3-godzinne — tolerancja dopasowania to 90 minut. */
const OW_TOLERANCE_MS = 5400000;

async function fetchOpenWeather(
  samples: Sample[],
  departure: Date,
  minutes: number,
): Promise<ProviderResult | null> {
  return fetchPerPointProvider({
    name: "openweather",
    keyName: "OPENWEATHER_API_KEY",
    samples,
    departure,
    minutes,
    buildUrl: (sample, _at, key) =>
      `https://api.openweathermap.org/data/2.5/forecast?lat=${sample.point[0].toFixed(4)}` +
      `&lon=${sample.point[1].toFixed(4)}&units=metric&appid=${encodeURIComponent(key)}`,
    extract: (json, at) => {
      const data = json as { list?: OwEntry[] };
      const list = data.list ?? [];
      const stamps = list.map((e) => (typeof e.dt === "number" ? e.dt * 1000 : NaN));
      let best = -1;
      let bestDiff = Infinity;
      for (let i = 0; i < stamps.length; i++) {
        const diff = Math.abs(stamps[i]! - at.getTime());
        if (!Number.isNaN(stamps[i]) && diff < bestDiff) {
          bestDiff = diff;
          best = i;
        }
      }
      if (best < 0 || bestDiff > OW_TOLERANCE_MS) return null;
      const e = list[best]!;
      const num = (v: number | null | undefined) => (typeof v === "number" ? v : null);
      const ms = num(e.wind?.speed);
      const gust = num(e.wind?.gust);
      const rain = num(e.rain?.["3h"]) ?? 0;
      const snow = num(e.snow?.["3h"]) ?? 0;
      const pop = num(e.pop);
      return {
        temperature: num(e.main?.temp),
        cloudCover: num(e.clouds?.all),
        windSpeed: ms === null ? null : ms * 3.6,
        windGusts: gust === null ? (ms === null ? null : ms * 3.6) : gust * 3.6,
        precipitation: rain + snow,
        precipitationChance: pop === null ? null : Math.round(pop * 100),
      };
    },
  });
}

async function computeRouteWeather(
  input: { encodedPolyline: string; date: string; time: string; minutes: number },
  decoded: Array<[number, number]>,
  departure: Date,
  options: { skipOpenMeteo?: boolean } = {},
): Promise<{ value: RouteWeather; cacheable: boolean }> {
  // Jedna wspólna lista punktów dla wszystkich dostawców: Początek → Połowa trasy → Cel.
  const samples = pickRepresentative(decoded).slice(0, MAX_POINTS);
  audit("start", {
    hasVisualCrossingKey: !!process.env["VISUAL_CROSSING_API_KEY"],
    hasWeatherApiKey: !!process.env["WEATHERAPI_API_KEY"],
    hasOpenWeatherKey: !!process.env["OPENWEATHER_API_KEY"],
    routePoints: decoded.length,
    selectedPoints: samples.length,
    labels: samples.map((s) => s.label),
    skipOpenMeteo: !!options.skipOpenMeteo,
  });

  let primaryNotice: string | null = null;
  const tried: WeatherProvider[] = [];
  // Punkty z realnymi danymi, uzupełniane kolejno przez dostawców (bez interpolacji).
  const merged = new Map<number, { point: RouteWeatherPoint; provider: WeatherProvider }>();

  const absorb = (result: ProviderResult | null, provider: WeatherProvider): boolean => {
    if (!result) return false;
    result.points.forEach((point, i) => {
      if (!merged.has(i) && completeFields(point)) merged.set(i, { point, provider });
    });
    return merged.size === samples.length;
  };

  const finish = (cacheable: boolean, notice: string | null) => {
    const entries = [...merged.entries()].sort((a, b) => a[0] - b[0]).map(([, v]) => v);
    const providers = [...new Set(entries.map((e) => e.provider))];
    const value: RouteWeather = {
      points: entries.map((e) => e.point),
      notice,
      provider: providers.length === 1 ? providers[0]! : (providers[0] ?? null),
      ...(providers.length > 1 ? { providers } : {}),
      ...(tried.length > 0 ? { fallbacksTried: tried } : {}),
    };
    audit("decision", {
      decision: providers.join("+") || "all-failed",
      points: value.points.length,
      cacheable,
      fallbacksTried: tried,
    });
    return { value, cacheable };
  };

  // 1. Open-Meteo (główny).
  if (!options.skipOpenMeteo) {
    tried.push("open-meteo");
    const outcome = await fetchOpenMeteo(samples, departure, input.minutes);
    if (outcome.ok) {
      const primary = mapOpenMeteo(samples, outcome.blocks, departure, input.minutes);
      if (absorb(primary, "open-meteo")) return finish(true, null);
      primaryNotice = primary.notice;
    } else {
      primaryNotice = outcome.notice;
    }
  } else {
    primaryNotice = RATE_LIMIT_NOTICE;
  }

  // 2. Visual Crossing, 3. WeatherAPI.com, 4. OpenWeather — sekwencyjnie, tylko po
  // błędzie/timeoucie/niekompletnej odpowiedzi poprzedniego dostawcy.
  const fallbacks: Array<{
    provider: Exclude<WeatherProvider, "open-meteo">;
    run: () => Promise<ProviderResult | null>;
  }> = [
    { provider: "visual-crossing", run: () => fetchVisualCrossing(samples, departure, input.minutes) },
    { provider: "weatherapi", run: () => fetchWeatherApi(samples, departure, input.minutes) },
    { provider: "openweather", run: () => fetchOpenWeather(samples, departure, input.minutes) },
  ];

  for (const fallback of fallbacks) {
    const result = await fallback.run();
    if (result === null) continue; // brak klucza → dostawca pomijany bez błędu
    tried.push(fallback.provider);
    if (absorb(result, fallback.provider)) return finish(true, null);
  }

  // Częściowe pokrycie: pokazujemy tylko punkty z realnymi danymi, bez cache.
  if (merged.size > 0) return finish(false, BOTH_FAILED_NOTICE);
  return finish(false, primaryNotice ?? BOTH_FAILED_NOTICE);
}

