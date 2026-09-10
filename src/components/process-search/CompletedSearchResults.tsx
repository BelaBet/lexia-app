import { useState } from "react";
import { ExternalLink, Loader2, Scale, ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useSearchResults } from "@/hooks/useProcessSearch";

interface CompletedSearchResultsProps { reportId: string; onOpenCase?: (caseId: string) => void; }
function asText(value: unknown) { if (value == null) return ""; if (typeof value === "string") return value; if (Array.isArray(value)) return value.map(asText).filter(Boolean).join("; "); if (typeof value === "object") return Object.values(value as Record<string, unknown>).map(asText).filter(Boolean).join("; "); return String(value); }
function raw(raw: Record<string, unknown> | null | undefined, ...keys: string[]) { for (const k of keys) if (raw?.[k] != null && raw[k] !== "") return raw[k]; return null; }
function safeUrl(value: unknown) { const v = asText(value).trim(); return /^https?:\/\//i.test(v) ? v : null; }

export function CompletedSearchResults({ reportId, onOpenCase }: CompletedSearchResultsProps) {
  const { data: results = [], isLoading, isError } = useSearchResults(reportId);
  const [expanded, setExpanded] = useState<string | null>(null);
  if (isLoading) return <div className="mt-3 flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Carregando processos encontrados...</div>;
  if (isError) return <div className="mt-3 rounded-md border border-red-500/30 bg-red-500/5 p-3 text-sm text-red-700">Não foi possível carregar os processos desta busca.</div>;
  if (!results.length) return <div className="mt-3 rounded-md border bg-muted/30 p-3 text-sm text-muted-foreground">Nenhum processo detalhado foi importado para esta busca.</div>;

  return <div className="mt-4 space-y-3 border-t pt-4">
    <div className="flex items-center justify-between gap-2"><div><p className="text-sm font-semibold">Processos encontrados</p><p className="text-xs text-muted-foreground">{results.length} registro(s) importado(s). Os dados completos recebidos ficam preservados na LEXIA.</p></div><Badge variant="secondary">Disponíveis na LEXIA</Badge></div>
    <div className="max-h-[650px] space-y-2 overflow-y-auto pr-1">{results.map((result) => {
      const r = result.raw_data || {};
      const isOpen = expanded === result.id;
      const attachment = safeUrl(raw(r, "URL Anexo", "url_anexo"));
      const details = safeUrl(raw(r, "Link detalhes", "link_detalhes"));
      return <div key={result.id} className="rounded-lg border bg-background p-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div className="min-w-0 space-y-1"><div className="flex flex-wrap items-center gap-2"><Scale className="h-4 w-4 text-muted-foreground" /><p className="break-all text-sm font-semibold">{result.process_number || "Número não informado"}</p>{result.tribunal && <Badge variant="outline">{result.tribunal}</Badge>}</div><p className="text-xs text-muted-foreground">{[result.area, result.natureza, result.comarca, result.vara].filter(Boolean).join(" • ") || "Informações processuais importadas"}</p>{asText(result.partes_ativas) && <p className="text-xs"><b>Parte ativa:</b> {asText(result.partes_ativas)}</p>}{asText(result.partes_passivas) && <p className="text-xs"><b>Parte passiva:</b> {asText(result.partes_passivas)}</p>}{result.ultima_movimentacao_texto && <p className="line-clamp-2 text-xs text-muted-foreground"><b className="text-foreground">Última movimentação:</b> {result.ultima_movimentacao_texto}</p>}</div>
        <div className="flex shrink-0 flex-wrap gap-2"><Button size="sm" variant="ghost" onClick={() => setExpanded(isOpen ? null : result.id)}>{isOpen ? <ChevronUp className="mr-1 h-3.5 w-3.5" /> : <ChevronDown className="mr-1 h-3.5 w-3.5" />}{isOpen ? "Fechar detalhes" : "Ver detalhes"}</Button>{result.case_id && onOpenCase && <Button size="sm" variant="outline" onClick={() => onOpenCase(result.case_id as string)}><ExternalLink className="mr-2 h-3.5 w-3.5" />Abrir em Processos</Button>}</div></div>
        {isOpen && <div className="mt-3 space-y-3 border-t pt-3 text-xs">
          <div className="grid grid-cols-1 gap-2 md:grid-cols-2"><p><b>Foro:</b> {result.foro || "—"}</p><p><b>Comarca:</b> {result.comarca || "—"}</p><p><b>Vara:</b> {result.vara || "—"}</p><p><b>Valor:</b> {result.valor ?? "—"}</p><p><b>Advogados:</b> {asText(result.advogados) || asText(raw(r,"Todos advogados")) || "—"}</p><p><b>Todas as partes:</b> {asText(raw(r,"Todas partes")) || "—"}</p><p><b>Audiência:</b> {asText(raw(r,"Data Audiência")) || "—"} {asText(raw(r,"Tipo Audiência"))}</p><p><b>Local audiência:</b> {asText(raw(r,"Local Audiência")) || "—"}</p><p><b>Sentença:</b> {asText(raw(r,"Classificação sentença")) || asText(raw(r,"Sentença")) || "—"}</p><p><b>Status:</b> {result.status_processual || "—"}</p></div>
          {(attachment || details) && <div className="flex flex-wrap gap-3">{attachment && <a href={attachment} target="_blank" rel="noreferrer" className="underline">Abrir anexo disponível</a>}{details && <a href={details} target="_blank" rel="noreferrer" className="underline">Detalhes da origem</a>}</div>}
          <details><summary className="cursor-pointer font-medium">Dados completos recebidos da API</summary><pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap break-words rounded bg-muted/40 p-2">{JSON.stringify(r,null,2)}</pre></details>
        </div>}
      </div>;
    })}</div>
  </div>;
}
