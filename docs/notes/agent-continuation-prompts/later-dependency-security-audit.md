# Later Continuation Prompt: Dependency Security Audit

You are continuing the minimal `pi-protocol` rebuild.

Only start this as a dependency-maintenance step. Do not mix it with protocol behavior changes.

First read:

1. `docs/notes/minimal-protocol-plan.md`
2. `package.json`
3. `package-lock.json`
4. `packages/pi-protocol-pi-sdk/package.json`
5. current tests in `scripts/`

Context:

- Local Pi SDK resolution was added with root dev dependency:
  - `@earendil-works/pi-coding-agent@0.75.4`
- `packages/pi-protocol-pi-sdk` also declares an optional peer dependency on:
  - `@earendil-works/pi-coding-agent`
- `npm audit` reported 9 transitive vulnerabilities after dependency installation:
  - 5 moderate
  - 3 high
  - 1 critical
- Initial inspection suggested the audit findings mostly come from the older root `@mariozechner/pi-ai@0.65.2` dependency graph, not primarily from the newly added Pi SDK dependency.
- Examples seen during inspection:
  - root `protobufjs@7.5.4` was vulnerable while Pi SDK nested `protobufjs@7.5.9` was not flagged
  - root `ws@8.20.0` was vulnerable while Pi SDK nested `ws@8.20.1` was not flagged

Goal for this session:

Review and reduce dependency security findings without changing protocol behavior.

Suggested commands:

```bash
npm audit
npm audit --json
npm explain protobufjs
npm explain ws
npm explain basic-ftp
npm explain fast-uri
npm explain fast-xml-parser
npm explain fast-xml-builder
npm explain ip-address
npm explain @aws-sdk/xml-builder
npm audit fix --dry-run
```

Constraints:

- Explain the dependency plan before editing package files.
- Prefer targeted dependency updates or overrides over broad churn.
- Do not run `npm audit fix --force` without explicit approval.
- Keep protocol behavior unchanged.
- Rerun relevant tests after dependency changes:

```bash
npx tsx scripts/test-minimal-fabric.ts
npx tsx scripts/test-pi-sdk-agent-adapter.ts
npx tsx scripts/test-minimal-fabric-pi-sdk-adapter.ts
npx tsx scripts/test-pi-sdk-agent-session-import.ts
```

Design rule:

Dependency/security maintenance is its own architectural fitness step. Do not combine it with provenance, governance, schema validation, or Pi tool projection work.
