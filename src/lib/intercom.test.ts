import { describe, expect, it } from "vitest";
import {
  applyIntercomToggle,
  intercomDefaultsFromProfile,
  intercomPayload,
} from "./intercom";

describe("intercom defaults from profile", () => {
  it("profil TAK + Cardo Packtalk Edge → TAK i ten sam opis", () => {
    expect(
      intercomDefaultsFromProfile({ intercom: true, intercom_type: "Cardo Packtalk Edge" }),
    ).toEqual({ intercom: true, intercomType: "Cardo Packtalk Edge" });
  });

  it("profil NIE → NIE i pusty opis (pole ukryte w UI)", () => {
    expect(intercomDefaultsFromProfile({ intercom: false, intercom_type: "Sena 50S" })).toEqual({
      intercom: false,
      intercomType: "",
    });
  });

  it("starszy profil bez danych → bezpieczny domyślny stan", () => {
    expect(intercomDefaultsFromProfile(null)).toEqual({ intercom: false, intercomType: "" });
    expect(intercomDefaultsFromProfile({})).toEqual({ intercom: false, intercomType: "" });
  });
});

describe("ręczne zmiany", () => {
  it("TAK → NIE czyści opis, NIE → TAK pozwala wpisać własny", () => {
    const afterOff = applyIntercomToggle({ intercom: true, intercomType: "Cardo" }, false);
    expect(afterOff).toEqual({ intercom: false, intercomType: "" });
    const afterOn = applyIntercomToggle(afterOff, true);
    expect(afterOn).toEqual({ intercom: true, intercomType: "" });
  });

  it("ręczna zmiana nie zostaje nadpisana po refetchu profilu (init tylko raz)", () => {
    const profile = { intercom: true, intercom_type: "Cardo Packtalk Edge" };
    let didInitialize = false;
    let state = { intercom: false, intercomType: "" };
    const init = () => {
      if (didInitialize) return;
      didInitialize = true;
      state = intercomDefaultsFromProfile(profile);
    };
    init();
    // użytkownik zmienia ręcznie
    state = applyIntercomToggle(state, false);
    state = { intercom: true, intercomType: "Sena 50S" };
    // refetch profilu → ponowna próba inicjalizacji
    init();
    expect(state).toEqual({ intercom: true, intercomType: "Sena 50S" });
  });
});

describe("zapis", () => {
  it("zapis z NIE nie wysyła starego opisu", () => {
    expect(intercomPayload({ intercom: false, intercomType: "Cardo Packtalk Edge" })).toEqual({
      intercom: false,
      intercomType: "",
    });
  });

  it("zapis z TAK wysyła aktualny opis z formularza", () => {
    expect(intercomPayload({ intercom: true, intercomType: " Sena 50S " })).toEqual({
      intercom: true,
      intercomType: "Sena 50S",
    });
  });
});
