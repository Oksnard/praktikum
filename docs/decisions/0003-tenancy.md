# 0003. Row-level companyId

Статус: accepted
Дата:2026-11-24

## Контекст и решение
Tenant scope проверяется guard/service на каждом use case. Сессия определяет tenant. Все переходы по relation сначала ищутся внутри tenant.

## Альтернативы и последствия
Schema-per-tenant усложняет миграции; RLS не выбрана, поскольку service tenant проверки достаточны для ограниченного MVP при обязательном adversarial testing. Это не защита от новых неверных SQL запросов.
