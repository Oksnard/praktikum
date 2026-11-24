import Link from "next/link";
import { register } from "@/app/actions";
import { SubmitButton } from "@/app/submit-button";
export default async function RegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  return (
    <main className="auth-shell">
      <div className="auth-art">
        <a className="brand" href="/">
          практикум<span>•</span>
        </a>
        <div>
          <p className="eyebrow">СТАРТ КОМАНДЫ</p>
          <h1>
            Знания компании.
            <br />
            Рост каждого.
          </h1>
          <p className="muted">
            Создайте пространство и добавьте первый материал.
          </p>
        </div>
        <p className="small muted">Для команд, которые делятся опытом</p>
      </div>
      <section className="auth-card">
        <p className="eyebrow">НОВАЯ КОМПАНИЯ</p>
        <h2>Создать пространство</h2>
        <p className="muted">
          Владелец компании получит доступ к настройкам и балансу.
        </p>
        <form action={register} className="stack">
          {error && (
            <div className="action-alert" role="alert">
              {error}
            </div>
          )}
          <label>
            Ваше имя
            <input name="name" minLength={2} autoComplete="name" required />
          </label>
          <label>
            Название компании
            <input name="companyName" minLength={2} required />
          </label>
          <label>
            Рабочий email
            <input name="email" type="email" autoComplete="email" required />
          </label>
          <label>
            Пароль
            <input
              name="password"
              type="password"
              minLength={10}
              autoComplete="new-password"
              required
            />
            <small>Не менее 10 символов</small>
          </label>
          <SubmitButton pending="Создаём пространство…">
            Создать компанию <span>→</span>
          </SubmitButton>
        </form>
        <p className="small centered">
          Уже зарегистрированы? <Link href="/login">Войти</Link>
        </p>
      </section>
    </main>
  );
}
