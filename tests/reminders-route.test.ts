import { describe, expect, it } from "vitest";
import { bearerMatches } from "../lib/server/cron-auth";

describe("GET /api/cron/reminders auth", () => {
  it("rejects a missing or wrong secret before touching the database", async () => {
    const previous = process.env.CRON_SECRET;
    delete process.env.CRON_SECRET;
    const { GET } = await import("../app/api/cron/reminders/route");
    expect((await GET(new Request("http://localhost/api/cron/reminders"))).status).toBe(503);
    process.env.CRON_SECRET = "cron-secret-for-test";
    expect((await GET(new Request("http://localhost/api/cron/reminders", { headers: { authorization: "Bearer wrong" } }))).status).toBe(401);
    expect(bearerMatches("Bearer cron-secret-for-test", "cron-secret-for-test")).toBe(true);
    expect(bearerMatches("Bearer cron-secret-for-test", "other-secret-value")).toBe(false);
    if (previous === undefined) delete process.env.CRON_SECRET; else process.env.CRON_SECRET = previous;
  });
});
