# Docs Writing Rules

- Product instructions in `apps/docs/content/manual` are written for people completing tasks. Engineering documentation assumes LLM readers know general engineering concepts.
- Documentation routes knowledge to its owner; it does not reproduce tutorials or source.
- One page owns one question, and each fact has one authoritative source.
- Link authorities and connect decisions, contracts, implementation, and verification.
- Use stable vocabulary and the fewest sufficient words; remove repetition and low-value explanation.

# Documentation Ownership

- `README.md` and `README.zh-CN.md` are the user-facing product entry points.
- `packages/protocol/README.md` owns protocol installation and API usage.
- `packages/fonts/README.md` owns font installation and consumption.
- `package.json` owns scripts, dependencies, and local commands.
- `apps/docs/content/manual` owns the public product manual at `docs.chardesk.com`; Cell UI consumer documentation belongs to `ui.chardesk.com`.
- `apps/docs/content/docs/development` owns engineering contracts and Agent resources; it is excluded from product navigation and search.

# Architecture Navigation

- [State and data flows](apps/docs/content/docs/development/architecture/state-flows.mdx)
- [Ownership and dependency direction](apps/docs/content/docs/development/architecture/ownership.mdx)
- [LLM–Human Text Protocol](apps/docs/content/docs/development/architecture/ansi-canvas-protocol.mdx)
- [Domain reference](apps/docs/content/docs/development/domains.mdx)
- [Agent navigation benchmark](apps/docs/content/docs/development/quality.mdx#agent-navigation)
- Treat the domain reference as the authority for business responsibility and the ownership map as the authority for dependency direction; confirm implementation details in source and tests.

# Product Design Routing

- When shaping, implementing, or reviewing a user-facing CharDesk product interface, read [`DESIGN.md`](DESIGN.md) before loading surface-specific authorities.
- This applies to workflows, information architecture, interaction, layout, product copy, responsive behavior, accessibility, and user-visible states.
- Skip `DESIGN.md` for backend-only work, internal protocol behavior, tests with no shipped UI impact, prose documentation, marketing pages, and content authored inside Canvas, Blackboard, CharGraph, or Slides.
- For creating, editing, styling, or reviewing those artifacts, use [the `chardesk` skill](.agents/skills/chardesk/SKILL.md).
- `DESIGN.md` owns product judgment and routing. The authorities below own their implementation contracts.

# Frontend Host Rules

- [Visual system](apps/docs/content/docs/development/host-ui/visual-system.mdx)
- [Core host icon controls](apps/docs/content/docs/development/host-ui/icon-controls.mdx)
- [Dialog surfaces](apps/docs/content/docs/development/host-ui/dialogs.mdx)
- [Interface content](apps/docs/content/docs/development/host-ui/interface-content.mdx)

# Release Automation

- User-visible commits use `fix:`, `feat:`, or `feat!:`. Release Please owns package versions, `version.txt`, the release manifest, changelog, tag, and GitHub release.
- `fix:` and `feat:` publish a pre-1.0 patch; breaking commits publish a minor. `docs:`, `chore:`, and `ci:` do not request a release.
