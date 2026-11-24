"use client";
export default function AuthError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="error-page">
      <div className="card">
        <span className="status-dot bad" />
        <h2>Не удалось выполнить действие</h2>
        <p>{error.message || "Проверьте данные и доступность сервиса."}</p>
        <button className="button secondary" onClick={reset}>
          Попробовать снова
        </button>
      </div>
    </main>
  );
}
