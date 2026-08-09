import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { ClientOnly } from "@tanstack/react-router";
import { Camera } from "lucide-react";
import {
  cameraReportsQueryKey,
  createCameraReport,
  deleteCameraReport,
  fetchMyCameraReports,
  kindLabel,
  statusLabel,
  type CameraReportKind,
} from "@/lib/camera-reports";
import { CameraMapPicker } from "@/components/CameraMapPicker";
import { PlaceSearchInput } from "@/components/PlaceSearchInput";
import { geocodeAddresses } from "@/lib/geo.functions";
import { useSession } from "@/hooks/useAuth";

export const Route = createFileRoute("/_authenticated/zglos-fotoradar")({
  head: () => ({
    meta: [
      { title: "Zgłoś fotoradar — Motor Trip" },
      {
        name: "description",
        content:
          "Wskaż na mapie fotoradar lub odcinkowy pomiar prędkości i dodaj krótki opis dla innych motocyklistów.",
      },
      { property: "og:title", content: "Zgłoś fotoradar — Motor Trip" },
      {
        property: "og:description",
        content: "Uzupełnij bazę kontroli prędkości na trasach motocyklowych.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ReportCamera,
});

function ReportCamera() {
  const { user } = useSession();
  const queryClient = useQueryClient();
  const geocode = useServerFn(geocodeAddresses);
  const [point, setPoint] = useState<{ lat: number; lng: number } | null>(null);
  const [address, setAddress] = useState("");
  const [kind, setKind] = useState<CameraReportKind>("camera");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);

  const { data: mine = [] } = useQuery({
    queryKey: [...cameraReportsQueryKey, user?.id],
    queryFn: () => fetchMyCameraReports(user!.id),
    enabled: !!user,
  });

  async function findOnMap(query: string) {
    const value = query.trim();
    if (value.length < 3) return;
    try {
      const hits = await geocode({ data: { addresses: [value] } });
      const hit = hits[0];
      if (!hit) {
        toast.error("Nie znaleźliśmy tego miejsca");
        return;
      }
      setPoint({ lat: hit.lat, lng: hit.lng });
    } catch {
      toast.error("Nie udało się znaleźć miejsca");
    }
  }

  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="flex items-center gap-2 text-4xl text-foreground">
        <Camera className="h-7 w-7 text-primary" /> Zgłoś fotoradar
      </h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Wskaż miejsce na mapie (kliknij) i dopisz krótki opis. Po weryfikacji zgłoszenie uzupełni
        dane OpenStreetMap i GITD/CANARD przy liczeniu kontroli prędkości na trasach.
      </p>

      <form
        className="mt-6 space-y-4"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!user) return;
          if (!point) {
            toast.error("Kliknij na mapie miejsce kontroli prędkości");
            return;
          }
          if (description.trim().length < 5) {
            toast.error("Dodaj krótki opis (min. 5 znaków)");
            return;
          }
          setBusy(true);
          try {
            await createCameraReport({ ...point, kind, address, description }, user.id);
            await queryClient.invalidateQueries({ queryKey: cameraReportsQueryKey });
            setDescription("");
            setPoint(null);
            setAddress("");
            toast.success("Dzięki! Zgłoszenie czeka na weryfikację.");
          } catch (error) {
            toast.error(error instanceof Error ? error.message : "Nie udało się zapisać");
          } finally {
            setBusy(false);
          }
        }}
      >
        <div className="rounded-lg border border-border bg-card p-4">
          <label
            htmlFor="camera-address"
            className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground"
          >
            Szukaj miejsca (opcjonalnie)
          </label>
          <PlaceSearchInput
            id="camera-address"
            value={address}
            onChange={setAddress}
            onPick={(v) => void findOnMap(v)}
            placeholder="np. DK7 Kraków — Myślenice"
            className="mt-1 w-full rounded-md border border-border bg-secondary px-3 py-2 text-sm text-foreground"
          />
          <ClientOnly fallback={<div className="mt-3 h-64 rounded-lg border border-border" />}>
            <CameraMapPicker value={point} onPick={setPoint} className="mt-3" />
          </ClientOnly>
          <p className="mt-2 text-xs text-muted-foreground">
            {point
              ? `Wybrane miejsce: ${point.lat.toFixed(5)}, ${point.lng.toFixed(5)}`
              : "Kliknij na mapie, żeby wskazać lokalizację."}
          </p>
        </div>

        <fieldset className="rounded-lg border border-border bg-card p-4">
          <legend className="px-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Rodzaj kontroli
          </legend>
          <div className="mt-2 flex flex-wrap gap-2">
            {(["camera", "section"] as CameraReportKind[]).map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => setKind(k)}
                className={`rounded-md border px-3 py-1.5 text-xs font-semibold transition-colors ${
                  kind === k
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-secondary text-muted-foreground"
                }`}
              >
                {kindLabel[k]}
              </button>
            ))}
          </div>
        </fieldset>

        <div>
          <label
            htmlFor="camera-description"
            className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground"
          >
            Krótki opis
          </label>
          <textarea
            id="camera-description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={500}
            rows={3}
            placeholder="Maszt przy wjeździe do miejscowości, ograniczenie 50 km/h"
            className="mt-1 w-full rounded-md border border-border bg-secondary px-3 py-2 text-sm text-foreground"
          />
        </div>

        <button
          type="submit"
          disabled={busy}
          className="w-full rounded-md bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground shadow-ember transition-opacity hover:opacity-90 disabled:opacity-60"
        >
          {busy ? "Zapisuję…" : "Wyślij zgłoszenie"}
        </button>
      </form>

      <section className="mt-8">
        <h2 className="text-2xl text-foreground">Twoje zgłoszenia</h2>
        {mine.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">Nie masz jeszcze żadnych zgłoszeń.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {mine.map((r) => (
              <li
                key={r.id}
                className="rounded-lg border border-border bg-card p-4 text-sm text-foreground"
              >
                <p className="font-semibold">{kindLabel[r.kind]}</p>
                <p className="mt-1 text-muted-foreground">{r.description}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {r.address ? `${r.address} · ` : ""}
                  {r.lat.toFixed(4)}, {r.lng.toFixed(4)} · {statusLabel[r.status]}
                </p>
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      await deleteCameraReport(r.id);
                      await queryClient.invalidateQueries({ queryKey: cameraReportsQueryKey });
                      toast.success("Zgłoszenie usunięte");
                    } catch {
                      toast.error("Nie udało się usunąć");
                    }
                  }}
                  className="mt-2 text-[11px] font-semibold uppercase tracking-wider text-destructive"
                >
                  Usuń
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}