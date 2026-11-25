# Практикум

SaaS для обучения сотрудников: материалы компании → практическое задание → ответ → оценка по критериям, цитаты, пробелы и персональное обучение. NestJS + Next.js App Router + PostgreSQL/Prisma, TypeScript strict, pnpm/Turborepo. Реальный AI — DeepSeek; OpenAI доступен как альтернативный провайдер.

## Проверить по HTTPS

На 2026-11-25 опубликовано на **Render Free: https://praktikum-review-vhyg.onrender.com**. Приложение и PostgreSQL работают в облаке, независимо от Mac. База действует до25.12.2026; после15минут простоя первый вход может ждать около минуты. Доступ сначала через общий закрытый gate, затем через учётную запись приложения. Приватные доступы: `.runtime/render/access.txt` (не в Git).

Локально с Mac по HTTP: **http://192.168.31.195:8080** — для устройств в той же Wi-Fi-сети, с прежними доступами. Этот адрес не открывается из интернета; IP выдан DHCP. Настройка и ограничения: [deployment](docs/deployment.md).

Можно нажать «Создать компанию»: регистрация создаёт владельца и отдельный пустой кабинет с нулевым балансом. Команда, документы, задания, результаты и финансы ограничены компанией из сессии. Подстановка чужого ID не даёт доступа. Для проверки AI новый владелец может воспользоваться явно помеченным Demo пополнением. Публичный review использует отдельную БД со случайными паролями; локальные seed-пароли ниже там не работают. [Запуск и сопровождение](docs/deployment.md).

[Бесплатный облачный стенд и результаты проверки](docs/free-cloud-demo.md). [Deployment-артефакты и конфигурация](docs/render-cloud-source.md).

Запасной Cloudflare-адрес того же приложения: **https://praktikum-demo.jetrook9.chatgpt.site**. В текущей сети Mac оба адреса успешно проверены с VPN; прямое соединение без VPN завершилось timeout. Это сетевое ограничение данной проверки, не доказательство доступности без VPN у получателя. [Устройство и проверки proxy](docs/cloudflare-edge.md).

## Локальный запуск

Node22+ (compiled API проверен на22.23.5, разработка на25.9), pnpm10.11, PostgreSQL (локально14, в Render18), Python3 с `pypdf==6.14.2`. Для старого Word `.doc`: macOS `/usr/bin/textutil`, Linux `antiword`. Полные требования — [документы](docs/material-files.md).

```bash
cp .env.example .env  # только при первом запуске, не затирать существующий файл
# заполнить DATABASE_URL и DEEPSEEK_API_KEY; AI_PROVIDER=deepseek
pnpm install --frozen-lockfile
pnpm db:generate
pnpm db:migrate
pnpm db:seed
pnpm dev
```

Локально Web http://localhost:3000, API http://localhost:3011/health. В этой папке PostgreSQL работает на loopback55432; для нового окружения с установленным PostgreSQL есть `sh scripts/local-db.sh`. Port3001 принадлежит другому сервису. Ключи нужны только backend, хранятся в игнорируемом `.env`; после изменения провайдера/ключа перезапустить API. Отсутствующий ключ даёт503 до резервирования, фикстурами AI не заменяется.

Seed предназначен только для локальной разработки. Пароль локальных demo аккаунтов: `Praktikum2026!`.

| Роль | Альфа | Бета |
|---|---|---|
| OWNER | owner@alpha.test | owner@beta.test |
| MANAGER | manager@alpha.test | manager@beta.test |
| EMPLOYEE | employee@alpha.test | employee@beta.test |
| SUPER_ADMIN | admin@praktikum.test | — |

Seed идемпотентен, не сбрасывает изменённые пароли/расходы. Никогда не запускать его для публичной БД: вместо него предусмотрен private review provisioning.

[Пройти сценарий самому с готовым Word-документом](docs/testing-walkthrough.md).

## Основной сценарий

1. Создать компанию или войти владельцем. Добавить сотрудника/менеджера и индивидуальный лимит.
2. Ввести материал60–12000 символов или прикрепить Word `.docx`/`.doc`, PDF с текстовым слоем, TXT до5МиБ. Проверить полностью показанный извлечённый текст; оригинал доступен только своей компании.
3. Сгенерировать задание. Сотрудник пишет ответ, получает score, критерии, точные цитаты, неподтверждённые утверждения, пробелы и персональный материал. Руководитель видит результаты своей команды.
4. При первом визите запускается обучение по доступным роли разделам; кнопка «Обучение» запускает его снова. Есть пропуск, Escape, навигация назад/вперёд и мобильная версия.
5. На AI действие временно резервируются200000 кредитов. После ответа учитывается usage, остаток возвращается. Успешный повтор использует результат без нового списания. 1 кредит=1microUSD **внутреннего тарифа**, не точная сумма счёта провайдера: [ADR0010](docs/decisions/0010-deepseek-and-internal-tariff.md).

## Статус дополнительной проверки ИИ

Для каждого нового задания ИИ заранее сохраняет3–6 применимых требований. Оценщик проверяет их по смыслу и точным цитатам ответа, различает факты источника и допустимый план сотрудника. Общая шкала40/30/30 сохранена. Полные JSON-отчёты ограничены4096outputtokens; полный SDK запрос проверяется до списания. На реальных контрольных ответах получены100/72/8, на другом складском задании100; независимый review подтвердил смысловую корректность этой выборки. Старые задания доступны для чтения; для новых ответов владелец/руководитель создаёт обновлённое задание кнопкой «Обновить задание». История сохраняется. [Дизайн и промпт](docs/ai-evaluation-design.md), [отчёт с неудачными и успешными этапами](docs/ai-quality-review.md). Эти примеры не доказывают безошибочность на любом материале.

## Команды проверки

```bash
pnpm lint
pnpm typecheck
pnpm test              # 45 unit/focused tests: API25, web4, gateway/cloud9, edge7
pnpm test:e2e          # настоящий HTTP + PostgreSQL, AI через DI fixture
pnpm test:browser      # 5 Playwright Chromium сценариев, реальная БД, DI AI
pnpm evals             # 8 recordings:5 исторических+3 task-aware, без внешнего API
pnpm evals --live      # только3 modern fixtures, явный собственный QA tenant; см.docs/evals.md
pnpm build
node --env-file=.env --import tsx apps/api/test/backup-roundtrip.ts
```

Для браузерных тестов один раз `pnpm exec playwright install chromium`. E2E создаёт отдельные tenants и удаляет только их; backup roundtrip создаёт две отдельные временные БД. Не направлять эти проверки в production. Публичные smoke/real-provider проверки запускаются отдельными командами с приватным env: [Playwright](docs/browser-tests.md). Результаты и точные границы — [приёмка](docs/acceptance.md).

## Эксплуатационные границы

Один актуальный кейс на материал, предыдущие версии остаются в истории; критерии и требования сохраняются в задании до ответов, без UI редактора правил. PaymentProvider и NotificationSender — явные Demo реализации; реальной оплаты и отправки email нет. DeepSeek JSON mode проверяется локально через Zod/evidence с максимум2 retry; альтернативный OpenAI adapter сохраняет strict JSON Schema. AI рекомендации требуют контроля руководителя. PDF-сканы без OCR, изображения и сложная вёрстка не распознаются; длинные материалы отклоняются без усечения.

Изоляция реализована в приложении, PostgreSQL RLS не включён. Неизвестный API исход/сбой процесса удерживает резерв в UNKNOWN/PENDING до [ручной сверки](docs/reconciliation.md). В исходной локальной БД сохранён исторический OpenAI UNKNOWN; он не переносился в review БД. Нет SSO/reset password, публичной автоматической регистрации без gate, автоматического reconciler, offsite backup и постоянного hosting. Paired backup БД+оригиналов и восстановление проверены; Mac backup не поставлен на расписание.

## Документация

- [ТЗ и согласованные дополнения](docs/requirements.md), [план](docs/plan.md), [аудит соответствия](docs/project-audit.md)
- [Архитектура](docs/architecture.md), [API](docs/api.md), [ADR](docs/decisions/README.md), [Demo границы](docs/decisions/mocks.md)
- [Файлы](docs/material-files.md), [обучение](docs/onboarding.md), [публикация/backup](docs/deployment.md), [сверка денег](docs/reconciliation.md)
- [Контекстная оценка ИИ](docs/ai-evaluation-design.md), [проверка качества](docs/ai-quality-review.md)
- [Приёмка](docs/acceptance.md), [Playwright](docs/browser-tests.md), [evals](docs/evals.md), [журнал](docs/development-log.md), [очистка](docs/maintenance-cleanup.md)
