/** Curated official-page observations, not a grant eligibility rules engine. */
export const grantSourceContext = {
  program: "Власна справа",
  checkedAt: "2026-11-14",
  currentRoundOpen: null,
  eligibilityRulesReviewed: false,
  officialFormReviewed: false,
  sources: [
    {
      url: "https://diia.gov.ua/services/zapochatkuvannia-ta-masshtabuvannia-vlasnoi-spravy/",
      title: "Започаткування та масштабування власної справи — Дія",
      observations: [
        "На перевіреній сторінці зазначено завершення етапу 27.10.2026. Чинний відкритий прийом не підтверджено.",
        "Онлайн-подання передбачає вхід до кабінету Дії, заповнення заявки, додавання бізнес-плану за формою у PDF і підписання електронним підписом.",
        "Офіційна сторінка містить посилання на приклад бізнес-плану. Вміст форми ще не звірено; TXT-чернетка GrantFolio не замінює цю форму.",
        "Серед напрямів витрат на сторінці наведено обладнання, оренду приміщень, цифровізацію, маркетинг та облаштування робочих місць. Дозволеність конкретної витрати потребує перевірки повних чинних правил.",
      ],
    },
  ],
} as const;
