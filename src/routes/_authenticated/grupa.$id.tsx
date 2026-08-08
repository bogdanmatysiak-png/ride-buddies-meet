import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Users } from "lucide-react";
import { toast } from "sonner";
import { useSession } from "@/hooks/useAuth";
import { GroupChat } from "@/components/GroupChat";
import {
  acceptInvite,
  declineInvite,
  fetchGroupById,
  fetchMyInvites,
  groupInvitesQueryKey,
  groupRoleLabel,
  groupsQueryKey,
} from "@/lib/groups";

export const Route = createFileRoute("/_authenticated/grupa/$id")({
  head: () => ({
    meta: [
      { title: "Grupa i czat ekipy — Motor Trip" },
      {
        name: "description",
        content:
          "Skład grupy motocyklowej, role członków i czat ekipy do ustalania wspólnych wypraw.",
      },
      { property: "og:title", content: "Grupa i czat ekipy — Motor Trip" },
      {
        property: "og:description",
        content: "Skład grupy, role i czat ekipy motocyklowej.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: GroupPage,
});

function GroupPage() {
  const { id } = Route.useParams();
  const { user } = useSession();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: group, isLoading } = useQuery({
    queryKey: ["group", id, user?.id],
    enabled: !!user,
    queryFn: () => fetchGroupById(id, user!.id),
  });

  const { data: invites = [] } = useQuery({
    queryKey: [...groupInvitesQueryKey, user?.id],
    enabled: !!user,
    queryFn: () => fetchMyInvites(user!.id),
  });
  const myInvite = invites.find((i) => i.groupId === id);

  async function refresh() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["group", id] }),
      queryClient.invalidateQueries({ queryKey: groupInvitesQueryKey }),
      queryClient.invalidateQueries({ queryKey: groupsQueryKey }),
    ]);
  }

  const me = group?.members.find((m) => m.userId === user?.id);
  const canWrite = !!group && (group.isOwner || me?.status === "accepted");

  return (
    <main className="mx-auto max-w-3xl px-4 py-6">
      <Link
        to="/grupy"
        className="inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground hover:text-primary"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> Wszystkie grupy
      </Link>

      {isLoading ? (
        <p className="mt-6 text-sm text-muted-foreground">Ładowanie…</p>
      ) : !group ? (
        <p className="mt-6 rounded-lg border border-border bg-card p-6 text-sm text-muted-foreground">
          Nie mam dostępu do tej grupy albo została usunięta.
        </p>
      ) : (
        <>
          <h1 className="mt-3 flex items-center gap-2 text-4xl text-foreground">
            <Users className="h-7 w-7 text-primary" />
            {group.name}
          </h1>
          <p className="mt-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Twoja rola: {groupRoleLabel[group.myRole]}
          </p>

          {myInvite && (
            <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-primary/50 bg-card p-4">
              <p className="text-sm text-foreground">
                Masz zaproszenie do tej grupy od{" "}
                <span className="font-semibold text-primary">{myInvite.inviterNick}</span> (rola:{" "}
                {groupRoleLabel[myInvite.role]})
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      await acceptInvite(myInvite.id);
                      await refresh();
                      toast.success("Jesteś w grupie — pisz do ekipy!");
                    } catch {
                      toast.error("Nie udało się zaakceptować zaproszenia");
                    }
                  }}
                  className="rounded-md bg-primary px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-primary-foreground"
                >
                  Akceptuj
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      await declineInvite(myInvite.id);
                      await refresh();
                      toast.success("Zaproszenie odrzucone");
                      navigate({ to: "/grupy" });
                    } catch {
                      toast.error("Nie udało się odrzucić zaproszenia");
                    }
                  }}
                  className="rounded-md border border-border px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground hover:border-destructive hover:text-destructive"
                >
                  Odrzuć
                </button>
              </div>
            </div>
          )}

          <section className="mt-5 rounded-lg border border-border bg-card p-5">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              Skład grupy ({group.members.filter((m) => m.status === "accepted").length})
            </h2>
            <ul className="mt-3 space-y-2">
              {group.members.map((m) => (
                <li
                  key={m.id}
                  className="flex items-center justify-between gap-2 rounded-md border border-border bg-background/40 px-3 py-2"
                >
                  <Link
                    to="/motocyklista/$id"
                    params={{ id: m.userId }}
                    className="min-w-0 flex-1 truncate text-sm text-foreground hover:text-primary"
                  >
                    {m.nick}
                  </Link>
                  <span className="text-[11px] uppercase tracking-wider text-primary">
                    {groupRoleLabel[m.role]}
                  </span>
                  <span className="text-[11px] uppercase tracking-wider text-muted-foreground">
                    {m.status === "accepted" ? "w grupie" : "zaproszony"}
                  </span>
                </li>
              ))}
            </ul>
            {group.isOwner && (
              <Link
                to="/grupy"
                className="mt-3 inline-block text-[11px] font-semibold uppercase tracking-wider text-primary hover:underline"
              >
                Zarządzaj składem i rolami
              </Link>
            )}
          </section>

          <GroupChat
            groupId={group.id}
            currentUserId={user?.id}
            canWrite={canWrite}
            isOwner={group.isOwner}
          />
        </>
      )}
    </main>
  );
}
