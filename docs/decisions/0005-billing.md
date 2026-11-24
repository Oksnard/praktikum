# 0005. Внутренние кредиты, usage и атомарный резерв

Статус: accepted, уточнено [ADR0010](0010-deepseek-and-internal-tariff.md). Дата:24.11.2026.

## Решение

Баланс общий для Company; User.limit — накопительный предел расходов **и активных резервов**, User.spent отражает оба. Owner управляет employee/manager limits, а не отдельным кошельком сотрудника.1 credit =1 microUSD внутреннего каталожного тарифа; это не реальный платёж и не гарантированная сумма invoice провайдера.

| Запрошенный provider/model | USD/1M uncached input | cached input | output |
|---|---:|---:|---:|
| DeepSeek / deepseek-flash |0.30|0.006|1.20|
| OpenAI / gpt-4o-mini optional |0.15|0.075|0.60|

DeepSeek используется по фиксированному внутреннему peak тарифу независимо от vendor off-peak/holiday discounts. Фактический usage берётся из ответа: uncached=input−cached, output отдельно. Тарифная версия и requested model входят в hash/AiCall; произвольный model override с неизвестной ценой не принимается. [Конфигурация и integer formula](../../apps/api/src/ai-config.ts): ceil единой суммы per call, без сложения дробных денежных балансов.

## Жизненный цикл

1. Короткая DB transaction условными UPDATE резервирует200000: уменьшает Company.balance, увеличивает User.spent; если денег/лимита нет, откатывается целиком до вызова AI.
2. Каждый известный ответ, включая невалидный, сохраняет usage/cost. Максимум3 вызова. Provider HTTP rejection не генерирует оплаченного результата; safe status/code сохраняются, неиспользованный резерв возвращается.
3. Settlement текущего раунда возвращает R−C и пишет unique ledger key. Operation.cost — **накопленная** стоимость всех раундов. Повтор SUCCESS бесплатен; REJECTED можно явно повторить, revision CAS предотвращает ABA/двойную резервацию, новый reservation UUID разделяет раунды.
4. UNKNOWN/PENDING удерживает резерв. Автоматического повтора/возврата по догадке нет; [runbook](../reconciliation.md) различает стоимость старых закрытых раундов и текущего outstanding reserve. Старый OpenAI UNKNOWN100000 не пересчитывается по новой константе200000.

Списание по оценочной фиксированной цене без usage отвергнуто. DB transaction на всё время HTTP LLM call не решает distributed crash и держит блокировки, поэтому выбраны reserve/settlement и явная ручная сверка. Nonnegative CHECK, уникальные ledger/hash keys и conditional limits защищают локальные инварианты; провайдерская неопределённость не скрывается.

## Платежи и отчёты

MockPaymentProvider идемпотентно пополняет через key и помечает transaction MOCKED. Реальные деньги не списываются. Production default запрещает Demo topup; в закрытой review публикации owner flow явно включён за BasicAuth. Новая компания начинает с0, review provisioning — отдельная помеченная стартовая операция.

Admin агрегаты за всё время считаются в RepeatableRead snapshot; окна журналов явно отделены, все незавершённые операции сохраняются в выдаче независимо от возраста. Это не полноценная бухгалтерская/платёжная система: нет invoice reconciliation, периодических budgets, refunds API и real gateway/webhook.

## Проверки и источники

[Unit](../../apps/api/test/unit.test.ts): integer rates/cache/rounding. [HTTP PostgreSQL e2e](../../apps/api/test/e2e.ts): parallel topup/cache/reserve, exhausted retries, unknown/reject recovery, ABA, оба порядка owner limit lowering versus employee reserve (по2 раунда). [Public live](../../tests/public-live-check.mts): две реальные DeepSeek операции891 internal credits, баланс совпал с usage ledger, повтор генерации не списал повторно. Эти891 не выдаются за vendor invoice.

Context7: [Prisma transactions](https://www.prisma.io/docs/orm/prisma-client/queries/transactions), [DeepSeek pricing](https://api-docs.deepseek.com/quick_start/pricing/), [OpenAI model pricing](https://developers.openai.com/api/docs/models/gpt-4o-mini). Фактические текущие rates задаёт код, смена модели/тарифа требует пересмотра reserve/evals/версии.
