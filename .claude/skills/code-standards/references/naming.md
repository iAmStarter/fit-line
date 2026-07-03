# Naming conventions (per language)

The golden rule: **follow the language's official style guide.** Below is the
idiom + the canonical guide to defer to. When in doubt, run the language's
formatter/linter — it encodes most of this.

## Per language

### JavaScript / TypeScript — Airbnb / Google / TS handbook
- vars, functions, methods, object keys → `camelCase`
- classes, types, interfaces, enums, React components → `PascalCase`
- module-level constants / enum members → `UPPER_SNAKE_CASE`
- files → `kebab-case` (or framework rule: React often `PascalCase.tsx`)
- private (convention) → leading `_` only if the codebase already does; prefer `#private`
- no Hungarian notation; interfaces are NOT prefixed with `I` in modern TS.

### Python — PEP 8
- vars, functions, methods, modules, packages → `snake_case`
- classes, exceptions → `PascalCase`
- constants → `UPPER_SNAKE_CASE`
- "internal" → single leading `_`; name-mangled → `__` ; dunder reserved for Python.

### Go — Effective Go
- identifiers → `MixedCaps` / `camelCase`; **exported = capitalised** (`PascalCase`),
  unexported = lowercase first letter. NO underscores in names.
- acronyms stay all-caps: `userID`, `httpServer` → `HTTPServer`, `userURL`.
- short, local names for short scopes (`i`, `r`, `buf`); longer for package API.

### Rust — Rust style / rustfmt
- vars, functions, modules, files → `snake_case`
- types, traits, enums, enum variants → `PascalCase`
- constants, statics → `UPPER_SNAKE_CASE`

### Java / Kotlin — Google Java Style
- vars, methods, params → `camelCase`; classes → `PascalCase`;
  constants (`static final`) → `UPPER_SNAKE`; packages → `lowercase`.

### C# — Microsoft guidelines
- public members, methods, properties, types → `PascalCase`
- locals + parameters → `camelCase`; interfaces prefixed `I` (`IService`);
  private fields → `_camelCase` (common).

### Ruby — Ruby Style Guide
- methods, vars, symbols, files → `snake_case`; classes/modules → `PascalCase`;
  constants → `SCREAMING_SNAKE_CASE`.

### SQL
- tables, columns → `snake_case`; tables usually plural (`users`); keywords UPPER (style).

## Cross-language rules

- **Say what it IS.** `userList` not `ul`; `elapsedMs` not `t`. No mystery abbreviations.
- **Booleans are predicates** — `isActive`, `hasAccess`, `canEdit`, `should_retry`.
- **Functions are verbs** (`fetchUser`, `parse_config`); **values are nouns**.
- **Units in the name** when ambiguous — `timeoutMs`, `widthPx`, `priceCents`.
- **Acronyms** — follow the language (Go: `ID`/`URL` all caps; TS: usually `Id`/`Url`
  in camelCase members). Be consistent within the codebase.
- **No type in the name** unless the language culture does it (avoid `strName`).

The declared style guide in OVERVIEW wins any tie. Let the formatter enforce mechanics.
