import { createClient } from "@supabase/supabase-js";
import { sendTemplateEmail } from "./email-templates/send-email";

const GATEWAY_URL = "https://connector-gateway.lovable.dev/google_maps";
const SITE_URL = "https://www.apptrip.motorcycles";

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
  const mails: Array<{
    userId: string;
    rideId: string;
    kind: string;
    headline: string;
    ride: RideRow;
    km: number;
    radiusKm: number;
  }> = [];
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
        const headline = `Nowa wyprawa ${km} km${place}`;
        notifications.push({
          user_id: alert.user_id,
          ride_id: ride.id,
          title: headline,
          body: `${ride.title} — start ${ride.start_point}, ${formatWhen(ride)}. Mieści się w Twoim promieniu ${alert.radius_km} km.`,
        });
        deliveries.push({ user_id: alert.user_id, ride_id: ride.id, kind: "new" });
        mails.push({
          userId: alert.user_id,
          rideId: ride.id,
          kind: "new",
          headline,
          ride,
          km,
          radiusKm: alert.radius_km,
        });
      }

      const hoursToStart = (rideStart(ride).getTime() - now) / 3600000;
      if (
        alert.notify_soon &&
        hoursToStart > 0 &&
        hoursToStart <= alert.hours_before &&
        !done.has(`${alert.user_id}:${ride.id}:soon`)
      ) {
        const headline = `Wyprawa startuje niedługo (${Math.max(1, Math.round(hoursToStart))} h)`;
        notifications.push({
          user_id: alert.user_id,
          ride_id: ride.id,
          title: headline,
          body: `${ride.title} — zbiórka ${ride.start_point}, ${formatWhen(ride)}. ${km} km${place}.`,
        });
        deliveries.push({ user_id: alert.user_id, ride_id: ride.id, kind: "soon" });
        mails.push({
          userId: alert.user_id,
          rideId: ride.id,
          kind: "soon",
          headline,
          ride,
          km,
          radiusKm: alert.radius_km,
        });
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
    await sendAlertMails(db, mails);
  }

  return { sent: notifications.length, checked: rideRows.length };
}

/** Wysyła alerty także mailem (adresy z konta użytkownika). */
async function sendAlertMails(
  db: ReturnType<typeof createClient>,
  mails: Array<{
    userId: string;
    rideId: string;
    kind: string;
    headline: string;
    ride: RideRow;
    km: number;
    radiusKm: number;
  }>,
) {
  const emails = new Map<string, string | null>();
  for (const mail of mails) {
    if (!emails.has(mail.userId)) {
      const { data } = await db.auth.admin.getUserById(mail.userId);
      emails.set(mail.userId, data?.user?.email ?? null);
    }
    const to = emails.get(mail.userId);
    if (!to) continue;
    try {
      await sendTemplateEmail("ride-alert", to, {
        templateData: {
          headline: mail.headline,
          rideTitle: mail.ride.title,
          startPoint: mail.ride.start_point,
          when: formatWhen(mail.ride),
          distanceKm: mail.km,
          radiusKm: mail.radiusKm,
          rideUrl: `${SITE_URL}/wyprawa/${mail.ride.id}`,
        },
        idempotencyKey: `ride-alert-${mail.kind}-${mail.userId}-${mail.rideId}`,
      });
    } catch (err) {
      console.error("ride-alert email failed", err);
    }
  }
}