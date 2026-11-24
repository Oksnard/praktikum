import type { Metadata } from "next";
import "./style.css";

export const metadata: Metadata = {
  title: "Практикум — обучение команды",
  description: "Обучение сотрудников на материалах вашей компании",
};
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ru">
      <body>{children}</body>
    </html>
  );
}
