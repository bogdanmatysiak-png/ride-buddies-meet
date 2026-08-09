import { createClient } from "@supabase/supabase-js";

const GATEWAY_URL = "https://connector-gateway.lovable.dev/google_maps";

type AlertRow = {
  user_id: string;
  lat: number;
  lng: number;
  radius_km: number;
  label: string;
  notify_new: boolean;
  notify_soon: boolean;
  hours_before: number;
  enabled: boolean;
};

type RideRow = {
  id: string;
  title: string;
  start_point: string;
  ride_date: string;
  ride_time: string;
  host_id: string | null;
  start_lat: number | null;
  start_lng: number | null;
  created_at: string;
};

function distanceKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6371;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(h)));
}

async function geocode(address: string): Promise<{ lat: number; lng: number } | null> {
  const lovableKey = process.env["LOVABLE_API_KEY"];
  const mapsKey = process.env["GOOGLE_MAPS_API_KEY"];
  if (!lovableKey || !mapsKey) return null;
  const res = await fetch(
    `${GATEWAY_URL}/maps/api/geocode/json?address=${encodeURIComponent(address)}&language=pl&region=pl`,
    { headers: { Authorization: `Bearer ${lovableKey}`, "X-Connection-Api-Key": mapsKey } },
  );
  if (!res.ok) {
    console.error(`ride-alerts geocode failed [${res.status}]: ${await res.text()}`);
    return null;
  }
  const payload = (await res.json()) as {
    results?: Array<{ geometry?: { location?: { lat: number; lng: number } } }>;
  };
  return payload.results?.[0]?.geometry?.location ?? null;
}

function rideStart(ride: RideRow): Date {
  return new Date(`${ride.ride_date}T${(ride.ride_time ?? "00:00").slice(0, 5)}:00`);
}

function formatWhen(ride: RideRow) {
  return `${new Date(ride.ride_date).toLocaleDateString("pl-PL", {
    day: "numeric",
    month: "long",
  })}, ${(ride.ride_time ?? "").slice(0, 5)}`;
}

/** Wysyła alerty o nowych wyprawach w promieniu oraz o zbliżającym się starcie. */
export async function runRideAlerts(): Promise<{ sent: number; checked: number }> {
  const url = process.env["SUPABASE_URL"];
  const serviceKey = process.env["SUPABASE_SERVICE_ROLE_KEY"];
  if (!url || !serviceKey) throw new Error("Brak konfiguracji backendu");
  const db = createClient(url, serviceKey, { auth: { persistSession: false } });

  const today = new Date().toISOString().slice(0, 10);
  const [{ data: alerts }, { data: rides }] = await Promise.all([
    db.from("ride_alerts").select("*").eq("enabled", true),
    db
      .from("rides")
      .select("id, title, start_point, ride_date, ride_time, host_id, start_lat, start_lng, created_at")
      .gte("ride_date", today)
      .order("ride_date", { ascending: true })
      .limit(500),
  ]);

  const alertRows = (alerts ?? []) as AlertRow[];
  const rideRows = (rides ?? []) as RideRow[];
  if (alertRows.length === 0 || rideRows.length === 0) {
    return { sent: 0, checked: rideRows.length };
  }

  // uzupełniamy brakujące współrzędne miejsc zbiórki
  for (const ride of rideRows) {
    if (ride.start_lat !== null && ride.start_lng !== null) continue;
    const point = await geocode(ride.start_point);
    if (!point) continue;
    ride.start_lat = point.lat;
    ride.start_lng = point.lng;
    await db.from("rides").update({ start_lat: point.lat, start_lng: point.lng }).eq("id", ride.id);
  }

  const { data: delivered } = await db.from("ride_alert_deliveries").select("user_id, ride_id, kind");
  const done = new Set(
    (delivered ?? []).map((d: any) => `${d.user_id}:${d.ride_id}:${d.kind}`),
  );

  const notifications: Array<{ user_id: string; ride_id: string; title: string; body: string }> = [];
  const deliveries: Array<{ user_id: string; ride_id: string; kind: string }> = [];
  const now = Date.now();

  for (const alert of alertRows) {
    for (const ride of rideRows) {
      if (ride.start_lat === null || ride.start_lng === null) continue;
      if (ride.host_id === alert.user_id) continue;
      const km = distanceKm(
        { lat: alert.lat, lng: alert.lng },
        { lat: ride.start_lat, lng: ride.start_lng },
      );
      if (km > alert.radius_km) continue;

      const place = alert.label ? ` od: ${alert.label}` : "";
      if (alert.notify_new && !done.has(`${alert.user_id}:${ride.id}:new`)) {
        notifications.push({
          user_id: alert.user_id,
          ride_id: ride.id,
          title: `Nowa wyprawa ${km} km${place}`,
          body: `${ride.title} — start ${ride.start_point}, ${formatWhen(ride)}. Mieści się w Twoim promieniu ${alert.radius_km} km.`,
        });
        deliveries.push({ user_id: alert.user_id, ride_id: ride.id, kind: "new" });
      }

      const hoursToStart = (rideStart(ride).getTime() - now) / 3600000;
      if (
        alert.notify_soon &&
        hoursToStart > 0 &&
        hoursToStart <= alert.hours_before &&
        !done.has(`${alert.user_id}:${ride.id}:soon`)
      ) {
        notifications.push({
          user_id: alert.user_id,
          ride_id: ride.id,
          title: `Wyprawa startuje niedługo (${Math.max(1, Math.round(hoursToStart))} h)`,
          body: `${ride.title} — zbiórka ${ride.start_point}, ${formatWhen(ride)}. ${km} km${place}.`,
        });
        deliveries.push({ user_id: alert.user_id, ride_id: ride.id, kind: "soon" });
      }
    }
  }

  if (notifications.length > 0) {
    const { error } = await db.from("notifications").insert(notifications);
    if (error) throw error;
    await db.from("ride_alert_deliveries").upsert(deliveries, {
      onConflict: "user_id,ride_id,kind",
      ignoreDuplicates: true,
    });
  }

  return { sent: notifications.length, checked: rideRows.length };
}