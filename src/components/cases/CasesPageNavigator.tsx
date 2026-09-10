import type { MouseEvent } from "react";
import { useNavigate } from "react-router-dom";
import { CasesManager } from "@/components/cases/CasesManager";
import { useCases } from "@/hooks/useCases";

interface CasesPageNavigatorProps {
  onTabChange?: (tab: string) => void;
}

/**
 * Mantém o CasesManager intacto, mas transforma o clique no card de processo
 * em navegação para a página completa /processos/:caseId.
 * Botões internos do card (menu, portal, integrações) continuam funcionando.
 */
export function CasesPageNavigator({ onTabChange }: CasesPageNavigatorProps) {
  const navigate = useNavigate();
  const { data: cases = [] } = useCases();

  const handleClickCapture = (event: MouseEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement | null;
    if (!target) return;

    // Não intercepta ações próprias existentes dentro do card.
    if (target.closest("button, a, [role='menuitem'], [data-radix-collection-item]")) return;

    const card = target.closest(".document-card");
    if (!card) return;

    const cardText = card.textContent || "";
    const selected = cases.find((item) => item.case_number && cardText.includes(item.case_number));
    if (!selected) return;

    // Impede o onClick legado do card de abrir o modal antigo.
    event.stopPropagation();
    navigate(`/processos/${selected.id}`);
  };

  return (
    <div onClickCapture={handleClickCapture}>
      <CasesManager onTabChange={onTabChange} />
    </div>
  );
}
