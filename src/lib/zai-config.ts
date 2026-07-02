import { writeFileSync, existsSync } from "fs";
import { join } from "path";

/**
 * On platforms with a read-only filesystem (like Vercel), the
 * z-ai-web-dev-sdk can't find a .z-ai-config file unless we write
 * one ourselves. /tmp is always writable on Vercel's serverless
 * functions, so we write there directly.
 */
const CONFIG_PATH = join("/tmp", ".z-ai-config");

export function ensureZaiConfig() {
  if (existsSync(CONFIG_PATH)) return;

  const baseUrl = process.env.ZAI_BASE_URL;
  const apiKey = process.env.ZAI_API_KEY;

  if (!baseUrl || !apiKey) {
    throw new Error(
      "Missing ZAI_BASE_URL or ZAI_API_KEY environment variables."
    );
  }

  writeFileSync(
    CONFIG_PATH,
    JSON.stringify({ baseUrl, apiKey }),
    { mode: 0o600 }
  );

  process.env.HOME = "/tmp";
}
