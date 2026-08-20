import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { __clearRouteWeatherCache, __routeWeatherPending, fetchRouteWeather } from "./weather.server";

// Prosta polilinia: kilka punktów w Polsce.
const POLYLINE = "_p~iF~ps|U_ulLnnqC_mqNvxq`@";

const times = ["2026-08-22T09:00", "2026-08-22T10:00", "2026-08-22T11:00", "2026-08-22T12:00"];

function block(offset: number) {
  return {
    hourly: {
      time: times,
      temperature_2m: times.map((_, i) => 15 + offset + i),
      cloud_cover: times.map(() => 50 + offset),
      wind_speed_10m: times.map(() => 10 + offset),
      wind_gusts_10m: times.map(() => 20 + offset),
      precipitation: times.map(() => 0),
      precipitation_probability: times.map(() => 30 + offset),
    },
  };
}

const input = { encodedPolyline: POLYLINE, date: "2026-08-22", time: "11:00", minutes: 60 };

function okResponse(body: unknown) {
  return { ok: true, status: 200, json: async () => body } as unknown as Response;
}

describe("fetchRouteWeather", () => {
  beforeEach(() => {
    __clearRouteWeatherCache();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-20T07:00:00Z"));
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("wykonuje jedno zbiorcze zapytanie i mapuje odpowiedzi po kolei", async () => {
    const fetchMock = vi.fn(async (_url: string) => okResponse([block(0), block(1), block(2)]));
    vi.stubGlobal("fetch", fetchMock);

    const res = await fetchRouteWeather(input);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const url = String(fetchMock.mock.calls[0]![0]);
    expect(url).toContain("latitude=");
    expect(url.match(/latitude=([^&]+)/)![1]!.split(",").length).toBe(res.points.length);
    expect(url).toContain("timezone=UTC");
    expect(url).toContain("precipitation_probability");
    expect(res.notice).toBeNull();
    // punkt 0 czyta blok 0 (offset 0) o 09:00 UTC, ostatni punkt blok 2 (offset 2) o 10:00 UTC
    expect(res.points[0]!.temperature).toBe(15);
    expect(res.points[0]!.cloudCover).toBe(50);
    expect(res.points[res.points.length - 1]!.cloudCover).toBe(52);
    expect(res.points[res.points.length - 1]!.temperature).toBe(18); // 10:00 UTC w bloku 2
  });

  it("świeży cache nie wykonuje dodatkowego zapytania", async () => {
    const fetchMock = vi.fn(async () => okResponse([block(0), block(0), block(0)]));
    vi.stubGlobal("fetch", fetchMock);

    await fetchRouteWeather(input); // miss
    await fetchRouteWeather(input); // hit
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await fetchRouteWeather({ ...input, minutes: 300 }); // inny klucz → miss
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("stary cache: zwraca stare dane od razu i odświeża w tle jeden raz", async () => {
    const fetchMock = vi.fn(async () => okResponse([block(0), block(0), block(0)]));
    vi.stubGlobal("fetch", fetchMock);

    const first = await fetchRouteWeather(input);
    vi.setSystemTime(new Date("2026-08-20T07:11:00Z")); // > TTL, < 60 min

    const stale = await fetchRouteWeather(input);
    expect(stale.notice).toBe(
      "Wyświetlam ostatnią dostępną prognozę. Odświeżenie może potrwać kilka minut.",
    );
    expect(stale.points[0]!.temperature).toBe(first.points[0]!.temperature);

    // Równoległe wywołania nie mnożą odświeżeń w tle.
    await Promise.all([fetchRouteWeather(input), fetchRouteWeather(input)]);
    await __routeWeatherPending();
    expect(fetchMock).toHaveBeenCalledTimes(2);

    // Po odświeżeniu wpis jest znowu świeży.
    const fresh = await fetchRouteWeather(input);
    expect(fresh.notice).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("nieudane odświeżenie w tle zachowuje starą prognozę", async () => {
    let fail = false;
    const fetchMock = vi.fn(async () =>
      fail
        ? ({ ok: false, status: 500, json: async () => ({}) } as unknown as Response)
        : okResponse([block(0), block(0), block(0)]),
    );
    vi.stubGlobal("fetch", fetchMock);

    await fetchRouteWeather(input);
    fail = true;
    vi.setSystemTime(new Date("2026-08-20T07:11:00Z"));
    await fetchRouteWeather(input);
    await __routeWeatherPending();

    const again = await fetchRouteWeather(input);
    expect(again.points[0]!.temperature).toBe(15);
  });

  it("429 włącza cooldown: brak cache → komunikat i brak zapytań", async () => {
    const fetchMock = vi.fn(
      async () => ({ ok: false, status: 429, json: async () => ({}) }) as unknown as Response,
    );
    vi.stubGlobal("fetch", fetchMock);

    await fetchRouteWeather(input);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const second = await fetchRouteWeather(input);
    expect(second.notice).toBe(
      "Serwis pogodowy jest chwilowo obciążony. Spróbuj ponownie za kilka minut.",
    );
    expect(second.points).toEqual([]);
    expect(fetchMock).toHaveBeenCalledTimes(1); // cooldown blokuje żądania
  });

  it("cooldown ze starym cache zwraca stare dane z komunikatem o obciążeniu", async () => {
    let status429 = false;
    const fetchMock = vi.fn(async () =>
      status429
        ? ({ ok: false, status: 429, json: async () => ({}) } as unknown as Response)
        : okResponse([block(0), block(0), block(0)]),
    );
    vi.stubGlobal("fetch", fetchMock);

    await fetchRouteWeather(input);
    status429 = true;
    vi.setSystemTime(new Date("2026-08-20T07:11:00Z"));
    await fetchRouteWeather(input); // stale + refresh w tle → 429 → cooldown
    await __routeWeatherPending();

    const res = await fetchRouteWeather(input);
    expect(res.notice).toBe(
      "Serwis pogodowy jest chwilowo obciążony. Wyświetlam ostatnią dostępną prognozę.",
    );
    expect(res.points[0]!.temperature).toBe(15);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("zwraca komunikat o przeciążeniu przy 429 i nie cache'uje błędu", async () => {
    const fetchMock = vi.fn(async () => ({ ok: false, status: 429, json: async () => ({}) }) as unknown as Response);
    vi.stubGlobal("fetch", fetchMock);

    const res = await fetchRouteWeather(input);
    expect(res.notice).toBe("Serwis pogodowy jest chwilowo obciążony. Spróbuj ponownie za kilka minut.");
    expect(res.points.every((p) => p.temperature === null)).toBe(true);

    vi.setSystemTime(new Date("2026-08-20T07:06:00Z")); // cooldown 5 min minął
    await fetchRouteWeather(input);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
