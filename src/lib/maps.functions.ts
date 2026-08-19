import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { countSpeedEnforcement } from "./speed-cameras.server";

const GATEWAY_URL = "https://connector-gateway.lovable.dev/google_maps";

const schema = z.object({
  start: z.string().min(2).max(120),
  end: z.string().min(2).max(120),
  waypoints: z.array(z.string().min(2).max(120)).max(20).default([]),
  curvy: z.boolean().default(true),
  avoidHighways: z.boolean().default(true),
  avoidTolls: z.boolean().default(true),
  avoidFerries: z.boolean().default(true),
});

export type RoutePlan = {
  km: number;
  minutes: number;
  startAddress: string;
  endAddress: string;
  waypoints: string[];
  turns: number;
  /** Zakodowany kształt trasy z Google Maps. */
  encodedPolyline: string | null;
  /** Liczba fotoradarów na trasie (OpenStreetMap); null gdy dane niedostępne. */
  cameras: number | null;
  /** Liczba odcinkowych pomiarów prędkości na trasie; null gdy dane niedostępne. */
  sectionChecks: number | null;
  /** Źródła danych o kontrolach prędkości (osm, gitd, users). */
  cameraSources: string[];
};

export const planRoute = createServerFn({ method: "POST" })
  .inputValidator(
    (input: {
      start: string;
      end: string;
      waypoints?: string[];
      curvy?: boolean;
      avoidHighways?: boolean;
      avoidTolls?: boolean;
      avoidFerries?: boolean;
    }) => schema.parse(input),
  )
  .handler(async ({ data }): Promise<RoutePlan> => {
    const lovableKey = process.env["LOVABLE_API_KEY"];
    const mapsKey = process.env["GOOGLE_MAPS_API_KEY"];
    if (!lovableKey || !mapsKey) {
      throw new Error("Brak konfiguracji Google Maps");
    }

    const call = (opts: { relaxed: boolean; dropWaypoints?: boolean }) =>
      fetch(`${GATEWAY_URL}/routes/directions/v2:computeRoutes`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${lovableKey}`,
          "X-Connection-Api-Key": mapsKey,
          "Content-Type": "application/json",
          "X-Goog-FieldMask":
            "routes.distanceMeters,routes.duration,routes.polyline.encodedPolyline,routes.legs.steps.navigationInstruction.maneuver",
        },
        body: JSON.stringify({
          origin: { address: data.start },
          destination: { address: data.end },
          intermediates: opts.dropWaypoints
            ? []
            : data.waypoints
                .map((a) => a.trim())
                .filter((a) => a.length > 1)
                .map((address) => ({ address })),
          travelMode: "DRIVE",
          routingPreference: "TRAFFIC_UNAWARE",
          computeAlternativeRoutes: !opts.relaxed,
          routeModifiers: opts.relaxed
            ? {}
            : {
                avoidHighways: data.avoidHighways,
                avoidTolls: data.avoidTolls,
                avoidFerries: data.avoidFerries,
              },
          languageCode: "pl-PL",
          units: "METRIC",
        }),
      });

    let response = await call({ relaxed: false });

    if (response.status === 403) {
      const details: Array<{ reason?: string }> =
        (await response.json())?.error?.details ?? [];
      const reason = details.find((d) => d.reason)?.reason;
      if (reason === "API_KEY_HTTP_REFERRER_BLOCKED") {
        throw new Error(
          'Klucz serwerowy Google Maps ma ograniczenie referrera. Ustaw "None" lub "IP addresses" w Google Cloud Console.',
        );
      }
      if (reason === "API_KEY_SERVICE_BLOCKED") {
        throw new Error(
          "Klucz Google Maps nie ma dostępu do Routes API. Dodaj to API na liście dozwolonych w Google Cloud Console.",
        );
      }
      throw new Error("Google Maps odrzuciło żądanie (403). Sprawdź ograniczenia klucza.");
    }

    if (!response.ok) {
      const body = await response.text();
      console.error(`Routes API failed [${response.status}]: ${body}`);
      throw new Error(`Nie udało się wyznaczyć trasy [${response.status}]`);
    }

    let payload = (await response.json()) as {
      routes?: Array<{
        distanceMeters?: number;
        duration?: string;
        polyline?: { encodedPolyline?: string };
        legs?: Array<{
          steps?: Array<{ navigationInstruction?: { maneuver?: string } }>;
        }>;
      }>;
    };

    const hasRoute = () => (payload.routes ?? []).some((r) => r.distanceMeters);

    // 1) Gdy ograniczenia (bez autostrad/płatnych/promów) uniemożliwiają przejazd,
    //    próbujemy jeszcze raz bez nich.
    if (!hasRoute()) {
      response = await call({ relaxed: true });
      const body = await response.text();
      if (response.ok) payload = JSON.parse(body);
      else console.error(`Routes API retry (relaxed) [${response.status}]: ${body}`);
    }

    // 2) Gdy nadal brak trasy, a mamy punkty „przez” – to zwykle jeden z nich
    //    jest niemapowalny. Liczymy trasę bez punktów pośrednich.
    if (!hasRoute() && data.waypoints.length > 0) {
      response = await call({ relaxed: true, dropWaypoints: true });
      const body = await response.text();
      if (response.ok) {
        payload = JSON.parse(body);
        if (hasRoute()) {
          console.warn("Routes API: trasa policzona bez punktów „przez”");
        }
      } else {
        console.error(`Routes API retry (no waypoints) [${response.status}]: ${body}`);
      }
    }

    const countTurns = (r: NonNullable<typeof payload.routes>[number]) =>
      (r.legs ?? []).reduce(
        (sum, leg) =>
          sum +
          (leg.steps ?? []).filter((s) =>
            /TURN|ROUNDABOUT|FORK/.test(s.navigationInstruction?.maneuver ?? ""),
          ).length,
        0,
      );
    // Zgodnie z preferencjami: albo najbardziej "motocyklowy" wariant (najwięcej zakrętów),
    // albo pierwszy (najszybszy) wariant zwrócony przez Google.
    const candidates = (payload.routes ?? []).filter((r) => r.distanceMeters);
    const route = data.curvy
      ? [...candidates].sort((a, b) => countTurns(b) - countTurns(a))[0]
      : candidates[0];
    if (!route?.distanceMeters) {
      throw new Error(
        data.waypoints.length > 0
          ? `Google nie znalazło trasy dla „${data.start}” → „${data.end}” nawet bez punktów „przez”. Sprawdź pisownię miejsc i dodaj miasto/kraj (np. „Kraków, Polska”).`
          : `Google nie znalazło trasy dla „${data.start}” → „${data.end}”. Sprawdź pisownię i dodaj miasto/kraj (np. „Kraków, Polska”).`,
      );
    }

    const seconds = Number(String(route.duration ?? "0s").replace("s", ""));
    const encoded = route.polyline?.encodedPolyline;
    const enforcement = encoded ? await countSpeedEnforcement(encoded) : null;
    return {
      km: Math.round(route.distanceMeters / 1000),
      minutes: Math.round(seconds / 60),
      startAddress: data.start,
      endAddress: data.end,
      waypoints: data.waypoints,
      turns: countTurns(route),
      encodedPolyline: encoded ?? null,
      cameras: enforcement?.cameras ?? null,
      sectionChecks: enforcement?.sections ?? null,
      cameraSources: enforcement?.sources ?? [],
    };
  });

export const optimizeWaypoints = createServerFn({ method: "POST" })
  .inputValidator(
    (input: {
      start: string;
      end: string;
      waypoints?: string[];
      avoidHighways?: boolean;
      avoidTolls?: boolean;
      avoidFerries?: boolean;
      mode?: "fast" | "scenic";
    }) =>
      z
        .object({
          start: z.string().min(2).max(120),
          end: z.string().min(2).max(120),
          waypoints: z.array(z.string().min(2).max(120)).max(20).default([]),
          avoidHighways: z.boolean().default(true),
          avoidTolls: z.boolean().default(true),
          avoidFerries: z.boolean().default(true),
          mode: z.enum(["fast", "scenic"]).default("fast"),
        })
        .parse(input),
  )
  .handler(
    async ({
      data,
    }): Promise<{ waypoints: string[]; km: number; minutes: number; turns: number }> => {
    const lovableKey = process.env["LOVABLE_API_KEY"];
    const mapsKey = process.env["GOOGLE_MAPS_API_KEY"];
    if (!lovableKey || !mapsKey) throw new Error("Brak konfiguracji Google Maps");
    if (data.waypoints.length < 2) {
      throw new Error("Dodaj co najmniej dwa punkty „przez”, żeby ułożyć kolejność");
    }
    // Tryb malowniczy: zawsze bez autostrad i płatnych odcinków, żeby Google
    // układał punkty pod lokalne, bardziej kręte drogi.
    const scenic = data.mode === "scenic";

    const response = await fetch(
      "https://connector-gateway.lovable.dev/google_maps/routes/directions/v2:computeRoutes",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${lovableKey}`,
          "X-Connection-Api-Key": mapsKey,
          "Content-Type": "application/json",
          "X-Goog-FieldMask":
            "routes.distanceMeters,routes.duration,routes.optimizedIntermediateWaypointIndex,routes.legs.steps.navigationInstruction.maneuver",
        },
        body: JSON.stringify({
          origin: { address: data.start },
          destination: { address: data.end },
          intermediates: data.waypoints.map((address) => ({ address })),
          optimizeWaypointOrder: true,
          travelMode: "DRIVE",
          routingPreference: "TRAFFIC_UNAWARE",
          routeModifiers: {
            avoidHighways: scenic ? true : data.avoidHighways,
            avoidTolls: scenic ? true : data.avoidTolls,
            avoidFerries: data.avoidFerries,
          },
          languageCode: "pl-PL",
          units: "METRIC",
        }),
      },
    );

    if (response.status === 403) {
      const details: Array<{ reason?: string }> = (await response.json())?.error?.details ?? [];
      const reason = details.find((d) => d.reason)?.reason;
      if (reason === "API_KEY_HTTP_REFERRER_BLOCKED") {
        throw new Error(
          'Klucz serwerowy Google Maps ma ograniczenie referrera. Ustaw "None" lub "IP addresses" w Google Cloud Console.',
        );
      }
      if (reason === "API_KEY_SERVICE_BLOCKED") {
        throw new Error(
          "Klucz Google Maps nie ma dostępu do Routes API. Dodaj to API na liście dozwolonych w Google Cloud Console.",
        );
      }
      throw new Error("Google Maps odrzuciło żądanie (403). Sprawdź ograniczenia klucza.");
    }
    if (!response.ok) {
      const body = await response.text();
      console.error(`Routes optimize failed [${response.status}]: ${body}`);
      throw new Error(`Nie udało się ułożyć kolejności punktów [${response.status}]`);
    }

    const payload = (await response.json()) as {
      routes?: Array<{
        distanceMeters?: number;
        duration?: string;
        optimizedIntermediateWaypointIndex?: number[];
        legs?: Array<{ steps?: Array<{ navigationInstruction?: { maneuver?: string } }> }>;
      }>;
    };
    const route = payload.routes?.[0];
    if (!route?.distanceMeters) {
      throw new Error("Google nie znalazło trasy przez te punkty");
    }
    const order = route.optimizedIntermediateWaypointIndex ?? [];
    const ordered =
      order.length === data.waypoints.length
        ? order.map((i) => data.waypoints[i]!).filter(Boolean)
        : data.waypoints;
    const turns = (route.legs ?? []).reduce(
      (sum, leg) =>
        sum +
        (leg.steps ?? []).filter((s) =>
          /TURN|ROUNDABOUT|FORK/.test(s.navigationInstruction?.maneuver ?? ""),
        ).length,
      0,
    );
    return {
      waypoints: ordered,
      km: Math.round(route.distanceMeters / 1000),
      minutes: Math.round(Number(String(route.duration ?? "0s").replace("s", "")) / 60),
      turns,
    };
    },
  );
/** Trasa z bieżącej lokalizacji (GPS) do miejsca zbiórki: najszybsza i najkrótsza. */
export const routeFromGps = createServerFn({ method: "POST" })
  .inputValidator((input: { lat: number; lng: number; destination: string }) =>
    z
      .object({
        lat: z.number().min(-90).max(90),
        lng: z.number().min(-180).max(180),
        destination: z.string().min(2).max(160),
      })
      .parse(input),
  )
  .handler(
    async ({
      data,
    }): Promise<{
      fastest: {
        km: number;
        minutes: number;
        polyline: string;
        steps: Array<{ text: string; km: number; maneuver: string }>;
      };
      shortest: {
        km: number;
        minutes: number;
        polyline: string;
        steps: Array<{ text: string; km: number; maneuver: string }>;
      };
      origin: { lat: number; lng: number };
    }> => {
      const lovableKey = process.env["LOVABLE_API_KEY"];
      const mapsKey = process.env["GOOGLE_MAPS_API_KEY"];
      if (!lovableKey || !mapsKey) throw new Error("Brak konfiguracji Google Maps");

      type GpsPayload = {
        routes?: Array<{
          distanceMeters?: number;
          duration?: string;
          polyline?: { encodedPolyline?: string };
          legs?: Array<{
            steps?: Array<{
              distanceMeters?: number;
              navigationInstruction?: { instructions?: string; maneuver?: string };
            }>;
          }>;
        }>;
      };

      // Najszybsza: pełna sieć dróg (autostrady, ekspresowe, krajowe, wojewódzkie).
      // Najkrótsza: bez autostrad i ekspresówek (czyli krajowe → wojewódzkie → powiatowe),
      //   a jeśli wariant z autostradami jest faktycznie krótszy w km — bierzemy jego.
      const call = (avoidHighways: boolean) =>
        fetch(`${GATEWAY_URL}/routes/directions/v2:computeRoutes`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${lovableKey}`,
            "X-Connection-Api-Key": mapsKey,
            "Content-Type": "application/json",
            "X-Goog-FieldMask":
              "routes.distanceMeters,routes.duration,routes.polyline.encodedPolyline,routes.legs.steps.distanceMeters,routes.legs.steps.navigationInstruction",
          },
          body: JSON.stringify({
            origin: { location: { latLng: { latitude: data.lat, longitude: data.lng } } },
            destination: { address: data.destination },
            travelMode: "DRIVE",
            routingPreference: "TRAFFIC_AWARE",
            computeAlternativeRoutes: true,
            routeModifiers: avoidHighways ? { avoidHighways: true } : {},
            languageCode: "pl-PL",
            units: "METRIC",
          }),
        });

      const fetchRoutes = async (avoidHighways: boolean) => {
        const response = await call(avoidHighways);
        if (!response.ok) {
          const body = await response.text();
          console.error(
            `Routes GPS failed [${response.status}] (avoidHighways=${avoidHighways}): ${body}`,
          );
          if (!avoidHighways) {
            throw new Error("Nie udało się policzyć odległości do miejsca zbiórki");
          }
          return [] as GpsPayload["routes"];
        }
        return ((await response.json()) as GpsPayload).routes ?? [];
      };

      const [openRaw, localRaw] = await Promise.all([fetchRoutes(false), fetchRoutes(true)]);

      const normalize = (raw: NonNullable<GpsPayload["routes"]>) =>
        raw
        .filter((r) => !!r.distanceMeters)
        .filter((r) => !!r.distanceMeters)
        .map((r) => ({
          km: Math.round((r.distanceMeters ?? 0) / 1000),
          meters: r.distanceMeters ?? 0,
          minutes: Math.round(Number(String(r.duration ?? "0s").replace("s", "")) / 60),
          polyline: r.polyline?.encodedPolyline ?? "",
          steps: (r.legs ?? []).flatMap((leg) =>
            (leg.steps ?? [])
              .filter((s) => s.navigationInstruction?.instructions)
              .map((s) => ({
                text: s.navigationInstruction?.instructions ?? "",
                km: Math.round(((s.distanceMeters ?? 0) / 1000) * 10) / 10,
                maneuver: s.navigationInstruction?.maneuver ?? "",
              })),
          ),
        }));

      const open = normalize(openRaw ?? []);
      const local = normalize(localRaw ?? []);

      const fastest = [...open].sort((a, b) => a.minutes - b.minutes)[0];
      const shortestLocal = [...local].sort((a, b) => a.meters - b.meters)[0];
      const shortestOpen = [...open].sort((a, b) => a.meters - b.meters)[0];
      const shortest =
        shortestLocal && shortestOpen
          ? shortestOpen.meters < shortestLocal.meters
            ? shortestOpen
            : shortestLocal
          : (shortestLocal ?? shortestOpen);
      if (!fastest || !shortest) throw new Error("Google nie znalazło drogi do miejsca zbiórki");
      return { fastest, shortest, origin: { lat: data.lat, lng: data.lng } };
    },
  );
