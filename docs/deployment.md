# Проверка с Mac: HTTPS и локальный HTTP по IP

Цель: отдельный закрытый review deployment с настоящими NestJS/Next/PostgreSQL и DeepSeek. Никакой подмены AI/БД и переноса логики в несовместимый hosting. Опубликован с Mac по HTTPS; существование нижеописанных VPS templates само по себе не означает их развёртывание.

## Текущий выбранный маршрут: временно с Mac

По последнему запросу заказчика публикация идёт временно с Mac, не на VPS. Отдельная локальная PostgreSQL БД `praktikum_review`, API3311 и Next3300 работают в production; gateway3390 слушает только loopback. Cloudflared Quick Tunnel соединяет публичный HTTPS URL с gateway, который требует случайные review credentials на всех путях. Link временный: зависит от работающего Mac/сети/процессов и меняется при пересоздании tunnel. Это не постоянный hosting; systemd/nginx ниже — будущий вариант, не текущая публикация.

На 2026-11-25 действует **https://coaches-explains-teach-hewlett.trycloudflare.com**. Внешне проверены gate401/authorized200, реальный AI сценарий, cookie Secure/HttpOnly/Lax, регистрация и изоляция. Доступы только в локальном `.runtime/review/access.txt`600.

Root создаёт отдельный private env600 и пустую review БД; `deploy/provision-review.ts` создаёт две компании alpha/beta с OWNER/MANAGER/EMPLOYEE и SUPER_ADMIN только в alpha, все app passwords случайны. Исходная локальная БД и её UNKNOWN не копируются и не изменяются.

После `pnpm build` запускать API/Next с NODE_ENVproduction и приватным env review БД; API PORT3311, Next CLI --port3300. Сначала получить hostname из cloudflared, затем gateway:

```bash
node --env-file=PRIVATE_REVIEW_ENV deploy/review-gateway.mjs
```

В private env нужны REVIEW_PUBLIC_HOST (точный hostname без scheme/path), REVIEW_GATE_USER, REVIEW_GATE_PASSWORD (криптографически случайный32+bytes), REVIEW_GATE_PORT3390, REVIEW_UPSTREAM_PORT3300. Gateway не логирует credentials, BasicAuth сравнивает SHA256 digests constant-time, удаляет Authorization до Next, доверенные Host/X-Forwarded-Host/proto берёт из своей конфигурации, проверяет Origin, ограничивает headers/body, timeout180s. Публичный HTTP перенаправляется на HTTPS до challenge. Health/static/login тоже защищены. `node --test deploy/review-gateway.test.mjs` проверяет401/redirect/host/origin/stripping/body/timeout; отдельный внешний smoke подтверждает действительный tunnel, cookies и Server Actions.

Для прямого локального smoke gateway нужен Host=REVIEW_PUBLIC_HOST и X-Forwarded-Proto=https. Это доверенный loopback интерфейс cloudflared, не самостоятельный публичный HTTP сервер. Не менять bind на0.0.0.0. Без gate публикация с включённым Demo пополнением запрещена выбранной review конфигурацией.

## Прямой HTTP по IP Mac — 25.11.2026

Локальный адрес: **http://192.168.31.195:8080**. Он предназначен для устройств в той же сети Wi-Fi. Next для HTTP работает отдельно на `127.0.0.1:8081`, gateway слушает только `192.168.31.195:8080`; API и PostgreSQL остаются на loopback. Общий пароль review и учётные записи приложения прежние. HTTPS экземпляр продолжает работать отдельно.

Запуск уже подготовленных приватных конфигураций из корня проекта, в отдельных процессах:

```bash
node --env-file=.runtime/review/web-lan.env apps/web/node_modules/next/dist/bin/next start apps/web --hostname 127.0.0.1 --port 8081
node --env-file=.runtime/review/gateway-lan.env deploy/review-gateway.mjs
```

HTTP требует явных `REVIEW_ALLOW_HTTP=true` у gateway и `REVIEW_ALLOW_HTTP_COOKIE=true` у отдельного Next, точного `PUBLIC_ORIGIN=http://192.168.31.195:8080` и соответствующих Host/Origin. BasicAuth защищает все пути; чужой Origin отвергается. Cookie HTTP сохраняет HttpOnly/SameSite=Lax; cookie production HTTPS по умолчанию остаётся Secure. Bind `0.0.0.0` запрещён. Детали конфигурации и проверенные источники: [http-review-source](http-review-source.md).

Это локальный адрес, не публичная интернет-ссылка. Внешний вход по IP требует доступного входящим соединениям WAN IP и проброса TCP-порта на роутере; эти условия не настроены и не подтверждены. Роутер запросил авторизацию; автоматическое обнаружение UPnP gateway не дало ответа. Текущий LAN IP выдан DHCP: для постоянного адреса нужна резервация на роутере. Настройки роутера, VPN, DHCP и системного firewall не менялись. Mac должен оставаться включённым и не спать; автозапуск после reboot не установлен.

При смене LAN IP нужно одновременно обновить bind/Host/Origin в обоих приватных env и URL browser smoke, затем перезапустить только HTTP пару. При сборке остановить оба Next экземпляра или собрать изолированный release: они используют один каталог `.next`. Новый IP сам по себе не меняет tenant или базу данных.

## Повторный запуск на этом Mac

После сборки из корня проекта (env файлы уже созданы приватно; их содержимое не копировать в Git/логи):

```bash
node --env-file=.runtime/review/api.env apps/api/dist/src/main.js
node --env-file=.runtime/review/web.env apps/web/node_modules/next/dist/bin/next start apps/web --hostname 127.0.0.1 --port 3300
node --env-file=.runtime/review/gateway.env deploy/review-gateway.mjs
cloudflared tunnel --url http://127.0.0.1:3390 --no-autoupdate --protocol http2 --loglevel info
```

Запускаются в отдельных терминалах; Ctrl+C останавливает соответствующий процесс. Перед повтором проверить, что нужный порт свободен; не останавливать чужие сервисы и весь Node/Postgres. Не запускать build поверх `.next`, пока текущий production Next обслуживает запросы: сначала остановить только этот Next или собрать отдельный release. При новом tunnel hostname записать его в `gateway.env`→REVIEW_PUBLIC_HOST и origin с `https://` в `web.env`→PUBLIC_ORIGIN; затем перезапустить gateway/Next. App cookie HttpOnly/Secure/Lax, API/Next/gateway/PG слушают127.0.0.1. Порты3311/3300/3390/55432. Из браузера обращаться по внешнему HTTPS URL.

После длительной паузы attached tool sessions остановились, поэтому текущие процессы запущены отдельно через POSIX detached session с перенаправлением stdout/stderr в приватные `.runtime/review/*-detached.log` и PID учётом в `detached-processes.json`600. Это отделяет их от активного шага инструментов, без установки системного автозапуска. PID сам по себе не достаточен для остановки: сначала проверить command identity и порт, затем послать SIGTERM только этому процессу; чужие Node/DB не завершать. При пересоздании tunnel старый URL заменён, private Host/Origin/browser env и access файл синхронизированы; актуальный host повторно проверяется browser smoke. Исторические891кредитов real-AI сценария относятся к предыдущему tunnel адресу на той же review БД; AI не вызывался повторно ради смены адреса.

Процессы не установлены в launchd, автозапуск после reboot/сон Mac не настроен. Временная ссылка остановится при прекращении работы процессов/сети; это выбранная временная проверка. Текущий origin хранится только в private env, а меняющийся URL в этой документации — снимок даты проверки.

## Изоляция на существующем VPS (будущий вариант)

Новый Unix user `praktikum`, каталог `/opt/praktikum/{releases,current,data}`, отдельные PostgreSQL role/database `praktikum`, внутренние порты API3311/web3300 (до назначения проверить свободность). Не останавливать и не перезаписывать существующие приложения, nginx vhosts, БД и порты. Node22+ и pnpm10.11; конкретные пути и версии проверяются на назначенном сервере. API bind127.0.0.1; Next start тоже loopback. В nginx публикуется только Next, без открытого proxy к API.

Runtime: compiled Nest `apps/api/dist/src/main.js`, shared package `packages/types/dist/index.js` в CommonJS. Обычный Node22 не должен импортировать исходный TypeScript из packages/types. Turbo build сначала строит shared dependency; root dev/test/evals/seed также готовят shared runtime. Next production `next build` + `next start`, NODE_ENV=production обеспечивает HttpOnly Secure SameSite=Lax cookie. Host/X-Forwarded-Host/Proto передаются без подмены, чтобы Server Actions сохраняли origin protection. Wildcard allowedOrigins не используется.

## Доступ и бюджет

Обязателен сильный private review gate nginx BasicAuth **только по HTTPS**. HTTP только перенаправляет на HTTPS, пароль не запрашивается по plaintext. Генерировать случайный длинный gate пароль, хранить htpasswd вне repo `/etc/praktikum/review.htpasswd`, права root:www-data640. Передавать доступ только проверяющим, не публиковать известные demo пароли. Полноценные app-роли и сессии сохраняются за gate.

В production регистрация и Demo пополнение по умолчанию запрещены backend policy. Review environment явно `ALLOW_PUBLIC_REGISTRATION=true`, `ALLOW_MOCK_TOPUPS=true`: доверенный пользователь за gate может зарегистрировать новую компанию с нулевым балансом; её OWNER может проверить Demo пополнение и AI. Незнакомец без gate получает401 на всех путях. Регистрация включена после явного уточнения заказчика; обычный production default остаётсяfalse. Для полностью закрытого бюджета задайте ALLOW_MOCK_TOPUPS=false. Локальный DI/Playwright сценарий проверяет регистрацию, она не вырезана из продукта. Администратор выдаёт случайные app credentials через provision script; начальный company budget500000 и user limits500000. Это осознанный доступ доверенного review владельца, не публичный анонимный SaaS launch.

Не запускать публичный `pnpm db:seed`: его локальные пароли известны. Для **пустой отдельной** БД:

```bash
REVIEW_CREDENTIALS_FILE=/etc/praktikum/review-accounts.json node --env-file=/etc/praktikum/production.env --import tsx deploy/provision-review.ts
```

Скрипт отказывается от непустой БД, записывает пароли только в новый файл600 и не печатает их. При ошибке БД остаётся защищённый credential file для диагностики; перед повторным provision проверить БД и удалить только этот ошибочный файл осознанно. API ключ/DSN — `/etc/praktikum/production.env` root-owned600, не в git, CLI arguments, screenshots или журналах. Пример — deploy/production.env.example. Не помещать PORT в общий env: порты различаются по systemd units.

## Сборка и запуск

1. Проверить назначенный hostname/DNS/порты/место/RAM/существующие сервисы. Дать новому app user доступ только к собственным файлам и БД.
2. Скопировать source release без .env, .runtime, node_modules, .git. `pnpm install --frozen-lockfile`, `pnpm db:generate`, `pnpm build` на Linux. Не копировать macOS node_modules/Prisma engine. Перед миграцией снять backup текущей production БД.
3. Применить только committed migrations: `node --env-file=/etc/praktikum/production.env node_modules/prisma/build/index.js migrate deploy --schema apps/api/prisma/schema.prisma`. Никогда migrate dev/reset. Первый release provision отдельно.
4. Назначить symlink current на полностью собранный release. Создать data/backups, app user ownership, .next writable для Next cache.
5. Получить доверенный TLS сертификат через существующий ACME workflow сервера. Временный HTTP challenge vhost должен обслуживать только ACME/redirect, без BasicAuth credentials. Не менять другие vhosts. Финальный template требует уже существующие cert/key.
6. Render локально, затем проверить файлы перед установкой:

```bash
DEPLOY_HOSTNAME=review.example.com DEPLOY_NODE_BIN=/usr/bin/node node deploy/render.mjs /tmp/praktikum-rendered
```

Допустимые overrides DEPLOY_APP_ROOT/RUN_USER/API_PORT/WEB_PORT/TLS_CERT_PATH/TLS_KEY_PATH. Render не меняет сервер. Установить **только новые** praktikum units/nginx vhost, проверить `nginx -t` и `systemd-analyze verify`, daemon-reload, enable --now praktikum-api praktikum-web praktikum-backup.timer, reload nginx. Поднимать services после успешной сборки и миграций. systemd restart сохраняет БД; filesystem read-only кроме data и Next cache.

## Backup и восстановление

Daily systemd timer02:15 с catch-up (будущий VPS вариант), custom pg_dump + архив оригиналов uploads + manifest SHA256, retention7 дней целыми backup sets, файлы600/каталог700. `deploy/backup.mjs` требует MATERIAL_UPLOAD_DIR, передаёт пароль libpq только через env дочерних pg_dump/psql, не process argv; child не получает AI keys. Сначала снимается DB snapshot, затем архивируются UUID-файлы по referenced keys. Это согласованно при текущем append-only/immutable storage; перед добавлением удаления/замены файлов нужно quiesce/snapshot protocol. Manifest публикуется последним и является признаком завершённого set; один dump без manifest не считается полным backup. SHA есть для dump, архива и каждого файла. Симлинки/невалидные keys отклоняются.

Проверка `node --env-file=.env --import tsx apps/api/test/backup-roundtrip.ts` создаёт две отдельные временные БД, применяет миграции, создаёт файл/metadata/session, сохраняет set, восстанавливает БД+файлы и проверяет SHA через настоящий authenticated Nest GET download; затем удаляет только свои БД и workspace. Проверено PASS. Нужны локальные createdb/dropdb права для этой отдельной проверки. Ни рабочая review БД, ни старый UNKNOWN не меняются. Локальные backup sets на том же диске не защищают от потери диска; offsite копия не заявлена выполненной.

Restore выполняет оператор в **новую отдельную БД**: выбрать завершённый manifest, проверить SHA dump/архива, создать пустую target, `pg_restore --exit-on-error --no-owner -d TARGET archive.dump`, распаковать соответствующий uploads.tar.gz в новый приватный каталог и проверить file SHA из manifest. Настроить MATERIAL_UPLOAD_DIR на этот каталог, проверить таблицы/tenant counts и authenticated download hash. Не выполнять --clean по рабочей БД без отдельной авторизации. Перед обновлением сохранять backup и предыдущий release. Rollback code: вернуть current на предыдущий совместимый release и restart только praktikum units; destructive down migrations автоматически не выполняются. При несовместимой схеме восстановление идёт в новую БД с отдельным переключением DSN.

## Приёмка на реальной границе

- HTTPS доверен на другом устройстве, HTTP→HTTPS, без auth401, с gate логин200.
- API/PG внутренние порты недоступны извне; существующие сайты работают.
- Production app login cookie HttpOnly/Secure/Lax; logout отзывает сессию.
- OWNER материал→realDeepSeek задание; EMPLOYEE ответ→evidence/критерии/персональный материал; MANAGER результат; usage/ledger/cache повтор; Super-admin exact global totals+all unresolved.
- Обычный production без явного flag запрещает регистрацию403. В текущем закрытом review регистрация включена: действительный HTTPS Playwright создал пустой tenant/owner с0балансом, проверил повторный вход и чужойdownload404, затем удалил только эту тесткомпанию. Demo topup доступен только OWNER за gate. Отключённые flags403 независимо от UI.
- После deploy unit/HTTP e2e/Playwright выполняются и протоколируются. Полная регистрация/ошибочные AI fixtures — изолированный локальный DI browser harness; public smoke — фактически опубликованный хост с review credentials, без production AI mock switch.
- Restart/reboot units, состояние PostgreSQL, ручной backup/restore smoke и timer next run проверяются отдельно; не выводить их из локального build.

## Источники Context7

Next self hosting/Server Actions: https://github.com/vercel/next.js/blob/canary/docs/01-app/03-api-reference/05-config/01-next-config-js/serverActions.mdx ; Nest deployment/shutdown: https://github.com/nestjs/docs.nestjs.com/blob/master/content/deployment.md ; Prisma deploy: https://www.prisma.io/docs/orm/prisma-migrate/workflows/development-and-production ; nginx auth/proxy: https://nginx.org/en/docs/http/ngx_http_auth_basic_module.html и https://nginx.org/en/docs/http/ngx_http_proxy_module.html ; systemd sandboxing https://www.freedesktop.org/software/systemd/man/latest/systemd.exec.html ; PostgreSQL dumps https://www.postgresql.org/docs/current/backup-dump.html ; Zod string validation https://zod.dev/api?id=strings .
