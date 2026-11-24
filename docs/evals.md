# AI Evals

`pnpm evals` — 5 авторских детерминированных snapshots: полный, частичный, неверный, off-topic, копия источника. Это НЕ записи реальных OpenAI ответов: без API ключа нельзя честно получить такие записи. `provenance` в каждой fixture указывает происхождение.

`pnpm evals --live` требует OPENAI_API_KEY и seeded employee@alpha.test; выполняет production AiService/AiProvider с audit, reserve, actual usage billing и cache. Реальные вызовы платные; повтор идентичных fixtures возвращает cached SUCCESS. Для нового эксперимента меняйте версию входа осознанно. Указаны expectedScoreRange и expectedGaps; диапазон и grounding проверяются автоматически, семантические gaps следует проверять человеком (точное текстовое сравнение рекомендаций невалидно).

Проверяем Zod, score range, непустой evidence при score>0, exact source цитаты, стабильные критерии, сумму score. Unit проверяет отрицательные формы. HTTP e2e через DI подменяет только AiProvider и проверяет null → fabricated evidence → valid, максимум3 платных попытки, exhaustion/usage и unknown outcome. FixtureProvider не подключается production-конфигом и не имеет env-переключателя.

Известное ограничение: snapshots проверяют pipeline, а не качество модели. Нет выполненной live оценки до появления ключа; результаты live нельзя выводить из CI.
