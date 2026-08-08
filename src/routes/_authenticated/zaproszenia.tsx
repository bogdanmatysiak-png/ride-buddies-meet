import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { MailOpen } from "lucide-react";
import { toast } from "sonner";
import { useSession } from "@/hooks/useAuth";
import {
  acceptInvite,
  cancelInvite,
  declineInvite,
  fetchSentInvites,
  fetchMyInvites,
  groupInvitesQueryKey,
  groupRoleLabel,
  groupsQueryKey,
  sentInvitesQueryKey,
} from "@/lib/groups";
import { formatNotificationTime } from "@/lib/notifications";

export const Route = createFileRoute("/_authenticated/zaproszenia")({
  head: () => ({
    meta: [
      { title: "Zaproszenia do grup — Motor Trip" },
      {
        name: "description",
        content:
          "Wszystkie zaproszenia do grup motocyklowych w jednym miejscu — zobacz kto zaprasza, jaką dostajesz rolę i zaakceptuj jednym kliknięciem.",
      },
      { property: "og:title", content: "Zaproszenia do grup — Motor Trip" },
      {
        property: "og:description",
        content: "Zobacz kto zaprasza Cię do ekipy i zaakceptuj zaproszenie do grupy.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: "Zaproszenia do grup — Motor Trip" },
      {
        name: "twitter:description",
        content: "Zobacz kto zaprasza Cię do ekipy i zaakceptuj zaproszenie do grupy.",
      },
    ],
  }),
  component: InvitesPage,
});

function InvitesPage() {
  const { user } = useSession();
  const queryClient = useQueryClient();

  const { data: invites = [], isLoading } = useQuery({
    queryKey: [...groupInvitesQueryKey, user?.id],
    queryFn: () => fetchMyInvites(user!.id),
    enabled: !!user,
  });
  const { data: sent = [] } = useQuery({
    queryKey: [...sentInvitesQueryKey, user?.id],
    queryFn: () => fetchSentInvites(user!.id),
    enabled: !!user,
  });

  async function refresh() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: groupInvitesQueryKey }),
      queryClient.invalidateQueries({ queryKey: groupsQueryKey }),
      queryClient.invalidateQueries({ queryKey: sentInvitesQueryKey }),
    ]);
  }

  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="flex items-center gap-2 font-display text-3xl tracking-wide text-foreground">
        <MailOpen className="h-6 w-6 text-primary" />
        Zaproszenia
      </h1>
      <p className="mt-2 text-sm text-muted-foreground">
        {invites.length > 0
          ? `Masz ${invites.length} oczekujące zaproszenia do grup.`
          : "Tu pojawią się zaproszenia do grup motocyklowych."}
      </p>

      {isLoading ? (
        <p className="mt-8 text-sm text-muted-foreground">Ładowanie…</p>
      ) : invites.length === 0 ? (
        <div className="mt-6 rounded-lg border border-dashed border-border p-8 text-center">
          <p className="text-sm text-muted-foreground">
            Brak oczekujących zaproszeń. Możesz też sam założyć ekipę.
          </p>
          <Link
            to="/grupy"
            className="mt-4 inline-block rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90"
          >
            Przejdź do grup
          </Link>
        </div>
      ) : (
        <ul className="mt-6 space-y-3">
          {invites.map((invite) => (
            <li key={invite.id} className="rounded-lg border border-primary/50 bg-card p-4">
              <p className="text-sm text-foreground">
                <span className="font-semibold text-primary">{invite.inviterNick}</span> zaprasza Cię
                do grupy{" "}
                <span className="font-semibold text-foreground">{invite.groupName}</span>
              </p>
              <p className="mt-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Rola: {groupRoleLabel[invite.role]} · {formatNotificationTime(invite.createdAt)}
              </p>
              <div className="mt-3 flex gap-2">
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
                      toast.error(error instanceof Error ? error.message : "Nie udało się odrzucić");
                    }
                  }}
                  className="rounded-md border border-border px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground hover:border-destructive hover:text-destructive"
                >
                  Odrzuć
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <section className="mt-10">
        <h2 className="font-display text-2xl tracking-wide text-foreground">Wysłane przez Ciebie</h2>
        {sent.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">
            Nie masz zaproszeń oczekujących na odpowiedź.
          </p>
        ) : (
          <ul className="mt-4 space-y-3">
            {sent.map((invite) => (
              <li
                key={invite.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-card p-4"
              >
                <div>
                  <p className="text-sm text-foreground">
                    <span className="font-semibold text-primary">{invite.inviteeNick}</span> —
                    zaproszenie do grupy{" "}
                    <span className="font-semibold text-foreground">{invite.groupName}</span>
                  </p>
                  <p className="mt-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Rola: {groupRoleLabel[invite.role]} · {formatNotificationTime(invite.createdAt)} ·
                    czeka na odpowiedź
                  </p>
                </div>
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      await cancelInvite(invite.id);
                      await refresh();
                      toast.success(`Zaproszenie dla ${invite.inviteeNick} anulowane`);
                    } catch (error) {
                      toast.error(
                        error instanceof Error ? error.message : "Nie udało się anulować zaproszenia",
                      );
                    }
                  }}
                  className="rounded-md border border-border px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground hover:border-destructive hover:text-destructive"
                >
                  Anuluj
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
