/** Block specialist weapons assistance across all supplied context while allowing neutral program lookup. */
export function hasSpecialistWeaponRequest(value: unknown): boolean {
  const text=JSON.stringify(value).toLocaleLowerCase("uk");
  const weapon=/(?:збро|озброєн|боєприпас|вибухів|ракет|ппо|протиповітрян|антидрон|бойов.{0,20}дрон|weapon|missile|explosive|anti.drone)/u;
  const specialist=/(?:як\s|інструкц|креслен|схем[ауи]|створити|розробити|виготов|сконстру|налаштув|запрограм|удосконал|уражен|наведенн|націлю|підрив|how to|design|construct|build|fabricat|targeting|detonat|programming)/u;
  return weapon.test(text) && specialist.test(text);
}
