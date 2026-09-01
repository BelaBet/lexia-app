import { useEffect } from "react";
import { useWhiteLabelSettings, DEFAULT_BRANDING } from "@/hooks/useWhiteLabelSettings";
import { applyBrandColors } from "@/lib/brandColor";

/**
 * Aplica a marca (nome na aba do navegador + cores) em toda a aplicação,
 * assim que a configuração de white label é carregada. Não renderiza nada
 * visível — só efeitos colaterais globais.
 */
export function BrandingProvider({ children }: { children: React.ReactNode }) {
  const { data: settings } = useWhiteLabelSettings();

  useEffect(() => {
    const brandName = settings?.brand_name || DEFAULT_BRANDING.brand_name;
    document.title = brandName;

    applyBrandColors(
      settings?.primary_color || DEFAULT_BRANDING.primary_color,
      settings?.sidebar_color || DEFAULT_BRANDING.sidebar_color
    );
  }, [settings]);

  return <>{children}</>;
}
