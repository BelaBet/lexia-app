import { useEffect } from "react";
import { useWhiteLabelSettings, DEFAULT_BRANDING } from "@/hooks/useWhiteLabelSettings";
import { useCompanyBranding } from "@/hooks/useCompanies";
import { useAuth } from "@/contexts/AuthContext";
import { applyBrandColors } from "@/lib/brandColor";

/**
 * Aplica a marca (nome na aba do navegador + cores) em toda a aplicação,
 * assim que a configuração de white label é carregada. Não renderiza nada
 * visível — só efeitos colaterais globais.
 *
 * Sem domínio próprio por empresa (ainda): antes do login usa sempre a
 * marca global (`white_label_settings`); depois do login, se o usuário
 * pertence a uma empresa com marca própria (`whitelabel_companies`), ela
 * tem prioridade.
 */
export function BrandingProvider({ children }: { children: React.ReactNode }) {
  const { data: settings } = useWhiteLabelSettings();
  const { profile } = useAuth();
  const { data: companyBranding } = useCompanyBranding(profile?.company_id);

  useEffect(() => {
    const brandName = companyBranding?.name || settings?.brand_name || DEFAULT_BRANDING.brand_name;
    document.title = brandName;

    applyBrandColors(
      companyBranding?.primary_color || settings?.primary_color || DEFAULT_BRANDING.primary_color,
      companyBranding?.secondary_color || settings?.sidebar_color || DEFAULT_BRANDING.sidebar_color
    );
  }, [settings, companyBranding]);

  return <>{children}</>;
}
