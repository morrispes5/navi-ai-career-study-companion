import { toNextJsHandler } from "better-auth/next-js";
import { getAuth } from "../../../../lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const handler = (request: Request) => toNextJsHandler(getAuth())[request.method === "GET" ? "GET" : "POST"](request);
export { handler as GET, handler as POST };
