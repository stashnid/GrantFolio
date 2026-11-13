> Історичний агентський звіт. Поточні рішення: [Google Cloud архітектура](../architecture.md) і [DECISIONS](../DECISIONS.md).

# GrantFolio: AWS versus Google Cloud under permanent educational credits

Status: DONE_WITH_CONCERNS; advisory only, 12 November 2026. User confirms permanent credit accounts, not time-limited StartLab. Credit eligibility, remaining balance, IAM rights, regions and quotas remain unverified. No token inspection, provisioning, model calls or project edits occurred.

## Decision

Both clouds can host the existing TypeScript modular monolith. Keep React/Vite, one Express codebase/image, PostgreSQL repositories/UoW, private object storage, and public module contracts. Replace proposed Render/Supabase managed adapters with the chosen educational cloud; this changes providers, not the domain design.

Choose AWS if its credits cover the needed services and the team can create/pass the ECS infrastructure/execution/task roles, plus Cognito and RDS. Choose Google Cloud if those permissions or model availability are materially better there. If both accounts are equally usable, Cloud Run has fewer web-hosting/network resources to configure, a practical advantage before 19 November. Do not split app/database/model between clouds for this first prototype merely to use both credits.

## Concrete AWS composition

| Capability | AWS choice | Important detail |
|---|---|---|
| Container image | Private ECR | Build the same image for web and worker; use commit digest/tag |
| Public app + API | ECS Express Mode on Fargate | Serves compiled React and /api; creates ALB/routing/scaling infrastructure |
| HTTPS | Express Mode AWS-provided application domain | Default HTTPS URL is provided; own domain is optional, not a demo prerequisite |
| Signup/signin | Cognito User Pool + public browser app client | Enable self-registration; email+password and confirmation; no browser client secret |
| Relational state | RDS PostgreSQL, initially single-AZ if acceptable | Private access, migrations once per release, separate runtime DB role |
| Files | Private S3 bucket | Block public access, unique immutable keys; authorize before short-lived presigned download/upload |
| Long jobs | Normal ECS Fargate worker service, same image/commit | Postgres durable jobs with leases/retries/idempotency; does not depend on web request lifetime |
| Source monitoring | EventBridge Scheduler -> ECS RunTask | Same image, monitor command; scheduled bounded run, not setInterval inside web |
| Model | Bedrock adapter, only after model/region/credit access confirmed | No AgentCore/agent platform required; bounded model calls, quotas and usage records |
| Secrets and logs | Secrets Manager + CloudWatch | Runtime IAM role, no long-lived AWS keys in app or GitHub repository |
| Product email | SES, conditionally | Separate from Cognito verification emails; sandbox/identity checks can block real-user delivery |

**HTTPS verified:** ECS Express Mode supplies an AWS domain and HTTPS; a custom domain requires its own ACM/DNS setup. Standard hand-assembled ECS+ALB does not automatically give the same application-domain convenience. Do not confuse the two paths. Sources [1–3].

**App Runner:** official availability notice says no new customers from 30 April 2026; use ECS Express Mode for a new deployment rather than recommending App Runner by habit [4]. Existing-customer access is not assumed.

## Identity and authorization

Use Cognito managed login with authorization code + PKCE or its browser SDK flow; configure exact deployed callback/logout URLs. Backend validates access-token signature, issuer, expiry, token_use and app client identity; never trust ID-token claims as an unchecked API bearer token. Map verified `sub` to the existing Actor port.

Business authorization stays in services/repositories. PostgreSQL RLS can use backend-bound transaction-local actor context; RDS has no Supabase auth.uid helper, so the application policy must read the explicit app context. Runtime role is not table owner and has no BYPASSRLS. No private module tables exposed directly to browsers.

Cognito's default email configuration can send account verification without the team's own SES production account, subject to low daily limits; test real signup/reset early. It is not a general grant-notification mail service. Own SES configuration requires verified identity; SES sandbox restricts recipients and applies per-region [5–7].

## Essential roles, networking and setup

1. Deployment principal: permissions for ECR push, ECS/Express resources, networking/load balancing, RDS, Cognito, S3, secrets/logs and narrowly scoped iam:PassRole; infrastructure-as-code role creation may also be needed. Educational credits do not imply these permissions.
2. ECS execution role: image pull, CloudWatch logs and referenced secrets; separate from task role. Express Mode also requires an infrastructure role with AmazonECSInfrastructureRoleforExpressGatewayServices capabilities [2,8].
3. Web/worker task role: only the relevant S3 prefix, secret and model operations; worker may need different permissions. Do not grant Marketplace subscription management to the ordinary web task.
4. Scheduler role: trusted by scheduler.amazonaws.com; permitted to run the named ECS task definition/cluster and pass only the task/execution roles; include tagging permissions if required by the target settings [9–10].
5. VPC: RDS private, DB security group permits 5432 only from app/worker task groups. Web incoming traffic only from ALB. Worker has no inbound listener. Tasks still need outbound access for sources/model/auth/public registries as applicable. Express Mode uses public IPs for public-subnet tasks by default; private subnets require a deliberate NAT/endpoints egress solution [2,11]. Do not accidentally add a NAT gateway by assumption.
6. Production connection and storage paths use TLS and server-side encryption. Run migrations as one one-off task from the same image; app/worker starts never race to run DDL. Pin a single region supporting the required services/model and acceptable data location.
7. IaC in infra/ declares the selected resources and role relationships; README documents local DB/Docker, configuration, deployment, migration, rollback and demo URL. Use federation/OIDC for CI deployment if configured, not committed access keys.

## Comparison to the Google Cloud route

| Concern | AWS route | Google Cloud route |
|---|---|---|
| Public HTTPS | Express Mode managed app URL/ALB | Cloud Run service stable HTTPS run.app URL [12] |
| Identity | Cognito | Identity Platform/Firebase Auth, billing/credit eligibility to verify |
| SQL/files | RDS PostgreSQL + S3 | Cloud SQL PostgreSQL + Cloud Storage |
| Long work | Same-image ECS worker plus durable DB jobs | Same-image Cloud Run Jobs/Cloud Tasks; authenticated invocation and bounded jobs |
| Scheduler | EventBridge Scheduler RunTask | Cloud Scheduler -> Cloud Run Job |
| Model | Bedrock, permissions/model agreement/credit gates | Vertex AI, APIs/model/region/credit gates |
| Main complexity | IAM roles, VPC/ALB/RDS and worker lifecycle | Service accounts, API enablement, Cloud SQL connection and job invocation |

Cloud Run Jobs default task timeout is 10 minutes and configurable up to seven days for non-GPU work; that is distinct from a web request [13]. Neither platform makes an unpersisted background Promise durable. Both charge for databases and other provisioned resources even when the web app is idle; educational credit is a payment source, not a guarantee of zero spend.

## Early verification and delivery ordering

Before committing vendor: verify credit terms/balance/expiry, allowed region, role creation/PassRole, relevant service quotas, model access and real email delivery using account-safe read-only checks. A first Bedrock third-party invocation can initiate a subscription/EULA agreement; do not use it as a read-only probe. Model access depends on Marketplace prerequisites and, for some Anthropic paths, first-use details [14].

Deploy HTTPS shell + working external-user signup by 13–14 November; database/private upload and one full application path next; put it before users by 16–17 November; use 18 November for observed fixes and evidence/report. Product email waits on SES setup without pretending it works; account verification must work for the graded prototype. Exact calendar is proposed, not extra lecturer requirements.

## Official references checked

[1] https://docs.aws.amazon.com/AmazonECS/latest/developerguide/express-service-create-full.html
[2] https://docs.aws.amazon.com/AmazonECS/latest/developerguide/express-service-work.html
[3] https://docs.aws.amazon.com/AmazonECS/latest/developerguide/express-service-advanced-customization.html
[4] https://docs.aws.amazon.com/apprunner/latest/dg/apprunner-availability-change.html
[5] https://docs.aws.amazon.com/cognito/latest/developerguide/user-pool-settings-admin-create-user-policy.html
[6] https://docs.aws.amazon.com/cognito/latest/developerguide/user-pool-email.html
[7] https://docs.aws.amazon.com/ses/latest/dg/request-production-access.html
[8] https://docs.aws.amazon.com/AmazonECS/latest/developerguide/express-service-first-run.html
[9] https://docs.aws.amazon.com/AmazonECS/latest/developerguide/scheduling_tasks.html
[10] https://docs.aws.amazon.com/scheduler/latest/UserGuide/setting-up.html
[11] https://docs.aws.amazon.com/AmazonRDS/latest/gettingstartedguide/security-public-private.html
[12] https://docs.cloud.google.com/run/docs/triggering/https-request
[13] https://docs.cloud.google.com/run/docs/configuring/task-timeout
[14] https://docs.aws.amazon.com/bedrock/latest/userguide/model-access.html

Course materials inform structure, not a new platform mandate; AWS/GCP here is the user's explicit account/credit constraint. All choices conditional on account checks; no working deployment claimed.
