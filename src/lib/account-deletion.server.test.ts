import { beforeEach, describe, expect, it, vi } from "vitest";

type ObjRow = { log_id: string; bucket_id: string; object_name: string; removed: boolean };

const state = {
  objects: [] as ObjRow[],
  deletions: new Map<string, { status: string; last_error_code: string | null; auth_deleted: boolean; photos_removed: number }>(),
  storageRemove: vi.fn(),
  deleteUser: vi.fn(),
  rpcCalls: [] as { name: string; args: Record<string, unknown> }[],
};

function pendingFor(logId: string) {
  return state.objects.filter((o) => o.log_id === logId && !o.removed);
}

const supabaseAdmin = {
  from(table: string) {
    if (table !== "account_deletion_objects") throw new Error("unexpected table " + table);
    const filters: Record<string, unknown> = {};
    const builder = {
      select: () => builder,
      eq: (col: string, val: unknown) => {
        filters[col] = val;
        return builder;
      },
      then: (resolve: (v: unknown) => unknown) => {
        const rows = state.objects
          .filter((o) => Object.entries(filters).every(([k, v]) => (o as unknown as Record<string, unknown>)[k] === v))
          .map((o) => ({ bucket_id: o.bucket_id, object_name: o.object_name }));
        return Promise.resolve(resolve({ data: rows, error: null }));
      },
    };
    return builder;
  },
  storage: {
    from: (bucket: string) => ({
      remove: (names: string[]) => state.storageRemove(bucket, names),
    }),
  },
  auth: { admin: { deleteUser: (id: string) => state.deleteUser(id) } },
  async rpc(name: string, args: Record<string, unknown>) {
    state.rpcCalls.push({ name, args });
    if (name === "mark_account_deletion_objects_removed") {
      const logId = args["p_log_id"] as string;
      const bucket = args["p_bucket_id"] as string;
      const names = args["p_object_names"] as string[];
      let n = 0;
      for (const o of state.objects) {
        if (o.log_id === logId && o.bucket_id === bucket && names.includes(o.object_name) && !o.removed) {
          o.removed = true;
          n += 1;
        }
      }
      return { data: n, error: null };
    }
    if (name === "count_pending_account_deletion_objects") {
      return { data: pendingFor(args["p_log_id"] as string).length, error: null };
    }
    if (name === "set_account_deletion_stage") {
      if (args["p_status"] === "auth_deleted") {
        throw new Error("Status auth_deleted moze ustawic wylacznie mark_account_deletion_done");
      }
      if (typeof args["p_photos_removed"] === "number" && (args["p_photos_removed"] as number) < 0) {
        throw new Error("photos_removed nie moze byc ujemne");
      }
      const row = state.deletions.get(args["p_log_id"] as string);
      if (!row) return { data: false, error: null };
      row.status = args["p_status"] as string;
      row.last_error_code = (args["p_last_error_code"] as string) ?? null;
      if (typeof args["p_photos_removed"] === "number") row.photos_removed = args["p_photos_removed"] as number;
      return { data: true, error: null };
    }
    if (name === "mark_account_deletion_done") {
      const row = state.deletions.get(args["p_log_id"] as string);
      if (!row || row.status !== "storage_deleted") return { data: false, error: null };
      row.status = "auth_deleted";
      row.auth_deleted = true;
      row.last_error_code = null;
      return { data: true, error: null };
    }
    throw new Error("unexpected rpc " + name);
  },
};

vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin }));

const { finishAccountDeletion } = await import("./account-deletion.server");

const LOG = "11111111-1111-1111-1111-111111111111";
const OTHER_LOG = "22222222-2222-2222-2222-222222222222";
const USER = "33333333-3333-3333-3333-333333333333";

beforeEach(() => {
  vi.clearAllMocks();
  state.rpcCalls = [];
  state.objects = [
    { log_id: LOG, bucket_id: "chat-photos", object_name: "a.jpg", removed: false },
    { log_id: LOG, bucket_id: "chat-photos", object_name: "b.jpg", removed: false },
    { log_id: OTHER_LOG, bucket_id: "chat-photos", object_name: "other.jpg", removed: false },
  ];
  state.deletions = new Map([
    [LOG, { status: "database_deleted", last_error_code: null, auth_deleted: false, photos_removed: 0 }],
    [OTHER_LOG, { status: "database_deleted", last_error_code: null, auth_deleted: false, photos_removed: 0 }],
  ]);
  state.deleteUser.mockResolvedValue({ error: null });
});

describe("finishAccountDeletion", () => {
  it("częściowy błąd Storage: tylko potwierdzone pliki mają removed = true", async () => {
    state.storageRemove.mockResolvedValue({ data: [{ name: "a.jpg" }], error: { message: "partial" } });

    await expect(finishAccountDeletion({ logId: LOG, userId: USER, startAt: "database_deleted" })).rejects.toThrow();

    expect(state.objects.find((o) => o.object_name === "a.jpg")!.removed).toBe(true);
    expect(state.objects.find((o) => o.object_name === "b.jpg")!.removed).toBe(false);
    expect(state.deletions.get(LOG)!.status).toBe("failed");
    expect(state.deletions.get(LOG)!.last_error_code).toBe("storage_cleanup_failed");
    expect(state.deleteUser).not.toHaveBeenCalled();
  });

  it("błąd Storage: status failed i brak wywołania deleteUser", async () => {
    state.storageRemove.mockResolvedValue({ data: null, error: { message: "boom" } });

    await expect(finishAccountDeletion({ logId: LOG, userId: USER, startAt: "database_deleted" })).rejects.toThrow();

    expect(pendingFor(LOG)).toHaveLength(2);
    expect(state.deletions.get(LOG)!.status).toBe("failed");
    expect(state.deleteUser).not.toHaveBeenCalled();
  });

  it("sukces Storage: wszystkie obiekty removed = true, potem auth_deleted", async () => {
    state.storageRemove.mockResolvedValue({ data: [{ name: "a.jpg" }, { name: "b.jpg" }], error: null });

    const res = await finishAccountDeletion({ logId: LOG, userId: USER, startAt: "database_deleted" });

    expect(pendingFor(LOG)).toHaveLength(0);
    expect(res.photosRemoved).toBe(2);
    expect(state.deleteUser).toHaveBeenCalledWith(USER);
    expect(state.deletions.get(LOG)!.status).toBe("auth_deleted");
  });

  it("błąd Auth: status failed, auth_deleted pozostaje false", async () => {
    state.storageRemove.mockResolvedValue({ data: [{ name: "a.jpg" }, { name: "b.jpg" }], error: null });
    state.deleteUser.mockResolvedValue({ error: { status: 500, message: "auth down" } });

    await expect(finishAccountDeletion({ logId: LOG, userId: USER, startAt: "database_deleted" })).rejects.toThrow();

    expect(state.deletions.get(LOG)!.status).toBe("failed");
    expect(state.deletions.get(LOG)!.last_error_code).toBe("auth_delete_failed");
    expect(state.deletions.get(LOG)!.auth_deleted).toBe(false);
  });

  it("sukces Auth: status auth_deleted, auth_deleted = true", async () => {
    state.storageRemove.mockResolvedValue({ data: [{ name: "a.jpg" }, { name: "b.jpg" }], error: null });

    await finishAccountDeletion({ logId: LOG, userId: USER, startAt: "database_deleted" });

    expect(state.deletions.get(LOG)!.auth_deleted).toBe(true);
    expect(state.deletions.get(LOG)!.status).toBe("auth_deleted");

    // auth_deleted wyłącznie przez mark_account_deletion_done, po deleteUser
    expect(state.rpcCalls.some((c) => c.name === "mark_account_deletion_done")).toBe(true);
    expect(
      state.rpcCalls.some(
        (c) => c.name === "set_account_deletion_stage" && c.args["p_status"] === "auth_deleted",
      ),
    ).toBe(false);
  });

  it("ponowne dokończenie operuje tylko na removed = false i nie dotyka cudzych plików", async () => {
    state.objects.find((o) => o.object_name === "a.jpg")!.removed = true;
    state.storageRemove.mockResolvedValue({ data: [{ name: "b.jpg" }], error: null });

    await finishAccountDeletion({ logId: LOG, userId: USER, startAt: "database_deleted" });

    expect(state.storageRemove).toHaveBeenCalledWith("chat-photos", ["b.jpg"]);
    expect(state.objects.find((o) => o.log_id === OTHER_LOG)!.removed).toBe(false);
  });
});
