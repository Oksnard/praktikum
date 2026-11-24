# AI Evals

`pnpm evals` — 5 записанных реальных DeepSeek ответов: полный, частичный, неверный, off-topic, копия источника. Первоначальные авторские snapshots заменены после живого запуска24.11.2026. `provenance` в каждой fixture содержит происхождение и operationId. Offline CI не вызывает внешний API.

`pnpm evals --live` требует ключ выбранного AI_PROVIDER (по умолчанию DEEPSEEK_API_KEY) и seeded employee@alpha.test; выполняет production AiService/AiProvider с audit, reserve, actual usage billing и cache. Повтор идентичных fixtures возвращает SUCCESS из БД без нового вызова. Hash включает provider/model/tariff/schema. Для нового эксперимента меняйте версию входа осознанно. expectedScoreRange и expectedGaps заданы заранее; диапазон и grounding проверяются автоматически, семантические gaps проверяет человек.

Проверяем Zod, score range, непустой evidence при score>0, exact source цитаты, стабильные критерии, сумму score. Unit проверяет отрицательные формы. HTTP e2e через DI подменяет только AiProvider и проверяет null → fabricated evidence → valid, максимум3 платных попытки, exhaustion/usage и unknown outcome. FixtureProvider не подключается production-конфигом и не имеет env-переключателя.

Живой DeepSeek прогон прошёл все5 кейсов с прежними диапазонами: complete100, copy100, off-topic0, partial25, wrong0. Каждый ответ VALID с точными цитатами. Input3203 (включая cached1536), output2121, внутреннее списание3057 кредитов; это не точный счёт провайдера. Повторный прогон оставил те же5 операций/5 вызовов и не добавил расходов.

Отдельный реальный HTTP сценарий прошёл генерацию и оценку100/100,3 критерия и4 цитаты; руководитель видит attempt. Два вызова списали1177 внутренних кредитов, повтор генерации —0. Итого подтверждено7 успешных DeepSeek calls и4234 внутренних кредитов.

Ограничение: пять кейсов не доказывают качество модели на любых материалах. Copy100 допустим текущими критериями: отдельного штрафа за дословное повторение источника нет. DeepSeek JSON mode не равен серверному strict JSON Schema; локальная валидация обязательна. OpenAI живой прогон встретил429 credit_balance_exhausted; первоначальный UNKNOWN сохранён для сверки.
