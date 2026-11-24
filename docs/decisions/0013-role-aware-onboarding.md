# 0013. Обучение интерфейсу по роли через Driver.js

Статус: accepted. Дата:24.11.2026. Основание: новое требование заказчика объяснить интерфейс с первого входа и позволить повторить обучение.

## Решение

Один Client Component [OnboardingTour](../../apps/web/src/app/onboarding-tour.tsx) на dashboard/admin использует bundled Driver.js1.14.0. Содержание шагов зависит от актуальной app role; перед запуском отбираются только существующие видимые DOM targets. Не добавляем backend onboarding state, отдельный UI framework и tracking service.

Первый показ определяется browser localStorage key `praktikum:onboarding:v1:<userId>`, доступна кнопка повторного запуска. Сохраняется только seen flag: это не session token и не tenant authority. При недоступном storage тур остаётся доступен, но persistence между reload не гарантируется.

Есть следующий/предыдущий шаг, progress, пропуск, keyboard/Escape, aria dialog label, возврат фокуса, reduced-motion и мобильный CSS. Interaction с подсвеченным элементом отключён: tour не нажимает платные AI действия и не меняет бизнес-данные. Cleanup отменяет pending launch и destroy на unmount. Полного независимого WCAG аудита не заявляем.

## Альтернативы и последствия

Собственный spotlight/positioning/focus lifecycle усложнил бы простой продукт и потребовал больше browser edge cases. Статическая инструкция не показывает актуальные элементы роли. Выбрана небольшая библиотека и изолированный компонент; остальная страница остаётся Server Component. Селекторы требуют поддержки при изменении DOM; тесты и фильтр missing targets предотвращают пустые шаги.

## Проверки и источник

[Playwright](../../tests/browser/praktikum.spec.ts): first visit/replay/next/back/skip/Escape, role-specific targets, мобильная ширина390px. [Public smoke](../../tests/public-live-check.mts) проверил первый/повторный тур на опубликованной production странице. Это обучение **работе с сервисом**, не фиксация прохождения учебных заданий сотрудником.

Context7 `/websites/driverjs` проверен24.11.2026: [configuration/lifecycle](https://driverjs.com/docs/configuration), [tour basics](https://driverjs.com/docs/tour-basics). Фактический installed API проверен TypeScript и браузером; внешние CDN/analytics для туров не подключены.
