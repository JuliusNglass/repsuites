import { describe, expect, it } from "vitest";
import { ghlProspectPayload, splitName } from "./ghl-prospect";

describe("ghl prospect payload", () => {
  it("splits names", () => {
    expect(splitName("Jayne Ann Smith")).toEqual({ first: "Jayne", last: "Ann Smith" });
    expect(splitName(null)).toEqual({ first: "", last: "" });
  });
  it("builds the payload", () => {
    const p = ghlProspectPayload(
      {
        name: "Busy Bees",
        contact_name: "Jayne",
        phone: "+447700900123",
        email: null,
        report_token: "abc",
        product: "sparkops",
      },
      "whatsapp",
      new Date("2026-11-01T00:00:00Z"),
    );
    expect(p).toMatchObject({
      first_name: "Jayne",
      last_name: "",
      business_name: "Busy Bees",
      email: "",
      report_url: "https://repsuites.com/r/abc",
      product: "sparkops",
      contacted_via: "whatsapp",
    });
  });
});
