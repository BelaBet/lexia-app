// Aplica a preferência de tema (claro/escuro/sistema) alternando a classe
// "dark" na raiz do documento — o design system já tem as variáveis CSS
// para os dois temas (ver .dark em src/index.css) e o Tailwind está
// configurado com darkMode: ["class"]; só faltava algo chamando isto.
import type { ThemePreference } from "@/hooks/useUserSettings";

export function applyTheme(theme: ThemePreference): void {
  const root = document.documentElement;
  const isDark = theme === "dark" || (theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  root.classList.toggle("dark", isDark);
}
