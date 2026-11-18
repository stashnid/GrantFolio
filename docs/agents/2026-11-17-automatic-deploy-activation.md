# Активація автодеплою GrantFolio

- Агент Codex. Гілка `codex/verify-automatic-deploy` зі свіжого `origin/main` (`4fea299`).
- За згодою користувача налаштовано доступ GitHub Actions у `grantfolio-pp-ua` і злито [PR №13](https://github.com/stashnid/GrantFolio/pull/13).
- Файли у власності: цей звіт, STATUS і WORKLOG.

У Google Cloud створено `grantfolio-deployer` і провайдер Workload Identity Federation `github-main`. Скрипт налаштування успішно застосував права на реєстр `grantfolio`, вебсервіс `grantfolio-web`, завдання `grantfolio-migrate` і використання `grantfolio-runtime`. GitHub може отримати доступ лише із зазначеного workflow гілки `main`.

Перевірка CI для PR пройшла до злиття. Злиття запустило [перший production workflow](https://github.com/stashnid/GrantFolio/actions/runs/44138269816).

Обидва завдання (`verify` і `Deploy to Cloud Run`) завершилися успішно. Міграція `grantfolio-migrate-psdl4` має статус `EXECUTION_SUCCEEDED`. Ревізія `grantfolio-web-gh-44138269816-1` готова й приймає 100% трафіку. Публічний `/api/health` повернув `{"status":"ok"}`. Зміну меню профілю з `codex/simplify-account-navigation` ще не злито в `main`.
