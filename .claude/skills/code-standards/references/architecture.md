# Architecture patterns (pick the simplest that fits)

Declare the chosen pattern in OVERVIEW. Default = **Feature-Based**. Don't import
enterprise patterns into a small app; don't ship a big app as one flat folder.

## Feature-Based (feature-sliced / vertical) — DEFAULT

Group by FEATURE, not by technical layer. Each feature owns its UI, logic, data
access, and tests — front-to-back. Matches the kit's vertical-slice loop (one slice
≈ one feature).

```
src/
  features/
    auth/        { ui, api, model, hooks, auth.test }
    billing/     { ui, api, model, billing.test }
    dashboard/   { ... }
  shared/        # cross-feature primitives (ui kit, lib, config)
  app/           # composition root, routing, providers
```
- **Pros:** high cohesion, easy to find/change/delete a feature, scales with team.
- **Watch:** keep `shared/` thin; features must not import each other's internals
  (go through a public entry or `shared/`).
- Frontend flavour: "Feature-Sliced Design". Backend flavour: a module per feature.

## Layered (n-tier)

```
controllers/ → services/ → repositories/ → db
```
- **Use when:** straightforward CRUD, small team, shallow domain.
- **Watch:** grows into a "fat service" tangle as features multiply; layers cut
  ACROSS features so a change touches every layer.

## Hexagonal / Ports & Adapters / Clean

Domain at the centre; dependencies point INWARD. The domain knows nothing about the
DB, framework, or transport — those are adapters behind ports (interfaces).
- **Use when:** complex/long-lived business rules, many integrations, high testability
  needs (domain tested with no infra).
- **Watch:** ceremony/indirection — overkill for CRUD.

## Modular monolith / DDD bounded contexts

Independent modules with explicit boundaries + their own data ownership, in one
deployable. Each bounded context is feature-based inside.
- **Use when:** large app likely to split into services later; multiple teams.
- **Watch:** enforce boundaries (no reaching into another module's tables/internals).

## Choosing

| Signal | Lean toward |
|--------|-------------|
| small CRUD, 1–2 devs | Layered or Feature-Based |
| product app, growing features | **Feature-Based** |
| rich domain rules, many integrations | Hexagonal / Clean |
| large, multi-team, future services | Modular monolith / DDD |

Cross-cutting (auth, logging, errors, config) lives in `shared/` regardless. The
architecture is a phase-0 / planning decision — record it and the folder layout in
OVERVIEW so every phase builds the same way.
