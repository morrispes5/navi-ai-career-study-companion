import { describe, expect, it } from "vitest";
import { escapeHtml } from "../lib/html";
import { trustedOrigins } from "../lib/env";

describe("env helpers", () => {
  it("derives trusted origins from BETTER_AUTH_URL and NEXT_PUBLIC_APP_URL", () => {
    expect(trustedOrigins({ BETTER_AUTH_URL: "https://navi.app/api/auth", NEXT_PUBLIC_APP_URL: "https://navi.app" })).toEqual(["https://navi.app"]);
    expect(trustedOrigins({ BETTER_AUTH_URL: "http://localhost:3000", NEXT_PUBLIC_APP_URL: undefined })).toEqual(["http://localhost:3000"]);
  });
  it("escapes HTML", () => { expect(escapeHtml(`a"<b>&'`)).toBe("a&quot;&lt;b&gt;&amp;&#39;"); });
});
