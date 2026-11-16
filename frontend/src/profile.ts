const detailKeys = ["contactName", "phone", "website", "legalForm", "registrationYear", "industry", "kved", "city", "teamSize", "teamExperience", "grantExperience", "fundingPurpose", "requestedAmount", "ownContribution"] as const;
export type DetailKey = typeof detailKeys[number];
export type Profile = { businessName: string; region: string; description: string; details: Record<DetailKey, string> };
export const emptyProfile: Profile = { businessName: "", region: "", description: "", details: Object.fromEntries(detailKeys.map(k => [k, ""])) as Profile["details"] };
export function normalizeProfile(value: Partial<Profile> | null | undefined): Profile {
  return { businessName: value?.businessName ?? "", region: value?.region ?? "", description: value?.description ?? "", details: Object.fromEntries(detailKeys.map(k => [k, typeof value?.details?.[k] === "string" ? value.details[k] : ""])) as Profile["details"] };
}
