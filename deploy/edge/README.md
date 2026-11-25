# Практикум — edge proxy к тому же Render

Worker обращается только к https://praktikum-review-vhyg.onrender.com, не зависит от Mac и не заменяет приложение. Root управляет native Sites identity/audience/publish и задаёт точный runtime `PUBLIC_SITE_ORIGIN=https://praktikum-demo.jetrook9.chatgpt.site`. Секреты/API keys здесь не нужны.

Команды: `npm test`, `npm run build`; dependencies отсутствуют. Worker ESM: `dist/server/index.js`. Build копирует root-owned `.openai/hosting.json` без изменений в `dist/.openai/hosting.json`; после изменения manifest/source нужно повторить build до packaging.

Только Basic Authorization и cookie `praktikum_session` передаются Render. Header allowlist сохраняет Next RSC/actions/body/range headers и исключает OAI/CF/JWT/visitor identity headers. Origin проверяется на точное совпадение с Site (обязателен на mutations) до rewrite в фиксированный Render Origin. Redirect manual: Render Location → Site, чужой redirect502. Только app Set-Cookie возвращается клиенту: точный Render Domain удаляется, чужой Domain502. Secure/HttpOnly/SameSite сохраняются. Нет caching/credential logs.

Body streaming ограничен6MiB; HTML/RSC/static/download response streaming не буферизуется. Render продолжает проверять BasicAuth и свой body limit. Ошибки upstream502 без внутренних деталей; превышение body413. Тесты используют injected upstream fetch, production/paidAI calls отсутствуют.

Источники25.11.2026: Sites skill Worker ESM starter; Context7 Cloudflare Workers:
- https://developers.cloudflare.com/workers/runtime-apis/request (stream bodies, manual redirects не передают credentials новому destination).
- https://developers.cloudflare.com/workers/runtime-apis/headers/ (lossless Set-Cookie getAll; modern getSetCookie alternative).
- https://developers.cloudflare.com/workers/examples/modify-request-property/ (fixed-target request).

Unit7/7 + ESM default.fetch export PASS. Реальные published URL/no-VPN/login/files — отдельная граница приёмки root.
