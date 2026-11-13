# Бізнес-юридичне дослідження моделей

Дата: 13.11.2026. Base: f116c92, гілка docs/anthropic-assistant-plan. Fresh fetch успішний, нових командних комітів не було, дерево до змін чисте.

Astra координував і перевірив первинні model cards/benchmark abstracts. Sol (`gpt-6.1-sol`) перевірив Opus/Sonnet/Fable, провайдерські порівняння, API search/fetch і платформні відмінності. Terra (`gpt-6.1-terra`) перевірив LegalBench, FinanceBench, українські дослідження та запропонував дизайн оцінювання. Робота read-only; файли інтегрував координатор.

Виявлено: Opus обґрунтований кандидат, але не доведений переможець українських грантів; Sonnet близький у деяких професійних benchmark, Fable сильніший в окремих пошукових оцінках. Multi-Legal-Bench v3 виправляє старі результати; пошукові snippets можуть бути застарілі. Повних знань актуального права у вагах не доведено.

Підсумок: docs/business-legal-model-selection.md; оновлено STATUS/DECISIONS/BACKLOG/README. Внутрішні посилання і whitespace перевіряються перед комітом; реального model benchmark/paid calls/training немає. Наступне — підготовка перевірених кейсів і кошторису.
