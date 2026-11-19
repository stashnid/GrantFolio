import pg from "pg";
import {
  getMonitorProfile,
  PROGRAM_MONITOR_PROFILES,
} from "./program-monitor-profiles.js";
import { createSmartGrantMonitor } from "./smart-grant-monitor.js";

function parseProgramArg(argv: readonly string[]): string | undefined {
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg.startsWith("--program=")) {
      const value = arg.slice("--program=".length).trim();
      if (!value) throw new Error("--program requires a non-empty program ID");
      return value;
    }
    if (arg === "--program") {
      const value = argv[i + 1]?.trim();
      if (!value) throw new Error("--program requires a non-empty program ID");
      return value;
    }
  }
  return undefined;
}

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL required");
}

const programId = parseProgramArg(process.argv.slice(2));
const profiles = programId
  ? (() => {
      const profile = getMonitorProfile(programId);
      if (!profile) {
        throw new Error(`Unknown monitor program profile: ${programId}`);
      }
      return [profile];
    })()
  : PROGRAM_MONITOR_PROFILES;

const db = new pg.Pool({ connectionString: process.env.DATABASE_URL });
try {
  const monitor = createSmartGrantMonitor(db, { profiles });
  const summary = await monitor.runAll();
  console.log(JSON.stringify(summary));
} finally {
  await db.end();
}
