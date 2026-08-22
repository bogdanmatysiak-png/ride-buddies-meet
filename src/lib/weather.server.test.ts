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

  it("ogranicza zakres dat do minimum dla krótkiej trasy", async () => {
    const fetchMock = vi.fn(async () => okResponse([block(0), block(0), block(0)]));
    vi.stubGlobal("fetch", fetchMock);

    await fetchRouteWeather(input); // 11:00 lokalnie = 09:00 UTC, 60 min trasy
    const url = String(fetchMock.mock.calls[0]![0]);
    expect(url).not.toContain("forecast_days");
    expect(url).toContain("start_date=2026-08-22");
    expect(url).toContain("end_date=2026-08-22");
  });

  it("trasa przez północ ustawia zakres dwóch dat", async () => {
    const fetchMock = vi.fn(async () => okResponse([block(0), block(0), block(0)]));
    vi.stubGlobal("fetch", fetchMock);

    await fetchRouteWeather({ ...input, time: "23:00", minutes: 90 });
    const url = String(fetchMock.mock.calls[0]![0]);
    expect(url).toContain("start_date=2026-08-22");
    expect(url).toContain("end_date=2026-08-23");
  });

  it("dopasowuje godzinę w czasie letnim Europe/Warsaw (UTC+2)", async () => {
    const fetchMock = vi.fn(async () => okResponse([block(0), block(0), block(0)]));
    vi.stubGlobal("fetch", fetchMock);

    // 11:00 czasu warszawskiego (DST) = 09:00 UTC → pierwsza godzina bloku (15°C).
    const res = await fetchRouteWeather(input);
    expect(res.points[0]!.at).toBe("2026-08-22T09:00:00.000Z");
    expect(res.points[0]!.temperature).toBe(15);
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

  it("429 z Visual Crossing przerywa kolejne żądania i włącza 10-minutowy cooldown", async () => {
    const logs: string[] = [];
    vi.spyOn(console, "log").mockImplementation((...a: unknown[]) => logs.push(String(a)));
    const fetchMock = vi.fn(async (url: string) =>
      String(url).includes("open-meteo")
        ? ({ ok: false, status: 500, json: async () => ({}) } as unknown as Response)
        : ({ ok: false, status: 429, json: async () => ({}) } as unknown as Response),
    );
    vi.stubGlobal("fetch", fetchMock);

    const res = await fetchRouteWeather(input);
    const vcCalls = fetchMock.mock.calls.filter((c) => String(c[0]).includes("visualcrossing"));
    expect(vcCalls.length).toBe(1); // pierwsze 429 blokuje pozostałe punkty
    expect(res.points).toEqual([]);
    expect(logs.join("\n")).toContain("visual-crossing-rate-limit");
    expect(logs.join("\n")).toContain('cooldownMinutes":10');
    expect(logs.join("\n")).not.toContain(KEY);
    expect(JSON.stringify(res)).not.toContain(KEY);

    // Podczas cooldownu nie pytamy Visual Crossing.
    fetchMock.mockClear();
    await fetchRouteWeather({ ...input, minutes: 120 });
    expect(fetchMock.mock.calls.some((c) => String(c[0]).includes("visualcrossing"))).toBe(false);

    // Po cooldownie dostawca może być wywołany ponownie.
    vi.setSystemTime(new Date("2026-08-20T07:11:00Z"));
    fetchMock.mockClear();
    await fetchRouteWeather({ ...input, minutes: 150 });
    expect(fetchMock.mock.calls.some((c) => String(c[0]).includes("visualcrossing"))).toBe(true);
  });

  it("pusty wynik po 429 z Visual Crossing nie trafia do cache", async () => {
    const fetchMock = vi.fn(async (url: string) =>
      String(url).includes("open-meteo")
        ? ({ ok: false, status: 500, json: async () => ({}) } as unknown as Response)
        : ({ ok: false, status: 429, json: async () => ({}) } as unknown as Response),
    );
    vi.stubGlobal("fetch", fetchMock);

    await fetchRouteWeather(input);
    fetchMock.mockClear();
    const second = await fetchRouteWeather(input);
    expect(second.points).toEqual([]);
    expect(fetchMock.mock.calls.some((c) => String(c[0]).includes("open-meteo"))).toBe(true);
  });

  it("fallback pobiera maksymalnie 3 punkty trasy", async () => {
    const fetchMock = vi.fn(async (url: string) =>
      String(url).includes("open-meteo")
        ? ({ ok: false, status: 500, json: async () => ({}) } as unknown as Response)
        : vcResponse(20),
    );
    vi.stubGlobal("fetch", fetchMock);

    const res = await fetchRouteWeather(input);
    const vcCalls = fetchMock.mock.calls.filter((c) => String(c[0]).includes("visualcrossing"));
    expect(vcCalls.length).toBeLessThanOrEqual(3);
    expect(res.notice).toBeNull();
    expect(res.points.every((p) => p.temperature !== null)).toBe(true);
  });
  it("fallback pyta o minimalny zakres godzin, nie o całą dobę", async () => {
    const fetchMock = vi.fn(async (url: string) =>
      String(url).includes("open-meteo")
        ? ({ ok: false, status: 500, json: async () => ({}) } as unknown as Response)
        : vcResponse(20),
    );
    vi.stubGlobal("fetch", fetchMock);

    await fetchRouteWeather(input);
    const vcUrl = String(
      fetchMock.mock.calls.map((c) => String(c[0])).find((u) => u.includes("visualcrossing"))!,
    );
    // 11:00 lokalnie ±1 h → zakres 10:00–12:00 tego samego dnia.
    expect(vcUrl).toContain("/2026-08-22T10:00:00/2026-08-22T12:00:00");
    expect(vcUrl).toContain("include=hours");
    expect(vcUrl).not.toContain(`/2026-08-22/2026-08-22?`);
  });

  it("fallback wykonuje jedno zapytanie naraz", async () => {
    let active = 0;
    let maxActive = 0;
    const fetchMock = vi.fn(async (url: string) => {
      if (String(url).includes("open-meteo")) {
        return { ok: false, status: 500, json: async () => ({}) } as unknown as Response;
      }
      active++;
      maxActive = Math.max(maxActive, active);
      await Promise.resolve();
      active--;
      return vcResponse(20);
    });
    vi.stubGlobal("fetch", fetchMock);

    await fetchRouteWeather(input);
    expect(maxActive).toBe(1);
  });

  it("brakujące punkty fallbacku pozostają puste (bez interpolacji)", async () => {
    let vcCalls = 0;
    const fetchMock = vi.fn(async (url: string) => {
      if (String(url).includes("open-meteo")) {
        return { ok: false, status: 500, json: async () => ({}) } as unknown as Response;
      }
      vcCalls++;
      // Pierwszy punkt zawodzi → nie wolno skopiować danych z innego punktu.
      if (vcCalls === 1) {
        return { ok: false, status: 500, json: async () => ({}) } as unknown as Response;
      }
      return vcResponse(20);
    });
    vi.stubGlobal("fetch", fetchMock);

    const res = await fetchRouteWeather(input);
    expect(res.points).toEqual([]); // niekompletny wynik → czytelny komunikat, bez danych
    expect(res.notice).toBe("Nie udało się pobrać prognozy. Spróbuj ponownie za kilka minut.");

    // Niekompletny wynik nie jest cache'owany.
    const before = fetchMock.mock.calls.length;
    await fetchRouteWeather(input);
    expect(fetchMock.mock.calls.length).toBeGreaterThan(before);
  });

  it("publiczny kształt danych pozostaje zgodny z UI", async () => {
    const fetchMock = vi.fn(async (url: string) =>
      String(url).includes("open-meteo")
        ? ({ ok: false, status: 500, json: async () => ({}) } as unknown as Response)
        : vcResponse(20),
    );
    vi.stubGlobal("fetch", fetchMock);

    const res = await fetchRouteWeather(input);
    expect(Object.keys(res).sort()).toEqual(["notice", "points"]);
    expect(Object.keys(res.points[0]!).sort()).toEqual(
      [
        "at",
        "cloudCover",
        "label",
        "lat",
        "lng",
        "precipitation",
        "precipitationChance",
        "temperature",
        "windGusts",
        "windSpeed",
      ],
    );
    expect(JSON.stringify(res)).not.toContain(KEY);
  });
});
