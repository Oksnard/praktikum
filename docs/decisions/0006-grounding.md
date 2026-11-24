# 0006. Zod3 и structured outputs

Статус: accepted
Уточнено [ADR0010](0010-deepseek-and-internal-tariff.md): OpenAI сохраняет strict schema; DeepSeek использует JSON mode с той же локальной Zod/grounding проверкой.
Дата:2026-11-24

## Контекст и решение
Zod/v3 — единая schema, zodToJsonSchema target openAi. Backend проверяет quotes и criteria snapshot; модели не доверяем арифметику и доказательства. Стабильные дефолтные критерии40/30/30 в company.

## Альтернативы и последствия
Свободный JSON/regex не гарантирует структуру; семантическую истинность одними цитатами полностью доказать невозможно.
