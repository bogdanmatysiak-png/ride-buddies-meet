import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

/** Systemowe powiadomienia przeglądarki dla nowych wpisów w centrum powiadomień. */
export function useBrowserNotifications(userId: string | null) {
  const [permission, setPermission] = useState<NotificationPermission | "unsupported">(
    "unsupported",
  );

  useEffect(() => {
    if (typeof window === "undefined" || !("Notification" in window)) return;
    setPermission(Notification.permission);
  }, []);

  const request = useCallback(async () => {
    if (typeof window === "undefined" || !("Notification" in window)) return;
    const result = await Notification.requestPermission();
    setPermission(result);
  }, []);

  useEffect(() => {
    if (!userId || permission !== "granted") return;
    const channel = supabase
      .channel(`push-${userId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "notifications",
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          const row = payload.new as { title?: string; body?: string };
          try {
            new Notification(row.title ?? "Motor Trip", { body: row.body ?? "" });
          } catch {
            // przeglądarka może blokować powiadomienia w tle
          }
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, permission]);

  return { permission, request };
}