# Практикум — инструкции

MVP multi-tenant SaaS. ТЗ: docs/requirements.md; план: docs/plan.md.

## Структура
- apps/api — NestJS, Prisma, PostgreSQL
- apps/web — Next.js App Router
- packages/types — общие Zod-контракты
- packages/config — строгие настройки TypeScript

## Команды
- pnpm install
- pnpm dev
- pnpm lint
- pnpm typecheck
- pnpm test
- pnpm test:e2e
- pnpm evals
- pnpm db:migrate
- pnpm db:seed

## Конвенции
TypeScript strict, без any. Controller → Service → Repository.
Server Components по умолчанию, интерактивные формы — Client.
AI только через интерфейс: production OpenAI, fixtures только в тестах DI.
Каждый AI ответ: Zod, evidence, audit usage, не более 2 retry.
Деньги целые; списание usage, транзакции и идемпотентность.
Tenant определяется из сессии, никогда из тела запроса.
Все внешние провайдеры за интерфейсами; моки помечать Demo.
До library-dependent решений проверять Context7 и записывать источники.
Не откатывать параллельные правки. Секреты не коммитить.

## Приёмка
Условия и фактические результаты: docs/acceptance.md.
После этапа проверки и запись в docs/development-log.md.
