# Запасной Cloudflare-адрес

URL: **https://praktikum-demo.jetrook9.chatgpt.site**. Это тонкий Cloudflare Worker перед тем же Render, а не отдельная копия приложения. Данные, компании, файлы, расходы и отчёты общие. Mac не участвует. Посетителю не нужен аккаунт ChatGPT; общий BasicAuth и обычный вход в приложение сохранены.

Исходники: `deploy/edge/`, без зависимостей. Точный runtime `PUBLIC_SITE_ORIGIN` хранится в Sites; API-ключи, пароли и DSN туда не передаются. В Render идут только Basic Authorization, cookie `praktikum_session` и разрешённые HTTP/Next/RSC-заголовки. Платформенные токены, сторонние cookies и сведения об учётной записи ChatGPT отбрасываются.

Origin/Host проверяются до обращения к фиксированному Render origin. Только после проверки Origin заменяется для совместимости с Next Server Actions и upload CSRF. URL пути не может изменить upstream host. Redirects и cookie domains ограничены тем же upstream. Streaming body ограничен6МиБ, ответы не кешируются; общий gate и tenant-проверки остаются в приложении.

Native Sites version1, Worker source commit9b1de1b779b3d599a2436ca6a7219be6f23bf600. GitHub содержит побайтную копию Worker/test/build из этого source; публикация Sites ведётся отдельным native source helper. Идентификаторы hosting/версии/deploy записаны в локальном `.runtime/render/edge-deployment.json`, не секретные credentials в Git не включаются.

Fresh Sol review PASS,7/7 tests прошли независимо у автора, reviewer и root. Реальный публичный Playwright через Cloudflare:3/3 ролиPASS12.9s; login/logout/SecureHttpOnlyLax, multipartTXTupload201 и originalSHA, foreignOrigin403;4прежних originals owner/employee SHA совпали, отчёт100 и баланс497048 сохранены. Новых AI-действий через proxy не выполнялось.

## Граница сетевой проверки

Через обычный VPN-маршрут Mac обе ссылки проходят публичный HTTPS UI flow. При привязке curl к физическому en0 без VPN Render216.24.57.16 и Sites104.18.22.186 не установили TCP-соединение; контрольный ipify104.26.13.205 ответил200. Это наблюдение этой сети на25.11.2026. Причина фильтрации не установлена; доступность без VPN у другого провайдера или устройства не подтверждена. Запасной адрес не устранил наблюдаемый direct timeout. Перед показом используйте проверенное подключение; если ссылка не открывается, проверьте с VPN.
