"use client";

import { useCallback, useEffect, useRef } from "react";
import { driver, type Driver, type DriveStep } from "driver.js";
import type { Role } from "@praktikum/types";
import "driver.js/dist/driver.css";
import "./onboarding.css";

type TourSection = { selector: string; title: string; description: string };

function sections(role: Role): TourSection[] {
  if (role === "SUPER_ADMIN") {
    return [
      {
        selector: "#admin-overview .welcome",
        title: "Управление платформой",
        description:
          "Здесь собраны компании, расходы на ИИ и операции с кредитами. Показатели за всё время отделены от последних записей журнала.",
      },
      {
        selector: "#admin-overview section:nth-of-type(3) .section-heading",
        title: "Компании и балансы",
        description:
          "Проверяйте остатки компаний. Материалы и ответы сотрудников доступны внутри кабинетов соответствующей компании.",
      },
      {
        selector: "#admin-overview section:nth-of-type(4) .section-heading",
        title: "Движение кредитов",
        description:
          "Журнал показывает пополнения, резервы и возврат неиспользованного остатка. Демонстрационные пополнения отмечены отдельно.",
      },
      {
        selector: "#admin-overview section:nth-of-type(5) .section-heading",
        title: "Операции с ИИ",
        description:
          "Незавершённые операции требуют внимания. Если исход запроса неизвестен, резерв сохраняется до сверки. Порядок сверки описан в документации сопровождения.",
      },
    ];
  }
  const employee = role === "EMPLOYEE";
  return [
    {
      selector: "#overview",
      title: "Добро пожаловать в Практикум",
      description: employee
        ? "Здесь можно изучать рабочие материалы, выполнять задания и получать рекомендации. Покажем основные разделы; обучение можно пропустить и открыть снова."
        : "Здесь можно превратить рабочие материалы в обучение команды и увидеть результаты. Покажем основной сценарий; обучение можно пропустить и открыть снова.",
    },
    {
      selector: "#materials .section-heading",
      title: "Материалы и задания",
      description: employee
        ? "Прочитайте материал и вопрос задания. Напишите содержательный ответ своими словами, опираясь на источник, и отправьте его на оценку."
        : "Добавьте рабочий текст или загрузите Word, PDF либо TXT. После обработки создайте практическое задание. Перед вызовом ИИ проверьте доступный баланс.",
    },
    {
      selector: "#results .section-heading",
      title: "Результаты команды",
      description:
        "Откройте разбор ответа: в нём есть баллы по критериям, цитаты из материала, пробелы и рекомендации. Оценка помогает выбрать, кому нужна помощь; окончательные выводы делает руководитель.",
    },
    {
      selector: "#learning .section-heading",
      title: "Ваш результат",
      description:
        "После ответа здесь появятся оценка по критериям, объяснения с цитатами и персональный материал. Начните повторение с отмеченных пробелов и рекомендаций.",
    },
    {
      selector: "#team .section-heading",
      title: "Команда и личные лимиты",
      description:
        "Добавляйте руководителей и сотрудников, выдавайте им доступ и задавайте лимиты. Лимит сотрудника ограничивает его расходы и текущие резервы на операции с ИИ.",
    },
    {
      selector: "#billing .section-heading",
      title: "Баланс и расходы",
      description:
        "Перед операцией ИИ временно резервирует кредиты. После ответа списывается сумма по фактическим токенам и внутреннему тарифу, а остаток возвращается. Демонстрационное пополнение не является реальным платежом.",
    },
  ];
}

export function OnboardingTour({
  userId,
  role,
}: {
  userId: string;
  role: Role;
}) {
  const current = useRef<Driver | null>(null);
  const pending = useRef<number | undefined>(undefined);
  const button = useRef<HTMLButtonElement>(null);
  const seenInSession = useRef(new Set<string>());
  const key = `praktikum:onboarding:v1:${userId}`;

  const start = useCallback(() => {
    if (pending.current !== undefined) window.clearTimeout(pending.current);
    pending.current = undefined;
    current.current?.destroy();
    const steps: DriveStep[] = sections(role).flatMap((step) => {
      const element = document.querySelector(step.selector);
      if (!element || !element.getClientRects().length) return [];
      return [
        {
          element,
          popover: {
            title: step.title,
            description: step.description,
            side: "bottom",
            align: "start",
          },
        },
      ];
    });
    if (!steps.length) return;
    const guide = driver({
      steps,
      animate: !window.matchMedia("(prefers-reduced-motion: reduce)").matches,
      smoothScroll: false,
      scrollIntoView: { block: "center", inline: "nearest" },
      allowClose: true,
      allowKeyboardControl: true,
      disableActiveInteraction: true,
      overlayClickBehavior: "none",
      popoverClass: "praktikum-onboarding",
      stagePadding: 10,
      stageRadius: 12,
      showProgress: true,
      progressText: "{{current}} из {{total}}",
      nextBtnText: "Далее",
      prevBtnText: "Назад",
      doneBtnText: "Готово",
      closeBtnLabel: "Пропустить обучение",
      onPopoverRender(popover) {
        popover.wrapper.setAttribute("role", "dialog");
        popover.wrapper.setAttribute(
          "aria-label",
          "Обучение работе с Практикумом",
        );
        popover.wrapper.setAttribute("data-onboarding-tour", "true");
      },
      onHighlighted(element) {
        element?.setAttribute("data-onboarding-active", "true");
      },
      onDeselected(element) {
        element?.removeAttribute("data-onboarding-active");
      },
      onDestroyed() {
        current.current = null;
        seenInSession.current.add(key);
        try {
          window.localStorage.setItem(key, "seen");
        } catch {
          /* The tour also works when browser storage is unavailable. */
        }
        document
          .querySelectorAll("[data-onboarding-active]")
          .forEach((element) =>
            element.removeAttribute("data-onboarding-active"),
          );
        if (button.current?.isConnected)
          button.current.focus({ preventScroll: true });
      },
    });
    current.current = guide;
    guide.drive();
  }, [key, role]);

  useEffect(() => {
    let seen = seenInSession.current.has(key);
    try {
      seen ||= window.localStorage.getItem(key) === "seen";
    } catch {
      /* Use this mount's state instead. */
    }
    pending.current = seen ? undefined : window.setTimeout(start, 250);
    return () => {
      if (pending.current !== undefined) window.clearTimeout(pending.current);
      pending.current = undefined;
      current.current?.destroy();
    };
  }, [key, start]);

  return (
    <button
      ref={button}
      type="button"
      className="onboarding-replay"
      onClick={start}
      aria-label="Запустить обучение снова"
    >
      <span aria-hidden="true">?</span>Обучение
    </button>
  );
}
