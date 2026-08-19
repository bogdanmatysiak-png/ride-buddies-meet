import { supabase } from "@/integrations/supabase/client";

export type RideLevel = "chill" | "sport" | "adventure";

export type Ride = {
  id: string;
  hostId: string | null;
  host: string;
  title: string;
  start: string;
  end: string;
  waypoints: string[];
  date: string;
  time: string;
  km: number;
  durationMinutes: number | null;
  level: RideLevel;
  spots: number;
  description: string;
  intercom: boolean;
  intercomType: string;
  groupId: string | null;
  groupName: string | null;
  riderIds: string[];
  riders: string[];
  encodedPolyline: string | null;
  cameras: number | null;
  sectionChecks: number | null;
  cameraSources: string[];
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
      .select("*, ride_participants(user_id), groups(name)")
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
      waypoints: r.waypoints ?? [],
      date: r.ride_date,
      time: r.ride_time,
      km: r.km,
      durationMinutes: r.duration_minutes ?? null,
      level: r.level,
      spots: r.spots,
      description: r.description,
      intercom: r.intercom,
      intercomType: r.intercom_type,
      groupId: r.group_id,
      groupName: r.groups?.name ?? null,
      riderIds,
      riders: riderIds.map((id) => nickById.get(id) ?? "Motocyklista"),
      encodedPolyline: r.encoded_polyline ?? null,
      cameras: r.cameras ?? null,
      sectionChecks: r.section_checks ?? null,
      cameraSources: r.camera_sources ?? [],
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
  waypoints: string[];
  date: string;
  time: string;
  km: number;
  durationMinutes?: number | null;
  spots: number;
  level: RideLevel;
  description: string;
  intercom: boolean;
  intercomType: string;
  groupId?: string | null;
  encodedPolyline?: string | null;
  cameras?: number | null;
  sectionChecks?: number | null;
  cameraSources?: string[];
};

// Auto-nazwa: kolejny, rosnący numer wyprawy (nigdy nie cofa się po usunięciach).
async function nextAutoTitle(nick: string): Promise<string> {
  const { data } = await supabase
    .from("rides")
    .select("title")
    .ilike("title", "%zapraszam na wyprawę numer %");
  let max = 0;
  for (const row of data ?? []) {
    const m = /zapraszam na wyprawę numer\s+(\d+)/i.exec(row.title ?? "");
    if (m) max = Math.max(max, Number(m[1]));
  }
  return `${nick} zapraszam na wyprawę numer ${max + 1}`;
}

export async function createRide(
  input: NewRideInput,
  host: { id: string; nick: string },
): Promise<string> {
  const title = input.title.trim() || (await nextAutoTitle(host.nick));
  const { data, error } = await supabase
    .from("rides")
    .insert({
      host_id: host.id,
      host_name: host.nick,
      title,
      start_point: input.start,
      end_point: input.end,
      waypoints: input.waypoints,
      ride_date: input.date,
      ride_time: input.time,
      km: input.km,
      duration_minutes: input.durationMinutes ?? null,
      spots: input.spots,
      level: input.level,
      description: input.description,
      intercom: input.intercom,
      intercom_type: input.intercom ? input.intercomType : "",
      group_id: input.groupId ?? null,
      encoded_polyline: input.encodedPolyline ?? null,
      cameras: input.cameras ?? null,
      section_checks: input.sectionChecks ?? null,
      camera_sources: input.cameraSources ?? [],
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
      waypoints: input.waypoints,
      ride_date: input.date,
      ride_time: input.time,
      km: input.km,
      duration_minutes: input.durationMinutes ?? null,
      spots: input.spots,
      level: input.level,
      description: input.description,
      intercom: input.intercom,
      intercom_type: input.intercom ? input.intercomType : "",
      group_id: input.groupId ?? null,
      encoded_polyline: input.encodedPolyline ?? null,
      cameras: input.cameras ?? null,
      section_checks: input.sectionChecks ?? null,
      camera_sources: input.cameraSources ?? [],
    })
    .eq("id", rideId);
  if (error) throw error;
}

export async function deleteRide(rideId: string) {
  const { error } = await supabase.from("rides").delete().eq("id", rideId);
  if (error) throw error;
}
