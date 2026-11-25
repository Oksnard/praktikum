# Журнал разработки

## 2026-11-24 — Bootstrap
Прочитаны два исходных запроса. Создан каркас и дословно сохранён исходный запрос. Реализация ещё не начата. Эксперт Sol владеет архитектурой и backend; независимая приёмка у dispatcher.

## План до кода
План заполнен до исходников. Context7: https://github.com/nestjs/docs.nestjs.com/blob/master/content/fundamentals/execution-context.md ; https://www.prisma.io/docs/orm/prisma-client/queries/transactions ; https://github.com/vercel/next.js/blob/canary/docs/01-app/02-guides/authentication.mdx . Prisma закрепляем на v6, поскольку свежий main docs уже описывает несовместимый Prisma8. OpenAI/Zod проверены dispatcher: https://developers.openai.com/api/reference/resources/chat/subresources/completions/methods/create и https://github.com/stefanterdell/zod-to-json-schema/blob/master/README.md .

## 2026-11-24 — Контракты, backend, БД и биллинг
- Реализованы monorepo, общие Zod/v3 DTO, Prisma schema+SQL migration, real session auth/roles, company scoped use cases, AI structured outputs/audit/retry/evidence/cache, transactional reserve/settlement и Demo payments.
- Context7 sources: Prisma transactions/migrate diff (https://www.prisma.io/docs/orm/prisma-client/queries/transactions), Nest guards (https://github.com/nestjs/docs.nestjs.com/blob/master/content/fundamentals/execution-context.md), ESLint flat config (https://github.com/typescript-eslint/typescript-eslint/blob/main/docs/getting-started/Quickstart.mdx). OpenAI pricing/status checked dispatcher https://developers.openai.com/api/docs/models/gpt-4o-mini.
- Реальная проблема1: Prisma pnpm resolver отвергал nested client при root-only CLI. После двух неуспехов изучен DEBUG resolver; Prisma CLI добавлена локально в api, generate прошёл. Проблема2: tsx из root не видел decorators; root tsconfig исправил seed. Zod converter требует zod/v3 типы.
- Checks: db:generate, db:migrate, db:seed, API typecheck и4 unit PASS. PostgreSQL14 на loopback55432 предоставлен dispatcher; Docker не нужен. API port3011 выбран, поскольку3001 принадлежит другому сервису.
- Ограничение: OPENAI_API_KEY отсутствует; не подключали production fixture режим. gpt-4o-mini Deprecated — documented risk.

## 2026-11-24 — Проверки pipeline
- HTTP e2e с PostgreSQL и DI FixtureProvider PASS: две компании/roles/isolation, concurrent topup и generation, cache, null/fabricated evidence retry, usage billing всех3 attempts, exhausted retry, employee limit, concurrent company budget, UNKNOWN holds reserve/no replay, logout.
- Independent Sol review: блокирующих дефектов после исправления Prisma.JsonNull не найдено. Остались live AI, concurrent limit-edit test и crash recovery ручной процедуры.
- lint первый запуск выявил unused variable + prefer-const и незаконченный JSX worker; backend исправлен, web исправляет владелец.
- pnpm dev запущен: Nest3011 и Next3000 успешно стартовали. UI проверяет dispatcher отдельно.

## Инструменты и итоговые проверки
- Context7 Turbo strict env verified: https://github.com/vercel/turborepo/blob/main/apps/docs/content/docs/reference/configuration.mdx ; DATABASE_URL/PORT/API_URL/OPENAI_API_KEY явно passthrough, dev persistent.
- Context7 pnpm build script permissions checked https://github.com/pnpm/pnpm.io/blob/main/docs/settings/build.md ; для закреплённого pnpm10.11 используется onlyBuiltDependencies (новый allowBuilds требует10.26+).
- Полные pnpm lint и pnpm typecheck PASS после готовности исходников UI; pnpm evals PASS всех5 authored snapshots. Не выдаём authored fixtures за live записи.
- Добавлены PostgreSQL CHECK nonnegative для баланса/расходов/лимитов/AI стоимости как дополнительная защита от ошибок нового кода.

## 2026-11-24 — Финальная приёмка интерфейса
- Браузер выявил необработанную ошибку AI Server Action, переполнение на 762 px, устаревшее сообщение об ошибке после успешного действия и отсутствие выхода на мобильной ширине. Исправлены обработка отказов, pending кнопки, адаптивные карточки, очистка ошибки и мобильный выход.
- Показаны полный материал/вопрос, оценки критериев, конкретные пробелы и unsupported claims; сотруднику доступны личный лимит, расходы и остаток. Убраны выдуманный адрес поддержки и обещание отсутствующего редактирования ролей.
- В реальном dev API проверены no-key 503 без резерва/списания, SUPER_ADMIN ledger 200, EMPLOYEE 403 и скрытые staff/finance данные. В браузере проверены роли, вход/выход, неверный пароль, добавление материала и Demo пополнение 100000 кредитов. Горизонтального переполнения нет на 762/390 px. Снимок: docs/screenshots/dashboard.jpg.
- Финальный Sol review APPROVE; целочисленная формула стоимости независимо сверена с BigInt на 169360 ограниченных парах токенов. Остались только задокументированные ограничения.
- После заморозки исходников: pnpm build PASS (API + Next, 13.4 с), pnpm lint PASS, pnpm typecheck PASS. Ранее успешные unit/e2e/evals сохранены; live evals не выполнены без ключа. Dev перезапущен, API3011 и Web3000 отвечают.
- Зафиксированный интервал от bootstrap-коммита до итоговых проверок: 19:46:11–20:03:33 MSK, 17.4 минуты (0.29 ч), без первоначального разбора. Это wall-clock параллельной агентной работы, не человеко-часы. Полная live приёмка ожидает OPENAI_API_KEY и доступность модели.

## 2026-11-24 — Реальные провайдеры и согласованный DeepSeek
- После предоставления ключа OpenAI первый eval оставил UNKNOWN без подтверждённого usage. Отдельная диагностика вернула429 credit_balance_exhausted. Дальнейшие OpenAI вызовы остановлены; исторический UNKNOWN не переписан без доказательства.
- Исправлен аудит известных отказов провайдера и возврат неиспользованного резерва. Независимый review обнаружил ABA гонку повторного REJECTED; добавлены persistent revision/CAS, уникальные reservation ledger keys и детерминированный regression. Проверены также INVALID→429→успех и согласованность накопленной стоимости.
- Заказчик явно выбрал DeepSeek. Через Context7 и официальные docs проверены совместимый SDK/baseURL, JSON mode, thinking disabled, usage cache tokens и тарифы. Согласованное отклонение от OpenAI strict schema и фиксированный внутренний тариф описаны в ADR0010. Ключи сохранены только в игнорируемом.env с правами600.
- DeepSeek реальные5evals прошли с прежними диапазонами без коррекций:100/100/0/25/0,5VALID calls,3057внутренних кредитов. Авторские fixture responses заменены реальными записями с provenance. Повтор вернул cache без дополнительного provider call.
- Dispatcher провёл реальный HTTP путь на demo Альфа: генерация395кредитов, оценка782, score100,3критерия/4цитаты, персональный текст и результат у менеджера. Сумма1177 совпала с изменением баланса; повтор генерации0. Оба responseModel=deepseek-flash. Подробный результат открыт в браузере и сохранён на снимке.
- Добавлены cachedPromptTokens/provider/tariffVersion/responseModel и миграции до№5. Shared reserve200000 отражается в UI defaults. UI отличает внутренний тариф от invoice, незавершённую стоимость от0, расходы от удержанного резерва.
- Финально20:24:08 MSK: pnpm lint/typecheck/test/test:e2e/evals/build PASS;6unit,5recorded evals, финальная сборка5.7с без cache. Независимый Sol review APPROVE. Измеряемый интервал от bootstrap19:46:11 до этого набора —38.0мин(0.63ч), без начального разбора/завершающего оформления; не сумма человеко-часов.
- Подтверждено7успешных DeepSeek вызовов и4234внутренних кредита. Внешний invoice не проверялся. Исторический OpenAI UNKNOWN удерживает100000; available Альфа995766. Продуктовая логика/тесты не подменяют production AI моками.

## Денежная точность
Стоимость вычисляется через целочисленный числитель `(promptTokens*15 + completionTokens*60 +99)/100` с floor, без сложения дробных тарифов. Unit на миллион входных/выходных токенов подтверждает750000 microUSD. Повторные4 unit и API typecheck PASS. API build и git diff --check PASS; AGENTS35 строк.

## 2026-11-24 — HTTPS, документы, обучение и повторная приёмка

- Заказчик выбрал временный Mac URL вместо постоянного VPS. Созданы отдельные private review БД/роль и random credentials, compiled Nest/Next production на loopback3311/3300; Cloudflared→auth gateway3390. Публичный HTTPS gate401/authorized200 проверен, cookieSecure/HttpOnly/Lax. Команды/перезапуск/ограничения сна описаны вdeployment.md; VPS templates не выдаются за установленный сервер.
- Shared contracts переведены вcompiled CommonJSdist, проверен обычныйNode22. Production default registration/topup deny, review flags отдельно. Сначала регистрация закрыта, после уточнения заказчика включена заgate и заново проверена настоящим HTTPSPlaywright: emptytenant/owner/0balance/login/logout/foreignfile404; тестtenant удалён,0AIcalls.
- Добавлены private FileStorage и реальные DOCX/DOC/PDF/TXT parsers, шестая миграция. Fresh review выявил внешнийOrigin/internalNext mismatch, необходимостьSIGKILL processgroup и отказаoverlongPDFбезpartialacceptance; всё исправлено и покрыто. Подпроцесс ограничен временем/output/RSS, sandboxlimitations документированы.
- driver.js1.14.0 onboarding: firstvisit peruser/browser, role-aware sections, skip/Escape/replay/mobile/reducedmotion; fresh source review APPROVE.
- Audit исправил blankAIstrings, exact global financial aggregates+window labels+allunresolved и manualreconciliationroundcost. PairedDB+uploads+hashmanifest backup/restore проверен через authenticateddownload, повторён независимо вдвух временных БД. Никакая рабочая БД не перезаписана.
- Полный Playwright suite потребовал исправления селекторов admin/company/logout и accessible dialog name; после двух неудачных acceptance итераций эскалация кAstra. Итог5/5PASS1minбезretry, mobileall5steps fullyvisible390×844. Productionapp ради тестов не менялся.
- Реальный publicPlaywright DOCX→DeepSeek→employee→manager:PASS,2calls891internalcredits,score100/2quotes,originalbytehash/cache0/tenant404. Publicreadonlysmoke3/3PASS. ЛокальныеAIfixtures толькоDI, публичныеAIcalls настоящие.
- По уточнению изоляции проведён свежий source review и добавлены HTTPregressions: emptyBworkspace/ownteam, recursiveprivatefieldabsence,foreignlimit403/noDBchange,companyIdinjection400,nopeeremployeeattempts/operations. Свежий root HTTPe2ePASS после reviewerPASS, включая обе reserve/limitrace очередности.
- После публикации root повторил22unit/focused,lint,typecheck,offline5evals,backuprestore:PASS. Последняя app productionbuild3tasks12.508s выполнена перед запуском; последующие изменения касались тестов/docs/envpassthrough, build поверх работающегоNext не запускался.
- При ENOSPC безопасно очищены неактивныеnpmexec/pnpmmetadata/Xcode/browsercache:220→4404МиБ свободно, активныеruntime/DB/source/authstorage/Playwrightbrowser сохранены. Docker отсутствует; не заявляем удаление контейнеров.
- Обновлены ТЗ-дополнения,README/план/приёмка/архитектура/API/ADR, file/onboarding/deploy/reconciliation/browser/cleanup runbooks иprojectaudit. По новому запросу готовится публичныйGitHub; передpush проверяется вся история и stagedfiles на секреты.

## 2026-11-24 — Ручная проверка заказчиком и публикация исходников

- По скриншоту исправлена форма upload: existing form-panel tokens, stacked labels/native file picker/selected name/error/pending, inputsdisabled+aria-busy. Mobbin дважды отверг search с INVALID_ARGUMENT; поиск остановлен, UI исправлен по существующей системе стилей без выдуманных референсов.
- Найдены dangling navigation: owner/manager learning и manager team. Ссылки и названия приведены к реально доступным разделам. Playwright теперь кликает все видимые sidebar links всех трёх ролей. Полный набор5/5PASS1.2min; новая финальная проверка после header polish фиксируется в acceptance.
- Public UI test выявил мобильное перекрытие floating replay/upload submit; replay перенесён в sticky header, обе viewport geometry проверяются. Current-host upload/registration PASS,0AI, exact fixture cleanup подтверждён.
- После длительной паузы attached sessions остановились. API/Next/gate/tunnel запущены через detached POSIX sessions с приватными logs/PID file; URL сменился на текущий вdeployment.md, Host/Origin/browser/access синхронизированы. Launchd/автозапуск не установлен.
- Последний production build6.206s: shared/API cache, Next пересобран. Rootfull lint/typecheck повторены. При staged diff проверке PDF xref whitespace корректно сохранены; binary attributes запрещают text diff/merge/newline conversion, содержимое fixtures не менялось.
- Подготовлен настоящий Word-регламент1942 исходных символа; render/PNG review1pagePASS, actual app parser1929символовPASS. Добавлены Word/TXT и testing-walkthrough: owner→upload/generate→employee answer→results; без готового ответа.
- Перед публичным GitHub выполнена проверка working tree, staged blobs и всей Git-истории по реальным private credential values и key patterns; совпадений не найдено, секреты не выводились. Remote Oksnard/praktikum создан публичным по последнему уточнению заказчика. Push подтверждается отдельно после завершения приёмки.

- Финальная новая сборка: localPlaywright5/5PASS1.1min,remote3/3PASS14.3s,publicregistration/upload UI PASSнаактуальномhost;0AI. Новый запрос заказчика — содержательная проверка AI-отчёта по трём контролируемым ответам; проводится отдельно, без чтения пользовательских tenant данных.

- Public push завершён: e04fe13 →Oksnard/praktikum/master, remoteSHA=localSHA, isPrivate=false, Wordartifact присутствует вGitHub. Приватныеenv/DB/runtime отсутствуют вtracking.

## Содержательная проверка обнаружила новый дефект

На регламенте1929chars полный и нарушающий ответы не получили валидные отчёты: max1500outputtokens обрезал JSON, все retry оплачивались и честно аудировались. Частичный ответ52 принят, но объяснения неверно трактуют немедленный пятничный ответ. Invalid drafts неверно считают конкретные допустимые действия17:45/17:55 выдуманными политиками и пропускают явно указанные шаги. Итог старого pipeline:4ops/9calls/14885internalcredits, UNKNOWN/PENDING0. Собственная QA компания и платный аудит сохранены; пользовательские компании не читались. FreshSol подтвердил дефекты независимо. После первого обнаруженного системного ограничения старые платные проверки остановлены; batch уже успел завершиться, новые старым контрактом не запускаются. Заказчик явно запросил гибкий контекстный промпт. FreshAstra владеет новой схемой оценки/бюджетом/совместимостью и тестами; это ещё не принятая исправленная версия.

## Контекстная оценка и приёмка policy5

- FreshAstra реализовал Assignment/EvaluationV2: frozen3–6требований соsource/questionquotes, checks сострогимиanswerquotes/IDcoverage; source/prompt/input budgets целиком до резервирования.4096outputtokens, max3calls/action, bound195669<200000. APIunit25/full28focused, HTTPe2e,8offline recordings, typecheck/lint прошли у автора/ревьюера; root повторяет финальный набор после deployment.
- Policy4 дал95/58/0, ноfull95ложно требовал неизвестный номер; диапазонPASS не был принят как смысловойPASS. Общая поправкаpolicy5 различает план/исполненную операцию, неизвестное значение и требование. Те же sealedanswers/question дали100/72/8,3calls4911credits; независимый Sol подтвердил содержание.
- Legacyfull88 сохранил ошибки и не принят. Вместо post-answer rubric новый legacy grading закрыт409дофинансов, owner/manager создаёт новоеV2assignment, старые записи и ответы не изменяются; UI показывает прежнюю методику. HTTPe2e подтвердил409/403безрасходов, новыеID и прежние записи.
- Дополнительный реальный складской сценарий:2ops3002credits,10040/30/30,6met;4целых×12=48/60, повреждённые12 вкарантин, неполная выдача после письменного согласования, закрытие после передачи/подписи. FreshSolsemanticPASS. Новых paid loops нет.
- Сохранили все14ops/19providercalls двух QA компаний,30750internalcredits total, включаянеудачныеbaseline. Послеbaseline15865; ledger/spent/calls согласованы, сессии0/UNKNOWN/PENDING0. Провайдер invoice не проверялся.
- Финальная сборка после legacy guard/UI:7.286s,sharedcache/API+Nextrebuilt. API/Web перезапущены через проверенныеPIDприpending0; gateway/tunnel и URL сохранены. Итоговые браузерные/публичные проверки и публикация второго коммита фиксируются следующим пунктом.

- Финальный root набор после deployment:28focused/HTTPe2e/8offlineevals/lint/typecheck/5localPW1.1minPASS; production-smoke3/3PASS20.0s. PublicqualityUI потребовал смены модели после двух follow-up исправленийLuna: Astra наблюдал фактическийDOM и правильно разделил подпись прежнего отчёта/предупреждение старого задания, усилил финансовый снимок до owner-scope. Полный финальный runPASS;3изображения пересняты целиком подstickyheader и осмотрены, все4сессииотозваны,409безsideeffects подтверждён,0AI. Root отдельно прочитал тест и просмотрел fullPNG; type-only DTO/strictTSC проверяются перед commit.

- Root исправил только тестовый DTO (реальныйassignmentId вложенного Attempt) и убрал неверное неиспользуемое поле; strictTSC поизолированномуconfig, ESLint иPrettierPASS. Runtime тест/продукт не менялись, повтор браузера не требовался. Финальный working/history/staged secretscan не обнаружил private credential values/key patterns; значения не выводились.

## Итоговая публикация

Принятый AI release29e6547 отправлен вpublicOksnard/praktikum/master; remoteSHA29e6547f84c2c503b211943a798a9f3d7ddfdc11 совпал с локальным. GitHub подтвердилisPrivate=false и опубликованный ai-quality-review.md. Последующая запись checkpoint меняет только документацию. Процессы опубликованного приложения оставлены работать; ключи/доступы/runtime/БД вGit не попали.

## 2026-11-25 — HTTP по IP Mac

- По прямому запросу заказчика добавлен отдельный HTTP review: gateway `192.168.31.195:8080` → Next `127.0.0.1:8081` → прежний loopback API/БД. HTTPS экземпляр сохранён; истёкший tunnel заменён, текущий адрес и private env/access синхронизированы. Секреты не коммитились.
- Sol реализовал отдельные opt-in gateway/cookie, точные Host/Origin и адрес bind; BasicAuth сохраняется на всех путях. Независимый Sol reviewer: PASS, подтверждённых P1/P2 нет, 8 focused проверок. Context7 и граница соседней patch-версии записаны в `http-review-source.md`.
- Root: `pnpm test` **33/33 PASS** (API25, web4, gateway4), `pnpm lint`, `pnpm typecheck`, production web build PASS. Playwright по LAN: **3/3 роли PASS, 5.7s**; после сборки HTTPS: **3/3 PASS, 9.8s**, Secure/HttpOnly/Lax cookie и logout отдельно подтверждены.
- Реальный Playwright HTTP flow: регистрация новой компании, cookie HttpOnly/Lax/Secure=false, reload, DOCX upload201, скачанный оригинал совпадает по SHA256, чужой Origin403, logout/login PASS. AI не вызывался, собственная тестовая компания/сессии/файл удалены. Два первых запуска проверки остановились на неточных test selectors (поле пароля с пояснением и icon logout); selectors исправлены, итоговый полный flow PASS, продукт не менялся после review.
- Письмо и private PDF доступов обновлены: актуальная HTTPS ссылка, LAN адрес в доступах. Потоки страниц письма побайтно сохранены; PDF доступов одна страница, текст сверён с источником, геометрия проверена на полностью замаскированной копии.
- Граница результата: LAN IP проверен запросами к сетевому адресу с Mac; физическое другое устройство не использовалось. Это не доказательство доступа из Интернета. IP DHCP, роутер запросил авторизацию, UPnP не обнаружен. Проброс портов, резервация DHCP, VPN/firewall и автозапуск не менялись. Для постоянного внешнего IP нужны отдельные настройки роутера/провайдера. Текущие процессы detached; Mac должен работать и не спать.
