import { describe, expect, it } from "vitest";
import {
  activeOwners,
  extractOwnerName,
  isUkAddress,
  officerDisplayName,
  outwardCode,
  ownerFirstName,
  ownerFresh,
  ownerLine,
  pickCompany,
  postcodeMatch,
  similarName,
  ukPostcode,
} from "./prospect-owner";

describe("officer names", () => {
  it("turns Companies House names into first and last name", () => {
    expect(officerDisplayName("SMITH, John Michael")).toBe("John Smith");
    expect(officerDisplayName("O'BRIEN-JONES, Mary")).toBe("Mary O'Brien-Jones");
    expect(officerDisplayName("MCDONALD, Dr Alan")).toBe("Alan McDonald");
    expect(officerDisplayName("JONES")).toBe("Jones");
  });
  it("greets the first director, else the website name", () => {
    expect(ownerFirstName([{ name: "SMITH, John", role: "director", appointed: "" }], "Dave")).toBe(
      "John",
    );
    expect(ownerFirstName([], "Dave Evans")).toBe("Dave");
    expect(ownerFirstName([], null)).toBe("");
  });
});

describe("postcodes", () => {
  it("finds and compares UK postcodes", () => {
    expect(ukPostcode("1 High St, Newport np20 1aa, UK")).toBe("NP20 1AA");
    expect(outwardCode("NP20 1AA")).toBe("NP20");
    expect(outwardCode("NP20")).toBe("NP20");
    expect(postcodeMatch("NP20 1AA", "Unit 2, Newport NP20 1AA, UK")).toBe("same");
    expect(postcodeMatch("NP20 4XY", "Unit 2, Newport NP20 1AA, UK")).toBe("area");
    expect(postcodeMatch("NP2 4XY", "Unit 2, Newport NP20 1AA, UK")).toBe("none");
    expect(postcodeMatch("", "Newport NP20 1AA, UK")).toBe("none");
  });
  it("knows a UK address", () => {
    expect(isUkAddress("1 High St, Newport NP20 1AA, UK")).toBe(true);
    expect(isUkAddress("12 Allen Ave, Lagos, Nigeria")).toBe(false);
  });
});

describe("pickCompany", () => {
  const business = {
    name: "Busy Bees Cleaning Services",
    address: "3 Stepney St, Llanelli SA15 3TR, UK",
  };
  it("prefers an active company in the same postcode area", () => {
    const r = pickCompany(
      [
        {
          title: "BUSY BEES CLEANING SERVICES LTD",
          company_number: "11111111",
          company_status: "active",
          address: { postal_code: "M1 1AA" },
        },
        {
          title: "BUSY BEES CLEANING SERVICES (LLANELLI) LTD",
          company_number: "22222222",
          company_status: "dissolved",
          address: { postal_code: "SA15 3TR" },
        },
        {
          title: "BUSY BEES CLEANING LIMITED",
          company_number: "33333333",
          company_status: "active",
          address_snippet: "9 Park Road, Llanelli, SA15 2AB",
        },
      ],
      business,
    );
    expect(r).toEqual({
      number: "33333333",
      name: "BUSY BEES CLEANING LIMITED",
      match: "postcode match",
    });
  });
  it("accepts an exact name elsewhere only as a name-only match", () => {
    const r = pickCompany(
      [
        {
          title: "BUSY BEES CLEANING SERVICES LTD",
          company_number: "11111111",
          company_status: "active",
          address: { postal_code: "M1 1AA" },
        },
      ],
      business,
    );
    expect(r?.match).toBe("name only");
  });
  it("rejects different names and partial names far away", () => {
    expect(
      pickCompany(
        [
          {
            title: "BUSY BEES NURSERY LTD",
            company_number: "44444444",
            company_status: "active",
            address: { postal_code: "SA15 3TR" },
          },
        ],
        business,
      ),
    ).toBeNull();
    expect(similarName("Sparkle Cleaning Newport", "SPARKLE CLEANING LTD")).toBe(true);
    expect(similarName("Sparkle Cleaning", "SPARKLE WINDOWS LTD")).toBe(false);
  });
});

describe("activeOwners", () => {
  it("keeps active directors and LLP members, longest serving first", () => {
    expect(
      activeOwners([
        { name: "SMITH, John", officer_role: "director", appointed_on: "2020-01-01" },
        { name: "OLD, Gone", officer_role: "director", resigned_on: "2021-01-01" },
        { name: "SEC, Ret", officer_role: "secretary" },
        { name: "JONES, Ann", officer_role: "llp-designated-member", appointed_on: "2015-05-05" },
        { name: "HOLDCO LTD", officer_role: "corporate-director" },
      ]),
    ).toEqual([
      { name: "JONES, Ann", role: "llp-designated-member", appointed: "2015-05-05" },
      { name: "SMITH, John", role: "director", appointed: "2020-01-01" },
    ]);
  });
});

describe("extractOwnerName", () => {
  it("reads common owner phrases", () => {
    expect(extractOwnerName("<p>Hi, my name is Dave and I run this business.</p>")).toBe("Dave");
    expect(extractOwnerName("<h3>Owner: Sarah Jones</h3><p>Call us</p>")).toBe("Sarah Jones");
    expect(extractOwnerName("<p>Meet Tom, the owner, who has 20 years in the trade.</p>")).toBe(
      "Tom",
    );
    expect(extractOwnerName("<p>Hello! I&#39;m Jayne, and I started Busy Bees in 2015.</p>")).toBe(
      "Jayne",
    );
    expect(extractOwnerName("<p>Founded by Priya Patel in 2010.</p>")).toBe("Priya Patel");
  });
  it("reads JSON-LD founder but never review authors", () => {
    expect(
      extractOwnerName(
        `<script type="application/ld+json">{"@type":"LocalBusiness","founder":{"@type":"Person","name":"Gareth Evans"}}</script>`,
      ),
    ).toBe("Gareth Evans");
    expect(
      extractOwnerName(
        `<script type="application/ld+json">{"@type":"LocalBusiness","review":[{"author":{"@type":"Person","name":"Karen Hill"}}]}</script>`,
      ),
    ).toBe("");
  });
  it("ignores headings and business words", () => {
    expect(extractOwnerName("<h2>Family Owned And Run By Local People</h2>")).toBe("");
    expect(extractOwnerName("<p>I'm Proud to serve Newport. Owner Operated.</p>")).toBe("");
    expect(extractOwnerName("<p>We are a friendly team of cleaners.</p>")).toBe("");
    expect(extractOwnerName("")).toBe("");
  });
});

describe("ownerLine and caching", () => {
  it("shows Companies House first, else the website hint", () => {
    expect(
      ownerLine({
        owners: [{ name: "SMITH, John", role: "director", appointed: "" }],
        ownerSource: "companies_house",
        companyNumber: "12345678",
        ownerMatch: "postcode match",
        websiteOwnerName: "Dave",
      }),
    ).toEqual({
      label: "Owner: John Smith",
      source: "Companies House, director",
      href: "https://find-and-update.company-information.service.gov.uk/company/12345678",
      sure: true,
    });
    expect(
      ownerLine({
        owners: [],
        ownerSource: null,
        companyNumber: null,
        ownerMatch: null,
        websiteOwnerName: "Dave",
      })?.label,
    ).toBe("Possible owner: Dave");
  });
  it("keeps a lookup for 90 days", () => {
    const now = Date.parse("2026-10-31T00:00:00Z");
    expect(ownerFresh("2026-09-01T00:00:00Z", now)).toBe(true);
    expect(ownerFresh("2026-07-01T00:00:00Z", now)).toBe(false);
    expect(ownerFresh(null, now)).toBe(false);
  });
});
