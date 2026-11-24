import Link from "next/link";
import { signIn } from "@/app/actions";
import { SubmitButton } from "@/app/submit-button";
export default async function LoginPage({
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
          <p className="eyebrow">ОБУЧЕНИЕ, КОТОРОЕ РАБОТАЕТ</p>
          <h1>
            Сильная команда
            <br />
            начинается с практики.
          </h1>
          <p className="muted">
            Превращайте рабочие знания в уверенные действия.
          </p>
        </div>
        <p className="small muted">Рабочее пространство вашей команды</p>
      </div>
      <section className="auth-card">
        <p className="eyebrow">С ВОЗВРАЩЕНИЕМ</p>
        <h2>Войти в Практикум</h2>
        <p className="muted">Продолжите обучение там, где остановились.</p>
        <form action={signIn} className="stack">
          {error && (
            <div className="action-alert" role="alert">
              {error}
            </div>
          )}
          <label>
            Email
            <input name="email" type="email" autoComplete="email" required />
          </label>
          <label>
            Пароль
            <input
              name="password"
              type="password"
              minLength={10}
              autoComplete="current-password"
              required
            />
          </label>
          <SubmitButton pending="Входим…">
            Войти <span>→</span>
          </SubmitButton>
        </form>
        <p className="small centered">
          Впервые здесь? <Link href="/register">Создать компанию</Link>
        </p>
        <p className="small hint">
          Демо пополнение в рабочем пространстве отмечено отдельно.
        </p>
      </section>
    </main>
  );
}
