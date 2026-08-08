import { supabase } from "@/integrations/supabase/client";

export type GroupMessage = {
  id: string;
  userId: string;
  nick: string;
  body: string;
  createdAt: string;
};

export const groupMessagesQueryKey = (groupId: string) =>
  ["group-messages", groupId] as const;

export async function fetchGroupMessages(groupId: string): Promise<GroupMessage[]> {
  const { data, error } = await supabase
    .from("group_messages")
    .select("id, user_id, body, created_at")
    .eq("group_id", groupId)
    .order("created_at", { ascending: true })
    .limit(300);
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

export async function sendGroupMessage(groupId: string, userId: string, body: string) {
  const trimmed = body.trim().slice(0, 1000);
  if (!trimmed) return;
  const { error } = await supabase
    .from("group_messages")
    .insert({ group_id: groupId, user_id: userId, body: trimmed });
  if (error) throw error;
}

export async function deleteGroupMessage(id: string) {
  const { error } = await supabase.from("group_messages").delete().eq("id", id);
  if (error) throw error;
}
