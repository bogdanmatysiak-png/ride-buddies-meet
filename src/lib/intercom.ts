export type IntercomProfileSource = {
  intercom?: boolean | null;
  intercom_type?: string | null;
} | null | undefined;

export type IntercomFormState = {
  intercom: boolean;
  intercomType: string;
};

/** Bezpieczne domyślne wartości interkomu w formularzu wyprawy na podstawie profilu. */
export function intercomDefaultsFromProfile(profile: IntercomProfileSource): IntercomFormState {
  const intercom = profile?.intercom === true;
  return {
    intercom,
    intercomType: intercom ? (profile?.intercom_type ?? "").trim() : "",
  };
}

/** Ręczne przełączenie TAK/NIE — przy NIE czyścimy opis. */
export function applyIntercomToggle(state: IntercomFormState, next: boolean): IntercomFormState {
  return next ? { intercom: true, intercomType: state.intercomType } : { intercom: false, intercomType: "" };
}

/** Wartości wysyłane przy zapisie wyprawy. */
export function intercomPayload(state: IntercomFormState): IntercomFormState {
  return {
    intercom: state.intercom,
    intercomType: state.intercom ? state.intercomType.trim() : "",
  };
}
