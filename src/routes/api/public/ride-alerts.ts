import { createFileRoute } from "@tanstack/react-router";

/** Cyklicznie (pg_cron) wysyła alerty o wyprawach w promieniu użytkownika. */
async function handle() {
  const { runRideAlerts } = await import("@/lib/ride-alerts.server");
  try {
    const result = await runRideAlerts();
    return Response.json({ ok: true, ...result });
  } catch (error) {
    console.error("ride-alerts failed", error);
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "unknown" },
      { status: 500 },
    );
  }
}

export const Route = createFileRoute("/api/public/ride-alerts")({
  server: { handlers: { GET: handle, POST: handle } },
});