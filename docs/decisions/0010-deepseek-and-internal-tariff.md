# 0010. DeepSeek по последнему запросу заказчика

Статус: accepted
Дата:2026-11-24

## Контекст и согласованное отклонение
После отказа OpenAI429 `credit_balance_exhausted` заказчик явно попросил переключить production на DeepSeek и предоставил соответствующий ключ. Это новое согласованное отклонение от исходного обязательного OpenAI провайдера. Исходное ТЗ сохранено; OpenAI strict adapter остаётся опциональным (`AI_PROVIDER=openai`). Default и `.env.example` — DeepSeek. Секреты только в игнорируемом `.env`, в документации и git их нет.

## Реальный провайдер и гарантии
`deepseek-flash`, официальный `https://api.deepseek.com`, официальный Node OpenAI SDK как совместимый клиент. `thinking:{type:'disabled'}`, max_tokens1500, temperature0 для оценки/0.2 для задания.

По актуальной официальной документации DeepSeek поддерживает `response_format:{type:'json_object'}`, но не OpenAI strict `json_schema`. Поэтому НЕ заявляем серверную гарантию JSON-schema: Zod-generated schema и пример формы передаются в system prompt, каждый полученный ответ проходит те же локальные Zod/evidence/criteria проверки, максимум2 корректирующих retry. Невалидный ответ никогда не публикуется. У OpenAI adapter сохраняется strict json_schema. Это существенное, явно принятое изменение требований после выбора DeepSeek.

## Тариф и деньги
1 внутренний кредит =1 microUSD внутреннего каталожного тарифа. DeepSeek публикует peak/off-peak цены и исключения по китайским праздникам; без vendor invoice API нельзя достоверно восстановить точный счёт по одному usage.

Фиксируем прозрачный **внутренний peak тариф** на миллион фактических токенов: input miss0.30USD, cache hit0.006USD, output1.20USD. Off-peak/праздничные скидки внешнего провайдера не уменьшают этот внутренний тариф; его нельзя выдавать за точную сумму vendor invoice. Оплата считается по actual usage, input minus cached и cached отдельно, целочисленный числитель + ceil на вызов. Tariff version `deepseek-internal-peak-2026-11-24` в hash и каждом AiCall. OpenAI optional tariff0.15/0.075cached/0.60USD на миллион.

Резерв200000 кредитов общий для поддерживаемых провайдеров: до200000 UTF8 байт user prompt + schema/system/example overhead и1500 выходных токенов, до3 вызовов. При самом дорогом поддерживаемом тарифе базовая граница185400 + запас14600 на служебный prompt. Известные4xx rejection не списывают неиспользованный резерв; ранее оплаченные INVALID ответы учитываются. UNKNOWN/PENDING удерживают резерв до сверки. REJECTED допускает явный новый запрос с тем же hash; revision CAS и уникальный reservation UUID предотвращают ABA/дублирование списаний. Cumulative operation.cost = сумма известных ai_calls costs всех раундов.

## Аудит моделей
`AiCall.model` — запрошенный известный каталожный alias, по нему выбирается фиксированный внутренний тариф. `responseModel` — фактическая строка `response.model` провайдера; provider может возвращать alias или версионированный id. Новые ответы записывают оба поля, старые имеют null вместо выдуманного фактического id. Не вычисляем неизвестный тариф из произвольного returned model; смена requested alias запрещена вне whitelist конфигурации. Hash включает provider, requested model, tariff version и версию схемы.

## Источники и проверки
- Context7/официальные docs: https://api-docs.deepseek.com/quick_start/pricing/
- https://api-docs.deepseek.com/api/create-chat-completion/
- https://api-docs.deepseek.com/guides/json_mode
- OpenAI rejection semantics: https://developers.openai.com/api/docs/guides/error-codes и https://developers.openai.com/api/docs/guides/rate-limits

Пять real DeepSeek eval cases прошли с прежними диапазонами без расширения:100/100/0/25/0. Все пять response JSON сохранены в fixtures с provenance и operationId. Пять VALID calls: input3203, cached1536 (часть input), completion2121; внутреннее списание3057 кредитов. Это результат ограниченного smoke/eval набора, не доказательство отсутствия семантических ошибок на всех материалах.

Первый OpenAI operation UNKNOWN сохранён без корректировок: первоначальный error audit не содержал status, диагностический429 сам по себе не доказывает исход первого запроса. Никакого несанкционированного возврата неизвестной стоимости не делали.

Уточнение ADR0014: output4096; прежний расчёт185400+14600 заменён enforced full-request byte cap и bound195669≤200000. См. [новую формулу и assumptions](../ai-evaluation-design.md). Старый1500 — историческая конфигурация QA baseline.
