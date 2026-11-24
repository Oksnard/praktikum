import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { api, COOKIE } from "@/lib/api";
import {
  AI_RESERVE_CREDITS,
  criteria as gradingCriteria,
  type Dashboard,
} from "@praktikum/types";
import {
  createMaterial,
  createUser,
  generate,
  setLimit,
  signOut,
  submitAnswer,
  topUp,
} from "@/app/actions";
import { SubmitButton } from "@/app/submit-button";

const roles: Record<string, string> = {
  OWNER: "Владелец",
  MANAGER: "Руководитель",
  EMPLOYEE: "Сотрудник",
  SUPER_ADMIN: "Администратор платформы",
};
const credits = (n: number) => new Intl.NumberFormat("ru-RU").format(n);
const date = (s: string) =>
  new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(s));
const criterionName = (id: string) =>
  gradingCriteria.find((item) => item.id === id)?.label ?? id;

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  if (!(await cookies()).has(COOKIE)) redirect("/login");
  let data: Dashboard;
  try {
    data = await api<Dashboard>("/dashboard");
  } catch {
    redirect("/login");
  }
  const { user } = data;
  const manager = user.role === "OWNER" || user.role === "MANAGER";
  const owner = user.role === "OWNER";
  const { error } = await searchParams;
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a className="brand" href="/dashboard">
          практикум<span>•</span>
        </a>
        <div className="company-chip">
          <span className="company-mark">
            {data.company?.name.slice(0, 1) ?? "П"}
          </span>
          <span>
            {data.company?.name ?? "Практикум"}
            <small>Рабочее пространство</small>
          </span>
          <b>⌄</b>
        </div>
        <nav>
          <p className="nav-label">РАБОЧЕЕ МЕСТО</p>
          <a className="nav-item active" href="#overview">
            <span>◫</span>Обзор
          </a>
          <a className="nav-item" href="#materials">
            <span>▤</span>Материалы <i>{data.materials.length}</i>
          </a>
          <a className="nav-item" href="#learning">
            <span>◎</span>Моё обучение
          </a>
          {manager && (
            <a className="nav-item" href="#team">
              <span>♧</span>Команда
            </a>
          )}
          <a className="nav-item" href="#billing">
            <span>◈</span>Баланс и расходы
          </a>
        </nav>
        <div className="sidebar-bottom">
          <div className="help-card">
            <span className="help-icon">i</span>
            <b>Практикум</b>
            <small>Обучение на материалах вашей компании</small>
          </div>
          <div className="profile">
            <span className="avatar">
              {user.name.slice(0, 1).toUpperCase()}
            </span>
            <span>
              <b>{user.name}</b>
              <small>{roles[user.role]}</small>
            </span>
            <form action={signOut}>
              <button className="icon-button" title="Выйти">
                ↗
              </button>
            </form>
          </div>
        </div>
      </aside>
      <main className="main">
        <header className="topbar">
          <div className="crumb">
            Рабочее место <span>/</span> Обзор
          </div>
          <div className="top-actions">
            <span className="live-pill">
              <i />
              Сервис активен
            </span>
            <span className="top-avatar">
              {user.name.slice(0, 1).toUpperCase()}
            </span>
            <form action={signOut} className="mobile-signout-form">
              <button
                className="mobile-signout"
                type="submit"
                aria-label="Выйти из аккаунта"
              >
                Выйти
              </button>
            </form>
          </div>
        </header>
        <div className="content">
          {error && (
            <div className="action-alert" role="alert">
              <b>Не удалось выполнить действие</b>
              <span>{error}</span>
            </div>
          )}
          <section id="overview" className="welcome">
            <div>
              <p className="eyebrow">
                {new Intl.DateTimeFormat("ru-RU", {
                  weekday: "long",
                  day: "numeric",
                  month: "long",
                }).format(new Date())}
              </p>
              <h1>
                Добро пожаловать, {user.name.split(" ")[0]} <span>✦</span>
              </h1>
              <p className="muted">
                {manager
                  ? "Вот как продвигается обучение команды."
                  : "Здесь собраны ваши материалы и учебные задания."}
              </p>
            </div>
            <span className="welcome-graphic">✳</span>
          </section>
          <section className="stat-grid">
            <article className="stat-card">
              <span className="stat-icon cyan">▤</span>
              <div>
                <small>Материалы</small>
                <strong>{data.materials.length}</strong>
              </div>
              <a href="#materials">Посмотреть →</a>
            </article>
            <article className="stat-card">
              <span className="stat-icon violet">◎</span>
              <div>
                <small>{manager ? "Ответы команды" : "Мои ответы"}</small>
                <strong>{data.attempts.length}</strong>
              </div>
              <a href={manager ? "#results" : "#learning"}>Открыть →</a>
            </article>
            <article className="stat-card">
              <span className="stat-icon gold">◈</span>
              <div>
                <small>Баланс компании</small>
                <strong>
                  {credits(data.company?.balance ?? 0)} <em>кредитов</em>
                </strong>
              </div>
              <a href="#billing">История →</a>
            </article>
          </section>
          {manager && (
            <section className="section" id="results">
              <div className="section-heading">
                <div>
                  <p className="eyebrow">АНАЛИТИКА</p>
                  <h2>Результаты команды</h2>
                </div>
                <span className="soft-tag">{data.attempts.length} ответов</span>
              </div>
              {data.attempts.length ? (
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>СОТРУДНИК</th>
                        <th>РЕЗУЛЬТАТ</th>
                        <th>ПРОБЕЛЫ</th>
                        <th>ОТВЕТ</th>
                        <th>ДАТА</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.attempts.map((a) => (
                        <tr key={a.id}>
                          <td>
                            <div className="person-cell">
                              <span className="mini-avatar">
                                {a.user.name.slice(0, 1)}
                              </span>
                              <span>
                                <b>{a.user.name}</b>
                                <small>{a.user.email}</small>
                              </span>
                            </div>
                          </td>
                          <td>
                            <span
                              className={`score ${a.evaluation.score >= 70 ? "good" : "low"}`}
                            >
                              {a.evaluation.score}
                              <small>/100</small>
                            </span>
                          </td>
                          <td>
                            {a.evaluation.gaps.length ? (
                              <span className="gap-pill">
                                {a.evaluation.gaps.length} тем
                              </span>
                            ) : (
                              <span className="muted">Нет</span>
                            )}
                          </td>
                          <td>
                            <details>
                              <summary>Разбор</summary>
                              <div className="detail-pop">
                                <b>Ответ сотрудника</b>
                                <p>{a.answer}</p>
                                <b>Обратная связь</b>
                                <p>{a.evaluation.feedback}</p>
                                <b>Критерии оценки</b>
                                {a.evaluation.criteria.map((c) => (
                                  <p key={c.id} className="criterion-line">
                                    <strong>{criterionName(c.id)}</strong>:{" "}
                                    {c.score} баллов — {c.explanation}
                                  </p>
                                ))}
                                <b>Пробелы</b>
                                {a.evaluation.gaps.length ? (
                                  <ul>
                                    {a.evaluation.gaps.map((g) => (
                                      <li key={g}>{g}</li>
                                    ))}
                                  </ul>
                                ) : (
                                  <p>Существенных пробелов не выявлено.</p>
                                )}
                                {a.evaluation.unsupported_claims.length > 0 && (
                                  <>
                                    <b>Утверждения без опоры на материал</b>
                                    <ul>
                                      {a.evaluation.unsupported_claims.map(
                                        (claim) => (
                                          <li key={claim}>{claim}</li>
                                        ),
                                      )}
                                    </ul>
                                  </>
                                )}
                                <b>Опора на материал</b>
                                {a.evaluation.evidence.map((e, i) => (
                                  <blockquote key={i}>«{e}»</blockquote>
                                ))}
                                <b>Что подтянуть</b>
                                <ul>
                                  {a.evaluation.recommendations.map((x) => (
                                    <li key={x}>{x}</li>
                                  ))}
                                </ul>
                              </div>
                            </details>
                          </td>
                          <td className="muted">{date(a.createdAt)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <Empty
                  title="Ответов пока нет"
                  text="Когда команда выполнит первые задания, здесь появятся результаты и рекомендации."
                />
              )}
            </section>
          )}
          <section className="section" id="materials">
            <div className="section-heading">
              <div>
                <p className="eyebrow">БАЗА ЗНАНИЙ</p>
                <h2>Материалы и задания</h2>
                <p className="muted">
                  {manager
                    ? "Добавьте рабочий материал — Практикум подготовит практическое задание."
                    : "Изучите материал и выполните практическое задание."}
                </p>
              </div>
            </div>
            {manager && (
              <form action={createMaterial} className="form-panel">
                <div className="form-title">
                  <span className="stat-icon cyan">＋</span>
                  <div>
                    <b>Новый материал</b>
                    <small>
                      Текст инструкции, регламента или описания продукта
                    </small>
                  </div>
                </div>
                <div className="form-row">
                  <label>
                    Название материала
                    <input
                      name="title"
                      minLength={3}
                      maxLength={150}
                      placeholder="Например, Стандарт работы с клиентом"
                      required
                    />
                  </label>
                </div>
                <label>
                  Содержание
                  <textarea
                    name="text"
                    minLength={60}
                    maxLength={12000}
                    rows={5}
                    placeholder="Вставьте текст материала — от 60 до 12 000 символов"
                    required
                  />
                </label>
                <div className="form-footer">
                  <small>До 12 000 символов</small>
                  <SubmitButton pending="Добавляем…">
                    Добавить материал <span>→</span>
                  </SubmitButton>
                </div>
              </form>
            )}
            {data.materials.length ? (
              <div className="material-grid">
                {data.materials.map((m) => {
                  const assignment = data.assignments.find(
                    (a) => a.materialId === m.id,
                  );
                  return (
                    <article className="material-card" key={m.id}>
                      <div className="material-top">
                        <span className="file-icon">▤</span>
                        <span className="soft-tag">Материал</span>
                      </div>
                      <h3>{m.title}</h3>
                      <p className="material-fulltext">{m.text}</p>
                      <div className="material-meta">
                        <span>{date(m.createdAt)}</span>
                        <span>{m.text.length} знаков</span>
                      </div>
                      {assignment ? (
                        <div className="assignment-box">
                          <div>
                            <b>Практическое задание</b>
                            <small>{assignment.content.summary}</small>
                          </div>
                          {user.role === "EMPLOYEE" && (
                            <form
                              action={submitAnswer.bind(null, assignment.id)}
                            >
                              <label className="small">
                                Ваш ответ
                                <textarea
                                  name="answer"
                                  minLength={10}
                                  maxLength={8000}
                                  rows={3}
                                  placeholder="Опишите, как вы поступите в этой ситуации"
                                  required
                                />
                                <small className="question-prompt">
                                  <b>Задание:</b> {assignment.content.question}
                                </small>
                              </label>
                              <SubmitButton
                                className="button primary full"
                                pending="Отправляем и оцениваем…"
                              >
                                Отправить на оценку
                              </SubmitButton>
                            </form>
                          )}
                        </div>
                      ) : (
                        manager && (
                          <form
                            action={generate.bind(null, m.id)}
                            className="generate-row"
                          >
                            <span className="small muted">
                              Подготовим задание по материалу
                            </span>
                            <SubmitButton
                              className="button secondary"
                              pending="Готовим задание…"
                            >
                              Создать задание ✦
                            </SubmitButton>
                          </form>
                        )
                      )}
                    </article>
                  );
                })}
              </div>
            ) : (
              <Empty
                title="Начните с первого материала"
                text="Добавьте инструкцию или регламент, чтобы создать первое практическое задание."
              />
            )}
          </section>
          {!manager && (
            <section className="section" id="learning">
              <div className="section-heading">
                <div>
                  <p className="eyebrow">МОЙ РОСТ</p>
                  <h2>Мои результаты</h2>
                </div>
              </div>
              {data.attempts.length ? (
                <div className="result-grid">
                  {data.attempts.map((a) => (
                    <article className="result-card" key={a.id}>
                      <div className="result-top">
                        <span
                          className={`score ${a.evaluation.score >= 70 ? "good" : "low"}`}
                        >
                          {a.evaluation.score}
                          <small>/100</small>
                        </span>
                        <span className="muted small">{date(a.createdAt)}</span>
                      </div>
                      <h3>{a.assignment.content.summary}</h3>
                      <p>{a.evaluation.feedback}</p>
                      <div className="criteria-breakdown">
                        <b>Критерии оценки</b>
                        {a.evaluation.criteria.map((c) => (
                          <div className="criterion-line" key={c.id}>
                            <strong>{criterionName(c.id)}</strong>
                            <span>{c.score} баллов</span>
                            <small>{c.explanation}</small>
                          </div>
                        ))}
                      </div>
                      {a.evaluation.gaps.length > 0 && (
                        <div className="gap-breakdown">
                          <b>Что стоит подтянуть</b>
                          <ul>
                            {a.evaluation.gaps.map((g) => (
                              <li key={g}>{g}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                      {a.evaluation.unsupported_claims.length > 0 && (
                        <div className="gap-breakdown">
                          <b>Что не подтвердилось в материале</b>
                          <ul>
                            {a.evaluation.unsupported_claims.map((claim) => (
                              <li key={claim}>{claim}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                      <div className="result-evidence">
                        <b>Почему такая оценка</b>
                        {a.evaluation.evidence.map((e, i) => (
                          <blockquote key={i}>«{e}»</blockquote>
                        ))}
                      </div>
                      <div className="recommendation">
                        <b>Ваш следующий шаг</b>
                        <ul>
                          {a.evaluation.recommendations.map((x) => (
                            <li key={x}>{x}</li>
                          ))}
                        </ul>
                        <p>{a.evaluation.personal_material}</p>
                      </div>
                    </article>
                  ))}
                </div>
              ) : (
                <Empty
                  title="Ваш прогресс начнётся здесь"
                  text="Выполните задание из материалов компании — результат и персональные рекомендации появятся в этом разделе."
                />
              )}
            </section>
          )}
          {owner && (
            <section className="section" id="team">
              <div className="section-heading">
                <div>
                  <p className="eyebrow">УПРАВЛЕНИЕ ДОСТУПОМ</p>
                  <h2>Команда</h2>
                  <p className="muted">
                    Добавляйте руководителей и сотрудников, задавайте личный
                    лимит.
                  </p>
                </div>
                <span className="soft-tag">{data.users.length} участников</span>
              </div>
              <form action={createUser} className="form-panel compact">
                <div className="form-title">
                  <span className="stat-icon violet">＋</span>
                  <div>
                    <b>Добавить участника</b>
                    <small>Выберите роль и начальный лимит AI-операций</small>
                  </div>
                </div>
                <div className="user-form-grid">
                  <label>
                    Имя
                    <input name="name" minLength={2} required />
                  </label>
                  <label>
                    Email
                    <input name="email" type="email" required />
                  </label>
                  <label>
                    Пароль
                    <input
                      name="password"
                      type="password"
                      minLength={10}
                      required
                    />
                  </label>
                  <label>
                    Роль
                    <select name="role">
                      <option value="EMPLOYEE">Сотрудник</option>
                      <option value="MANAGER">Руководитель</option>
                    </select>
                  </label>
                  <label>
                    Лимит, кредитов
                    <input
                      name="limit"
                      type="number"
                      min={0}
                      defaultValue={AI_RESERVE_CREDITS}
                      required
                    />
                  </label>
                  <SubmitButton pending="Добавляем…">
                    Добавить в команду
                  </SubmitButton>
                </div>
              </form>
              {data.users.length > 0 && (
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>УЧАСТНИК</th>
                        <th>РОЛЬ</th>
                        <th>ПОТРАТИЛ</th>
                        <th>ЛИЧНЫЙ ЛИМИТ</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {data.users.map((u) => (
                        <tr key={u.id}>
                          <td>
                            <div className="person-cell">
                              <span className="mini-avatar">
                                {u.name.slice(0, 1)}
                              </span>
                              <span>
                                <b>{u.name}</b>
                                <small>{u.email}</small>
                              </span>
                            </div>
                          </td>
                          <td>{roles[u.role]}</td>
                          <td>{credits(u.spent)}</td>
                          <td>
                            <form
                              action={setLimit.bind(null, u.id)}
                              className="inline-form"
                            >
                              <input
                                name="limit"
                                type="number"
                                min={0}
                                defaultValue={u.limit}
                              />
                              <SubmitButton
                                className="button small-button"
                                pending="…"
                              >
                                Сохранить
                              </SubmitButton>
                            </form>
                          </td>
                          <td />
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          )}
          <section className="section" id="billing">
            <div className="section-heading">
              <div>
                <p className="eyebrow">ФИНАНСЫ</p>
                <h2>Баланс и расходы</h2>
                <p className="muted">
                  Баланс общий для компании. Списание учитывает фактическое
                  использование ИИ.
                </p>
              </div>
              <div className="balance-summary">
                <div className="balance-total">
                  <small>Баланс компании</small>
                  <b>
                    {credits(data.company?.balance ?? 0)} <em>кредитов</em>
                  </b>
                </div>
                {user.role === "EMPLOYEE" && (
                  <div className="balance-total personal-limit">
                    <small>
                      Ваш лимит · использовано {credits(user.spent)}
                    </small>
                    <b>
                      {credits(Math.max(0, user.limit - user.spent))}{" "}
                      <em>кредитов доступно</em>
                    </b>
                  </div>
                )}
              </div>
            </div>
            {owner && (
              <form action={topUp} className="topup-banner">
                <div>
                  <span className="topup-spark">✦</span>
                  <div>
                    <b>Пополнить баланс</b>
                    <p>Демо-операция: средства будут зачислены сразу.</p>
                  </div>
                  <span className="demo-tag">DEMO</span>
                </div>
                <div className="topup-controls">
                  <label className="sr-only" htmlFor="topup-amount">
                    Сумма пополнения
                  </label>
                  <input
                    id="topup-amount"
                    name="amount"
                    type="number"
                    min={1000}
                    max={10000000}
                    step={1000}
                    defaultValue={AI_RESERVE_CREDITS}
                    required
                  />
                  <span>кредитов</span>
                  <SubmitButton className="button dark" pending="Зачисляем…">
                    Пополнить баланс →
                  </SubmitButton>
                </div>
              </form>
            )}
            <div className="billing-grid">
              <div className="table-wrap">
                <div className="table-caption">
                  <b>История операций</b>
                  <span className="small muted">Все движения по счёту</span>
                </div>
                {data.transactions.length ? (
                  <table>
                    <thead>
                      <tr>
                        <th>ОПЕРАЦИЯ</th>
                        <th>ДАТА</th>
                        <th>СУММА</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.transactions.map((t) => (
                        <tr key={t.id}>
                          <td>
                            <span className="transaction-kind">◈</span>
                            {t.kind === "DEMO_SEED"
                              ? "Демонстрационный стартовый баланс"
                              : t.kind === "MOCKED"
                                ? "Пополнение (Demo)"
                                : t.kind === "RESERVE"
                                  ? "Резерв AI"
                                  : t.kind === "AI_SETTLEMENT"
                                    ? "Расчёт AI"
                                    : t.kind}
                            {t.kind === "MOCKED" && (
                              <span className="demo-tag">DEMO</span>
                            )}
                          </td>
                          <td className="muted">{date(t.createdAt)}</td>
                          <td
                            className={
                              t.amount > 0
                                ? "amount-positive"
                                : "amount-negative"
                            }
                          >
                            {t.amount > 0 ? "+" : ""}
                            {credits(t.amount)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <div className="empty-inline">Операций пока нет</div>
                )}
              </div>
              <div className="usage-card">
                <p className="eyebrow">РАСХОДЫ НА ИИ</p>
                <b>Последние операции</b>
                {data.operations.length ? (
                  data.operations.slice(0, 5).map((o) => (
                    <div className="usage-row" key={o.id}>
                      <span>
                        <i className="usage-dot" />
                        {o.status === "SUCCESS" ? "Завершено" : o.status}
                      </span>
                      <b>−{credits(o.cost)}</b>
                    </div>
                  ))
                ) : (
                  <p className="muted small">
                    После первого задания здесь появятся расходы.
                  </p>
                )}
                <div className="usage-note">
                  Сумма рассчитывается по фактическому использованию модели. До
                  запуска резервируется не более {credits(AI_RESERVE_CREDITS)}{" "}
                  кредитов.
                </div>
              </div>
            </div>
          </section>
          <footer className="footer">
            <span>
              Практикум{" "}
              <span className="muted">· Учимся на своих материалах</span>
            </span>
            <span>Обучение на материалах вашей компании</span>
          </footer>
        </div>
      </main>
    </div>
  );
}
function Empty({ title, text }: { title: string; text: string }) {
  return (
    <div className="empty-state">
      <span className="empty-icon">✳</span>
      <b>{title}</b>
      <p>{text}</p>
    </div>
  );
}
