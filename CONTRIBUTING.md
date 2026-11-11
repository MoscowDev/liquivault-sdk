# Contributing to the SDK

Use Node.js 22.13+ and npm. This repository builds/tests independently; deployed contract access is only needed for opt-in network examples/tests.

```sh
git clone https://github.com/MoscowDev/liquivault-sdk.git
cd liquivault-sdk
npm ci
npm run typecheck
npm test
npm run build
npm run example
npm audit
```

Installation runs the package build. Use `npm run format` for formatting and `npm run format:check` to verify it. Ordinary tests must remain deterministic and offline; opt-in tests must identify network dependencies and must not submit transactions by surprise.

Before opening a PR, link the unfinished issue, explain the changed behavior and validate actual Stellar types/XDR rather than inventing transport responses. Preserve bigint precision, contract wire types and confirmed-result semantics. Document API changes and cross-repository dependencies. Never include keys, tokens, account seeds or local wallet configuration.

The frontend uses a sibling checkout and should be validated after public API changes. Merge/publish SDK changes before dependent frontend changes. Security reports follow [SECURITY.md](SECURITY.md). The [shared guide](https://github.com/MoscowDev/LiquiVault/blob/main/CONTRIBUTING.md) explains review expectations and [Drips' documentation](https://docs.drips.network/wave/maintainers/participating-in-a-wave/) governs Wave participation; no local label guarantees rewards.
