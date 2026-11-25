# Условия приёмки и фактические результаты

Дата:2026-11-24. PostgreSQL14, Node25.9/pnpm10.11; compiled API отдельно проверен наNode22.23.5. Шесть Prisma миграций. Текущая HTTPS review версия использует production Nest3311/Next3300/gateway3390, только loopback; отдельная БД `praktikum_review`. Первоначальный local MVP и его история сохранены отдельно.

## Проверки кода и данных

| Проверка | Фактический результат |
|---|---|
| install/generate/migrate |PASS, lockfile; Prisma6.19;6 committed migrations применены|
| pnpm lint |PASS после финальных изменений|
| pnpm typecheck |PASS API/shared/Next|
| pnpm test |**28/28 PASS**: API25 (core/assessment14+documents11), BFF Origin1, gateway2|
| HTTP+PostgreSQL e2e |PASS; полный suite повторён root после свежих isolation assertions|
| pnpm evals |**8/8 PASS**,5 исторических+3 принятых task-aware записанных DeepSeek ответа, без новых API вызовов|
| pnpm build |PASS shared/API/Next; последняя сборка7.286s (shared cache, API и Next пересобраны); она обслуживает текущий review|
| Compiled Node22 smoke |PASS health200 и production default registration403, без tsx runtime|
| Backup/restore |PASS, две отдельные временные БД, paired dump+files+hash manifest, настоящий authenticated download после restore|
| git diff --check |PASS; секреты/runtime исключены из публикации|

Локальные evidence logs в игнорируемом `.runtime`: `final-unit.log`, `final-http-e2e.log`, `final-lint.log`, `final-typecheck.log`, `final-evals.log`, `final-backup-roundtrip.log`, `final-header-build.log`. Они не заменяют воспроизводимые исходники тестов.

HTTP e2e проверяет регистрацию, роли/сессии/logout, owner team/limits, concurrent idempotent Demo topup, material→assignment→attempt→manager report, retry null/ложной цитаты, стоимость всех платных ответов, cache/replay, exhausted retry, известный429/refund/retry, INVALID→429→успех с накопленной стоимостью, persistent revision/ABA, конкурентный баланс и UNKNOWN hold/no replay. Добавлены детерминированные реальные PG гонки reserve против изменения employee limit: обе очередности повторены дважды, без sleeps; проигрыш полностью откатывает budget/ledger/operation и не вызывает провайдера.

Изоляционные регрессии проверяют компанию Б: собственное имя и команда, отсутствие чужих материалов/заданий/результатов/операций/финансов; изменение чужого лимита403 без изменений БД; внедрение companyId в DTO400 без расходов; второй сотрудник не видит чужих попыток/операций/команды/ledger. Рекурсивно проверено отсутствие passwordHash/session/token/attachmentKey, в том числе во вложенных данных. У каждого tenant собственный кабинет; платформенный SUPER_ADMIN имеет отдельно разрешённый финансовый аудит, а tenant routes ему не доступны.

Document tests: реальные кириллические DOCX/DOC/PDF/TXT(UTF8/CP1251/UTF16), MIME/signature spoof, binary TXT, размер/длина, zip bomb/DTD/entity/path, повреждённый/зашифрованный/скан PDF, multipart413,401/403, foreign tenant404, byte-for-byte download, DB-error cleanup, private path. Регрессии subprocess tree hard deadline/RSS и PDF overlimit без усечения. Document HTTP focused test использует настоящий Nest/AuthGuard/parser/storage и in-memory DB adapter; Playwright отдельно использует PostgreSQL. BFF тестирует exact trusted PUBLIC_ORIGIN и spoofed forwarded headers. Gateway тесты проверяют auth/HTTPS redirect/host/origin/stripping/body/timeout.

## Playwright и действительная публикация

| Проверка | Фактический результат |
|---|---|
| Локальный Chromium suite |**5/5 PASS,1.1min,retries0**, бизнес-флоу/roles/docs/limits, invalid login, role tours, admin, mobile|
| Public read-only smoke |**3/3 PASS,20.0s**, OWNER/EMPLOYEE/SUPER_ADMIN через настоящий HTTPS gate|
| Public real AI business flow |PASS DOCX upload/original hash→DeepSeek task→employee answer/evaluation→manager report|
| Public financial check |2 real provider calls,891internalcredits; balance delta=AiCall.cost; cached generate0|
| Public result |score100/100,2точныецитаты, критерии/пробелы/рекомендации/персональный материал|
| Public auth/files/mobile |anonymous401, authorized login200; Secure/HttpOnly/Lax; foreign file404;390px nooverflow и replaytour|
| Public registration after enabling |PASS: новая компания/OWNER/0balance/emptyworkspace/ownteam, onboarding, logout+login, Alpha download404;0AIcalls; тестtenant удалён|

Действительный адрес: **https://coaches-explains-teach-hewlett.trycloudflare.com**. Случайные gate/app credentials только в локальном `.runtime/review/access.txt`600. На текущей закрытой ссылке регистрация и Demo пополнение включены явно по уточнению заказчика. Обычный production без flags запрещает их. После смены review flag API перезапущен и HTTPS регистрация проверена заново. Первоначальный public тестregistration403 относится к состоянию **до** включения и не выдаётся за текущую политику.

Локальный browser harness заменяет только AiProvider через DI; auth/Prisma/PostgreSQL/Next/деньги настоящие. Публичная версия использует настоящий DeepSeek, без fixture режима. Отчёты, команды и границы: [browser-tests.md](browser-tests.md). Снимки: [обучение](screenshots/public-onboarding.jpg), [результат](screenshots/public-result.jpg), [мобильный тур](screenshots/public-mobile-tour.jpg).

После пересоздания временного tunnel текущий адрес снова проверен: registration и upload UI через HTTPS PASS, без AI. Загрузка проверяет настоящий DOCX/оригинал, отказ для сканированного PDF, имя файла, pending disabled у обоих полей и кнопки, aria-busy, очистку/восстановление после успеха. На390px кнопка повторного обучения в шапке не пересекается с upload submit, горизонтального переполнения нет; временные тестовые данные удалены. Исторический891-credit real AI сценарий выполнен на предыдущем tunnel адресе с той же review БД; платный API не запускался заново ради смены hostname.

## Аудит и исправления

Независимые review Sol приняли backend, finance/revision, file processing и onboarding. Исправлены пустые обязательные AI строки; неверная трактовка последних100/200 записей как глобальных итогов (теперь exact aggregates+отдельные окна+все unresolved); двойной учёт стоимости при ручной многокруговой сверке; внешний Origin при внутреннем Next URL; неполное завершение process tree; частичное принятие слишком длинного PDF. После исправлений проведены regression checks и свежие review. По ручным замечаниям заказчика исправлены форма загрузки и ролевые переходы меню; все видимые sidebar links владельца/руководителя/сотрудника проверяются кликами, существующим target и viewport. Кнопка повторного тура перенесена из плавающего положения в шапку. Playwright selectors/доступное имя диалога скорректированы по фактическому UI; итоговый прогон полностью успешен.

Полное сопоставление с исходным ТЗ, согласованными изменениями и понятностью архитектуры: [project-audit.md](project-audit.md). Новое review изоляции не нашло подтверждённого cross-company read/mutation; покрытие усилено и suite повторён независимо.

## Что упрощено и не доказано

Modular monolith, тонкий Prisma Repository, application-level tenancy без PostgreSQL RLS. Один кейс на материал, snapshot критериев без редактора; накопительные лимиты без budget periods. PaymentProvider/NotificationSender — явные Demo DI реализации. Нет реальной оплаты/email, SSO/reset password, автоматического UNKNOWN/PENDING reconciler. Неизвестный внешний исход удерживает резерв до [ручной сверки](reconciliation.md).

DeepSeek JSON mode с локальной Zod/evidence проверкой — согласованное изменение исходного требования OpenAI strict schema (ADR0010). Optional OpenAI adapter не получил успешного completion на выданном аккаунте из-за429 credit_balance_exhausted. Пять live eval случаев ранее прошли100/100/0/25/0; их записанные ответы повторно проверяются offline. Эти кейсы и два реальных end-to-end сценария не доказывают семантическую правильность любого AI ответа; нужен контроль руководителя.

OCR отсутствует; PDF нужен текстовый слой. Сложные Word/PDF элементы могут не войти в извлечение, полный сохранённый текст виден до генерации. Файл≤5МиБ и текст60–12000символов; длинное отклоняется. Chromium проверен на desktop и390px, другие браузеры/реальные мобильные устройства отдельно не прогонялись.

Временный Mac URL зависит от процессов/сети и меняется при пересоздании tunnel; постоянный VPS/автозапуск/защита от сна/offsite backup не настроены. Paired backup/restore проверен, ежедневный systemd timer — только будущий VPS template. Массовая обработка произвольных файлов потребует ограничения конкурентности и OS memory sandbox. Исторический UNKNOWN OpenAI в исходной локальной БД сохранён с резервом100000, в review БД не переносился и без доказательств не корректировался.

## Очистка и трудозатраты

Безопасно очищены воспроизводимые кэши: сразу до/после220→4404МиБ свободно, после новых сборок около3.1ГиБ. Docker engine отсутствует, контейнеры/volumes не удалялись. [Протокол](maintenance-cleanup.md).

Исходная оценка84–124ч — бюджетный ориентир обычной разработки, не фактические человеко-часы агента. Зафиксированный исторический интервал первоначального MVP19:46:11–20:24:08MSK составил38.0мин wall-clock; последующие итерации: публикация/packaging, documents, onboarding, security review, backup, Playwright, расширенная isolation и включение регистрации/GitHub. Полная длительность расширенного этапа и сумма агентных человеко-часов не измерялись. Старый локальный live:7успешныхDeepSeekcalls/4234internalcredits; отдельный публичный live:2calls/891. Это внутренний учёт, внешний invoice не проверялся.

## Дополнительная оценка содержательного качества ИИ

Первый содержательный прогон обнаружил обрезание1500-token JSON и ложные замечания. Он сохранён как историческийFAIL:4ops/9calls/14885internalcredits. После перехода к frozen assessment и policy5 реальные одинаковые контрольные ответы получили**100/72/8**, все с первой попытки, без ложных пропусков в принятом полном ответе. Независимый Sol проверил требования до оценок и затем все критерии/checks/цитаты/gaps/recommendations. Другой складской сценарий:100, расчёт48/60,12 повреждённых изолированы, условия согласования и подписи соблюдены. Это два реальных вопроса/четыре контролируемых ответа, а не доказательство качества любой задачи.

Дополнительный old-task regression88 сохранил ложные замечания. Он **не** объявлен исправленным: новые оценки старых заданий теперь получают409 до бюджета/операции/провайдера. OWNER/MANAGER создаёт новое V2 задание с frozen требованиями; старые assignment/attempt/report не меняются и помечены «Предыдущая методика». HTTP e2e проверяет нулевые финансовые эффекты409/403, новыйID и сохранность старых записей.

Все paid QA записи сохранены. Старый QA tenant:5ops/10calls/16302credit, новый:9ops/9calls/14448credit; суммарно30750 (из них15865 после baseline). SQL ledger/usage/operation/spent/balance согласованы, UNKNOWN/PENDING0; контрольные сессии отозваны. Сырые данные/пароли игнорируются Git. Схема и финансовая граница: [ai-evaluation-design.md](ai-evaluation-design.md), полная честная история: [ai-quality-review.md](ai-quality-review.md). Экспортированы3 принятые реальные записи policy5 с provenance; исторические5 не переписаны.


Публичный GitHub: https://github.com/Oksnard/praktikum . Первый release e04fe13 отправлен вmaster, remote SHA совпал с локальным; API подтвердилpublic visibility и наличие проверенного Word-файла. История и staged blobs прошли проверку известных private credential values/key patterns, совпадений нет. Полный raw/runtime audit не публикуется.

## Финальная проверка опубликованных отчётов

После финальной сборки с legacy guard root повторил28focused tests,HTTPe2e,8offlineevals,lint/typecheck и5localPlaywright(1.1min):PASS. Production-smoke3/3PASS20.0s на актуальном HTTPS.

Отдельный `tests/public-quality-ui-check.mts` через публичный сайт: **PASS**. Сверены реальные100/72/8, все критерии/explanations/evidence/recommendations, разбор владельца,390px без горизонтального переполнения. Карточки полностью попадают в PNG ниже sticky шапки. Старые результаты отмечены прежней методикой, у owner видна кнопка обновления; employee не имеет формы ответа на старое задание. Прямой API POST получил409; owner snapshots подтвердили неизменность баланса, user.spent всех пользователей, операций, ledger и attempts. Все4 созданные сессии успешно отозваны,0AI. Первые тестовые ошибки были ошибками селекторов/расположения подписи; исправлены после эскалации сLuna кAstra, продукт ради теста не менялся.

Локальные evidence: `.runtime/final-delivery-*.log`, `.runtime/playwright/final-delivery-browser.log`, `.runtime/review/final-ai-remote-smoke.log`, `.runtime/review/quality-ui-astra-acceptance.log`, `quality-ui-result.json`. Снимки в [full](screenshots/ai-quality-full.png), [partial](screenshots/ai-quality-partial.png), [unsafe](screenshots/ai-quality-unsafe.png). Приватные QA доступы добавлены только в `.runtime/review/access.txt`600.

## HTTP по IP Mac — 25.11.2026

Локальный review: **http://192.168.31.195:8080**. BasicAuth и tenant-сессии сохранены. PASS: unit33/33, lint/typecheck/build, Playwright LAN3/3 ролей, реальная HTTP регистрация→DOCX upload→оригинал по SHA256→logout/login, чужой Origin403 и anonymous401. HTTP cookie HttpOnly/Lax/Secure=false; отдельный HTTPS экземпляр сохранил Secure=true и прошёл3/3 ролей. AI в этих проверках не вызывался. Подробности и ограничения: [deployment](deployment.md), [журнал](development-log.md).

Проверен LAN адрес с Mac; другое физическое устройство и прямой IP через Интернет не проверялись. Роутер не настроен, IP выдан DHCP, автозапуск/защита от сна не настроены. Это доступ в текущей локальной сети, не постоянный внешний hosting.

## Бесплатный cloud review — подготовка25.11.2026

Source readiness PASS:38 unit/focused, lint/typecheck; isolated Node22 build/start; real PG upload→restart→download/isolation; fresh Sol source acceptance. Cloud deployment **ещё не выполнен**: требуется подключение Render, настоящий Docker build и внешний smoke. Публичный URL Render пока не получен. Текущие Mac адреса выше не являются облачным результатом. [Конфигурация](render-cloud-source.md).
