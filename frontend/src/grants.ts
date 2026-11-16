import { GRANT_CATALOG } from "../../backend/src/grant-catalog-data.js";
export type GrantProgram = (typeof GRANT_CATALOG)[number];
export const GRANT_PROGRAMS = GRANT_CATALOG;
