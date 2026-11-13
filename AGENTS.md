# GrantFolio: instructions for people and AI agents

## Start every session

1. Inspect `git status`, then fetch the remote or verify its current heads through GitHub. Review new relevant commits/branches before substantive work. Cached refs alone are insufficient. Report incomplete verification if access fails.
2. Preserve local and teammate changes. Integrate upstream safely; never use destructive reset, force push, or overwrite another agent's files to resolve divergence.
3. Read [current state](docs/STATUS.md), [decisions](docs/DECISIONS.md), [backlog](docs/BACKLOG.md), then the relevant [architecture](docs/architecture.md) or [AI research](docs/ai-model-research.md). Use the latest handoff linked from STATUS.
4. Record task, branch, base commit and owned paths in a report under `docs/agents/`. Agree ownership before parallel edits; contract changes go through the coordinating person/agent.

## Shared context is part of the work

- Use task branches and pull requests after this documentation bootstrap. Re-fetch before publishing; resolve upstream changes without losing team work. Do not publish merely because this file describes a workflow: follow the user's authorized scope.
- Update the task report at meaningful milestones, including partial results, failed checks and blockers. At handoff, update STATUS and WORKLOG; update DECISIONS/BACKLOG when they change. Use the [report template](docs/agents/TEMPLATE.md).
- Record observed actions, decisions, evidence, files, checks and next steps. Do not depend on another assistant having access to this chat or local tool history. Private internal reasoning and raw transcripts are not needed.
- `STATUS.md` describes observed implementation. `architecture.md` is the current technical plan. Dated agent reports and `docs/archive/` preserve alternatives; they do not override current decisions. Distinguish accepted user decisions from engineering proposals and unverified claims.
- Keep repository links relative and usable on a teammate's clone. Store credentials, account balances, personal uploads, training data with personal information, browser sessions and local course archives outside Git.

## Product and delivery boundaries

- Deployment cloud: **Google Cloud**, explicitly selected by the user. React/TypeScript/Express and the service mapping are the current implementation proposal, not completed code.
- Read [the original assignment](docs/assignment.md) before finalizing coursework. Deadline: Thursday **19 November 2026**. Required: backend/, frontend/, infra/, informative run/deploy README, deployed HTTPS sign-up/sign-in, factual PDF about actual user feedback and changes. Real payment/donation evidence is an optional bonus.
- OOAD materials are optional design guidance. Do not require a course-material index, add academic methods or turn examples into mandatory architecture.
- The [README product vision](README.md) is broader than the first demonstrated scenario. Do not claim every grant is supported or invent an official template. First program remains to choose.
- User confirms **no training materials exist**. Model selection is provisional; never describe prompts/retrieval as trained weights or claim a model is trained before a real job and evaluation.
- Paid cloud/model/training actions and billing changes need the user's authorization for the concrete scope. Planning does not authorize them.

## Implementation rules

- One TypeScript modular monolith; separate public web/private worker entrypoints. Budget arithmetic and grant rules live in deterministic code. Model output is a proposal until validated and, where needed, confirmed by the user.
- Verify Firebase ID tokens server-side. Firebase UID is opaque text. Derive ownership from identity, scope every private operation to its owner, and test isolation between two users.
- Keep private files in Cloud Storage and persistent state in PostgreSQL; never rely on the container filesystem. Long work must have durable status and bounded retries.
- Pin supported runtime/dependency versions after checking current documentation. Commit the package lockfile. Do not invent runnable commands before creating the corresponding configuration.
- Run checks appropriate to the actual change. Currently this is a documentation baseline: no application build, test suite, container or Terraform configuration exists. Each implementation PR must add real run/test/deploy instructions for what it introduces.

## Codex orchestration preference (2026-11-13)

User explicitly requests Astra as coordinator and agents using other models for execution. Follow [Codex collaboration](docs/codex-collaboration.md): Sol for focused research, Terra for implementation, independent review when warranted. Record actual model/role, bounded scope, owned paths and checks. Do not silently claim delegation when an agent was unavailable. Both teammates use Codex; GitHub files are the shared handoff.


## Development tools: ECC, gstack and Karpathy principles (2026-11-13)

**Scope: this repository only.** These tool choices do not apply to unrelated chats or projects. Keep ECC disabled at user level; the trusted project .codex/config.toml enables it here. Use project-local gstack skill copies; the setup guide explains global exclusions.

User selected ECC for development after planning with gstack. Keep the existing accepted plan and the decision/proposal distinctions in STATUS, DECISIONS and architecture.md. Both teammates must follow the [shared Codex setup and session workflow](docs/codex-setup.md); do not assume a teammate has another machine's plugins or global instructions.

| Area | Primary toolkit | Use |
|---|---|---|
| Product discovery, scope and plan review | [gstack](https://github.com/garrytan/gstack) | office-hours/autoplan only when planning is requested; preserve agreed scope |
| React/TypeScript frontend, Express backend, API and PostgreSQL implementation | [ECC](https://github.com/affaan-m/ECC) | Relevant coding-standards, frontend-patterns, backend-patterns, api-design, postgres-patterns and database-migrations guidance |
| Unit/integration tests, build repair, focused code/security review | ECC | Relevant testing, tdd-workflow, verification-loop and security-review skills; run checks appropriate to the change |
| Integrated user journeys and visual quality | gstack | qa for fixes, qa-only for reports, design-review for interface review; avoid repeating checks already sufficient |
| Release preparation, PR and deployment | gstack | ship / land-and-deploy only within explicit user authorization and project billing constraints |
| Research, data or ML tasks | ECC where relevant | Select specialist skills only for requested tasks; installation does not authorize model training or evaluation spend |
| Every implementation task | [Karpathy-inspired principles](https://github.com/multica-ai/andrej-karpathy-skills) | Explicit assumptions, simple solutions, surgical changes and verifiable completion |

- Read the selected installed SKILL.md and its required references before use; the table describes responsibilities, not a claim that every named skill is installed or certified on this host.
- For the current GCP proposal, adapt generic ECC guidance to the existing Cloud Run/Firebase/PostgreSQL/Storage plan. Do not silently switch cloud, framework, identity model or product model provider.
- For Firebase auth and private data, preserve server-side identity and ownership checks and two-user isolation tests. Keep budget arithmetic deterministic. ECC templates do not override project contracts.
- Use one primary workflow per stage. Do not run a second planning/review/release pipeline just because it exists in the other toolkit. The Codex model/agent preference above remains in effect; do not import Claude-specific agent/model assumptions from ECC.
- No automatic continuous learning, additional MCP startup or hook-trust changes as part of the initial install. Use only relevant skills; assess automation separately when needed. Native Codex plugin installation is per-machine, so teammates must install their own copy.

## Design quality and downloaded references (2026-11-13)

User requests a competitive, comfortable, carefully designed interface. Follow [design quality](docs/design-quality.md). Downloaded references are project-local under `.local/design-references/`; [manifest](docs/design-references.json) records upstream URLs and pinned versions. Read the relevant skill before applying it, use one primary workflow per stage, and adapt landing-page conventions to GrantFolio's document/budget workflows. Downloading is not global installation. Validate real Ukrainian content, responsive layouts, keyboard access, and empty/loading/error states; do not claim design quality merely because a skill was used.
