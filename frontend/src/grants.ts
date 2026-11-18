import { GRANT_CATALOG } from "../../backend/src/grant-catalog-data.js";
export type GrantProgram = (typeof GRANT_CATALOG)[number];
export const GRANT_PROGRAMS = GRANT_CATALOG;

export function hasGuidedApplication(programId: string) {
  return programId === "vlasna-sprava" || programId === "agro-gardens";
}
