import { supabase } from "@/integrations/supabase/client";

export type Group = { id: string; name: string; ownerId: string; isOwner: boolean };

export type GroupInvite = {
  id: string;
  groupId: string;
  groupName: string;
  createdAt: string;
};

export type GroupMember = {
  id: string;
  userId: string;
  nick: string;
  status: "pending" | "accepted";
};

export const groupsQueryKey = ["groups"] as const;
export const groupInvitesQueryKey = ["group-invites"] as const;

/** Grupy, do których należę (jako właściciel albo zaakceptowany członek). */
export async function fetchMyGroups(userId: string): Promise<Group[]> {
  const [{ data: memberships, error }, { data: owned, error: ownedError }] = await Promise.all([
    supabase
      .from("group_members")
      .select("group:groups(id, name, owner_id)")
      .eq("user_id", userId)
      .eq("status", "accepted"),
    supabase.from("groups").select("id, name, owner_id").eq("owner_id", userId),
  ]);
  if (error) throw error;
  if (ownedError) throw ownedError;

  const byId = new Map<string, Group>();
  for (const row of owned ?? []) {
    byId.set(row.id, { id: row.id, name: row.name, ownerId: row.owner_id, isOwner: true });
  }
  for (const row of memberships ?? []) {
    const g = row.group;
    if (!g || byId.has(g.id)) continue;
    byId.set(g.id, { id: g.id, name: g.name, ownerId: g.owner_id, isOwner: g.owner_id === userId });
  }
  return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name, "pl"));
}

/** Zaproszenia oczekujące na moją akceptację. */
export async function fetchMyInvites(userId: string): Promise<GroupInvite[]> {
  const { data, error } = await supabase
    .from("group_members")
    .select("id, created_at, group:groups(id, name)")
    .eq("user_id", userId)
    .eq("status", "pending")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? [])
    .filter((row) => row.group)
    .map((row) => ({
      id: row.id,
      groupId: row.group!.id,
      groupName: row.group!.name,
      createdAt: row.created_at,
    }));
}

export async function fetchGroupMembers(groupId: string): Promise<GroupMember[]> {
  const { data, error } = await supabase
    .from("group_members")
    .select("id, user_id, status")
    .eq("group_id", groupId);
  if (error) throw error;
  const ids = (data ?? []).map((m) => m.user_id);
  const { data: profiles } = ids.length
    ? await supabase.from("profiles").select("id, nick").in("id", ids)
    : { data: [] };
  const nickById = new Map((profiles ?? []).map((p) => [p.id, p.nick]));
  return (data ?? []).map((m) => ({
    id: m.id,
    userId: m.user_id,
    nick: nickById.get(m.user_id) ?? "Motocyklista",
    status: m.status,
  }));
}

export async function createGroup(name: string, ownerId: string): Promise<string> {
  const clean = name.trim();
  if (clean.length < 2) throw new Error("Nazwa grupy musi mieć co najmniej 2 znaki");
  const { data, error } = await supabase
    .from("groups")
    .insert({ name: clean, owner_id: ownerId })
    .select("id")
    .single();
  if (error) throw error;
  const { error: memberError } = await supabase
    .from("group_members")
    .insert({ group_id: data.id, user_id: ownerId, status: "accepted", invited_by: ownerId });
  if (memberError) throw memberError;
  return data.id;
}

export async function renameGroup(groupId: string, name: string) {
  const clean = name.trim();
  if (clean.length < 2) throw new Error("Nazwa grupy musi mieć co najmniej 2 znaki");
  const { error } = await supabase.from("groups").update({ name: clean }).eq("id", groupId);
  if (error) throw error;
}

export async function deleteGroup(groupId: string) {
  const { error } = await supabase.from("groups").delete().eq("id", groupId);
  if (error) throw error;
}

/** Zaproszenie po nicku — zaproszony musi je zaakceptować. */
export async function inviteToGroup(groupId: string, nick: string, inviterId: string) {
  const clean = nick.trim();
  if (clean.length < 2) throw new Error("Podaj nick osoby, którą zapraszasz");
  const { data: profile, error } = await supabase
    .from("profiles")
    .select("id, nick")
    .ilike("nick", clean)
    .maybeSingle();
  if (error) throw error;
  if (!profile) throw new Error(`Nie znalazłem motocyklisty o nicku „${clean}”`);
  if (profile.id === inviterId) throw new Error("Jesteś już w tej grupie");
  const { error: insertError } = await supabase
    .from("group_members")
    .insert({ group_id: groupId, user_id: profile.id, status: "pending", invited_by: inviterId });
  if (insertError) {
    if (insertError.code === "23505" || insertError.code === "23514" || insertError.code === "23000") {
      throw new Error("Ta osoba jest już zaproszona albo należy do grupy");
    }
    if (insertError.code === "23503") throw new Error("Nie udało się zaprosić tej osoby");
    if (insertError.message.includes("duplicate")) {
      throw new Error("Ta osoba jest już zaproszona albo należy do grupy");
    }
    throw insertError;
  }
  return profile.nick;
}

export async function acceptInvite(memberId: string) {
  const { error } = await supabase
    .from("group_members")
    .update({ status: "accepted" })
    .eq("id", memberId);
  if (error) throw error;
}

/** Odrzucenie zaproszenia albo wyjście / usunięcie z grupy. */
export async function removeMembership(memberId: string) {
  const { error } = await supabase.from("group_members").delete().eq("id", memberId);
  if (error) throw error;
}
