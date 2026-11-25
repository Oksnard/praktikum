# Отдельный HTTP review по IP

Фактическая установленная и зафиксированная в `pnpm-lock.yaml` версия — **Next.js 16.4.6** (`apps/web/package.json` допускает обновления через `^16.0.3`). Первоначальная проверка Context7 была для 16.0.3; 25.11.2026 источники повторно проверены для доступной в Context7 ближайшей версии **16.4.5**. Это справка для соседней patch-версии, а не утверждение о документации именно 16.4.6. Совместимость подтверждают source-проверка установленного action-handler и подтверждённый root фактический LAN-login трёх ролей на 16.4.6:

- [cookies options](https://github.com/vercel/next.js/blob/v16.4.5/docs/01-app/03-api-reference/04-functions/cookies.mdx): Secure отправляет cookie только по HTTPS; HttpOnly и SameSite сохраняются в обоих режимах.
- [Server Actions / CSRF](https://github.com/vercel/next.js/blob/v16.4.5/docs/01-app/02-guides/data-security.mdx): Next сравнивает Origin и Host/X-Forwarded-Host. Gateway перезаписывает forwarded authority из собственной конфигурации; allowedOrigins не расширяется. Next допускает отсутствующий Origin с предупреждением; HTTP gateway строже и требует точный Origin для изменяющих запросов.

HTTP — отдельный экземпляр Next на loopback:8081. Его private env: `NODE_ENV=production`, `PUBLIC_ORIGIN=http://192.168.31.195:8080`, `REVIEW_ALLOW_HTTP_COOKIE=true`, прежний loopback API_URL. Cookie становится insecure только при точных Host **и** Origin на login/register. Forwarded headers не выбирают режим. Проверка выполняется до создания API-сессии. Default production cookie остаётся Secure.

Отдельный gateway: `REVIEW_ALLOW_HTTP=true`, `REVIEW_PUBLIC_HOST=192.168.31.195:8080`, `REVIEW_GATE_BIND=192.168.31.195`, `REVIEW_GATE_PORT=8080`, `REVIEW_UPSTREAM_PORT=8081`. Секреты BasicAuth берутся из private env; они не выводятся. Запуск: `node --env-file=<private-http-gate.env> deploy/review-gateway.mjs`. Next запускается существующим `start:web --port 8081` с отдельным private env. API и PG не слушают внешний интерфейс. Без HTTP opt-in gateway разрешает только loopback bind; default upstream 3300 и HTTPS-проверка сохранены.

HTTP передаёт BasicAuth и session cookie без шифрования; это разрешённый пользователем временный review на выбранной сети. Доступность из Интернета этим кодом не доказана: нужны отдельные сетевые настройки и проверка root. Запущенный HTTPS экземпляр не перестраивается и не перезапускается в рамках source-проверки.

Проверки: `node --test deploy/review-gateway.test.mjs`, `pnpm exec tsx --test apps/web/test/session-cookie.test.ts apps/web/test/upload-origin.test.ts`, web typecheck и targeted ESLint. Тесты покрывают HTTPS defaults, HTTP opt-in, BasicAuth, точный Host/Origin, spoofed forwarding, upload origin и ограничение bind.
