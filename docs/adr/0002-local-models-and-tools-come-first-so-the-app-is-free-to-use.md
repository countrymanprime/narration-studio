# 0002. Local models and tools come first, so the app is free to use

**Status:** Accepted
**Significance:** A quality attribute and a cost model that every feature follows. Choosing a hosted model or a subscription service for any analysis would put a running cost on the user and take their files off their machine; reversing it means replacing each analyzer.
**Date:** 2026-09-19
**Supersedes:**

## Context

The app is a free tool for narrators, whose manuscripts and recordings are often unpublished and under contract. Analysis (speech recognition, extraction, pronunciation, voice synthesis, audio measurement) could be done with online services or with local models and tools.

**Considered options:** hosted models and subscription services (a running cost for every user, and their manuscript and audio leave the machine); a mix chosen per feature (the free promise would depend on the weakest feature).

## Decision

- Analysis uses **local models and tools first**. No audio or manuscript is sent to a cloud service, and no feature requires an online account or a subscription.
- An online source is allowed only when it is optional, local tools remain the default, and the narrator supplies their own key. The one that exists is the dictionary lookup, a Go-only port behind a single-word rule.
- Models and voices are downloaded from the hashed asset registry only after the narrator confirms, and the app's own update is checked once a day at most (a metadata request) and installed only after a click.
- Analyzers report findings and the narrator decides; they do not change the audio or the manuscript on their own. Logs never carry content.

## Consequences

- The app costs the user nothing to run, and their files stay on their machine.
- Quality is bounded by what runs locally, and models are large downloads the app has to manage.
- A feature that would need a server, an account or a paid API is a new ADR that supersedes this one, and updates the threat model's "nothing leaves the machine" statements.
- How this is enforced and what each trust boundary allows is in [the threat model](../architecture/threat-model.md) and [the design principles](../architecture/principles.md).
