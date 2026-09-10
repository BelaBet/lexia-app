import React from "react";

type State = { hasError: boolean; message?: string };

export class RootErrorBoundary extends React.Component<React.PropsWithChildren, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(error: unknown): State {
    return {
      hasError: true,
      message: error instanceof Error ? error.message : "Erro inesperado na aplicação",
    };
  }

  componentDidCatch(error: unknown, info: React.ErrorInfo) {
    console.error("[LEXIA] erro de renderização", error, info);
  }

  private handleReload = () => {
    try {
      localStorage.removeItem("lexia_last_tab");
      sessionStorage.removeItem("lexia_chunk_reload_once");
    } catch {
      // ignore storage errors
    }
    window.location.href = "/";
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 24, background: "#fff" }}>
        <section style={{ width: "100%", maxWidth: 520, border: "1px solid #e5e7eb", borderRadius: 16, padding: 24, boxShadow: "0 10px 30px rgba(0,0,0,.06)" }}>
          <h1 style={{ margin: 0, fontSize: 22 }}>A LEXIA encontrou um erro nesta tela</h1>
          <p style={{ marginTop: 12, color: "#4b5563", lineHeight: 1.5 }}>
            A aplicação continua protegida. Recarregue para voltar ao painel sem repetir nenhuma consulta automaticamente.
          </p>
          {this.state.message && (
            <pre style={{ whiteSpace: "pre-wrap", wordBreak: "break-word", background: "#f9fafb", padding: 12, borderRadius: 10, fontSize: 12 }}>
              {this.state.message}
            </pre>
          )}
          <button onClick={this.handleReload} style={{ marginTop: 12, border: 0, borderRadius: 10, padding: "10px 16px", cursor: "pointer", background: "#111827", color: "#fff", fontWeight: 600 }}>
            Voltar para a LEXIA
          </button>
        </section>
      </main>
    );
  }
}
