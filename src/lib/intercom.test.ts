import { describe, expect, it } from "vitest";
import {
  applyIntercomToggle,
  intercomDefaultsFromProfile,
  intercomPayload,
} from "./intercom";

describe("intercom defaults from profile", () => {
  it("profil TAK + Cardo Packtalk Edge + MESH TAK → te trzy wartości w formularzu", () => {
    expect(
      intercomDefaultsFromProfile({
        intercom: true,
        intercom_type: "Cardo Packtalk Edge",
        mesh_supported: true,
      }),
    ).toEqual({ intercom: true, intercomType: "Cardo Packtalk Edge", meshSupported: true });
  });

  it("profil TAK + MESH NIE → interkom TAK, MESH NIE", () => {
    expect(
      intercomDefaultsFromProfile({
        intercom: true,
        intercom_type: "Sena 50S",
        mesh_supported: false,
      }),
    ).toEqual({ intercom: true, intercomType: "Sena 50S", meshSupported: false });
  });

  it("profil NIE → NIE, pusty opis i MESH NIE (pole ukryte w UI)", () => {
    expect(
      intercomDefaultsFromProfile({
        intercom: false,
        intercom_type: "Sena 50S",
        mesh_supported: true,
      }),
    ).toEqual({ intercom: false, intercomType: "", meshSupported: false });
  });

  it("starszy profil bez danych → bezpieczny domyślny stan", () => {
    expect(intercomDefaultsFromProfile(null)).toEqual({
      intercom: false,
      intercomType: "",
      meshSupported: false,
    });
    expect(intercomDefaultsFromProfile({})).toEqual({
      intercom: false,
      intercomType: "",
      meshSupported: false,
    });
  });
});

describe("ręczne zmiany", () => {
  it("TAK → NIE czyści opis i MESH", () => {
    const afterOff = applyIntercomToggle(
      { intercom: true, intercomType: "Cardo", meshSupported: true },
      false,
    );
    expect(afterOff).toEqual({ intercom: false, intercomType: "", meshSupported: false });
    const afterOn = applyIntercomToggle(afterOff, true);
    expect(afterOn).toEqual({ intercom: true, intercomType: "", meshSupported: false });
  });

  it("ręczna zmiana MESH nie zostaje nadpisana po refetchu profilu (init tylko raz)", () => {
    const profile = { intercom: true, intercom_type: "Cardo Packtalk Edge", mesh_supported: true };
    let didInitialize = false;
    let state = { intercom: false, intercomType: "", meshSupported: false };
    const init = () => {
      if (didInitialize) return;
      didInitialize = true;
      state = intercomDefaultsFromProfile(profile);
    };
    init();
    expect(state.meshSupported).toBe(true);
    // organizator ręcznie wyłącza MESH i zmienia model
    state = { ...state, intercomType: "Sena 50S", meshSupported: false };
    // refetch profilu → ponowna próba inicjalizacji
    init();
    expect(state).toEqual({ intercom: true, intercomType: "Sena 50S", meshSupported: false });
  });
});

describe("zapis", () => {
  it("zapis z NIE nie wysyła starego opisu ani starego MESH", () => {
    expect(
      intercomPayload({ intercom: false, intercomType: "Cardo Packtalk Edge", meshSupported: true }),
    ).toEqual({ intercom: false, intercomType: "", meshSupported: false });
  });

  it("zapis z TAK wysyła aktualne wartości z formularza", () => {
    expect(intercomPayload({ intercom: true, intercomType: " Sena 50S ", meshSupported: true })).toEqual({
      intercom: true,
      intercomType: "Sena 50S",
      meshSupported: true,
    });
  });
});

describe("znacznik MESH na stronie wyprawy", () => {
  const showMeshBadge = (ride: { intercom: boolean; meshSupported: boolean }) =>
    ride.intercom && ride.meshSupported;

  it("widoczny tylko przy aktywnym interkomie i MESH", () => {
    expect(showMeshBadge({ intercom: true, meshSupported: true })).toBe(true);
    expect(showMeshBadge({ intercom: true, meshSupported: false })).toBe(false);
    expect(showMeshBadge({ intercom: false, meshSupported: true })).toBe(false);
  });
});
