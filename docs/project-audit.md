# Аудит требований и границ MVP

Срез24.11.2026. Матрица сопоставляет [исходное ТЗ и дополнения](requirements.md) с owning code и проверками. Она не подменяет [финальный протокол приёмки](acceptance.md), фактическую публикацию или отдельный tenant review. Изменений product/test кода и новых платных AI вызовов при подготовке этого документа не выполнялось.

## Что проверено на разных границах

| Граница | Фактическое свидетельство |
|---|---|
| Unit/HTTP с PostgreSQL | [unit](../apps/api/test/unit.test.ts), [e2e](../apps/api/test/e2e.ts): роли/tenant predicates, pricing/cache, retry/null/invalid evidence, reserve/settlement, concurrent topup/budgets, ABA/REJECTED, оба порядка limit lowering vs reserve по2 синхронизированных раунда. Последний HTTP прогон PASS, без внешнего AI. |
| Документы/ресурсы | [11 document cases](../apps/api/test/documents.test.ts) + [origin case](../apps/web/test/upload-origin.test.ts): реальные файлы и парсеры; multipart HTTP persistence **в этом тесте in-memory**, не PostgreSQL. PG upload/download дополнительно проходит browser suite. |
| Gateway | [2 tests](../deploy/review-gateway.test.mjs):401 всех paths, HTTPS redirect до challenge, host/origin, BasicAuth stripping, body/chunked cap, bounded upstream timeout. |
| Browser local | Все5 [Playwright cases](../tests/browser/praktikum.spec.ts) PASS: учебный flow, реальные PG/file storage, AI через DI FixtureProvider, роли/лимиты, документы, тур, mobile/logout. Это не live LLM качество. |
| Live AI evals | Пять real DeepSeek ответов записаны в [fixtures](../evals/fixtures), исходные score ranges не расширялись:100/100/0/25/0.5 VALID calls,3057 internal credits. Повторный cache прогон не добавил calls/charge. Текущие offline checks используют recorded JSON, не имитируют live verification. |
| Публичный текущий flow | [Public live check](../tests/public-live-check.mts): настоящий HTTPS DOCX upload→DeepSeek generation→employee evaluation→manager report PASS;2 calls,891 internal credits в контролируемом окне без других расходов компании, original download совпал, cross-company download404, Secure/HttpOnly/Lax cookie, mobile390px/повтор tour. Проверка usage/баланса использует также приватный Nest API, не выдаётся за открытый REST API через tunnel. |
| Compiled runtime | Common package→CommonJS dist; Node22.23.5 compiled API smoke health200/production registration403. Full Mac/browser runtime проверялся на Node25.9. |
| Восстановление | [Backup roundtrip](../apps/api/test/backup-roundtrip.ts) PASS дважды: две отдельные ephemeral БД, dump+uploads+manifest,600 assets, actual authenticated Nest download hash. Только pg_restore --list не считается достаточным доказательством. |

Значения891/3057 — **внутренние кредиты**, не подтверждённый vendor invoice. Публичная регистрационная policy была403 в первоначальном smoke, затем заказчик явно включил регистрацию за private gate. Эту старую403 нельзя считать текущим запретом: актуальный registration smoke и tenant review фиксируются в acceptance после последнего изменения.

## Исходный бизнес-сценарий

| Требование | Реализация / owning source | Граница и ограничение |
|---|---|---|
| Подготовить обучение по материалу компании | [AppService material/generate](../apps/api/src/service.ts), [AssignmentSchema](../packages/types/src/index.ts), [DocumentsService](../apps/api/src/documents/service.ts) | Один practical case + summary/question/evidence на генерацию, общие материалы компании; не полноценный curriculum authoring. |
| Содержательный ответ и понятная оценка | [AiService/validateGrounded](../apps/api/src/ai.ts), company criteria snapshot | Accuracy40/completeness30/application30, сумма проверяется. Объяснение и source quotes видны. Кадровое решение принимает руководитель. |
| Персональные рекомендации и дальнейший материал | Attempt.evaluation JSON, [dashboard](../apps/web/src/app/dashboard/page.tsx) | gaps/recommendations/personal_material — часть одного evaluation call, без отдельного Recommendation table или второго LLM вызова. |
| Руководитель видит пробелы команды | Tenant-scoped attempts/users в [dashboard service](../apps/api/src/service.ts) | OWNER/MANAGER команда; EMPLOYEE свои результаты. Нет аналитического warehouse/курсовой сертификации. |
| Баланс/стоимость/история/владелец платформы | [AiService](../apps/api/src/ai.ts), [integer tariff](../apps/api/src/ai-config.ts), [admin](../apps/web/src/app/admin/page.tsx) | Общий Company balance + cumulative user limit/spent. Не real payments; UNKNOWN не показан как доказанная нулевая стоимость. |
| Независимые компании и права | [AuthGuard](../apps/api/src/auth.ts), scoped services, download id+companyId | Application companyId isolation, не RLS/composite tenant FK. Один account — одна компания, глобально уникальный email. Отдельный tenant review не заменяется этой матрицей. |

## Стек, архитектура и граница real/mock

| Пункт ТЗ | Факт | Статус / предел |
|---|---|---|
| NestJS вместо исходного Python backend | Nest AppModule/controllers/services/repository; [ADR0008](decisions/0008-nestjs.md) | Согласованное исходным запросом отклонение. Python используется только bounded document subprocess, не web backend. |
| TypeScript strict / Next App Router / PostgreSQL / Prisma / pnpm+Turbo | [workspace scripts](../package.json), [schema/migrations](../apps/api/prisma/schema.prisma), [shared config](../packages/config/tsconfig.json) | Реализовано. Shared UI package не создавался без переиспользования; root ESLint config общий. |
| Controller→Service→Repository | Controllers делегируют, Repository — тонкий Prisma adapter | Business/tenant conditions в сервисах; отдельные repositories per aggregate/DDD/CQRS bus не добавлены. |
| Server Components default / client только интерактив | [dashboard/admin](../apps/web/src/app/dashboard/page.tsx), forms/upload/tour | Реализовано. Типы/схемы общие; compiled CommonJS main устраняет TS runtime import issue. |
| Roles в Nest и Next boundary | Nest guards authoritative; Next proxy проверяет cookie presence, SSR получает scoped API | Next proxy **не дублирует** DB role validation, в отличие от буквальной формулировки middleware roles. Подлинность/роль нельзя получить клиентской сменой UI. |
| Реальная auth / DB / learning / money | Sessions+scrypt+real PG+provider+ledger | Реальные, не localStorage fake login и не fixture fallback. Нет SSO/password reset/email verification/rate limiting общего SaaS. |
| OpenAI ChatGPT все AI функции | OpenAI adapter сохранён; активный DeepSeek по последнему явному запросу | [Согласованное изменение ADR0010](decisions/0010-deepseek-and-internal-tariff.md), не исходное требование в неизменённом виде. OpenAI live success не подтверждён после quota rejection. |
| Payment/notifications/FileStorage behind interfaces | [Providers](../apps/api/src/providers.ts), [FileStorage](../apps/api/src/documents/storage.ts) | [Точные моки](decisions/mocks.md): payment/notification simulated; filesystem upload настоящий локальный adapter. Async real payment protocol не готов и не заявлен. |
| Super-admin вместо внешнего billing | Реальные DB aggregates/ledger | Разрешённое MVP упрощение; нет внешнего billing API. |
| Tenant-scoped финансы/обучение | Не принимаем companyId из request body/header; SHA hash включает tenant/user | HTTP/PW negative tests и public чужой download404. DB роль сама isolation не обеспечивает; новые SQL/Prisma paths требуют review. |

## Все AI anti-hallucination пункты

| Пункт | Реализация / доказательство | Что не следует из проверки |
|---|---|---|
| Zod single source / structured output | [schemas](../packages/types/src/index.ts)→zodToJsonSchema; OpenAI strict json_schema | DeepSeek server strict JSON Schema **не поддерживает**: JSON mode + schema/example prompt + локальная Zod. Это принятое изменение, не скрытый strict substitute. |
| Валидация,≤2 retry, явная ошибка | [AiService](../apps/api/src/ai.ts), null/invalid/exhaustion HTTP cases | Невалидный ответ не публикуется; оплаченные invalid attempts учитываются. Не бесконечный retry. |
| Grounding/material+criteria+answer / unsupported_claims | System prompt и полный bounded Material.text | Модель всё ещё может неверно интерпретировать источник; руководитель контролирует вывод. |
| Evidence exact / score>0 nonempty | Exact source substring, непустая обязательная строка, criteria ids/max/sum | Exact quote не доказывает логическую достаточность всей оценки. |
| Temperature / фиксированные критерии |0 eval,0.2 generate, Company.criteria/Assignment snapshot | Нет UI редактора критериев; модель их не генерирует. |
| Input/output limits | Source12000/answer8000, core bytes200000, output1500 | Вместо автоматического усечения/суммаризации длинный материал явно отклоняется; скрытой потери source нет. PDF whitespace-overflow regression это проверяет. |
| AiCall audit всех попыток | provider/model/responseModel/tariff/usage/cache/cost/latency/hash/JSON/status | Unknown usage0 — sentinel. Ответы ошибок не логируют API key/raw auth headers. Исторический responseModel может быть null. |
| Идемпотентность | Hash schemaVersion3; cache SUCCESS; unique operationId/result upserts; revision CAS REJECTED | UNKNOWN/PENDING не повторяются. Автоматического crash reconciliation нет; [runbook](reconciliation.md). |
| Фикстуры/evals |5 recorded real DeepSeek JSON, expected ranges unchanged; [eval script](../apps/api/test/evals.ts) | Live запуск ручной/платный и зависит от ключа/provider, CI snapshot сам не измеряет актуальное качество vendor. |
| Стоимость из usage | Actual uncached/cached/output, ceil integer numerator; invalid тоже оплачены | DeepSeek fixed internal peak tariff отделён от provider discounts/invoice, [ADR0005](decisions/0005-billing.md). |

## Новые требования пользователя

| Дополнение | Owning implementation / проверка | Граница |
|---|---|---|
| Реальный DeepSeek вместо исчерпанного OpenAI | [ADR0010](decisions/0010-deepseek-and-internal-tariff.md), real evals/public live | JSON-mode deviation и внутренний тариф обозначены явно. |
| Word/PDF/TXT upload/download | [ADR0012](decisions/0012-private-document-materials.md), [material-files](material-files.md), tests и public DOCX | DOCX main body/таблицы; .doc native converter; PDF text layer; UTF8/UTF16 BOM/CP1251. OCR/колонтитулы/сложная вёрстка не гарантируются. |
| Другой device / Internet HTTPS | [ADR0011](decisions/0011-temporary-mac-review.md), real public browser check | Temporary Mac tunnel, separate private review DB, gate и loopback; не постоянный VPS/SLA. |
| Регистрация «вообще есть?» | Реальная register transaction создаёт Company+OWNER/session; flag включён за gate | Default production deny не удаляет функцию. Новая компания0balance/без чужой команды/материалов; актуальная внешняя проверка отдельно в acceptance. |
| First-visit onboarding/replay/mobile | [ADR0013](decisions/0013-role-aware-onboarding.md), [tour](../apps/web/src/app/onboarding-tour.tsx), local/PUBLIC PW | Ролевые видимые targets; seen flag browser-local, не tenant authority. Полный WCAG audit не заявлен. |
| Unit+Playwright после deploy / вся логика | Owning tests выше, public live script, final commands в acceptance | Native Node:test+tsx вместо Jest/Vitest — минимальный runner выбор.5 local PW зелёных не выдают за production AI. |
| Backup originals+PG / restore | [backup](../deploy/backup.mjs), [roundtrip](../apps/api/test/backup-roundtrip.ts) | Два PASS с real authenticated download hash; snapshots предполагают immutable append-only files. Offsite/автоматический crash recovery не заявлены. |
| Весь проект в public GitHub | Исходники/миграции/local history подготовлены; публичный remote handoff — отдельная GitHub boundary | Имя/URL/commit и факт remote push фиксируются root в итоговой передаче; локальный commit не доказывает публикацию. |

Последний navigation fix пользователя (EMPLOYEE→«Моё обучение»/#learning вместо командного #results) и оформление upload добавлены после этих browser результатов; их финальный повтор PW фиксирует root в acceptance. Атрибуция public check уточнена до exact company/operation ids; новый платный прогон только из-за изменения harness не проводился, исторические891 не объявляются результатом нового запуска.

## Исправленные audit findings

| Finding | Исправление / regression |
|---|---|
| Null/refusal response ломал Prisma JSON audit | JsonNull normalization + paid null→invalid evidence→valid retry в HTTP e2e |
| REJECTED ABA / cumulative cost | Persistent revision CAS, unique reservation UUID; paused stale snapshot + zero-cost reject и INVALID→reject→success, cost540 согласован с ledger/AiCall |
| Blank mandatory AI strings | trim/min1 summary/question/explanation/feedback/recommendation/personal_material; hash version3 |
| Admin window принималось за totals / терялся старый UNKNOWN | RepeatableRead global aggregates + explicit windows + all unresolved;>100 old-UNKNOWN regression |
| Public upload Origin сравнивался с internal Next URL | Server-owned PUBLIC_ORIGIN + forged forwarding/cross-origin negative test |
| Parser SIGTERM/один PID не ограничивал descendants | Detached group SIGKILL, immediate bounded reject, aggregate RSS fail-closed; TERM-ignoring tree и RSS regressions |
| PDF raw overflow break + trim мог сохранить усечённый source | Exit79 до trim, реальный whitespace page+later page regression |
| Owner limit lowering vs employee reserve не имел отдельного теста | Real PG HTTP, оба порядка по2 раза, no overspend/rollback/no duplicate provider charge |
| Пользовательский navigation bug: employee link вёл в отсутствующий team results | Ролевой #learning/«Моё обучение» вместо #results; source fix внесён, финальный PW текущей UI версии фиксируется в acceptance |
| DB-only backup терял originals | Paired dump/uploads/manifest + permissions+hash+restored real authenticated download |

## Оставшиеся пределы

Application isolation без RLS/composite tenant FK; ручной review новых query paths обязателен. Нет полного password/account lifecycle, real payments/email, периодических budget resets, авто-reconciler, scheduled offsite backup и постоянно размещённого hosting. UNKNOWN/PENDING требует доказательной ручной сверки; исходный локальный OpenAI UNKNOWN не был исправлен догадкой и не переносился в новую review БД.

Парсеры имеют измеримые лимиты, но не полный sandbox/antivirus/OCR. Большие документы отклоняются, не суммаризируются. Нагрузочные/хаос/crash/reboot испытания и clean-machine запуск≤5 минут не измерены; prerequisites перечислены в README/material-files.5 eval кейсов и один реальный public flow не доказывают качество на всех корпоративных текстах. Секреты и private credentials не включаются в GitHub/документы/fixtures.
