import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const GATEWAY_URL = "https://connector-gateway.lovable.dev/google_maps";

const schema = z.object({ query: z.string().min(2).max(120) });

export type PlaceHit = { name: string; address: string };

/** Szybkie wyszukiwanie miejsc (Places API New) do pól zbiórki, celu i punktów „przez”. */
export const searchPlaces = createServerFn({ method: "POST" })
  .inputValidator((input: { query: string }) => schema.parse(input))
  .handler(async ({ data }): Promise<PlaceHit[]> => {
    const lovableKey = process.env["LOVABLE_API_KEY"];
    const mapsKey = process.env["GOOGLE_MAPS_API_KEY"];
    if (!lovableKey || !mapsKey) throw new Error("Brak konfiguracji Google Maps");

    const response = await fetch(`${GATEWAY_URL}/places/v1/places:searchText`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${lovableKey}`,
        "X-Connection-Api-Key": mapsKey,
        "Content-Type": "application/json",
        "X-Goog-FieldMask": "places.displayName,places.formattedAddress",
      },
      body: JSON.stringify({
        textQuery: data.query,
        languageCode: "pl",
        regionCode: "PL",
        maxResultCount: 6,
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      console.error(`Places search failed [${response.status}]: ${body}`);
      // Gdy Places API (New) nie jest włączone na kluczu, korzystamy z Geocoding API.
      return geocodeFallback(data.query, lovableKey, mapsKey);
    }

    const payload = (await response.json()) as {
      places?: Array<{ displayName?: { text?: string }; formattedAddress?: string }>;
    };
    if ((payload.places ?? []).length === 0) {
      return geocodeFallback(data.query, lovableKey, mapsKey);
    }
    return (payload.places ?? [])
      .map((p) => ({
        name: p.displayName?.text ?? p.formattedAddress ?? "",
        address: p.formattedAddress ?? p.displayName?.text ?? "",
      }))
      .filter((p) => p.name.length > 0);
  });

async function geocodeFallback(
  query: string,
  lovableKey: string,
  mapsKey: string,
): Promise<PlaceHit[]> {
  const response = await fetch(
    `${GATEWAY_URL}/maps/api/geocode/json?address=${encodeURIComponent(query)}&language=pl&region=pl`,
    {
      headers: {
        Authorization: `Bearer ${lovableKey}`,
        "X-Connection-Api-Key": mapsKey,
      },
    },
  );
  if (!response.ok) {
    console.error(`Geocoding fallback failed [${response.status}]: ${await response.text()}`);
    return [];
  }
  const payload = (await response.json()) as {
    results?: Array<{ formatted_address?: string }>;
  };
  return (payload.results ?? [])
    .slice(0, 6)
    .map((r) => r.formatted_address ?? "")
    .filter((address) => address.length > 0)
    .map((address) => ({ name: address.replace(/, Polska$/, ""), address }));
}
