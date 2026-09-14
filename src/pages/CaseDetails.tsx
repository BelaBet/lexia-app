import { useQuery } from "@tanstack/react-query";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { JusbrasilCaseDetails } from "@/components/cases/JusbrasilCaseDetails";
import { Button } from "@/components/ui/button";

export default function CaseDetails() {
  const { caseId } = useParams();
  const navigate = useNavigate();

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
      return data as any;
    },
  });

  if (isLoading) {
    return <div className="min-h-screen bg-background p-6"><p className="text-sm text-muted-foreground">Carregando processo...</p></div>;
  }

  if (isError || !caseItem) {
    return (
      <div className="min-h-screen bg-background p-6">
        <Button variant="outline" onClick={() => navigate(-1)}><ArrowLeft className="mr-2 h-4 w-4" />Voltar</Button>
        <div className="mt-6 rounded-lg border p-6"><h1 className="text-xl font-semibold">Processo não encontrado</h1></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <main className="mx-auto w-full max-w-[1220px] p-4 pb-10 md:p-8">
        <div className="mb-6">
          <Button variant="ghost" onClick={() => navigate(-1)} className="-ml-3">
            <ArrowLeft className="mr-2 h-4 w-4" />Voltar para Processos
          </Button>
        </div>
        <JusbrasilCaseDetails caseId={caseItem.id} />
      </main>
    </div>
  );
}
