/** Offer next questions without contradicting a stated business status or vehicle use. */
export function advisorFollowups(seed: string, transport: boolean): string[] {
  const text = seed.toLocaleLowerCase("uk");
  const statusKnown = /(?:(?:я|ми)\s+(?:(?:ще|вже|уже)\s+)?(?:не\s+)?фоп|(?:вже|уже)\s+працюю\s+як\s+фоп|(?:зареєстрован\S*|маю)\s+(?:як\s+)?фоп|фоп\s+(?:вже|уже)\s+зареєстрован|бізнесу (?:ще )?немає|(?:ще не|не маю|планую) (?:відкрити |зареєструвати )?(?:фоп|бізнес|справ))/u.test(text);
  if (!transport && /ферм|господарств|теплиц|ягідник/u.test(text)) {
    return ["На що можна витратити кошти?", "Які вимоги до заявника?", "Як підготувати й подати заявку?"];
  }
  if (!transport) return statusKnown
    ? ["Що потрібно для заявки?", "Які умови фінансування?"]
    : ["Бізнесу ще немає", "Уже працюю як ФОП", "Що потрібно для заявки?"];
  const useKnown = /достав|перевез|особист|для себе|власного користування/u.test(text);
  const options = useKnown ? [] : ["Авто для доставки товарів", "Авто для особистих потреб"];
  if (!statusKnown) options.push("Уже працюю як ФОП");
  return [...options, "Які документи підготувати?", "Що перевірити перед купівлею авто?"];
}
