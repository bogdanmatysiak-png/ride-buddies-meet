/** Etykiety źródeł danych o kontrolach prędkości. */
export const cameraSourceLabel: Record<string, string> = {
  osm: "OpenStreetMap",
  gitd: "GITD/CANARD (dane oficjalne)",
  users: "Zgłoszenia motocyklistów",
};

export function cameraSourcesText(sources: string[] | null | undefined): string {
  const list = (sources ?? []).map((s) => cameraSourceLabel[s] ?? s);
  return list.length ? list.join(" · ") : "OpenStreetMap";
}