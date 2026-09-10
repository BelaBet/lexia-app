import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import { RootErrorBoundary } from "./components/RootErrorBoundary";
import "./index.css";

const isChunkLoadError = (value: unknown) => {
  const message = value instanceof Error ? value.message : String(value ?? "");
  return /Loading chunk|ChunkLoadError|Failed to fetch dynamically imported module|Importing a module script failed/i.test(message);
};

const reloadOnceForFreshAssets = () => {
  try {
    const key = "lexia_chunk_reload_once";
    if (sessionStorage.getItem(key) === "1") return;
    sessionStorage.setItem(key, "1");
  } catch {
    // If storage is unavailable, avoid forcing a reload loop.
    return;
  }

  const url = new URL(window.location.href);
  url.searchParams.set("_lexia_refresh", Date.now().toString());
  window.location.replace(url.toString());
};

window.addEventListener("error", (event) => {
  if (isChunkLoadError(event.error ?? event.message)) reloadOnceForFreshAssets();
});

window.addEventListener("unhandledrejection", (event) => {
  if (isChunkLoadError(event.reason)) reloadOnceForFreshAssets();
});

const root = document.getElementById("root");
if (!root) {
  document.body.innerHTML = '<main style="padding:24px;font-family:system-ui">A LEXIA não conseguiu iniciar. Recarregue a página.</main>';
} else {
  createRoot(root).render(
    <RootErrorBoundary>
      <App />
    </RootErrorBoundary>,
  );
}
