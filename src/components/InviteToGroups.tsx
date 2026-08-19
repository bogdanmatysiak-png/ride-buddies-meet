import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { UserPlus } from "lucide-react";
import { toast } from "sonner";
import {
  fetchGroupsICanInviteTo,
  inviteUserToGroups,
  sentInvitesQueryKey,
} from "@/lib/groups";

/**
 * Przycisk „Zaproś do grupy” obok wiadomości na czacie.
 * Przy jednej grupie zaprasza od razu, przy wielu pokazuje wybór grup
 * albo opcję „zaproś do wszystkich moich grup”.
 */
export function InviteToGroups({
  inviterId,
  inviteeId,
  inviteeNick,
}: {
  inviterId?: string | null | undefined;
  inviteeId: string;
  inviteeNick: string;
}) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const boxRef = useRef<HTMLDivElement | null>(null);

  const { data: groups = [] } = useQuery({
    queryKey: ["groups-can-invite", inviterId],
    enabled: !!inviterId,
    queryFn: () => fetchGroupsICanInviteTo(inviterId!),
  });

  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  if (!inviterId || inviterId === inviteeId || groups.length === 0) return null;

  async function invite(groupIds: string[]) {
    setBusy(true);
    try {
      const { invited, skipped } = await inviteUserToGroups(groupIds, inviteeId, inviterId!);
      await queryClient.invalidateQueries({ queryKey: sentInvitesQueryKey });
      if (invited > 0) {
        toast.success(
          `Zaproszenie dla ${inviteeNick} wysłane do ${invited} ${invited === 1 ? "grupy" : "grup"}` +
            (skipped > 0 ? ` (${skipped} pominięto — już zaproszony)` : ""),
        );
      } else {
        toast.info(`${inviteeNick} jest już zaproszony do wybranych grup`);
      }
      setOpen(false);
      setSelected([]);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Nie udało się zaprosić");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div ref={boxRef} className="relative inline-block">
      <button
        type="button"
        aria-label={`Zaproś ${inviteeNick} do grupy`}
        disabled={busy}
        onClick={() => {
          if (groups.length === 1) {
            void invite([groups[0]!.id]);
            return;
          }
          setOpen((v) => !v);
        }}
        className="opacity-60 transition-opacity hover:text-primary group-hover:opacity-100 disabled:opacity-40"
      >
        <UserPlus className="h-3.5 w-3.5" />
      </button>

      {open && (
        <div className="absolute right-0 z-20 mt-1 w-60 rounded-md border border-border bg-card p-3 shadow-lg">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Zaproś {inviteeNick} do grupy
          </p>
          <ul className="mt-2 max-h-40 space-y-1 overflow-y-auto">
            {groups.map((g) => (
              <li key={g.id}>
                <label className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 text-sm normal-case tracking-normal text-foreground hover:bg-secondary">
                  <input
                    type="checkbox"
                    checked={selected.includes(g.id)}
                    onChange={(e) =>
                      setSelected((prev) =>
                        e.target.checked ? [...prev, g.id] : prev.filter((id) => id !== g.id),
                      )
                    }
                    className="h-4 w-4 accent-primary"
                  />
                  <span className="truncate">{g.name}</span>
                </label>
              </li>
            ))}
          </ul>
          <div className="mt-3 flex flex-col gap-2">
            <button
              type="button"
              disabled={busy || selected.length === 0}
              onClick={() => void invite(selected)}
              className="rounded-md bg-primary px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-primary-foreground disabled:opacity-50"
            >
              Zaproś do wybranych
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void invite(groups.map((g) => g.id))}
              className="rounded-md border border-border px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground hover:border-primary hover:text-primary disabled:opacity-50"
            >
              Zaproś do wszystkich moich grup
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
