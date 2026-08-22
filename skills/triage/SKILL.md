---
name: triage
description: Draft a first-pass maintainer triage note from a contribkit receipt. Does not post comments or open pull requests.
---

# contribkit triage

Use the local receipt (or run preflight) to draft a **comment**, not to post it.

Suggested labels from receipt status:

- `blocked` → request changes; list rule ids (`issue-link`, `max-files`, `test-command`, …)
- `needs-human` → CODEOWNERS or `.github/workflows/**`; do not fake an approval
- `pass` → contract preflight is satisfied; still needs human review of the code

Do not star, follow, auto-open PRs, or claim Claude-for-OSS eligibility.
