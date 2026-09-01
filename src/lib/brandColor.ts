// Converte uma cor hex (#RRGGBB) escolhida pelo administrador em variáveis
// CSS no formato "H S% L%" usadas pelo design system (Tailwind + shadcn).
// Assim, quem revender o sistema troca as cores sem precisar mexer em CSS.

function hexToHsl(hex: string): { h: number; s: number; l: number } | null {
  const clean = hex.trim().replace(/^#/, "");
  if (!/^[0-9a-fA-F]{6}$/.test(clean)) return null;

  const r = parseInt(clean.slice(0, 2), 16) / 255;
  const g = parseInt(clean.slice(2, 4), 16) / 255;
  const b = parseInt(clean.slice(4, 6), 16) / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r:
        h = (g - b) / d + (g < b ? 6 : 0);
        break;
      case g:
        h = (b - r) / d + 2;
        break;
      default:
        h = (r - g) / d + 4;
    }
    h /= 6;
  }

  return { h: Math.round(h * 360), s: Math.round(s * 100), l: Math.round(l * 100) };
}

function hslString(h: number, s: number, l: number): string {
  const clampedL = Math.min(95, Math.max(5, l));
  return `${h} ${s}% ${clampedL}%`;
}

/**
 * Aplica as cores da marca (hex) como variáveis CSS no elemento raiz.
 * Mantém a mesma "matiz" (tom) escolhida, mas gera automaticamente as
 * variações mais claras/escuras que o sistema usa (fundo do menu, bordas,
 * texto de contraste etc.), para que qualquer cor escolhida funcione bem.
 */
export function applyBrandColors(primaryHex: string, sidebarHex: string) {
  const primary = hexToHsl(primaryHex);
  const sidebar = hexToHsl(sidebarHex);
  const root = document.documentElement.style;

  if (primary) {
    const { h, s, l } = primary;
    root.setProperty("--primary", hslString(h, s, l));
    root.setProperty("--ring", hslString(h, s, l));
    root.setProperty("--sidebar-primary", hslString(h, s, l));
    root.setProperty("--sidebar-ring", hslString(h, s, l));
  }

  if (sidebar) {
    const { h, s, l } = sidebar;
    const isDark = l < 50;
    root.setProperty("--sidebar-background", hslString(h, s, l));
    root.setProperty("--sidebar-foreground", isDark ? "40 40% 95%" : "222 47% 11%");
    root.setProperty("--sidebar-accent", hslString(h, Math.max(s - 10, 0), isDark ? l + 8 : l - 8));
    root.setProperty("--sidebar-accent-foreground", isDark ? "40 40% 95%" : "222 47% 11%");
    root.setProperty("--sidebar-border", hslString(h, Math.max(s - 15, 0), isDark ? l + 11 : l - 11));
  }
}
