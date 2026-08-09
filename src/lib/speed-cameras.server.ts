/** Liczenie fotoradarów i odcinkowych pomiarów prędkości wzdłuż trasy (dane OpenStreetMap). */

const OVERPASS_URL = "https://overpass-api.de/api/interpreter";

/** Dekoduje polilinię Google (precision 1e-5) do listy punktów [lat, lng]. */
export function decodePolyline(encoded: string): Array<[number, number]> {
  const points: Array<[number, number]> = [];
  let index = 0;
  let lat = 0;
  let lng = 0;
  while (index < encoded.length) {
    let result = 0;
    let shift = 0;
    let byte: number;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    lat += result & 1 ? ~(result >> 1) : result >> 1;

    result = 0;
    shift = 0;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    lng += result & 1 ? ~(result >> 1) : result >> 1;

    points.push([lat / 1e5, lng / 1e5]);
  }
  return points;
}

/** Zmniejsza liczbę punktów, żeby zapytanie do Overpass nie było zbyt duże. */
function sample(points: Array<[number, number]>, max = 250): Array<[number, number]> {
  if (points.length <= max) return points;
  const step = Math.ceil(points.length / max);
  const out = points.filter((_, i) => i % step === 0);
  const last = points[points.length - 1]!;
  if (out[out.length - 1] !== last) out.push(last);
  return out;
}

export type SpeedEnforcement = {
  cameras: number;
  sections: number;
  /** Źródła, z których pochodzą policzone kontrole prędkości. */
  sources: string[];
};

/** Rozpoznaje instalacje prowadzone oficjalnie przez GITD/CANARD. */
function isGitd(tags: Record<string, string> | undefined): boolean {
  const raw = `${tags?.["operator"] ?? ""} ${tags?.["operator:short"] ?? ""} ${tags?.["network"] ?? ""}`;
  return /gitd|canard|inspekcj\w* transportu drogowego/i.test(raw);
}

function distanceMeters(a: [number, number], b: [number, number]): number {
  const toRad = (v: number) => (v * Math.PI) / 180;
  const dLat = toRad(b[0] - a[0]);
  const dLng = toRad(b[1] - a[1]);
  const lat = toRad((a[0] + b[0]) / 2);
  const x = dLng * Math.cos(lat);
  return Math.sqrt(dLat * dLat + x * x) * 6371000;
}

type ReportRow = { kind: string; lat: number; lng: number };

/** Zatwierdzone zgłoszenia użytkowników leżące blisko trasy. */
async function countUserReports(
  points: Array<[number, number]>,
  radiusMeters: number,
): Promise<{ cameras: number; sections: number } | null> {
  const url = process.env["SUPABASE_URL"];
  const key = process.env["SUPABASE_PUBLISHABLE_KEY"];
  if (!url || !key) return null;
  try {
    const response = await fetch(
      `${url}/rest/v1/camera_reports?select=kind,lat,lng&status=eq.approved&limit=5000`,
      { headers: { apikey: key } },
    );
    if (!response.ok) return null;
    const rows = (await response.json()) as ReportRow[];
    let cameras = 0;
    let sections = 0;
    for (const row of rows) {
      const near = points.some(
        (p) => distanceMeters(p, [row.lat, row.lng]) <= radiusMeters,
      );
      if (!near) continue;
      if (row.kind === "section") sections += 1;
      else cameras += 1;
    }
    return { cameras, sections };
  } catch (error) {
    console.error("camera_reports fetch error", error);
    return null;
  }
}

export async function countSpeedEnforcement(
  encodedPolyline: string,
  radiusMeters = 150,
): Promise<SpeedEnforcement | null> {
  const points = sample(decodePolyline(encodedPolyline));
  if (points.length < 2) return null;
  const coords = points.map(([lat, lng]) => `${lat.toFixed(5)},${lng.toFixed(5)}`).join(",");
  const query = `[out:json][timeout:45];
node(around:${radiusMeters},${coords})["highway"="speed_camera"];out tags;
node(around:${radiusMeters},${coords})["enforcement"="average_speed"];out tags;
way(around:${radiusMeters},${coords})["enforcement"="average_speed"];out tags;
relation(around:${radiusMeters},${coords})["type"="enforcement"]["enforcement"="average_speed"];out tags;`;

  try {
    const response = await fetch(OVERPASS_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ data: query }).toString(),
    });
    if (!response.ok) {
      console.error(`Overpass failed [${response.status}]: ${await response.text()}`);
      return null;
    }
    const payload = (await response.json()) as {
      elements?: Array<{ type?: string; id?: number; tags?: Record<string, string> }>;
    };
    const elements = payload.elements ?? [];
    const sectionIds = new Set<string>();
    const cameraIds = new Set<string>();
    let gitdHits = 0;
    for (const el of elements) {
      if (isGitd(el.tags)) gitdHits += 1;
      if (el.type === "node" && el.tags?.["highway"] === "speed_camera") {
        // Kamery należące do odcinkowego pomiaru policzymy jako odcinek, nie pojedynczy fotoradar.
        if (el.tags?.["enforcement"] === "average_speed") continue;
        cameraIds.add(`node:${el.id}`);
        continue;
      }
      sectionIds.add(`${el.type}:${el.id}`);
    }
    const reports = await countUserReports(points, radiusMeters);
    const sources: string[] = ["osm"];
    if (gitdHits > 0) sources.push("gitd");
    if (reports && reports.cameras + reports.sections > 0) sources.push("users");
    return {
      cameras: cameraIds.size + (reports?.cameras ?? 0),
      sections: sectionIds.size + (reports?.sections ?? 0),
      sources,
    };
  } catch (error) {
    console.error("Overpass request error", error);
    const reports = await countUserReports(points, radiusMeters);
    if (!reports) return null;
    return { cameras: reports.cameras, sections: reports.sections, sources: ["users"] };
  }
}
