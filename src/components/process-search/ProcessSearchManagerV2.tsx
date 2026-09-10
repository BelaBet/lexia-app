import { useMemo, useState } from "react";
import { Search, Loader2, RefreshCw } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { CnjSearchCard } from "@/components/process-search/CnjSearchCard";
import { useSearchReports, useCheckNameSearch } from "@/hooks/useProcessSearch";
import { useConfirmNameSearch, usePreviewNameSearch, type NameSearchPreviewResponse } from "@/hooks/useNameSearchFlow";

const statusMeta: Record<string, { label: string; className: string }> = {
  preview: { label: "Prévia — aguardando confirmação", className: "bg-blue-500/10 text-blue-700" },
  criando: { label: "Criando busca...", className: "bg-gray-500/10 text-gray-600" },
  processando: { label: "Processando no JusBrasil", className: "bg-yellow-500/10 text-yellow-700" },
  concluido: { label: "Concluída", className: "bg-green-500/10 text-green-700" },
  erro: { label: "Erro", className: "bg-red-500/10 text-red-700" },
};

export function ProcessSearchManagerV2() {
  const [name, setName] = useState("");
  const [preview, setPreview] = useState<NameSearchPreviewResponse | null>(null);
  const [excludedVariationIds, setExcludedVariationIds] = useState<Array<number | null>>([]);
  const { data: reports = [], isLoading, isError, error } = useSearchReports();
  const previewSearch = usePreviewNameSearch();
  const confirmSearch = useConfirmNameSearch();
  const checkSearch = useCheckNameSearch();

  const selectedCount = useMemo(() => {
    if (!preview) return 0;
    return preview.parts.reduce((sum, part) => sum + part.variations.filter((v) => !excludedVariationIds.includes(v.variation_id)).length, 0);
  }, [preview, excludedVariationIds]);

  const handlePreview = async () => {
    const value = name.trim();
    if (value.length < 3) {
      toast.error("Informe um nome com pelo menos 3 letras");
      return;
    }
    try {
      const res = await previewSearch.mutateAsync(value);
      setPreview(res);
      setExcludedVariationIds([]);
      toast.success(res.message || "Prévia carregada");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao preparar a prévia");
    }
  };

  const toggleVariation = (id: number | null, checked: boolean) => {
    setExcludedVariationIds((current) => {
      if (checked) return current.filter((item) => item !== id);
      return current.includes(id) ? current : [...current, id];
    });
  };

  const handleConfirm = async () => {
    if (!preview) return;
    if (selectedCount === 0) {
      toast.error("Selecione pelo menos uma variação antes de confirmar.");
      return;
    }
    try {
      const res = await confirmSearch.mutateAsync({ reportId: preview.report_id, excludedVariationIds });
      toast.success(res.message || "Busca confirmada");
      setPreview(null);
      setExcludedVariationIds([]);
      setName("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao confirmar a busca");
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
        <CardContent className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row">
            <Input
              placeholder="Nome completo da pessoa ou empresa"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handlePreview()}
            />
            <Button onClick={handlePreview} disabled={previewSearch.isPending} className="sm:w-48">
              {previewSearch.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Search className="mr-2 h-4 w-4" />}
              Ver prévia
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">Primeiro a LEXIA consulta a prévia e mostra as variações encontradas. A busca paga só começa depois da sua confirmação.</p>

          {preview && (
            <div className="space-y-4 rounded-xl border p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-medium">Prévia para “{preview.search_name}”</p>
                  <p className="text-sm text-muted-foreground">{preview.total_procs} processo(s) estimado(s) • {selectedCount} variação(ões) selecionada(s)</p>
                </div>
                <Badge variant="secondary">Revise antes de confirmar</Badge>
              </div>

              {preview.parts.length === 0 ? (
                <div className="rounded-md border bg-muted/40 p-3 text-sm">Nenhuma parte ou variação foi retornada pelo JusBrasil para esta prévia.</div>
              ) : (
                <div className="space-y-4">
                  {preview.parts.map((part, partIndex) => (
                    <div key={`${part.id ?? partIndex}-${part.name}`} className="rounded-lg border p-3">
                      <div className="mb-2">
                        <p className="font-medium">{part.name}</p>
                        <p className="text-xs text-muted-foreground">{part.total} processo(s) associados às variações</p>
                      </div>
                      <div className="space-y-2">
                        {part.variations.map((variation, index) => {
                          const checked = !excludedVariationIds.includes(variation.variation_id);
                          return (
                            <label key={`${variation.variation_id ?? index}-${variation.name}`} className="flex cursor-pointer items-start gap-3 rounded-md border p-3 hover:bg-muted/40">
                              <Checkbox checked={checked} onCheckedChange={(value) => toggleVariation(variation.variation_id, value === true)} />
                              <div className="min-w-0 flex-1">
                                <p className="text-sm font-medium">{variation.name}</p>
                                <p className="text-xs text-muted-foreground">{variation.total} processo(s) encontrados</p>
                              </div>
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
                <Button variant="outline" onClick={() => { setPreview(null); setExcludedVariationIds([]); }}>Cancelar</Button>
                <Button onClick={handleConfirm} disabled={confirmSearch.isPending || selectedCount === 0}>
                  {confirmSearch.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Confirmar e iniciar busca
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">A confirmação inicia a operação cobrada pelo provedor. A prévia fica registrada no histórico mesmo se você cancelar.</p>
            </div>
          )}
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
            const extended = report as typeof report & { outcome_message?: string | null; estimated_cost?: number | null };
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
                {extended.outcome_message && <div className="mt-3 rounded-md border bg-muted/40 p-3 text-sm">{extended.outcome_message}</div>}
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
