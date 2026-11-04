import { describe, expect, it, vi } from "vitest";
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
import { assertResetEmailConfigured } from "../lib/auth";
import { authErrorMessage } from "../lib/auth/errors";

describe("reset password email config", () => {
  it("fails loudly in production without RESEND_API_KEY", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => assertResetEmailConfigured({ NODE_ENV: "production" } as NodeJS.ProcessEnv)).toThrow(/belum dikonfigurasi/);
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
  it("allows dev without key and production with key", () => {
    expect(() => assertResetEmailConfigured({ NODE_ENV: "development" } as NodeJS.ProcessEnv)).not.toThrow();
    expect(() => assertResetEmailConfigured({ NODE_ENV: "production", RESEND_API_KEY: "re_x" } as NodeJS.ProcessEnv)).not.toThrow();
  });
  it("shows a clear message to the user", () => {
    expect(authErrorMessage({ code: "EMAIL_NOT_CONFIGURED" }, "recovery")).toMatch(/belum tersedia/);
  });
});
