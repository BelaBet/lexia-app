import { useQuery } from "@tanstack/react-query";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { JusbrasilCaseDetails } from "@/components/cases/JusbrasilCaseDetails";
import { Button } from "@/components/ui/button";

export default function CaseDetails() {
  const { caseId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  // A troca de abas em "/" é só estado local (não muda a URL), então
  // navigate(-1) sempre voltava para o Dashboard, a aba padrão do primeiro
  // carregamento — em vez de para a aba (ex.: Processos) de onde o usuário
  // realmente veio. handleOpenCase/navegações para esta página guardam essa
  // aba em location.state.from; usamos ela para voltar ao lugar certo.
  const fromTab = (location.state as { from?: string } | null)?.from;
  const goBack = () => {
    if (fromTab) navigate("/", { state: { activeTab: fromTab } });
    else navigate(-1);
  };

  const { data: caseItem, isLoading, isError } = useQuery({
    queryKey: ["case-details-page", caseId],
    enabled: Boolean(caseId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cases")
        .select("id,case_number,title,status")
        .eq("id", caseId as string)
        .single();
      if (error) throw error;
      return data;
    },
  });

  if (isLoading) {
    return <div className="min-h-screen bg-background p-6"><p className="text-sm text-muted-foreground">Carregando processo...</p></div>;
  }

  if (isError || !caseItem) {
    return (
      <div className="min-h-screen bg-background p-6">
        <Button variant="outline" onClick={goBack}><ArrowLeft className="mr-2 h-4 w-4" />Voltar</Button>
        <div className="mt-6 rounded-lg border p-6"><h1 className="text-xl font-semibold">Processo não encontrado</h1></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <main className="mx-auto w-full max-w-[1220px] p-4 pb-10 md:p-8">
        <div className="mb-6">
          <Button variant="ghost" onClick={goBack} className="-ml-3">
            <ArrowLeft className="mr-2 h-4 w-4" />Voltar para Processos
          </Button>
        </div>
        <JusbrasilCaseDetails caseId={caseItem.id} />
      </main>
    </div>
  );
}
