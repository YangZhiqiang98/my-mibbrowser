# README Reference Patterns

## Sources reviewed

- GitHub Docs: About READMEs — https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/about-readmes
- Google Developer Documentation Style Guide: READMEs — https://google.github.io/styleguide/docguide/READMEs.html
- Microsoft VS Code README — https://github.com/microsoft/vscode
- DBeaver README — https://github.com/dbeaver/dbeaver
- Netdata README — https://github.com/netdata/netdata
- Postman App Support README — https://github.com/postmanlabs/postman-app-support
- Electron documentation / README-style landing docs — https://github.com/electron/electron/blob/main/docs/tutorial/introduction.md

## Common patterns worth adopting

1. Start with a short product identity statement.
   - Good READMEs quickly answer what the project is and who it is for.
   - They avoid deep implementation details before users understand the product.
   - GitHub's own guidance frames the README around what the project does, why it is useful, how to get started, where to get help, and who maintains it.

2. Put visual proof early.
   - Desktop and UI-heavy projects usually show screenshots near the top.
   - Screenshots work best after a one-paragraph summary, before long setup details.

3. Organize capabilities by user workflow, not by internal module names only.
   - Examples: load data, inspect/browse, run operations, debug/export.
   - Tables are useful when each row is short and scannable.

4. Keep Quick Start small.
   - The first run path should be only prerequisites, install, and run.
   - Full build/test/packaging details can come later.

5. Separate user workflows from developer workflows.
   - Product usage should not be mixed with lint/typecheck/package commands.
   - Developer sections should be compact and command-oriented.

6. Move limitations and troubleshooting lower in the document, and keep them practical.
   - Mature projects avoid putting long caveat lists before the reader sees value.
   - Limitations should describe actual boundaries that affect use.

7. Link or point to deeper docs when possible.
   - For this repo, Trellis specs serve as internal developer docs.
   - The README should mention them without duplicating all implementation contracts.

## Application to this project

Recommended structure for MIB Browser:

1. Title and short description
2. What it helps with / main workflows
3. Screenshots
4. Capability matrix grouped by workflow
5. Quick Start
6. Common scripts
7. Main usage flow
8. SNMPv3 and runtime notes
9. Performance / implementation notes, compact
10. Project structure
11. Development notes
12. License

The user's current simplification is directionally good: do not restore a long FAQ verbatim. Keep only high-signal notes such as net-snmp protocol boundaries and Trellis spec location.

## Concrete rewrite guidance

- Use a short "适合做什么" list near the top instead of making readers infer the app's value from the module table.
- Keep screenshots before setup commands because this is a desktop UI project.
- Rename "主要能力" to a more workflow-oriented section and group items by user action.
- Keep "快速开始" short; move full verification/build details into a developer section.
- Reintroduce performance details only as compact implementation notes, not as a long standalone claim-heavy section.
- Keep limitations practical and short, or merge them into protocol notes. The user's deletion of the long limitation/FAQ tail is reasonable.
