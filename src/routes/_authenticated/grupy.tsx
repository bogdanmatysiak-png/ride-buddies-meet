import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { useSession } from "@/hooks/useAuth";
import {
  acceptInvite,
  cancelInvite,
  createGroup,
  declineInvite,
  deleteGroup,
  fetchGroupMembers,
  fetchMyGroups,
  fetchMyInvites,
  groupInvitesQueryKey,
  groupsQueryKey,
  inviteToGroup,
  removeMembership,
  renameGroup,
  setMemberRole,
  groupRoleLabel,
  type Group,
  type GroupRole,
} from "@/lib/groups";

export const Route = createFileRoute("/_authenticated/grupy")({
  head: () => ({
    meta: [
      { title: "Grupy motocyklistów — Motor Trip" },
      {
        name: "description",
        content:
          "Twórz grupy przyjaciół, zaproś ekipę do wspólnych wypraw i akceptuj zaproszenia do grup.",
      },
      { property: "og:title", content: "Grupy motocyklistów — Motor Trip" },
      { property: "og:description", content: "Twoja ekipa w jednym miejscu — grupy i zaproszenia." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: GroupsPage,
});

function GroupsPage() {
  const { user } = useSession();
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  const { data: groups = [] } = useQuery({
    queryKey: [...groupsQueryKey, user?.id],
    queryFn: () => fetchMyGroups(user!.id),
    enabled: !!user,
  });
  const { data: invites = [] } = useQuery({
    queryKey: [...groupInvitesQueryKey, user?.id],
    queryFn: () => fetchMyInvites(user!.id),
    enabled: !!user,
  });

  async function refresh() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: groupsQueryKey }),
      queryClient.invalidateQueries({ queryKey: groupInvitesQueryKey }),
    ]);
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    setBusy(true);
    try {
      await createGroup(name, user.id);
      setName("");
      await refresh();
      toast.success("Grupa utworzona — zaproś do niej ekipę");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Nie udało się utworzyć grupy");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="text-4xl text-foreground">Grupy</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Zbierz stałą ekipę: nadaj grupie nazwę, wyślij zaproszenia i dopisuj grupę do wypraw.
      </p>

      <form
        onSubmit={handleCreate}
        className="mt-6 rounded-lg border border-border bg-card p-5"
      >
        <label
          htmlFor="groupName"
          className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground"
        >
          Nazwa nowej grupy
        </label>
        <input
          id="groupName"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={60}
          required
          placeholder="Beskidzka Ekipa"
          className="input-moto mt-1"
        />
        <button
          type="submit"
          disabled={busy || name.trim().length < 2}
          className="mt-3 w-full rounded-md bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground shadow-ember transition-opacity hover:opacity-90 disabled:opacity-60"
        >
          {busy ? "Tworzę…" : "Utwórz grupę"}
        </button>
      </form>

      {invites.length > 0 && (
        <section className="mt-8">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-3xl text-foreground">Zaproszenia dla Ciebie</h2>
            <Link
              to="/zaproszenia"
              className="text-[11px] font-semibold uppercase tracking-wider text-primary hover:underline"
            >
              Ekran zaproszeń
            </Link>
          </div>
          <ul className="mt-3 space-y-2">
            {invites.map((invite) => (
              <li
                key={invite.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-primary/50 bg-card p-4"
              >
                <span className="text-sm text-foreground">
                  Zaproszenie do grupy{" "}
                  <span className="font-semibold text-primary">{invite.groupName}</span>
                  <span className="ml-1 text-xs text-muted-foreground">
                    (rola: {groupRoleLabel[invite.role]})
                  </span>
                </span>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={async () => {
                      try {
                        await acceptInvite(invite.id);
                        await refresh();
                        toast.success(`Dołączyłeś do grupy ${invite.groupName}`);
                      } catch (error) {
                        toast.error(
                          error instanceof Error ? error.message : "Nie udało się zaakceptować",
                        );
                      }
                    }}
                    className="rounded-md bg-primary px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-primary-foreground"
                  >
                    Akceptuję
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      try {
                        await declineInvite(invite.id);
                        await refresh();
                        toast.success("Zaproszenie odrzucone — nadawca dostał powiadomienie");
                      } catch (error) {
                        toast.error(
                          error instanceof Error ? error.message : "Nie udało się odrzucić",
                        );
                      }
                    }}
                    className="rounded-md border border-border px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground hover:border-destructive hover:text-destructive"
                  >
                    Odrzuć
                  </button>
                  <Link
                    to="/grupa/$id"
                    params={{ id: invite.groupId }}
                    className="rounded-md border border-border px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground hover:border-primary hover:text-primary"
                  >
                    Podejrzyj
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="mt-10">
        <h2 className="text-3xl text-foreground">Twoje grupy</h2>
        <div className="mt-4 space-y-3">
          {groups.map((group) => (
            <GroupRow key={group.id} group={group} userId={user?.id ?? null} onChanged={refresh} />
          ))}
          {groups.length === 0 && (
            <p className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
              Nie masz jeszcze żadnej grupy — utwórz pierwszą powyżej.
            </p>
          )}
        </div>
      </section>
    </main>
  );
}

function GroupRow({
  group,
  userId,
  onChanged,
}: {
  group: Group;
  userId: string | null;
  onChanged: () => Promise<void>;
}) {
  const queryClient = useQueryClient();
  const [nick, setNick] = useState("");
  const [inviteRole, setInviteRole] = useState<GroupRole>("member");
  const [rename, setRename] = useState(group.name);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const membersKey = ["group-members", group.id];
  const { data: members = [] } = useQuery({
    queryKey: membersKey,
    queryFn: () => fetchGroupMembers(group.id),
    enabled: open,
  });

  async function reload() {
    await queryClient.invalidateQueries({ queryKey: membersKey });
    await onChanged();
  }

  return (
    <div className="rounded-lg border border-border bg-card p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-2xl text-foreground">{group.name}</h3>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Twoja rola: {groupRoleLabel[group.myRole]}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="rounded-md border border-border px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground hover:border-primary hover:text-primary"
        >
          {open ? "Zwiń" : "Zarządzaj"}
        </button>
      </div>
      <div className="mt-3">
        <Link
          to="/grupa/$id"
          params={{ id: group.id }}
          className="inline-flex items-center gap-1 rounded-md border border-primary px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-primary transition-colors hover:bg-primary hover:text-primary-foreground"
        >
          Otwórz czat grupy
        </Link>
      </div>

      {open && (
        <div className="mt-4 space-y-4">
          <ul className="space-y-2">
            {members.map((m) => (
              <li
                key={m.id}
                className="flex items-center justify-between gap-2 rounded-md border border-border bg-background px-3 py-2"
              >
                <span className="min-w-0 flex-1 truncate text-sm text-foreground">{m.nick}</span>
                {group.isOwner && m.userId !== group.ownerId ? (
                  <select
                    value={m.role}
                    aria-label={`Rola ${m.nick}`}
                    onChange={async (e) => {
                      try {
                        await setMemberRole(m.id, e.target.value as "member" | "moderator");
                        await reload();
                        toast.success(`Rola ${m.nick} zmieniona`);
                      } catch (error) {
                        toast.error(
                          error instanceof Error ? error.message : "Nie udało się zmienić roli",
                        );
                      }
                    }}
                    className="rounded-md border border-border bg-card px-2 py-1 text-xs text-foreground"
                  >
                    <option value="member">{groupRoleLabel.member}</option>
                    <option value="moderator">{groupRoleLabel.moderator}</option>
                  </select>
                ) : (
                  <span className="text-[11px] uppercase tracking-wider text-primary">
                    {groupRoleLabel[m.role]}
                  </span>
                )}
                <span className="text-[11px] uppercase tracking-wider text-muted-foreground">
                  {m.status === "accepted" ? "w grupie" : "zaproszony"}
                </span>
                {(group.isOwner || m.userId === userId) && (
                  <button
                    type="button"
                    onClick={async () => {
                      try {
                        if (m.status === "pending") {
                          await cancelInvite(m.id);
                        } else {
                          await removeMembership(m.id);
                        }
                        await reload();
                        toast.success(
                          m.status === "pending"
                            ? `Zaproszenie dla ${m.nick} anulowane`
                            : "Zaktualizowano skład grupy",
                        );
                      } catch (error) {
                        toast.error(
                          error instanceof Error ? error.message : "Nie udało się usunąć",
                        );
                      }
                    }}
                    className="rounded-md border border-border px-2 text-sm text-muted-foreground hover:border-destructive hover:text-destructive"
                    aria-label={
                      m.status === "pending"
                        ? `Anuluj zaproszenie dla ${m.nick}`
                        : `Usuń ${m.nick} z grupy`
                    }
                  >
                    ✕
                  </button>
                )}
              </li>
            ))}
            {members.length === 0 && (
              <li className="text-xs text-muted-foreground">Brak członków do wyświetlenia.</li>
            )}
          </ul>

          {group.isOwner && (
            <>
              <div className="flex gap-2">
                <input
                  value={nick}
                  onChange={(e) => setNick(e.target.value)}
                  maxLength={40}
                  placeholder="Nick osoby do zaproszenia"
                  className="input-moto flex-1"
                />
                <select
                  value={inviteRole}
                  aria-label="Rola w grupie dla zaproszonej osoby"
                  onChange={(e) => setInviteRole(e.target.value as GroupRole)}
                  className="shrink-0 rounded-md border border-border bg-card px-2 text-xs text-foreground"
                >
                  <option value="member">{groupRoleLabel.member}</option>
                  <option value="moderator">{groupRoleLabel.moderator}</option>
                </select>
                <button
                  type="button"
                  disabled={busy || nick.trim().length < 2 || !userId}
                  onClick={async () => {
                    if (!userId) return;
                    setBusy(true);
                    try {
                      const invited = await inviteToGroup(group.id, nick, userId, inviteRole);
                      setNick("");
                      await reload();
                      toast.success(`Zaproszenie dla ${invited} wysłane`);
                    } catch (error) {
                      toast.error(
                        error instanceof Error ? error.message : "Nie udało się zaprosić",
                      );
                    } finally {
                      setBusy(false);
                    }
                  }}
                  className="shrink-0 rounded-md border border-primary px-4 text-xs font-semibold uppercase tracking-wider text-primary transition-colors hover:bg-primary hover:text-primary-foreground disabled:opacity-50"
                >
                  Zaproś
                </button>
              </div>

              <div className="flex gap-2">
                <input
                  value={rename}
                  onChange={(e) => setRename(e.target.value)}
                  maxLength={60}
                  placeholder="Nowa nazwa grupy"
                  className="input-moto flex-1"
                />
                <button
                  type="button"
                  disabled={busy || rename.trim().length < 2 || rename.trim() === group.name}
                  onClick={async () => {
                    setBusy(true);
                    try {
                      await renameGroup(group.id, rename);
                      await reload();
                      toast.success("Nazwa grupy zmieniona");
                    } catch (error) {
                      toast.error(
                        error instanceof Error ? error.message : "Nie udało się zmienić nazwy",
                      );
                    } finally {
                      setBusy(false);
                    }
                  }}
                  className="shrink-0 rounded-md border border-border px-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground transition-colors hover:border-primary hover:text-primary disabled:opacity-50"
                >
                  Zmień nazwę
                </button>
              </div>

              <button
                type="button"
                onClick={async () => {
                  try {
                    await deleteGroup(group.id);
                    await onChanged();
                    toast.success("Grupa usunięta");
                  } catch (error) {
                    toast.error(error instanceof Error ? error.message : "Nie udało się usunąć");
                  }
                }}
                className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground underline-offset-4 hover:text-destructive hover:underline"
              >
                Usuń grupę
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
