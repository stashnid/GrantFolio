> Історичний агентський звіт. Поточні рішення: [Google Cloud архітектура](../architecture.md) і [DECISIONS](../DECISIONS.md).

# Course correction: delivery, infrastructure and NFRs

Status: advisory review completed on 12 November 2026. Only this report was written. No exercises executed, providers changed, cloud resources created, messages sent to participants, deployments made or source transcriptions edited. Read OOAD/AGENTS.md, the complete INDEX, and full relevant page sections (including control extraction) listed below. This is an application of lecture concepts, not a claim of exact completeness of the entire course archive.

## 1. What is required, what is an example

The user's supplied **prototype assignment** requires top-level `backend/`, `frontend/`, `infra/`, README product/run/deploy instructions; a deployed reachable HTTPS prototype with signup/signin; a PDF report of actual users, actual trials, feedback and changes; optional payment/donation evidence. The demo date is Thursday 19 November. It does **not explicitly mandate AWS, GCP, Terraform, Java/Spring, an LLM provider, microservices, three hosted environments or a particular diagram notation**. Do not add these to the assessment rubric or say they earn a specified mark.

There is broader course context to respect:

- Module 1 p6 lists Docker and says every lab from module 3 ships as a container; it lists JDK 17+ for modules 10–12, Terraform CLI and AWS/GCP educational accounts as course tools. This supports including our already-proposed Docker container and checking available educational credits. It does not prove every technology is mandatory for this separate prototype assignment. M1 p6 (локальне джерело курсу; не входить у clone)
- Module 2 p20 names Claude, AWS and GCP as platforms used in course modules/labs and notes faculty educational credits. This is a course platform list, not a directive to deploy GrantFolio on three providers. M2 p20 (локальне джерело курсу; не входить у clone)
- Module 7 p13 specifically says **“For Spry: Terraform”**, followed by a multi-provider rationale; the page also tells us to learn the role rather than the brand. Spry's example must not silently become GrantFolio's binding stack. M7 p13 (локальне джерело курсу; не входить у clone)
- Module 9 p12 says the building block is what is evaluated, and every AWS example can be drawn on GCP with the same boxes. Label our boxes as compute, identity, relational database, object storage and scheduler first; Render/Supabase are proposed implementations of those roles. M9 p12 (локальне джерело курсу; не входить у clone)
- Language choice is a ranked tradeoff against team skills, ecosystem, NFRs, operations and longevity. TypeScript/Express may remain our recommendation if the team is comfortable with it; Python/FastAPI examples in lectures and JDK logistics do not alone make either language mandatory for GrantFolio. M2 p10 (локальне джерело курсу; не входить у clone)

Conclusion: do not switch providers just to display course brand names. Check actual team skills, educational account availability and spending before fixing the hosting choice. If the instructor supplied an additional project-specific restriction outside the pasted assignment, that original restriction must be read before finalizing the stack.

## 2. Corrections to our planning process

Module 1 describes the order as requirements/constraints/budget → architecture/boundaries/contracts → agents implement → verify/evolve. Engineers own intentions, numeric requirements, tradeoffs and verification. Agents must not invent the workload, spending cap or sensitivity policy. M1 pp18,20–21 (локальне джерело курсу; не входить у clone)

Our plan should therefore open with a short table of **known / proposed / unresolved** items, instead of presenting every vendor or target as agreed:

| Known from assignment/product | Proposed engineering decision | Still needs a real answer |
|---|---|---|
| Two team members; 19 Nov demo; actual users and sign-in | Modular monolith; single container; managed Auth/Postgres/Storage | Team's strongest backend language and account access |
| One end-to-end supported grant program | Small checked catalog; explicit template version | Which program and exact official template |
| Persistent profiles, private documents and cases | Owner isolation, private buckets, revisioned exports | Permitted document sensitivity, retention period and hosting region |
| Monitoring and email are product goals | Limited source adapters and scheduled ingestion/digest | Source access validation, sender domain and spending cap |

These are project planning questions, not new homework sections. Module 9 pp7–8 gives the same clarify → estimate → API/data → simplest working design → failures/tradeoffs flow; p44 explicitly warns against complexity merely looking competent. M9 pp7–8 (локальне джерело курсу; не входить у clone), M9 p44 (локальне джерело курсу; не входить у clone)

## 3. NFRs: add checkable conditions, not copied lecture numbers

Module 1 pp28–30 distinguishes FR (what happens) from NFR (how well under which conditions). Its template is metric + subject + condition + threshold + measurement. Examples such as 99.9%, p95<300ms, 50,000 users and EU-only residence belong to the lecture's sample system; none should be imported as GrantFolio requirements without a reason. M1 pp28–30 (локальне джерело курсу; не входить у clone)

Add a modest NFR table with explicit evidence. The entries below are **planning proposals**, not instructor demands or existing measured results:

| Quality | Proposed concrete condition | Evidence / unresolved element |
|---|---|---|
| Access isolation | Every private API and storage operation derives owner from verified identity; A cannot read/write B's records or objects | Two-account negative tests for each private resource path, including guessed IDs. |
| Persistence | Confirmed profile, case, budget and export version survive sign-out and application redeploy | Save, redeploy, sign back in and compare saved sample values/files. |
| Failure recovery | AI timeout/refusal does not mark a document or whole package complete; user can retry without duplicate committed result | Force one failure and repeat the request/idempotency key. |
| Responsiveness | Record expected pilot concurrency and separately measure ordinary API/UI actions vs slow AI tasks | Team must agree the load and target; do not publish arbitrary production p95 claims. |
| File limits | Define maximum supported file types/size/pages and clearly reject unsupported input | Values chosen from actual template/sample documents, then boundary checks; not unrestricted upload. |
| Freshness | Show source last-success time and treat overdue/unverified grant data as uncertain | Choose interval after source tests; failure/closed-source checks; no claim of finding every possible grant. |
| Cost | Set an owner-approved total demo-period cloud/email/LLM limit and per-user/request control | A budget number is unresolved; log provider usage without personal content and stop expensive operations on limits. |
| Reproducibility | The second team member can run and deploy the documented version from a fresh checkout without tribal console knowledge | Clean-setup rehearsal; list any manual account/domain prerequisites honestly. |

This is deliberately not a load-testing, security-audit or analytics project. Use only checks that substantiate the chosen architecture and actual prototype behavior. The course lists broad quality attributes; the current assignment does not require implementing every lecture category at production scale.

## 4. Infrastructure: Dockerfile is not the whole IaC story

The initial delivery plan already had Docker, Render Blueprint and Supabase migrations. That is a good starting point, but **must not be described as fully reproducible infrastructure if database/Auth/Storage/scheduler configuration still exists only in the provider dashboard**.

Module 7 p6 defines IaC as declarative, idempotent, planned before apply, versioned/reviewed and parameterized. It distinguishes cloud provisioning from machine configuration; Dockerfile primarily describes the application runtime and does not provision all external services. M7 p6 (локальне джерело курсу; не входить у clone)

Practical changes to `infra/` and deployment design:

1. Keep a reproducible multi-stage container build with pinned dependencies and the same artifact used locally, in CI and at the demo.
2. Keep the actual provider service definition, health check, schedule and variable names in versioned declarative files. Maintain one authoritative SQL migration/seed history and versioned storage/access policies.
3. Record exact bootstrap steps for provider account, SMTP sender/domain, auth redirect URLs, external credentials and any settings not supported by the chosen declarative tooling. This is an explicit reproducibility gap until automated; do not hide it behind an empty Terraform folder.
4. If we select Terraform for stronger alignment with Module 7, implement a **small real** plan for the actual chosen services after checking provider support. Do not add HCL for AWS resources that the application does not use merely to resemble lecture slides. The pasted rubric allows a different deployment definition; Terraform remains an engineering choice.
5. Keep dev and demo credentials/data separate. Local development + one hosted demo is sufficient for this prototype unless a real requirement justifies a third environment. Module 7 pp14–15 explains why environment data, sizes and permissions differ; it does not require every student prototype to pay for the example's three full cloud environments. M7 pp14–15 (локальне джерело курсу; не входить у clone)
6. If Terraform is used, remote encrypted/access-controlled state with locking and a separate state per environment is part of operating it. State and secrets never go in git; pin providers/modules; review replacement/deletion operations and apply the reviewed saved plan through the controlled release process. These are conditions of using Terraform safely, not optional decorative files. M7 pp9,11–12 (локальне джерело курсу; не входить у clone), M7 pp19–20 (локальне джерело курсу; не входить у clone)

The lesson's summary is that the diagram should correspond to files that can recreate it. In our plan, each deployment box should point to its actual configuration or an explicitly listed manual prerequisite. M7 p21 (локальне джерело курсу; не входить у clone)

## 5. Diagrams to show the user

OOAD/AGENTS.md records the user's explicit preference for readable visual blocks/arrows and a rendered Mermaid/C4-style diagram when helpful. Keep the final visual blueprint immediately alongside the explanation rather than ASCII art only.

Recommend two short diagrams:

- **Context/deployment:** entrepreneur browser → HTTPS application container (frontend assets + API modules) → identity / relational data / private object storage; API → LLM provider; external scheduler → ingestion+mail command → official sources and SMTP. Mark sensitive-data and server-secret boundaries and distinguish proposed vendor names in subtitles. `backend/` and `frontend/` source folders are not automatically separate deployed processes.
- **One scenario sequence:** sign in → confirm business facts → match catalog → create case → upload → extraction proposal → user confirmation → deterministic budget → generation/export. Add failure branches for unsupported file and model timeout, and show change of price invalidating previous draft/export readiness.

Each new box must have a reason and an owner. Module 9 pp14,44–45 supports simplest-first diagrams, explicit failure behavior and verbalized tradeoffs; its cases are patterns to adapt, not diagrams to copy verbatim. M9 p14 (локальне джерело курсу; не входить у clone), M9 pp44–45 (локальне джерело курсу; не входить у clone)

## 6. Seven-day schedule corrections

Keep the previous timeline's early deploy and 16–18 November user window. Add course-driven checks to those same days; do not expand the delivery into a new academic assignment:

- **12 Nov:** clarify known/proposed/unresolved requirements, choose the one supported grant/template, draw role-first boundaries and agree hosting budget/skills. Architecture precedes product code.
- **13 Nov:** containerized walking skeleton, real external signup/signin and HTTPS; record cloud bootstrap/secret/redirect settings. This is the first deployment and second-person setup check, not a late polishing task.
- **14 Nov:** profile → catalog → saved case → deterministic budget; migrations and ownership rules under version control.
- **15 Nov:** one uploaded document through confirmation, AI draft, price-change invalidation/revision and export; run the meaningful isolation/recovery checks. If duration requires async jobs, introduce a justified job boundary rather than copying the lecture's whole queue ecosystem.
- **16–17 Nov:** real user sessions and fixes, including actual onboarding trouble and slow/error paths. Recruit people earlier in parallel. Record actual outcomes only.
- **18 Nov:** repeat a clean deployment/setup rehearsal with the other team member, freeze known-good demo, finish factual report and README; verify assessor access to private repository and demo.
- **19 Nov:** fresh external signup and stored-case check, show the working scenario and feedback-driven changes, each member submits repository URL + running URL + same final PDF.

For this deadline the primary tradeoff remains breadth versus completion: one useful supported program, documented real limits, actual users and a reliable demo are preferable to extra cloud brands, an unused event bus or unimplemented Terraform scaffolding. This conclusion follows the constraint-based method in M1 pp27,31 and incremental reasoning in M9 pp7,44–45; it is our recommendation, not a newly invented grading condition. M1 p27 (локальне джерело курсу; не входить у clone), M1 p31 (локальне джерело курсу; не входить у clone)

## Sources actually read

- `OOAD/AGENTS.md`; `course-materials/INDEX.md`.
- Module 1: pp6,18,20–21,27–31, full page sections.
- Module 2: pp10,20, full page sections (additional direct check of stack/course-platform wording).
- Module 7: pp4,6,9,11–15,19–21, full page sections; re-read pp13–14 separately after a tool output truncation.
- Module 9: pp7–8,12,14,44–45, full page sections.

No lecture examples, SQL, shell commands, homework instructions or exercises were executed. No new sources were added to or edits made in the OOAD course archive.
