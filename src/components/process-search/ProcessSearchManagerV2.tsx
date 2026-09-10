import { useState } from "react";
import { Search, Loader2, RefreshCw } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { CnjSearchCard } from "@/components/process-search/CnjSearchCard";
import { useSearchReports, useCreateNameSearch, useCheckNameSearch } from "@/hooks/useProcessSearch";

const statusMeta: Record<string, { label: string; className: string }> = {
  criando: { label: "Criando busca...", className: "bg-gray-500/10 text-gray-600" },
  processando: { label: "Processando no JusBrasil", className: "bg-yellow-500/10 text-yellow-700" },
  concluido: { label: "Concluída", className: "bg-green-500/10 text-green-700" },
  erro: { label: "Erro", className: "bg-red-500/10 text-red-700" },
};

export function ProcessSearchManagerV2() {
  const [name, setName] = useState("");
  const { data: reports = [], isLoading, isError, error } = useSearchReports();
  const createSearch = useCreateNameSearch();
  const checkSearch = useCheckNameSearch();

  const handleSearch = async () => {
    const value = name.trim();
    if (value.length < 3) {
      toast.error("Informe um nome com pelo menos 3 letras");
      return;
    }
    try {
      const res = await createSearch.mutateAsync(value);
      setName("");
      toast.success(res.message || "Busca iniciada");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao iniciar busca");
    }
  };

  const handleCheck = async (reportId: string) => {
    try {
      const res = await checkSearch.mutateAsync(reportId);
      toast.success(res.message || `Status: ${res.status}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao verificar busca");
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-serif text-3xl font-bold text-foreground">Buscar Processos</h1>
        <p className="text-muted-foreground mt-1">Consulte por número CNJ ou pesquise processos por nome.</p>
      </div>

      <CnjSearchCard />

      <Card className="legal-card">
        <CardHeader><CardTitle className="text-base">Pesquisa por nome</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-col gap-3 sm:flex-row">
            <Input
              placeholder="Nome completo da pessoa ou empresa"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSearch()}
            />
            <Button onClick={handleSearch} disabled={createSearch.isPending} className="sm:w-40">
              {createSearch.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Search className="mr-2 h-4 w-4" />}
              Buscar
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">A pesquisa por nome é uma operação independente e pode gerar cobrança quando executada no provedor.</p>
        </CardContent>
      </Card>

      <Card className="legal-card">
        <CardHeader><CardTitle className="text-base">Minhas buscas</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {isLoading && <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Carregando buscas...</div>}
          {isError && <div className="rounded-md border border-red-500/30 bg-red-500/5 p-3 text-sm text-red-700">Não foi possível carregar o histórico. {error instanceof Error ? error.message : ""}</div>}
          {!isLoading && !isError && reports.length === 0 && <p className="text-sm text-muted-foreground">Nenhuma busca ainda.</p>}
          {!isLoading && !isError && reports.map((report) => {
            const meta = statusMeta[String(report.status)] ?? { label: String(report.status || "Status desconhecido"), className: "bg-muted text-muted-foreground" };
            const outcomeMessage = (report as typeof report & { outcome_message?: string | null }).outcome_message;
            return (
              <div key={report.id} className="rounded-lg border p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{report.search_name || "Busca sem nome"}</p>
                    <p className="text-xs text-muted-foreground">{report.result_count ?? 0} processo(s)</p>
                    <p className="text-xs text-muted-foreground">Solicitada em {new Date(report.requested_at).toLocaleString("pt-BR")}</p>
                  </div>
                  <Badge variant="secondary" className={meta.className}>{meta.label}</Badge>
                </div>
                {outcomeMessage && (
                  <div className="mt-3 rounded-md border bg-muted/40 p-3 text-sm">
                    {outcomeMessage}
                  </div>
                )}
                {report.status === "processando" && (
                  <Button size="sm" variant="outline" className="mt-3" onClick={() => handleCheck(report.id)} disabled={checkSearch.isPending}>
                    <RefreshCw className="mr-2 h-3 w-3" />Verificar resultado
                  </Button>
                )}
                {report.error_message && <p className="mt-2 text-xs text-red-700">{report.error_message}</p>}
              </div>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}
