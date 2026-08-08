import { supabase } from "@/integrations/supabase/client";

export type GroupRole = "owner" | "moderator" | "member";

export const groupRoleLabel: Record<GroupRole, string> = {
  owner: "Właściciel",
  moderator: "Moderator",
  member: "Członek",
};

export type Group = {
  id: string;
  name: string;
  ownerId: string;
  isOwner: boolean;
  myRole: GroupRole;
};

export type GroupInvite = {
  id: string;
  groupId: string;
  groupName: string;
  role: GroupRole;
  inviterNick: string;
  createdAt: string;
};

export type GroupMember = {
  id: string;
  userId: string;
  nick: string;
  status: "pending" | "accepted";
  role: GroupRole;
};

export const groupsQueryKey = ["groups"] as const;
export const groupInvitesQueryKey = ["group-invites"] as const;
export const sentInvitesQueryKey = ["group-invites-sent"] as const;

export type SentInvite = {
  id: string;
  groupId: string;
  groupName: string;
  role: GroupRole;
  inviteeNick: string;
  createdAt: string;
};

/** Grupy, do których należę (jako właściciel albo zaakceptowany członek). */
export async function fetchMyGroups(userId: string): Promise<Group[]> {
  const [{ data: memberships, error }, { data: owned, error: ownedError }] = await Promise.all([
    supabase
      .from("group_members")
      .select("role, group:groups(id, name, owner_id)")
      .eq("user_id", userId)
      .eq("status", "accepted"),
    supabase.from("groups").select("id, name, owner_id").eq("owner_id", userId),
  ]);
  if (error) throw error;
  if (ownedError) throw ownedError;

  const byId = new Map<string, Group>();
  for (const row of owned ?? []) {
    byId.set(row.id, {
      id: row.id,
      name: row.name,
      ownerId: row.owner_id,
      isOwner: true,
      myRole: "owner",
    });
  }
  for (const row of memberships ?? []) {
    const g = row.group;
    if (!g || byId.has(g.id)) continue;
    byId.set(g.id, {
      id: g.id,
      name: g.name,
      ownerId: g.owner_id,
      isOwner: g.owner_id === userId,
      myRole: (row.role as GroupRole) ?? "member",
    });
  }
  return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name, "pl"));
}

/** Zaproszenia oczekujące na moją akceptację. */
export async function fetchMyInvites(userId: string): Promise<GroupInvite[]> {
  const { data, error } = await supabase
    .from("group_members")
    .select("id, created_at, role, invited_by, group:groups(id, name)")
    .eq("user_id", userId)
    .eq("status", "pending")
    .order("created_at", { ascending: false });
  if (error) throw error;
  const rows = (data ?? []).filter((row) => row.group);
  const inviterIds = [...new Set(rows.map((r) => r.invited_by).filter(Boolean))] as string[];
  const { data: inviters } = inviterIds.length
    ? await supabase.from("profiles").select("id, nick").in("id", inviterIds)
    : { data: [] };
  const nickById = new Map((inviters ?? []).map((p) => [p.id, p.nick]));
  return rows
    .filter((row) => row.group)
    .map((row) => ({
      id: row.id,
      groupId: row.group!.id,
      groupName: row.group!.name,
      role: (row.role as GroupRole) ?? "member",
      inviterNick: (row.invited_by && nickById.get(row.invited_by)) || "Motocyklista",
      createdAt: row.created_at,
    }));
}

export async function fetchGroupMembers(groupId: string): Promise<GroupMember[]> {
  const { data, error } = await supabase
    .from("group_members")
    .select("id, user_id, status, role")
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
    role: (m.role as GroupRole) ?? "member",
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
    .insert({
      group_id: data.id,
      user_id: ownerId,
      status: "accepted",
      invited_by: ownerId,
      role: "owner",
    });
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
export async function inviteToGroup(
  groupId: string,
  nick: string,
  inviterId: string,
  role: GroupRole = "member",
) {
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
    .insert({
      group_id: groupId,
      user_id: profile.id,
      status: "pending",
      invited_by: inviterId,
      role,
    });
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

/** Zaproszenia, które ja wysłałem i wciąż czekają na odpowiedź. */
export async function fetchSentInvites(userId: string): Promise<SentInvite[]> {
  const { data, error } = await supabase
    .from("group_members")
    .select("id, created_at, role, user_id, group:groups(id, name)")
    .eq("invited_by", userId)
    .eq("status", "pending")
    .neq("user_id", userId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  const rows = (data ?? []).filter((row) => row.group);
  const ids = [...new Set(rows.map((r) => r.user_id))];
  const { data: profiles } = ids.length
    ? await supabase.from("profiles").select("id, nick").in("id", ids)
    : { data: [] };
  const nickById = new Map((profiles ?? []).map((p) => [p.id, p.nick]));
  return rows.map((row) => ({
    id: row.id,
    groupId: row.group!.id,
    groupName: row.group!.name,
    role: (row.role as GroupRole) ?? "member",
    inviteeNick: nickById.get(row.user_id) ?? "Motocyklista",
    createdAt: row.created_at,
  }));
}

/** Zaproszony odrzuca zaproszenie — nadawca dostaje powiadomienie (trigger w bazie). */
export async function declineInvite(memberId: string) {
  await removeMembership(memberId);
}

/** Nadawca (lub właściciel grupy) anuluje wysłane zaproszenie. */
export async function cancelInvite(memberId: string) {
  const { error } = await supabase
    .from("group_members")
    .delete()
    .eq("id", memberId)
    .eq("status", "pending");
  if (error) throw error;
}

/** Zmiana roli członka — tylko właściciel grupy (pilnuje tego baza). */
export async function setMemberRole(memberId: string, role: GroupRole) {
  const { error } = await supabase.from("group_members").update({ role }).eq("id", memberId);
  if (error) throw error;
}

/** Pojedyncza grupa (dla ekranu grupy / linków z powiadomień). */
export async function fetchGroupById(
  groupId: string,
  userId: string,
): Promise<(Group & { members: GroupMember[] }) | null> {
  const { data, error } = await supabase
    .from("groups")
    .select("id, name, owner_id")
    .eq("id", groupId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const members = await fetchGroupMembers(groupId);
  const mine = members.find((m) => m.userId === userId);
  return {
    id: data.id,
    name: data.name,
    ownerId: data.owner_id,
    isOwner: data.owner_id === userId,
    myRole: data.owner_id === userId ? "owner" : (mine?.role ?? "member"),
    members,
  };
}
