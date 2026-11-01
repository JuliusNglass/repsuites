import { describe, expect, it } from "vitest";
import {
  Budget,
  freeAgentCustomer,
  freeAgentPaid,
  invoiceCap,
  invoiceToRequest,
  nextCursor,
  parseProviderDate,
  quickBooksCustomer,
  quickBooksPaid,
  quickBooksRealms,
  verifyQuickBooksSignature,
  verifySvixSignature,
  verifyXeroSignature,
  xeroCustomer,
  xeroPaid,
  xeroTenants,
} from "./accounting";

describe("webhook signatures", () => {
  // Svix (Resend) test vector from Svix's "verifying webhooks manually" docs.
  it("accepts the Svix documented example and rejects changes", async () => {
    const secret = "whsec_MfKQ9r8GKYqrTwjUPD8ILPZIo2LaLaSw";
    const h = {
      id: "msg_p5jXN8AQM9LWM0D4loKWxJek",
      timestamp: "1614265330",
      signature: "v1,g0hM9SsE+OTPJTGt/tmIKtSyZlE3uFJELVlNIOLJ1OE=",
    };
    const body = '{"test": 2432232314}';
    expect(await verifySvixSignature(body, h, secret, 1614265330)).toBe(true);
    // Several signatures, one valid.
    expect(
      await verifySvixSignature(
        body,
        { ...h, signature: `v1,bm9wZQ== ${h.signature}` },
        secret,
        1614265330,
      ),
    ).toBe(true);
    expect(await verifySvixSignature(body + " ", h, secret, 1614265330)).toBe(false);
    // Too old.
    expect(await verifySvixSignature(body, h, secret, 1614265330 + 301)).toBe(false);
    expect(await verifySvixSignature(body, { ...h, id: null }, secret, 1614265330)).toBe(false);
  });

  // QuickBooks and Xero both sign as base64(HMAC-SHA256(raw body, key)).
  // Neither publishes a fixed vector, so these were made with Node's own
  // crypto.createHmac (a separate implementation from the Web Crypto code).
  it("checks the QuickBooks intuit-signature", async () => {
    const body =
      '{"eventNotifications":[{"realmId":"1185883450","dataChangeEvent":{"entities":[{"name":"Invoice","id":"130","operation":"Update","lastUpdated":"2026-10-31T10:00:00.000Z"}]}}]}';
    const key = "fe7a2cd5-1d8a-4b7a-9b8e-0f5c1c9d2e11";
    const sig = "LVL6dscK21a7EABI+XiXIXjXQwVyzaBohT/E5jZJASk=";
    expect(await verifyQuickBooksSignature(body, sig, key)).toBe(true);
    expect(await verifyQuickBooksSignature(body, sig, key + "x")).toBe(false);
    expect(await verifyQuickBooksSignature(body.replace("130", "131"), sig, key)).toBe(false);
    expect(await verifyQuickBooksSignature(body, null, key)).toBe(false);
    expect(await verifyQuickBooksSignature(body, sig, "")).toBe(false);
  });

  it("checks the Xero signature, including the intent to receive call", async () => {
    const body =
      '{"events":[],"firstEventSequence":0,"lastEventSequence":0,"entropy":"S0m3r4Nd0mt3xt"}';
    const key = "YOUR_WEBHOOK_KEY_example_123";
    const sig = "jwXyfrjJndp6+qeyL0yJrFo/9b3NAm/JydNfHkMEWVQ=";
    expect(await verifyXeroSignature(body, sig, key)).toBe(true);
    expect(await verifyXeroSignature(body, sig.replace("j", "k"), key)).toBe(false);
  });
});

describe("webhook payloads", () => {
  it("reads QuickBooks realms from both payload formats", () => {
    expect(
      quickBooksRealms({
        eventNotifications: [
          { realmId: "111", dataChangeEvent: { entities: [{ name: "Invoice", id: "1" }] } },
          { realmId: "222", dataChangeEvent: { entities: [{ name: "Customer", id: "1" }] } },
          { realmId: "333", dataChangeEvent: { entities: [{ name: "Payment", id: "9" }] } },
        ],
      }).sort(),
    ).toEqual(["111", "333"]);
    expect(
      quickBooksRealms([
        {
          specversion: "1.0",
          type: "qbo.invoice.updated.v1",
          intuitentityid: "130",
          intuitaccountid: "444",
        },
        { specversion: "1.0", type: "qbo.payment.created.v1", intuitaccountid: "555" },
        { specversion: "1.0", type: "qbo.account.created.v1", intuitaccountid: "666" },
        { type: "qbo.invoice.updated.v1", intuitaccountid: "not-a-number" },
      ]).sort(),
    ).toEqual(["444", "555"]);
    expect(quickBooksRealms(null)).toEqual([]);
  });

  it("reads Xero tenants from invoice events only", () => {
    const t = "6b3f3e8a-1d2c-4b5a-9e8f-0a1b2c3d4e5f";
    expect(
      xeroTenants({
        events: [
          { eventCategory: "INVOICE", eventType: "UPDATE", tenantId: t },
          {
            eventCategory: "CONTACT",
            eventType: "UPDATE",
            tenantId: "7b3f3e8a-1d2c-4b5a-9e8f-0a1b2c3d4e5f",
          },
          { eventCategory: "INVOICE", eventType: "CREATE", tenantId: t.toUpperCase() },
        ],
      }),
    ).toEqual([t]);
    expect(xeroTenants({ events: [] })).toEqual([]);
  });
});

describe("paid invoice to review request", () => {
  it("QuickBooks: paid only when the balance is 0 on a real invoice", () => {
    const inv = {
      Id: "130",
      Balance: 0,
      TotalAmt: 120,
      CustomerRef: { value: "58", name: "Smith Plumbing Ltd" },
      BillEmail: { Address: "accounts@smith.co.uk" },
      MetaData: { LastUpdatedTime: "2026-10-31T10:00:00-07:00" },
    };
    const p = quickBooksPaid(inv, "1185883450")!;
    expect(p.externalId).toBe("quickbooks:1185883450-130");
    expect(p.customerKey).toBe("58");
    expect(p.updatedAt).toBe("2026-10-31T17:00:00.000Z");
    expect(quickBooksPaid({ ...inv, Balance: 20 }, "1")).toBeNull();
    expect(quickBooksPaid({ ...inv, TotalAmt: 0 }, "1")).toBeNull();
    const cust = quickBooksCustomer({
      GivenName: "Jane",
      FamilyName: "Smith",
      DisplayName: "Smith Plumbing Ltd",
      PrimaryEmailAddr: { Address: "Jane@Smith.co.uk" },
      Mobile: { FreeFormNumber: "07700 900123" },
    });
    expect(invoiceToRequest(p, cust)).toEqual({
      name: "Jane Smith",
      email: "jane@smith.co.uk",
      phone: "07700 900123",
      externalId: "quickbooks:1185883450-130",
    });
    // No customer record: falls back to the invoice's bill email and name.
    expect(invoiceToRequest(p, null)).toEqual({
      name: "Smith Plumbing Ltd",
      email: "accounts@smith.co.uk",
      phone: null,
      externalId: "quickbooks:1185883450-130",
    });
  });

  it("Xero: sales invoices with status PAID, .NET dates and phones", () => {
    const inv = {
      InvoiceID: "243216C5-369E-4056-AC67-05388F86DC81",
      Type: "ACCREC",
      Status: "PAID",
      Contact: { ContactID: "025867F1-D741-4D6B-B1AF-9F6A1A1A1A1A", Name: "Tom Jones" },
      UpdatedDateUTC: "/Date(1761904800000+0000)/",
    };
    const p = xeroPaid(inv)!;
    expect(p.externalId).toBe("xero:243216c5-369e-4056-ac67-05388f86dc81");
    expect(p.updatedAt).toBe(new Date(1761904800000).toISOString());
    expect(xeroPaid({ ...inv, Type: "ACCPAY" })).toBeNull();
    expect(xeroPaid({ ...inv, Status: "AUTHORISED" })).toBeNull();
    const c = xeroCustomer({
      Name: "Tom Jones",
      EmailAddress: "",
      Phones: [
        { PhoneType: "DEFAULT", PhoneNumber: "" },
        { PhoneType: "MOBILE", PhoneNumber: "7700 900123", PhoneCountryCode: "44" },
      ],
    });
    expect(invoiceToRequest(p, c)).toEqual({
      name: "Tom Jones",
      email: null,
      phone: "+44 7700 900123",
      externalId: "xero:243216c5-369e-4056-ac67-05388f86dc81",
    });
    expect(parseProviderDate("/Date(0+0000)/")).toBe("1970-01-01T00:00:00.000Z");
  });

  it("FreeAgent: status Paid, contact looked up by its address", () => {
    const inv = {
      url: "https://api.freeagent.com/v2/invoices/987",
      contact: "https://api.freeagent.com/v2/contacts/55",
      status: "Paid",
      updated_at: "2026-10-31T09:30:00Z",
    };
    const p = freeAgentPaid(inv)!;
    expect(p.externalId).toBe("freeagent:987");
    expect(p.customerKey).toBe("https://api.freeagent.com/v2/contacts/55");
    expect(freeAgentPaid({ ...inv, status: "Open" })).toBeNull();
    expect(freeAgentPaid({ ...inv, contact: "https://evil.example/v2/contacts/55" })).toBeNull();
    const c = freeAgentCustomer({
      contact: { first_name: "Ann", last_name: "Lee", email: "ann@lee.com", mobile: "" },
    });
    expect(invoiceToRequest(p, c)?.email).toBe("ann@lee.com");
  });

  it("skips customers with no way to reach them", () => {
    const p = freeAgentPaid({
      url: "https://api.freeagent.com/v2/invoices/1",
      contact: "https://api.freeagent.com/v2/contacts/2",
      status: "Paid",
      updated_at: "2026-10-31T09:30:00Z",
    })!;
    expect(invoiceToRequest(p, { name: "Ann", email: "not-an-email", phone: "12" })).toBeNull();
  });
});

describe("cursor", () => {
  const now = new Date("2026-11-01T12:00:00Z");
  const times = [
    "2026-11-01T10:00:00.000Z",
    "2026-11-01T10:05:00.000Z",
    "2026-11-01T10:09:00.000Z",
  ];
  it("moves to the last handled change", () => {
    expect(nextCursor("2026-11-01T09:00:00.000Z", times, 3, false, now)).toBe(times[2]);
    expect(nextCursor("2026-11-01T09:00:00.000Z", times, 2, true, now)).toBe(times[1]);
  });
  it("stays put when nothing was handled and never goes back", () => {
    expect(nextCursor("2026-11-01T09:00:00.000Z", times, 0, true, now)).toBe(
      "2026-11-01T09:00:00.000Z",
    );
    expect(nextCursor("2026-11-01T11:00:00.000Z", times, 3, false, now)).toBe(
      "2026-11-01T11:00:00.000Z",
    );
  });
  it("steps on a second when a capped run could not move it", () => {
    const same = ["2026-11-01T10:00:00.000Z", "2026-11-01T10:00:00.000Z"];
    expect(nextCursor("2026-11-01T10:00:00.000Z", same, 1, true, now)).toBe(
      "2026-11-01T10:00:01.000Z",
    );
  });
  it("never goes past now", () => {
    expect(nextCursor("2026-11-01T09:00:00.000Z", ["2026-11-02T00:00:00Z"], 1, false, now)).toBe(
      now.toISOString(),
    );
  });
});

describe("subrequest budget", () => {
  it("takes until empty", () => {
    const b = new Budget(3);
    expect(b.take(2)).toBe(true);
    expect(b.can(2)).toBe(false);
    expect(b.take(2)).toBe(false);
    expect(b.take(1)).toBe(true);
    expect(b.left).toBe(0);
  });
  it("caps invoices to what is left", () => {
    expect(invoiceCap(30, 10, 1, 25)).toBe(20);
    expect(invoiceCap(30, 10, 0, 25)).toBe(25);
    expect(invoiceCap(9, 10, 1, 25)).toBe(0);
    expect(invoiceCap(100, 10, 1, 25)).toBe(25);
  });
});
