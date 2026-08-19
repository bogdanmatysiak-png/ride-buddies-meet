import { createFileRoute } from "@tanstack/react-router";

/** Bezpieczne porównanie stringów (stały czas, bez zależności od Node crypto). */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** Tylko dla harmonogramu (pg_cron): wysyła alerty o wyprawach w promieniu użytkownika. */
async function handlePost({ request }: { request: Request }) {
  const secret = process.env["CRON_SECRET"];
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (!secret || !token || !safeEqual(token, secret)) {
    return new Response("Unauthorized", { status: 401 });
  }

  const { runRideAlerts } = await import("@/lib/ride-alerts.server");
  try {
    const result = await runRideAlerts();
    return Response.json({ ok: true, ...result });
  } catch (error) {
    console.error("ride-alerts failed", error);
    return Response.json({ ok: false }, { status: 500 });
  }
}

export const Route = createFileRoute("/api/public/ride-alerts")({
  server: {
    handlers: {
      GET: async () => new Response("Method Not Allowed", { status: 405, headers: { Allow: "POST" } }),
      POST: handlePost,
    },
  },
});