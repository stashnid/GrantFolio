# GrantFolio: instructions for people and AI agents

## Start every session

1. Inspect `git status`, then fetch the remote or verify its current heads through GitHub. Review new relevant commits/branches before substantive work. Cached refs alone are insufficient. Report incomplete verification if access fails.
2. Preserve local and teammate changes. Integrate upstream safely; never use destructive reset, force push, or overwrite another agent's files to resolve divergence.
3. Read [current state](docs/STATUS.md), [decisions](docs/DECISIONS.md), [backlog](docs/BACKLOG.md), then the relevant [architecture](docs/architecture.md) or [AI research](docs/ai-model-research.md). Use the latest handoff linked from STATUS.
4. Record task, branch, base commit and owned paths in a report under `docs/agents/`. Agree ownership before parallel edits; contract changes go through the coordinating person/agent.

## Publish completed changes immediately (user instruction, 2026-11-17)

- After each completed logical change and appropriate checks, commit the task's changes and immediately push its task branch to GitHub without requesting confirmation again. This is standing user authorization for routine commits/pushes in GrantFolio, including documentation and rule updates.
- Verify fresh remote heads before publishing and preserve team/local changes. Include the task handoff and report the published branch or PR. If a check or push fails, report it accurately and resolve safe, in-scope problems.
- Keep credentials, private data and downloaded local tools out of Git. This authorization does not include force-push, destructive resets, merging PRs or deploying services.

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
- The [README product vision](README.md) is broader than the first demonstrated scenario. Do not claim every grant is supported or invent an official template. Pilot program: Власна справа, explicitly chosen by the user on 2026-11-14; current round and official form remain unverified.
- User confirms **no training materials exist**. Model selection is provisional; never describe prompts/retrieval as trained weights or claim a model is trained before a real job and evaluation.
- Paid cloud/model/training actions and billing changes need the user's authorization for the concrete scope. Planning does not authorize them.

## Implementation rules

- One TypeScript modular monolith; separate public web/private worker entrypoints. Budget arithmetic and grant rules live in deterministic code. Model output is a proposal until validated and, where needed, confirmed by the user.
- Verify Firebase ID tokens server-side. Firebase UID is opaque text. Derive ownership from identity, scope every private operation to its owner, and test isolation between two users.
- Keep private files in Cloud Storage and persistent state in PostgreSQL; never rely on the container filesystem. Long work must have durable status and bounded retries.
- Pin supported runtime/dependency versions after checking current documentation. Commit the package lockfile. Do not invent runnable commands before creating the corresponding configuration.
- Run checks appropriate to the actual change. Local React/Express application, Docker Compose, migrations and integration tests exist; cloud deployment is not complete. Each implementation PR must add real run/test/deploy instructions for what it introduces.

## Codex orchestration preference (2026-11-13)

User explicitly requests Astra as coordinator and agents using other models for execution. Follow [Codex collaboration](docs/codex-collaboration.md): Sol for focused research, Terra for implementation, independent review when warranted. Record actual model/role, bounded scope, owned paths and checks. Do not silently claim delegation when an agent was unavailable. Both teammates use Codex; GitHub files are the shared handoff.

## Delivery focus (2026-11-14)

User prioritizes finishing the prototype over additional model/provider research. Use already verified Gemini Flash-Lite as initial integration candidate; no Claude API or additional gateway setup needed now. This supersedes Opus-first as immediate implementation priority, not as a quality benchmark result. No paid calls without concrete authorization. Record first test version scope/status in docs/STATUS.md.

## Development tools: gstack, ECC, and Karpathy-inspired guidelines (2026-11-16)

**Scope: GrantFolio only (`https://github.com/stashnid/GrantFolio`).** These settings and tool choices apply exclusively within this project. Do not modify global rules, user-level configs, or settings of other projects, Codex, or Claude Code.

### 1. Karpathy-inspired principles (applied across all tasks)
1. **Think Before Coding**: Understand requirements and acceptance criteria before writing code. State assumptions and tradeoffs explicitly. Stop when confused and ask for clarification rather than guessing.
2. **Simplicity First**: Choose the simplest sufficient solution (KISS / YAGNI). No speculative generality, unrequested features, or single-use abstractions.
3. **Surgical Changes**: Touch only what is necessary for the task. Clean up only your own orphans. Match existing style and preserve surrounding code.
4. **Goal-Driven Execution**: Anchor changes to verifiable criteria (tests, typecheck, build, UI states). Use loop: brief plan → surgical implementation → verification.

### 2. Task distribution

| Area | Primary Toolkit | Skills & Usage |
|---|---|---|
| Product & feature scope | **gstack** | `/office-hours` (ideation, forcing questions), `/plan-ceo-review` (ambitious rethink) |
| Architecture & UX planning | **gstack** | `/autoplan` (comprehensive architecture, edge cases, failure modes, tests), `/plan-design-review` (designer's eye UI review) |
| Code review & diff inspection | **gstack** | `/review` (SQL safety, trust boundaries, side-effects) |
| User journey & browser QA | **gstack** | `/qa` (browser testing & atomic bug fix), `/qa-only` (reproduction report) |
| Frontend implementation | **ECC** | `frontend-patterns`, `react-patterns`, `react-testing`, `react-performance`, `accessibility`, `frontend-a11y`, `vite-patterns` |
| Backend & API implementation | **ECC** | `backend-patterns`, `api-design`, `contract-first`, `typescript-patterns`, `coding-standards` |
| Database & persistence | **ECC** | `postgres-patterns`, `database-migrations` |
| AI integration | **ECC** | `agent-self-evaluation`, `loop-design-check`, `intent-driven-development` |
| Testing & verification | **ECC** | `tdd-workflow`, `verification-loop`, `react-testing`, `e2e-testing` |
| Security & trust boundaries | **ECC** | `security-review`, `security-scan`, `safety-guard` |

*Note on upstream differences:*
- Upstream gstack subsumed `plan-eng-review` into `autoplan`.
- Upstream gstack retired `investigate`; for deep bug diagnosis, use a reproducible test + ECC testing/verification skills or the gstack `qa` loop.

### 3. GrantFolio task playbooks
- **Business profile, chat, catalog, donations/subscriptions**: ECC for implementation (components, state, API endpoints, schema); gstack for UX/user journey verification (`/qa`, `/plan-design-review`).
- **Grants ingestion and updates**: gstack for architecture review if needed; ECC for connectors, deduplication, schedule, retries, and tests.
- **Document bundle & export**: ECC for templates, data validation, and export logic; gstack for full user scenario verification.
- **Bug fixing**: Reproduce → write reproduction check/test → surgical fix → verify (typecheck, tests, build).

### 4. Workflow rules for future tasks
- Select only the skills needed for the specific task.
- Small fix: direct surgical fix + verification.
- Large feature: brief plan → surgical implementation → verification.
- Do not run duplicate planning processes or duplicate review pipelines.
- Installed agent definitions do not mean running multiple agents unless explicitly warranted.
