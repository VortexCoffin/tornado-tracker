import { mkdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

export function isServerless() {
  return Boolean(
    process.env.VERCEL ||
      process.env.AWS_LAMBDA_FUNCTION_NAME ||
      process.env.VERCEL_ENV
  );
}

/** Writable data directory (local ./data, or /tmp on Vercel). */
export function getDataDir() {
  if (process.env.DATA_DIR) {
    const dir = process.env.DATA_DIR;
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    return dir;
  }

  if (isServerless()) {
    const dir = join("/tmp", "tornado-tracker-data");
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    return dir;
  }

  return join(__dirname, "data");
}
