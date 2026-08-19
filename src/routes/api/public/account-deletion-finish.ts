import { createFileRoute } from "@tanstack/react-router";

/** Bezpieczne porównanie stringów (stały czas). */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

/**
 * Tylko dla administratora / harmonogramu: dokańcza niedokończone procesy
 * usuwania konta. Działa wyłącznie na stanie audytu (log_id) — nie przyjmuje
 * user_id ani żadnych danych od klienta.
 */
async function handlePost({ request }: { request: Request }) {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  const secrets = [process.env["CRON_SECRET"], process.env["CRON_SECRET_V2"]].filter(
    (s): s is string => Boolean(s),
  );
  if (secrets.length === 0 || !token || !secrets.some((secret) => safeEqual(token, secret))) {
    return new Response("Unauthorized", { status: 401 });
  }

  const { resumeIncompleteAccountDeletions } = await import("@/lib/account-deletion.server");
  try {
    const result = await resumeIncompleteAccountDeletions();
    return Response.json({ ok: true, ...result });
  } catch {
    return Response.json({ ok: false }, { status: 500 });
  }
}

export const Route = createFileRoute("/api/public/account-deletion-finish")({
  server: {
    handlers: {
      GET: async () =>
        new Response("Method Not Allowed", { status: 405, headers: { Allow: "POST" } }),
      POST: handlePost,
    },
  },
});
