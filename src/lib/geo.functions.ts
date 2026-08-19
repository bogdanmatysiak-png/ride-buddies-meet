import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const GATEWAY_URL = "https://connector-gateway.lovable.dev/google_maps";

const schema = z.object({
  addresses: z.array(z.string().min(2).max(160)).min(1).max(30),
});

export type GeoPoint = { address: string; lat: number; lng: number };

async function geocodeOne(
  address: string,
  lovableKey: string,
  mapsKey: string,
): Promise<GeoPoint | null> {
  const res = await fetch(
    `${GATEWAY_URL}/maps/api/geocode/json?address=${encodeURIComponent(address)}&language=pl&region=pl`,
    {
      headers: {
        Authorization: `Bearer ${lovableKey}`,
        "X-Connection-Api-Key": mapsKey,
      },
    },
  );
  if (res.status === 403) {
    const details: Array<{ reason?: string }> = (await res.json())?.error?.details ?? [];
    const reason = details.find((d) => d.reason)?.reason;
    if (reason === "API_KEY_HTTP_REFERRER_BLOCKED") {
      throw new Error(
        'Klucz serwerowy Google Maps ma ograniczenie referrera. Ustaw "None" lub "IP addresses" w Google Cloud Console.',
      );
    }
    if (reason === "API_KEY_SERVICE_BLOCKED") {
      throw new Error(
        "Klucz Google Maps nie ma dostępu do Geocoding API. Dodaj je na liście dozwolonych API.",
      );
    }
    throw new Error("Google Maps odrzuciło żądanie (403). Sprawdź ograniczenia klucza.");
  }
  if (!res.ok) {
    const body = await res.text();
    console.error(`Geocoding failed [${res.status}]: ${body}`);
    return null;
  }
  const payload = (await res.json()) as {
    status?: string;
    results?: Array<{ geometry?: { location?: { lat: number; lng: number } } }>;
  };
  const loc = payload.results?.[0]?.geometry?.location;
  if (!loc) return null;
  return { address, lat: loc.lat, lng: loc.lng };
}

export const geocodeAddresses = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { addresses: string[] }) => schema.parse(input))
  .handler(async ({ data }): Promise<GeoPoint[]> => {
    const lovableKey = process.env["LOVABLE_API_KEY"];
    const mapsKey = process.env["GOOGLE_MAPS_API_KEY"];
    if (!lovableKey || !mapsKey) throw new Error("Brak konfiguracji Google Maps");

    const unique = Array.from(new Set(data.addresses.map((a) => a.trim()))).filter(Boolean);
    const results = await Promise.all(
      unique.map((a) => geocodeOne(a, lovableKey, mapsKey).catch(() => null)),
    );
    return results.filter((r): r is GeoPoint => r !== null);
  });
