# Журнал разработки

## 2026-11-24 — Bootstrap
Прочитаны два исходных запроса. Создан каркас и дословно сохранён исходный запрос. Реализация ещё не начата. Эксперт Sol владеет архитектурой и backend; независимая приёмка у dispatcher.

## План до кода
План заполнен до исходников. Context7: https://github.com/nestjs/docs.nestjs.com/blob/master/content/fundamentals/execution-context.md ; https://www.prisma.io/docs/orm/prisma-client/queries/transactions ; https://github.com/vercel/next.js/blob/canary/docs/01-app/02-guides/authentication.mdx . Prisma закрепляем на v6, поскольку свежий main docs уже описывает несовместимый Prisma8. OpenAI/Zod проверены dispatcher: https://developers.openai.com/api/reference/resources/chat/subresources/completions/methods/create и https://github.com/stefanterdell/zod-to-json-schema/blob/master/README.md .

## 2026-11-24 — Контракты, backend, БД и биллинг
- Реализованы monorepo, общие Zod/v3 DTO, Prisma schema+SQL migration, real session auth/roles, company scoped use cases, AI structured outputs/audit/retry/evidence/cache, transactional reserve/settlement и Demo payments.
- Context7 sources: Prisma transactions/migrate diff (https://www.prisma.io/docs/orm/prisma-client/queries/transactions), Nest guards (https://github.com/nestjs/docs.nestjs.com/blob/master/content/fundamentals/execution-context.md), ESLint flat config (https://github.com/typescript-eslint/typescript-eslint/blob/main/docs/getting-started/Quickstart.mdx). OpenAI pricing/status checked dispatcher https://developers.openai.com/api/docs/models/gpt-4o-mini.
- Реальная проблема1: Prisma pnpm resolver отвергал nested client при root-only CLI. После двух неуспехов изучен DEBUG resolver; Prisma CLI добавлена локально в api, generate прошёл. Проблема2: tsx из root не видел decorators; root tsconfig исправил seed. Zod converter требует zod/v3 типы.
- Checks: db:generate, db:migrate, db:seed, API typecheck и4 unit PASS. PostgreSQL14 на loopback55432 предоставлен dispatcher; Docker не нужен. API port3011 выбран, поскольку3001 принадлежит другому сервису.
- Ограничение: OPENAI_API_KEY отсутствует; не подключали production fixture режим. gpt-4o-mini Deprecated — documented risk.

## 2026-11-24 — Проверки pipeline
- HTTP e2e с PostgreSQL и DI FixtureProvider PASS: две компании/roles/isolation, concurrent topup и generation, cache, null/fabricated evidence retry, usage billing всех3 attempts, exhausted retry, employee limit, concurrent company budget, UNKNOWN holds reserve/no replay, logout.
- Independent Sol review: блокирующих дефектов после исправления Prisma.JsonNull не найдено. Остались live AI, concurrent limit-edit test и crash recovery ручной процедуры.
- lint первый запуск выявил unused variable + prefer-const и незаконченный JSX worker; backend исправлен, web исправляет владелец.
- pnpm dev запущен: Nest3011 и Next3000 успешно стартовали. UI проверяет dispatcher отдельно.

## Инструменты и итоговые проверки
- Context7 Turbo strict env verified: https://github.com/vercel/turborepo/blob/main/apps/docs/content/docs/reference/configuration.mdx ; DATABASE_URL/PORT/API_URL/OPENAI_API_KEY явно passthrough, dev persistent.
- Context7 pnpm build script permissions checked https://github.com/pnpm/pnpm.io/blob/main/docs/settings/build.md ; для закреплённого pnpm10.11 используется onlyBuiltDependencies (новый allowBuilds требует10.26+).
- Полные pnpm lint и pnpm typecheck PASS после готовности исходников UI; pnpm evals PASS всех5 authored snapshots. Не выдаём authored fixtures за live записи.
- Добавлены PostgreSQL CHECK nonnegative для баланса/расходов/лимитов/AI стоимости как дополнительная защита от ошибок нового кода.
