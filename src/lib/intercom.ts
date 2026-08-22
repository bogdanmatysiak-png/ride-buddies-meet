export type IntercomProfileSource = {
  intercom?: boolean | null;
  intercom_type?: string | null;
  mesh_supported?: boolean | null;
} | null | undefined;

export type IntercomFormState = {
  intercom: boolean;
  intercomType: string;
  meshSupported: boolean;
};

/** Bezpieczne domyślne wartości interkomu w formularzu wyprawy na podstawie profilu. */
export function intercomDefaultsFromProfile(profile: IntercomProfileSource): IntercomFormState {
  const intercom = profile?.intercom === true;
  return {
    intercom,
    intercomType: intercom ? (profile?.intercom_type ?? "").trim() : "",
    meshSupported: intercom ? profile?.mesh_supported === true : false,
  };
}

/** Ręczne przełączenie TAK/NIE — przy NIE czyścimy opis i MESH. */
export function applyIntercomToggle(state: IntercomFormState, next: boolean): IntercomFormState {
  return next
    ? { intercom: true, intercomType: state.intercomType, meshSupported: state.meshSupported }
    : { intercom: false, intercomType: "", meshSupported: false };
}

/** Wartości wysyłane przy zapisie wyprawy. */
export function intercomPayload(state: IntercomFormState): IntercomFormState {
  return {
    intercom: state.intercom,
    intercomType: state.intercom ? state.intercomType.trim() : "",
    meshSupported: state.intercom ? state.meshSupported === true : false,
  };
}
