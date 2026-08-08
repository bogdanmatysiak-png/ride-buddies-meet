import { supabase } from "@/integrations/supabase/client";

export type AppNotification = {
  id: string;
  rideId: string | null;
  groupId: string | null;
  title: string;
  body: string;
  readAt: string | null;
  createdAt: string;
};

export const notificationsQueryKey = (userId: string) => ["notifications", userId] as const;
export const notificationsHistoryQueryKey = (userId: string) =>
  ["notifications-history", userId] as const;

export async function fetchNotifications(userId: string): Promise<AppNotification[]> {
  const { data, error } = await supabase
    .from("notifications")
    .select("id, ride_id, group_id, title, body, read_at, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(30);
  if (error) throw error;
  return (data ?? []).map((n) => ({
    id: n.id,
    rideId: n.ride_id,
    groupId: n.group_id,
    title: n.title,
    body: n.body,
    readAt: n.read_at,
    createdAt: n.created_at,
  }));
}

export async function markNotificationsRead(userId: string) {
  const { error } = await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("user_id", userId)
    .is("read_at", null);
  if (error) throw error;
}

/** Pełna historia powiadomień uczestnika. */
export async function fetchNotificationHistory(userId: string): Promise<AppNotification[]> {
  const { data, error } = await supabase
    .from("notifications")
    .select("id, ride_id, group_id, title, body, read_at, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) throw error;
  return (data ?? []).map((n) => ({
    id: n.id,
    rideId: n.ride_id,
    groupId: n.group_id,
    title: n.title,
    body: n.body,
    readAt: n.read_at,
    createdAt: n.created_at,
  }));
}

export async function setNotificationRead(id: string, read: boolean) {
  const { error } = await supabase
    .from("notifications")
    .update({ read_at: read ? new Date().toISOString() : null })
    .eq("id", id);
  if (error) throw error;
}

export async function deleteNotification(id: string) {
  const { error } = await supabase.from("notifications").delete().eq("id", id);
  if (error) throw error;
}

/** Powiadamia uczestników wyprawy (bez prowadzącego, który sam wprowadził zmianę). */
export async function notifyRideParticipants(input: {
  rideId: string;
  userIds: string[];
  exceptUserId?: string;
  title: string;
  body: string;
}) {
  const targets = [...new Set(input.userIds)].filter((id) => id !== input.exceptUserId);
  if (targets.length === 0) return 0;
  const { error } = await supabase.from("notifications").insert(
    targets.map((userId) => ({
      user_id: userId,
      ride_id: input.rideId,
      title: input.title,
      body: input.body,
    })),
  );
  if (error) throw error;
  return targets.length;
}

export function formatNotificationTime(iso: string) {
  return new Date(iso).toLocaleString("pl-PL", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}
