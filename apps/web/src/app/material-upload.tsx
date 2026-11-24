"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
export function MaterialUpload() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [fileName, setFileName] = useState("");
  return (
    <form
      className="material-form form-panel"
      aria-busy={pending}
      onSubmit={async (event) => {
        event.preventDefault();
        const form = event.currentTarget;
        const body = new FormData(form);
        const file = body.get("file");
        if (
          !(file instanceof File) ||
          !file.size ||
          file.size > 5 * 1024 * 1024
        ) {
          setError("Выберите файл размером до 5 МиБ");
          return;
        }
        setPending(true);
        setError("");
        try {
          const response = await fetch("/api/materials/upload", {
            method: "POST",
            body,
          });
          const result = (await response.json()) as {
            message?: string | string[];
          };
          if (!response.ok)
            throw new Error(
              Array.isArray(result.message)
                ? result.message.join(", ")
                : (result.message ?? "Не удалось загрузить файл"),
            );
          form.reset();
          setFileName("");
          router.refresh();
        } catch (reason) {
          setError(
            reason instanceof Error
              ? reason.message
              : "Не удалось загрузить файл",
          );
        } finally {
          setPending(false);
        }
      }}
    >
      <h3>Прикрепить документ</h3>
      <label>
        Название документа
        <input
          name="title"
          disabled={pending}
          minLength={3}
          maxLength={150}
          placeholder="Например, Стандарт работы с клиентами"
          required
        />
      </label>
      <label>
        Файл материала
        <input
          className="material-file-input"
          type="file"
          disabled={pending}
          name="file"
          accept=".docx,.doc,.pdf,.txt"
          aria-describedby="material-file-hint"
          onChange={(event) => {
            setFileName(event.currentTarget.files?.[0]?.name ?? "");
            setError("");
          }}
          required
        />
      </label>
      {fileName && (
        <p className="material-file-selected">Выбран файл: {fileName}</p>
      )}
      <p id="material-file-hint" className="material-upload-hint muted small">
        Word, PDF с текстовым слоем или TXT, до 5 МиБ. Извлечённый текст: от 60
        до 12 000 символов. Сканам нужно предварительное OCR. Оригинал
        сохранится для скачивания.
      </p>
      {error && (
        <p className="material-upload-error" role="alert">
          {error}
        </p>
      )}
      <button
        className="button primary material-upload-submit"
        disabled={pending}
      >
        {pending ? "Извлекаем текст…" : "Загрузить документ"}
      </button>
    </form>
  );
}
