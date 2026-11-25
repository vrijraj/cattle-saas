import { describe, expect, it } from "vitest";
import { normalizeLocale, t } from "./i18n";

describe("i18n", () => {
  it("normalizes supported Indian locales and falls back to en", () => {
    expect(normalizeLocale("hi")).toBe("hi");
    expect(normalizeLocale("gu")).toBe("gu");
    expect(normalizeLocale("mr")).toBe("mr");
    expect(normalizeLocale("fr")).toBe("en");
    expect(normalizeLocale(null)).toBe("en");
  });

  it("translates navigation labels across en, hi, gu, mr", () => {
    expect(t("en", "nav.milk")).toBe("Milk production");
    expect(t("hi", "nav.milk")).toBe("दूध उत्पादन");
    expect(t("gu", "nav.milk")).toBe("દૂધ ઉત્પાદન");
    expect(t("mr", "nav.milk")).toBe("दूध उत्पादन");
  });
});
