## LiquiVault SDK Contribution Guide

We appreciate any help improving the LiquiVault TypeScript SDK. Follow these steps to get started.

### 1️⃣ Fork & Clone
```bash
# Fork the repo on GitHub first
git clone https://github.com/<your‑username>/liquivault-sdk.git
cd liquivault-sdk
```

### 2️⃣ Create a Branch
```bash
git checkout -b my‑sdk‑feature
```

### 3️⃣ Install Dependencies
```bash
npm ci   # installs exact versions from package-lock.json
```

### 4️⃣ Development Workflow
- **Run tests**: `npm test`
- **Run type‑checking**: `npm run typecheck`
- **Build the library**: `npm run build`
- **Lint (if you add eslint config)**: `npm run lint`

### 5️⃣ Commit & Push
```bash
git add .
git commit -m "feat: short description"
git push origin my‑sdk‑feature
```

Open a Pull Request on GitHub targeting `main`.

### 6️⃣ Review Checklist (maintainers)
- ✅ All `npm test` pass.
- ✅ `npm run typecheck` reports no errors.
- ✅ Build succeeds (`npm run build`).
- ✅ Code follows the project’s style and updates docs when needed.

### Resources
- **SDK docs**: see `README.md`.
- **Stellar Soroban SDK**: https://soroban.stellar.org/docs
- **Drips Wave Guidelines**: https://drips.network/wave-guidelines
