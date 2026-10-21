import { describe, expect, it } from "vitest";
import { healthOutcome, healthRegister } from "./health-register";

describe("health register", () => {
  it("labels an ongoing treatment and keeps the follow-up", () => {
    expect(healthOutcome("ongoing")).toBe("Ongoing");
    const register = healthRegister({
      clinical: true,
      herd: [{ id: "krishna", presence: "on_farm", isolationReason: "Foot injury", isolatedOn: "2026-10-18" }],
      events: [
        {
          id: "fever",
          animalId: "narmada",
          eventOn: "2026-10-21",
          problem: "Fever",
          medicine: "Oxytetracycline",
          dose: "1 ml / 10 kg",
          followUpOn: "2026-10-22",
          outcome: "ongoing",
          voidedAt: null,
        },
        {
          id: "voided",
          animalId: "narmada",
          eventOn: "2026-10-01",
          problem: "Old",
          medicine: null,
          dose: null,
          followUpOn: null,
          outcome: "resolved",
          voidedAt: new Date(),
        },
      ],
      doses: [],
      dewormings: [],
      alerts: [
        { id: "fmd", animalId: "narmada", type: "vaccine_due", title: "Vaccination due", body: "FMD", dueOn: "2026-10-15", status: "open" },
      ],
    });
    expect(register.events.map((row) => row.id)).toEqual(["fever"]);
    expect(register.due.map((row) => `${row.kind}:${row.dueOn}`)).toEqual([
      "Vaccination due:2026-10-15",
      "Isolation · Foot injury:2026-10-18",
      "Medication · Oxytetracycline:2026-10-22",
    ]);
  });

  it("hides treatment detail from a role that cannot see clinical notes", () => {
    const register = healthRegister({
      clinical: false,
      herd: [{ id: "krishna", presence: "on_farm", isolationReason: "Foot injury", isolatedOn: "2026-10-18" }],
      events: [
        {
          id: "fever",
          animalId: "narmada",
          eventOn: "2026-10-21",
          problem: "Fever",
          medicine: "Oxytetracycline",
          dose: "1 ml / 10 kg",
          followUpOn: "2026-10-22",
          outcome: "ongoing",
          voidedAt: null,
        },
      ],
      doses: [],
      dewormings: [],
      alerts: [
        { id: "med", animalId: "narmada", type: "medication_due", title: "Medication due", body: "Oxytetracycline", dueOn: "2026-10-22", status: "open" },
        { id: "fmd", animalId: "narmada", type: "vaccine_due", title: "Vaccination due", body: "FMD", dueOn: "2026-10-15", status: "open" },
      ],
    });
    expect(register.events).toEqual([]);
    expect(register.due.map((row) => row.kind)).toEqual(["Vaccination due", "Isolation"]);
  });
});
