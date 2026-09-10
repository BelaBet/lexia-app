import { useQuery } from "@tanstack/react-query";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Calendar, FileText, Gavel, Landmark, Scale, User } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { JusbrasilCaseDetails } from "@/components/cases/JusbrasilCaseDetails";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

const statusLabels: Record<string, string> = {
  active: "Ativo",
  pending: "Pendente",
  closed: "Encerrado",
};

export default function CaseDetails() {
  const { caseId } = useParams();
  const navigate = useNavigate();

  const { data: caseItem, isLoading, isError } = useQuery({
    queryKey: ["case-details-page", caseId],
    enabled: Boolean(caseId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cases")
        .select("*")
        .eq("id", caseId as string)
        .single();
      if (error) throw error;
      return data as any;
    },
  });

  const { data: documents = [] } = useQuery({
    queryKey: ["case-documents-page", caseId],
    enabled: Boolean(caseId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("documents")
        .select("id,title,type,status,created_at,updated_at,case_id")
        .eq("case_id", caseId as string)
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const currency = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
  const fmtDate = (value?: string | null) => value ? new Date(value).toLocaleDateString("pt-BR") : "—";

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
      <main className="mx-auto w-full max-w-7xl space-y-6 p-4 md:p-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <Button variant="outline" onClick={() => navigate(-1)} className="w-fit">
            <ArrowLeft className="mr-2 h-4 w-4" />Voltar para Processos
          </Button>
          <Badge variant="secondary">{statusLabels[caseItem.status] || caseItem.status}</Badge>
        </div>

        <section className="rounded-xl border bg-card p-5 md:p-6">
          <div className="flex flex-col gap-2">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Processo</p>
            <h1 className="font-serif text-2xl font-bold md:text-3xl">{caseItem.title}</h1>
            <p className="break-all font-mono text-sm text-muted-foreground">{caseItem.case_number}</p>
          </div>

          <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div><p className="flex items-center gap-1 text-xs text-muted-foreground"><User className="h-3.5 w-3.5" />Cliente</p><p className="font-medium">{caseItem.client || "—"}</p></div>
            <div><p className="text-xs text-muted-foreground">Parte diversa</p><p className="font-medium">{caseItem.parte_diversa || "—"}</p></div>
            <div><p className="text-xs text-muted-foreground">Tipo</p><p className="font-medium">{caseItem.type || "—"}</p></div>
            <div><p className="flex items-center gap-1 text-xs text-muted-foreground"><Gavel className="h-3.5 w-3.5" />Vara</p><p className="font-medium">{caseItem.vara || "—"}</p></div>
            <div><p className="flex items-center gap-1 text-xs text-muted-foreground"><Landmark className="h-3.5 w-3.5" />Comarca</p><p className="font-medium">{caseItem.comarca || "—"}</p></div>
            <div><p className="flex items-center gap-1 text-xs text-muted-foreground"><Scale className="h-3.5 w-3.5" />Valor da causa</p><p className="font-medium">{caseItem.valor_causa != null ? currency.format(caseItem.valor_causa) : "—"}</p></div>
            <div><p className="flex items-center gap-1 text-xs text-muted-foreground"><Calendar className="h-3.5 w-3.5" />Distribuição / abertura</p><p className="font-medium">{fmtDate(caseItem.data_abertura_tribunal)}</p></div>
            <div><p className="text-xs text-muted-foreground">Data de aceitação</p><p className="font-medium">{fmtDate(caseItem.data_aceitacao)}</p></div>
            <div><p className="text-xs text-muted-foreground">Última atualização na LEXIA</p><p className="font-medium">{fmtDate(caseItem.updated_at)}</p></div>
          </div>
        </section>

        <section className="rounded-xl border bg-card p-5 md:p-6">
          <div className="mb-4 flex items-center gap-2">
            <FileText className="h-5 w-5" />
            <div><h2 className="font-semibold">Documentos vinculados</h2><p className="text-xs text-muted-foreground">{documents.length} documento(s) relacionado(s) a este processo.</p></div>
          </div>
          {documents.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum documento interno vinculado ainda.</p>
          ) : (
            <div className="space-y-2">
              {documents.map((doc: any) => (
                <div key={doc.id} className="flex flex-col gap-1 rounded-lg border p-3 sm:flex-row sm:items-center sm:justify-between">
                  <div><p className="text-sm font-medium">{doc.title}</p><p className="text-xs text-muted-foreground">{doc.type} • atualizado em {fmtDate(doc.updated_at)}</p></div>
                  <Badge variant="outline">{doc.status}</Badge>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="rounded-xl border bg-card p-5 md:p-6">
          <JusbrasilCaseDetails caseId={caseItem.id} />
        </section>
      </main>
    </div>
  );
}
