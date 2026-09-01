# Contributing

Use Node.js 22.13 or newer and npm 10. Install the exact dependency graph from
the lockfile and run the complete release gate before opening a change:

```bash
npm ci
npm run check
npm audit
```

Keep the Experiment API limited to functionality unavailable through stable
MailExtension APIs, and keep all calendar writes behind the existing gateway.
Behavior changes require focused regression tests. Changes to Thunderbird
calendar integration or the supported Thunderbird range also require the full
manual test plan.

All test data must be synthetic. Use only reserved `example.test` email domains,
generic account and calendar names, and relative fixture paths. Never commit
real account names, addresses, calendar URLs, profile identifiers, or local user
paths. The test-data validator enforces the machine-checkable parts of this
policy.
