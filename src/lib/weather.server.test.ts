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
    delete process.env["VISUAL_CROSSING_API_KEY"];
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

describe("fallback Visual Crossing", () => {
  const KEY = "test-secret-key";

  function vcResponse(temp: number) {
    return okResponse({
      days: [
        {
          hours: times.map((t, i) => ({
            datetimeEpoch: Math.floor(Date.parse(`${t}:00Z`) / 1000),
            temp: temp + i,
            cloudcover: 40,
            windspeed: 12,
            windgust: 22,
            precip: 0.2,
            precipprob: 55,
          })),
        },
      ],
    });
  }

  beforeEach(() => {
    __clearRouteWeatherCache();
    process.env["VISUAL_CROSSING_API_KEY"] = KEY;
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-20T07:00:00Z"));
  });
  afterEach(() => {
    delete process.env["VISUAL_CROSSING_API_KEY"];
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("Open-Meteo 429 → dane z Visual Crossing, bez wycieku klucza", async () => {
    const logs: string[] = [];
    vi.spyOn(console, "error").mockImplementation((...a: unknown[]) => logs.push(String(a)));
    vi.spyOn(console, "warn").mockImplementation((...a: unknown[]) => logs.push(String(a)));
    const fetchMock = vi.fn(async (url: string) =>
      String(url).includes("open-meteo")
        ? ({ ok: false, status: 429, json: async () => ({}) } as unknown as Response)
        : vcResponse(20),
    );
    vi.stubGlobal("fetch", fetchMock);

    const res = await fetchRouteWeather(input);

    expect(res.notice).toBeNull();
    expect(res.points.length).toBeGreaterThan(0);
    expect(res.points[0]!.temperature).not.toBeNull();
    expect(res.points[0]!.cloudCover).toBe(40);
    expect(res.points[0]!.precipitationChance).toBe(55);
    const vcUrl = String(
      fetchMock.mock.calls.map((c) => String(c[0])).find((u) => u.includes("visualcrossing"))!,
    );
    expect(vcUrl).toContain("unitGroup=metric");
    expect(vcUrl).toContain("include=hours");
    expect(JSON.stringify(res)).not.toContain(KEY);
    expect(logs.join("\n")).not.toContain(KEY);
  });

  it("sukces Visual Crossing jest cache'owany", async () => {
    const fetchMock = vi.fn(async (url: string) =>
      String(url).includes("open-meteo")
        ? ({ ok: false, status: 500, json: async () => ({}) } as unknown as Response)
        : vcResponse(20),
    );
    vi.stubGlobal("fetch", fetchMock);

    await fetchRouteWeather(input);
    const callsAfterFirst = fetchMock.mock.calls.length;
    const second = await fetchRouteWeather(input);
    expect(fetchMock.mock.calls.length).toBe(callsAfterFirst);
    expect(second.notice).toBeNull();
  });

  it("w czasie cooldownu Open-Meteo pyta tylko Visual Crossing", async () => {
    const fetchMock = vi.fn(async (url: string) =>
      String(url).includes("open-meteo")
        ? ({ ok: false, status: 429, json: async () => ({}) } as unknown as Response)
        : vcResponse(20),
    );
    vi.stubGlobal("fetch", fetchMock);

    await fetchRouteWeather(input); // 429 → cooldown, dane z VC
    __clearRouteWeatherCacheOnly();
    fetchMock.mockClear();

    const res = await fetchRouteWeather({ ...input, minutes: 90 });
    expect(res.notice).toBeNull();
    expect(fetchMock.mock.calls.every((c) => String(c[0]).includes("visualcrossing"))).toBe(true);
  });

  it("oba źródła zawodzą i brak cache → jasny komunikat", async () => {
    const fetchMock = vi.fn(
      async () => ({ ok: false, status: 500, json: async () => ({}) }) as unknown as Response,
    );
    vi.stubGlobal("fetch", fetchMock);

    const res = await fetchRouteWeather(input);
    expect(res.points).toEqual([]);
    expect(res.notice).toBe("Nie udało się pobrać prognozy. Spróbuj ponownie za kilka minut.");
  });
});
