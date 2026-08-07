import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Bell } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  fetchNotifications,
  formatNotificationTime,
  markNotificationsRead,
  notificationsQueryKey,
  notificationsHistoryQueryKey,
} from "@/lib/notifications";

export function NotificationBell({ userId }: { userId: string }) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const { data: items = [] } = useQuery({
    queryKey: notificationsQueryKey(userId),
    queryFn: () => fetchNotifications(userId),
  });
  const unread = items.filter((n) => !n.readAt).length;

  useEffect(() => {
    const channel = supabase
      .channel(`notifications-${userId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "notifications",
          filter: `user_id=eq.${userId}`,
        },
        () => {
          queryClient.invalidateQueries({ queryKey: notificationsQueryKey(userId) });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, queryClient]);

  async function toggle() {
    const next = !open;
    setOpen(next);
    if (next && unread > 0) {
      try {
        await markNotificationsRead(userId);
        await queryClient.invalidateQueries({ queryKey: notificationsQueryKey(userId) });
        await queryClient.invalidateQueries({ queryKey: notificationsHistoryQueryKey(userId) });
      } catch {
        /* cicho — powiadomienia i tak są widoczne */
      }
    }
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={toggle}
        aria-label={`Powiadomienia${unread > 0 ? ` (${unread} nowe)` : ""}`}
        className="relative flex h-8 w-8 items-center justify-center rounded-md border border-border text-muted-foreground transition-colors hover:border-primary/60 hover:text-primary"
      >
        <Bell className="h-4 w-4" />
        {unread > 0 && (
          <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 z-50 mt-2 w-80 max-w-[85vw] overflow-hidden rounded-lg border border-border bg-card shadow-xl">
          <p className="border-b border-border px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Powiadomienia
          </p>
          {items.length === 0 ? (
            <p className="px-3 py-4 text-sm text-muted-foreground">Brak powiadomień.</p>
          ) : (
            <ul className="max-h-80 divide-y divide-border overflow-y-auto">
              {items.map((n) => (
                <li key={n.id} className="px-3 py-2.5">
                  {n.rideId ? (
                    <Link
                      to="/wyprawa/$id"
                      params={{ id: n.rideId }}
                      onClick={() => setOpen(false)}
                      className="block"
                    >
                      <NotificationBody title={n.title} body={n.body} createdAt={n.createdAt} />
                    </Link>
                  ) : (
                    <NotificationBody title={n.title} body={n.body} createdAt={n.createdAt} />
                  )}
                </li>
              ))}
            </ul>
          )}
          <Link
            to="/powiadomienia"
            onClick={() => setOpen(false)}
            className="block border-t border-border px-3 py-2 text-center text-[11px] font-semibold uppercase tracking-wider text-primary hover:underline"
          >
            Zobacz wszystkie powiadomienia
          </Link>
        </div>
      )}
    </div>
  );
}

function NotificationBody({
  title,
  body,
  createdAt,
}: {
  title: string;
  body: string;
  createdAt: string;
}) {
  return (
    <>
      <p className="text-sm font-semibold text-foreground">{title}</p>
      {body && (
        <p className="mt-0.5 whitespace-pre-line text-xs leading-relaxed text-muted-foreground">
          {body}
        </p>
      )}
      <p className="mt-1 text-[10px] uppercase tracking-wider text-muted-foreground">
        {formatNotificationTime(createdAt)}
      </p>
    </>
  );
}
