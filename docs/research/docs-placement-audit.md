# Where information belongs: an audit of the repo's Markdown against industry practice

Researched 2026-10-11 for the owner, who found that information keeps landing in the wrong document: ADRs about how the agent train works and about UI choices and implementation details, and a `SECURITY.md` bullet plus a threat-model row for every new project data file (for example `script-prep.json`). Point-in-time note: the counts are for `main` at `02cf2d4`.

**Question.** For each document type in this repo, what does industry practice say belongs in it; which items in the repo's 638 tracked Markdown files are in the wrong place; what in the repo's instructions and gates puts them there; and what plan stops it and moves them?

**Method.** The yardstick is external practice only (section 1, every claim with its URL). The repo's own `CLAUDE.md`, `.claude/`, `docs-style`, ADR README and template were treated as evidence to audit, not as the standard. Every file from `git ls-files '*.md'` was classified by script plus reading: all 367 ADRs were read (heading, Status, Context, Decision) and given one category each (appendix A); all 27 `SECURITY.md` scope bullets and all 110 threat-model rows were classified (appendix B); the other 271 files were classified from their outline plus a read of every grep hit in context. Classification is one reviewer's judgement against the stated test; borderline calls are listed where they matter.

This note changes nothing. Part A and Part B are a plan for later slices. ADR findings are recommendations for the owner's post-release ADR audit, not actions.

## Headline numbers

| Finding | Count |
| --- | --- |
| ADRs that record an architecturally significant decision (structure, dependencies, interfaces, platform, persistence strategy, security architecture) | 89 of 367 (24%) |
| ADRs that record a construction technique (CI, tests, release pipeline): ADR-worthy under Nygard's definition | 38 (10%) |
| ADRs that are UI or product behaviour | 92 (25%) |
| ADRs that are implementation detail (a threshold, a field, one function's rule, an error code) | 86 (23%) |
| ADRs that are visual design-system rules | 37 (10%) |
| ADRs that describe a data file's location, shape or lifetime | 15 (4%) |
| ADRs that record process, docs workflow or the agent train | 10 (3%) |
| ADRs that bundle several unrelated decisions | 63 |
| `SECURITY.md` scope bullets that are a data file the app writes and reads back, or a privacy default | 12 of 27 |
| `SECURITY.md` scope bullets that are real vulnerability scope but carry feature behaviour | 4 of 27 |
| Threat-model rows for an app-written data file read back by the same user's app | 14 of 110 |
| Threat-model rows that are product consent rules, metrics, open questions or a UX defect, not a threat | 11 of 110 |
| Words in the threat model's Status line, a change log of 88 row edits | 2,730 |
| Project data files the app writes, and documents that list them all | ~25 files, 0 documents |
| Data files documented only in an ADR, the threat model or `SECURITY.md` | 6 |
| Product docs (outside `.claude/` and `CLAUDE.md`) written to or about agents (coordinator, worker, slice, skill, session) | ~55 files, including 15 of 15 PRDs |
| Whole documents in `docs/` that are agent operating instructions | 4 (`agent-train.md`, the agent-delivery PRD, the mock's `ARCHITECTURE.md`, `studio2-work-plan.md`) |
| Architecture docs that are close to pure architecture description | ~5 of 28 (the other 23 mix in decisions, how-tos, PRD sections, reference data or UI specs) |
| Research notes that are living specs, runbooks, trackers or throwaway audits rather than dated findings | 18 of 73, plus 6 agent briefs and registers under the mock |

## 1. Industry standards by document type

**How the sources were read.** The research proxy reached GitHub, `code.claude.com`, `anthropic.com`, `microsoft.com` and `developer.apple.com` only. Where a canonical page is built from a public repository, the repository source was fetched and is cited beside the canonical URL. Claims marked *(search summary)* come from a search result's summary of the page, not the page itself; treat them as lower confidence. Nygard's post was read in two full-text copies on GitHub.

### 1.1 Architecture decision records

- **Purpose.** Nygard: "We will keep a collection of records for 'architecturally significant' decisions: those that affect the structure, non-functional characteristics, dependencies, interfaces, or construction techniques." ([Nygard 2011](https://cognitect.com/blog/2011/11/15/documenting-architecture-decisions), read in the [obvious playbook copy](https://raw.githubusercontent.com/obvious/engineering-playbook/master/system-design-and-architecture/how-to-adr.md)). adr.github.io: "An Architectural Decision (AD) is a justified design choice that addresses a functional or non-functional requirement that is architecturally significant"; an ASR "has a measurable effect on the architecture and quality of a software and/or hardware system"; an ADR "captures a single AD and its rationale" ([adr.github.io](https://adr.github.io/), [source](https://raw.githubusercontent.com/adr/adr.github.io/main/index.md)). AWS lists the same scope as Nygard *(search summary)* ([AWS Prescriptive Guidance](https://docs.aws.amazon.com/prescriptive-guidance/latest/architectural-decision-records/adr-process.html)). arc42 section 9: "Important, expensive, large scale or risky architecture decisions including rationales" ([arc42 section 9 source](https://raw.githubusercontent.com/arc42/arc42-template/main/EN/adoc/09_architecture_decisions.adoc)).
- **What belongs.** Title, Context ("value-neutral ... simply describing facts"), Decision ("We will ..."), Status, Consequences ("All consequences should be listed here, not just the 'positive' ones") (Nygard). MADR adds Considered Options, Decision Outcome ("Chosen option ... because"), and an optional Confirmation section: "how the implementation / compliance of the ADR can/will be confirmed ... fitness function" ([MADR template](https://raw.githubusercontent.com/adr/madr/develop/template/adr-template.md)).
- **What does not belong.** Anything that is not one significant decision: "One ADR describes one significant decision for a specific project" (Nygard); "Each ADR should be about one AD, not multiple ADs" ([Henderson](https://raw.githubusercontent.com/joelparkerhenderson/architecture-decision-record/main/README.md)). Zimmermann's significance test asks about business value or risk, key stakeholder concern, unusual quality levels, external dependencies, cross-cutting impact, first-of-a-kind and past trouble *(search summary)* ([ozimmer.ch](https://ozimmer.ch/practices/2020/09/24/ASRTestECSADecisions.html)). Supporting material is linked, not embedded *(search summary)* ([Fowler](https://martinfowler.com/bliki/ArchitectureDecisionRecord.html)).
- **The other view.** adr.github.io allows "ADR usage can be extended to design and other decisions ('any decision record')", and Zimmermann has written about it *(search summary)* ([Any Decision Record?](https://ozimmer.ch/practices/2021/04/23/AnyDecisionRecords.html)). Practice is not unanimous: a project can choose a wider log. The narrow bar is the original definition and the one AWS, arc42 and Nygard use; this note applies it, and O4 asks the owner to choose.
- **Lifetime.** Append-only. "Numbers will not be reused"; "If a decision is reversed, we will keep the old one around, but mark it as superseded" (Nygard). "Don't alter existing information in an ADR ... supersede the ADR by creating a new ADR" (Henderson). An accepted ADR is not reopened, only superseded *(search summary)* (Fowler; AWS). Length: "one or two pages" (Nygard).
- **Choosing.** A decision already made, with its reason → ADR. A whole design under discussion → design doc or RFC. The exploration that informs a choice → spike note; "ADRs can also be used to document results of spikes when evaluating different technology choices" *(search summary)* ([Code-With Engineering Playbook](https://microsoft.github.io/code-with-engineering-playbook/design/design-reviews/decision-log/)). Store ADRs in source control so they "stay in sync with the code" *(search summary)* ([ThoughtWorks Radar](https://www.thoughtworks.com/radar/techniques/lightweight-architecture-decision-records)).

### 1.2 Architecture documentation and the Diataxis types

- **Purpose and content.** arc42's 12 sections: goals, constraints, context and scope, solution strategy, building blocks, runtime view, deployment view, cross-cutting concepts, decisions, quality requirements, risks, glossary ([arc42 template source](https://raw.githubusercontent.com/arc42/arc42-template/main/EN/arc42-template.adoc)). Cross-cutting concepts are "practices, patterns, regulations or solution ideas ... often related to multiple building blocks", kept central for "conceptual integrity" ([section 8 source](https://raw.githubusercontent.com/arc42/arc42-template/main/EN/adoc/08_concepts.adoc)). Solution strategy is "a short summary and explanation of the fundamental decisions ... Refer to details in the following sections" ([section 4 source](https://raw.githubusercontent.com/arc42/arc42-template/main/EN/adoc/04_solution_strategy.adoc)). C4 describes static structure at system, container, component and code levels, plus dynamic and deployment diagrams *(search summary)* ([c4model.com](https://c4model.com/)).
- **What does not belong.** "Pick only the most-needed topics" (arc42 section 8). Diataxis: explanation "tends to absorb other things ... instruction or technical description ... documentation already has other places for these" ([explanation source](https://raw.githubusercontent.com/evildmp/diataxis-documentation-framework/main/source/explanation.rst)).
- **The four Diataxis types** ([diataxis.fr](https://diataxis.fr/), [compass source](https://raw.githubusercontent.com/evildmp/diataxis-documentation-framework/main/source/compass.rst)): action plus acquisition → tutorial; action plus application → how-to; cognition plus application → reference; cognition plus acquisition → explanation. Reference: "Describe and only describe"; "the structure of the documentation should mirror the structure of the product" ([reference source](https://raw.githubusercontent.com/evildmp/diataxis-documentation-framework/main/source/reference.rst)). Explanation answers "why?" and covers "design decisions, historical reasons, technical constraints" ([explanation source](https://raw.githubusercontent.com/evildmp/diataxis-documentation-framework/main/source/explanation.rst)). How-to: "no digression, explanation, teaching" ([how-to source](https://raw.githubusercontent.com/evildmp/diataxis-documentation-framework/main/source/how-to-guides.rst)).
- **Lifetime.** Architecture docs describe the current system and are living; the decisions they cite follow ADR rules. Google design docs are written before coding, 3 to 20 pages, with goals, non-goals, trade-offs and alternatives; keeping them current afterwards is optional *(search summary)* ([Design docs at Google](https://www.industrialempathy.com/posts/design-docs-at-google/)).
- **Choosing.** How the parts fit and why → architecture (explanation). A file format, schema or setting → reference. Steps to add something → how-to. A decision → ADR.

### 1.3 PRDs, RFCs and design docs

- **Purpose.** A PRD defines the product or feature to build: assumptions, user stories with success metrics, and what is out of scope *(search summary)* ([Atlassian](https://www.atlassian.com/agile/product-management/requirements)); "purpose, features, functionality, and behavior", a living document while built *(search summary)* ([Product School](https://productschool.com/resources/templates/prd)). An RFC is for "substantial" changes that need a design process; routine fixes go through pull requests ([Rust RFCs source](https://raw.githubusercontent.com/rust-lang/rfcs/master/README.md)).
- **What does not belong.** In Rust's list of what needs no RFC: "Rephrasing, reorganizing, refactoring" and "Additions only likely to be noticed by other developers-of-rust, invisible to users-of-rust" (Rust RFCs). None of the PRD sources puts delivery scheduling, staffing or parallel-work collision tables in a PRD; that is project tracking.
- **Lifetime.** A PRD is living while the product is built. An accepted RFC is "not substantially changed"; larger changes are new RFCs (Rust RFCs).
- **Choosing.** What and why for users → PRD. How, for engineers, before building → design doc or RFC. One decision made → ADR. Who does which piece when → the tracker.

### 1.4 Security policy (`SECURITY.md`) and vulnerability disclosure

- **Purpose.** "add information about supported versions and how to report a vulnerability" *(search summary)* ([GitHub docs](https://docs.github.com/en/code-security/how-tos/report-and-fix-vulnerabilities/configure-vulnerability-reporting/adding-a-security-policy-to-your-repository)). OpenSSF: "share with downstream consumers or collaborators how the project will take in vulnerability reports and what a reporter's expectations of communication and response should be" ([OpenSSF maintainer guide source](https://raw.githubusercontent.com/ossf/oss-vulnerability-guide/main/maintainer-guide.md)).
- **What belongs.** CERT/CC's policy elements: scope ("as explicit as possible"), exceptions, safe harbor, report quality, languages, contact, timing ("an acknowledgement timeframe of 24-48 hours is common") ([CERT Guide to CVD source](https://raw.githubusercontent.com/CERTCC/CERT-Guide-to-CVD/main/docs/howto/preparation/choosing_policy.md)). ISO/IEC 29147 covers receiving reports and publishing advisories; ISO/IEC 30111 covers internal handling *(search summary)* ([ISO](https://www.iso.org/standard/92945.html)). `security.txt` points to the policy (`Contact`, `Expires` required) *(search summary)* ([RFC 9116 field registry](https://www.iana.org/assignments/security-txt-fields/security-txt-fields.xhtml)).
- **What does not belong.** No source puts threat analysis, architecture, feature behaviour or a file inventory in the policy; it is the reporter-facing contract. Handling procedures and advisories are separate artefacts (OpenSSF templates, [listing](https://github.com/ossf/oss-vulnerability-guide/tree/main/templates/security_policies)).
- **What counts as a vulnerability.** Microsoft's servicing criteria: "A security boundary provides a logical separation between the code and data of security domains", listing network, kernel, process, user, session, browser and sandbox boundaries; "components are not considered boundaries unless explicitly named as such" ([MSRC servicing criteria](https://www.microsoft.com/en-us/msrc/windows-security-servicing-criteria)).
- **Lifetime.** Living and short; current-state facts.
- **Choosing.** How to tell us → `SECURITY.md`. What can go wrong in our design → threat model.

### 1.5 Threat models

- **Purpose.** The four questions: "What are we working on? What can go wrong? What are we going to do about it? Did we do a good enough job?" ([OWASP Threat Modeling Cheat Sheet source](https://raw.githubusercontent.com/OWASP/CheatSheetSeries/master/cheatsheets/Threat_Modeling_Cheat_Sheet.md); [Shostack, four-question framework](https://shostack.org/files/papers/The_Four_Question_Framework.pdf), [Threat Modeling Manifesto](https://www.threatmodelingmanifesto.org/)).
- **What belongs.** "A clear view of trust boundaries, data flows, data stores, processes, and the external entities which may interact with the system" (OWASP cheat sheet). A trust boundary: "Boundaries show any location where the level of trust changes"; "Entry and exit points define a trust boundary" ([OWASP Threat Modeling Process source](https://raw.githubusercontent.com/OWASP/www-community/master/pages/Threat_Modeling_Process.md)). Microsoft draws boundaries where "different entities are in control" *(search summary)* ([Threat Modeling Tool](https://learn.microsoft.com/en-us/azure/security/develop/threat-modeling-tool-getting-started)); "the border between trusted and untrusted elements" *(search summary)* ([STRIDE, MSDN 2006](https://learn.microsoft.com/en-us/archive/msdn-magazine/2006/november/uncover-security-design-flaws-using-the-stride-approach)).
- **What does not belong.** "Do not add techniques only to make the model appear comprehensive" (OWASP cheat sheet). Privacy harms are a separate technique (LINDDUN), "not fully represented by STRIDE's security properties" (OWASP cheat sheet). No source puts a data inventory, retention schedule or change log in a threat model.
- **Lifetime.** Living: "maintained, updated and refined alongside the system" (OWASP cheat sheet); "Continuous refinement over a single delivery" *(search summary)* (Manifesto).
- **Choosing.** Data crossing between parties of different trust → threat model. Data the same principal writes and reads → data inventory.

### 1.6 Data inventory, retention and local data files

- **Purpose.** GDPR Article 30 requires a record of processing that includes "where possible, the envisaged time limits for erasure of the different categories of data" *(search summary)* ([Art. 30](https://gdpr-info.eu/art-30-gdpr/)). The ICO calls the record a "living document" and allows "separate retention periods ... relating to different categories" *(search summary)* ([ICO documentation guidance](https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/accountability-and-governance/guide-to-accountability-and-governance/documentation/)). NIST Privacy Framework ID.IM-P inventories systems, owners, data elements, data actions and purposes *(search summary)* ([NIST Privacy Framework](https://www.nist.gov/privacy-framework)).
- **Where local application data is documented.** No source names a dedicated document; by Diataxis it is reference (file names, locations, formats, lifetime). Platform conventions separate the classes the reference should use: Microsoft: "App data is different from user data ... The lifetime of the app data is tied to the lifetime of the app" ([Store and retrieve app data](https://learn.microsoft.com/en-us/windows/apps/develop/data/store-and-retrieve-app-data), [source](https://raw.githubusercontent.com/MicrosoftDocs/windows-dev-docs/docs/hub/apps/develop/data/store-and-retrieve-app-data.md)); Apple: Application Support holds "all app data files except those associated with the user's documents" ([File System Programming Guide](https://developer.apple.com/library/archive/documentation/FileManagement/Conceptual/FileSystemProgrammingGuide/FileSystemOverview/FileSystemOverview.html)); XDG separates data, config, state and cache *(search summary)* ([XDG Base Directory](https://specifications.freedesktop.org/basedir/latest/)).
- **What does not belong.** Attacker analysis; the GDPR risk assessment (DPIA) is separate from the inventory *(search summary)* ([Vanta on DPIA and RoPA](https://help.vanta.com/en/articles/12333575-understanding-dpias-and-ropas-for-gdpr-compliance)). No source says "keep retention out of the threat model" in those words; the split is inferred from how the artefacts are defined.
- **Lifetime.** Living, reviewed regularly.
- **Choosing.** What data, where, why, how long → inventory or data-files reference. What can go wrong at a boundary → threat model.

### 1.7 README, CONTRIBUTING, CHANGELOG, Conventional Commits

- **README.** "What the project does; Why the project is useful; How users can get started; Where users can get help; Who maintains and contributes"; "should only contain information necessary for developers to get started using and contributing" ([GitHub, About READMEs source](https://raw.githubusercontent.com/github/docs/main/content/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/about-readmes.md)). Living.
- **CONTRIBUTING.** "communicate how people should contribute ... help them verify that they're submitting well-formed pull requests" ([GitHub, contributor guidelines source](https://raw.githubusercontent.com/github/docs/main/content/communities/setting-up-your-project-for-healthy-contributions/setting-guidelines-for-repository-contributors.md)); environment setup, how to run tests, types of contribution ([opensource.guide source](https://raw.githubusercontent.com/github/opensource.guide/main/_articles/starting-a-project.md)). Living.
- **CHANGELOG.** "a curated, chronologically ordered list of notable changes for each version"; "Using commit log diffs as changelogs is a bad idea" ([Keep a Changelog source](https://raw.githubusercontent.com/olivierlacan/keep-a-changelog/main/source/en/1.1.0/index.html.haml)). Append-only per release.
- **Conventional Commits.** Structured commit messages that tools read; `fix:` → patch, `feat:` → minor, `!` → major ([Conventional Commits 1.0.0 source](https://raw.githubusercontent.com/conventional-commits/conventionalcommits.org/master/content/v1.0.0/index.md)).
- **Choosing.** What changed per release → changelog or release notes, not a document's own header. Commits record each step.

### 1.8 Runbooks and operations docs

- **Purpose.** Recording best practice ahead of time in a playbook gives "roughly a 3x improvement in MTTR" *(search summary)* ([Google SRE book](https://sre.google/sre-book/introduction/)); a playbook entry per alert *(search summary)* ([SRE workbook, on-call](https://sre.google/workbook/on-call/)). A runbook is a step-by-step procedure for a repeated operational task *(search summary)* ([PagerDuty](https://www.pagerduty.com/resources/automation/learn/what-is-a-runbook/)).
- **What does not belong.** Rationale and background (Diataxis how-to: "no digression, explanation").
- **Lifetime.** Living; kept current *(search summary)* ([SRE incident management guide](https://sre.google/resources/practices-and-processes/incident-management-guide/)).
- **Choosing.** Steps an operator follows → runbook. Why the system is shaped this way → architecture.

### 1.9 User guides

- **Purpose.** How-to guides are "directions that guide the reader through a problem or towards a result" for "the already-competent user"; tutorials are lessons (Diataxis how-to and [start-here source](https://raw.githubusercontent.com/evildmp/diataxis-documentation-framework/main/source/start-here.rst)). Procedures are numbered imperative steps *(search summary)* ([Google developer style guide](https://developers.google.com/style/procedures)).
- **What does not belong.** Explanation and exhaustive reference; "if they're important, link to them" (Diataxis how-to).
- **Lifetime.** Living; tracks the current product.

### 1.10 Research notes and spikes

- **Purpose.** A spike gains "the knowledge necessary to reduce the risk of a technical approach, better understand a requirement, or increase the reliability of a story estimate"; spikes "produce information rather than working code" *(search summary)* ([SAFe spikes](https://framework.scaledagile.com/spikes)); "short, time-boxed" research *(search summary)* ([Agile Alliance](https://agilealliance.org/glossary/xp/)).
- **What does not belong.** The decision (it goes to an ADR that cites the spike; Code-With Engineering Playbook). By the same logic, living specs, runbooks and trackers are other types.
- **Lifetime.** Point-in-time. No authoritative source was found for software research-log practice beyond spikes.

### 1.11 Agent instruction files and skills

- **Purpose.** "Think of AGENTS.md as a README for agents" ([agents.md source](https://raw.githubusercontent.com/openai/agents.md/main/README.md)); "README.md files are for humans ... AGENTS.md complements this by containing the extra, sometimes detailed context coding agents need ... that might clutter a README or aren't relevant to human contributors" ([agents.md site source](https://raw.githubusercontent.com/agentsmd/agents.md/main/components/WhySection.tsx)). `CLAUDE.md`: "Keep it to facts Claude should hold in every session: build commands, conventions, project layout, 'always do X' rules"; "If an entry is a multi-step procedure or only matters for one part of the codebase, move it to a skill or a path-scoped rule" ([Claude Code memory](https://code.claude.com/docs/en/memory.md)). Copilot uses `.github/copilot-instructions.md` and path-scoped instruction files ([GitHub docs source](https://raw.githubusercontent.com/github/docs/main/content/copilot/how-tos/copilot-on-github/customize-copilot/add-custom-instructions/add-repository-instructions.md)).
- **What does not belong.** "Detailed API documentation (link to docs instead)", "Information that changes frequently", "Long explanations or tutorials" ([Claude Code best practices](https://code.claude.com/docs/en/best-practices.md)). Skills hold procedures and load on demand; "Move detailed reference material to separate files" ([Claude Code skills](https://code.claude.com/docs/en/skills.md); [Anthropic, Agent Skills](https://www.anthropic.com/engineering/equipping-agents-for-the-real-world-with-agent-skills)).
- **Lifetime.** Living and pruned: "Treat CLAUDE.md like code: review it when things go wrong, prune it regularly" (best practices).
- **Choosing.** What an agent needs that it cannot derive and a human does not → agent file. Facts both need → the human doc, linked from the agent file. Agent instructions do not go into human docs, and human docs are not addressed to agents (agents.md).

## 2. Findings

### 2.1 Coverage

| Group | Files | Classified by |
| --- | --- | --- |
| `docs/adr/` | 370 (367 ADRs, README, template, topics) | every ADR read; appendix A |
| `docs/research/` (with `mockups/**/*.md`) | 73 | outline plus grep hits |
| `docs/ui/atlas/` (generated) | 50 | header check |
| `docs/architecture/` | 30 | outline, grep hits; threat model row by row |
| `.claude/` and `CLAUDE.md` | 40 | read |
| `docs/prds/` | 16 | outline plus grep hits |
| `docs/guides/`, `docs/utilities/`, `docs/workflows/`, `docs/reference/`, `docs/design/`, `docs/operations/` | 38 | outline plus grep hits |
| Root files, `docs/README.md`, `docs/roadmap.md`, `.github/` template | 6 | read |
| `integrations/`, `sidecars/`, `apps/`, `scripts/` READMEs | 9 | read |
| `tests/fixtures/` | 10 | 7 are manuscript test inputs, not docs; 3 fixture READMEs |

### 2.2 ADRs

Test applied to each ADR (section 1.1): would reversing it restructure code across modules, or change a dependency, an interface between parts, a platform or a quality attribute? If not, it is not architecturally significant, whatever its consequences for the product.

| Category | Accepted | Proposed | Superseded or Rejected | Total | Where it belongs instead |
| --- | --- | --- | --- | --- | --- |
| ARCH: architecturally significant | 52 | 34 | 3 | 89 | stays an ADR |
| ENG: construction technique (CI gate, test strategy, release, supply chain) | 28 | 10 | 0 | 38 | stays an ADR (Nygard names "construction techniques") |
| UX: product or UI behaviour | 52 | 38 | 2 | 92 | the product spec while being built (PRD), then the user guide, the design system's interaction patterns, and tests |
| IMPL: implementation detail | 36 | 49 | 1 | 86 | a code comment or test beside the code; a reference doc when users or other components depend on it |
| VISUAL: design-system rule | 11 | 26 | 0 | 37 | `docs/design/design-system.md` |
| DATA: a data file's place, shape or lifetime | 6 | 8 | 1 | 15 | a project data-files reference (new, Part A) |
| PROCESS: docs workflow, agent train, repo housekeeping | 7 | 3 | 0 | 10 | `CONTRIBUTING.md`, operations docs, or agent instructions |
| **Total** | 192 | 168 | 7 | 367 | |

ARCH plus ENG is 127 (35%). The other 240 (65%) fail the industry test. The share falls over time: ADRs 0001 to 0116 are 51% ARCH or ENG (58 of 113), ADRs 0511 to 0861 are 15% (13 of 84). The later range is written per feature slice: one ADR per behaviour, field list or token batch.

Examples (full list with a suggested home for each in appendix A):

| ADR | Category | Why it is not an ADR by the industry test |
| --- | --- | --- |
| [0758](../adr/0758-the-agent-train-is-watched-from-outside-and-gated-by-checks-a-worker-cannot-edit.md) the agent train is watched from outside | PROCESS | how the delivery process is supervised; no software structure changes if it is reversed |
| [0760](../adr/0760-the-studio-next-mock-is-the-only-spec-for-every-page-it-covers-tokens-primitive-sizes-and-layouts-included.md) the Studio Next mock is the only spec | PROCESS | a ruling on which spec wins; a project-management rule |
| [0410](../adr/0410-the-adr-index-is-generated-from-each-adrs-heading-and-status-line-and-a-stale-index-fails-the-gate.md) the ADR index is generated | PROCESS | docs tooling |
| [0002](../adr/0002-dialog-action-button-placement.md) dialog action buttons on opposite sides | UX | one layout preference |
| [0363](../adr/0363-backspace-on-an-empty-tag-input-removes-the-last-chip.md) Backspace on an empty tag input removes the last chip | UX | one key binding of one component |
| [0720](../adr/0720-the-booth-fills-the-whole-window-and-f11-takes-the-window-fullscreen.md) the Booth fills the window and F11 takes it fullscreen | UX | window and shortcut behaviour |
| [0590](../adr/0590-the-mock-fidelity-token-batch-fills-badges-with-opaque-soft-tokens-and-names-the-mocks-sizes-and-type.md) mock-fidelity token batch | VISUAL | token values |
| [0132](../adr/0132-the-recording-check-ships-0-8-3-8-3-chosen-on-synthetic-fixtures-and-labelled-uncalibrated.md) recording check ships 0.8, 3, 8 and 3 | IMPL | default thresholds; belong beside the constants and the calibration test |
| [0861](../adr/0861-a-refused-daw-call-carries-one-code-stale-beside-its-sentence.md) a refused DAW call carries one code, `stale` | IMPL | one error code value |
| [0849](../adr/0849-script-prep-states-and-flagged-words-are-kept-in-a-project-sidecar-keyed-by-word-checked-on-read-and-cleared-when-the-manuscript-is-replaced.md) script prep states are kept in a project sidecar | DATA | a file's path, keys and when it is cleared |

Other ADR findings:

- **Bundling.** 63 ADRs hold several unrelated decisions (for example several primitives in one record, or an architecture choice plus a product rule). MADR and Nygard both ask for one decision per record (section 1.1).
- **Proposed is the steady state.** 168 of 367 are Proposed, mostly written by workers from a PRD's recommended answer ("take the PRD's stated recommendation, write the ADR with `**Status:** Proposed`", `adr-author`). Industry practice uses Proposed for a decision under review, not as the resting status of a shipped behaviour (section 1.1).
- **Partial supersession by prose.** Index rows such as 0016 ("amended by ADR 0063 ... and by ADR 0118, proposed ... the rest stands") show ADRs being patched clause by clause. That is the symptom of records that are specs: a spec is a living document, an ADR is not.
- **ADRs are the regression guard.** The ADR README says the folder exists because agents "silently reverted deliberate decisions (styling, naming, behavior)". Industry practice puts that guard in tests and lint (fitness functions), with the ADR as the reason; the repo already does this for some rules ([ADR 0046](../adr/0046-architecture-rules-taken-from-adrs-are-lint-and-test-rules.md)).
- **What moving them costs.** Code and docs depend on ADR paths: 2,422 `ADR NNNN` mentions in Go, TypeScript, Python and Lua, and 1,388 links from 129 non-ADR Markdown files. Any ADR migration has to leave the files where they are (section 5).

### 2.3 `SECURITY.md`

Industry practice (section 1.4) keeps a security policy to supported versions, how to report, what to expect, and scope. The 27 "What is in scope" bullets:

| Kind | Bullets | Count |
| --- | --- | --- |
| Real vulnerability scope, short | 1 (content leaving the machine), 2 (downloads), 3 (update), 5 (logs leaking content), 17 (release pipeline), 18 (sidecar and FFmpeg arguments), 22 (Audacity pipe), 23 (desktop shell), 24 (device input), 25 (web lookup), 26 (Merriam-Webster key) | 11 |
| Real scope, but most of the text is feature behaviour | 4 (path traversal, 640 words, including how a re-imported CSV matches rows and "a blank note column clearing a note it should leave alone, is a vulnerability"), 19 (built-in recorder), 20 (Master & QC export), 21 (REAPER file protocol, one 600-word sentence listing every command and when each screen sends it) | 4 |
| A project or user data file the app writes and reads back | 6 `prep/markup.json`, 7 `bookmarks.json`, 8 `passagemap.json`, 9 `editing/accepted.json`, 10 `marks.json`, 11 `script-prep.json`, 12 `coverage/gap-reviews.json`, 13 `suggestions.json`, 14 `delivery-profiles.json`, 15 `production/sessions.json` and `project.json` fields, 27 `stage-decisions.json` | 11 |
| A privacy default | 16 (the status report leaves out the contracted amount unless the narrator opts in) | 1 |

Each data-file bullet has the same shape: the file is in scope if it makes the app "run, open, fetch or write anything else" or "puts markup into the page", and a file "that only changes the narrator's own" data "is the documented residual risk". The first half is one generic rule for every file the app reads (input validation). The second half says the attacker is the same user editing their own file, which does not cross a security boundary: Microsoft's servicing criteria define a boundary as "a logical separation between the code and data of security domains" and list user, process, network and similar boundaries ([MSRC servicing criteria](https://www.microsoft.com/en-us/msrc/windows-security-servicing-criteria)); the threat model itself says "there is no privilege boundary between two programs a person runs". The owner's reading holds: these are data-handling and retention facts.

The "What the app does on the network" section is a privacy statement. It is accurate and short, and readers look for it beside the security policy, so it can stay; the authoritative list of outbound requests is the threat model's table.

### 2.4 Threat model

The model's structure fits practice (assets, attackers, STRIDE per boundary, residual risks, out of scope; section 1.5). Its 110 rows:

| Kind | Rows | Count |
| --- | --- | --- |
| A threat at a real boundary (network, downloaded code or data, the update, sidecar arguments, the REAPER and Audacity channels, a file from outside the app, device input, the webview, the release pipeline, the stored key) | 1a to 1h, 2a to 2g, 3a, 3b, 3d to 3g, 4a to 4h, 5a to 5e, 5g to 5o, 6a to 6h, 6j, 6l, 6q to 6s, 7a to 7d, 8a, 8b, 9a to 9c, 10a to 10c, 11a to 11c, 12a to 12d, 14a to 14c, 14e, 14f, 15a to 15f | 85 |
| of which per-command rows for one boundary (each REAPER command that moves the transport, the selection or a take, all controlled by the same folder ACL and registered names) | 5d, 5g, 5i to 5o | 9 of the 85 |
| An app-written data file read back by the same user's app | 6i, 6k, 6m, 6n, 6o, 6p, 6t, 6u, 6v, 6w, 6x, 6y, 6z, 6za | 14 |
| A product consent rule ("the app itself does X when the narrator did not ask") | 5f, 5p, 5q, 13a, 13b, 14d | 6 |
| Not a threat: a test metric (3c), open verification questions (10d, 11d), a broken-link UX case (12e), licence compliance (8c) | 3c, 8c, 10d, 11d, 12e | 5 |

Other threat-model findings:

- **The Status line is a change log.** It is 2,730 words recording 88 row additions and extensions with dates, bindings and host API numbers. A change history belongs in version control (section 1.7); the document needs only its last review date.
- **Rows carry implementation inventories.** Row 6za lists every binding, every limit (200 UTF-16 units, 4 MiB, the source-id regex) and the package. Validation limits are the data file's reference or the code's doc comment; the threat row needs the threat, the control in one line, and a pointer.
- **Rows are added per feature, not per boundary.** Practice models data flows across trust boundaries (section 1.5). All 14 data-file rows are one flow: "a file in the project folder is read back by the host". One row covers it, with the generic control (schema check, size limit, never a path or markup, stale reported not guessed) and a link to the data-files reference. Row 6m (a file that names a path the host opens) is the one variant that needs its own line, because the file drives a file open.
- **Consent rows are product principles.** "The app moves REAPER when the narrator did not ask" (5f) is a correctness and consent property with no attacker. It belongs with the consent principles ([ADR 0032](../adr/0032-analyzers-report-findings-and-never-change-audio-or-manuscript-on-their-own.md), the `design-principles` skill) and the tests that pin it. The forged-command half of the same rows (another process writes a command file) is already 5a.

### 2.5 Project data files

The app writes about 25 files under `<project>/narration-utils/` and the legacy `ManuscriptGuide/` and `TranscriptCompare/` folders, plus per-user files under `%APPDATA%\narration-utils` (settings, recents, `series.json`, `delivery-profiles.json`, `credentials.json`, the Merriam-Webster cache, logs). No document lists them. Each file is described, if at all, by the ADR that introduced it, by a threat-model row and a `SECURITY.md` bullet, or by a section of an architecture doc or a sidecar README.

| File | Only described in |
| --- | --- |
| `narration-utils/script-prep.json` | ADR 0849, threat model, `SECURITY.md` |
| `narration-utils/editing/accepted.json` | threat model, `SECURITY.md` |
| `narration-utils/proofing/renders.json` | threat model |
| `narration-utils/chapter-sync.json` | ADR 0202 |
| `narration-utils/characters/references.json` | ADR 0263 |
| `narration-utils/analysis/credits-manuscript.json` | ADR 0333 |

`docs/architecture/wire-contracts.md` "Persisted files" lists file classes and their corruption handling, not paths. A narrator cannot find out what the app keeps in their project, how to back it up, or which files are cleared when the manuscript is replaced, without reading ADRs. Section 1.6 gives the industry shape for this: a data inventory (what, where, purpose, retention) and a file-format reference.

### 2.6 Architecture docs (`docs/architecture/`, 28 files besides the threat model)

About 5 are close to pure architecture description: `codebase-map.md`, `wire-contracts.md`, `preview-suggestion.md`, `pronunciation-provider-selection.md`, `standalone-launch.md`. The others mix in:

| Content | Files | Examples | Belongs in |
| --- | --- | --- | --- |
| Decision records | 8 | `native-notifications.md` "Decisions worth remembering" (no ADR linked); `story-bible-entity-accuracy.md` "Policy: precision over recall, chosen deliberately by the user" with a quote; `provider-ports.md` "Design choices: one Go package per port ... so parallel work touched disjoint folders" | an ADR when architecturally significant, else the explanation stays with a link |
| How-to procedures | 11 | "Adding a binding" (`host-binding-concurrency.md`), "Adding an engine" (`provider-ports.md`), "Adding a quirk" (`docx-import-quirks.md`), "Writing a test" (`reaper-bridge.md`); owner REAPER checklists in `manuscript-line-identity.md` and `reaper-navigation.md` ("For the owner, in REAPER with audio") | contributor how-to beside the code (a package doc comment or README); REAPER checklists in `docs/operations/reaper-verification-pass.md` |
| PRD sections | 6 | `first-use-dependency-provisioning.md` and `manuscript-teleprompter.md` have Problem, Intended experience, Acceptance criteria; `daw-integration.md` and `findings-contract.md` have Acceptance criteria | removed once built (the repo already deletes built PRDs); open items to issues |
| Reference data or results | 9 | `storybible-import-format.md` (a file format), `script-marks.md` "The file", `model-provenance.md` (generated tables), `delivery-measurement-validation.md` "Results", `daw-integration.md` "Project-sidecar rules" | `docs/reference/` (format and data-files references); results to a dated research note |
| UI behaviour | 7 | "What the narrator sees" in `import-review.md` and `in-app-update.md`; button behaviour in `reaper-navigation.md` | the user guide page |

`manuscript-teleprompter.md` (691 lines) holds all five kinds. The `adr-author` skill causes part of this: "Proposals for future (not-yet-built) work belong in `docs/architecture/*.md` instead" (section 3).

### 2.7 PRDs (`docs/prds/`, 15 plus README)

- All 15 carry "Parallel-session compatibility" (files each phase touches and which agent sessions collide), "Slices", "Supersedes / depends on ADRs", and both "Decisions" and "Decisions Log". The template in `docs/prds/README.md` requires them: item 11, "a Parallel-session compatibility table of the files each phase touches and who else collides with them", and a `PRP Plan` column. These are delivery-plan and tracker content (section 1.3).
- [Studio Next Agent Delivery](../../.claude/skills/agent-train/references/studio-next-delivery.md) is not a product requirement: "The worker contract", "PR babysitting as a standing duty", "Session cap per slice". It is agent operating procedure.
- [Studio Next ADR Register](../prds/studio-next-adr-register.prd.md) is a register of 143 ADR keep/extend/yield verdicts and 18 owner rulings: an ADR supersession plan, not a PRD.
- Several PRDs name agents as their users: "The owner, the coordinator and the last workers" (Cutover), "Page workers (consumers) ... the coordinator" (Domain state).
- Product rules that PRDs cite live in the agent runbook: D69 (dark mode is one theme) and D98 (the mock is the only spec) are in `agent-train.md` "Owner standing rules".

### 2.8 Research notes (`docs/research/`, 73 files)

- About 38 fit: dated, one question, findings, sources.
- 18 are something else: five Studio Next audits that say a later slice deletes them ("SNQ-9 deletes this note once ..."), an owner run sheet (`studio-next-daw-spike-runbook.md`, 752 lines), two empty "results pending" templates, a regenerated tracker (`studio-next-ruling-index.md`), a policy and plan document with no date (`local-dependency-evaluation.md`, 837 lines: "License and provenance policy", "Adoption order"), a reference table a Go test mirrors (`acx-delivery-requirements.md`: "change both together"), protocols and fixture how-tos.
- Agent metadata as provenance: 16 notes carry stream or stack ids ("Stream: N-B33"), 9 a "Slice:" header, about 10 an agent's voice ("this session's egress proxy refused"), 18 an owner to-do list for #510.
- Decisions inside research: `pronunciation-provider-spike.md` ("Status: decided", "Decision"), `recording-coverage-alignment-spike.md`, `character-continuity-acoustic-trial.md`.
- `docs/research/mockups/studio-next/` is a runnable React app (352 of 365 files are not Markdown). Its `ARCHITECTURE.md` is an agent brief ("Verification (required before you report)", "Report back"); `research/studio2-work-plan.md` is an agent task list with scratchpad paths; `research/repo-compare-decisions.md` is the owner decision register 13 PRDs cite.

### 2.9 Operations docs (`docs/operations/`, 7 files)

| File | Audience | Finding |
| --- | --- | --- |
| `agent-train.md` | agents | wholly agent instructions (coordinator, worker, resume and fixer templates); also holds product policy ("Owner standing rules", "Which mocks are the spec") and contribution policy ("UI PRs show their screenshots") |
| `documentation-gates.md` | mostly agents | steps are skills ("Run doc-impact-check"), and "repeat the Docs: none line in your final message" |
| `verification-tooling.md`, `ci-and-releases.md` | humans, with agent sections | "Skill evals", Stop and SubagentStop hooks, "the agent-train coordinator reads it"; `ci-and-releases.md` is 796 lines mixing local setup (how-to), a workflow catalogue (reference) and the release runbook |
| `github-workflow.md`, `reaper-verification-pass.md`, `audacity-verification-pass.md` | humans | fit |

### 2.10 Agent instruction files and agent language in product docs

- `.claude/` (4 agents, 4 rules, 23 skills with 7 reference files) and `CLAUDE.md`: 40 files, 1,435 lines. They are in the right place and short (`CLAUDE.md` is 27 lines). Three hold product knowledge humans also need and cannot find there: `reaper-api-facts` (recorded REAPER 7.80 behaviour), `design-principles` (the rules the ADRs add up to) and `.claude/rules/ui-spec-and-screenshots.md` (D98 and the screenshot rule). Practice is that the fact lives in the product or contributor doc and the skill or rule points to it (section 1.11).
- About 55 product docs use agent vocabulary. Highest counts: the agent-delivery PRD (105 hits), `agent-train.md` (69), the rebuild PRD (68). Also all PRDs, about 25 research notes, `design-system.md` ("serialises on `docs/operations/agent-train.md`", "a page slice that needs an action appends one"), three DAW reference pages ("Each command slice flips its own row"), two architecture docs ("its adapter is a later slice"), `docs/README.md` and the user-guide index ("kept current by the doc-screenshot-sync skill"). `README.md` and `CONTRIBUTING.md` have none.
- `CONTRIBUTING.md` (44 lines) lacks the contribution rules that govern a PR here; they live in `agent-train.md`, `.claude/rules/` and `CLAUDE.md`.

### 2.11 Other groups

- **Guides** (`docs/guides/using-the-app/`, 11): fit. The only misfit is the README's skill mention.
- **Utilities** (`docs/utilities/`, 5): all mix PRD sections ("User problem", "MVP enhancements", "Acceptance and risks") with explanation and "Decisions" lists (`recording-coverage.md` links 17 ADRs). Planned work to issues; "Decisions" become a list of links.
- **Workflows** (`docs/workflows/`, 5): fit as explanation; "Success signals" and "Planned improvements" are PRD content (minor).
- **DAW reference** (`docs/reference/daw/`, 7): fits; the README's "Rules for these pages" and the slice wording are authoring and process notes.
- **Design** (`docs/design/`, 3): `design-system.md` fits apart from agent wording; `colour-and-contrast.md` keeps a history of token batches (change log); `motion-and-animation.md` is "Status: Planned" (a PRD or issue).
- **UI atlas** (`docs/ui/atlas/`, 50, generated): fits.
- **Roadmap**: "Dependency rules" are architecture principles; "Release-readiness work item" is a status report.
- **Integrations**: the three `integrations/audacity` READMEs say "Not implemented yet" while an Audacity adapter exists in `apps/desktop/internal/dawport/audacity`. Stale.
- **Fixtures**: 7 Markdown files under `tests/fixtures/` are manuscript test inputs, not docs; `audio/librivox-alice/README.md` holds "Findings from the first run (2026-09-27)", which is a research note.

## 3. Causes

Each line below is quoted from the repo and set against the practice in section 1.

### 3.1 Data files reach `SECURITY.md` and the threat model

| Where | Exact text | Why it misroutes |
| --- | --- | --- |
| `CLAUDE.md` step 6 | "a trust-boundary check (a download, the update, a sidecar's arguments, the REAPER bridge, **a file the app opens**, the release pipeline: re-read its row in `docs/architecture/threat-model.md` and update it and `SECURITY.md`" | "A file the app opens" includes every file the app writes for itself. A trust boundary is where data passes between principals of different trust (section 1.5); the app's own project files are written and read by the same user's app |
| `.github/pull_request_template.md` | "If this changes a trust boundary or what the app sends off the machine (a download, the update, a sidecar's arguments, the REAPER bridge, **a file the app opens**, the release pipeline): I re-read its row ..., updated it and bumped its review date, and updated `SECURITY.md` if the scope changed." | the same list, as a checkbox every PR must answer |
| `.claude/skills/feature-cleanup/SKILL.md` step 7 | "(... **a file type the app opens**, ...), re-read its row in `docs/architecture/threat-model.md`, update the row and bump its review date, and update `SECURITY.md`" | same |
| `.claude/skills/doc-impact-check/references/map.md` | "A trust boundary: download, update, sidecar arguments, REAPER bridge, **a file the app opens**, the release pipeline → `docs/architecture/threat-model.md` (row and review date), `SECURITY.md`" | same, as the docs-owed map |
| `.claude/skills/wire-contract-change/SKILL.md` step 7 | "**If a persisted file** or a trust boundary changed, re-read its row in `docs/architecture/threat-model.md`" | tells every new persisted file it has a threat-model row |
| `.claude/skills/docs-style/SKILL.md` | "Trust-boundary changes also owe `docs/architecture/threat-model.md` and `SECURITY.md`" | correct in itself, but with the list above it routes data files there |
| `docs/architecture/threat-model.md` header | "Bump the date above when a row is re-read against the code, not only when it changes." plus the practice of logging each change in the Status line | turns the Status line into a change log |
| Missing destination | no data-files or data-inventory reference exists | with nowhere else to describe a new file's limits and lifetime, the threat row and `SECURITY.md` bullet become its only description |
| `scripts/ci/pr-risk.mjs` | `[/^(SECURITY\.md$|docs\/architecture\/threat-model\.md$)/, 'the security policy and threat model']` | correct, but because every data-file slice now edits these two files, every such slice is labelled `risk:high` and waits for the owner. PR #1067 is held partly for threat-model row 6o (`project.json` payment fields) |

### 3.2 Non-architectural decisions become ADRs

| Where | Exact text | Industry practice it departs from |
| --- | --- | --- |
| `docs/adr/README.md` intro | "agentic refactoring sessions have silently reverted deliberate decisions (styling, naming, behavior) ... An ADR is the durable record that a future agent ... checks *before* changing something" | defines ADRs as a guard for any deliberate choice, including styling and naming; practice limits them to architecturally significant decisions and puts regression guards in tests |
| `docs/adr/README.md` rule 4 | "An ADR records a decision that was actually made and applied to the code, with a pointer to where." | no significance test anywhere in the README or template |
| `.github/pull_request_template.md` | "If this settles or changes a decision: I added or updated an ADR in `docs/adr/`." | any decision, no filter |
| `.claude/skills/docs-style/SKILL.md` rule 7 | "Record decisions in an ADR, not in prose. A 'why' paragraph with no ADR behind it is opinion. Use `adr-author`." | practice puts "why" in explanation docs and code comments too (Diataxis explanation; arc42 crosscutting concepts); only significant decisions need an ADR |
| `.claude/skills/adr-author/SKILL.md` | "In an agent-train worker stream ... a question a PRD leaves open is not left unwritten: take the PRD's stated recommendation, write the ADR with `**Status:** Proposed`" | turns every open product question in a PRD into a Proposed ADR; product questions belong in the PRD's decisions |
| `.claude/skills/adr-author/SKILL.md` | "Proposals for future (not-yet-built) work belong in `docs/architecture/*.md` instead." | sends proposals into architecture docs (the PRD sections in 2.6) |
| `.claude/skills/doc-impact-check/references/map.md` | "A decision with lasting effect → `docs/adr/` through `adr-author`" | "lasting effect" is not the industry bar; "hard to reverse and structural" is |
| `.claude/skills/design-spec-guard/SKILL.md` | "a modal's width gets 'cleaned up' back to an arbitrary value, a button row gets re-aligned" ... checks the change against `docs/adr/` | makes ADRs the place a modal's width is recorded, so workers write one per width |
| `docs/operations/agent-train.md` Lanes table and worker template | "ADR block" per lane; "ADR BLOCK: <block>. Check docs/adr/ for the next free number inside it"; slice kind `adr` | allocates ADR numbers to every lane as a normal output of a slice |
| `docs/prds/studio-next-agent-delivery.prd.md` | slice exit: "ADR written if a decision was settled"; PR body "New ADRs for review" | an ADR is expected per slice |
| `docs/prds/README.md` template | "Supersedes / depends on ADRs" section in every PRD | ties each product phase to ADR churn |
| `.claude/agents/phase-planner.md` | "Lane, model, ADR block." | same |

### 3.3 Agent content lands in product docs

| Where | Exact text | Effect |
| --- | --- | --- |
| `docs/prds/README.md` template item 11 | "the phase table (..., Parallel, Depends, PRP Plan), Phase Details, Parallelism Notes and a Parallel-session compatibility table of the files each phase touches and who else collides with them" | every PRD carries agent scheduling |
| `docs/operations/agent-train.md` and the agent-delivery PRD | slice kinds: "`spike` (writes `docs/research/` only)"; the slice issue header fields `Lane / model`, `Kind`, `Serial points used` | every spike writes a research note, and slice headers are copied into it |
| PRDs and groomer output, recorded on #989 | "Audits in four PRDs are 'a comment'; made `docs/research/studio-next-<page>-audit.md` notes (the page swap slice deletes each)" | throwaway audits become research files |
| `docs/operations/agent-train.md` placement | the coordinator's procedure lives in `docs/operations/` and holds owner standing rules | product policy (D69, D98) lives in an agent runbook and is cited from PRDs and design docs |
| `.claude/rules/ui-spec-and-screenshots.md` | "The Studio Next mock ... is the only spec (owner ruling D98, 2026-10-11)" | a product rule stored only in agent configuration |

### 3.4 No rule says what each document type is

There is no "which document for what" table anywhere. `docs-style` governs how to write, not where. The directory names (`architecture`, `research`, `operations`) are the only signal, and the skills above override them.

## 4. Part A: fix the producers

Do these before any migration, so nothing more lands in the wrong place while Part B runs. Every Part A slice touches `.claude/`, `CLAUDE.md` or `.github/`, so `pr-risk` labels each `risk:high` and the owner merges it.

### 4.1 Decision table

Proposed text for a new "Which document" section in `docs/README.md`, linked from `CONTRIBUTING.md`, `CLAUDE.md` step 6 and `docs-style`:

| If you are recording ... | Put it in | Not in |
| --- | --- | --- |
| A choice that changes the structure, a dependency, an interface between parts, a platform, a persistence strategy or a quality attribute, and is costly to reverse | an ADR (`docs/adr/`) | |
| A CI gate, test strategy or release-pipeline choice that every contributor must follow | an ADR, plus the how-to in `docs/operations/` | |
| What a page, dialog or control does, its copy, its shortcut | while being built: the PRD; once built: the user guide page, and a test | an ADR |
| A token value, size, colour or component look | `docs/design/design-system.md` | an ADR |
| A threshold, default, field, error code or one function's rule | a doc comment and a test beside the code; a reference doc if another component or a user depends on it | an ADR |
| A file the app writes: path, contents, version, limits, when it is cleared | `docs/reference/data-files.md` (new) | the threat model, `SECURITY.md`, an ADR |
| A new way untrusted data reaches the app (network, a download, a file from someone else, a new parser, a new process or channel, device input) or a new outbound request | a threat-model row; a `SECURITY.md` scope line only if a reporter needs it | |
| What leaves the machine, and what is kept and for how long | the threat model's outbound table; the data-files reference's retention column | |
| How to report a vulnerability, supported versions, scope | `SECURITY.md` | feature behaviour |
| A planned feature: problem, users, requirements, scope, open product questions | a PRD (`docs/prds/`), deleted once built | an ADR, an architecture doc |
| Which slice does what, lanes, serial points, session caps | the slice issue and #989 | a PRD, a research note |
| A dated investigation, spike or trial: question, method, findings | `docs/research/` | a living spec, a runbook, an audit for one PR |
| An audit or checklist for one PR | the PR or issue comment | a file |
| How to run, release or verify something by hand | `docs/operations/` (runbook) | an architecture doc |
| How to add a binding, an engine, a command | a doc comment or README beside the code, or a skill if only agents follow it | an architecture doc |
| How the parts fit and why (structure, runtime flows, cross-cutting concepts) | `docs/architecture/` | PRD sections, UI behaviour, how-tos |
| Instructions only agents follow | `.claude/` (skills, rules, agents) or `CLAUDE.md`, pointing to product docs for facts | `docs/` |
| What changed in a release | the release notes (generated from Conventional Commits) | a document's Status line |

### 4.2 Exact edits

**A1. Trust boundary means a boundary** (`CLAUDE.md`, `.github/pull_request_template.md`, `.claude/skills/feature-cleanup/SKILL.md`, `.claude/skills/doc-impact-check/references/map.md`, `.claude/skills/wire-contract-change/SKILL.md`, `.claude/skills/docs-style/SKILL.md`, `docs/architecture/threat-model.md` header).

- In each list, replace "a file the app opens" / "a file type the app opens" with "a file from outside the app (a manuscript, an archive, a REAPER or Audacity project, a downloaded file, a file someone else sends), or a new parser".
- Add after the list, in `CLAUDE.md`, the PR template and `feature-cleanup`: "A file the app writes and reads back in the project or user folder is a data file: add or update its row in `docs/reference/data-files.md`. It needs a threat-model row only if it names a path the host opens, a command it runs or a URL it fetches."
- `wire-contract-change` step 7: "If a persisted file changed, update its row in `docs/reference/data-files.md`. If a trust boundary changed, re-read its row in the threat model."
- Threat model header: "Bump the date when a row is re-read. Do not log changes here; the history is `git log -p docs/architecture/threat-model.md`."

**A2. ADRs need significance** (`docs/adr/README.md`, `docs/adr/template.md`, `.claude/skills/adr-author/SKILL.md`, `.claude/skills/docs-style/SKILL.md` rule 7, `.claude/skills/feature-cleanup/SKILL.md` step 5, `.claude/skills/doc-impact-check/references/map.md`, `.claude/skills/design-spec-guard/SKILL.md`, `.github/pull_request_template.md`).

- ADR README: replace the intro's framing with "An ADR records an architecturally significant decision: one that changes the structure, a dependency, an interface between parts, a platform, a persistence strategy, a quality attribute or a construction technique, and is costly to reverse." Add a "Not an ADR" list that points at section 4.1's table. Rule 4 gains: "A behaviour, a value or a look that a test, the design system or the user guide records is not an ADR."
- Template: add a one-line "Significance" field under Status ("Why this is architecturally significant"), and a "Considered options" line inside Context. An ADR that cannot fill Significance is not written.
- `adr-author` "When to use": add the significance test and the not-an-ADR list. Replace the agent-train paragraph with: "An open product question in a PRD is answered in the PRD's Decisions section (the PRD's recommendation, marked as defaulted). Write a Proposed ADR only when the question is architecturally significant." Replace "Proposals for future (not-yet-built) work belong in `docs/architecture/*.md` instead" with "Proposals belong in a PRD."
- `docs-style` rule 7: "Record an architecturally significant decision in an ADR. Record the reason for a smaller choice beside it: a doc comment, the design system, or an explanation section."
- `feature-cleanup` step 5 and the docs map row: "a decision that meets the ADR README's significance test".
- `design-spec-guard`: check against `docs/design/design-system.md` and the visual and interaction tests first; ADRs only for architecture (primitives wrapping Base UI, the token system).
- PR template: "If this settles an architecturally significant decision (ADR README, Significance): I added an ADR."

**A3. Agent content stays with agents** (`docs/prds/README.md`, `docs/operations/agent-train.md`, `.claude/agents/phase-planner.md`).

- PRD template: drop item 11's "PRP Plan" column, "Parallelism Notes" and the "Parallel-session compatibility table"; keep phases as product scope. Drop "Supersedes / depends on ADRs" in favour of a "Constraints" line that links the governing ADRs. Users are narrators and maintainers, never agents.
- Agent train: remove the "ADR block" column and the `adr` slice kind; a slice that needs an ADR takes the next number at merge (the index check already catches a collision). The `spike` kind writes a research note only when the findings outlast the slice, with a date and a question and no slice, stream or lane header (the slice issue links the note, not the other way round). Audits for one PR are a PR or issue comment.
- Worker template: "Do not write agent vocabulary (coordinator, worker, slice, session, skill) into files under `docs/`, except `docs/operations/` runbooks that a person follows."

**A4. New doc type: `docs/reference/data-files.md`.** One table per location (project folder, per-user folder, per-user cache): path, owner package, written by (binding or job), contents, schema version, size limit, validation on read, when it is cleared or replaced, safe to delete or back up. One shared paragraph states the read-back rule once (checked on read, never used as a path or markup, a stale entry is reported not moved, a corrupt file is set aside), which replaces the 14 threat-model rows and 11 `SECURITY.md` bullets. Fields follow GDPR Article 30's categories and retention, scaled to a local app (section 1.6). Gate: a `docs-impact-map.json` rule from the Go packages that own a project file (`apps/desktop/internal/persist/`, and each package that calls it) to `docs/reference/data-files.md`, with the same entry in `.claude/skills/doc-impact-check/references/map.md`.

**A5. Release history leaves documents.** No document carries a dated list of its own edits; Status lines carry a state and a last-reviewed date. Owner decision O7 covers whether to add a `CHANGELOG.md`.

**A6. One decision table.** Section 4.1 in `docs/README.md`; `CONTRIBUTING.md` links it; `CLAUDE.md` step 6 and `docs-style` link it rather than restating it.

### 4.3 Part A slices

| Slice | Owns | Depends on | Notes |
| --- | --- | --- | --- |
| PA-1 decision table and data-files reference skeleton | `docs/README.md`, `CONTRIBUTING.md`, new `docs/reference/data-files.md` (headings and the shared read-back paragraph only) | none | `risk:normal`; lets A1 and A2 link real anchors |
| PA-2 trust-boundary wording | `CLAUDE.md`, `.github/pull_request_template.md`, `.claude/skills/{feature-cleanup,doc-impact-check,wire-contract-change,docs-style}/**`, threat-model header lines 3 and 4 only | PA-1 | `risk:high` |
| PA-3 ADR significance | `docs/adr/README.md` prose (not the generated index), `docs/adr/template.md`, `.claude/skills/{adr-author,design-spec-guard}/**`, the docs-style rule 7 line, PR template ADR line | PA-1; after PA-2 for the shared files | `risk:high`; `adr-index.mjs` must still parse the README; run it |
| PA-4 agent content rules | `docs/prds/README.md` template section, `docs/operations/agent-train.md` lanes, kinds and worker template, `.claude/agents/phase-planner.md` | PA-1 | `risk:high`; coordinate with the coordinator, since the running train reads these |
| PA-5 data-files gate | `scripts/ci/docs-impact-map.json`, `.claude/skills/doc-impact-check/references/map.md`, `scripts/ci/docs-impact.test.mjs` | PA-1, PA-2 | `risk:high` (`scripts/ci` paths in the map file are not high, the skill is) |

## 5. Part B: the migration

### 5.1 Constraints that set the order

- **ADR files stay where they are.** 2,422 code mentions and 1,388 doc links name ADR paths; `adr-index.mjs` and `adr-topics.mjs` require every ADR file to keep its heading and Status line. A non-architectural ADR's content is copied to its new home; the ADR itself is re-statused only in the owner's audit (O4).
- **`docs-references.mjs --strict`** fails when a backticked repo path in a doc does not exist (ADRs, PRDs and research are skipped). A slice that moves a section updates every backticked mention in the same PR.
- **`docs-impact-map.json`** names the docs a code path owes. A slice that moves or splits a named doc updates the map and `map.md` together.
- **`lychee --offline`** checks Markdown links and anchors. A moved section leaves no dangling anchor; when other docs link an anchor, the slice updates them or keeps the heading with a one-line pointer.
- **`pr-risk`**: slices B2, B3 and B9 touch the threat model, `SECURITY.md` or `.claude/` and are `risk:high`. The rest are normal.
- **The running train.** `agent-train.md`, the PRDs and the mock are read by live workers. Slices that move them run between waves, with the coordinator's agreement.

### 5.2 Slices, in order

| # | Slice | Owns | Depends on | Moves | Gated by |
| --- | --- | --- | --- | --- | --- |
| B1 | Fill the data-files reference | `docs/reference/data-files.md` | PA-1 | a row for each of the ~25 project files and the per-user files, taken from the code (`persist` callers) and checked against the 15 DATA ADRs, threat rows 6i to 6za, `SECURITY.md` bullets 6 to 16 and 27, `daw-integration.md` "Project-sidecar rules", `script-marks.md` "The file", `wire-contracts.md` "Persisted files", the two sidecar READMEs' "Project files" | none |
| B2 | Threat model: collapse data-file rows | `docs/architecture/threat-model.md` | B1, PA-2 | rows 6i, 6k, 6n, 6o, 6p, 6t, 6u to 6za become one row ("a file the app wrote is read back") linking B1; 6m keeps a short own row (the file names a path the host opens). Status line becomes "reviewed <date>". Rows 3c, 10d, 11d, 12e move to issues; 8c moves to the licence section of `README.md`; consent rows 5f, 5p, 5q, 13a, 13b, 14d go per O6 | O1, O6; `risk:high` |
| B3 | `SECURITY.md`: scope, not features | `SECURITY.md` | B2 | bullets 6 to 16 and 27 become one line ("a file the app keeps in a project or user folder that makes it run, open, fetch or write anything else, or puts markup into the page"; link to B1); bullets 4, 19, 20, 21 cut to the class of bug, with the per-feature detail left in the threat-model rows they cite | O1; `risk:high` |
| B4 | Architecture docs: move how-tos and checklists out | `docs/architecture/{host-binding-concurrency,interaction-feedback,provider-ports,docx-import-quirks,model-provenance,reaper-bridge,manuscript-line-identity,reaper-navigation}.md`, `docs/operations/reaper-verification-pass.md`, target package READMEs or doc comments | PA-1 | "Adding a ..." sections to the package; the two REAPER checklists and their verification records to the verification pass | `docs-impact-map.json` rows for `reaper-lua` and `reaper-bridge-host` name two of these docs; keep them or update the map |
| B5 | Architecture docs: move UI behaviour and reference data out | `import-review.md`, `in-app-update.md`, `reaper-navigation.md`, `stage-recommendations.md`, `story-bible-preview.md`, `storybible-import-format.md`, `script-marks.md`, `delivery-measurement-validation.md`, the matching guide pages, `docs/reference/` | B1, B4 | "What the narrator sees" sections to guide pages; `storybible-import-format.md` and `script-marks.md` to `docs/reference/`; measurement results to a dated research note | none |
| B6 | Architecture docs: the two PRD-shaped files | `manuscript-teleprompter.md`, `first-use-dependency-provisioning.md`, `daw-integration.md`, `findings-contract.md` | B5 | Problem, Intended experience and Acceptance sections removed (the work is built); open items to issues; the teleprompter's engine protocol to a research note; its "UI: what shipped" to `booth.md` | none |
| B7 | Research: retire throwaway files | the five Studio Next audits, the two empty results templates, `studio-next-ruling-index.md`, `studio-next-parity-production-and-schedule.md` | after the page-swap slices that own them merge | delete, as their own text already plans; the ruling index becomes a CI artifact or an issue | coordinator timing |
| B8 | Research: strip agent provenance, move living content | the 16 notes with stream ids, 9 with slice headers, 18 with #510 lists; `local-dependency-evaluation.md`, `acx-delivery-requirements.md`, `studio-next-daw-spike-runbook.md`, `recording-coverage-fixtures.md`, `editing-and-proofing-corpus.md`, `tests/fixtures/audio/librivox-alice/README.md` | PA-4 | headers replaced by an issue link; owner lists to #992; policy and adoption order to `model-provenance.md` and the roadmap; ACX table to `docs/reference/`; run sheet to `docs/operations/`; fixture how-tos to fixture READMEs | none |
| B9 | Agent instructions out of `docs/` | `docs/operations/agent-train.md`, `docs/prds/studio-next-agent-delivery.prd.md`, `docs/operations/documentation-gates.md`, agent sections of `verification-tooling.md` and `ci-and-releases.md`, `.claude/` targets, every link to them (#989 body, PRDs, design docs) | PA-4, O3 | the procedure to `.claude/` (O3); "Owner standing rules" D69 and D98 to the rebuild PRD and `design-system.md`; "UI PRs show their screenshots" to `CONTRIBUTING.md`; skill-workflow steps to the `doc-impact-check` skill | O3; `risk:high`; between waves |
| B10 | Product docs lose agent wording | `docs/design/design-system.md`, `docs/reference/daw/{README,capabilities,reaper}.md`, `docs/architecture/{provider-ports,daw-integration}.md`, `docs/README.md`, `docs/guides/using-the-app/README.md`, `docs/roadmap.md` | B9 | one-line rewrites ("serialises on agent-train" → removed; "each command slice flips its own row" → "a command's row changes when it is verified"); roadmap "Dependency rules" to `codebase-map.md` | none |
| B11 | Skills point to facts, not hold them | `.claude/skills/reaper-api-facts/SKILL.md`, `.claude/skills/design-principles/SKILL.md`, `.claude/rules/ui-spec-and-screenshots.md`, `docs/reference/daw/reaper.md`, a new `docs/architecture/principles.md` | B9, O5 | REAPER facts to `reaper.md`; principles to `principles.md`; the skill and rule keep the procedure and link | `risk:high` |
| B12 | Utilities and small fixes | `docs/utilities/*.md`, `docs/design/{colour-and-contrast,motion-and-animation}.md`, `integrations/audacity/**/README.md` | PA-1 | planned and open sections to issues; "Decisions" to link lists; token-batch history removed (git keeps it); motion plan to an issue; Audacity READMEs point at the adapter | none |
| B13 | PRDs (no action now) | none | | the existing Studio Next PRDs keep their agent tables until each is deleted when built; the template fix (PA-4) stops new ones. The ADR register PRD is input to the owner's ADR audit | O4 |

### 5.3 ADR migration (recommendations for the owner's audit, not actions)

| Group | Count | Recommendation |
| --- | --- | --- |
| ARCH and ENG | 127 | keep; in the audit, split the bundled ones among them |
| VISUAL | 37 | copy each rule into `design-system.md` (the visual and atlas tests already pin most); then mark the ADR as recorded there |
| DATA | 15 | B1 copies their facts into the data-files reference; then mark the ADR as recorded there |
| UX | 92 | the behaviour goes to the user guide page and a test (O5); then mark the ADR as recorded there |
| IMPL | 86 | move the rule into the doc comment beside the constant or function the ADR names, with the test; then mark the ADR as recorded there |
| PROCESS | 10 | 0011, 0028, 0029, 0400, 0407, 0410, 0756, 0757 to `CONTRIBUTING.md` and `docs/operations/`; 0758 and 0760 to the agent instructions (B9) and the rebuild PRD |
| Bundled | 63 | split only the ones the audit keeps |
| Proposed | 168 | accept or reject each kept ARCH or ENG one; the rest close with their move |

"Mark as recorded there" needs a status the index understands (for example `Moved to docs/design/design-system.md#dialog`); `adr-index.mjs` reads any Status text, but `adr-topics.mjs` and the `decision-index` skill would need to filter moved ADRs out. That is a small script change for the audit's first slice.

## 6. Owner decisions needed

| # | Decision | Recommendation |
| --- | --- | --- |
| O1 | Is a file the app itself wrote, read back by the same user's app, inside the trust boundary? | Yes. A hand-edited own file is an input-validation case covered by one generic threat row and the data-files reference, not a vulnerability. A file from someone else (a manuscript, an author's answered query file, an archive) stays outside |
| O2 | Name and scope of the new reference | `docs/reference/data-files.md`, covering project and per-user files, with a retention column; no separate privacy notice while there is no server |
| O3 | Where the agent-train procedure and the agent-delivery PRD live | `.claude/` (for example `.claude/agents/coordinator.md` plus a `train` skill), with #989 linking it; `docs/operations/` keeps only what a person runs |
| O4 | The ADR bar and format for the audit | adopt the significance test; add Significance and Considered options lines; moved ADRs get a `Moved to` status and leave the topics page |
| O5 | Where shipped UI behaviour lives once its PRD is deleted | the user guide page plus a test, with cross-page interaction patterns in `design-system.md`; no separate behaviour spec |
| O6 | The six consent rows in the threat model | move to the consent principles with their tests; keep the forged-command threat in 5a |
| O7 | A `CHANGELOG.md` | not needed if release notes are generated from Conventional Commits; the threat model's history stays in git |
| O8 | The runnable mock under `docs/research/mockups/` | leave it until Cutover deletes it; move its agent brief into `.claude/` in B9 |

## Appendix A: every ADR, classified

Categories as in section 2.2. "Suggested home" is where the content would go if the owner's audit moves it.

| ADR | Type | Bundled | Status | Suggested home | Why |
| --- | --- | --- | --- | --- | --- |
| [0001](../adr/0001-import-dialog-max-width-and-overflow.md) | VISUAL | N | Accepted | design-system.md (Dialog) | Dialog max-width and overflow CSS for one modal; component look, not architecture |
| [0002](../adr/0002-dialog-action-button-placement.md) | UX | N | Accepted | design-system.md (Dialog) | Button placement preference in dialog action row; layout/interaction choice |
| [0003](../adr/0003-tailwind-tokenized-primitives.md) | ARCH | N | Superseded | keep | Adopt Tailwind utilities over custom CSS; styling framework choice (superseded by 0009) |
| [0004](../adr/0004-front-matter-naming.md) | UX | N | Accepted | PRD manuscript-import / user glossary | Display label copy "Front Matter"; terminology, internal enum unchanged |
| [0005](../adr/0005-reference-material-excluded-from-chapter-nav.md) | UX | N | Accepted | PRD manuscript-reader | Hide reference sections from chapter nav; UI listing behaviour |
| [0006](../adr/0006-chapter-progress-bar-ordering.md) | VISUAL | N | Accepted | design-system.md (MeterBar) | Segment order of a progress bar; visual presentation only |
| [0007](../adr/0007-story-bible-locked-entry-enforcement.md) | ARCH | N | Accepted | keep | Lock enforcement authoritative in backend, UI only advisory; security/authority boundary |
| [0008](../adr/0008-timing-confidence-over-forced-alignment-model-for-transcript-compare.md) | ARCH | N | Accepted | keep | Defers forced-alignment model dependency; keeps diff approach plus timing confidence heuristic |
| [0009](../adr/0009-complete-tailwind-migration.md) | ARCH | N | Accepted | keep | Completes migration to Tailwind, retires legacy CSS system; styling framework choice |
| [0010](../adr/0010-theme-switching.md) | UX | N | Accepted | PRD settings / design-system.md (theming) | Light/Dark/System theme feature and its persistence; product behaviour |
| [0011](../adr/0011-doc-screenshots-curated-from-visual-suite.md) | PROCESS | N | Accepted | docs/operations/docs-workflow.md | How doc screenshots are curated and synced; documentation workflow |
| [0012](../adr/0012-media-route-for-track-playback.md) | ARCH | N | Accepted | keep | Audio streamed via Wails asset-server route not base64 bindings; IPC shape and trust boundary |
| [0013](../adr/0013-import-preserves-structural-whitespace.md) | IMPL | N | Accepted | code comments in apps/desktop/internal/importer + tests | Importer whitespace handling and glued-heading repair; bug-fix parsing detail |
| [0014](../adr/0014-inline-formatting-as-offset-spans.md) | ARCH | N | Accepted | keep | Formatting persisted as offset spans over plain text; persisted data model, hard to reverse |
| [0015](../adr/0015-real-progress-only.md) | UX | Y | Accepted | docs/architecture/interaction-feedback.md | Progress bars show real progress; feedback principle bundled with async job and log changes |
| [0016](../adr/0016-highlight-primitive.md) | VISUAL | N | Accepted | design-system.md (Highlight) | Single Highlight component, tints and underline styles; component look |
| [0017](../adr/0017-no-legacy-css-shadowing-tailwind.md) | IMPL | Y | Accepted | design-system.md (CSS rules) / lint rule | CSS cascade coding rules plus SlideOver and ternary class conventions; coding standards |
| [0018](../adr/0018-story-bible-entries-read-only-until-edit.md) | UX | N | Accepted | PRD story-bible / user guide | Entries read-only until Edit pressed; interaction behaviour |
| [0019](../adr/0019-detected-manuscript-is-offered-not-imported.md) | UX | N | Accepted | PRD manuscript-import | Offer detected manuscript, never auto-import; product behaviour and detection rule |
| [0020](../adr/0020-entity-extraction-precision-over-recall.md) | IMPL | N | Accepted | sidecar README / code comments in manuscript_guide.py | Extraction heuristics tuned for precision; algorithm thresholds |
| [0021](../adr/0021-live-speech-engines-behind-one-event-contract.md) | ARCH | N | Accepted | keep | Speech engines interchangeable behind one engine-independent event contract; module/interface boundary |
| [0022](../adr/0022-live-sidecar-events-over-wails-and-stop-file.md) | ARCH | N | Accepted | keep | Streaming sidecar relay over Wails events, stop-file shutdown; process IPC design |
| [0023](../adr/0023-visual-suite-capture-contract-and-storybook.md) | ENG | N | Accepted | keep | Visual suite as validated capture gate plus Storybook layer; test strategy |
| [0024](../adr/0024-teleprompter-highlight-follows-the-sidecars-spans.md) | UX | N | Accepted | PRD teleprompter / reader component doc | How the teleprompter highlight renders and catches up; UI behaviour |
| [0025](../adr/0025-delivery-measurements-in-go-profiles-deferred.md) | ARCH | Y | Superseded | keep | Loudness measured in Go not REAPER, bundled with no-distributor-profile product call |
| [0026](../adr/0026-manuscript-line-identity-in-item-extension-data.md) | ARCH | N | Accepted | keep | Line identity persisted in REAPER item P_EXT via bridge; persistence/integration strategy |
| [0027](../adr/0027-windows-gates-and-creates-the-release.md) | ENG | N | Accepted | keep | Windows-only CI gate and release job; CI/release pipeline construction |
| [0028](../adr/0028-planned-work-is-specified-as-prds-and-deleted-when-built.md) | PROCESS | N | Accepted | CONTRIBUTING / docs/prds/README.md | PRDs kept apart from ADRs and deleted when built; docs process |
| [0029](../adr/0029-work-is-tracked-on-github-and-decided-in-the-repo.md) | PROCESS | N | Accepted | docs/operations/github-workflow.md | Issue/label/milestone tracking on GitHub; project management process |
| [0030](../adr/0030-the-app-starts-without-a-project-and-picks-one-from-recents.md) | ARCH | N | Accepted | keep | Standalone launch with no project, project switch path; entry-point/lifecycle structure |
| [0031](../adr/0031-reaper-integration-is-a-lua-file-bridge-verified-by-hand.md) | ARCH | N | Accepted | keep | REAPER integration stays Lua file bridge, no sockets or native extension; integration approach |
| [0032](../adr/0032-analyzers-report-findings-and-never-change-audio-or-manuscript-on-their-own.md) | ARCH | N | Accepted | keep | Analyzers report findings only, execution owned by REAPER adapter; responsibility boundary enforced by lint |
| [0033](../adr/0033-the-teleprompter-follows-speech-with-continuous-alignment-and-pause-resume.md) | IMPL | N | Accepted | docs/architecture/teleprompter.md + script_tracker.py comments | Tracker alignment algorithm and its parameters (MAX_SKIP); algorithm design inside one module |
| [0034](../adr/0034-live-recognition-is-unconstrained-and-never-restricted-to-the-script.md) | ARCH | N | Accepted | keep | Unconstrained recognition, closed-grammar engines like Vosk excluded; recognizer approach and dependency choice |
| [0035](../adr/0035-live-transcription-techniques-are-ported-not-depended-on.md) | ARCH | N | Accepted | keep | Re-implement WhisperLive/whisper_streaming techniques, no dependency or server; dependency and licensing |
| [0036](../adr/0036-story-bible-read-only-view-is-the-disabled-form-not-entitysummary.md) | UX | N | Accepted | PRD story-bible | Read-only view uses disabled form, not EntitySummary; UI composition choice |
| [0037](../adr/0037-visual-suite-captures-no-phone-viewport.md) | ENG | N | Accepted | keep (or docs/operations/visual-suite.md) | Visual suite drops phone viewport; test matrix scope |
| [0038](../adr/0038-visual-suite-captures-the-production-build.md) | ENG | N | Accepted | docs/operations/visual-suite.md | Visual suite captures production mock build; test harness configuration |
| [0039](../adr/0039-the-project-is-licensed-agpl-3-or-later.md) | ARCH | N | Accepted | keep | Relicense to AGPL-3.0-or-later; licensing decision |
| [0040](../adr/0040-the-repository-is-laid-out-by-role-and-each-project-is-an-nx-project.md) | ARCH | N | Accepted | keep | Role-based monorepo layout, every project an Nx project; repo structure |
| [0041](../adr/0041-host-bindings-read-project-services-through-one-snapshot-accessor.md) | IMPL | N | Accepted | docs/architecture/host-binding-concurrency.md + comment in apps/desktop/services.go | Locking pattern for service pointers in bindings; concurrency coding detail |
| [0042](../adr/0042-proofing-suggestions-derive-from-current-entities-and-skip-auto-extracted-needs-review.md) | IMPL | N | Accepted | code comment in apps/desktop/internal/guide/service.go | Bug fix for vocabulary suggestion union and filter rules |
| [0043](../adr/0043-coverage-is-a-ratchet-on-logic-directories-not-a-blanket-80-percent.md) | ENG | N | Accepted | keep | Coverage ratchet on logic directories instead of blanket 80%; test strategy |
| [0044](../adr/0044-property-and-fuzz-tests-are-deterministic-in-the-gate.md) | ENG | N | Accepted | keep | Property and fuzz tests deterministic in the gate; test strategy |
| [0045](../adr/0045-dead-code-is-gated-at-zero-with-reasoned-ignores.md) | ENG | N | Accepted | keep | Knip dead-code gate at zero findings; CI gate |
| [0046](../adr/0046-architecture-rules-taken-from-adrs-are-lint-and-test-rules.md) | ENG | N | Accepted | keep | ADR import rules enforced by depguard/pytest; fitness-function construction technique |
| [0047](../adr/0047-the-ui-primitives-wrap-base-ui-and-app-code-never-imports-it.md) | ARCH | N | Accepted | keep | Primitives built on Base UI, app code never imports it; library choice and boundary |
| [0048](../adr/0048-every-dialog-is-one-modal-shell-and-confirms-are-alert-dialogs.md) | UX | N | Accepted | design-system.md (Dialog) | Modal, Escape, backdrop and focus policy for dialogs; interaction/a11y behaviour |
| [0049](../adr/0049-hints-are-base-ui-tooltips-that-meet-wcag-1-4-13-and-info-icons-are-buttons.md) | UX | N | Accepted | design-system.md (Tooltip/Popover) | Tooltip timing, offsets and info-icon popover; interaction/a11y spec |
| [0050](../adr/0050-the-segmented-meter-is-an-image-named-by-its-segments-and-field-wires-its-hint-and-error.md) | UX | Y | Accepted | design-system.md (MeterBar, Field) | Accessible naming of meter and Field hint/error wiring; two unrelated primitives |
| [0051](../adr/0051-the-slide-over-and-the-navigation-drawer-are-modal-base-ui-drawers.md) | UX | N | Accepted | design-system.md (SlideOver, NavDrawer) | Drawers become modal with focus trap and Escape; interaction/a11y behaviour |
| [0052](../adr/0052-toggle-menu-checkbox-collapsible-and-switch-replace-the-hand-rolled-widgets.md) | UX | Y | Accepted | design-system.md (primitives) | Five widgets replaced by Base UI primitives; per-component behaviour specs |
| [0053](../adr/0053-icon-buttons-text-fields-and-selects-wrap-the-native-controls.md) | VISUAL | Y | Accepted | design-system.md (form controls) | IconButton, TextField, Select primitives and no native controls in pages; component system rules |
| [0054](../adr/0054-tabs-and-toggle-groups-name-and-link-what-the-hand-built-strips-left-anonymous.md) | UX | N | Accepted | design-system.md (Tabs, ToggleGroup) | Tab and toggle-group semantics and keyboard behaviour; component a11y spec |
| [0055](../adr/0055-the-tag-input-is-a-wrapped-text-field-and-chips-that-report-and-never-edit-the-list.md) | UX | N | Accepted | design-system.md (TagInput) | TagInput component behaviour and focus handling; component spec |
| [0056](../adr/0056-a-presentational-table-primitive-replaces-the-dtable-class-and-rows-take-the-keyboard.md) | VISUAL | N | Accepted | design-system.md (Table) | Presentational Table primitive replaces dtable class; component look and row keyboard |
| [0057](../adr/0057-a-running-job-that-cannot-be-cancelled-keeps-its-dialog-blocking-and-says-so.md) | UX | Y | Accepted | design-system.md (WorkDialog) / interaction-feedback.md | Non-cancellable job dialog copy plus reduced-motion bar; two separate UI rules |
| [0058](../adr/0058-heading-has-a-level-and-panel-names-its-region-with-a-level-2-title.md) | UX | Y | Accepted | design-system.md (Heading, Panel) | Heading level prop and Panel landmark title; semantic markup of two primitives |
| [0059](../adr/0059-text-colours-meet-wcag-aa-with-two-text-levels-a-non-text-token-and-derived-on-tint-text.md) | VISUAL | N | Accepted | design-system.md (colour tokens) | Text colour tokens meeting WCAG AA contrast; palette rules |
| [0060](../adr/0060-the-visual-suite-fails-a-collapsed-control-and-a-row-may-declare-one-narrow-on-purpose.md) | ENG | N | Accepted | docs/operations/visual-suite.md | Visual suite fails controls narrower than 64px; test gate rule |
| [0061](../adr/0061-settings-states-are-also-captured-at-a-390px-reflow-width.md) | ENG | N | Accepted | docs/operations/visual-suite.md | Opt-in 390px reflow viewport for Settings states; test matrix detail |
| [0062](../adr/0062-ui-import-rules-are-a-dependency-cruiser-config-and-a-mark-scan-that-name-their-adr.md) | ENG | N | Accepted | keep | UI import boundaries enforced by dependency-cruiser; fitness-function construction technique |
| [0063](../adr/0063-the-proofing-diff-marks-its-own-words-and-adr-0016-covers-entry-highlights.md) | IMPL | N | Accepted | comment in apps/ui/src/highlightBoundary.test.ts | Clarifies ADR 0016 scope for one component's mark element; allowlist reason |
| [0064](../adr/0064-the-visual-suite-runs-axe-on-every-app-state-and-a-violation-fails-unless-it-is-declared-debt.md) | ENG | N | Accepted | keep | Axe on every app state with debt ratchet; accessibility test gate |
| [0065](../adr/0065-aria-snapshots-pin-the-role-trees-of-the-dialogs-the-slide-over-and-the-navigation.md) | ENG | N | Accepted | docs/operations/visual-suite.md | Aria snapshot run pins role trees; test strategy addition |
| [0066](../adr/0066-the-lua-bridge-is-tested-by-a-harness-under-lua-5-4-and-reaper-api-behaviour-is-checked-in-reaper.md) | ENG | N | Accepted | keep | Lua bridge harness under Lua 5.4 plus in-REAPER checks; test strategy |
| [0067](../adr/0067-bridge-commands-are-registered-by-name-and-each-feature-lives-in-its-own-lua-file.md) | ARCH | N | Accepted | keep | Bridge command registry and per-feature Lua files; module structure of integration |
| [0068](../adr/0068-bridge-events-fan-out-to-subscribers-by-tag-and-run-and-every-error-names-its-run.md) | ARCH | N | Accepted | keep | Single event reader fanning out to subscribers by tag and run; IPC design |
| [0069](../adr/0069-payloads-are-validated-with-zod-behind-parsewire-and-a-wrong-shape-fails-loudly.md) | ARCH | N | Accepted | keep | Zod runtime validation behind parseWire at all wire boundaries; library and interface contract |
| [0070](../adr/0070-workflow-actions-are-pinned-to-a-commit-and-zizmor-gates-the-workflows.md) | ENG | N | Accepted | keep | Actions pinned to SHAs, zizmor gates workflows; supply-chain practice |
| [0071](../adr/0071-releases-carry-build-provenance-and-promote-refuses-a-file-the-release-workflows-did-not-build.md) | ENG | N | Accepted | keep | Build provenance attestations and promote verification; release pipeline security |
| [0072](../adr/0072-the-app-updates-itself-from-this-repositorys-releases-and-never-installs-without-a-click.md) | ARCH | N | Accepted | keep | Self-update from GitHub releases with click-to-install; security architecture and external integration |
| [0073](../adr/0073-the-executable-is-named-narration-utils-and-carries-its-version.md) | ENG | Y | Accepted | docs/operations/ci-and-releases.md | Executable rename and embedded version; packaging details bundled with launcher lookup |
| [0074](../adr/0074-the-windows-update-renames-the-running-executable-and-keeps-the-old-one-until-the-new-one-starts.md) | IMPL | N | Accepted | docs/architecture/in-app-update.md + comments in internal/update | Rename-swap sequence of one install function; mechanism detail within one package |
| [0075](../adr/0075-every-action-that-leaves-the-interface-acknowledges-within-100-ms-cannot-be-fired-twice-and-tells-the-narrator-when-it-ends.md) | UX | N | Accepted | docs/architecture/interaction-feedback.md | 100ms acknowledgement, no double fire, completion notice; interaction rules |
| [0076](../adr/0076-a-host-job-ends-with-one-job-ended-event-the-app-announces-it-and-the-story-bible-rebuild-may-continue-in-the-background.md) | ARCH | Y | Accepted | keep | One job:ended event contract, bundled with announcement UI and background rebuild behaviour |
| [0077](../adr/0077-every-asset-install-is-one-job-with-real-bytes-a-second-start-joins-it-and-one-hook-follows-it.md) | ARCH | Y | Accepted | keep | One install job for all assets with join and single hook; consolidates modules, bundles progress details |
| [0078](../adr/0078-asset-state-comes-from-the-manifest-an-asset-is-read-in-full-once-per-session-and-a-failed-download-resumes.md) | IMPL | Y | Accepted | reference/data-files (asset manifest) + docs/architecture assets doc | Manifest fields, caching of verification, download resume; implementation and file format details |
| [0079](../adr/0079-every-downloadable-asset-is-listed-installed-verified-and-removed-through-one-registry-of-providers.md) | ARCH | N | Accepted | keep | One registry of asset providers behind an interface; module boundary and interface |
| [0080](../adr/0080-the-story-bible-language-model-is-a-catalog-asset-unpacked-at-install-and-the-build-asks-before-it-downloads.md) | ARCH | Y | Accepted | keep | spaCy model provisioned as catalog asset, bundled with build-time download prompt UX |
| [0081](../adr/0081-local-assets-is-a-settings-list-built-from-the-registry-whose-rows-own-their-download-verify-and-remove.md) | UX | N | Accepted | PRD settings / user guide | Local assets list in Settings with per-row actions; UI feature |
| [0082](../adr/0082-windows-installs-per-user-from-an-nsis-setup-program-that-wails-builds-and-the-release-carries-beside-the-update-zip.md) | ARCH | N | Accepted | keep | Per-user NSIS installer for Windows; deployment and platform packaging strategy |
| [0083](../adr/0083-the-public-docs-site-is-built-by-mkdocs-with-the-material-theme-straight-from-docs-and-a-reviewed-include-list.md) | ENG | N | Accepted | keep | MkDocs Material for docs site with include list; tooling choice for docs build |
| [0084](../adr/0084-repository-links-are-checked-offline-on-every-pull-request-and-diagrams-are-parsed-and-drawn-without-a-third-party.md) | ENG | Y | Accepted | docs/operations/ci-and-releases.md | Offline link checks plus local diagram rendering; two separate CI checks |
| [0085](../adr/0085-the-third-party-notices-are-generated-from-the-release-and-ship-as-their-own-asset-and-not-inside-the-update-zip.md) | ENG | N | Accepted | keep | Generated third-party notices shipped as release asset; licence compliance in release pipeline |
| [0086](../adr/0086-the-import-review-is-grouped-by-what-each-section-will-be-and-reports-repairs-instead-of-a-log.md) | UX | N | Accepted | PRD manuscript-import | Import review grouped by kind and showing repairs; UI layout |
| [0087](../adr/0087-story-bible-header-actions-are-mode-based-and-lock-cannot-happen-mid-edit.md) | UX | N | Accepted | PRD story-bible | Header actions per mode, no Lock mid-edit; interaction design |
| [0088](../adr/0088-contents-and-characters-stay-reference-hidden-by-the-reader.md) | IMPL | N | Accepted | PRD manuscript-reader / code comment | Keep contentKind reference, no new enum value; data classification detail |
| [0089](../adr/0089-a-docx-table-of-contents-becomes-the-authoritative-chapter-list-above-a-match-threshold.md) | IMPL | N | Accepted | code comments in apps/desktop/internal/importer/docx.go | TOC-vs-heading matching passes and threshold; algorithm parameter |
| [0090](../adr/0090-the-page-flip-reader-hides-reference-chapters-superseding-the-reader-half-of-adr-0005.md) | UX | N | Accepted | PRD manuscript-reader | Reader hides reference chapters, default open chapter; UI behaviour |
| [0091](../adr/0091-story-bible-pronunciation-is-a-narrator-edited-value-the-preview-speaks-directly.md) | ARCH | N | Accepted | keep | No second pronunciation engine or hosted API; preview uses Piper phoneme path |
| [0092](../adr/0092-reaper-executable-discovery-heartbeat-mechanism-and-script-plus-project-launch-are-resolved.md) | ARCH | Y | Accepted | keep | REAPER discovery, heartbeat and launch approach; three spike results bundled |
| [0093](../adr/0093-the-home-estimate-times-the-first-opening-and-closing-template-until-a-project-can-choose-one.md) | UX | N | Accepted | PRD credits | Interim rule for which template the Home estimate uses; product stopgap |
| [0094](../adr/0094-dialog-gains-a-full-size-variant-that-fills-the-viewport-with-a-margin.md) | VISUAL | N | Accepted | design-system.md (Dialog) | Full-size Dialog variant sizing; component look |
| [0095](../adr/0095-txt-import-decodes-by-bom-utf-8-windows-1252-and-a-chapterless-file-becomes-one-narration-chapter.md) | IMPL | N | Accepted | code comments in apps/desktop/internal/importer/txt.go | Charset detection order and hard-wrap heuristics; parsing detail |
| [0096](../adr/0096-the-public-demo-builds-under-its-own-vite-mode-and-the-router-carries-a-basename.md) | IMPL | N | Accepted | comment in apps/ui/vite.config.ts / docs/operations | Demo build mode and router basename; build configuration detail |
| [0097](../adr/0097-the-manuscript-reader-word-lookup-uses-the-open-english-wordnet-as-a-downloadable-asset.md) | ARCH | N | Accepted | keep | Local Open English WordNet asset, no cloud API; data dependency and licence choice |
| [0098](../adr/0098-take-provenance-in-take-extension-data-extends-adr-0026.md) | ARCH | N | Accepted | keep | Take provenance persisted in REAPER take P_EXT keys; persistence strategy |
| [0099](../adr/0099-chapter-tags-are-embedded-with-bogem-id3v2-and-a-hand-built-ctoc-frame.md) | ARCH | N | Accepted | keep | bogem/id3v2 dependency with hand-built CTOC, new-file MP3 output; library choice |
| [0100](../adr/0100-analysis-evidence-is-two-hash-keys-one-ledger-record-per-run-and-a-narrator-confirmed-track-map.md) | ARCH | Y | Accepted | keep | Two hash keys, run ledger and confirmed track map; evidence persistence model with several decisions |
| [0101](../adr/0101-epub-import-reads-nav-then-ncx-for-chapters-caps-entries-and-refuses-drm.md) | IMPL | N | Accepted | code comments in apps/desktop/internal/importer/epub.go | EPUB TOC fallback order, caps, DRM refusal; parser details |
| [0102](../adr/0102-epub-content-kind-overrides-by-title-rather-than-canonical-title-renaming.md) | IMPL | N | Accepted | code comment in importer/model.go newDraft | kindOverrides parameter for epub:type; function signature detail |
| [0103](../adr/0103-txt-and-epub-are-accepted-import-formats-hand-rolled-drm-refused-and-offered-for-detection.md) | ARCH | N | Accepted | keep | TXT/EPUB supported formats, hand-rolled on stdlib, no parsing library; dependency choice |
| [0104](../adr/0104-seek-reaches-a-running-teleprompter-session-through-a-tailed-control-file.md) | ARCH | N | Accepted | keep | Seek via tailed control file to running sidecar; IPC channel design |
| [0105](../adr/0105-the-visual-suite-drives-each-state-once-and-resizes-through-the-viewports.md) | ENG | N | Accepted | docs/operations/visual-suite.md | Drive each state once and resize across viewports; test performance technique |
| [0106](../adr/0106-a-teleprompter-session-stops-itself-five-seconds-after-the-tracker-reports-done.md) | IMPL | N | Proposed | code comment in internal/teleprompter/autostop.go | Auto-stop five seconds after done; a timer value and its placement |
| [0107](../adr/0107-moonshine-ships-inside-the-windows-teleprompter-sidecar-and-runs-only-from-a-verified-catalog-install.md) | ARCH | N | Proposed | keep | Ship Moonshine in Windows sidecar from verified catalog; dependency and platform choice |
| [0110](../adr/0110-one-go-chapter-to-track-matcher-ported-from-transcript-compare-with-explicit-confidence-states.md) | ARCH | N | Proposed | keep | Single Go chapter matcher ported from Python with drift tests; module placement and shared interface |
| [0111](../adr/0111-the-resume-point-comes-from-transcribing-the-recorded-tail-and-placing-it-with-the-tracker.md) | IMPL | N | Proposed | docs/architecture/teleprompter.md | Resume point from last 30s transcription; feature algorithm and parameter |
| [0112](../adr/0112-the-resume-card-looks-up-where-the-recording-ends-on-open-and-a-choice-only-sets-where-start-begins.md) | UX | N | Proposed | PRD teleprompter | Resume card lookup timing and choices; UI flow |
| [0113](../adr/0113-the-teleprompter-suggests-a-chapter-from-the-saved-armed-track-and-preselects-only-a-confident-match.md) | UX | N | Proposed | PRD teleprompter | Chapter suggestion from saved armed track, preselect only confident; product behaviour |
| [0115](../adr/0115-live-flags-are-suspected-judged-per-closed-segment-and-forgive-what-transcript-compare-forgives.md) | IMPL | Y | Proposed | docs/architecture/teleprompter.md + flags.py comments | Flag event kinds and judgement rules; algorithm details bundled with wire event |
| [0116](../adr/0116-read-aloud-marks-cover-whole-words-the-innermost-is-the-control-and-a-mark-never-seeks.md) | UX | N | Proposed | PRD teleprompter / reader component doc | Mark coverage and click behaviour in read-aloud reader; UI behaviour |
| [0117](../adr/0117-live-flags-are-kept-as-suspected-findings-merged-per-chapter-when-a-session-ends.md) | ARCH | N | Proposed | keep | Persistence strategy: live flags reuse the shared findings store via one host binding, not a parallel model. |
| [0118](../adr/0118-read-aloud-flags-are-highlight-kinds-with-an-inline-hint-and-skips-and-restarts-show-by-default.md) | VISUAL | Y | Proposed | design-system.md | Highlight decoration kinds, colours and underline styles; also bundles default-visibility UX choice. |
| [0119](../adr/0119-a-hand-scroll-pauses-following-until-the-current-word-is-back-in-the-band.md) | UX | N | Proposed | PRD teleprompter / reader spec | Scroll-follow pause/resume interaction behaviour in the reader. |
| [0120](../adr/0120-findings-are-read-and-decided-through-four-generic-bindings-and-a-decision-carries-the-evidence-version-it-was-made-against.md) | ARCH | N | Proposed | keep | Interface shape: four generic analyzer-agnostic findings bindings and evidence-versioned decisions. |
| [0121](../adr/0121-going-to-and-looping-a-finding-is-by-guid-and-source-time-makes-no-undo-point-and-stop-restores-what-the-loop-changed.md) | ARCH | Y | Proposed | keep | DAW integration identity by GUID+source time; bundles undo-point and loop-restore behaviour. |
| [0122](../adr/0122-the-review-page-asks-reaper-only-on-a-click-and-only-while-it-answers-and-a-refusal-is-an-answer.md) | UX | Y | Proposed | PRD review-page | Review page availability states and click-only REAPER requests; heartbeat polling is page behaviour. |
| [0123](../adr/0123-the-approved-marker-is-one-take-marker-for-an-accepted-finding-named-like-transcript-compares-in-one-undo-point.md) | UX | N | Proposed | PRD review-page | Feature behaviour of the per-finding approved-marker action (confirm, accepted only, one undo). |
| [0124](../adr/0124-take-review-groups-are-reviewed-on-the-review-page-each-read-is-navigated-by-its-index-and-the-scan-is-a-cancellable-job.md) | ARCH | Y | Proposed | keep (split) | Removes take-review bindings in favour of generic findings bindings; bundles navigation and job model. |
| [0125](../adr/0125-recording-coverage-ground-truth-is-scripted-recordings-with-paragraph-labels-and-a-corpus-directory-variable.md) | ENG | N | Proposed | keep | Test strategy: text-only synthetic ground-truth fixtures with pluggable real corpus. |
| [0126](../adr/0126-recording-coverage-reads-the-take-markers-sequencematcher-alignment-and-folds-chance-matches-into-gaps.md) | IMPL | N | Proposed | docs/utilities/recording-coverage.md | Alignment algorithm reuse and chance-match folding rule inside one sidecar module. |
| [0127](../adr/0127-the-coverage-sidecar-mode-reads-a-json-manifest-keeps-one-words-file-per-item-and-writes-tagged-json-lines.md) | ARCH | N | Proposed | keep | Sidecar mode CLI, manifest input and tagged JSON-lines output: an IPC wire shape. |
| [0128](../adr/0128-the-coverage-service-reads-the-saved-project-keeps-words-per-source-range-and-leaves-model-and-language-out-of-the-parameter-hash.md) | IMPL | Y | Proposed | docs/utilities/recording-coverage.md | Cache-key and parameter-hash composition and per-range words; inputs were already settled elsewhere. |
| [0129](../adr/0129-the-coverage-bindings-answer-refusals-as-results-end-with-one-job-event-and-fill-recordedfraction-only-from-a-current-check.md) | ARCH | Y | Proposed | keep | Binding interface and refusal-as-result error model; bundles job event and recordedFraction rule. |
| [0130](../adr/0130-the-home-recording-check-opens-on-the-stored-result-runs-only-on-a-press-and-labels-the-recorded-length-measured-or-estimated.md) | UX | N | Proposed | PRD home recording-check | When the Home check dialog runs and how it labels measured vs estimated. |
| [0131](../adr/0131-the-recording-signal-is-read-from-stored-checks-with-thresholds-applied-on-read-and-alignment-from-settings.md) | IMPL | N | Proposed | docs/architecture/stage-recommendations.md | Signal id, cause mapping and first-match rules of one pure function. |
| [0132](../adr/0132-the-recording-check-ships-0-8-3-8-3-chosen-on-synthetic-fixtures-and-labelled-uncalibrated.md) | IMPL | N | Proposed | reference doc + code comment in config/defaults.json | Default threshold values and their calibration sweep. |
| [0135](../adr/0135-a-subtitle-turned-off-in-the-import-review-joins-the-title-or-returns-to-the-text-by-where-its-line-came-from.md) | IMPL | N | Proposed | docs/utilities import reference | Importer per-section subtitleOff field and how an override is applied. |
| [0136](../adr/0136-an-asset-may-keep-only-a-file-built-at-install-from-its-verified-archive.md) | ARCH | N | Proposed | keep | Asset pipeline gains a Derive step changing what verified installs persist and how they are verified. |
| [0140](../adr/0140-take-metrics-are-per-category-evidence-over-a-takes-source-range.md) | IMPL | Y | Proposed | reference measure doc / code comments | Range API shape and clipping metric inside the measure package. |
| [0141](../adr/0141-per-take-divergence-is-localized-by-the-markers-diff-and-asr-word-timestamps.md) | ARCH | N | Proposed | keep | Rejects forced-alignment dependency (PyTorch/Kaldi); keeps Whisper-timestamp approach for divergence. |
| [0143](../adr/0143-the-review-workflow-calls-a-daw-through-dawadapter-and-the-event-vocabulary-is-part-of-the-contract.md) | ARCH | N | Proposed | keep | Introduces DAW adapter interface seam and makes the event vocabulary part of its contract. |
| [0144](../adr/0144-a-launch-names-its-daw-with-daw-and-an-audacity-launch-opens-no-reaper-bridge.md) | ARCH | N | Proposed | keep | Launch-argument DAW classification decides which process bridges and services start. |
| [0145](../adr/0145-the-audacity-launcher-is-an-installer-start-menu-entry-and-a-picker-switch-keeps-an-audacity-launch.md) | ENG | Y | Proposed | docs/operations release/installer doc | Installer creates an Audacity Start Menu entry; bundles project-picker UX rule. |
| [0146](../adr/0146-cleanup-launchers-open-an-allow-listed-reaper-action-found-by-its-name-and-change-nothing-themselves.md) | ARCH | N | Proposed | keep | Security architecture: host and Lua allow-lists of tool keys across the REAPER trust boundary. |
| [0147](../adr/0147-retakes-on-fixed-lanes-are-chosen-by-lane-play-state-and-the-app-never-converts-takes-and-lanes.md) | ARCH | N | Proposed | keep | External integration constraint: drive fixed lanes by play state only, never convert lanes/takes. |
| [0150](../adr/0150-the-teleprompter-reads-credits-as-a-host-rendered-script-file-not-a-chapter.md) | ARCH | N | Proposed | keep | Credits are a host-rendered script, never a chapter: data-model boundary and binding shape. |
| [0151](../adr/0151-chapter-announcements-render-per-narration-chapter-and-are-timed-with-the-credits.md) | UX | Y | Proposed | PRD credits | Announcement token meanings and room-tone setting are two unrelated product choices. |
| [0152](../adr/0152-the-retail-sample-is-a-paragraph-range-on-the-project-manifest-held-to-five-minutes-by-the-host.md) | UX | N | Proposed | PRD credits / retail sample | Product rule for the ACX retail sample range and its 5-minute cap. |
| [0155](../adr/0155-settings-gain-a-number-kind-with-a-declared-range-and-delivery-limits-are-the-narrators-own.md) | IMPL | Y | Proposed | settings reference doc | Settings number-kind validation rules; bundles delivery-limit ownership (partly superseded). |
| [0156](../adr/0156-measurement-reads-only-files-picked-this-session-as-one-job-and-fingerprints-the-bytes-it-read.md) | ARCH | N | Proposed | keep | Security trust boundary: webview may only request host reads of picker-chosen files. |
| [0158](../adr/0158-windowed-diagnostics-are-one-read-pass-with-fixed-windows-narrator-thresholds-and-candidate-findings.md) | IMPL | N | Proposed | reference diagnostics doc | Window sizes, thresholds and severity rules of the diagnostics detectors. |
| [0160](../adr/0160-stage-recommendations-are-computed-from-tri-state-signals-by-a-pure-engine.md) | ARCH | N | Proposed | keep | New stages module contract: tri-state signals and a pure engine providers plug into. |
| [0161](../adr/0161-stage-decisions-live-in-their-own-sidecar-and-confirm-writes-the-record-before-the-status.md) | ARCH | N | Proposed | keep | Persistence strategy: separate append-only decisions file and write ordering for Confirm. |
| [0165](../adr/0165-a-take-comparison-is-one-finding-per-group-over-its-one-span-built-from-the-saved-project-and-never-ranked.md) | UX | Y | Proposed | PRD take-review | Take comparison product shape (one per group, never ranked) plus data source details. |
| [0168](../adr/0168-a-coverage-region-carries-its-bounds-as-optional-before-and-after-points-with-no-version-bump.md) | IMPL | N | Accepted | wire contract schema / reference | Adds two optional payload fields without a version bump. |
| [0170](../adr/0170-the-delivery-report-is-built-by-the-host-into-the-project-sidecar-without-paths-and-the-host-judges-the-limits.md) | ARCH | Y | Proposed | keep | Moves limit judgement from TS into the Go host; bundles report export format. |
| [0171](../adr/0171-the-race-detector-runs-only-where-there-is-concurrency-and-checklocks-guards-the-locks.md) | ENG | N | Proposed | keep | CI test technique: race detector scoping and checklocks guarding. |
| [0172](../adr/0172-popover-is-an-interactive-layer-above-the-dialog-and-escape-defers-to-the-topmost-one.md) | VISUAL | N | Proposed | design-system.md | Popover primitive behaviour and Escape layering rule in the component library. |
| [0175](../adr/0175-chapter-track-matching-reads-chapter-labels-through-one-shared-pre-pass-and-a-take-or-pickup-track-is-never-confident.md) | IMPL | Y | Proposed | code comment in chaptermatch/label.go | Label-normalisation pre-pass and confidence rule of the matcher algorithm. |
| [0179](../adr/0179-a-built-in-dated-acx-delivery-profile-ships-and-a-project-is-judged-against-its-selected-profile.md) | ARCH | N | Proposed | keep | Introduces delivery-profile domain model and judging against a selected profile. |
| [0180](../adr/0180-custom-delivery-profiles-are-copies-of-a-built-in-kept-in-a-user-level-file.md) | ARCH | N | Proposed | keep | Persistence strategy for custom profiles: user-level file outside the settings store. |
| [0183](../adr/0183-credits-rows-in-the-chapter-table-are-not-chapters-and-their-status-lives-on-the-project-manifest.md) | UX | N | Proposed | PRD home chapter table | Credits rows shown in the chapter table with a status; reaffirms 0150's boundary. |
| [0187](../adr/0187-the-resume-prompt-is-a-compact-notice-that-settles-once-per-dialog-open.md) | UX | N | Proposed | PRD read-aloud dialog | Resume prompt look and once-per-open settling behaviour. |
| [0190](../adr/0190-a-manuscript-cards-whole-header-is-its-disclosure-button-in-fixed-columns.md) | UX | N | Accepted | PRD manuscript page / design-system.md | Card header disclosure and column layout on one page. |
| [0191](../adr/0191-a-chapters-name-is-title-em-dash-subtitle-in-source-casing-through-one-formatter-and-one-primitive.md) | VISUAL | N | Accepted | design-system.md | Chapter-name typography, separator and casing rule. |
| [0193](../adr/0193-homes-actual-recorded-is-the-linked-tracks-recorded-length-from-the-saved-project-and-never-an-estimate.md) | UX | N | Accepted | PRD home page | What one table column shows and from which source. |
| [0196](../adr/0196-the-read-aloud-control-bar-lives-in-a-dialog-footer-slot-and-space-plays-or-stops-a-session.md) | UX | Y | Proposed | PRD read-aloud + design-system.md | Dialog footer slot plus Space-key shortcut: unrelated UI choices. |
| [0197](../adr/0197-every-release-asset-name-carries-the-bare-version.md) | ENG | N | Accepted | docs/operations/release.md | Release pipeline asset naming convention. |
| [0200](../adr/0200-the-desktop-shell-runs-on-wails-v3-beta-pinned-at-v3-0-0-beta-25.md) | ARCH | N | Accepted | keep | Framework choice and version pin: Wails v3 beta for the desktop shell. |
| [0201](../adr/0201-app-zoom-under-wails-v3-on-windows-runs-from-100-to-200-percent-and-reads-the-level-back-from-the-window.md) | UX | N | Proposed | PRD app shell / zoom | Zoom range and Ctrl+wheel behaviour. |
| [0202](../adr/0202-a-confident-two-way-match-is-a-real-link-labelled-auto-undoable-and-never-over-a-manual-one.md) | UX | N | Accepted | PRD chapter sync | Product default to auto-link confident matches, with undo and manual precedence. |
| [0203](../adr/0203-unlinking-a-link-rejects-the-pair-and-a-re-import-re-links-by-title-as-auto-links.md) | UX | N | Proposed | PRD chapter sync | Unlink and re-import relinking behaviour. |
| [0204](../adr/0204-the-recording-check-result-carries-the-hosts-judgement-by-the-stage-signals-rule.md) | IMPL | N | Accepted | code comment in coverage/judge | One judging function and a result field carrying its verdict. |
| [0205](../adr/0205-the-prompter-remembers-its-last-word-per-chapter-in-a-host-named-file-dropped-when-the-text-changes.md) | DATA | N | Accepted | reference/data-files | Per-chapter reading file: location, fields and when it is dropped. |
| [0206](../adr/0206-resume-reconciles-the-recording-with-the-prompters-last-word-in-the-host-and-asks-only-when-they-disagree.md) | IMPL | N | Accepted | docs/architecture/manuscript-teleprompter.md | One pure reconcile function and its verdict values. |
| [0207](../adr/0207-a-chapters-kind-can-change-after-import-and-removing-it-from-recording-is-a-reclassification-never-a-delete.md) | UX | N | Accepted | PRD manuscript | Narrator can reclassify a chapter's kind instead of deleting it. |
| [0208](../adr/0208-credits-values-are-asked-for-once-per-project-keyed-on-project-state-and-never-saved-without-the-narrator.md) | UX | N | Accepted | PRD credits setup | When the credits-values prompt appears and that nothing saves without the narrator. |
| [0209](../adr/0209-chapter-sync-asks-once-per-project-and-with-consent-every-link-path-runs-one-sync.md) | UX | N | Accepted | PRD chapter sync | One-time consent prompt and when sync runs. |
| [0210](../adr/0210-chapter-sync-watches-the-saved-rpp-and-reapers-edit-counter-and-sends-reaper-nothing.md) | ARCH | N | Accepted | keep | Integration approach: watch the saved .rpp and edit counter, never send REAPER commands. |
| [0211](../adr/0211-a-changed-chapter-is-rechecked-in-the-background-only-on-mains-power-with-reaper-quiet-and-not-recording.md) | UX | N | Accepted | PRD recording check | Policy for when background re-checks may run (power, REAPER quiet). |
| [0212](../adr/0212-the-workspace-alignment-reuses-the-coverage-results-store-and-joins-played-ranges-from-the-saved-project-on-read.md) | ARCH | N | Accepted | keep | Persistence strategy: reuse coverage results store, join played ranges on read. |
| [0230](../adr/0230-reaper-commands-built-before-the-verification-pass-are-refused-by-the-host-while-the-experimental-switch-is-off.md) | ENG | N | Accepted | keep | Construction/rollout technique: host-enforced feature flag for unverified bridge commands. |
| [0231](../adr/0231-chapter-track-state-is-one-read-only-answer-of-the-transport-the-arms-the-input-device-and-one-tracks-items.md) | IMPL | N | Proposed | reference bridge-commands doc | Field list of one read-only bridge command. |
| [0232](../adr/0232-arming-for-a-recording-remembers-the-narrators-arms-makes-no-undo-point-and-the-app-stops-only-the-recording-it-started.md) | UX | Y | Proposed | PRD read-aloud recording | Arm/restore/stop recording behaviour plus undo-point detail. |
| [0233](../adr/0233-the-app-may-make-a-take-active-by-guid-in-one-undo-step.md) | IMPL | N | Accepted | reference bridge-commands doc | One bridge command's behaviour (set active take, one undo). |
| [0234](../adr/0234-fx-chains-go-on-tracks-and-a-passage-of-a-take-gets-one-plug-in-at-a-time.md) | UX | N | Accepted | PRD edit-proof workspace | Product scope of where FX chains and single plug-ins may be applied. |
| [0235](../adr/0235-one-create-regions-command-serves-chapter-and-credits-regions-and-replaces-create-chapter-regions.md) | IMPL | N | Accepted | reference bridge-commands doc | Merges two commands into one create_regions command. |
| [0236](../adr/0236-room-tone-at-a-files-edges-is-timed-against-the-silence-floor-and-a-custom-copy-takes-how-a-rule-is-checked-from-its-built-in.md) | IMPL | Y | Proposed | reference measure / delivery-profile doc | Edge room-tone measurement rule plus unrelated custom-profile check inheritance. |
| [0237](../adr/0237-an-mp3-is-measured-for-its-container-only-from-bounded-frame-headers-and-its-levels-are-not-checked.md) | IMPL | N | Proposed | reference measure doc | MP3 container-only parsing rules and what is not checked. |
| [0238](../adr/0238-silence-cleanup-candidates-are-classed-in-the-diagnostics-pass-and-raised-apart-from-the-diagnostics-findings.md) | IMPL | N | Proposed | reference diagnostics doc | Classifier windows and thresholds for cleanup candidates. |
| [0239](../adr/0239-host-and-sidecar-chapter-names-follow-the-display-rule-through-one-helper-per-language-and-matching-keys-keep-their-own-form.md) | IMPL | N | Proposed | docs-style / code comments | One helper per language for chapter-name formatting. |
| [0240](../adr/0240-a-markdown-table-of-contents-is-the-first-list-of-in-file-heading-links-matched-as-a-docx-one-is.md) | IMPL | N | Proposed | docs/utilities import reference | Markdown TOC detection rule in the importer. |
| [0241](../adr/0241-a-subtitle-set-apart-from-its-heading-is-read-as-the-subtitle-and-an-epub-heading-that-starts-no-chapter-is-kept-as-text.md) | IMPL | Y | Proposed | docs/utilities import reference | Two importer heuristics: detached subtitle and EPUB heading handling. |
| [0242](../adr/0242-the-recording-check-writes-the-chapters-word-alignment-as-additive-lines-and-align-again-never-transcribes.md) | IMPL | Y | Accepted | wire contract reference | Additive tagged output lines; bundles align-again no-transcribe rule. |
| [0243](../adr/0243-the-ui-atlas-kit-is-dissolved-into-apps-ui-which-owns-its-visual-suite-and-atlas-outright.md) | ENG | N | Accepted | keep | Dev-tooling layout: dissolve atlas kit into apps/ui. |
| [0244](../adr/0244-the-playwright-suites-are-sharded-in-ci-the-quick-checks-share-a-runner-per-os-and-one-check-sums-up-the-run.md) | ENG | N | Accepted | docs/operations/ci.md | CI sharding and job layout for Playwright suites. |
| [0245](../adr/0245-chapter-and-credits-regions-are-planned-by-the-host-from-confirmed-links-and-the-saved-project.md) | ARCH | N | Proposed | keep | Host owns region planning; UI only chooses, a UI/host responsibility boundary. |
| [0246](../adr/0246-punch-and-roll-moves-only-the-edit-cursor-and-anchors-words-by-a-polled-play-position.md) | ARCH | Y | Proposed | keep | Live-anchor integration approach via polled play position; bundles edit-cursor-only command. |
| [0247](../adr/0247-the-input-level-comes-from-the-sidecars-own-capture-and-a-model-free-meter-child-runs-before-start.md) | ARCH | N | Accepted | keep | Measure input level in the sidecar's capture via a model-free child process, not the webview. |
| [0248](../adr/0248-pause-is-a-pause-and-resume-pair-on-the-control-file-and-a-paused-session-stays-running.md) | IMPL | N | Accepted | reference sidecar control-channel doc | Two commands added to an existing control channel. |
| [0249](../adr/0249-read-aloud-asks-reaper-once-whether-the-chapters-linked-track-is-the-one-track-armed.md) | UX | N | Accepted | PRD read-aloud | When the dialog asks REAPER about the armed track and what it shows. |
| [0250](../adr/0250-the-teleprompter-preselects-reapers-microphone-only-on-a-sure-match-of-its-device-name.md) | IMPL | N | Accepted | code comment in daw/MatchInputDevice | Device-name matching algorithm and confidence rule. |
| [0251](../adr/0251-tool-runs-are-logged-as-json-lines-through-slog-with-a-run-id-and-content-is-never-logged.md) | ARCH | N | Accepted | keep | Cross-cutting structured logging architecture with run ids and a no-content privacy rule. |
| [0252](../adr/0252-level-normalize-ships-without-clause-split-because-word-timing-is-not-persisted-anywhere.md) | UX | N | Proposed | PRD / roadmap | Scope deferral: ship level normalize, defer clause split. |
| [0253](../adr/0253-bridge-commands-carry-the-hosts-run-id-as-trailing-fields-and-lua-logs-them-to-bridge-jsonl-at-debug-level.md) | IMPL | N | Accepted | reference bridge wire doc | Additive trailing run-id fields on two commands and a Lua debug log. |
| [0260](../adr/0260-the-read-aloud-dialog-reads-the-credits-too-and-keeps-no-findings-for-them.md) | UX | N | Proposed | PRD read-aloud | Read-aloud dialog also reads credits and keeps no findings for them. |
| [0261](../adr/0261-the-read-aloud-heading-and-every-context-prefixed-chapter-name-follow-the-same-rule.md) | UX | N | Proposed | UI copy guide / design-system.md | Chapter-name prefix punctuation (colon vs em dash) is a UI copy rule. |
| [0262](../adr/0262-cleanup-trims-are-found-by-matching-the-measured-file-to-a-live-item-and-applied-as-a-split-and-delete-inside-one-undo-block.md) | IMPL | N | Proposed | package doc in apps/desktop/internal/cleanupmap | Matching algorithm and split-and-delete mechanics of one feature; no structural or dependency change. |
| [0263](../adr/0263-a-character-reference-approves-a-saved-regions-snapshot-not-the-live-region.md) | DATA | Y | Accepted | reference/data-files | Snapshot shape, .rpp source, references.json storage and reset rule bundled; feature data model. |
| [0264](../adr/0264-the-recording-check-summary-moves-into-a-slide-over-opened-from-the-rows-own-status-and-the-check-button-retires.md) | UX | N | Proposed | PRD production board | Moves a summary into a slide-over and retires a button: UI interaction choice. |
| [0265](../adr/0265-the-workspace-highlights-by-binary-search-over-timed-tokens-and-groups-consecutive-flagged-tokens-into-one-flag.md) | IMPL | Y | Accepted | code comment in apps/ui/src/components/proof/playlist.ts | Binary-search highlighting and flag grouping are algorithm details; also bundles a playlist builder. |
| [0266](../adr/0266-the-editing-check-panel-reads-its-per-class-state-from-srs-stage-signals-and-keeps-progress-inline-so-candidates-stay-visible-while-it-runs.md) | UX | N | Proposed | PRD editing check panel | Which signals a panel shows and inline progress placement: panel behaviour. |
| [0267](../adr/0267-the-atlas-drives-a-storys-four-variants-from-one-page-load-except-a-play-fn-story.md) | IMPL | N | Accepted | code comment in apps/ui/tests/atlas/atlas.spec.ts | Test-runner optimisation (one page load per story); harness detail. |
| [0300](../adr/0300-every-daw-is-reached-through-one-port-of-small-role-interfaces-and-callers-ask-a-resolver-what-it-supports.md) | ARCH | N | Accepted | keep | Single DAW port of role interfaces plus resolver: core module boundary for every engine. |
| [0301](../adr/0301-providers-sit-behind-small-ports-with-a-registry-and-a-capability-descriptor.md) | ARCH | N | Accepted | keep | Provider ports, registry and capability descriptor: cross-language extension architecture. |
| [0302](../adr/0302-dawport-roles-exchange-the-bridges-own-types-through-aliases-and-an-asynchronous-role-is-one-method-per-command.md) | ARCH | N | Proposed | keep | Port interface shape (type aliases, one method per async command) defines the DAW interface. |
| [0303](../adr/0303-a-daw-adapter-factory-is-given-the-launchs-environment-and-opens-the-engines-transport-itself.md) | IMPL | N | Proposed | package doc in apps/desktop/internal/dawport | Factory signature and registry panics refine ADR 0300; wiring detail. |
| [0304](../adr/0304-bridge-actions-asks-a-per-command-gate-and-the-daw-ports-resolver-answers-it-from-the-per-capability-settings.md) | IMPL | N | Proposed | package doc in apps/desktop/internal/bridge | Gate closure wiring between Actions and resolver; internal plumbing. |
| [0305](../adr/0305-the-daw-heartbeat-carries-the-transport-and-is-sent-at-once-when-it-changes.md) | IMPL | N | Accepted | reference/wire contracts (REAPER events) | Two optional heartbeat fields and a send-on-change rule; contract detail, not protocol shape. |
| [0306](../adr/0306-mastering-is-a-provider-port-and-measurement-stays-one-in-process-judge.md) | ARCH | N | Proposed | keep | Mastering becomes a provider port with registry and conformance suite: module boundary. |
| [0320](../adr/0320-pfh-and-the-effective-rate-come-only-from-logged-hours-and-measured-recorded-time.md) | IMPL | N | Proposed | code comment in apps/desktop/internal/production/pfh.go | Metric formula definitions and undefined cases for PFH. |
| [0321](../adr/0321-the-mastering-chain-is-a-fixed-high-pass-limiter-and-gain-that-masters-to-the-profiles-own-measured-rms-and-sample-peak.md) | IMPL | N | Proposed | reference/mastering.md | Fixed DSP chain and target levels are algorithm parameters. |
| [0322](../adr/0322-delivery-findings-are-saved-for-review-per-measured-file-versioned-by-the-audio-and-the-rules-bound.md) | IMPL | N | Proposed | reference/findings-store.md | Finding ids, evidence_version hash inputs and store scope naming. |
| [0323](../adr/0323-production-deadlines-and-milestones-are-calendar-dates-on-the-project-manifest.md) | DATA | N | Proposed | reference/data-files | Additive manifest fields and date string format. |
| [0324](../adr/0324-structural-front-matter-captured-at-import-outranks-the-plain-text-guess-and-docx-properties-in-credits-detection.md) | IMPL | Y | Proposed | code comment in internal/credits/detect.go | Detection precedence plus markdown fence and DOCX style parsing rules bundled. |
| [0325](../adr/0325-an-mp3s-levels-are-decoded-through-a-decoder-port-the-same-catalogued-ffmpeg-build-runs-in-reverse.md) | ARCH | N | Proposed | keep | Decoder port and dependency direction to avoid a cycle; reuses external FFmpeg for decoding. |
| [0327](../adr/0327-dx-4-windowed-findings-need-a-chapter-and-paragraph-anchor-and-a-store-scope-before-a-consumer-can-gate-on-them.md) | IMPL | N | Proposed | GitHub issue #510 | Records a known gap and deferred work; a backlog note, not a decision. |
| [0329](../adr/0329-editing-readiness-ground-truth-is-a-labeled-csv-over-whole-files-scored-against-dx-phase-9s-shipped-detector.md) | ENG | N | Proposed | docs/testing/editing-ground-truth.md | Labeled-CSV ground truth and scoring harness: test/evaluation strategy. |
| [0333](../adr/0333-a-credits-checks-basis-is-its-rendered-template-text-via-a-synthetic-manuscript-the-sidecar-reads-unmodified.md) | IMPL | N | Proposed | code comment in internal/coverage | Credits basis via synthetic manuscript is a reuse trick inside one feature. |
| [0340](../adr/0340-a-p5-async-role-is-taken-from-the-live-adapter-not-resolver-role-and-only-the-toggle-gates-the-send.md) | IMPL | N | Accepted | code comment in configureLocked | Where an async role is obtained and which check gates its send. |
| [0341](../adr/0341-a-recheck-splice-keeps-a-words-files-model-string-and-adds-spans-and-a-plain-check-refuses-another-models-cache.md) | DATA | Y | Accepted | reference/data-files (words file) | Additive spans field on words files plus a cache-refusal rule. |
| [0342](../adr/0342-the-mp3-encoder-is-a-pinned-gpl-ffmpeg-build-run-as-a-separate-process-and-writes-no-tag-frame.md) | ARCH | N | Proposed | keep | External GPL FFmpeg dependency, run out of process, pinned: dependency and licensing. |
| [0343](../adr/0343-an-encode-writes-a-partial-file-beside-its-destination-checks-it-with-the-apps-own-mp3-reader-and-never-replaces-a-file.md) | IMPL | N | Proposed | code comment in internal/encodeport/ffmpeg.go | Partial-file, verify, rename and refusal rules of one function. |
| [0344](../adr/0344-the-cascades-second-pass-is-a-relaunch-in-the-same-job-and-its-words-key-on-the-model-pair.md) | IMPL | N | Proposed | code comment in coverage job service | Job stage machine and cache key composition. |
| [0345](../adr/0345-a-story-bible-entity-keeps-its-id-by-name-overlap-and-dialogue-cues-are-precision-first-rules.md) | IMPL | Y | Accepted | sidecar code comments / reference | Entity id matching, alias split, scene maps and cue rules: several algorithms bundled. |
| [0346](../adr/0346-a-pronunciation-carries-a-status-and-note-and-the-narrators-own-sits-beside-the-dictionarys-as-the-alternate.md) | DATA | N | Accepted | reference/data-files (story bible) | Pronunciation object fields (status, note, alternate); partly superseded by 0792. |
| [0347](../adr/0347-the-pronunciation-query-export-is-csv-with-its-ids-last-and-a-formula-guard-and-is-a-download.md) | DATA | N | Superseded | delete (feature removed by 0792) | CSV column order and formula guard of an export file. |
| [0348](../adr/0348-character-continuity-acoustic-features-are-a-dependency-free-go-package-with-a-percentile-voicing-gate.md) | ARCH | Y | Accepted | keep (move params to reference) | Dependency-free Go port of acoustic analysis; bundles frame sizes and voicing threshold. |
| [0349](../adr/0349-the-resume-locate-reads-reapers-live-cursor-and-items-first-and-falls-back-to-the-saved-project-never-to-a-guess.md) | IMPL | N | Proposed | code comment in teleprompter locate | Lookup order (live, then saved project) for one feature. |
| [0351](../adr/0351-the-cascades-settings-are-independent-and-the-recheck-gate-is-its-own-status.md) | IMPL | N | Proposed | reference/settings | Three settings keys and a status value. |
| [0352](../adr/0352-a-re-imported-query-answer-is-matched-by-entry-id-and-alias-index-and-a-blank-note-column-leaves-the-note-alone.md) | IMPL | N | Superseded | delete (feature removed by 0792) | CSV re-import matching keys and blank-note handling. |
| [0353](../adr/0353-the-resume-prompt-goes-away-when-reaper-plays-and-a-bounded-host-poll-follows-the-cursor-only-while-it-shows.md) | UX | N | Proposed | PRD teleprompter resume | When a prompt dismisses and how long a poll follows: feature behaviour. |
| [0354](../adr/0354-a-continuity-baseline-is-a-leave-one-out-percentile-of-approved-unchanged-references-and-a-chain-difference-only-lowers-a-flag.md) | IMPL | N | Accepted | reference/continuity.md | Leave-one-out percentile baseline and outlier rule: algorithm parameters. |
| [0355](../adr/0355-audacity-is-driven-over-its-scripting-pipe-built-from-the-published-spec-and-verified-by-the-owners-pass.md) | ARCH | N | Proposed | keep | Integration approach for Audacity via mod-script-pipe behind a Transport interface. |
| [0356](../adr/0356-the-merriam-webster-key-is-sealed-in-its-own-per-user-file-and-the-online-lookup-is-a-go-only-port-with-a-single-word-rule.md) | ARCH | Y | Proposed | keep | Credential storage and secret handling (security architecture), bundled with port and single-word rule. |
| [0357](../adr/0357-the-built-in-recorders-capture-engine-is-a-wasapi-shared-mode-row-of-the-capture-port-through-portaudio-in-the-sidecar.md) | ARCH | N | Proposed | keep | Capture library choice (PortAudio/WASAPI shared) and placement in the sidecar. |
| [0360](../adr/0360-studio-primitives-land-as-flat-leaf-files-after-one-token-batch-and-capability-gating-is-a-primitive.md) | VISUAL | Y | Accepted | design-system.md | Token batch sequencing, flat primitive files and gating primitive bundled; design-system rules. |
| [0361](../adr/0361-app-commands-go-through-one-registry-and-keyboard-midi-and-hid-are-input-sources-bound-by-a-remappable-keymap.md) | ARCH | N | Accepted | keep | One command registry and input-source/keymap layering: UI module boundary. |
| [0362](../adr/0362-studio-token-batch-aliases-meter-and-badge-colours-and-a-minimal-booth-override.md) | VISUAL | N | Proposed | design-system.md | Meter and badge colour token aliases and tint percentages. |
| [0363](../adr/0363-backspace-on-an-empty-tag-input-removes-the-last-chip.md) | UX | N | Proposed | code comment in TagInput primitive | A single keyboard interaction of one component. |
| [0364](../adr/0364-the-end-to-end-corpus-validation-is-synthetic-and-provisional-until-a-permissioned-project-re-runs-it.md) | ENG | N | Proposed | docs/testing | Synthetic provisional corpus tests stand in for real data: test strategy. |
| [0365](../adr/0365-the-theme-is-one-global-setting-and-the-booth-and-companion-follow-it.md) | VISUAL | N | Accepted | design-system.md | Theme scope: booth and companion follow the global theme tokens. |
| [0366](../adr/0366-the-export-job-combines-mastering-and-encoding-and-intermediates-live-in-the-sidecar-tree.md) | IMPL | Y | Proposed | reference/export-job | Job composition, intermediate folder location and package job shape bundled. |
| [0367](../adr/0367-per-speaker-colours-alias-the-seven-entity-kind-hues-and-hash-by-speaker-name.md) | VISUAL | N | Proposed | design-system.md | Speaker colour tokens alias kind hues and hash by name. |
| [0380](../adr/0380-record-in-reaper-is-a-project-scope-setting-and-arming-is-a-separate-click-from-play.md) | UX | N | Accepted | PRD read-aloud recording | Setting scope and separate arm click; arming part superseded by 0791. |
| [0381](../adr/0381-the-companion-panel-is-the-read-aloud-session-in-the-whole-window-and-follows-the-voice-not-the-daw-playhead.md) | UX | N | Proposed | PRD companion mode | Companion surface layout and what its script follows. |
| [0382](../adr/0382-script-markup-is-a-chapter-keyed-sidecar-of-line-offsets-checked-on-read-and-drawn-without-changing-the-text.md) | DATA | N | Proposed | reference/data-files | markup.json shape, staleness rules and lifetime. |
| [0383](../adr/0383-the-preview-pin-is-one-per-book-stale-by-anchor-text-and-never-re-ranked.md) | UX | N | Accepted | PRD sample preview | One pin per book and staleness behaviour: product rule. |
| [0388](../adr/0388-the-booth-is-a-page-keyed-by-its-address-and-only-exit-booth-stops-a-live-session.md) | UX | N | Proposed | PRD studio-next-booth | Routing by address and which exits stop a session. |
| [0392](../adr/0392-the-script-pages-prep-status-is-the-names-still-to-confirm-and-its-rail-is-a-panel-below-2xl.md) | UX | Y | Proposed | PRD script page | Prep status meaning, breakpoints and a file move bundled. |
| [0393](../adr/0393-the-script-pages-three-columns-show-from-1440px-and-the-reader-card-header-keys-off-its-own-width.md) | VISUAL | Y | Accepted | design-system.md | Breakpoints, container queries and a Tailwind ordering gotcha. |
| [0399](../adr/0399-a-production-board-cell-opens-its-stage-for-the-chapter-and-the-current-stage-cell-carries-the-status.md) | UX | N | Proposed | PRD production board | Which panel each board cell opens. |
| [0400](../adr/0400-promoting-a-reaper-command-from-experimental-to-supported-is-a-one-line-daw-port-declaration-change.md) | PROCESS | N | Proposed | reaper-command-add skill | A two-edit how-to for promoting a command. |
| [0401](../adr/0401-companion-mode-resizes-and-pins-the-one-existing-window-and-never-opens-a-second-one.md) | ARCH | N | Accepted | keep | Single-window shell model: companion resizes and pins, never a second window. |
| [0402](../adr/0402-coreaudio-capture-is-a-pyav-avfoundation-sidecar-backend-addressed-by-device-name.md) | ARCH | N | Superseded | keep (superseded by 0412) | CoreAudio capture backend library choice for macOS. |
| [0403](../adr/0403-the-capabilities-flag-reports-what-registered-not-what-loads.md) | IMPL | N | Accepted | sidecar CLI reference | Semantics of one CLI flag and the smoke check comparison. |
| [0404](../adr/0404-production-next-up-ranks-chapters-by-held-back-readiness-then-stage-and-the-deadline-is-shown-not-projected.md) | UX | N | Proposed | PRD production overview | Ranking order for a Next up list; projection part superseded. |
| [0405](../adr/0405-pronunciation-stays-local-first-behind-cmu-wiktextract-and-espeak-with-merriam-webster-as-the-one-narrator-keyed-online-source.md) | ARCH | N | Proposed | keep | Local-first pronunciation sources and one online provider: external integration and privacy. |
| [0406](../adr/0406-the-status-report-leaves-out-the-contracted-amount-and-effective-rate-unless-the-narrator-opts-in.md) | UX | N | Proposed | PRD status report | Privacy default of a report field, opt-in checkbox. |
| [0407](../adr/0407-a-new-page-replaces-its-old-counterpart-in-the-same-change-and-the-navigation-is-grouped-by-production-stage.md) | PROCESS | Y | Accepted | CONTRIBUTING / docs/operations | Page-replacement PR rule and nav grouping bundled. |
| [0410](../adr/0410-the-adr-index-is-generated-from-each-adrs-heading-and-status-line-and-a-stale-index-fails-the-gate.md) | PROCESS | N | Proposed | docs/operations/adr-workflow.md | Generated ADR index and its gate: docs workflow. |
| [0411](../adr/0411-the-release-pipeline-splits-build-from-publish-and-caches-only-pure-function-build-outputs-never-test-verdicts.md) | ENG | N | Accepted | keep | Release pipeline split and caching policy: supply chain and build construction. |
| [0412](../adr/0412-windows-is-the-only-supported-platform-for-now.md) | ARCH | N | Accepted | keep | Platform support narrowed to Windows x64. |
| [0413](../adr/0413-what-stays-of-the-other-platforms-when-windows-is-the-only-one.md) | IMPL | N | Proposed | fold into ADR 0412 / platform notes | Follow-up bookkeeping of what platform code remains. |
| [0414](../adr/0414-the-teleprompter-default-engine-stays-whisper-tiny-until-a-real-time-ab-evaluation-runs.md) | IMPL | N | Proposed | comment in config/defaults.json or issue | Keeps a default model value pending evaluation. |
| [0415](../adr/0415-while-pages-is-paused-docs-are-checked-by-lychee-and-a-changed-file-markdownlint-not-by-building-the-site.md) | ENG | N | Accepted | docs/operations/ci.md | Temporary docs CI checks while Pages paused. |
| [0416](../adr/0416-librivox-readings-of-the-demo-script-are-fetched-from-archive-org-and-only-their-markers-and-recipes-are-committed.md) | ENG | N | Proposed | tests/fixtures README | Fixture sourcing strategy: fetched audio, committed markers. |
| [0430](../adr/0430-the-engine-panel-is-a-wide-slide-over-from-the-engine-chip-and-every-pointer-to-the-tracks-page-opens-it.md) | UX | Y | Proposed | PRD engine panel | Panel placement, SlideOver size and link rewiring bundled. |
| [0431](../adr/0431-character-review-ui-ships-region-approval-and-cue-correction-only-with-no-in-app-reaper-playback.md) | UX | N | Accepted | PRD character review | Feature scope of a UI release. |
| [0435](../adr/0435-render-with-fx-renders-one-region-at-a-time-into-a-run-folder-with-a-one-time-approval-and-puts-the-narrators-render-settings-back.md) | IMPL | Y | Proposed | reference/reaper-bridge commands | Lua render command mechanics, token rule and settings restore bundled. |
| [0440](../adr/0440-master-and-qcs-platform-tabs-are-the-projects-delivery-profile-and-the-page-draws-only-what-the-host-measures.md) | UX | N | Proposed | PRD master-and-qc | Tabs as profile choice and page sections: page layout. |
| [0450](../adr/0450-series-storage-is-a-per-user-file-and-cross-project-reference-reads-never-write-into-a-sibling-project.md) | ARCH | Y | Accepted | keep | Per-user series persistence and read-only cross-project isolation; bundles shared-data scope. |
| [0455](../adr/0455-the-built-in-recorder-records-each-take-to-a-partial-file-in-the-projects-recordings-folder-and-links-it-to-its-take-name.md) | ARCH | N | Proposed | keep | Recorder engine port and sidecar adapter: module boundary for built-in recording. |
| [0460](../adr/0460-the-audacity-mastering-row-is-its-own-row-not-daw-and-imports-the-source-as-its-own-track-before-the-macro.md) | IMPL | N | Proposed | package doc in internal/masteringport | A registry row and its macro flow within existing ports. |
| [0465](../adr/0465-the-shells-header-states-are-also-captured-at-the-reflow-width-because-thats-what-a-narrator-sees-at-high-zoom.md) | IMPL | N | Proposed | code comment in apps/ui/tests/visual/catalog/shell.ts | Extra viewport for three visual test states. |
| [0470](../adr/0470-proof-follows-mock-04-pickup-edit-waived-are-words-over-the-stored-status-and-the-chapter-view-leads-with-its-notes.md) | UX | Y | Proposed | PRD proof page | Mock-driven labels, header chips and sources line bundled. |
| [0480](../adr/0480-multi-platform-export-is-a-separate-checkbox-list-encoding-once-per-differing-format-built-sequentially.md) | UX | Y | Proposed | PRD multi-platform export | Checkbox list UX, format suffix convention and sequential build bundled. |
| [0485](../adr/0485-a-native-takes-line-identity-lives-in-a-project-owned-sidecar-file-mirroring-but-not-sharing-code-with-adr-0026.md) | DATA | N | Accepted | reference/data-files | line-identity.json file location and shape. |
| [0495](../adr/0495-a-credits-rows-check-and-track-link-reuse-recordingcheck-and-mappingconfirm-through-a-synthetic-chapter-and-a-credits-aware-title-lookup.md) | IMPL | N | Proposed | code comments in recordingCheckText.ts / mapping.go | Reuse via synthetic chapter id and title lookup. |
| [0510](../adr/0510-click-and-breath-signals-open-only-on-a-recorded-permissioned-held-out-run-at-target-in-every-condition.md) | ENG | N | Proposed | docs/testing/editing-ground-truth.md | Release bar for detector signals on a held-out run: evaluation gate. |
| [0511](../adr/0511-click-and-breath-sensitivity-is-a-scan-parameter-and-its-defaults-only-move-toward-more-candidates.md) | IMPL | Y | Proposed | test + comment in internal/editing (validationrun_test.go) | Detector default values, a tuning rule and finding persistence; parameter choices, not structure |
| [0520](../adr/0520-the-peaks-cache-holds-one-whole-source-entry-and-the-strip-reuses-timelines-backdrop.md) | IMPL | Y | Accepted | code comment in internal/measure/cache.go + WaveformStrip.tsx | Cache key granularity plus a UI component reuse choice; two unrelated local details |
| [0525](../adr/0525-proofing-is-met-by-a-current-zero-open-pickup-source-and-every-required-delivery-check-confirmed-through-the-shared-stage-engine.md) | UX | N | Proposed | PRD proofing signals | Defines when a proofing signal reads met/not_met/unknown; product rule |
| [0545](../adr/0545-native-takes-join-take-review-as-a-parallel-line-scoped-panel-not-the-repeats-scan.md) | UX | Y | Proposed | PRD native takes | Panel placement, assignment UI, keeper marks and a new keeper.json bundled |
| [0550](../adr/0550-editings-render-source-is-a-second-whole-file-scan-the-narrator-picks-per-chapter-never-a-silent-replacement.md) | ARCH | Y | Proposed | keep | Editing reuses proofing's render store, adds a choice store and fingerprint-scoped ledger; module boundaries |
| [0560](../adr/0560-punch-and-roll-times-a-word-past-the-anchors-by-aligning-it-in-the-recording-before-falling-back-to-the-reading-pace.md) | ARCH | N | Proposed | keep | Adds a sidecar align-word mode as a punch-time source; external integration approach |
| [0565](../adr/0565-the-series-voice-bible-pools-reference-clips-by-character-id-and-shows-no-books-until-a-second-book-has-data.md) | UX | Y | Accepted | PRD series voice bible | Grouping, labels, display names, empty state and error reporting for one feature |
| [0566](../adr/0566-series-membership-is-managed-from-the-series-tab-itself-reusing-the-project-folder-picker.md) | UX | N | Accepted | PRD series | Where series membership is managed and which picker it reuses |
| [0567](../adr/0567-series-is-one-more-tab-of-the-story-bible-not-a-separate-layout-and-there-is-no-audition-to-reuse-yet.md) | UX | N | Accepted | PRD series | Series tab placement in Story Bible and what is left out of the UI |
| [0568](../adr/0568-a-sibling-books-character-names-are-read-through-a-new-plain-never-quarantining-guide-readonlynames.md) | IMPL | N | Accepted | code comment in internal/guide/readonly.go | One read-only function's behaviour and missing-file rule |
| [0575](../adr/0575-the-librivox-signal-set-is-a-second-click-evaluation-split-by-pause-that-reports-and-never-opens-the-gate-alone.md) | ENG | N | Proposed | docs/testing or test comment in librivoxvalidation_test.go | Validation-corpus test strategy for click detection; construction/test technique |
| [0585](../adr/0585-mock-fidelity-is-a-pixel-match-at-the-mocks-own-size-and-theme-scored-by-a-tool-that-reports-and-does-not-gate.md) | ENG | N | Proposed | docs/testing visual (mock-match tool) | Report-only pixel-match tool scoring UI against mocks; test tooling |
| [0590](../adr/0590-the-mock-fidelity-token-batch-fills-badges-with-opaque-soft-tokens-and-names-the-mocks-sizes-and-type.md) | VISUAL | N | Proposed | design-system.md | Colour, size and type token values |
| [0595](../adr/0595-button-has-two-measured-sizes-a-surface-filled-secondary-and-a-link-and-owns-its-look.md) | VISUAL | N | Proposed | design-system.md | Button sizes, chrome and variants |
| [0600](../adr/0600-every-pill-tag-and-status-dot-is-one-badge-primitive-with-a-pill-a-tag-and-a-booth-shape.md) | VISUAL | N | Proposed | design-system.md | Badge primitive shapes, looks and tones |
| [0605](../adr/0605-table-and-stage-grid-share-the-mocks-row-and-header-sizes-and-cells-sit-in-the-middle-of-the-row.md) | VISUAL | N | Proposed | design-system.md | Table row/header sizes and cell alignment |
| [0610](../adr/0610-inputs-fill-an-unselected-radio-with-surface-3-and-the-focus-ring-is-focus-visible-not-focus.md) | VISUAL | N | Proposed | design-system.md | Radio fill token and focus-visible ring |
| [0615](../adr/0615-statstrip-is-a-new-primitive-drawing-the-benchmarks-one-card-kpi-row.md) | VISUAL | N | Proposed | design-system.md | New StatStrip KPI card primitive look |
| [0616](../adr/0616-stattile-takes-the-benchmarks-measured-label-and-value-sizes.md) | VISUAL | N | Proposed | design-system.md | StatTile label/value type sizes |
| [0617](../adr/0617-progressbar-gains-a-thin-toned-variant-for-the-benchmarks-under-tile-and-weekly-bars.md) | VISUAL | N | Proposed | design-system.md | ProgressBar thin/toned variant |
| [0618](../adr/0618-levelmeter-is-a-position-graded-led-ladder-not-one-flat-colour-for-the-current-reading.md) | VISUAL | N | Proposed | design-system.md | LevelMeter gradient LED ladder look |
| [0619](../adr/0619-meterbar-is-removed-its-one-consumer-is-gone.md) | IMPL | N | Proposed | commit message / PR description | Deleting an unused component; housekeeping, no decision |
| [0620](../adr/0620-kbd-draws-plex-mono-caps-in-two-sizes-with-a-pressed-bottom-edge-and-keyhint-composes-one-with-its-action.md) | VISUAL | Y | Proposed | design-system.md | Kbd sizes/font, new KeyHint, Toolbar gap prop bundled |
| [0625](../adr/0625-the-underline-tab-the-sidebar-tab-and-the-segmented-toggle-group-are-measured-and-one-container.md) | VISUAL | N | Proposed | design-system.md | Tabs, Pill and ToggleGroup measured looks and segmented variant |
| [0630](../adr/0630-overlays-keep-the-mocks-frame-a-nested-dialog-dims-the-page-and-a-combobox-popup-is-a-listbox-not-a-popover.md) | VISUAL | Y | Proposed | design-system.md | Dialog, SlideOver, Toast sizes, backdrop and combobox semantics bundled |
| [0635](../adr/0635-the-nav-rail-and-header-take-the-benchmark-sizes-and-every-header-chip-is-one-headerchip-primitive.md) | VISUAL | N | Proposed | design-system.md | Nav rail/header sizes and a HeaderChip primitive |
| [0636](../adr/0636-the-mock-match-tool-scores-the-nav-rail-and-header-apart-from-the-page.md) | ENG | N | Proposed | docs/testing visual (mock-match tool) | Mock-match tool scores rail/header regions separately; test tooling detail |
| [0640](../adr/0640-panel-draws-the-mocks-card-header-with-a-divider-and-a-padded-or-flush-body-and-the-eyebrow-and-inset-card-are-primitives.md) | VISUAL | N | Proposed | design-system.md | Panel card header, divider, body padding, eyebrow |
| [0645](../adr/0645-the-production-board-draws-mock-01s-cells-columns-and-layout-and-the-mock-wins-the-open-audit-layout-questions.md) | VISUAL | N | Proposed | design-system.md + PRD production board | Board cell shape, columns and layout from a mock |
| [0650](../adr/0650-proofs-notes-card-composes-table-flush-statusbadge-and-panels-header-and-the-filters-move-behind-a-popover.md) | UX | N | Proposed | PRD proof | Notes card composition and moving filters behind a popover; page layout |
| [0651](../adr/0651-proofs-book-level-draws-no-waveform-header-because-its-notes-span-more-than-one-chapter.md) | UX | N | Rejected | PRD proof (decisions log) | Whether book-level Proof shows a waveform; page content choice |
| [0652](../adr/0652-a-book-level-waveform-and-a-denser-notes-list-measurably-lower-mock-04s-score-so-adr-0651-stands.md) | UX | N | Rejected | PRD proof (decisions log) | Mock score evidence for keeping 0651; page content choice |
| [0655](../adr/0655-the-booths-current-word-is-an-accent-tint-with-a-caret-not-a-solid-fill.md) | VISUAL | N | Proposed | design-system.md | Current-word highlight tint and caret |
| [0656](../adr/0656-the-booths-rec-pill-draws-with-its-own-rec-fillrec-text-tokens-not-a-status-tone.md) | VISUAL | N | Proposed | design-system.md | REC pill colour tokens |
| [0657](../adr/0657-focusshell-takes-a-contentclassname-for-a-hosts-own-main-region-look.md) | IMPL | N | Proposed | code comment in FocusShell.tsx | One optional className prop |
| [0658](../adr/0658-the-booth-command-bar-composes-toolbar-and-keyhint-wrapping-popovers-from-outside.md) | VISUAL | N | Proposed | design-system.md | Booth command bar composition, KeyHint label, bar height |
| [0659](../adr/0659-the-companion-panels-sections-are-full-bleed-split-by-rules-not-cards.md) | VISUAL | N | Proposed | design-system.md | Companion sections as rules not cards, button size, row font |
| [0660](../adr/0660-audacitys-finding-detail-hides-reapers-take-management-instead-of-disabling-it-through-capabilitygate.md) | UX | N | Proposed | PRD DAW capabilities / Audacity | Hide versus disable REAPER-only controls under Audacity |
| [0665](../adr/0665-master-s-rule-marks-compose-statusbadge-warn-and-muted-keep-their-outline-look.md) | VISUAL | N | Proposed | design-system.md | Mark tone to StatusBadge mapping and looks |
| [0666](../adr/0666-the-book-consistency-band-draws-the-rule-s-bound-as-a-dashed-target-zone-with-one-accent-tick-per-file.md) | VISUAL | N | Proposed | design-system.md | Consistency band target-zone drawing |
| [0667](../adr/0667-the-mastering-chain-s-steps-are-badges-and-the-last-one-is-accent-soft.md) | VISUAL | N | Proposed | design-system.md | Mastering chain steps drawn as badges |
| [0668](../adr/0668-a-flush-table-inside-a-scrolling-ancestor-puts-the-bleed-on-the-scroll-wrapper-not-the-table.md) | IMPL | N | Proposed | code comment in Table/tableStyles.ts | CSS bleed placement on scroll wrapper; a styling technique |
| [0670](../adr/0670-scripts-chapter-list-keeps-its-to-confirm-count-and-shows-no-checkmark-or-percentage-until-prep-depths-rollup-lands.md) | UX | N | Proposed | PRD script prep | Chapter list shows count, no checkmark/percentage; product scope |
| [0680](../adr/0680-the-story-bible-preview-speaks-a-chosen-pronunciation-through-pipers-raw-phoneme-block.md) | IMPL | N | Accepted | code comment in sidecar render_audio | Preview speaks chosen IPA via Piper phoneme block; one function behaviour |
| [0695](../adr/0695-alias-pronunciation-gets-the-entitys-own-control-and-a-default-source-only-reorders-the-automatic-fallback.md) | UX | N | Accepted | PRD Story Bible pronunciation | Alias gets entity's pronunciation controls; default source reorders fallback |
| [0700](../adr/0700-the-takes-panel-lists-a-passages-takes-from-the-saved-project-and-chooses-one-by-an-id-the-host-offered.md) | ARCH | N | Accepted | keep | Host owns take alternates and accepts only host-offered ids; trust boundary and binding shape |
| [0705](../adr/0705-the-workspace-adds-an-effect-to-a-passage-or-a-chain-to-the-chapters-track-only-after-the-narrator-confirms-and-the-host-names-both-targets.md) | ARCH | N | Accepted | keep | Page names words not targets, host resolves, refusals as results; DAW interface/trust boundary |
| [0715](../adr/0715-proofs-book-level-waveform-card-belongs-to-the-chapter-its-selector-names.md) | UX | N | Accepted | PRD proof | Book-level waveform card follows a chapter selector; page layout |
| [0720](../adr/0720-the-booth-fills-the-whole-window-and-f11-takes-the-window-fullscreen.md) | UX | N | Accepted | PRD booth | Booth fills window, F11 fullscreen command |
| [0725](../adr/0725-the-rail-draws-a-count-badge-only-from-a-count-the-host-reports-and-the-product-is-named-studio.md) | UX | Y | Accepted | PRD navigation + brand guide | Rail count badges and product name bundled |
| [0740](../adr/0740-mock-match-is-text-blind-and-a-diagnostic-and-only-the-benchmark-mocks-are-kept.md) | ENG | Y | Accepted | docs/testing visual + docs/operations | Text-blind mock-match metric bundled with deleting mock/research docs |
| [0750](../adr/0750-proofs-waveform-card-opens-on-the-last-chapter-looked-at-draws-a-placeholder-without-a-recording-and-filters-the-notes.md) | UX | N | Accepted | PRD proof | Waveform card default chapter, placeholder and filter behaviour |
| [0755](../adr/0755-the-product-is-named-narration-studio-to-the-user-and-narration-utils-stays-on-every-name-a-file-a-key-or-reaper-holds.md) | UX | N | Accepted | brand/naming guide in docs/reference | User-facing product name versus internal identifiers; naming, no structural change |
| [0756](../adr/0756-documentation-is-kept-current-by-path-and-text-checks-on-every-pull-request-and-agent-stop-with-judgment-left-to-two-skills.md) | PROCESS | N | Accepted | docs/operations docs-workflow.md | Docs-impact and docs-slop CI checks plus skills; documentation workflow |
| [0757](../adr/0757-the-daw-reference-is-reference-docs-pinned-to-the-ports-declarations-by-a-generated-matrix-and-a-section-test.md) | PROCESS | N | Proposed | docs/reference/daw/README | How DAW reference docs are generated and tested against code |
| [0758](../adr/0758-the-agent-train-is-watched-from-outside-and-gated-by-checks-a-worker-cannot-edit.md) | PROCESS | N | Accepted | docs/operations/agent-train.md | Agent train health watching and base-branch gating |
| [0760](../adr/0760-the-studio-next-mock-is-the-only-spec-for-every-page-it-covers-tokens-primitive-sizes-and-layouts-included.md) | PROCESS | N | Accepted | docs/operations spec governance / design-system.md | Declares a mock the sole UI spec over older ADRs; spec governance |
| [0761](../adr/0761-layout-rules-read-the-reported-width-the-icon-vocabulary-is-a-data-module-and-key-caps-are-pictures-in-a-new-keycap-leaf.md) | UX | Y | Accepted | design-system.md + PRD studio-next | Responsive breakpoints, icon catalog module and KeyCap leaf bundled |
| [0770](../adr/0770-the-ui-store-caches-host-reads-and-journals-commands-and-the-go-host-stays-the-source-of-truth.md) | ARCH | N | Accepted | keep | UI read-model store, Go host as source of truth, single journalled command path |
| [0771](../adr/0771-undo-is-one-in-memory-journal-that-refuses-with-a-reason-and-reaches-the-daw-only-for-its-last-action.md) | ARCH | N | Accepted | keep | One in-memory undo journal across UI, host and DAW with conflict rules |
| [0780](../adr/0780-the-jump-menu-context-menus-and-help-are-derived-from-the-static-command-catalogue-and-dynamic-commands-come-from-providers.md) | ARCH | N | Accepted | keep | Static command catalogue plus dynamic providers; UI command module structure |
| [0781](../adr/0781-an-overlay-service-opens-dialogs-confirms-toasts-and-announcements-imperatively-and-renders-them-in-the-existing-primitives.md) | ARCH | N | Accepted | keep | Imperative overlay service with import fence to primitives; UI module boundary |
| [0790](../adr/0790-leaving-the-booth-while-recording-asks-to-stop-the-recording-the-app-started-and-a-reading-only-session-keeps-running.md) | UX | N | Accepted | PRD booth | Leaving Booth while recording asks to stop; interaction rule |
| [0791](../adr/0791-record-arms-only-the-chapters-track-and-starts-at-the-end-of-its-last-item-and-a-failed-precondition-shows-the-capabilitys-refusal-reason.md) | UX | N | Accepted | PRD booth recording | Record arms chapter track, starts at end, shows refusal reason |
| [0792](../adr/0792-a-pronunciation-records-the-source-it-came-from-and-there-is-no-query-status-query-csv-or-open-queries-badge.md) | UX | N | Accepted | PRD Story Bible pronunciation | Removes query workflow, CSV and badge; feature scope |
| [0793](../adr/0793-proofs-percent-is-the-cleared-share-of-its-notes-beside-decided-and-cleared-counters-and-a-note-is-open-until-fixed-waived-or-dismissed.md) | UX | N | Accepted | PRD proof | Definition of open/cleared notes and the Proof percent |
| [0800](../adr/0800-the-manifest-gains-a-payment-type-and-each-milestone-a-measure-an-estimate-and-a-done-flag.md) | DATA | N | Accepted | reference/data-files (manifest) + PRD production | Adds payment and milestone fields to the project manifest |
| [0801](../adr/0801-the-plan-chart-and-deadline-tone-come-from-fixed-inputs-and-the-projection-can-only-worsen-the-tone.md) | IMPL | N | Accepted | code comment in plan/progress selector + PRD | Fixed constants and tone thresholds for a chart |
| [0802](../adr/0802-schedule-and-delivery-are-pages-with-their-own-rail-items.md) | UX | N | Accepted | PRD navigation | Schedule and Delivery become pages with rail items |
| [0803](../adr/0803-an-extraction-suggestion-at-75-percent-or-more-is-applied-and-flagged-review-and-one-under-75-percent-needs-verification.md) | IMPL | N | Accepted | code comment in extraction + PRD extraction | A 75% confidence threshold and status names |
| [0804](../adr/0804-the-editing-page-replaces-the-workspace-in-proof-in-one-change.md) | UX | N | Accepted | PRD editing | Editing page replaces Proof workspace in one swap, no flag |
| [0810](../adr/0810-a-daw-call-answers-one-result-object-and-a-capability-reports-whether-it-is-destructive-and-its-mode.md) | ARCH | N | Accepted | keep | One DAW port result type and capability fields across the wire; interface shape |
| [0820](../adr/0820-a-bookmark-is-a-spot-kept-in-a-project-sidecar-checked-on-read-and-cleared-when-the-manuscript-is-replaced.md) | DATA | N | Proposed | reference/data-files (bookmarks.json) | Bookmarks file location, schema, limits and clearing |
| [0830](../adr/0830-the-recording-check-names-its-gaps-missing-extra-or-misread-and-a-confidence-is-null-with-a-reason-until-words-are-scored.md) | IMPL | N | Proposed | code comment in internal/coverage/gaps.go | Gap taxonomy derived on read; classification function |
| [0841](../adr/0841-a-recording-check-lists-the-approved-whisper-models-as-its-engines-and-a-start-may-name-one-to-run-alone.md) | IMPL | N | Proposed | code comment in coverage engines binding | Which models a binding lists and the default pick |
| [0842](../adr/0842-accepting-a-recording-check-gap-writes-one-note-and-ignoring-one-is-remembered-in-a-small-review-file.md) | DATA | N | Proposed | reference/data-files (gap-reviews.json) | Accept writes a finding; ignore persisted in a small review file |
| [0843](../adr/0843-the-status-report-preview-is-the-hosts-own-document-built-from-the-model-the-export-writes.md) | IMPL | N | Proposed | code comment in productionreport preview binding | Preview built by host from export model; one binding's behaviour |
| [0844](../adr/0844-the-narrator-can-retype-a-finding-and-the-choice-is-kept-beside-the-decisions-as-an-append-only-entry.md) | DATA | N | Proposed | reference/data-files (review.json types) | Append-only finding type entries in review.json |
| [0846](../adr/0846-extraction-suggestions-are-kept-in-a-project-file-beside-the-story-bible-and-a-rejected-one-stays-as-a-tombstone.md) | DATA | N | Proposed | reference/data-files (suggestions.json) | Suggestions file location, schema, tombstones |
| [0849](../adr/0849-script-prep-states-and-flagged-words-are-kept-in-a-project-sidecar-keyed-by-word-checked-on-read-and-cleared-when-the-manuscript-is-replaced.md) | DATA | N | Proposed | reference/data-files (script-prep.json) | Script prep sidecar file location, keys, clearing |
| [0855](../adr/0855-heard-words-carry-a-null-score-with-a-reason-and-extra-runs-become-added-words-spread-between-their-ends.md) | IMPL | N | Proposed | schema comment in workspace.go / wire contract reference | Additive payload fields for null scores and spread words |
| [0856](../adr/0856-the-editing-records-are-one-file-per-kind-keyed-by-word-with-its-text-checked-on-read-and-cleared-when-the-manuscript-is-replaced.md) | DATA | N | Proposed | reference/data-files (editing/) | Editing record files per kind, keys, validation |
| [0857](../adr/0857-the-take-suggestion-is-evidence-first-and-its-confidence-is-null-with-a-reason-until-the-takes-are-comparable.md) | IMPL | N | Proposed | code comment in components/editing/model/takes.ts | Take suggestion pure function and null-confidence tolerance |
| [0861](../adr/0861-a-refused-daw-call-carries-one-code-stale-beside-its-sentence.md) | IMPL | N | Proposed | code comment in dawport/result.go | One optional error code value on refusals |

## Appendix B: how the threat-model rows and `SECURITY.md` bullets were numbered

Sections 2.3 and 2.4 list every row and bullet. Threat-model rows are the ids in the first column (110 rows). `SECURITY.md` bullets are numbered 1 to 27 in file order under "What is in scope". Both lists come from `grep` on the files at `02cf2d4`.
