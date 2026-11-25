# Playwright browser checks

Playwright runs a dedicated local Nest test server on `127.0.0.1:3211` and Next on `127.0.0.1:3200`. The Nest test server overrides only the `AiProvider` DI binding with the existing deterministic `FixtureProvider`; auth, roles, tenant scoping, Prisma, PostgreSQL, money transactions, server actions and rendered UI remain real. It refuses a non-loopback `DATABASE_URL`. The suite creates companies named `PW-E2E-*`; global teardown deletes only their rows. Do not point this harness at production data.

## Local full browser flow

Requirements: migrated local PostgreSQL, built shared contracts, and Chromium installed for the installed Playwright version.

```sh
pnpm db:migrate
pnpm db:seed
pnpm --filter @praktikum/types build
pnpm exec playwright install chromium
BROWSER_E2E=1 node --env-file=.env node_modules/@playwright/test/cli.js test --project=local-browser
```

The local browser project checks owner registration, a Demo top-up, text material creation and full text display, DOCX/PDF upload and extraction, original-file download, scanned-PDF rejection, cross-tenant file-download denial, fixture-backed generation, employee and manager creation, employee answer/evidence/recommendations, manager result review, owner balance/transaction/limit controls, personal limit rejection, cross-company workspace isolation, role-gated admin access, invalid login, fixture super-admin ledger read, mobile logout, and horizontal overflow at 390 px. A dedicated guided-tour test checks first visit and replay, step navigation, dismissal, Escape, and role-specific targets. Playwright saves reports, screenshots, video and traces under ignored `.runtime/playwright/`; inspect traces only if a local run fails.

## Verified local result — 2026-11-24

`pnpm test:browser` completed with **5 passed (1.0m)**, exit code 0, with retries disabled. The accepted run covers the full business flow (32.4 s), invalid login/access redirect (5.7 s), owner/employee onboarding and replay (9.6 s), super-admin ledger/logout (2.6 s), and the mobile flow (2.9 s). At 390 × 844, all five owner onboarding steps, their close and next/done controls fit fully inside the viewport; completing the tour, mobile logout and absence of page-level horizontal overflow passed. The admin company assertion is scoped to the companies table because names also appear in transaction and AI audit tables.

Local evidence: `.runtime/playwright/final-acceptance-corrected.log` and `.runtime/playwright/report/index.html` (ignored). This result uses the DI fixture AI and local PostgreSQL; it does not establish live provider quality or deployed browser behavior.

## Deployed read-only smoke

This project reads existing accounts/workspaces only; it does not register, create materials/users, attempt AI, or adjust balances. It exercises the live login and authorized read paths for accounts supplied through the operator's shell environment. The production project disables trace, video and screenshot capture so authentication actions cannot be persisted as browser artifacts. Never put account values into source, command arguments, test names, or reports.

```sh
PLAYWRIGHT_REMOTE_SMOKE=1 \
PLAYWRIGHT_BASE_URL=https://your-deployed-host \
PLAYWRIGHT_GATE_USER="$REVIEW_GATE_USER" \
PLAYWRIGHT_GATE_PASSWORD="$REVIEW_GATE_PASSWORD" \
PLAYWRIGHT_SMOKE_OWNER_EMAIL="$SMOKE_OWNER_EMAIL" \
PLAYWRIGHT_SMOKE_OWNER_PASSWORD="$SMOKE_OWNER_PASSWORD" \
PLAYWRIGHT_SMOKE_EMPLOYEE_EMAIL="$SMOKE_EMPLOYEE_EMAIL" \
PLAYWRIGHT_SMOKE_EMPLOYEE_PASSWORD="$SMOKE_EMPLOYEE_PASSWORD" \
PLAYWRIGHT_SMOKE_ADMIN_EMAIL="$SMOKE_ADMIN_EMAIL" \
PLAYWRIGHT_SMOKE_ADMIN_PASSWORD="$SMOKE_ADMIN_PASSWORD" \
node --env-file=.env node_modules/@playwright/test/cli.js test --project=production-smoke
```

Provide only accounts authorized for this smoke. Each role test is skipped when its own account is absent; the app URL must be supplied. The browser project verifies visible workspaces, role-specific controls and read-only platform ledger access, not provider-side AI correctness. The real provider/model, evaluation, usage settlement and cached idempotency are separately exercised by `pnpm evals --live` and the HTTP business-flow checks documented in [acceptance.md](acceptance.md). Review production-provider costs before running live AI checks; this browser smoke intentionally does not trigger them.

## Coverage boundary

Playwright validates that a person can complete and inspect the principal browser journeys against the Nest API and a real local database. The API's boundary, concurrency, retry, grounding, usage and idempotency cases remain covered by `pnpm test`, `pnpm test:e2e`, and `pnpm evals`; Playwright does not replace them. The local browser's deterministic fixture AI verifies the web-to-API contract without sending paid model requests.

## References

Playwright guidance was checked through Context7 and the official docs: [Test configuration](https://playwright.dev/docs/test-configuration), [web server](https://playwright.dev/docs/test-webserver), [browser contexts and isolation](https://playwright.dev/docs/browser-contexts), and [test use options](https://playwright.dev/docs/test-use-options).

## Verified public HTTPS checks — 2026-11-24

Deployed read-only production-smoke: **3/3 PASS,13.8s** for owner, employee and super-admin on `https://nights-known-believed-meetup.trycloudflare.com`. Run without putting credentials into command arguments:

```sh
PLAYWRIGHT_REMOTE_SMOKE=1 node --env-file=.runtime/review/browser.env node_modules/@playwright/test/cli.js test --project=production-smoke
```

`tests/public-live-check.mts` also completed the real public DOCX upload/download (byte-identical), DeepSeek generation, employee answer/evaluation, manager report, financial audit/cache replay, Beta download404, secure cookie and390px onboarding/replay. **2 actual AI calls,891 internal credits, score100,2 exact quotes; cache replay0**. Trace/video off, only sanitized stage/error type on failure. Evidence `.runtime/review/public-live-result.json`; screenshots in `docs/screenshots/public-*.jpg` contain only review/demo data. AI calls are attributed to the exact assignment/attempt operation IDs and company. The overall balance-delta assertion requires an exclusive window for that review company: do not operate its budget/AI in parallel. Other companies’ calls are excluded. This mutating script creates material/assignment/attempt in the review tenant and can incur real provider costs; do not use an arbitrary production account. Re-running requires a fresh material title or a fresh authorized review dataset; existing cached results may change the number of calls.

```sh
PLAYWRIGHT_EXPECT_REGISTRATION=true node --env-file=.runtime/review/browser.env --import tsx tests/public-live-check.mts
```

Optional registration-policy assertion reads only the server-owned local review env file and never creates a company. Initial public flow ran while registration was disabled; the current registration-enabled behavior was checked separately after the operator enabled it.

`tests/public-registration-check.mts`: **PASS** through the actual public registration form after enabling review registration. Checks new company/owner,0balance, empty workspace, own team only, secure cookie, first tour, logout/re-login and Alpha download404. No AI calls. It removes only its unique generated test company/user and verifies absence in the local review DB. Requires the private review DSN to be loopback; never point it at another DB.

```sh
node --env-file=.runtime/review/api.env --env-file=.runtime/review/browser.env --import tsx tests/public-registration-check.mts
```

Sanitized evidence `.runtime/review/public-registration-result.json`. Public scripts deliberately have no traces/screenshots of credential forms; their env and generated credentials are never committed. The5 local tests and these public runs check Chromium, not a full cross-browser/device matrix.

## Upload and navigation corrections

User testing exposed owner/manager `#learning` links without that role’s section and a manager `#team` link to owner-only management. The sidebar now links owner/manager to team results, employee to personal learning; team management navigation is owner-only. The local business case checks every visible sidebar hash link for OWNER/MANAGER/EMPLOYEE: exactly one target, click/hash transition and target entering the viewport.

`tests/public-upload-ui-check.mts` verifies the actual HTTPS styled upload form at desktop and390px: selected file, scan rejection/error clearing, held real request with disabled inputs/button and aria-busy, successful real DOCX upload, reset/re-enabled fields, original download and owner navigation. It creates a uniquely named material, removes only that exact unassigned material/file, uses no AI, and never records credential forms. Crops: `screenshots/public-upload-desktop.png`, `screenshots/public-upload-mobile.png`. The replay button is inside the sticky header; mobile geometry verifies it does not overlap upload submit. This replaced the earlier mobile capture with a floating replay overlap.

```sh
node --env-file=.runtime/review/api.env --env-file=.runtime/review/browser.env --import tsx tests/public-upload-ui-check.mts
```

Current hostname was recreated after a long pause and detached services were restarted; new-host registration and upload UI checks PASS with0AI calls. The891-credit real AI evidence retains its original hostname/timestamp. No paid run was repeated for a tunnel alias or presentation-only changes.

Финальный прогон после переноса replay в шапку: local5/5PASS1.1min (`.runtime/playwright/final-polish.log`), remote3/3PASS14.3s (`.runtime/review/final-remote-smoke.log`). Current-host registration/upload UI PASS; все новые pending/no-overlap проверки успешны, данные тестов удалены,0AI.

## Real AI reports and legacy guard in the published UI

Final deployed build: local5/5PASS1.1min, production-smoke3/3PASS20.0s. `tests/public-quality-ui-check.mts` uses only the retained fictional QA workspaces and their private access files. It verifies the independently accepted100/72/8 reports against exact attempt IDs, explanations/source evidence/recommendations, owner detail,390px width, historical badges and owner update action. It never clicks generation/update. A direct old-assignment submission returns409; owner-scoped before/after balance, all users’ spent, operations, ledger and attempt IDs remain identical. All auth sessions are revoked.

```sh
node --env-file=.runtime/review/browser.env --import tsx tests/public-quality-ui-check.mts
```

Prerequisite: operator-created private baseline/V2 QA state and sealed results under ignored `.runtime/ai-quality-assessment*`; these credentials/artifacts are intentionally absent from GitHub. This is a no-AI read/denial check, not a replacement for paid semantic QA. Accepted evidence `.runtime/review/quality-ui-result.json` and `quality-ui-astra-acceptance.log`. Three cropped result images preserve the complete card below the sticky header; no credential forms, traces or video are captured. Earlier failures were incorrect test selectors and screenshots, retained in private logs; the final complete run passed.

## 25.11.2026 — HTTP/LAN и повторный HTTPS smoke

- LAN `http://192.168.31.195:8080`: production-smoke3/3 PASS5.7s, owner/employee/super-admin.
- Изолированный тестовый tenant через настоящий UI: register, cookie/reload, DOCX upload201/download SHA256, чужой Origin403, logout/login PASS; тестовые записи и файл удалены,0provider calls. На двух предварительных прогонах исправлены только selectors скрипта, итоговый проход полный.
- После web build HTTPS `https://coaches-explains-teach-hewlett.trycloudflare.com`: production-smoke3/3 PASS9.8s; отдельная проверка Secure/HttpOnly/Lax+logout PASS. Старый nights URL выше является историческим результатом и больше не действует.
- Логи и детальный приватный результат: `.runtime/review/lan-20261125-smoke.log`, `lan-http-check-result.json`, `https-after-http-20261125-smoke.log`. Внешний доступ по прямому IP и другое физическое устройство этим не доказаны.
