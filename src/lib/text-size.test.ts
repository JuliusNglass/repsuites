// Reading rule: body text is 16px and nothing is smaller than 14px.
// Scans the app source so a 12px or 13px class cannot creep back in.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const SRC = join(__dirname, "..");

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return files(p);
    return /\.(tsx?|css)$/.test(name) && !name.endsWith(".test.ts") ? [p] : [];
  });
}

function offenders(re: RegExp): string[] {
  const out: string[] = [];
  for (const f of files(SRC)) {
    readFileSync(f, "utf8")
      .split("\n")
      .forEach((line, i) => {
        if (re.test(line)) out.push(`${f.slice(SRC.length + 1)}:${i + 1}`);
      });
  }
  return out;
}

describe("text size floor", () => {
  it("uses no text-xs class", () => {
    expect(
      offenders(/className=.*(?<![\w-])text-xs(?![\w-])|"[^"]*(?<![\w-])text-xs(?![\w-])/),
    ).toEqual([]);
  });

  it("uses no arbitrary Tailwind size under 14px", () => {
    expect(
      offenders(/text-\[(\d|1[0-3])(\.\d+)?px\]|text-\[0?\.([0-7]\d*|8|8[0-6]\d*)rem\]/),
    ).toEqual([]);
  });

  it("sets no CSS font-size under 14px", () => {
    expect(
      offenders(/font-size:\s*((\d|1[0-3])(\.\d+)?px|0?\.([0-7]\d*|8|8[0-6]\d*)r?em\b)/),
    ).toEqual([]);
  });
});
