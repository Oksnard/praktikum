# Architecture Decision Records

Принятые решения описывают фактический MVP. Более поздние ADR0010–0013 уточняют первоначальные формулировки после явных изменений заказчика; старые записи не следует читать как утверждение, что активный DeepSeek имеет OpenAI strict schema или что file upload отсутствует.

| ADR | Решение | Состояние |
|---|---|---|
|[0001](0001-monorepo.md)|pnpm workspaces + Turborepo|accepted|
|[0002](0002-prisma.md)|Prisma6 и PostgreSQL|accepted|
|[0003](0003-tenancy.md)|Application row-level companyId|accepted; RLS/composite tenant FK не заявлены|
|[0004](0004-openai-model.md)|OpenAI gpt-4o-mini|исторический/optional adapter, активный выбор уточнён0010|
|[0005](0005-billing.md)|Usage, integer internal tariff,200000 reserve/settlement|accepted, обновлён для cache/retry rounds|
|[0006](0006-grounding.md)|Zod, evidence и стабильные критерии|accepted; provider-side strict различается по0010|
|[0007](0007-mocks.md)|DI внешних границ|accepted; FileStorage дополнен0012 и [текущей таблицей](mocks.md)|
|[0008](0008-nestjs.md)|NestJS вместо Python web backend|accepted исходным уточнением|
|[0009](0009-auth.md)|Opaque DB sessions|accepted|
|[0010](0010-deepseek-and-internal-tariff.md)|DeepSeek + fixed internal peak tariff|accepted последним выбором провайдера|
|[0011](0011-temporary-mac-review.md)|Temporary Mac HTTPS/private review gate|accepted; не VPS/SLA|
|[0012](0012-private-document-materials.md)|DOCX/DOC/PDF/TXT parsers и private FileStorage|accepted|
|[0013](0013-role-aware-onboarding.md)|Driver.js first-visit/role-aware onboarding|accepted|

- [Текущие реальные адаптеры/моки и границы замены](mocks.md)
- [Матрица требований/проверок/ограничений](../project-audit.md)
- [Финальная приёмка](../acceptance.md)
