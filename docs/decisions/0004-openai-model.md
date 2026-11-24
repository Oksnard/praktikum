# 0004. OpenAI gpt-4o-mini

Статус: accepted
Дата:2026-11-24

## Контекст и решение
Модель прямо разрешена ТЗ, поддерживает strict structured outputs и temperature0, низкую цену. Fixed rates0.15/0.60 USD за1M tokens. На дату24.11.2026 официальная страница помечает Deprecated; доступность аккаунту не проверена без ключа. До коммерческого запуска выбрать доступную поддерживаемую модель и повторить evals/тариф/резерв.

## Альтернативы и последствия
Более новые модели могут не поддерживать temperature; изменение defaults без live verification ухудшает воспроизводимость. https://developers.openai.com/api/docs/models/gpt-4o-mini
