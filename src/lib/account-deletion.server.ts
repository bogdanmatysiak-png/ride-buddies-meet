/**
 * Serwerowy, idempotentny mechanizm dokończenia usuwania konta.
 *
 * Atomowa jest wyłącznie część PostgreSQL w `public.delete_my_account`.
 * Storage i Auth są etapami zewnętrznymi, wykonywanymi po niej i audytowanymi
 * w `public.account_deletions.status`:
 *   pending -> database_deleted -> storage_deleted -> auth_deleted, albo failed.
 *
 * Ten moduł jest server-only (rozszerzenie .server.ts) — nie jest dostępny dla
 * klienta ani dla roli authenticated. Pracuje wyłącznie na istniejącym log_id
 * i stanie audytu; nigdy nie przyjmuje user_id od frontendu.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type DeletionStatus =
  | "pending"
  | "database_deleted"
  | "storage_deleted"
  | "auth_deleted"
  | "failed";

const BUCKET = "chat-photos";

/** Zapis etapu w audycie. Zwraca false, gdy zapisu nie udało się wykonać. */
async function setStage(
  logId: string | null,
  status: DeletionStatus,
  errorCode: string | null,
  photosRemoved: number | null,
): Promise<boolean> {
  if (!logId) return false;
  const { data, error } = await supabaseAdmin.rpc("set_account_deletion_stage", {
    p_log_id: logId,
    p_status: status,
    p_last_error_code: errorCode,
    p_photos_removed: photosRemoved,
  });
  if (error) {
    console.error("[account-deletion] audit stage write failed", {
      logId,
      status,
      code: error.code ?? "unknown",
    });
    return false;
  }
  if (data === false) {
    console.error("[account-deletion] audit row not found", { logId, status });
    return false;
  }
  return true;
}

export type FinishInput = {
  logId: string | null;
  userId: string;
  /** Ścieżki obiektów w buckecie chat-photos do usunięcia (nigdy nie logowane). */
  photos: string[];
  startAt: DeletionStatus;
};

export type FinishResult = {
  status: DeletionStatus;
  photosRemoved: number;
  auditWriteFailed: boolean;
};

/**
 * Dokańcza proces od wskazanego etapu. Idempotentne: powtórne wywołanie dla
 * tego samego log_id nie usuwa cudzych danych (usuwa tylko obiekty zapisane
 * w kolejce dla tego log_id) i tolerantnie traktuje już usunięte konto Auth.
 */
export async function finishAccountDeletion(input: FinishInput): Promise<FinishResult> {
  const { logId, userId, photos, startAt } = input;
  let photosRemoved = 0;
  let auditWriteFailed = false;

  // Etap 1: Storage
  if (startAt === "pending" || startAt === "database_deleted") {
    if (photos.length > 0) {
      const { data: removedFiles, error: storageError } = await supabaseAdmin.storage
        .from(BUCKET)
        .remove(photos);
      if (storageError) {
        console.error("[account-deletion] storage stage failed", {
          logId,
          objects: photos.length,
        });
        await setStage(logId, "failed", "storage_remove_failed", null);
        // Konto Auth NIE jest usuwane — proces pozostaje niedokończony.
        throw new Error("Nie udało się dokończyć usuwania konta");
      }
      photosRemoved = removedFiles?.length ?? 0;
    }
    if (!(await setStage(logId, "storage_deleted", null, photosRemoved))) {
      auditWriteFailed = true;
    }
  }

  // Etap 2: Auth
  if (startAt !== "auth_deleted") {
    const { error: authError } = await supabaseAdmin.auth.admin.deleteUser(userId);
    if (authError) {
      const alreadyGone = authError.status === 404;
      if (!alreadyGone) {
        console.error("[account-deletion] auth stage failed", {
          logId,
          status: authError.status ?? 0,
        });
        await setStage(logId, "failed", "auth_delete_failed", photosRemoved);
        throw new Error("Nie udało się dokończyć usuwania konta");
      }
    }
  }

  // Etap 3: finalny wpis audytowy
  const { data: done, error: doneError } = await supabaseAdmin.rpc("mark_account_deletion_done", {
    p_log_id: logId,
    p_photos_removed: photosRemoved,
  });
  if (doneError || done === false) {
    auditWriteFailed = true;
    // KRYTYCZNE: dane i konto Auth są usunięte, ale audyt nie został domknięty.
    // Naprawa: administrator uruchamia POST /api/public/account-deletion-finish
    // z nagłówkiem Authorization: Bearer <CRON_SECRET>, który domyka wpis
    // idempotentnie na podstawie samego log_id (bez user_id od klienta).
    console.error("[account-deletion] CRITICAL: audit finalization failed", {
      logId,
      code: doneError?.code ?? "row_not_found",
    });
  }

  return { status: "auth_deleted", photosRemoved, auditWriteFailed };
}

/** Dokończenie wszystkich niedokończonych procesów (wyłącznie po stanie audytu). */
export async function resumeIncompleteAccountDeletions(limit = 50): Promise<{
  processed: number;
  completed: number;
  failed: number;
}> {
  const { data, error } = await supabaseAdmin.rpc("list_incomplete_account_deletions", {
    p_limit: limit,
  });
  if (error) {
    console.error("[account-deletion] resume listing failed", { code: error.code ?? "unknown" });
    throw new Error("Nie udało się odczytać niedokończonych procesów");
  }

  let completed = 0;
  let failed = 0;
  const rows = data ?? [];

  for (const row of rows) {
    const pending = (row.pending_objects ?? []) as { bucket_id: string; object_name: string }[];
    const photos = pending
      .filter((o) => o.bucket_id === BUCKET && typeof o.object_name === "string")
      .map((o) => o.object_name);
    try {
      await finishAccountDeletion({
        logId: row.log_id,
        userId: row.user_id,
        photos,
        startAt: photos.length > 0 ? "database_deleted" : "storage_deleted",
      });
      completed += 1;
    } catch {
      failed += 1;
    }
  }

  return { processed: rows.length, completed, failed };
}
