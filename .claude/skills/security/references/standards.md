# Standards mapping — ISO 27001 · ISO 25010 · SLSA

Read on demand. The day-to-day gate is the OWASP cookbook in SKILL.md; this file is
for when a project must speak in ISO / supply-chain terms (audits, compliance,
regulated domains). Apply the depth your project actually needs — these are not all
mandatory for every app.

## ISO/IEC 27001:2022 — information security controls (Annex A)

93 controls in 4 themes. For a software dev kit, the **Technological (A.8)** theme
is the code/deploy-facing one; map your security work to it.

| Theme | Controls | What it covers for us |
|-------|----------|------------------------|
| Organizational (A.5) | 37 | policies, supplier/cloud management, access policy, incident process |
| People (A.6) | 8 | awareness, responsibilities, the human sign-off chain |
| Physical (A.7) | 14 | facilities (mostly N/A for managed/cloud infra) |
| **Technological (A.8)** | 34 | access control, crypto, secure dev, logging, monitoring, vuln mgmt, backup |

Selection is risk-driven via a Statement of Applicability — pick the controls your
risk profile warrants; document the choice. Map OWASP ASVS chapters → A.8 controls
for dual compliance.

## ISO/IEC 25010:2023 — product quality model (the "definition of done")

9 characteristics. Use as a quality cookbook beyond just security — a phase is
"done" when the relevant ones hold:

1. **Functional Suitability** — correct, complete, appropriate (your acceptance tests).
2. **Performance Efficiency** — time behavior, resource use, capacity.
3. **Compatibility** — interoperability, coexistence.
4. **Interaction Capability** — learnability, accessibility, UI quality (→ `ux-design`).
5. **Reliability** — availability, fault tolerance, recoverability (→ OWASP A10).
6. **Security** — confidentiality, integrity, authenticity, accountability,
   non-repudiation (→ the OWASP cookbook + ASVS).
7. **Maintainability** — modularity, reusability, analyzability, modifiability
   (→ `karpathy-guidelines`).
8. **Flexibility** — installability, adaptability, replaceability.
9. **Safety** — operational constraint, fail-safe, hazard warning.

> Note: 2023 renamed Usability → Interaction Capability and Portability → Flexibility,
> and added Safety. The kit's other skills already cover #4, #6, #7.

## SLSA v1.1 — supply-chain provenance (Build Track)

| Level | Requirement |
|-------|-------------|
| L0 | no provenance (baseline) |
| L1 | document how the artifact was built (provenance generated) |
| **L2** | hosted, auditable build + signed, tamper-evident provenance |
| L3 | isolated, hardened build; cryptographically signed; full chain of custody |

Target **L2+** for production releases: signed build + SBOM + provenance attached to
the release record. Pairs with OWASP A03 (Software Supply Chain Failures) and the
SCA gate.

## Sources
OWASP Top 10 2025 · ASVS 5.0 · WSTG v4.2 — owasp.org · ISO/IEC 25010:2023 /
27001:2022 — iso.org · NIST SP 800-115 / 800-204D — nist.gov · SLSA v1.1 — slsa.dev.
Full detail: `docs/research/design-security-standards-cookbook.md`.
