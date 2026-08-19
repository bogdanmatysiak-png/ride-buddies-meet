import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type OwnedGroupPlan = {
  groupId: string;
  name: string;
  moderators: { userId: string; nick: string }[];
};

export type AccountDeletionPlan = {
  groupsWithModerators: OwnedGroupPlan[];
  groupsWithoutModerator: { groupId: string; name: string }[];
  ridesHosted: number;
};

/** Podsumowanie tego, co stanie się z grupami i wyprawami po usunięciu konta. */
export const getAccountDeletionPlan = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<AccountDeletionPlan> => {
    const { supabase, userId } = context;

    const [{ data: groups }, { count: ridesHosted }] = await Promise.all([
      supabase.from("groups").select("id, name").eq("owner_id", userId),
      supabase.from("rides").select("id", { count: "exact", head: true }).eq("host_id", userId),
    ]);

    const withMods: OwnedGroupPlan[] = [];
    const withoutMods: { groupId: string; name: string }[] = [];

    for (const group of groups ?? []) {
      const { data: mods } = await supabase
        .from("group_members")
        .select("user_id")
        .eq("group_id", group.id)
        .eq("status", "accepted")
        .eq("role", "moderator")
        .neq("user_id", userId);

      const ids = (mods ?? []).map((m) => m.user_id);
      if (ids.length === 0) {
        withoutMods.push({ groupId: group.id, name: group.name });
        continue;
      }
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, nick")
        .in("id", ids);
      const nickById = new Map((profiles ?? []).map((p) => [p.id, p.nick]));
      withMods.push({
        groupId: group.id,
        name: group.name,
        moderators: ids.map((id) => ({ userId: id, nick: nickById.get(id) ?? "Motocyklista" })),
      });
    }

    return {
      groupsWithModerators: withMods,
      groupsWithoutModerator: withoutMods,
      ridesHosted: ridesHosted ?? 0,
    };
  });

const deleteSchema = z.object({
  transfers: z
    .array(z.object({ groupId: z.string().uuid(), newOwnerUserId: z.string().uuid() }))
    .max(100)
    .default([]),
  confirmDeleteOrphanGroups: z.boolean().default(false),
});

/**
 * Trwałe usunięcie konta zalogowanej osoby. Identyfikacja wyłącznie po tokenie
 * (auth.uid() w bazie) — klient nigdy nie przekazuje user_id.
 */
export const deleteMyAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => deleteSchema.parse(input))
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    const { supabase, userId } = context;

    const { data: result, error } = await supabase.rpc("delete_my_account", {
      p_transfers: data.transfers.map((t) => ({
        group_id: t.groupId,
        new_owner_user_id: t.newOwnerUserId,
      })),
      p_confirm_delete_orphan_groups: data.confirmDeleteOrphanGroups,
    });
    if (error) {
      console.error("delete_my_account failed", { userId, message: error.message });
      throw new Error(error.message);
    }

    const payload = (result ?? {}) as {
      log_id?: string;
      photos?: string[];
    };

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    let removed = 0;
    const photos = (payload.photos ?? []).filter((p): p is string => typeof p === "string" && !!p);
    if (photos.length > 0) {
      const { data: removedFiles, error: storageError } = await supabaseAdmin.storage
        .from("chat-photos")
        .remove(photos);
      if (storageError) {
        console.error("chat-photos cleanup failed", { userId, message: storageError.message });
      }
      removed = removedFiles?.length ?? 0;
    }

    const { error: authError } = await supabaseAdmin.auth.admin.deleteUser(userId);
    if (authError) {
      console.error("auth user delete failed", { userId, message: authError.message });
      throw new Error("Nie udało się dokończyć usuwania konta");
    }

    if (payload.log_id) {
      await supabaseAdmin.rpc("mark_account_deletion_done", {
        p_log_id: payload.log_id,
        p_photos_removed: removed,
      });
    }

    return { ok: true };
  });
