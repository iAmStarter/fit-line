---
name: code-standards
description: Code conventions & architecture cookbook — naming follows each language's OWN idiom (camelCase / snake_case / PascalCase as the language dictates, not one-size-fits-all), plus project structure and the architecture pattern (Feature-Based by default; layered / hexagonal / modular when they fit). Use when scaffolding a project, choosing an architecture, naming things, or reviewing code structure. Keywords: naming, convention, camelCase, snake_case, PascalCase, style guide, lint, format, prettier, eslint, architecture, feature-based, layered, hexagonal, clean architecture, folder structure, project structure, conventions.
---

# code-standards — conventions & architecture cookbook

Caveman ULTRA mode. Consistency beats personal preference. Match the LANGUAGE'S
idiom, not a favourite style. Read on demand: `references/naming.md`,
`references/architecture.md`.

## 1. Naming — follow the language, not a habit

Use each language's OWN convention. Do NOT force `camelCase` everywhere.

| Language | vars / functions | types / classes | constants | files |
|----------|------------------|-----------------|-----------|-------|
| JS / TS | `camelCase` | `PascalCase` | `UPPER_SNAKE` | `kebab-case` (or per framework) |
| Python | `snake_case` | `PascalCase` | `UPPER_SNAKE` | `snake_case` |
| Go | `camelCase`; exported → `PascalCase` | `PascalCase` | `MixedCaps` | `lowercase` / `snake` |
| Rust | `snake_case` | `PascalCase` | `UPPER_SNAKE` | `snake_case` |
| Java / Kotlin | `camelCase` | `PascalCase` | `UPPER_SNAKE` | `PascalCase` |
| C# | `camelCase` locals, `PascalCase` members | `PascalCase` | `PascalCase` | `PascalCase` |
| Ruby | `snake_case` | `PascalCase` | `SCREAMING_SNAKE` | `snake_case` |
| SQL | `snake_case` | — | — | — |

Names say what a thing IS; no non-standard abbreviations; booleans read as
predicates (`isActive`, `has_items`). The project's declared style guide (PEP 8,
Effective Go, Airbnb JS/TS, Rust style, Google Java…) is the tie-breaker.
Details + edge cases → `references/naming.md`.

## 2. Architecture — Feature-Based by default

Default: **Feature-Based** (feature-sliced / vertical) — group code by FEATURE, not
by technical layer. It matches the kit's vertical-slice loop: one slice ≈ one
feature folder, front-to-back. Alternatives (declare the choice in OVERVIEW):

- **Layered (n-tier)** — simple CRUD; controllers / services / repositories.
- **Hexagonal / Clean** — domain-centric, dependencies point inward; complex domains.
- **Modular monolith / DDD bounded contexts** — large apps trending toward services.

Pick the SIMPLEST that fits; don't import enterprise patterns into a small app.
Patterns, trade-offs, and folder layouts → `references/architecture.md`.

## 3. Structure & enforcement

- One consistent project structure that reflects the chosen architecture; declare it.
- A formatter + linter is NOT optional and NOT a bikeshed: use the language's
  STANDARD tool and let it decide — prettier/eslint, black/ruff, gofmt/golangci-lint,
  rustfmt/clippy. CI fails on lint/format errors.

## RETURN FORMAT

```
CODE-STANDARDS CHECK: <change>
- naming: PASS | FAIL (<names that break the language idiom>)
- architecture: conforms to <pattern> | DRIFT (<what drifted>)
- structure: PASS | FAIL
- lint / format: clean | <errors>
- VERDICT: PASS | BLOCK
```
