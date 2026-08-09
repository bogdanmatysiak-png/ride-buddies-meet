import { supabase } from "@/integrations/supabase/client";
import type { Coords, RadiusOption } from "@/lib/geo";

export type RideAlert = {
  lat: number;
  lng: number;
  radiusKm: number;
  label: string;
  notifyNew: boolean;
  notifySoon: boolean;
  hoursBefore: number;
  enabled: boolean;
};

export const rideAlertQueryKey = (userId: string) => ["ride-alert", userId] as const;

export async function fetchRideAlert(userId: string): Promise<RideAlert | null> {
  const { data, error } = await supabase
    .from("ride_alerts")
    .select("lat, lng, radius_km, label, notify_new, notify_soon, hours_before, enabled")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return {
    lat: data.lat,
    lng: data.lng,
    radiusKm: data.radius_km,
    label: data.label ?? "",
    notifyNew: data.notify_new,
    notifySoon: data.notify_soon,
    hoursBefore: data.hours_before,
    enabled: data.enabled,
  };
}

export async function saveRideAlert(
  userId: string,
  input: {
    origin: Coords;
    radius: RadiusOption;
    label: string;
    notifyNew: boolean;
    notifySoon: boolean;
    hoursBefore: number;
  },
) {
  const { error } = await supabase.from("ride_alerts").upsert(
    {
      user_id: userId,
      lat: input.origin.lat,
      lng: input.origin.lng,
      radius_km: input.radius,
      label: input.label,
      notify_new: input.notifyNew,
      notify_soon: input.notifySoon,
      hours_before: input.hoursBefore,
      enabled: true,
    },
    { onConflict: "user_id" },
  );
  if (error) throw error;
}

export async function disableRideAlert(userId: string) {
  const { error } = await supabase.from("ride_alerts").delete().eq("user_id", userId);
  if (error) throw error;
}