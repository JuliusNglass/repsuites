// Pure helpers for texted review requests (Text Pack). No server imports.
// No em dashes in this copy (AGENTS.md).

// A UK mobile in international form (447...), or null.
export function smsNumber(raw: string | null | undefined): string | null {
  let d = String(raw ?? "").replace(/[^\d+]/g, "");
  if (d.startsWith("+")) d = d.slice(1);
  if (d.startsWith("00")) d = d.slice(2);
  if (d.startsWith("07")) d = "44" + d.slice(1);
  return /^447\d{9}$/.test(d) ? d : null;
}

// The name shown as the sender: 3 to 11 letters, numbers or spaces, starting
// with a letter (UK alphanumeric sender rules).
export function cleanSender(raw: string | null | undefined): string | null {
  const s = String(raw ?? "")
    .replace(/[^A-Za-z0-9 ]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 11)
    .trim();
  return /^[A-Za-z][A-Za-z0-9 ]{2,10}$/.test(s) ? s : null;
}

// Text parts: 160 characters for one part, 153 for each part after that.
// Anything outside plain GSM characters uses 70 and 67.
export function smsParts(text: string): number {
  const gsm = /^[A-Za-z0-9 \r\n@£$¥!"#%&'()*+,\-./:;<=>?_¡¿ÄÖÑÜ§äöñüàèéùìòÇØøÅåÆæßÉ]*$/.test(text);
  const one = gsm ? 160 : 70;
  const many = gsm ? 153 : 67;
  const n = [...text].length;
  if (n <= one) return 1;
  return Math.ceil(n / many);
}

// The text a customer gets: the business's message (link included) and a
// one-tap opt-out. Smart quotes and dashes become plain ones so the text
// stays in one cheap part where it can.
export function reviewSmsText(body: string, unsubLink: string): string {
  const plain = body
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/\s+\n/g, "\n")
    .trim();
  return `${plain}\nOpt out: ${unsubLink}`;
}

// The month an allowance belongs to, in UK time ("2026-11").
export function smsPeriod(now: Date): string {
  const p = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(now);
  const y = p.find((x) => x.type === "year")?.value ?? "1970";
  const m = p.find((x) => x.type === "month")?.value ?? "01";
  return `${y}-${m}`;
}

// A texted request that fits one text part (160 characters) wherever it can.
// Links are written without "https://" (phones still make them tappable).
// Tries the friendliest wording first and falls back to shorter ones.
export function oneTextRequest(a: {
  name: string;
  business: string;
  token: string;
  reminder: boolean;
}): string {
  const link = `repsuites.com/q/${a.token}`;
  const stop = `Stop: repsuites.com/x/${a.token}`;
  const first = a.name.trim().split(/\s+/)[0]?.slice(0, 15) ?? "";
  const hi = first ? `Hi ${first}, ` : "Hi, ";
  const biz = a.business.trim();
  const options = a.reminder
    ? [
        `${hi}a gentle reminder from ${biz}: a quick review would mean a lot ${link}\n${stop}`,
        `${hi}a quick reminder from ${biz}: ${link}\n${stop}`,
        `${biz}: a quick review would mean a lot ${link}\n${stop}`,
        `Quick review? ${link}\n${stop}`,
      ]
    : [
        `${hi}thanks for choosing ${biz}. A quick review would really help: ${link}\n${stop}`,
        `${hi}thanks for choosing ${biz}! Quick review? ${link}\n${stop}`,
        `${biz}: a quick review would really help ${link}\n${stop}`,
        `Quick review? ${link}\n${stop}`,
      ];
  const plain = (t: string) =>
    t
      .replace(/[\u2018\u2019]/g, "'")
      .replace(/[\u201C\u201D]/g, '"')
      .replace(/[\u2013\u2014]/g, "-");
  for (const o of options.map(plain)) if (smsParts(o) === 1) return o;
  return plain(options[options.length - 1]!);
}
