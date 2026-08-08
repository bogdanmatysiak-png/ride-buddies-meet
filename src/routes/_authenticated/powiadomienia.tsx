import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowUpRight, BellRing, Check, Trash2, Undo2, UserPlus, Users, X } from "lucide-react";
import { toast } from "sonner";
import { useSession } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import {
  acceptInvite,
  cancelInvite,
  declineInvite,
  fetchMyInvites,
  fetchSentInvites,
  groupInvitesQueryKey,
  groupRoleLabel,
  groupsQueryKey,
  sentInvitesQueryKey,
} from "@/lib/groups";
import {
  deleteNotification,
  fetchNotificationHistory,
  formatNotificationTime,
  markNotificationsRead,
  notificationsHistoryQueryKey,
  notificationsQueryKey,
  setNotificationRead,
} from "@/lib/notifications";

export const Route = createFileRoute("/_authenticated/powiadomienia")({
  head: () => ({
    meta: [
      { title: "Powiadomienia — Motor Trip" },
      {
        name: "description",
        content:
          "Historia powiadomień o zmianach w wyprawach motocyklowych: przeliczone trasy, nowe szczegóły zbiórki i komunikaty prowadzących.",
      },
      { property: "og:title", content: "Powiadomienia — Motor Trip" },
      {
        property: "og:description",
        content: "Historia powiadomień o zmianach w wyprawach motocyklowych.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: "Powiadomienia — Motor Trip" },
      {
        name: "twitter:description",
        content: "Historia powiadomień o zmianach w wyprawach motocyklowych.",
      },
    ],
  }),
  component: NotificationsPage,
});

type Filter = "all" | "unread" | "groups" | "rides";

const filterLabels: Record<Filter, string> = {
  all: "Wszystkie",
  unread: "Nieprzeczytane",
  groups: "Zaproszenia i akceptacje",
  rides: "Wyprawy",
};

function NotificationsPage() {
  const { session } = useSession();
  const userId = session?.user.id;
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<Filter>("all");

  const { data: items = [], isLoading } = useQuery({
    queryKey: notificationsHistoryQueryKey(userId ?? ""),
    enabled: !!userId,
    queryFn: () => fetchNotificationHistory(userId!),
  });

  const { data: invites = [] } = useQuery({
    queryKey: groupInvitesQueryKey,
    enabled: !!userId,
    queryFn: () => fetchMyInvites(userId!),
  });

  const { data: sent = [] } = useQuery({
    queryKey: sentInvitesQueryKey,
    enabled: !!userId,
    queryFn: () => fetchSentInvites(userId!),
  });

  function refresh() {
    if (!userId) return;
    queryClient.invalidateQueries({ queryKey: notificationsHistoryQueryKey(userId) });
    queryClient.invalidateQueries({ queryKey: notificationsQueryKey(userId) });
  }

  function refreshInvites() {
    queryClient.invalidateQueries({ queryKey: groupInvitesQueryKey });
    queryClient.invalidateQueries({ queryKey: sentInvitesQueryKey });
    queryClient.invalidateQueries({ queryKey: groupsQueryKey });
    refresh();
  }

  const accept = useMutation({
    mutationFn: (id: string) => acceptInvite(id),
    onSuccess: () => {
      refreshInvites();
      toast.success("Zaproszenie zaakceptowane. Jedziemy razem!");
    },
    onError: () => toast.error("Nie udało się zaakceptować zaproszenia."),
  });

  const decline = useMutation({
    mutationFn: (id: string) => declineInvite(id),
    onSuccess: () => {
      refreshInvites();
      toast.success("Zaproszenie odrzucone.");
    },
    onError: () => toast.error("Nie udało się odrzucić zaproszenia."),
  });

  const cancel = useMutation({
    mutationFn: (id: string) => cancelInvite(id),
    onSuccess: () => {
      refreshInvites();
      toast.success("Zaproszenie anulowane.");
    },
    onError: () => toast.error("Nie udało się anulować zaproszenia."),
  });

  useEffect(() => {
    if (!userId) return;
    const channel = supabase
      .channel(`notifications-page-${userId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "notifications", filter: `user_id=eq.${userId}` },
        () => refresh(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  const toggleRead = useMutation({
    mutationFn: ({ id, read }: { id: string; read: boolean }) => setNotificationRead(id, read),
    onSuccess: refresh,
    onError: () => toast.error("Nie udało się zmienić statusu powiadomienia."),
  });

  const remove = useMutation({
    mutationFn: (id: string) => deleteNotification(id),
    onSuccess: () => {
      refresh();
      toast.success("Powiadomienie usunięte.");
    },
    onError: () => toast.error("Nie udało się usunąć powiadomienia."),
  });

  const markAll = useMutation({
    mutationFn: () => markNotificationsRead(userId!),
    onSuccess: () => {
      refresh();
      toast.success("Wszystkie oznaczone jako przeczytane.");
    },
    onError: () => toast.error("Nie udało się oznaczyć powiadomień."),
  });

  const unread = items.filter((n) => !n.readAt).length;
  const counts = useMemo(
    () => ({
      all: items.length,
      unread,
      groups: items.filter((n) => n.groupId).length,
      rides: items.filter((n) => n.rideId).length,
    }),
    [items, unread],
  );
  const visible = items.filter((n) => {
    if (filter === "unread") return !n.readAt;
    if (filter === "groups") return !!n.groupId;
    if (filter === "rides") return !!n.rideId;
    return true;
  });

  return (
    <main className="mx-auto max-w-3xl px-4 py-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 font-display text-3xl tracking-wide text-foreground">
            <BellRing className="h-6 w-6 text-primary" />
            Powiadomienia
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Centrum powiadomień: zaproszenia, akceptacje i zmiany w wyprawach.{" "}
            {unread > 0 ? `${unread} nieprzeczytane.` : "Wszystko przeczytane."}
          </p>
        </div>
        <button
          type="button"
          disabled={unread === 0 || markAll.isPending}
          onClick={() => markAll.mutate()}
          className="rounded-md border border-border px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-foreground transition-colors hover:border-primary/60 disabled:opacity-40"
        >
          Oznacz wszystkie jako przeczytane
        </button>
      </div>

      {invites.length > 0 && (
        <section className="mt-6 rounded-lg border border-primary/50 bg-card p-4">
          <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-primary">
            <UserPlus className="h-4 w-4" /> Zaproszenia do akceptacji ({invites.length})
          </h2>
          <ul className="mt-3 space-y-2">
            {invites.map((inv) => (
              <li
                key={inv.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border bg-background/40 px-3 py-2.5"
              >
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-foreground">{inv.groupName}</p>
                  <p className="text-xs text-muted-foreground">
                    Od {inv.inviterNick} • rola: {groupRoleLabel[inv.role]} •{" "}
                    {formatNotificationTime(inv.createdAt)}
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={accept.isPending}
                    onClick={() => accept.mutate(inv.id)}
                    className="rounded-md bg-primary px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-primary-foreground disabled:opacity-50"
                  >
                    Akceptuj
                  </button>
                  <button
                    type="button"
                    disabled={decline.isPending}
                    onClick={() => decline.mutate(inv.id)}
                    className="rounded-md border border-border px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground transition-colors hover:border-destructive/60 hover:text-destructive disabled:opacity-50"
                  >
                    Odrzuć
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {sent.length > 0 && (
        <section className="mt-4 rounded-lg border border-border bg-card p-4">
          <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            <Users className="h-4 w-4" /> Wysłane przez Ciebie ({sent.length})
          </h2>
          <ul className="mt-3 space-y-2">
            {sent.map((inv) => (
              <li
                key={inv.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border bg-background/40 px-3 py-2.5"
              >
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-foreground">{inv.inviteeNick}</p>
                  <p className="text-xs text-muted-foreground">
                    {inv.groupName} • rola: {groupRoleLabel[inv.role]} •{" "}
                    {formatNotificationTime(inv.createdAt)} • oczekuje
                  </p>
                </div>
                <button
                  type="button"
                  disabled={cancel.isPending}
                  onClick={() => cancel.mutate(inv.id)}
                  className="inline-flex items-center gap-1 rounded-md border border-border px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground transition-colors hover:border-destructive/60 hover:text-destructive disabled:opacity-50"
                >
                  <X className="h-3.5 w-3.5" /> Anuluj
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="mt-5 flex flex-wrap gap-2">
        {(["all", "unread", "groups", "rides"] as Filter[]).map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFilter(f)}
            className={`rounded-full px-3 py-1.5 text-xs font-semibold uppercase tracking-wider transition-colors ${
              filter === f
                ? "bg-primary text-primary-foreground"
                : "border border-border text-muted-foreground hover:border-primary/60"
            }`}
          >
            {filterLabels[f]} ({counts[f]})
          </button>
        ))}
      </div>

      {isLoading ? (
        <p className="mt-8 text-sm text-muted-foreground">Ładowanie…</p>
      ) : visible.length === 0 ? (
        <p className="mt-8 rounded-lg border border-border bg-card px-4 py-6 text-sm text-muted-foreground">
          {filter === "unread"
            ? "Brak nieprzeczytanych powiadomień."
            : filter === "groups"
              ? "Brak powiadomień o zaproszeniach i akceptacjach."
              : filter === "rides"
                ? "Brak powiadomień o wyprawach."
                : "Nie masz jeszcze żadnych powiadomień. Dołącz do wyprawy, żeby dostawać informacje o zmianach trasy."}
        </p>
      ) : (
        <ul className="mt-5 space-y-2">
          {visible.map((n) => (
            <li
              key={n.id}
              className={`rounded-lg border bg-card p-4 ${
                n.readAt ? "border-border" : "border-primary/50"
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="flex items-center gap-2 text-sm font-semibold text-foreground">
                    {!n.readAt && <span className="h-2 w-2 shrink-0 rounded-full bg-primary" />}
                    {n.title}
                  </p>
                  {n.body && (
                    <p className="mt-1 whitespace-pre-line text-xs leading-relaxed text-muted-foreground">
                      {n.body}
                    </p>
                  )}
                  <p className="mt-2 text-[10px] uppercase tracking-wider text-muted-foreground">
                    {formatNotificationTime(n.createdAt)}
                  </p>
                  {n.rideId && (
                    <Link
                      to="/wyprawa/$id"
                      params={{ id: n.rideId }}
                      hash="czat"
                      className="mt-2 inline-flex items-center gap-1 rounded-md border border-primary px-2.5 py-1.5 text-xs font-semibold uppercase tracking-wider text-primary transition-colors hover:bg-primary hover:text-primary-foreground"
                    >
                      Otwórz wyprawę <ArrowUpRight className="h-3.5 w-3.5" />
                    </Link>
                  )}
                  {!n.rideId && n.groupId && (
                    <Link
                      to="/zaproszenia"
                      className="mt-2 inline-flex items-center gap-1 rounded-md border border-primary px-2.5 py-1.5 text-xs font-semibold uppercase tracking-wider text-primary transition-colors hover:bg-primary hover:text-primary-foreground"
                    >
                      Zobacz zaproszenia <ArrowUpRight className="h-3.5 w-3.5" />
                    </Link>
                  )}
                </div>
                <div className="flex shrink-0 gap-1">
                  <button
                    type="button"
                    aria-label={n.readAt ? "Oznacz jako nieprzeczytane" : "Oznacz jako przeczytane"}
                    onClick={() => toggleRead.mutate({ id: n.id, read: !n.readAt })}
                    className="flex h-8 w-8 items-center justify-center rounded-md border border-border text-muted-foreground transition-colors hover:border-primary/60 hover:text-primary"
                  >
                    {n.readAt ? <Undo2 className="h-4 w-4" /> : <Check className="h-4 w-4" />}
                  </button>
                  <button
                    type="button"
                    aria-label="Usuń powiadomienie"
                    onClick={() => remove.mutate(n.id)}
                    className="flex h-8 w-8 items-center justify-center rounded-md border border-border text-muted-foreground transition-colors hover:border-destructive/60 hover:text-destructive"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
