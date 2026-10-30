import { describe, expect, it } from "vitest";
import { aiQuestions, readAnswer, sameBusiness } from "./ai-visibility";

describe("AI visibility", () => {
  it("asks three customer questions", () => {
    expect(aiQuestions("Cleaning Company", "Newport")[0]).toBe(
      "What is the best cleaning company in Newport?",
    );
  });
  it("matches business names loosely", () => {
    expect(sameBusiness("The Italian Job", "The Italian Job Newport")).toBe(true);
    expect(sameBusiness("Burger Base", "burger base")).toBe(true);
    expect(sameBusiness("Zizzi", "Prezzo")).toBe(false);
  });
  it("reads the list and finds the position", () => {
    const a = readAnswer(
      "q",
      'Here are some options...\n{"businesses": ["Prezzo", "The Italian Job", "Zizzi"]}',
      "The Italian Job Newport",
    );
    expect(a.named).toBe(true);
    expect(a.position).toBe(2);
    expect(readAnswer("q", "no list", "X").named).toBe(false);
  });
});
