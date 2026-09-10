import { ExternalLink, Loader2, Scale } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useSearchResults } from "@/hooks/useProcessSearch";

interface CompletedSearchResultsProps {
  reportId: string;
  onOpenCase?: (caseId: string) => void;
}

function asText(value: unknown) {
  if (value == null) return "";
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map(asText).filter(Boolean).join(", ");
  if (typeof value === "object") return Object.values(value as Record<string, unknown>).map(asText).filter(Boolean).join(", ");
  return String(value);
}

export function CompletedSearchResults({ reportId, onOpenCase }: CompletedSearchResultsProps) {
  const { data: results = [], isLoading, isError } = useSearchResults(reportId);

  if (isLoading) {
    return <div className="mt-3 flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Carregando processos encontrados...</div>;
  }

  if (isError) {
    return <div className="mt-3 rounded-md border border-red-500/30 bg-red-500/5 p-3 text-sm text-red-700">Não foi possível carregar os processos desta busca.</div>;
  }

  if (results.length === 0) {
    return <div className="mt-3 rounded-md border bg-muted/30 p-3 text-sm text-muted-foreground">Nenhum processo detalhado foi importado para esta busca.</div>;
  }

  return (
    <div className="mt-4 space-y-3 border-t pt-4">
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="text-sm font-semibold">Processos encontrados</p>
          <p className="text-xs text-muted-foreground">{results.length} registro(s) importado(s) do relatório do JusBrasil.</p>
        </div>
        <Badge variant="secondary">Disponíveis na LEXIA</Badge>
      </div>

      <div className="max-h-[520px] space-y-2 overflow-y-auto pr-1">
        {results.map((result) => (
          <div key={result.id} className="rounded-lg border bg-background p-3">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <Scale className="h-4 w-4 text-muted-foreground" />
                  <p className="break-all text-sm font-semibold">{result.process_number || "Número não informado"}</p>
                  {result.tribunal && <Badge variant="outline">{result.tribunal}</Badge>}
                </div>
                <p className="text-xs text-muted-foreground">
                  {[result.area, result.natureza, result.comarca, result.vara].filter(Boolean).join(" • ") || "Informações processuais importadas"}
                </p>
                {asText(result.partes_ativas) && <p className="text-xs"><span className="font-medium">Parte ativa:</span> {asText(result.partes_ativas)}</p>}
                {asText(result.partes_passivas) && <p className="text-xs"><span className="font-medium">Parte passiva:</span> {asText(result.partes_passivas)}</p>}
                {result.ultima_movimentacao_texto && <p className="line-clamp-2 text-xs text-muted-foreground"><span className="font-medium text-foreground">Última movimentação:</span> {result.ultima_movimentacao_texto}</p>}
              </div>

              {result.case_id && onOpenCase && (
                <Button size="sm" variant="outline" onClick={() => onOpenCase(result.case_id as string)} className="shrink-0">
                  <ExternalLink className="mr-2 h-3.5 w-3.5" />Abrir em Processos
                </Button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
