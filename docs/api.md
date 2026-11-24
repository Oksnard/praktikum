# HTTP и frontend контракты

Nest API приватный: dev `http://127.0.0.1:3011`, текущая review публикация `http://127.0.0.1:3311`. Интернет URL ведёт в Next за BasicAuth, **не** открывает весь Nest API. JSON contracts — [packages/types](../packages/types/src/index.ts); routes — [AppController](../apps/api/src/controller.ts), [DocumentsController](../apps/api/src/documents/controller.ts).

## Auth и правила доступа

Nest protected routes: `Authorization: Bearer <opaque session token>`. Login/register → `{token,user:UserView}`; passwordHash никогда не возвращается. Сессия24ч, logout удаляет digest. Next хранит token в HttpOnly cookie `praktikum_session`, Secure при NODE_ENVproduction, SameSite=Lax; не localStorage. Cookie14дней не продлевает24-часовую API сессию: после истечения нужен вход.

BasicAuth gate — отдельная внешняя проверка; не заменяет app session и не выбирает companyId. Tenant берётся только из User сессии. User.email уникален глобально, один user account принадлежит одной компании; multi-company memberships/switcher нет. SUPER_ADMIN не имеет tenant и не вызывает learning endpoints.

| Метод / путь Nest | Доступ | Вход → результат |
|---|---|---|
| GET /health | Public в Nest, снаружи gate всё равно нужен | `{ok:true}` |
| POST /auth/register | Public + policy flag | `{email,password,name,companyName}` → OWNER новой компании, balance0, `{token,user}` |
| POST /auth/login | Public | `{email,password}` → `{token,user}` |
| POST /auth/logout | Любая app session | `{}` → `{ok:true}`, token отозван |
| GET /me | Любая app session | `UserView` без passwordHash |
| GET /dashboard | OWNER/MANAGER/EMPLOYEE | `Dashboard`, scope ниже |
| POST /materials | OWNER/MANAGER | `{title,text}` → Material |
| POST /materials/upload | OWNER/MANAGER | multipart `title` + `file` → Material view, извлечённый text + attachment metadata, без storage key |
| GET /materials/:id/file | OWNER/MANAGER/EMPLOYEE | Оригинальные bytes только своей компании; attachment/private-no-store/nosniff |
| POST /materials/:id/generate | OWNER/MANAGER | `{}` → Assignment с materialId/content/criteria/operationId |
| POST /assignments/:id/attempts | OWNER/MANAGER/EMPLOYEE | `{answer}` → Attempt с validated evaluation |
| POST /users | OWNER | `{email,password,name,role:MANAGER|EMPLOYEE,limit}` → UserView; Demo notification записывается в БД |
| PATCH /users/:id/limit | OWNER | `{limit}` → `{ok:true}`; только MANAGER/EMPLOYEE своего tenant, не ниже spent+активных резервов |
| POST /credits/topup | OWNER + policy flag | `{amount,key:uuid}` → MOCKED CreditTransaction |
| GET /admin/ledger | SUPER_ADMIN | `AdminLedger`: companies/transactions/operations/calls/totals/windows |

Успешные GET/PATCH обычно200, POST201 (в том числе logout/cache response). Ошибки Nest: `{statusCode,message,error?}`; в BFF могут быть `{message}`.400 — DTO/формат,401 — session,403 — role/policy/недопустимое снижение лимита,404 — отсутствующий **или чужой** material/assignment/file,409 — concurrent/idempotency conflict,413 — upload body,422 — budget/AI validation,503 — provider/storage/parser недоступен или outcome unknown. Причина unknown не превращается в фиктивный успешный ответ.

Production defaults `ALLOW_PUBLIC_REGISTRATION=false`, `ALLOW_MOCK_TOPUPS=false`. В текущем закрытом review gate оба flow включены явными flags по последнему запросу заказчика. Вход без gate остаётся401. Регистрация не даёт стартовых кредитов/чужих данных; новый owner сам создаёт свою команду/материалы. Изменение runtime policy не меняет API контракт; актуальная внешняя проверка — [acceptance](acceptance.md).

## Размеры, данные и окна

- Email≤200, password10–128; name/company2–100, material title3–150.
- Text60–12000 символов, answer10–8000. Общий core AI JSON input≤200000 UTF8 bytes; полный provider body со schema/system/retry также≤200000 байт (проверяется до резерва). Никаких скрытых усечений.
- Upload: один DOCX/DOC/PDF/TXT≤5МиБ, одно поле title; BFF cap5МиБ+8192, gateway/Next6МиБ. Извлечённый текст60–12000, binary в AI не отправляется. [Политика файлов](material-files.md).
- `limit`0–10000000; topup amount1000–10000000 целых credits. Один key+та же сумма идемпотентны; другой amount с использованным key →409. Key namespaced company.
- Timestamps сериализуются ISO8601. Материал включает attachmentName/Mime/Size nullable; attachmentKey — внутренний и не выдаётся в upload/dashboard/assignment views.

Dashboard содержит user/company/materials/assignments/attempts/users/transactions/operations. EMPLOYEE получает общие материалы/задания и company balance, только свои attempts/operations, пустые users/transactions. OWNER/MANAGER видят командные результаты/users/последние100 transactions и100 operations своей компании. Пользователи/результаты без API пагинации: это предел объёма MVP, не обещание масштабирования.

AdminLedger totals — глобальные компании/transactions/operations/calls, известная AiCall cost и число/резервы unresolved. ReadRepeatableRead snapshot отделяет aggregates от окон: последние200 transactions,100 calls и100 recent operations **плюс все PENDING/UNKNOWN**, даже более старые. Указанные limits — не totals. `totals.knownAiCost` не объявляет неизвестную стоимость нулевой.

## AI result и финансовые состояния

AssignmentContent: `summary,question,evidence`. Evaluation: `score,criteria[{id,score,explanation}],evidence,unsupported_claims,gaps,feedback,recommendations,personal_material`. Обязательные учебные/feedback строки непустые; ids/max/sum критериев стабильны, цитаты должны точно присутствовать в source. При score>0 evidence не может быть пустым.

Активный AI_PROVIDERdeepseek/`deepseek-flash`; OpenAI optional. DeepSeek JSON mode валидируется локально Zod, OpenAI strict JSON Schema. До2 исправляющих retry, output≤4096 tokens. Hash включает tenant/user/input/criteria/provider/model/tariff/policyVersion5. SUCCESS cache не вызывает provider; FAILED терминален до нового input/version. REJECTED допускает явный новый раунд через revision CAS; PENDING/UNKNOWN replay409 до ручной сверки.

Перед AI резерв200000, потом возвращается unused R−C. Credits — внутренний tariff microUSD по фактическим uncached/cached/output tokens, не provider invoice. AiCall: provider/requested model/responseModel/tariffVersion/promptTokens/cachedPromptTokens/completionTokens/cost/latencyMs/requestHash/responseJson/validationStatus. Исторический responseModel nullable. Operation.cost cumulative across rounds. UNKNOWN usage0 — sentinel, не подтверждённый нулевой invoice. [Формула и раунды](decisions/0005-billing.md), [сверка](reconciliation.md).

## Next BFF и browser

Остальные изменения UI — Server Actions: серверный fetch в Nest с Bearer из cookie, no-store и refresh/revalidate после mutation. Browser не получает provider key и не выбирает API tenant. Next proxy лишь предварительно проверяет cookie presence; реальная роль/сессия проверяются API.

- POST `/api/materials/upload`: browser FormData; BFF session + server-owned `PUBLIC_ORIGIN` проверка, streaming multipart в Nest. Для публичного HTTPS deployment PUBLIC_ORIGIN обязателен; loopback fallback только локальной разработке. Forwarded headers сами не являются authority.
- GET `/api/materials/:id/file`: BFF передаёт cookie token в private Nest, возвращает attachment/private-no-store/nosniff bytes. Cross-company404 сохраняется.
- Tour localStorage хранит только seen flag на userId, не token/tenant authority. [Onboarding ADR](decisions/0013-role-aware-onboarding.md).

Private API порт не должен публиковаться reverse proxy или tunnel. Public smoke использует браузерный HTTPS flow, а проверка usage/баланса может читать приватный Nest API с тем же авторизованным аккаунтом: [сценарий](../tests/public-live-check.mts).

Новые задания/оценки используют V2: snapshot применимых требований и checks с цитатами ответа. Исторические задания и оценки читаются; новая оценка задания без snapshot возвращает409 до резервирования. OWNER/MANAGER обновляет через generate(materialId), создавая новое задание; старые записи сохраняются. [Дизайн и ограничения](ai-evaluation-design.md).
