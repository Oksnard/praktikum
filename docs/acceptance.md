# Условия приёмки и результаты

Дата:2026-11-24. PostgreSQL14, Node25.9, pnpm10.11; loopback web3000/api3011.

| Проверка | Факт |
|---|---|
| pnpm install | PASS, lockfile есть; Prisma CLI/client6.19 |
| pnpm db:generate / db:migrate / db:seed | PASS, две demo компании и4 роли |
| pnpm lint | PASS, реальный ESLint recommended TypeScript |
| pnpm typecheck | PASS API/shared/Next |
| pnpm test | PASS4 unit tests |
| pnpm test:e2e | PASS HTTP+PostgreSQL, AI DI fixtures |
| pnpm evals | PASS5 авторских snapshots, не записи реального API |
| pnpm evals --live | NOT RUN: скрипт завершился явной ошибкой OPENAI_API_KEY required,0 live вызовов |
| pnpm dev | PASS: Nest3011, Next3000 Ready |
| pnpm build | Ожидается финальная проверка UI worker |
| Browser UI | Ожидается повторная проверка dispatcher после исправления формы ошибок/responsive |
| Независимый Sol review backend | Блокирующих дефектов не найдено; замечание JSON null исправлено и regression e2e зелёный |

## Что проверено автоматически
HTTP e2e: регистрация новой компании → владелец создаёт сотрудника/руководителя → конкурентное Demo пополнение зачисляется один раз → материал → AI structured задание через FixtureProvider → развёрнутый ответ → null/выдуманная цитата/валидный ответ, все3 usage списаны → персональный материал → менеджер видит результат. Повтор SUCCESS не вызывает provider и не списывает повторно. Есть403 ролей,404 cross-tenant material/assignment, скопы dashboard, исчерпание employee лимита, конкурентный баланс (один победитель), exhausted retry charge и UNKNOWN hold/no replay. E2E создаёт и удаляет только собственные tenants.

Unit: actual usage pricing/ceil, scrypt verify, strict schema, exact nonempty evidence, criteria set/max/sum. Evals: полный/частичный/неверный/off-topic/копия с ожидаемыми диапазонами.

Dispatcher дополнительно проверил реально запущенный production API: no-key generate →503, company balance и operations count неизменны; SUPER_ADMIN ledger →200 (две компании), EMPLOYEE ledger →403, employee dashboard не содержит users/transactions. Это проверка production provider configuration, не DI fixture.

## Реализовано
Nest backend, Next UI, PostgreSQL schema/migrations/seed, real session auth/roles/tenant scopes, текстовые материалы/задания/attempts/results, общие Zod контракты, production OpenAI strict JSON schema path, grounding/retry/audit/cache, usage-based integer money/reserve/settlement, user limits, Demo topup idempotency, owner/manager/admin views и документация.

## Упрощено
Один практический кейс на материал; критерии40/30/30 хранятся в company и snapshot assignment без UI редактора. Рекомендации и персональный текст включены в единый evaluation AI вызов. Один AppModule, тонкий Prisma Repository. Application-level tenant isolation, не RLS. Накопительный employee limit, без периодических budget resets. Авторские snapshots заменяют записанные API responses только в тестах, происхождение обозначено. PaymentProvider/NotificationSender — explicit Demo DI mocks; текстовое хранилище реально PostgreSQL.

## Не подтверждено / границы
Успешный live OpenAI вызов и качество модели/evals НЕ проверены без ключа. gpt-4o-mini явно разрешена ТЗ, но официальная страница помечает Deprecated; доступность выбранному аккаунту требует live проверки. Поэтому полную готовность реального AI сценария нельзя заявлять.

Нет публичного размещения, реальных платежей/email, SSO/reset password/rate limiting, файлового импорта, автосверки UNKNOWN/PENDING, backup automation. После crash или unknown usage резерв удерживается до ручной сверки; см README. Нет отдельного теста одновременного редактирования employee limit и AI резерва, хотя conditional updates защищают изменение. Exact quotes+criteria не доказывают семантическую правильность всех рекомендаций; требуется контроль руководителя.

## Трудозатраты
Обычная разработка оценена84–124 человеко-часа по условной ставке в docs/plan.md. Это не фактически отработанные часы агентом. Текущая агентная итерация шла параллельно (эксперт backend, worker frontend, dispatcher окружение/приёмка, независимый reviewer); wall-clock фиксируется в итоговом журнале после окончания. Реальный API расход этой проверки0: ключ отсутствует.
