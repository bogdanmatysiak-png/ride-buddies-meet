import { supabase } from "@/integrations/supabase/client";

export type RideMessage = {
  id: string;
  userId: string;
  nick: string;
  body: string;
  createdAt: string;
};

export const rideMessagesQueryKey = (rideId: string) =>
  ["ride-messages", rideId] as const;

export async function fetchRideMessages(rideId: string): Promise<RideMessage[]> {
  const { data, error } = await supabase
    .from("ride_messages")
    .select("id, user_id, body, created_at")
    .eq("ride_id", rideId)
    .order("created_at", { ascending: true });
  if (error) throw error;

  const rows = data ?? [];
  const ids = [...new Set(rows.map((r) => r.user_id))];
  const nickById = new Map<string, string>();
  if (ids.length > 0) {
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, nick")
      .in("id", ids);
    for (const p of profiles ?? []) nickById.set(p.id, p.nick);
  }

  return rows.map((r) => ({
    id: r.id,
    userId: r.user_id,
    nick: nickById.get(r.user_id) ?? "Motocyklista",
    body: r.body,
    createdAt: r.created_at,
  }));
}

export async function sendRideMessage(
  rideId: string,
  userId: string,
  body: string,
) {
  const trimmed = body.trim().slice(0, 1000);
  if (!trimmed) return;
  const { error } = await supabase
    .from("ride_messages")
    .insert({ ride_id: rideId, user_id: userId, body: trimmed });
  if (error) throw error;
}

export async function deleteRideMessage(id: string) {
  const { error } = await supabase.from("ride_messages").delete().eq("id", id);
  if (error) throw error;
}

export function formatMessageTime(iso: string) {
  return new Date(iso).toLocaleString("pl-PL", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}