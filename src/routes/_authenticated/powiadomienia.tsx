import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BellRing, Check, Trash2, Undo2 } from "lucide-react";
import { toast } from "sonner";
import { useSession } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
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

type Filter = "all" | "unread";

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

  function refresh() {
    if (!userId) return;
    queryClient.invalidateQueries({ queryKey: notificationsHistoryQueryKey(userId) });
    queryClient.invalidateQueries({ queryKey: notificationsQueryKey(userId) });
  }

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
  const visible = filter === "unread" ? items.filter((n) => !n.readAt) : items;

  return (
    <main className="mx-auto max-w-3xl px-4 py-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 font-display text-3xl tracking-wide text-foreground">
            <BellRing className="h-6 w-6 text-primary" />
            Powiadomienia
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Historia komunikatów o Twoich wyprawach.{" "}
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

      <div className="mt-5 flex gap-2">
        {(["all", "unread"] as Filter[]).map((f) => (
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
            {f === "all" ? `Wszystkie (${items.length})` : `Nieprzeczytane (${unread})`}
          </button>
        ))}
      </div>

      {isLoading ? (
        <p className="mt-8 text-sm text-muted-foreground">Ładowanie…</p>
      ) : visible.length === 0 ? (
        <p className="mt-8 rounded-lg border border-border bg-card px-4 py-6 text-sm text-muted-foreground">
          {filter === "unread"
            ? "Brak nieprzeczytanych powiadomień."
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
                      className="mt-2 inline-block text-xs font-semibold uppercase tracking-wider text-primary hover:underline"
                    >
                      Otwórz wyprawę
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
