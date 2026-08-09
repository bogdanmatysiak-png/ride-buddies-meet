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

export type SpeedEnforcement = { cameras: number; sections: number };

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
    let cameras = 0;
    for (const el of elements) {
      if (el.type === "node" && el.tags?.["highway"] === "speed_camera") {
        // Kamery należące do odcinkowego pomiaru policzymy jako odcinek, nie pojedynczy fotoradar.
        if (el.tags?.["enforcement"] === "average_speed") continue;
        cameras += 1;
        continue;
      }
      sectionIds.add(`${el.type}:${el.id}`);
    }
    return { cameras, sections: sectionIds.size };
  } catch (error) {
    console.error("Overpass request error", error);
    return null;
  }
}
