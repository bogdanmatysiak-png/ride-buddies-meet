import { supabase } from "@/integrations/supabase/client";

export type CameraReportKind = "camera" | "section";

export type CameraReport = {
  id: string;
  userId: string;
  lat: number;
  lng: number;
  kind: CameraReportKind;
  address: string;
  description: string;
  status: "pending" | "approved" | "rejected";
  createdAt: string;
};

export const cameraReportsQueryKey = ["camera-reports"] as const;

export const kindLabel: Record<CameraReportKind, string> = {
  camera: "Fotoradar",
  section: "Odcinkowy pomiar prędkości",
};

export const statusLabel: Record<CameraReport["status"], string> = {
  pending: "Oczekuje na weryfikację",
  approved: "Zatwierdzone",
  rejected: "Odrzucone",
};

function mapRow(r: {
  id: string;
  user_id: string;
  lat: number;
  lng: number;
  kind: string;
  address: string;
  description: string;
  status: string;
  created_at: string;
}): CameraReport {
  return {
    id: r.id,
    userId: r.user_id,
    lat: r.lat,
    lng: r.lng,
    kind: r.kind === "section" ? "section" : "camera",
    address: r.address,
    description: r.description,
    status: r.status as CameraReport["status"],
    createdAt: r.created_at,
  };
}

/** Zgłoszenia bieżącego użytkownika (RLS zwraca własne + zatwierdzone). */
export async function fetchMyCameraReports(userId: string): Promise<CameraReport[]> {
  const { data, error } = await supabase
    .from("camera_reports")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map(mapRow);
}

export type NewCameraReport = {
  lat: number;
  lng: number;
  kind: CameraReportKind;
  address: string;
  description: string;
};

export async function createCameraReport(input: NewCameraReport, userId: string) {
  const description = input.description.trim().slice(0, 500);
  const { error } = await supabase.from("camera_reports").insert({
    user_id: userId,
    lat: input.lat,
    lng: input.lng,
    kind: input.kind,
    address: input.address.trim().slice(0, 200),
    description,
    status: "pending",
  });
  if (error) throw error;
}

export async function deleteCameraReport(id: string) {
  const { error } = await supabase.from("camera_reports").delete().eq("id", id);
  if (error) throw error;
}