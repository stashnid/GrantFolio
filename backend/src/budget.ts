import { z } from "zod";
export const itemSchema = z
  .object({
    name: z.string().trim().min(1).max(160),
    quantity: z.number().int().min(1).max(1000000),
    unitPriceKopecks: z.number().int().min(0).max(1000000000),
  })
  .strict();
export const commandSchema = z
  .object({
    expectedRevision: z.number().int().min(0).max(2147483646),
    idempotencyKey: z.string().uuid(),
    items: z.array(itemSchema).max(100),
  })
  .strict();
export type Item = z.infer<typeof itemSchema>;
export function totalKopecks(items: Item[]): number | null {
  let total = 0;
  for (const item of items) {
    const line = item.quantity * item.unitPriceKopecks;
    total += line;
    if (!Number.isSafeInteger(line) || !Number.isSafeInteger(total))
      return null;
  }
  return total;
}
