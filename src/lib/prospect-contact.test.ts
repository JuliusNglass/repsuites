import { describe, expect, it } from "vitest";
import {
  searchRegion,
  addressCountry,
  contactsFresh,
  decodeCfEmail,
  extractContacts,
  goodEmail,
  matchesReach,
  phoneType,
  rankEmails,
  waNumber,
} from "./prospect-contact";

describe("phone type", () => {
  it("reads UK mobiles and landlines", () => {
    expect(phoneType("+44 7700 900123")).toBe("mobile");
    expect(phoneType("07700 900123", "UK")).toBe("mobile");
    expect(phoneType("+44 (0)7911 123456")).toBe("mobile");
    expect(phoneType("+44 1633 123456")).toBe("landline");
    expect(phoneType("029 2000 1234", "UK")).toBe("landline");
    expect(phoneType("+44 333 123 4567")).toBe("landline");
    expect(phoneType("+44 800 123 4567")).toBe("landline");
    // 070 personal numbers and 076 pagers are not mobiles; 07624 Isle of Man is.
    expect(phoneType("+44 70 1234 5678")).toBe("landline");
    expect(phoneType("+44 7624 123456")).toBe("mobile");
  });
  it("reads Nigerian mobiles and landlines", () => {
    for (const n of [
      "+234 803 123 4567",
      "+234 701 234 5678",
      "+234 810 000 0000",
      "+234 906 123 4567",
      "+234 913 123 4567",
    ])
      expect(phoneType(n)).toBe("mobile");
    expect(phoneType("0803 123 4567", "Nigeria")).toBe("mobile");
    expect(phoneType("+234 1 234 5678")).toBe("landline");
  });
  it("falls back sensibly", () => {
    expect(phoneType("")).toBe("none");
    expect(phoneType(null)).toBe("none");
    expect(phoneType("+1 415 555 0100")).toBe("unknown");
    expect(phoneType("+999 1234")).toBe("unknown");
    expect(phoneType("07700 900123")).toBe("unknown"); // no country
    expect(phoneType("+353 87 123 4567")).toBe("mobile");
    expect(phoneType("+27 82 123 4567")).toBe("mobile");
    expect(phoneType("+27 21 123 4567")).toBe("landline");
  });
  it("makes WhatsApp numbers and reads the country", () => {
    expect(waNumber("07700 900123", "UK")).toBe("447700900123");
    expect(waNumber("+44 7700 900123")).toBe("447700900123");
    expect(addressCountry("1 High St, Newport NP20 1AA, UK")).toBe("UK");
  });
});

describe("email finder", () => {
  const site = "https://www.bobsplumbing.co.uk/";
  it("finds mailto links, plain text and Cloudflare-hidden emails", () => {
    const html = `
      <a href="mailto:info@bobsplumbing.co.uk?subject=Hi">Email us</a>
      <p>Or write to bob [at] bobsplumbing [dot] co [dot] uk</p>
      <a href="/cdn-cgi/l/email-protection" class="__cf_email__" data-cfemail="${cf("hello@bobsplumbing.co.uk")}">[email protected]</a>
      <a href="/contact-us/">Contact</a>
      <a href="https://www.facebook.com/bobsplumbing/">fb</a>
      <a href="https://www.facebook.com/sharer/sharer.php?u=x">share</a>
      <a href="https://instagram.com/bobsplumbing">ig</a>`;
    const c = extractContacts(html, site);
    expect(c.emails).toEqual(
      expect.arrayContaining([
        "info@bobsplumbing.co.uk",
        "bob@bobsplumbing.co.uk",
        "hello@bobsplumbing.co.uk",
      ]),
    );
    expect(c.contactUrl).toBe("https://www.bobsplumbing.co.uk/contact-us/");
    expect(c.facebook).toBe("https://www.facebook.com/bobsplumbing");
    expect(c.instagram).toBe("https://instagram.com/bobsplumbing");
  });
  it("ignores picture names, trackers and placeholders", () => {
    const html = `
      <img src="logo@2x.png"> <span>icon@3x.webp</span>
      <script>var dsn="https://abc123@o12.ingest.sentry.io/4";</script>
      <p>605a7baede844d278b89dc95ae0a9123@sentry-next.wixpress.com</p>
      <p>Type your email: you@example.com, name@domain.com</p>
      <a href="https://www.instagram.com/p/xyz/">post</a>`;
    const c = extractContacts(html, site);
    expect(c.emails).toEqual([]);
    expect(c.instagram).toBe("");
    expect(goodEmail("info@bobsplumbing.co.uk")).toBe(true);
    expect(goodEmail("banner@2x.jpg")).toBe(false);
  });
  it("finds a contact page from the link words", () => {
    const c = extractContacts(
      `<a href="/reach-us">Get in touch</a><a href="https://other.com/contact">x</a>`,
      site,
    );
    expect(c.contactUrl).toBe("https://www.bobsplumbing.co.uk/reach-us");
  });
  it("ranks same-domain shared inboxes first and drops no-reply", () => {
    expect(
      rankEmails(
        [
          "noreply@bobsplumbing.co.uk",
          "bob.smith@gmail.com",
          "sarah@bobsplumbing.co.uk",
          "info@bobsplumbing.co.uk",
          "help@agency.com",
        ],
        site,
      ),
    ).toEqual([
      "info@bobsplumbing.co.uk",
      "sarah@bobsplumbing.co.uk",
      "bob.smith@gmail.com",
      "help@agency.com",
    ]);
  });
  it("decodes Cloudflare emails", () => {
    expect(decodeCfEmail(cf("a@b.co"))).toBe("a@b.co");
    expect(decodeCfEmail("zz")).toBe("");
  });
  it("re-checks after 30 days and filters by reach", () => {
    const now = Date.parse("2026-10-31T00:00:00Z");
    expect(contactsFresh("2026-10-20T00:00:00Z", now)).toBe(true);
    expect(contactsFresh("2026-09-20T00:00:00Z", now)).toBe(false);
    expect(contactsFresh(null, now)).toBe(false);
    const wa = { phoneType: "mobile" as const, email: "" };
    const em = { phoneType: "landline" as const, email: "a@b.co" };
    const neither = { phoneType: "landline" as const, email: "" };
    expect([wa, em, neither].filter((h) => matchesReach(h, "whatsapp"))).toEqual([wa]);
    expect([wa, em, neither].filter((h) => matchesReach(h, "email"))).toEqual([em]);
    expect([wa, em, neither].filter((h) => matchesReach(h, "either"))).toEqual([wa, em]);
    expect([wa, em, neither].filter((h) => matchesReach(h, "all"))).toHaveLength(3);
  });
});

// Encodes an email the way Cloudflare does, for the fixtures.
function cf(email: string, key = 0x5a): string {
  const hex = (n: number) => n.toString(16).padStart(2, "0");
  return hex(key) + [...email].map((ch) => hex(ch.charCodeAt(0) ^ key)).join("");
}

describe("searchRegion", () => {
  it("defaults to the UK", () => {
    expect(searchRegion("car detailing in Newport")).toEqual({
      code: "GB",
      keep: ["UK", "United Kingdom"],
    });
  });
  it("searches Nigeria when named", () => {
    expect(searchRegion("restaurants in Lekki").code).toBe("NG");
  });
  it("turns the filter off for other countries", () => {
    expect(searchRegion("car detailing Newport Oregon").keep).toBeNull();
  });
});
