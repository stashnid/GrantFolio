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
  };
}
