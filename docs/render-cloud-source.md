# Render Free: подготовленный cloud release

Это deployment-артефакты, **не свидетельство состоявшейся cloud-публикации**. Фактическую ссылку, build и smoke фиксирует root после создания ресурсов.

## Источники, проверенные 25.11.2026

- [Render web services](https://render.com/docs/web-services): публичный процесс слушает `0.0.0.0:$PORT`; Docker поддерживается.
- [Render Blueprint](https://render.com/docs/blueprint-spec): `runtime: docker`, `plan: free`, `healthCheckPath`, секреты `sync: false`, DSN через `fromDatabase`; `ipAllowList: []` запрещает публичные подключения к PG.
- [Free limits](https://render.com/docs/free): web засыпает после 15 минут простоя, локальные файлы теряются; Free Postgres истекает через 30 дней. Это временная demo, не постоянный production SLA. Бесплатная БД ограничена; загрузки расходуют её место.
- Context7 [Prisma v6 Bytes](https://github.com/prisma/web/blob/v6/content/200-orm/200-prisma-client/200-special-fields-and-types/index.mdx) и [schema PostgreSQL mapping](https://github.com/prisma/web/blob/v6/content/200-orm/500-reference/100-prisma-schema-reference.mdx): `Bytes` соответствует `bytea`, Prisma 6 использует `Uint8Array`.

## Состав

`Dockerfile`: Debian Node22, pnpm10.11.0, Python venv+pypdf6.14.2, antiword, procps, OpenSSL; compilation без API-ключа. `.dockerignore` исключает env/runtime/локальные build/credentials. Секреты не передаются как Docker ARG/ENV и не копируются в image.

`deploy/cloud/start.mjs`: миграции → атомарное идемпотентное создание семи review identities и двух компаний → API3311/Next3300 на loopback → внешний gateway. Supervisor завершает sibling при выходе любого сервиса; Render перезапускает весь контейнер. При рестарте балансы, пароли и данные не перезаписываются. БД с чужой/несовпадающей начальной конфигурацией отклоняется.

`MATERIAL_STORAGE=postgres` выбирается cloud entrypoint. Миграция7 добавляет `StoredFile.data Bytes` с SQL-ограничением 1–5242880 байт. Локальный default остаётся `LocalFileStorage`. Только DocumentsService после tenant-scoped material lookup читает storage key; ключ не публикуется. Оригиналы остаются в PG при sleep/redeploy контейнера. При ошибке создания Material производится cleanup файла, как в локальном backend. Это две операции, поэтому crash между ними может оставить orphan; автоматический cleanup и общий storage quota не заявлены. `pg_dump` этой БД включает оригиналы; прежний paired local-files backup без адаптации здесь не запускать.

## Private runtime env

Render задаёт `RENDER=true`, `RENDER_EXTERNAL_HOSTNAME` и `PORT`. Обязательны `REVIEW_TRUST_RENDER=true`, `DATABASE_URL`, `DEEPSEEK_API_KEY`, `REVIEW_GATE_USER`, `REVIEW_GATE_PASSWORD` (случайные ≥32bytes), `REVIEW_ACCOUNTS_JSON` (JSON array семи identities: `company`, `role`, `email`, `password`; alpha OWNER/MANAGER/EMPLOYEE/SUPER_ADMIN, beta OWNER/MANAGER/EMPLOYEE, passwords≥20chars). Account JSON — секрет, не помещать в blueprint/logs. `ALLOW_PUBLIC_REGISTRATION`/`ALLOW_MOCK_TOPUPS` заданы в blueprint явно за review gate.

`PUBLIC_ORIGIN=https://$RENDER_EXTERNAL_HOSTNAME` задаётся entrypoint; HTTP opt-ins запрещены. Secure cookie сохраняется. API получает provider/DB config; Next получает только loopback API_URL, PUBLIC_ORIGIN и необходимые несекретные process variables. BasicAuth удаляется gateway перед upstream. Render HTTPS mode позволяет wildcard bind только для explicit trusted configuration; локальные/HTTP defaults не расширены.

Единственное исключение gate: точный **GET /_review/ready** (без query), ответ пустой204 либо503. Он проверяет API /health и Next /login с timeout и не раскрывает данные. Все app/static/обычный /health остаются за BasicAuth. Входящие Host/Origin проверяются; HTTPS-required и configured forwarded headers сохраняются.

## Source verification

`node --test deploy/review-gateway.test.mjs deploy/cloud/supervisor.test.mjs`: security/config/readiness/real-child lifecycle. `tests/cloud-storage-e2e.mts` требует новую отдельную мигрированную PG БД: real HTTP upload/download после API restart, owner/employee разрешены, foreign404/anonymous401, seed idempotency, oversized bytes/key rejection. В тесте нет AI calls. Изолированная БД удаляется оператором после проверки. Root дополнительно проверяет реальный Render build, 512MiB runtime, parser dependencies и публичные cookies/tenant flows; без этого cloud success не заявляется.

Фактический локальный preflight: 25 API unit + 9 gateway/supervisor tests PASS; API tsc PASS; изолированные Next16.4.6 build/start на Node22.20.0 PASS (запуск из release root с аргументом `apps/web`), настоящий login HTML200 через Render-mode gate. Fresh local PostgreSQL7migrations + bytes/HTTP/restart/tenant/seed regression PASS, только созданная тестом БД удалена. Active Mac `.next` и private review БД не менялись. Docker build/Render memory/public smoke пока не выполнялись.
