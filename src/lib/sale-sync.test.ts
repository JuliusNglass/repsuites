import { describe, expect, it } from "vitest";
import { isNewSale, saleTitle } from "./sale-sync";

const opp = {
  id: "o1",
  status: "won",
  monetaryValue: 1497,
  lastStatusChangeAt: "2026-11-20T10:00:00Z",
  contact: { id: "c1", name: "Dee Smith" },
};

describe("sale sync", () => {
  it("counts wins after the start date with a contact", () => {
    expect(isNewSale(opp)).toBe(true);
    expect(isNewSale({ ...opp, lastStatusChangeAt: "2026-11-01T00:00:00Z" })).toBe(false);
    expect(isNewSale({ ...opp, status: "open" })).toBe(false);
    expect(isNewSale({ ...opp, contact: null })).toBe(false);
  });
  it("titles the alert with name and value", () => {
    expect(saleTitle(opp)).toBe("Sale won: Dee Smith (£1,497)");
    expect(saleTitle({ ...opp, monetaryValue: 0 })).toBe("Sale won: Dee Smith");
  });
});
