import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Keep the official Gemini SDK in the Node.js server bundle only.
  serverExternalPackages: ["@google/genai"]
};

export default nextConfig;
