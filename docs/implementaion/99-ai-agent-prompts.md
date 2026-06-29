# 99 — AI Agent Playbook

**Project:** AI Code Review Experiment Platform

**Version:** 1.0

---

# Purpose

This document provides standardized prompts and workflows for AI coding assistants (Claude Code, Cursor, GPT, Copilot, Codex, etc.).

Every implementation task should begin with one of these prompts.

The objective is to ensure that all generated code follows the project architecture, coding standards, and research methodology.

---

# General Rules

Every AI coding session should begin with:

1. Read `docs/implementation/00-development-guidelines.md`.
2. Read the relevant implementation specification.
3. Do not modify unrelated modules.
4. Follow the architecture exactly.
5. Add tests.
6. Explain assumptions before implementation.
7. Keep changes small and reviewable.

---

# Prompt 1 — Implement a New Module

```
You are implementing one module of the AI Code Review Experiment Platform.

Before writing code:

1. Read:
   - docs/implementation/00-development-guidelines.md
   - <implementation document>

2. Follow the architecture exactly.

3. Do not introduce new architectural patterns.

4. Do not modify unrelated files.

Implement the module described in the implementation document.

Requirements:

- TypeScript strict mode
- Small functions
- Dependency injection
- Interface-first design
- Unit tests included
- No TODO placeholders
- Explain any deviations from the implementation document before coding

Deliverables:

- implementation
- tests
- explanation
```

---

# Prompt 2 — Implement a New Engine

Examples:

* Validation Engine
* Evaluation Engine
* Replay Engine

```
Read:

- Development Guidelines
- Relevant implementation document

Implement the engine exactly as specified.

The engine should:

- have one responsibility
- expose a clean public interface
- depend only on interfaces
- never access infrastructure directly
- include unit tests

Do not implement future features.

Implement only the MVP described in the specification.
```

---

# Prompt 3 — Implement a Review Architecture

Examples:

* Agentless
* Hierarchical
* Consensus

```
Read:

- Development Guidelines
- Review Architecture Framework
- Architecture-specific implementation document

Requirements:

- implement IReviewArchitecture
- return RawReviewResult
- do not validate JSON
- do not access repositories
- report latency
- report token usage
- report API cost

The architecture should contain only review logic.
```

---

# Prompt 4 — Refactor Existing Code

```
Refactor the following code.

Goals:

- improve readability
- reduce duplication
- preserve behaviour
- preserve public interfaces
- maintain architecture

Do not introduce unnecessary abstractions.

Show the reasoning before changing the code.
```

---

# Prompt 5 — Write Unit Tests

```
Write comprehensive unit tests.

Cover:

- happy path
- invalid input
- edge cases
- failure cases

Do not modify production code unless required.

Use the existing testing framework.
```

---

# Prompt 6 — Review a Pull Request

```
Review this pull request.

Evaluate:

- architecture compliance
- dependency rules
- code quality
- readability
- maintainability
- testing
- error handling

Do not comment on formatting already enforced by Prettier or ESLint.

Identify architectural violations first.
```

---

# Prompt 7 — Generate API Documentation

```
Generate API documentation.

Include:

- endpoint
- request
- response
- validation
- errors
- examples

Do not invent undocumented behaviour.
```

---

# Prompt 8 — Generate Sequence Diagram

```
Generate a Mermaid sequence diagram.

The diagram should represent the implementation exactly.

Do not simplify interactions.

Include every major component.
```

---

# Prompt 9 — Explain Existing Code

```
Explain this module.

Describe:

- responsibilities
- dependencies
- execution flow
- strengths
- weaknesses

Reference the architecture where appropriate.
```

---

# Prompt 10 — Architecture Compliance Check

```
Review the implementation.

Check for violations of:

- dependency rules
- single responsibility
- plugin architecture
- experiment-centric design
- replay support
- validation rules

Produce a report.

Do not rewrite code unless requested.
```

---

# Prompt 11 — Implement the Next Vertical Slice

```
Determine the next unfinished vertical slice.

Read:

- implementation roadmap
- development guidelines

Implement only enough code to produce a working end-to-end feature.

Avoid implementing future phases.
```

---

# Prompt 12 — Prepare Code for Research Experiments

```
Review the implementation.

Ensure:

- reproducibility
- deterministic execution where possible
- version tracking
- structured outputs
- logging
- experiment metadata

Identify anything that could compromise experimental validity.
```

---

# Recommended Workflow

For every new feature:

1. Read Development Guidelines.
2. Read the implementation specification.
3. Implement the module.
4. Write unit tests.
5. Run tests.
6. Update implementation documentation if required.
7. Open a pull request.
8. Run an architecture compliance review.
9. Merge after approval.

---

# AI Usage Policy

AI should be used to:

* accelerate implementation
* generate boilerplate
* write tests
* improve documentation
* identify bugs

AI should **not**:

* change architecture without approval
* introduce unnecessary complexity
* skip testing
* modify unrelated modules
* ignore implementation specifications

---

# Definition of Success

A successful AI-assisted implementation:

* matches the implementation specification
* follows the architecture
* passes all tests
* includes documentation
* is understandable by human developers
* remains extensible for future research

The goal is not simply to generate code—it is to build a maintainable, reproducible research platform.
