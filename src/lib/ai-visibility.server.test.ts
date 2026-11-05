import { afterEach, describe, expect, it, vi } from "vitest";
import { ask } from "./ai-visibility.server";
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
describe("AI visibility evidence collection", () => {
  it("does not classify malformed answers as a business not being mentioned", async () => {
    vi.stubEnv("REPSUITES_ANTHROPIC_API_KEY", "test-only");
    const fetcher = vi.fn(
      async () =>
        new Response(JSON.stringify({ content: [{ type: "text", text: "I could not answer" }] })),
    );
    vi.stubGlobal("fetch", fetcher);
    const answer = await ask("test question", "Test town");
    expect(answer).toHaveProperty("error");
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it("retains the actual response model and source URLs", async () => {
    vi.stubEnv("REPSUITES_ANTHROPIC_API_KEY", "test-only");
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              model: "test-model",
              content: [
                {
                  type: "text",
                  text: '{"businesses": []}',
                  citations: [{ url: "https://example.com/source" }],
                },
              ],
            }),
          ),
      ),
    );
    const answer = await ask("test question", "Test town");
    expect(answer).toMatchObject({
      evidence: {
        provider: "Anthropic",
        model: "test-model",
        urls: ["https://example.com/source"],
      },
    });
  });
});
