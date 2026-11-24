# Условия приёмки и результаты

Дата:2026-11-24. PostgreSQL14, Node25.9, pnpm10.11; loopback web3000/api3011.

| Проверка | Факт |
|---|---|
| pnpm install | PASS, lockfile есть; Prisma CLI/client6.19 |
| pnpm db:generate / db:migrate / db:seed | PASS, 5 миграций, две demo компании и4 роли |
| pnpm lint | PASS, реальный ESLint recommended TypeScript |
| pnpm typecheck | PASS API/shared/Next |
| pnpm test | PASS6 unit tests |
| pnpm test:e2e | PASS HTTP+PostgreSQL, AI DI fixtures |
| pnpm evals | PASS5 записанных реальных DeepSeek ответов |
| pnpm evals --live | PASS5 DeepSeek cases; повтор использовал cache без новых вызовов |
| OpenAI live | BLOCKED:429 credit_balance_exhausted; активный провайдер изменён по запросу заказчика |
| pnpm dev | PASS: Nest3011, Next3000 Ready |
| pnpm build | PASS после DeepSeek: API и Next, 2 задачи без cache, 5.7 с |
| Browser UI | PASS: вход/выход, роли, материал, отказ AI, Demo пополнение, ширины 762 и 390 px |
| Независимый Sol review backend | APPROVE: JSON null, ABA/revision, provider rejection, cache usage и аудит моделей проверены |
| Независимый Sol review финального frontend | APPROVE; проверены auth, ошибки форм, критерии, личный бюджет, proxy и mobile logout |

## Что проверено автоматически
HTTP e2e: регистрация новой компании → владелец создаёт сотрудника/руководителя → конкурентное Demo пополнение зачисляется один раз → материал → AI structured задание через FixtureProvider → развёрнутый ответ → null/выдуманная цитата/валидный ответ, все3 usage списаны → персональный материал → менеджер видит результат. Повтор SUCCESS не вызывает provider и не списывает повторно. Есть403 ролей,404 cross-tenant material/assignment, скопы dashboard, исчерпание employee лимита, конкурентный баланс (один победитель), exhausted retry charge и UNKNOWN hold/no replay. E2E создаёт и удаляет только собственные tenants.

Unit: usage pricing/ceil/cache, scrypt verify, strict schema, exact nonempty evidence, criteria set/max/sum, безопасная классификация отказов. Дополнительные HTTP regression checks:429→возврат резерва→конкурентный повтор, INVALID→429→успех с накопленной стоимостью, ABA stale revision, UNKNOWN без replay. Evals: полный/частичный/неверный/off-topic/копия с заранее заданными диапазонами.

Dispatcher дополнительно проверил реально запущенный production API: no-key generate →503, company balance и operations count неизменны; SUPER_ADMIN ledger →200 (две компании), EMPLOYEE ledger →403, employee dashboard не содержит users/transactions. Это проверка production provider configuration, не DI fixture.

Браузерная приёмка через локальный Next: вход OWNER/EMPLOYEE/SUPER_ADMIN, неверный пароль с сообщением внутри формы, выход, перенаправление неавторизованного пользователя из /admin, недоступность админки сотруднику, журнал платформы. Владелец добавил материал «Передача сложного обращения», полный текст сохранился и доступен сотруднику. Генерация без ключа показывает понятный отказ внутри кабинета. Demo пополнение увеличило баланс Альфы с 1000000 до 1100000, создало помеченную Demo запись и очистило прежнее сообщение об ошибке. Проверены document.scrollWidth=innerWidth на 762 и 390 px; на мобильной ширине доступен выход. [Снимок кабинета](screenshots/dashboard.jpg).

После подключения DeepSeek полный реальный HTTP сценарий прошёл: материал → генерация задания → содержательный ответ сотрудника → оценка100/100 (40/30/30),4 точные цитаты, рекомендации и персональный текст → результат у менеджера. Два real calls списали1177 внутренних кредитов (395+782), повтор генерации списал0. Сумма AiCall.cost совпала с изменением баланса; requested model и responseModel — deepseek-flash.

Результат100/100 и подробный разбор с критериями/цитатами дополнительно открыты в браузере: [снимок реального результата](screenshots/live-deepseek-result.jpg). DeepSeek live evals:100/100/0/25/0,5 VALID calls, input3203 (cached1536), output2121, внутреннее списание3057. Всего7 успешных DeepSeek вызовов и4234 внутренних кредитов. Это не утверждение о точном vendor invoice.

Финальный набор `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:e2e`, `pnpm evals`, `pnpm build` повторно прошёл после изменения провайдера. Историческая проверка отсутствующего ключа выше относится к этапу до его предоставления; текущий сервис настроен на реальный DeepSeek.

## Реализовано
Nest backend, Next UI, PostgreSQL schema/migrations/seed, real session auth/roles/tenant scopes, текстовые материалы/задания/attempts/results, общие Zod контракты, реальные DeepSeek и optional OpenAI adapters, grounding/retry/audit/cache, usage-based integer tariff/reserve/settlement, cache tokens, user limits, Demo topup idempotency, owner/manager/admin views и документация с историей Git.

## Упрощено
Один практический кейс на материал; критерии40/30/30 хранятся в company и snapshot assignment без UI редактора. Рекомендации и персональный текст включены в единый evaluation AI вызов. Один AppModule, тонкий Prisma Repository. Application-level tenant isolation, не RLS. Накопительный employee limit, без периодических budget resets. PaymentProvider/NotificationSender — explicit Demo DI mocks; текстовое хранилище реально PostgreSQL. DeepSeek JSON mode с локальной Zod-проверкой заменяет серверный strict JSON Schema по последнему выбору заказчика; OpenAI strict adapter сохранён. Внутренний фиксированный тариф отличается от invoice скидок провайдера: ADR0010.

## Не подтверждено / границы
DeepSeek реально проверен на пяти eval случаях и одном сквозном сценарии. Это ограниченный набор, не доказательство семантической правильности на любых материалах. OpenAI не получил успешного completion из-за credit_balance_exhausted; его модель gpt-4o-mini остаётся optional и помечена Deprecated. Полное буквальное соответствие исходному OpenAI strict требованию не заявляется для DeepSeek: согласованное изменение описано в ADR0010.

Первый OpenAI operation efc6746b-d603-495c-9dcd-be03ae1e5443 сохранил UNKNOWN и резерв100000, поскольку из первоначального аудита нельзя доказать его исход. Диагностический429 записан отдельно, а дальнейшие известные отказы уже освобождают неиспользованный резерв. На момент live приёмки доступный баланс Альфы995766:1100000 Demo средств минус100000 UNKNOWN резерва минус4234 известных DeepSeek расходов. Неопределённая сумма в UI не выдаётся за0.

Нет публичного размещения, реальных платежей/email, SSO/reset password/rate limiting, файлового импорта, автосверки UNKNOWN/PENDING, backup automation. После crash или unknown usage резерв удерживается до ручной сверки; см README. Нет отдельного теста одновременного редактирования employee limit и AI резерва, хотя conditional updates защищают изменение. Exact quotes+criteria не доказывают семантическую правильность всех рекомендаций; требуется контроль руководителя.

## Трудозатраты
Обычная разработка оценена в84–124 человеко-часа по условной ставке в docs/plan.md. Измеряемый интервал от bootstrap-коммита19:46:11 до полного финального набора проверок20:24:08 MSK —38.0 минут (0.63 часа), без предварительного разбора и завершающего оформления. Это wall-clock параллельной агентной работы, не суммарные человеко-часы. Выполнены5 плановых этапов, независимое review/браузерные исправления и дополнительная итерация реального DeepSeek по новому запросу. Подтверждённое внутреннее списание live DeepSeek —4234 кредитов; точный внешний invoice не проверялся.
