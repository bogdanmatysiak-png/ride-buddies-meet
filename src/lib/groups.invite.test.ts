import { describe, expect, it, vi, beforeEach } from "vitest";

const insert = vi.fn();
const state: { owned: unknown; memberships: unknown; insertError: unknown } = {
  owned: [],
  memberships: [],
  insertError: null,
};

vi.mock("@/integrations/supabase/client", () => {
  function groupsQuery() {
    return { select: () => ({ eq: () => Promise.resolve({ data: state.owned, error: null }) }) };
  }
  function membersQuery() {
    return {
      select: () => ({
        eq: () => ({ in: () => Promise.resolve({ data: state.memberships, error: null }) }),
      }),
      insert: (row: unknown) => {
        insert(row);
        return Promise.resolve({ error: state.insertError });
      },
    };
  }
  return {
    supabase: {
      from: (table: string) => (table === "groups" ? groupsQuery() : membersQuery()),
    },
  };
});

const { buildInviteTargets, fetchInviteTargets, inviteToTeam } = await import("./groups");

const OWNER = "owner-1";
const INVITEE = "rider-2";

beforeEach(() => {
  insert.mockClear();
  state.owned = [];
  state.memberships = [];
  state.insertError = null;
});

describe("buildInviteTargets", () => {
  it("właściciel ekipy może zaprosić obcą osobę", () => {
    expect(buildInviteTargets([{ id: "g1", name: "Ekipa" }], [], OWNER, INVITEE)).toEqual([
      { groupId: "g1", groupName: "Ekipa", state: "available" },
    ]);
  });

  it("brak ekip = brak opcji zaproszenia (zwykły członek, nie właściciel)", () => {
    expect(buildInviteTargets([], [], "member-9", INVITEE)).toEqual([]);
  });

  it("niezalogowany nie ma żadnych celów zaproszenia", () => {
    expect(buildInviteTargets([{ id: "g1", name: "Ekipa" }], [], "", INVITEE)).toEqual([]);
  });

  it("nie można zaprosić samego siebie", () => {
    expect(buildInviteTargets([{ id: "g1", name: "Ekipa" }], [], OWNER, OWNER)).toEqual([]);
  });

  it("obecny członek ekipy nie jest zaproszalny", () => {
    const out = buildInviteTargets(
      [{ id: "g1", name: "Ekipa" }],
      [{ group_id: "g1", user_id: INVITEE, status: "accepted" }],
      OWNER,
      INVITEE,
    );
    expect(out[0]!.state).toBe("member");
  });

  it("aktywne oczekujące zaproszenie blokuje duplikat", () => {
    const out = buildInviteTargets(
      [{ id: "g1", name: "Ekipa" }],
      [{ group_id: "g1", user_id: INVITEE, status: "pending" }],
      OWNER,
      INVITEE,
    );
    expect(out[0]!.state).toBe("pending");
  });
});

describe("fetchInviteTargets", () => {
  it("łączy moje ekipy ze stanem osoby", async () => {
    state.owned = [
      { id: "g2", name: "Zakręty" },
      { id: "g1", name: "Ekipa" },
    ];
    state.memberships = [{ group_id: "g2", user_id: INVITEE, status: "accepted" }];
    const out = await fetchInviteTargets(OWNER, INVITEE);
    expect(out).toEqual([
      { groupId: "g1", groupName: "Ekipa", state: "available" },
      { groupId: "g2", groupName: "Zakręty", state: "member" },
    ]);
  });

  it("bez ekip nic nie zwraca", async () => {
    expect(await fetchInviteTargets(OWNER, INVITEE)).toEqual([]);
  });
});

describe("inviteToTeam", () => {
  it("wysyła oczekujące zaproszenie z rolą member", async () => {
    await inviteToTeam("g1", INVITEE, OWNER);
    expect(insert).toHaveBeenCalledWith({
      group_id: "g1",
      user_id: INVITEE,
      status: "pending",
      invited_by: OWNER,
      role: "member",
    });
  });

  it("niezalogowany nie wyśle zaproszenia", async () => {
    await expect(inviteToTeam("g1", INVITEE, "")).rejects.toThrow(/zalogowany/);
    expect(insert).not.toHaveBeenCalled();
  });

  it("nie zaprosi samego siebie", async () => {
    await expect(inviteToTeam("g1", OWNER, OWNER)).rejects.toThrow(/samego siebie/);
    expect(insert).not.toHaveBeenCalled();
  });

  it("odmowa RLS (nie właściciel) daje czytelny błąd", async () => {
    state.insertError = { code: "42501", message: "new row violates row-level security policy" };
    await expect(inviteToTeam("g1", INVITEE, "member-9")).rejects.toThrow(/właściciel ekipy/);
  });

  it("duplikat zaproszenia jest odrzucany", async () => {
    state.insertError = { code: "23505", message: "duplicate key value" };
    await expect(inviteToTeam("g1", INVITEE, OWNER)).rejects.toThrow(/aktywne zaproszenie/);
  });
});
