import { z } from "zod";

const text = (max: number) => z.string().trim().max(max);
const phone = text(40)
  .refine((value) => value === "" || /^[+\d \u00a0\u202f().-]+$/.test(value))
  .transform((value) => value.replace(/[ \u00a0\u202f().-]/g, ""))
  .transform((value) => /^0\d{9}$/.test(value) ? `+380${value.slice(1)}` : value)
  .refine((value) => value === "" || /^\+[1-9]\d{6,14}$/.test(value));
const kved = text(120)
  .refine((value) => value === "" || /^\d{2}\.\d{2}(?:\s*[,;]\s*\d{2}\.\d{2})*$/.test(value))
  .transform((value) => value.replace(/\s*[,;]\s*/g, ", "));
const amount = text(30)
  .refine((value) => value === "" || /^(?:\d+|\d{1,3}(?:[ \u00a0\u202f]\d{3})+)(?:[.,]\d{1,2})?$/.test(value))
  .transform((value) => value.replace(/[ \u00a0\u202f]/g, "").replace(",", "."))
  .refine((value) => value === "" || Number(value) <= 1_000_000_000);
export const profileDetails = z.object({
  contactName: text(160).optional(), phone: phone.optional(),
  website: text(300).refine((value) => { if (!value) return true; try { return ["http:", "https:"].includes(new URL(value).protocol); } catch { return false; } }).optional(),
  legalForm: z.enum(["", "idea", "fop", "company", "ngo"]).optional(),
  registrationYear: text(4).refine((value) => value === "" || (/^\d{4}$/.test(value) && Number(value) >= 1900 && Number(value) <= new Date().getFullYear())).optional(),
  industry: text(160).optional(), kved: kved.optional(), city: text(120).optional(),
  teamSize: text(7).refine((value) => value === "" || (/^\d+$/.test(value) && Number(value) <= 1_000_000)).optional(),
  teamExperience: text(1500).optional(), grantExperience: text(1500).optional(), fundingPurpose: text(2000).optional(),
  requestedAmount: amount.optional(), ownContribution: amount.optional(),
}).strict();
export type ProfileDetails = z.infer<typeof profileDetails>;
