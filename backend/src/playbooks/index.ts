import { PLAYBOOKS } from "./data.js";

export { PLAYBOOKS };
export { type ProgramPlaybook, programPlaybookSchema } from "./schema.js";
export {
  hydrateProgramKnowledge,
  programKnowledgeHash,
  syncPlaybooks,
  type ProgramKnowledge,
} from "./sync.js";

export function getProgramPlaybook(id: string) {
  const playbook = PLAYBOOKS.find((entry) => entry.programId === id);
  return playbook ? structuredClone(playbook) : undefined;
}
