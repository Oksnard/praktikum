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

## 2026-11-24 — Финальная приёмка интерфейса
- Браузер выявил необработанную ошибку AI Server Action, переполнение на 762 px, устаревшее сообщение об ошибке после успешного действия и отсутствие выхода на мобильной ширине. Исправлены обработка отказов, pending кнопки, адаптивные карточки, очистка ошибки и мобильный выход.
- Показаны полный материал/вопрос, оценки критериев, конкретные пробелы и unsupported claims; сотруднику доступны личный лимит, расходы и остаток. Убраны выдуманный адрес поддержки и обещание отсутствующего редактирования ролей.
- В реальном dev API проверены no-key 503 без резерва/списания, SUPER_ADMIN ledger 200, EMPLOYEE 403 и скрытые staff/finance данные. В браузере проверены роли, вход/выход, неверный пароль, добавление материала и Demo пополнение 100000 кредитов. Горизонтального переполнения нет на 762/390 px. Снимок: docs/screenshots/dashboard.jpg.
- Финальный Sol review APPROVE; целочисленная формула стоимости независимо сверена с BigInt на 169360 ограниченных парах токенов. Остались только задокументированные ограничения.
- После заморозки исходников: pnpm build PASS (API + Next, 13.4 с), pnpm lint PASS, pnpm typecheck PASS. Ранее успешные unit/e2e/evals сохранены; live evals не выполнены без ключа. Dev перезапущен, API3011 и Web3000 отвечают.
- Зафиксированный интервал от bootstrap-коммита до итоговых проверок: 19:46:11–20:03:33 MSK, 17.4 минуты (0.29 ч), без первоначального разбора. Это wall-clock параллельной агентной работы, не человеко-часы. Полная live приёмка ожидает OPENAI_API_KEY и доступность модели.

## 2026-11-24 — Реальные провайдеры и согласованный DeepSeek
- После предоставления ключа OpenAI первый eval оставил UNKNOWN без подтверждённого usage. Отдельная диагностика вернула429 credit_balance_exhausted. Дальнейшие OpenAI вызовы остановлены; исторический UNKNOWN не переписан без доказательства.
- Исправлен аудит известных отказов провайдера и возврат неиспользованного резерва. Независимый review обнаружил ABA гонку повторного REJECTED; добавлены persistent revision/CAS, уникальные reservation ledger keys и детерминированный regression. Проверены также INVALID→429→успех и согласованность накопленной стоимости.
- Заказчик явно выбрал DeepSeek. Через Context7 и официальные docs проверены совместимый SDK/baseURL, JSON mode, thinking disabled, usage cache tokens и тарифы. Согласованное отклонение от OpenAI strict schema и фиксированный внутренний тариф описаны в ADR0010. Ключи сохранены только в игнорируемом.env с правами600.
- DeepSeek реальные5evals прошли с прежними диапазонами без коррекций:100/100/0/25/0,5VALID calls,3057внутренних кредитов. Авторские fixture responses заменены реальными записями с provenance. Повтор вернул cache без дополнительного provider call.
- Dispatcher провёл реальный HTTP путь на demo Альфа: генерация395кредитов, оценка782, score100,3критерия/4цитаты, персональный текст и результат у менеджера. Сумма1177 совпала с изменением баланса; повтор генерации0. Оба responseModel=deepseek-flash. Подробный результат открыт в браузере и сохранён на снимке.
- Добавлены cachedPromptTokens/provider/tariffVersion/responseModel и миграции до№5. Shared reserve200000 отражается в UI defaults. UI отличает внутренний тариф от invoice, незавершённую стоимость от0, расходы от удержанного резерва.
- Финально20:24:08 MSK: pnpm lint/typecheck/test/test:e2e/evals/build PASS;6unit,5recorded evals, финальная сборка5.7с без cache. Независимый Sol review APPROVE. Измеряемый интервал от bootstrap19:46:11 до этого набора —38.0мин(0.63ч), без начального разбора/завершающего оформления; не сумма человеко-часов.
- Подтверждено7успешных DeepSeek вызовов и4234внутренних кредита. Внешний invoice не проверялся. Исторический OpenAI UNKNOWN удерживает100000; available Альфа995766. Продуктовая логика/тесты не подменяют production AI моками.

## Денежная точность
Стоимость вычисляется через целочисленный числитель `(promptTokens*15 + completionTokens*60 +99)/100` с floor, без сложения дробных тарифов. Unit на миллион входных/выходных токенов подтверждает750000 microUSD. Повторные4 unit и API typecheck PASS. API build и git diff --check PASS; AGENTS35 строк.
