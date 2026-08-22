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

  it("prezentuje dokładnie 3 punkty: Początek / Połowa trasy / Cel", async () => {
    const fetchMock = vi.fn(async (_url: string) => okResponse([block(0), block(1), block(2)]));
    vi.stubGlobal("fetch", fetchMock);

    const res = await fetchRouteWeather(input);
    expect(res.points.map((p) => p.label)).toEqual(["Początek", "Połowa trasy", "Cel"]);
    // Open-Meteo dostaje dokładnie te same 3 współrzędne.
    const url = String(fetchMock.mock.calls[0]![0]);
    expect(url.match(/latitude=([^&]+)/)![1]!.split(",")).toHaveLength(3);
    expect(url.match(/longitude=([^&]+)/)![1]!.split(",")).toHaveLength(3);
    expect(res.points[0]!.lat).toBeCloseTo(Number(url.match(/latitude=([^&,]+)/)![1]), 3);
  });

  it("krótka trasa: mniej unikalnych punktów, bez duplikatów", async () => {
    const fetchMock = vi.fn(async (_url: string) => okResponse([block(0), block(1)]));
    vi.stubGlobal("fetch", fetchMock);

    // Polilinia z dwoma punktami.
    const res = await fetchRouteWeather({ ...input, encodedPolyline: "_p~iF~ps|U_ulLnnqC" });
    expect(res.points.map((p) => p.label)).toEqual(["Początek", "Cel"]);
    const key = (p: { lat: number; lng: number }) => `${p.lat},${p.lng}`;
    expect(new Set(res.points.map(key)).size).toBe(res.points.length);
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
    const fetchMock = vi.fn(async (_url: string) => okResponse([block(0), block(0), block(0)]));
    vi.stubGlobal("fetch", fetchMock);

    await fetchRouteWeather(input); // 11:00 lokalnie = 09:00 UTC, 60 min trasy
    const url = String(fetchMock.mock.calls[0]![0]);
    expect(url).not.toContain("forecast_days");
    expect(url).toContain("start_date=2026-08-22");
    expect(url).toContain("end_date=2026-08-22");
  });

  it("trasa przez północ ustawia zakres dwóch dat", async () => {
    const fetchMock = vi.fn(async (_url: string) => okResponse([block(0), block(0), block(0)]));
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
  it("fallback pyta o najkrótszy zakres dat z godzinami", async () => {
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
    // 11:00 lokalnie ±1 h → jeden dzień lokalny, godziny z include=hours.
    expect(vcUrl).toContain("/2026-08-22?");
    expect(vcUrl).toContain("include=hours");
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

  it("brakujące punkty fallbacku nie są interpolowane ani cache'owane", async () => {
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
    // Zwracamy wyłącznie punkty z realnymi danymi, nigdy pustych placeholderów.
    expect(res.points.length).toBeGreaterThan(0);
    expect(res.points.every((p) => p.temperature !== null)).toBe(true);
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
    expect(Object.keys(res).sort()).toEqual(["fallbacksTried", "notice", "points", "provider"]);
    expect(res.provider).toBe("visual-crossing");

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

describe("fallbacki WeatherAPI.com i OpenWeather", () => {
  const VC = "vc-key";
  const WAPI = "wapi-key";
  const OW = "ow-key";

  function wapiResponse(temp: number) {
    return okResponse({
      forecast: {
        forecastday: [
          {
            hour: times.map((t, i) => ({
              time_epoch: Math.floor(Date.parse(`${t}:00Z`) / 1000),
              temp_c: temp + i,
              cloud: 35,
              wind_kph: 14,
              gust_kph: 25,
              precip_mm: 0.1,
              chance_of_rain: 45,
            })),
          },
        ],
      },
    });
  }

  function owResponse(temp: number) {
    return okResponse({
      list: times.map((t, i) => ({
        dt: Math.floor(Date.parse(`${t}:00Z`) / 1000),
        main: { temp: temp + i },
        clouds: { all: 60 },
        wind: { speed: 5, gust: 9 },
        rain: { "3h": 0.4 },
        pop: 0.35,
      })),
    });
  }

  const fail = (status: number) =>
    ({ ok: false, status, json: async () => ({}) }) as unknown as Response;

  beforeEach(() => {
    __clearRouteWeatherCache();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-20T07:00:00Z"));
  });
  afterEach(() => {
    delete process.env["VISUAL_CROSSING_API_KEY"];
    delete process.env["WEATHERAPI_API_KEY"];
    delete process.env["OPENWEATHER_API_KEY"];
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("sukces Open-Meteo nie uruchamia żadnego fallbacku", async () => {
    process.env["VISUAL_CROSSING_API_KEY"] = VC;
    process.env["WEATHERAPI_API_KEY"] = WAPI;
    process.env["OPENWEATHER_API_KEY"] = OW;
    const fetchMock = vi.fn(async (_url: string) => okResponse([block(0), block(1), block(2)]));
    vi.stubGlobal("fetch", fetchMock);

    const res = await fetchRouteWeather(input);
    expect(res.provider).toBe("open-meteo");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls.every((c) => String(c[0]).includes("open-meteo"))).toBe(true);
  });

  it("429 z Visual Crossing uruchamia WeatherAPI.com i ustawia cooldown VC", async () => {
    process.env["VISUAL_CROSSING_API_KEY"] = VC;
    process.env["WEATHERAPI_API_KEY"] = WAPI;
    const fetchMock = vi.fn(async (url: string) => {
      const u = String(url);
      if (u.includes("open-meteo")) return fail(500);
      if (u.includes("visualcrossing")) return fail(429);
      return wapiResponse(18);
    });
    vi.stubGlobal("fetch", fetchMock);

    const res = await fetchRouteWeather(input);
    expect(res.provider).toBe("weatherapi");
    expect(res.points).toHaveLength(3);
    expect(res.points[0]!.cloudCover).toBe(35);
    expect(res.fallbacksTried).toEqual(["open-meteo", "visual-crossing", "weatherapi"]);
    expect(JSON.stringify(res)).not.toContain(WAPI);

    // Cooldown VC: kolejna trasa nie pyta Visual Crossing.
    fetchMock.mockClear();
    await fetchRouteWeather({ ...input, minutes: 120 });
    expect(fetchMock.mock.calls.some((c) => String(c[0]).includes("visualcrossing"))).toBe(false);
  });

  it("brak WEATHERAPI_API_KEY pomija WeatherAPI.com i przechodzi do OpenWeather", async () => {
    process.env["OPENWEATHER_API_KEY"] = OW;
    const fetchMock = vi.fn(async (url: string) =>
      String(url).includes("open-meteo") ? fail(500) : owResponse(21),
    );
    vi.stubGlobal("fetch", fetchMock);

    const res = await fetchRouteWeather(input);
    expect(fetchMock.mock.calls.some((c) => String(c[0]).includes("weatherapi.com"))).toBe(false);
    expect(res.provider).toBe("openweather");
    expect(res.fallbacksTried).toEqual(["open-meteo", "openweather"]);
  });

  it("niepowodzenie WeatherAPI.com uruchamia OpenWeather", async () => {
    process.env["WEATHERAPI_API_KEY"] = WAPI;
    process.env["OPENWEATHER_API_KEY"] = OW;
    const fetchMock = vi.fn(async (url: string) => {
      const u = String(url);
      if (u.includes("open-meteo")) return fail(500);
      if (u.includes("weatherapi.com")) return fail(500);
      return owResponse(21);
    });
    vi.stubGlobal("fetch", fetchMock);

    const res = await fetchRouteWeather(input);
    expect(res.provider).toBe("openweather");
    expect(res.notice).toBeNull();
  });

  it("OpenWeather mapuje rekordy 3-godzinne na trzy punkty trasy", async () => {
    process.env["OPENWEATHER_API_KEY"] = OW;
    const fetchMock = vi.fn(async (url: string) =>
      String(url).includes("open-meteo") ? fail(500) : owResponse(21),
    );
    vi.stubGlobal("fetch", fetchMock);

    const res = await fetchRouteWeather(input);
    const owCalls = fetchMock.mock.calls.filter((c) => String(c[0]).includes("openweathermap"));
    expect(owCalls.length).toBe(3);
    expect(owCalls.every((c) => String(c[0]).includes("/data/2.5/forecast"))).toBe(true);
    expect(res.points.map((p) => p.label)).toEqual(["Początek", "Połowa trasy", "Cel"]);
    expect(res.points.every((p) => p.temperature !== null)).toBe(true);
    expect(res.points[0]!.windSpeed).toBeCloseTo(18, 3); // 5 m/s → km/h
    expect(res.points[0]!.precipitationChance).toBe(35);
    expect(JSON.stringify(res)).not.toContain(OW);
  });

  it("odpowiedź częściowa nie trafia do cache jako kompletna", async () => {
    process.env["OPENWEATHER_API_KEY"] = OW;
    let owCalls = 0;
    const fetchMock = vi.fn(async (url: string) => {
      if (String(url).includes("open-meteo")) return fail(500);
      owCalls++;
      return owCalls === 1 ? fail(500) : owResponse(21);
    });
    vi.stubGlobal("fetch", fetchMock);

    const res = await fetchRouteWeather(input);
    expect(res.points.length).toBe(2);
    expect(res.notice).toBe("Nie udało się pobrać prognozy. Spróbuj ponownie za kilka minut.");

    const before = fetchMock.mock.calls.length;
    await fetchRouteWeather(input);
    expect(fetchMock.mock.calls.length).toBeGreaterThan(before);
  });

  it("różne źródła dla różnych punktów zwracają listę providers", async () => {
    process.env["WEATHERAPI_API_KEY"] = WAPI;
    process.env["OPENWEATHER_API_KEY"] = OW;
    let wapiCalls = 0;
    const fetchMock = vi.fn(async (url: string) => {
      const u = String(url);
      if (u.includes("open-meteo")) return fail(500);
      if (u.includes("weatherapi.com")) {
        wapiCalls++;
        return wapiCalls === 1 ? wapiResponse(18) : fail(500);
      }
      return owResponse(21);
    });
    vi.stubGlobal("fetch", fetchMock);

    const res = await fetchRouteWeather(input);
    expect(res.points).toHaveLength(3);
    expect(res.providers).toEqual(["weatherapi", "openweather"]);
  });
});
