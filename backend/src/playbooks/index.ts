import type { ProgramPlaybook } from "./schema.js";
import { vlasnaSpravaPlaybook } from "./vlasnaSprava.js";
import { veteranGrantPlaybook } from "./veteranGrant.js";
import { brave1Playbook } from "./brave1.js";
import { processingBusinessPlaybook } from "./processingBusiness.js";
import { agroGardensPlaybook } from "./agroGardens.js";

export * from "./schema.js";
export * from "./missingFields.js";
export {
  vlasnaSpravaPlaybook,
  veteranGrantPlaybook,
  brave1Playbook,
  processingBusinessPlaybook,
  agroGardensPlaybook,
};

export const PLAYBOOKS: Record<string, ProgramPlaybook> = {
  [vlasnaSpravaPlaybook.program_id]: vlasnaSpravaPlaybook,
  [veteranGrantPlaybook.program_id]: veteranGrantPlaybook,
  [brave1Playbook.program_id]: brave1Playbook,
  [processingBusinessPlaybook.program_id]: processingBusinessPlaybook,
  [agroGardensPlaybook.program_id]: agroGardensPlaybook,
};

export function getProgramPlaybook(programId: string): ProgramPlaybook | undefined {
  return PLAYBOOKS[programId];
}

export function listAllPlaybooks(): ProgramPlaybook[] {
  return Object.values(PLAYBOOKS);
}

export function isDeepProgram(programId: string): boolean {
  return PLAYBOOKS[programId]?.support_tier === "deep";
}
