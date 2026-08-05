import { supabase } from "@/integrations/supabase/client";

export type AdminStats = {
  users: number;
  ridesTotal: number;
  ridesDone: number;
  kmDone: number;
  kmPlanned: number;
  riderKmDone: number;
};

export const adminStatsQueryKey = ["admin-stats"] as const;

export async function fetchAdminStats(): Promise<AdminStats> {
  const today = new Date().toISOString().slice(0, 10);

  const [{ count: users, error: usersError }, { data: rides, error: ridesError }] =
    await Promise.all([
      supabase.from("profiles").select("id", { count: "exact", head: true }),
      supabase.from("rides").select("km, ride_date, ride_participants(user_id)"),
    ]);
  if (usersError) throw usersError;
  if (ridesError) throw ridesError;

  let ridesDone = 0;
  let kmDone = 0;
  let kmPlanned = 0;
  let riderKmDone = 0;

  for (const r of rides ?? []) {
    const km = r.km ?? 0;
    if (r.ride_date < today) {
      ridesDone += 1;
      kmDone += km;
      riderKmDone += km * (r.ride_participants ?? []).length;
    } else {
      kmPlanned += km;
    }
  }

  return {
    users: users ?? 0,
    ridesTotal: (rides ?? []).length,
    ridesDone,
    kmDone,
    kmPlanned,
    riderKmDone,
  };
}

export function formatNumber(value: number) {
  return value.toLocaleString("pl-PL");
}
