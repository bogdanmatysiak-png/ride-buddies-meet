/**
 * Serwerowy, idempotentny mechanizm dokończenia usuwania konta.
 *
 * Atomowa jest wyłącznie część PostgreSQL w `public.delete_my_account`.
 * Storage i Auth są etapami zewnętrznymi, audytowanymi w
 * `public.account_deletions.status`:
 *   pending -> database_deleted -> storage_deleted -> auth_deleted, albo failed.
 *
 * Kluczowa zasada: rekord w `public.account_deletion_objects` dostaje
 * `removed = true` WYŁĄCZNIE dla nazw obiektów, których usunięcie potwierdził
 * Supabase Storage. Auth usuwamy tylko po potwierdzonym `storage_deleted`
 * (zero rekordów `removed = false`).
 *
 * Moduł jest server-only (.server.ts). Pracuje na log_id i stanie audytu;
 * nigdy nie przyjmuje user_id od frontendu.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type DeletionStatus =
  | "pending"
  | "database_deleted"
  | "storage_deleted"
  | "auth_deleted"
  | "failed";

/** Etapy zapisywalne przez set_account_deletion_stage (bez auth_deleted). */
type StageStatus = Exclude<DeletionStatus, "auth_deleted">;

/** Zapis etapu w audycie. Zwraca false, gdy zapisu nie udało się wykonać. */
async function setStage(
  logId: string | null,
  status: StageStatus,
  errorCode: string | null,
  photosRemoved: number | null,
): Promise<boolean> {
  if (!logId) return false;
  const args: {
    p_log_id: string;
    p_status: string;
    p_last_error_code?: string;
    p_photos_removed?: number;
  } = { p_log_id: logId, p_status: status };
  if (errorCode !== null) args.p_last_error_code = errorCode;
  if (photosRemoved !== null) args.p_photos_removed = photosRemoved;
  const { data, error } = await supabaseAdmin.rpc("set_account_deletion_stage", args);
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

/** Obiekty oczekujące na usunięcie (removed = false) dla jednego procesu. */
async function loadPendingObjects(
  logId: string,
): Promise<{ bucket_id: string; object_name: string }[]> {
  const { data, error } = await supabaseAdmin
    .from("account_deletion_objects")
    .select("bucket_id, object_name")
    .eq("log_id", logId)
    .eq("removed", false);
  if (error) {
    console.error("[account-deletion] pending objects read failed", {
      logId,
      code: error.code ?? "unknown",
    });
    throw new Error("Nie udało się odczytać kolejki plików");
  }
  return data ?? [];
}

/** Liczba obiektów wciąż oczekujących na usunięcie. -1 gdy odczyt zawiódł. */
async function countPending(logId: string): Promise<number> {
  const { data, error } = await supabaseAdmin.rpc("count_pending_account_deletion_objects", {
    p_log_id: logId,
  });
  if (error) {
    console.error("[account-deletion] pending count failed", {
      logId,
      code: error.code ?? "unknown",
    });
    return -1;
  }
  return typeof data === "number" ? data : -1;
}

/**
 * Usuwa z Storage obiekty z kolejki (per bucket) i oznacza jako `removed`
 * wyłącznie te nazwy, które Storage potwierdził. Zwraca liczbę potwierdzonych.
 */
async function cleanupStorage(logId: string): Promise<number> {
  const pending = await loadPendingObjects(logId);
  if (pending.length === 0) return 0;

  const byBucket = new Map<string, string[]>();
  for (const row of pending) {
    if (!row.bucket_id || !row.object_name) continue;
    const names = byBucket.get(row.bucket_id) ?? [];
    names.push(row.object_name);
    byBucket.set(row.bucket_id, names);
  }

  let confirmed = 0;

  for (const [bucketId, names] of byBucket) {
    const { data: removedFiles, error: storageError } = await supabaseAdmin.storage
      .from(bucketId)
      .remove(names);

    if (storageError) {
      console.error("[account-deletion] storage remove failed", {
        logId,
        bucket: bucketId,
        objects: names.length,
      });
    }

    const requested = new Set(names);
    const removedNames = (removedFiles ?? [])
      .map((f) => f.name)
      .filter((n): n is string => typeof n === "string" && requested.has(n));

    if (removedNames.length === 0) continue;

    const { data: marked, error: markError } = await supabaseAdmin.rpc(
      "mark_account_deletion_objects_removed",
      { p_log_id: logId, p_bucket_id: bucketId, p_object_names: removedNames },
    );
    if (markError) {
      console.error("[account-deletion] queue update failed", {
        logId,
        bucket: bucketId,
        code: markError.code ?? "unknown",
      });
      continue;
    }
    confirmed += typeof marked === "number" ? marked : 0;
  }

  return confirmed;
}

export type FinishInput = {
  logId: string | null;
  userId: string;
  startAt: DeletionStatus;
};

export type FinishResult = {
  status: DeletionStatus;
  photosRemoved: number;
  auditWriteFailed: boolean;
};

/**
 * Dokańcza proces od wskazanego etapu. Idempotentne: powtórne wywołanie dla
 * tego samego log_id operuje wyłącznie na rekordach `removed = false` tego
 * log_id i tolerantnie traktuje już usunięte konto Auth.
 */
export async function finishAccountDeletion(input: FinishInput): Promise<FinishResult> {
  const { logId, userId, startAt } = input;
  let photosRemoved = 0;
  let auditWriteFailed = false;

  if (!logId) {
    throw new Error("Brak identyfikatora procesu usuwania konta");
  }

  // Etap 1: Storage — tylko potwierdzone usunięcia trafiają do kolejki jako removed
  if (startAt !== "storage_deleted" && startAt !== "auth_deleted") {
    photosRemoved = await cleanupStorage(logId);

    const pending = await countPending(logId);
    if (pending !== 0) {
      await setStage(logId, "failed", "storage_cleanup_failed", photosRemoved);
      // Konto Auth NIE jest usuwane — proces pozostaje niedokończony.
      throw new Error("Nie udało się dokończyć usuwania konta");
    }

    if (!(await setStage(logId, "storage_deleted", null, photosRemoved))) {
      // Bez potwierdzonego storage_deleted nie ruszamy Auth.
      throw new Error("Nie udało się dokończyć usuwania konta");
    }
  } else if (startAt === "storage_deleted") {
    const pending = await countPending(logId);
    if (pending !== 0) {
      await setStage(logId, "failed", "storage_cleanup_failed", null);
      throw new Error("Nie udało się dokończyć usuwania konta");
    }
  }

  // Etap 2: Auth — wyłącznie po potwierdzonym storage_deleted
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

  // Etap 3: finalny wpis audytowy (nie modyfikuje kolejki plików)
  const { data: done, error: doneError } = await supabaseAdmin.rpc(
    "mark_account_deletion_done",
    { p_log_id: logId, p_photos_removed: photosRemoved },
  );
  if (doneError || done === false) {
    auditWriteFailed = true;
    // KRYTYCZNE: dane i konto Auth są usunięte, ale audyt nie został domknięty.
    // Naprawa: POST /api/public/account-deletion-finish z Authorization: Bearer <CRON_SECRET>.
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
    try {
      await finishAccountDeletion({
        logId: row.log_id,
        userId: row.user_id,
        startAt: pending.length > 0 ? "database_deleted" : "storage_deleted",
      });
      completed += 1;
    } catch {
      failed += 1;
    }
  }

  return { processed: rows.length, completed, failed };
}
