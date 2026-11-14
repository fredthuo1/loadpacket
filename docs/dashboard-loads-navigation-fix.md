# Dashboard Loads navigation

September 27, 2026 — COMPLETE.

The existing Loads navigation is `/#loads`, targeting the dashboard's Recent
Loads section. That section is rendered after the dashboard fetch. A browser
regression test reproduced navigation from Drivers with a held dashboard response:
after releasing the response, Recent Loads remained outside the viewport.
The old active-link predicate also compared a pathname (no fragment) to `/#loads`.

Changes:
- `apps/web/src/app/page.tsx`: scroll to the requested Loads section after its data renders.
- `apps/web/src/components/app-header.tsx`: observe fragment changes, select Loads
  correctly, support repeated same-page clicks, and restore Dashboard selection
  and top scroll position. Modified clicks retain normal browser behavior.
- `apps/web/test/dashboard.spec.ts`: reproduce delayed navigation, repeated clicks,
  and return to Dashboard with correct accessible selected state.

No API, authentication, tenant authorization, shared-link, or load-data changes.
This preserves the existing Recent Loads destination; it does not add a separate
all-loads page. Existing workspace changes were preserved.

Final verification (Node 24; all PASS):
```text
pnpm --config.verify-deps-before-run=false --filter web exec playwright test test/dashboard.spec.ts test/auth.spec.ts
pnpm --config.verify-deps-before-run=false --filter web typecheck
pnpm --config.verify-deps-before-run=false --filter web lint
pnpm --config.verify-deps-before-run=false --filter web build
```
Seven browser tests passed, including owner/dispatcher dashboard behavior and
owner/driver authentication. The navigation test failed before the fix and passed
afterward. The full cross-platform release gate was not repeated for this web-only fix.

Separate pending issue: the user reported a newly generated Shared Load link
immediately unavailable. Browser reload token loss does not explain that report.
No Broker code was changed. The load number and page origin/path (excluding the
private fragment token) were requested to identify the affected environment/link.
