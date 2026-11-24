# 0011. Временная закрытая HTTPS публикация с Mac

Статус: accepted. Дата:24.11.2026. Основание: заказчик выбрал достаточную временную ссылку с Mac для проверки с другого устройства; постоянный VPS deployment не выполнялся.

## Решение

Cloudflared Quick Tunnel → loopback Node BasicAuth gate3390 → Next production3300 → private Nest3311 → PostgreSQL55432. Отдельная review БД/каталог uploads и случайные app credentials двух компаний; локальная демо БД не публикуется/не подменяет review. Текущий адрес `https://driven-collection-interested-bridge.trycloudflare.com` действует, пока работают Mac/сеть/tunnel. Ключи/пароли вне git, private files600.

Gate защищает login/static/health/все paths, constant-time digest comparison, снимает Basic Authorization до upstream, фиксирует доверенные Host/X-Forwarded-Host/https, проверяет Origin, ограничивает body6МиБ и timeout180s. HTTP перенаправляется на HTTPS до challenge. Next сохраняет Secure/HttpOnly/Lax app cookie. Gate не выдаёт app role/tenant.

Production flags deny registration/topup по умолчанию. Для доверенного review по последнему запросу заказчика оба явно включены **за gate**: регистрация создаёт независимую компанию0balance, owner может пройти Demo topup flow. Это не анонимный публичный SaaS launch. При снятии gate необходимо вернуть deny defaults либо реализовать signup/payment/abuse controls.

## Альтернативы и последствия

VPS остаётся будущей задачей с nginx/systemd/TLS/отдельной БД, не заявленным результатом. Переписывание Nest+PostgreSQL под несовместимый hosting не оправдано. Temporary tunnel проще для проверки, но URL/доступность не имеют постоянного SLA, process restart меняет tunnel address; это нужно явно передать пользователю.

Compiled Nest/common package работает без прямого импорта TypeScript в Node runtime. Node22.23.5 smoke200/403 проверен; текущий Mac full flow проверялся на Node25.9. Auto reboot/restart/offsite backup не выдаются за готовый постоянный hosting. Paired DB+uploads backup/restore authenticated download проверен отдельно.

## Evidence и источники

[Gateway и2 tests](../../deploy/review-gateway.test.mjs), [production policy](../../apps/api/src/production-policy.ts), [deployment/runbook](../deployment.md), [backup roundtrip](../../apps/api/test/backup-roundtrip.ts), [public real-provider browser flow](../../tests/public-live-check.mts). Фактический текущий runtime/registration smoke фиксирует [acceptance](../acceptance.md).

Context7: [Next reverse-proxy origins](https://nextjs.org/docs/app/api-reference/config/next-config-js/serverActions), [Nest compiled runtime/shutdown](https://docs.nestjs.com/deployment), [Prisma deploy migrations](https://www.prisma.io/docs/orm/prisma-migrate/workflows/development-and-production). Cloudflare Quick Tunnel ограничен временной проверкой: [официальная документация](https://github.com/cloudflare/cloudflare-docs/blob/production/src/content/docs/tunnel/get-started/quick-tunnels/index.mdx).
