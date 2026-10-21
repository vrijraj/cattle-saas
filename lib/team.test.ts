import { describe, expect, it } from "vitest";
import { inviteIsOpen, keepsTeamAdmin } from "./team";

describe("team access", () => {
  const members = [
    { userId: "asha", roles: ["owner", "admin"], disabled: false },
    { userId: "imran", roles: ["manager"], disabled: false },
  ];

  it("keeps one person who can manage the farm", () => {
    expect(keepsTeamAdmin(members, "asha", "disabled")).toBe(false);
    expect(keepsTeamAdmin(members, "asha", ["worker"])).toBe(false);
    expect(keepsTeamAdmin(members, "imran", "disabled")).toBe(true);
    expect(keepsTeamAdmin([{ ...members[0] }, { userId: "b", roles: ["admin"], disabled: false }], "asha", "disabled")).toBe(true);
  });

  it("treats an invite as open until it expires or is accepted", () => {
    const expiresAt = new Date("2026-10-28T00:00:00Z");
    expect(inviteIsOpen({ acceptedAt: null, expiresAt }, new Date("2026-10-21T00:00:00Z").getTime())).toBe(true);
    expect(inviteIsOpen({ acceptedAt: null, expiresAt }, new Date("2026-10-28T00:00:01Z").getTime())).toBe(false);
    expect(inviteIsOpen({ acceptedAt: new Date(), expiresAt }, new Date("2026-10-21T00:00:00Z").getTime())).toBe(false);
  });
});
