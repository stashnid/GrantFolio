import { monobankAcquiring } from "./monobank-acquiring.js";
import type { PaymentConfig } from "./grant-preparation-pilot.js";

export function configuredPayment(): PaymentConfig | undefined {
  const token = process.env.MONOBANK_ACQUIRING_TOKEN?.trim();
  const base = process.env.PUBLIC_BASE_URL?.trim();
  if (!token || !base) return undefined;
  try {
    const url = new URL(base);
    if (url.protocol !== "https:" || url.username || url.password || url.pathname !== "/" || url.search || url.hash) return undefined;
    return { client: monobankAcquiring(token), baseUrl: url.origin };
  } catch { return undefined; }
}

export function configuration() {
  const emulator = process.env.FIREBASE_AUTH_EMULATOR_HOST;
  if (
    emulator &&
    (process.env.NODE_ENV === "production" ||
      process.env.AUTH_MODE !== "emulator")
  )
    throw new Error(
      "Firebase emulator requires AUTH_MODE=emulator and a non-production environment",
    );
  if (process.env.AUTH_MODE === "emulator" && !emulator)
    throw new Error("FIREBASE_AUTH_EMULATOR_HOST is required in emulator mode");
  if (!process.env.FIREBASE_PROJECT_ID || !process.env.DATABASE_URL)
    throw new Error("FIREBASE_PROJECT_ID and DATABASE_URL are required");
  return {
    projectId: process.env.FIREBASE_PROJECT_ID,
    databaseUrl: process.env.DATABASE_URL,
    runCatalogTimers: process.env.CATALOG_REFRESH_MODE !== "scheduled",
  };
}
