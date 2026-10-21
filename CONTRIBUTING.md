# Contributing to BookNest

Thank you for your interest in contributing to BookNest! We welcome bug reports, documentation enhancements, feature proposals, and code contributions.

Please review this document to ensure a smooth and collaborative workflow.

---

## 1. Code of Conduct

We are dedicated to providing a respectful, welcoming, and inclusive experience for everyone. Please be courteous, constructive, and professional in all interactions across issues and pull requests.

---

## 2. Getting Started

1. **Fork the Repository**: Create your own copy of the repository on GitHub.
2. **Clone & Setup**:
   ```bash
   git clone https://github.com/<your-username>/book-nest.git
   cd book-nest
   npm install
   cp .env.example .env
   ```
3. **Verify Baseline**:
   Run all checks to confirm your baseline environment is passing:
   ```bash
   npm run lint
   npm run build
   npm run test:e2e
   ```

---

## 3. Development Workflow

### 3.1 Branching Convention
Create a descriptive branch for your work:
- `feature/<feature-name>` for new functionality
- `fix/<bug-description>` for bug repairs
- `docs/<topic>` for documentation improvements
- `refactor/<scope>` for code cleanup without changing behavior

### 3.2 Architectural Principles
- **Separation of Concerns**: Keep UI presentation inside `src/components/` and `src/features/`, API calls in `src/services/api/`, and business logic in dedicated hooks or server services.
- **Server Authority**: Never trust client-side calculations for book prices, order totals, or coupon values. The Express backend is always authoritative.
- **Strict Typing**: Avoid `any`. Maintain strict TypeScript types for all models and API contracts in `src/types.ts` and backend modules.
- **Accessibility (a11y)**: All interactive elements must maintain proper ARIA labels, keyboard navigability, and focus containment.

---

## 4. Testing Your Changes

Before submitting a pull request, run the complete verification suite:

```bash
# 1. Static type checking
npm run lint

# 2. Production build compilation
npm run build

# 3. Backend integration suite (126 tests)
npm run test:e2e

# 4. Browser automation suites (requires dev server running on port 3000)
node scripts/test-animated-lamp-login.mjs
node scripts/test-admin-auth.mjs
node scripts/test-a11y.mjs
```

Ensure all tests pass with zero errors.

---

## 5. Submitting a Pull Request

1. Push your branch to your GitHub fork.
2. Open a Pull Request targeting the `main` branch.
3. Use the provided Pull Request template to detail:
   - What problem your change solves.
   - Which components or endpoints were modified.
   - Proof of testing (command output or test logs).
4. Maintain a clean commit history with descriptive commit messages.
