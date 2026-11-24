# 0005. Usage-based microUSD и резерв

Статус: accepted
Уточнено [ADR0010](0010-deepseek-and-internal-tariff.md): резерв200000, cache usage, фиксированный внутренний тариф вместо утверждения о точном vendor invoice.
Дата:2026-11-24

## Контекст и решение
1 кредит=1 microUSD, ceil на каждый API ответ, включая INVALID. Reserve100000 гарантирует concurrent budgets. UNKNOWN сохраняет резерв и требует сверки. Компания общий баланс, user cumulative limit. Demo payments explicit.

## Альтернативы и последствия
Estimated fixed списание не отражает usage; держать DB transaction во время API медленно и не решает distributed crash.
