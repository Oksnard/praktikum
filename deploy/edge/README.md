# Практикум — edge proxy к тому же Render

Worker обращается только к https://praktikum-review-vhyg.onrender.com, не зависит от Mac и не заменяет приложение. Root управляет native Sites identity/audience/publish и задаёт точный runtime `PUBLIC_SITE_ORIGIN=https://praktikum-demo.jetrook9.chatgpt.site`. Секреты/API keys здесь не нужны.

Команды: `npm test`, `npm run build`; dependencies отсутствуют. Worker ESM: `dist/server/index.js`. Build копирует root-owned `.openai/hosting.json` без изменений в `dist/.openai/hosting.json`; после изменения manifest/source нужно повторить build до packaging.

Только Basic Authorization и cookie `praktikum_session` передаются Render. Header allowlist сохраняет Next RSC/actions/body/range headers и исключает OAI/CF/JWT/visitor identity headers. Origin проверяется на точное совпадение с Site (обязателен на mutations) до rewrite в фиксированный Render Origin. Redirect manual: Render Location → Site, чужой redirect502. Только app Set-Cookie возвращается клиенту: точный Render Domain удаляется, чужой Domain502. Secure/HttpOnly/SameSite сохраняются. Нет caching/credential logs.

Body streaming ограничен6MiB; HTML/RSC/static/download response streaming не буферизуется. Render продолжает проверять BasicAuth и свой body limit. Transport/transient upstream failure503 без внутренних деталей; unsafe redirect/cookie response502; превышение body413. Тесты используют injected upstream fetch, production/paidAI calls отсутствуют.

Источники25.11.2026: Sites skill Worker ESM starter; Context7 Cloudflare Workers:
- https://developers.cloudflare.com/workers/runtime-apis/request (stream bodies, manual redirects не передают credentials новому destination).
- https://developers.cloudflare.com/workers/runtime-apis/headers/ (lossless Set-Cookie getAll; modern getSetCookie alternative).
- https://developers.cloudflare.com/workers/examples/modify-request-property/ (fixed-target request).

Unit12/12 + ESM default.fetch export PASS. Реальные published URL/no-VPN/login/files — отдельная граница приёмки root.


## Cold-start recovery (25.11.2026)

Render cold start was observed in logs: the visitor502 preceded the new app readiness by about56seconds. Root HTML navigation now returns a public no-data startup shell immediately; app login and data remain protected by the original Render BasicAuth. The destination is hardcoded `/login` or `/dashboard` based only on app-cookie presence, never cookie validity or a query URL. This two-destination rule applies to the root bridge. Recovery after another failed HTML navigation may also return to the fixed safe `/register` or `/admin` path, never a query-supplied URL. Native RSC root fetches retain redirect semantics.

The CSP-nonce shell polls only same-origin `/_review/ready`; only204 triggers navigation. It stops after about120seconds and offers manual retry. GET/HEAD transport/502/503/504 failures have at most two upstream attempts with a600ms pause. Terminal HTML navigation failures use the same recovery shell with status503. Readiness/RSC/HEAD failures remain non-HTML503; POST and all mutations are sent exactly once and never autoload/replay. Foreign redirect/cookie authority, identity privacy, Origin and fixed-target guards remain strict.

Diagnostic entries contain only a fixed event name, reason class and GET/HEAD/MUTATION category: no URL/query, exception message, headers, body, identities or credentials. Focused suite now12/12PASS. Published CF browser/CSP recovery is verified separately after root deploy; no production fault switch or paid AI call is introduced.

Context7 повторно проверен25.11.2026: https://developers.cloudflare.com/workers/examples/spa-shell/index (per-request CSP nonce), https://developers.cloudflare.com/workers/runtime-apis/web-crypto (crypto.randomUUID). Incoming request disconnect propagation depends on Workers enable_request_signal compatibility; the browser recovery timer itself is independently bounded by its AbortController/120s clock.
