import { supabase } from "@/integrations/supabase/client";

export type RideLevel = "chill" | "sport" | "adventure";

export type Ride = {
  id: string;
  hostId: string | null;
  host: string;
  title: string;
  start: string;
  end: string;
  date: string;
  time: string;
  km: number;
  level: RideLevel;
  spots: number;
  description: string;
  intercom: boolean;
  intercomType: string;
  riderIds: string[];
  riders: string[];
};

export const levelLabel: Record<RideLevel, string> = {
  chill: "Spokojna",
  sport: "Sportowa",
  adventure: "Adventure",
};

export const ridesQueryKey = ["rides"] as const;

/** spots === 0 oznacza wyprawę bez limitu miejsc */
export function isUnlimited(spots: number) {
  return !spots || spots <= 0;
}

export function spotsLabel(spots: number) {
  return isUnlimited(spots) ? "bez limitu" : String(spots);
}

export function freeSpots(spots: number, taken: number) {
  return isUnlimited(spots) ? Infinity : spots - taken;
}

export async function fetchRides(): Promise<Ride[]> {
  const [{ data: rides, error }, { data: profiles }] = await Promise.all([
    supabase
      .from("rides")
      .select("*, ride_participants(user_id)")
      .order("ride_date", { ascending: true }),
    supabase.from("profiles").select("id, nick"),
  ]);
  if (error) throw error;

  const nickById = new Map((profiles ?? []).map((p) => [p.id, p.nick]));

  return (rides ?? []).map((r) => {
    const riderIds = (r.ride_participants ?? []).map((p) => p.user_id);
    return {
      id: r.id,
      hostId: r.host_id,
      host: r.host_name,
      title: r.title,
      start: r.start_point,
      end: r.end_point,
      date: r.ride_date,
      time: r.ride_time,
      km: r.km,
      level: r.level,
      spots: r.spots,
      description: r.description,
      intercom: r.intercom,
      intercomType: r.intercom_type,
      riderIds,
      riders: riderIds.map((id) => nickById.get(id) ?? "Motocyklista"),
    };
  });
}

export async function joinRide(rideId: string, userId: string) {
  const { error } = await supabase
    .from("ride_participants")
    .insert({ ride_id: rideId, user_id: userId });
  if (error) throw error;
}

export async function leaveRide(rideId: string, userId: string) {
  const { error } = await supabase
    .from("ride_participants")
    .delete()
    .eq("ride_id", rideId)
    .eq("user_id", userId);
  if (error) throw error;
}

export type NewRideInput = {
  title: string;
  start: string;
  end: string;
  date: string;
  time: string;
  km: number;
  spots: number;
  level: RideLevel;
  description: string;
  intercom: boolean;
  intercomType: string;
};

export async function createRide(
  input: NewRideInput,
  host: { id: string; nick: string },
): Promise<string> {
  const { data, error } = await supabase
    .from("rides")
    .insert({
      host_id: host.id,
      host_name: host.nick,
      title: input.title,
      start_point: input.start,
      end_point: input.end,
      ride_date: input.date,
      ride_time: input.time,
      km: input.km,
      spots: input.spots,
      level: input.level,
      description: input.description,
      intercom: input.intercom,
      intercom_type: input.intercom ? input.intercomType : "",
    })
    .select("id")
    .single();
  if (error) throw error;
  // Autor od razu jedzie na własnej wyprawie.
  await joinRide(data.id, host.id);
  return data.id;
}

export function formatDate(iso: string) {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("pl-PL", {
    weekday: "short",
    day: "numeric",
    month: "long",
  });
}

export async function updateRide(rideId: string, input: NewRideInput) {
  const { error } = await supabase
    .from("rides")
    .update({
      title: input.title,
      start_point: input.start,
      end_point: input.end,
      ride_date: input.date,
      ride_time: input.time,
      km: input.km,
      spots: input.spots,
      level: input.level,
      description: input.description,
      intercom: input.intercom,
      intercom_type: input.intercom ? input.intercomType : "",
    })
    .eq("id", rideId);
  if (error) throw error;
}

export async function deleteRide(rideId: string) {
  const { error } = await supabase.from("rides").delete().eq("id", rideId);
  if (error) throw error;
}
