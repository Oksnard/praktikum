import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { api, COOKIE } from "@/lib/api";
import { signOut } from "@/app/actions";

type Ledger = {
  companies: { id: string; name: string; balance: number }[];
  transactions: {
    id: string;
    amount: number;
    kind: string;
    createdAt: string;
    companyId: string;
    userId: string | null;
  }[];
  operations: {
    id: string;
    status: string;
    cost: number;
    reserved: number;
    createdAt: string;
    companyId: string;
  }[];
  calls: {
    id: string;
    model: string;
    promptTokens: number;
    completionTokens: number;
    cost: number;
    latencyMs: number;
    validationStatus: string;
    createdAt: string;
    companyId: string;
  }[];
};
const fmt = (x: number) => new Intl.NumberFormat("ru-RU").format(x);
const when = (x: string) =>
  new Intl.DateTimeFormat("ru-RU", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(x));
export default async function AdminPage() {
  if (!(await cookies()).has(COOKIE)) redirect("/login");
  let ledger: Ledger;
  try {
    ledger = await api<Ledger>("/admin/ledger");
  } catch {
    redirect("/login");
  }
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a className="brand" href="/admin">
          практикум<span>•</span>
        </a>
        <div className="company-chip">
          <span className="company-mark">П</span>
          <span>
            Платформа<small>Панель администратора</small>
          </span>
        </div>
        <nav>
          <p className="nav-label">ПЛАТФОРМА</p>
          <a className="nav-item active" href="#admin-overview">
            <span>◈</span>Движение средств
          </a>
        </nav>
        <div className="sidebar-bottom">
          <div className="help-card">
            <span className="help-icon">?</span>
            <b>Панель платформы</b>
            <small>Сводный учёт компаний и AI</small>
          </div>
          <div className="profile">
            <span className="avatar">A</span>
            <span>
              <b>Администратор</b>
              <small>SUPER_ADMIN</small>
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
            Платформа <span>/</span> Движение средств
          </div>
          <span className="live-pill">
            <i />
            Сводные данные
          </span>
        </header>
        <div className="content" id="admin-overview">
          <section className="welcome">
            <div>
              <p className="eyebrow">КОНТРОЛЬ ПЛАТФОРМЫ</p>
              <h1>Общий обзор</h1>
              <p className="muted">
                Баланс компаний, движение кредитов и использование AI.
              </p>
            </div>
          </section>
          <section className="stat-grid">
            <article className="stat-card">
              <span className="stat-icon cyan">♧</span>
              <div>
                <small>Компании</small>
                <strong>{ledger.companies.length}</strong>
              </div>
            </article>
            <article className="stat-card">
              <span className="stat-icon violet">◎</span>
              <div>
                <small>AI операции</small>
                <strong>{ledger.operations.length}</strong>
              </div>
            </article>
            <article className="stat-card">
              <span className="stat-icon gold">◈</span>
              <div>
                <small>Расход AI</small>
                <strong>
                  {fmt(ledger.operations.reduce((n, o) => n + o.cost, 0))}{" "}
                  <em>кредитов</em>
                </strong>
              </div>
            </article>
          </section>
          <section className="section">
            <div className="section-heading">
              <div>
                <p className="eyebrow">ОРГАНИЗАЦИИ</p>
                <h2>Компании и балансы</h2>
              </div>
            </div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>КОМПАНИЯ</th>
                    <th>ID</th>
                    <th>БАЛАНС</th>
                  </tr>
                </thead>
                <tbody>
                  {ledger.companies.map((c) => (
                    <tr key={c.id}>
                      <td>
                        <b>{c.name}</b>
                      </td>
                      <td className="muted">{c.id}</td>
                      <td>
                        <b>{fmt(c.balance)}</b> кредитов
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
          <section className="section">
            <div className="section-heading">
              <div>
                <p className="eyebrow">ФИНАНСОВЫЙ АУДИТ</p>
                <h2>Движение кредитов</h2>
              </div>
            </div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>ТИП</th>
                    <th>КОМПАНИЯ</th>
                    <th>ДАТА</th>
                    <th>СУММА</th>
                  </tr>
                </thead>
                <tbody>
                  {ledger.transactions.map((t) => (
                    <tr key={t.id}>
                      <td>
                        {t.kind === "DEMO_SEED"
                          ? "Демонстрационный стартовый баланс"
                          : t.kind}
                        {(t.kind === "MOCKED" || t.kind === "DEMO_SEED") && (
                          <span className="demo-tag">DEMO</span>
                        )}
                      </td>
                      <td>
                        {ledger.companies.find((c) => c.id === t.companyId)
                          ?.name ?? t.companyId}
                      </td>
                      <td className="muted">{when(t.createdAt)}</td>
                      <td
                        className={
                          t.amount >= 0 ? "amount-positive" : "amount-negative"
                        }
                      >
                        {t.amount > 0 ? "+" : ""}
                        {fmt(t.amount)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
          <section className="section">
            <div className="section-heading">
              <div>
                <p className="eyebrow">AI AUDIT</p>
                <h2>Операции и стоимость</h2>
              </div>
            </div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>СТАТУС</th>
                    <th>КОМПАНИЯ</th>
                    <th>РЕЗЕРВ</th>
                    <th>СПИСАНО ПО ТАРИФУ</th>
                    <th>ДАТА</th>
                  </tr>
                </thead>
                <tbody>
                  {ledger.operations.map((o) => (
                    <tr key={o.id}>
                      <td>
                        <span
                          className={`score ${o.status === "SUCCESS" ? "good" : "low"}`}
                        >
                          {o.status}
                        </span>
                      </td>
                      <td>
                        {ledger.companies.find((c) => c.id === o.companyId)
                          ?.name ?? o.companyId}
                      </td>
                      <td>{fmt(o.reserved)}</td>
                      <td>
                        {o.status === "UNKNOWN" || o.status === "PENDING"
                          ? "Уточняется"
                          : fmt(o.cost)}
                      </td>
                      <td className="muted">{when(o.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="small muted">
              AI вызовов в журнале: {ledger.calls.length}. Стоимость
              рассчитывается по фактическим токенам и внутреннему тарифу,
              который может отличаться от счёта провайдера. Для UNKNOWN и
              PENDING итоговая сумма ещё не известна.
            </p>
          </section>
          <footer className="footer">
            <span>Практикум · панель администратора</span>
            <span>Платёжный провайдер помечен Demo в журнале.</span>
          </footer>
        </div>
      </main>
    </div>
  );
}
