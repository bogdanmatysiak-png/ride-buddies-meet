import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

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

    const response = await fetch(`${GATEWAY_URL}/routes/directions/v2:computeRoutes`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${lovableKey}`,
        "X-Connection-Api-Key": mapsKey,
        "Content-Type": "application/json",
        "X-Goog-FieldMask":
          "routes.distanceMeters,routes.duration,routes.legs.steps.navigationInstruction.maneuver",
      },
      body: JSON.stringify({
        origin: { address: data.start },
        destination: { address: data.end },
        intermediates: data.waypoints.map((address) => ({ address })),
        travelMode: "DRIVE",
        routingPreference: "TRAFFIC_UNAWARE",
        computeAlternativeRoutes: true,
        routeModifiers: {
          avoidHighways: data.avoidHighways,
          avoidTolls: data.avoidTolls,
          avoidFerries: data.avoidFerries,
        },
        languageCode: "pl-PL",
        units: "METRIC",
      }),
    });

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

    const payload = (await response.json()) as {
      routes?: Array<{
        distanceMeters?: number;
        duration?: string;
        legs?: Array<{
          steps?: Array<{ navigationInstruction?: { maneuver?: string } }>;
        }>;
      }>;
    };
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
      throw new Error("Google nie znalazło trasy między tymi punktami");
    }

    const seconds = Number(String(route.duration ?? "0s").replace("s", ""));
    return {
      km: Math.round(route.distanceMeters / 1000),
      minutes: Math.round(seconds / 60),
      startAddress: data.start,
      endAddress: data.end,
      waypoints: data.waypoints,
      turns: countTurns(route),
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
    }) =>
      z
        .object({
          start: z.string().min(2).max(120),
          end: z.string().min(2).max(120),
          waypoints: z.array(z.string().min(2).max(120)).max(20).default([]),
          avoidHighways: z.boolean().default(true),
          avoidTolls: z.boolean().default(true),
          avoidFerries: z.boolean().default(true),
        })
        .parse(input),
  )
  .handler(async ({ data }): Promise<{ waypoints: string[]; km: number; minutes: number }> => {
    const lovableKey = process.env["LOVABLE_API_KEY"];
    const mapsKey = process.env["GOOGLE_MAPS_API_KEY"];
    if (!lovableKey || !mapsKey) throw new Error("Brak konfiguracji Google Maps");
    if (data.waypoints.length < 2) {
      throw new Error("Dodaj co najmniej dwa punkty „przez”, żeby ułożyć kolejność");
    }

    const response = await fetch(
      "https://connector-gateway.lovable.dev/google_maps/routes/directions/v2:computeRoutes",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${lovableKey}`,
          "X-Connection-Api-Key": mapsKey,
          "Content-Type": "application/json",
          "X-Goog-FieldMask":
            "routes.distanceMeters,routes.duration,routes.optimizedIntermediateWaypointIndex",
        },
        body: JSON.stringify({
          origin: { address: data.start },
          destination: { address: data.end },
          intermediates: data.waypoints.map((address) => ({ address })),
          optimizeWaypointOrder: true,
          travelMode: "DRIVE",
          routingPreference: "TRAFFIC_UNAWARE",
          routeModifiers: {
            avoidHighways: data.avoidHighways,
            avoidTolls: data.avoidTolls,
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
    return {
      waypoints: ordered,
      km: Math.round(route.distanceMeters / 1000),
      minutes: Math.round(Number(String(route.duration ?? "0s").replace("s", "")) / 60),
    };
  });