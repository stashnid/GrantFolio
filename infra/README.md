# Infrastructure

Поки містить лише план; Terraform, cloud resources і deployment workflow ще не створено.

Ціль — Google Cloud. Передбачено Cloud Run, Cloud SQL PostgreSQL, private Storage, Tasks/Scheduler, Artifact Registry, Secret Manager та GitHub OIDC/WIF. Налаштування й права мають відтворюватися з версійованого коду; секрети, state і приватні billing details не комітяться.

[План запуску](../docs/cloud-deployment.md) описує перевірки перед provisioning, CI/CD, smoke і rollback. Фактичні команди, версії й URL додаються після реалізації та перевірки.
