import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { MessageCircle, Send, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { formatMessageTime } from "@/lib/chat";
import {
  deleteGroupMessage,
  fetchGroupMessages,
  groupMessagesQueryKey,
  sendGroupMessage,
} from "@/lib/group-chat";

export function GroupChat({
  groupId,
  currentUserId,
  canWrite,
  isOwner,
}: {
  groupId: string;
  currentUserId?: string | null | undefined;
  canWrite: boolean;
  isOwner?: boolean;
}) {
  const queryClient = useQueryClient();
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  const { data: messages = [], isLoading } = useQuery({
    queryKey: groupMessagesQueryKey(groupId),
    queryFn: () => fetchGroupMessages(groupId),
    enabled: canWrite,
  });

  useEffect(() => {
    if (!canWrite) return;
    const channel = supabase
      .channel(`group-messages-${groupId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "group_messages",
          filter: `group_id=eq.${groupId}`,
        },
        () => {
          queryClient.invalidateQueries({ queryKey: groupMessagesQueryKey(groupId) });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [groupId, queryClient, canWrite]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "nearest" });
  }, [messages.length]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!currentUserId || !text.trim()) return;
    setSending(true);
    try {
      await sendGroupMessage(groupId, currentUserId, text);
      setText("");
      await queryClient.invalidateQueries({ queryKey: groupMessagesQueryKey(groupId) });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Nie udało się wysłać wiadomości");
    } finally {
      setSending(false);
    }
  }

  return (
    <section id="czat" className="mt-4 rounded-lg border border-border bg-card p-5">
      <h2 className="flex items-center gap-2 text-2xl text-foreground">
        <MessageCircle className="h-5 w-5 text-primary" />
        Czat grupy
      </h2>
      <p className="mt-1 text-xs uppercase tracking-wider text-muted-foreground">
        Gadajcie o planach, trasach i terminach
      </p>

      {!canWrite ? (
        <p className="mt-4 text-sm text-muted-foreground">
          Czat jest dostępny po dołączeniu do grupy.
        </p>
      ) : (
        <>
          <div className="mt-4 max-h-96 space-y-3 overflow-y-auto pr-1">
            {isLoading ? (
              <p className="text-sm text-muted-foreground">Ładujemy wiadomości…</p>
            ) : messages.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Cisza w eterze. Napisz pierwszy do ekipy.
              </p>
            ) : (
              messages.map((m) => {
                const mine = m.userId === currentUserId;
                const canDelete = mine || !!isOwner;
                return (
                  <div
                    key={m.id}
                    className={`group rounded-lg border border-border px-3 py-2 ${
                      mine ? "bg-secondary" : "bg-transparent"
                    }`}
                  >
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="text-sm font-semibold text-primary">
                        {mine ? "Ty" : m.nick}
                      </span>
                      <span className="flex items-center gap-2 text-[11px] uppercase tracking-wider text-muted-foreground">
                        {formatMessageTime(m.createdAt)}
                        {canDelete && (
                          <button
                            type="button"
                            aria-label="Usuń wiadomość"
                            onClick={async () => {
                              try {
                                await deleteGroupMessage(m.id);
                                await queryClient.invalidateQueries({
                                  queryKey: groupMessagesQueryKey(groupId),
                                });
                              } catch {
                                toast.error("Nie udało się usunąć wiadomości");
                              }
                            }}
                            className="opacity-60 transition-opacity hover:text-primary group-hover:opacity-100"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </span>
                    </div>
                    <p className="mt-1 whitespace-pre-wrap break-words text-sm text-foreground">
                      {m.body}
                    </p>
                  </div>
                );
              })
            )}
            <div ref={bottomRef} />
          </div>

          <form onSubmit={submit} className="mt-4 flex items-end gap-2">
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void submit(e);
                }
              }}
              rows={2}
              maxLength={1000}
              placeholder="Napisz do grupy…"
              className="input-moto min-h-[44px] flex-1 resize-none"
            />
            <button
              type="submit"
              disabled={sending || !text.trim()}
              className="inline-flex h-11 shrink-0 items-center gap-1.5 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-ember transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              <Send className="h-4 w-4" />
              Wyślij
            </button>
          </form>
        </>
      )}
    </section>
  );
}
