import { Component, type ReactNode } from "react";

export class AppErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    if (!this.state.failed) return this.props.children;
    return <main className="application-recovery">
      <section className="card" aria-labelledby="application-recovery-title" role="alert">
        <h1 id="application-recovery-title">Не вдалося відкрити застосунок</h1>
        <p>Перезавантажте сторінку, щоб спробувати ще раз. Збережені проєкти залишаються у вашому кабінеті.</p>
        <button type="button" className="primary" onClick={() => window.location.reload()}>Перезавантажити сторінку</button>
      </section>
    </main>;
  }
}
