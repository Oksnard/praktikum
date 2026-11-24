# Моки и замена

| Что | Интерфейс | Реализация | Замена |
|---|---|---|---|
| Пополнение | PaymentProvider.createTopUp(amount,key) | MockPaymentProvider, status MOCKED | Provider с идемпотентным external key и проверенным webhook; зачислять только после подтверждения, текущий MVP immediate settlement заменить |
| Уведомления | NotificationSender.send | MockNotificationSender → PostgreSQL Notification | SES/SMTP реализация через DI; сейчас ничего не отправляется |
| AI только в тестах | AiProvider.complete/available | FixtureProvider в test/fixtures.ts | Production всегда OpenAiProvider; TestingModule.overrideProvider используется только тестом |
| Внешний owner billing | отдельный внешний сервис не нужен | super-admin читает реальный ledger БД | Реальная интеграция потребует отдельного API контракта; текущий ledger не выдаётся за внешнюю систему |

Материал вводится как текст и хранится в PostgreSQL — это реальное хранилище, отдельный FileStorage и S3 не нужны. UI помечает Demo платежи; ledger kinds MOCKED/DEMO_SEED. AI никогда не заменяется фикстурами при отсутствии ключа, возвращается503. Создание сотрудников сообщает «Demo» через NotificationSender; email доставки нет.
