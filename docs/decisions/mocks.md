# Реальные адаптеры, моки и границы замены

| Граница | Текущая реализация | Что реально / как заменять |
|---|---|---|
| AiProvider | DeepSeekProvider default, OpenAiProvider optional; [ai.ts](../../apps/api/src/ai.ts) | Реальные HTTPS calls через официальный OpenAI Node SDK, никогда не подменяются при отсутствии ключа. Новый provider должен вернуть response+usage/cache/model и иметь известную tariff configuration. |
| AI в тестах | [FixtureProvider](../../apps/api/test/fixtures.ts), TestingModule.overrideProvider | Только DI тестов HTTP/локального Playwright. Нет production env flag для fake AI. Пять eval responses записаны после настоящего DeepSeek прогона; provenance в fixtures. |
| PaymentProvider.createTopUp | [MockPaymentProvider](../../apps/api/src/providers.ts), немедленный MOCKED result | Реальный транзакционный ledger, но **платёж сымитирован**. UI показывает Demo. Настоящий gateway/webhook не подключён; перед заменой нужна обработка подтверждения/ошибок/идемпотентности у провайдера. Текущий return status типизирован только MOCKED, это MVP контракт, а не готовый асинхронный payment protocol. |
| NotificationSender.send | [MockNotificationSender](../../apps/api/src/providers.ts) → Notification table | Запись настоящая, доставки email нет. SMTP/SES adapter можно подключить через DI, дополнив retry/outbox/delivery status согласно требованиям доставки. |
| FileStorage.put/get/remove | [LocalFileStorage](../../apps/api/src/documents/storage.ts) | Файлы действительно записываются/скачиваются из приватного каталога, не fake upload. Это разрешённая ТЗ локальная замена S3. Сервис зависит от интерфейса; object storage adapter должен сохранять privacy, opaque keys, cleanup и tenant-checked download. |
| Внешний platform billing | Admin читает настоящий PostgreSQL ledger | Внешнего billing adapter нет и внешняя доставка не симулируется. Прямой DB overview разрешён MVP; стороннюю систему надо проектировать отдельно. |
| DB в documents HTTP tests | [documents.test.ts](../../apps/api/test/documents.test.ts) in-memory Repository | Только этот тест persistence подменён; real parsers/guards/filesystem/multipart сохраняются. [Общий HTTP e2e](../../apps/api/test/e2e.ts), [Playwright](../../tests/browser/praktikum.spec.ts) и backup roundtrip используют настоящий PostgreSQL. |

Текстовый ввод и извлечённый документный текст реально хранятся в Material.text. Оригиналы поддержаны отдельным FileStorage после нового требования Word/PDF/TXT. Binary файлы не отправляются LLM. Production FileStorage не публикуется как static; public BFF требует app session, API проверяет companyId.

Mock balance не ограничивает реальный provider invoice сам по себе. Review публикация защищена отдельным BasicAuth gate; регистрация и Demo topup включены явно для доверенных проверяющих. Без такого private gate используются deny-by-default production flags. API ключи/credential files не входят в исходники, UI и тестовые fixtures.

Полные ограничения: [приёмка](../acceptance.md), [материалы](../material-files.md), [ADR0010](0010-deepseek-and-internal-tariff.md), [ADR0012](0012-private-document-materials.md).
