# 0012. Word/PDF/TXT, приватный FileStorage и ограниченные парсеры

Статус: accepted. Дата:24.11.2026. Основание: новое требование заказчика загружать Word, PDF и TXT, сохраняя исходный текст для обучения и оригинал для скачивания.

## Решение

[DocumentsController/Service](../../apps/api/src/documents/service.ts) добавлены в существующий AppModule, не отдельный микросервис. Multipart≤5МиБ/один file/один title. В [Material](../../apps/api/prisma/schema.prisma) migration6 добавляет nullable attachment metadata; существующие text-only материалы совместимы. В AI идёт Material.text, не binary. Пользователь видит полный извлечённый текст до генерации.

FileStorage.put/get/remove — DI boundary. LocalFileStorage реально хранит оригиналы: приватный configurable MATERIAL_UPLOAD_DIR,700/600, UUID keys, вне public/static. Key не выдаётся клиентам. Download проверяет app role и material id+session.companyId; отдаёт attachment/private-no-store/nosniff. DB failure после записи вызывает cleanup; crash orphan handling остаётся операционным. S3 не нужен для временной Mac проверки и может заменить local adapter с теми же privacy/lifecycle guarantees.

TXT: UTF8/BOM, UTF16LE/BE BOM, CP1251 fallback. DOCX: Python stdlib ZIP/XML, основной document.xml включая таблицы. PDF: pypdf6.14.2, текстовый слой; DOC97–2003: macOS textutil, Linux antiword как documented dependency. Проверяются MIME/extension/magic, ZIP entry/size/ratio/path/DTD/entity limits. XML/ZIP не извлекается на диск; OCR/headers/footnotes/сложная вёрстка не гарантируются.

Native parsing вынесен из Node event loop в отдельную POSIX group. Hard deadline10s/SIGKILL всей группы и immediate Promise rejection, aggregate RSS256МиБ каждые100ms fail-closed, output1МиБ, Python CPU8s/Linux AS512МиБ. Ограничения periodic monitor не равны kernel sandbox; краткий memory overshoot возможен. PDF raw text overflow12000 немедленно отклоняет весь материал до trim, длинные источники не сохраняются частично.

PUBLIC_ORIGIN задаётся сервером для upload BFF: сравнение с внутренним Next request.url ломалось за reverse proxy и исправлено. Непроверенным forwarded header не доверяем. Gate/Next6МиБ пропускают5МиБ multipart; BFF5МиБ+8192.

## Альтернативы и последствия

Отправка binary в LLM вместо deterministic extraction не даёт проверяемого source для exact evidence. Тяжёлые OCR/LibreOffice/Poppler не нужны для выбранного MVP. Native .doc adapter ограничивает переносимость и требует явной Linux зависимости; это отражено в [material-files](../material-files.md). Конкурентные worker quotas/полная sandbox/anti-malware/OCR не реализованы; текущий запуск закрыт gate.

Backup обязан включать metadata DB **и** originals. [backup.mjs](../../deploy/backup.mjs) создаёт DB-first dump + immutable files archive + SHA manifest; deletion/update support потребует согласованного snapshot/quiesce protocol. Два isolated restore прогона подтвердили реальный authenticated download hash и600 assets; не только pg_restore --list.

## Проверки и источники

[Document tests](../../apps/api/test/documents.test.ts):6 реальных форматов/кодировок, malformed/magic/XML/ZIP/scan/encrypted/size, HTTP roles/tenant/byte download/cleanup (DB adapter здесь in-memory). [Origin test](../../apps/web/test/upload-origin.test.ts), [real-PG Playwright](../../tests/browser/praktikum.spec.ts), [публичный DOCX→real DeepSeek](../../tests/public-live-check.mts), [restore proof](../../apps/api/test/backup-roundtrip.ts).

Context7/официальные sources: [Nest upload](https://docs.nestjs.com/techniques/file-upload), [pypdf extraction caveats](https://pypdf.readthedocs.io/en/stable/user/extract-text.html), [Python ZIP](https://docs.python.org/3/library/zipfile.html), [Node detached child process](https://nodejs.org/api/child_process.html), [Next Route Handlers](https://nextjs.org/docs/app/api-reference/file-conventions/route). Детальные лимиты/ошибки — [material-files](../material-files.md).
