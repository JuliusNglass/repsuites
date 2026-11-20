// The £1 review trial: pure rules shared by the pages and the server.
// £1 today for the first 30 days, then Growth at £49 a month.
// No em dashes in user-facing copy (AGENTS.md).
import { cleanSender, oneTextRequest, smsNumber } from "./review-sms";

export const TRIAL_ENTRY_PENCE = 100;
export const TRIAL_MONTH_PENCE = 4900;
export const TRIAL_DAYS = 30;
export const TRIAL_SMS_CAP = 60;

export const TRIAL_SESSION_RE = /^cs_(live|test)_[A-Za-z0-9]{10,200}$/;

export interface TrialCustomer {
  name: string;
  phone: string;
  email: string;
}

/** What is wrong with the first customer, or null when it can be sent. */
export function trialCustomerProblem(c: TrialCustomer): string | null {
  if (!c.name.trim()) return "Add your customer's name.";
  const phone = c.phone.trim();
  const email = c.email.trim();
  if (!phone && !email) return "Add their mobile or email, so the request can reach them.";
  if (phone && !smsNumber(phone)) return "That mobile number doesn't look right. Use a UK mobile.";
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return "That email doesn't look right.";
  return null;
}

/** Text when there is a mobile, otherwise email. */
export function trialChannel(c: TrialCustomer): "sms" | "email" {
  return c.phone.trim() && smsNumber(c.phone) ? "sms" : "email";
}

/** The text the customer will get, shown before the owner taps Send. */
export function trialPreview(customerName: string, business: string): string {
  return oneTextRequest({
    name: customerName,
    business: business || "your business",
    token: "abc123",
    reminder: false,
  });
}

/** Sender name for texts: the business name squeezed to 11 letters. */
export function trialSender(business: string): string {
  return cleanSender(business) ?? cleanSender(business.replace(/[^A-Za-z0-9]/g, "")) ?? "RepSuites";
}

export const TRIAL_TERMS =
  "£1 today covers your first 30 days. After that it's £49 a month (about £1.60 a day). Cancel any time before day 30 and you won't pay again.";

export const TRIAL_DATA_PROMISE =
  "Your customer list stays yours. We only use a customer's details to send the review request you approve. We never share or sell them, every message lets them opt out, and you can delete anyone any time.";
