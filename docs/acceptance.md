# Условия приёмки и фактические результаты

Дата:2026-11-24. PostgreSQL14, Node25.9/pnpm10.11; compiled API отдельно проверен наNode22.23.5. Шесть Prisma миграций. Текущая HTTPS review версия использует production Nest3311/Next3300/gateway3390, только loopback; отдельная БД `praktikum_review`. Первоначальный local MVP и его история сохранены отдельно.

## Проверки кода и данных

| Проверка | Фактический результат |
|---|---|
| install/generate/migrate |PASS, lockfile; Prisma6.19;6 committed migrations применены|
| pnpm lint |PASS после финальных изменений|
| pnpm typecheck |PASS API/shared/Next|
| pnpm test |**22/22 PASS**: API19 (core8+documents11), BFF Origin1, gateway2|
| HTTP+PostgreSQL e2e |PASS; полный suite повторён root после свежих isolation assertions|
| pnpm evals |**5/5 PASS**, записанные реальные DeepSeek ответы, без новых API вызовов|
| pnpm build |PASS shared/API/Next; последняя сборка6.206s (shared/API cache, Next пересобран); она обслуживает текущий review|
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
| Public read-only smoke |**3/3 PASS,14.3s**, OWNER/EMPLOYEE/SUPER_ADMIN через настоящий HTTPS gate|
| Public real AI business flow |PASS DOCX upload/original hash→DeepSeek task→employee answer/evaluation→manager report|
| Public financial check |2 real provider calls,891internalcredits; balance delta=AiCall.cost; cached generate0|
| Public result |score100/100,2точныецитаты, критерии/пробелы/рекомендации/персональный материал|
| Public auth/files/mobile |anonymous401, authorized login200; Secure/HttpOnly/Lax; foreign file404;390px nooverflow и replaytour|
| Public registration after enabling |PASS: новая компания/OWNER/0balance/emptyworkspace/ownteam, onboarding, logout+login, Alpha download404;0AIcalls; тестtenant удалён|

Действительный адрес: **https://nights-known-believed-meetup.trycloudflare.com**. Случайные gate/app credentials только в локальном `.runtime/review/access.txt`600. На текущей закрытой ссылке регистрация и Demo пополнение включены явно по уточнению заказчика. Обычный production без flags запрещает их. После смены review flag API перезапущен и HTTPS регистрация проверена заново. Первоначальный public тестregistration403 относится к состоянию **до** включения и не выдаётся за текущую политику.

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

По последнему запросу заказчика выполняется отдельная реальная проверка трёх контролируемых ответов по предоставленному учебному регламенту. Она оценивает смысл баллов и рекомендаций, а не только Zod/цитаты. Результат будет записан отдельно в ai-quality-review.md; текущие зелёные технические тесты не подменяют эту проверку.
