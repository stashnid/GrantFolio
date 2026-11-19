# Перевірка живої оплати на банку

- Автор: Codex Sol, 19.11.2026. Гілка `codex/project-start-flow`, база `ad50ab1`; свіжий remote mainc526c90 перевірений. Scope: read-only Cloud Run/billing/logs/summary; один явно неплатіжний HTTP POST для перевірки handler. Owned paths: цей report, STATUS, WORKLOG.
- Production enabled=true; live `grantfolio-web-gh-44469339066-1` traffic100.
- HTTPS health200, секретний webhook GET200, summary200. Ledger має 3 confirmed транзакції по500 копійок, sum1500 копійок. Серверні confirmed логи: 18.11 о22:47:56,22:49:34,22:51:52 за Києвом. Також є ignored операції; це не зараховані оплати.
- 19.11 о07:13:29 за Києвом POST webhook отримав500 на попередній ревізії `grantfolio-web-gh-44394811752-1`; platform text: «The request failed because billing is disabled for this project.» Запит не дійшов до handler, jar_payment log для нього відсутній. Не відомо, яку суму/код він містив: request bodies не журналюються.
- Поточний billingEnabled=True. Явно неплатіжний POST `{type:GrantFolioHealthCheck}` повернув200, не створює операції/entitlement. Це доводить доступність handler зараз, але не нову доставку банком.
- Personal API token відсутній у агента, поточна webHookUrl у Monobank не перевірялась. Після platform failure власнику рекомендовано повторно виконати `make mono-webhook`, потім власноруч переказ5грн з кодом і звірити confirmed event/access. Нова банківська транзакція не виконувалась; webhook registration не змінювалась під час перевірки. Якщо попередній платіж пропущено, перед повторним переказом треба звірити виписку і відновити доступ за фактом, не змушувати платити двічі.
- Конфіденційні коментарі, секрет URL, personal token, повна відповідь client-info й баланси не включені у report.
