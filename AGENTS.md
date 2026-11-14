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
