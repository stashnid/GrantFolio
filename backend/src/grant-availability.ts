import type { GrantCatalogEntry } from "./grant-catalog-data.js";
export function isGrantAvailable(
  program: GrantCatalogEntry,
  now = new Date(),
): boolean {
  if (program.reviewStatus === "needs-review" || program.programKind === "program") return false;
  const a = program.availability;
  if (!a || a.state !== "open") return false;
  const time = now.getTime();
  if (
    !Number.isFinite(time) ||
    !Number.isFinite(Date.parse(a.checkedAt)) ||
    Date.parse(a.checkedAt) > time ||
    !Number.isFinite(Date.parse(a.validUntil)) ||
    Date.parse(a.validUntil) <= time
  )
    return false;
  if (
    a.startsAt &&
    (!Number.isFinite(Date.parse(a.startsAt)) || Date.parse(a.startsAt) > time)
  )
    return false;
  if (a.deadlineAt)
    return (
      Number.isFinite(Date.parse(a.deadlineAt)) &&
      Date.parse(a.deadlineAt) > time
    );
  return a.rolling === true;
}
