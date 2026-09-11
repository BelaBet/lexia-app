import { ProcessPortfolio } from "@/components/cases/ProcessPortfolio";

interface CasesPageNavigatorProps {
  onTabChange?: (tab: string) => void;
}

/**
 * Tela principal de Processos organizada por pesquisa/cliente:
 * pesquisa -> lista completa de processos -> detalhes individuais.
 */
export function CasesPageNavigator(_props: CasesPageNavigatorProps) {
  return <ProcessPortfolio />;
}
