import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, ExternalLink, FileText, Loader2, RefreshCw, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";

const currency = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

function safeObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function safeArray(value: unknown): any[] {
  return Array.isArray(value) ? value : [];
}

function text(value: unknown) {
  if (value == null || value === "") return "";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return String(value);
  return "";
}

function fmtDate(value?: string | null) {
  if (!value) return "—";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? value : d.toLocaleDateString("pt-BR");
}

function fmtDateTime(value?: string | null) {
  if (!value) return "—";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? value : d.toLocaleString("pt-BR");
}

function lawyerName(value: any) {
  return text(value?.nomeNormalizado) || text(value?.nome) || "—";
}

function lawyerOab(value: any) {
  return text(value?.oab) || "—";
}

function PartyTable({ title, rows }: { title: string; rows: any[] }) {
  return (
    <section className="space-y-3">
      <h2 className="text-xl font-semibold uppercase tracking-tight">{title}</h2>
      <div className="overflow-x-auto border-y">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="text-left text-xs text-muted-foreground">
            <tr>
              <th className="px-3 py-3 font-medium">Nome</th>
              <th className="px-3 py-3 font-medium">Advogado</th>
              <th className="px-3 py-3 font-medium">OAB</th>
            </tr>
          </thead>
          <tbody>
            {rows.length ? rows.map((party, index) => {
              const lawyers = safeArray(party?.advogados);
              const first = lawyers[0];
              return (
                <tr key={`${text(party?.nomeParte)}-${index}`} className="border-t align-top">
                  <td className="px-3 py-3 font-medium">{text(party?.nomeParte) || "—"}</td>
                  <td className="px-3 py-3">{first ? lawyerName(first) : "—"}</td>
                  <td className="px-3 py-3">{first ? lawyerOab(first) : "—"}</td>
                </tr>
              );
            }) : (
              <tr><td colSpan={3} className="px-3 py-6 text-center text-sm text-muted-foreground">Nenhuma parte informada.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export function JusbrasilCaseDetails({ caseId }: { caseId: string }) {
  const queryClient = useQueryClient();
  const [movementSearch, setMovementSearch] = useState("");
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [autoSyncDone, setAutoSyncDone] = useState(false);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["jusbrasil-case-details", caseId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("process_search_results")
        .select("*")
        .eq("case_id", caseId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data as any;
    },
  });

  const { data: timelineEvents = [] } = useQuery({
    queryKey: ["case-timeline-events", caseId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("case_timeline_events")
        .select("id,event_date,title,client_summary,internal_note,source,created_at")
        .eq("case_id", caseId)
        .order("event_date", { ascending: false })
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const resultId = data?.id as string | undefined;
  const { data: storedAutos = [], refetch: refetchAutos } = useQuery({
    queryKey: ["process-search-documents", resultId],
    enabled: Boolean(resultId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("process_search_documents")
        .select("id,file_name,file_path,file_size,file_type,source_url,created_at")
        .eq("result_id", resultId as string)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const syncDetails = async (force = false) => {
    if (syncing) return;
    setSyncing(true);
    setSyncMessage(null);
    try {
      const { data: syncData, error } = await supabase.functions.invoke("sync-case-details", {
        body: { case_id: caseId, force },
      });
      if (error) throw error;
      setSyncMessage(`${syncData?.movements ?? 0} movimentação(ões) e ${syncData?.autos ?? 0} auto(s) sincronizados.`);
      await Promise.all([
        refetch(),
        refetchAutos(),
        queryClient.invalidateQueries({ queryKey: ["case-timeline-events", caseId] }),
      ]);
    } catch (error) {
      setSyncMessage(error instanceof Error ? error.message : "Não foi possível sincronizar os detalhes do processo.");
    } finally {
      setSyncing(false);
    }
  };

  useEffect(() => {
    if (!data || autoSyncDone) return;
    const raw = safeObject(data.raw_data);
    const hasProviderDetails = Array.isArray(raw.movs) || Array.isArray(raw.anexos) || Boolean(raw._details_synced_at);
    if (!hasProviderDetails) {
      setAutoSyncDone(true);
      void syncDetails(false);
    }
  }, [data, autoSyncDone]);

  if (isLoading) return <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Carregando dados do processo...</div>;
  if (isError || !data) return <p className="text-sm text-muted-foreground">Este processo ainda não possui dados detalhados importados.</p>;

  const raw = safeObject(data.raw_data);
  const activeParties = safeArray(data.partes_ativas).length ? safeArray(data.partes_ativas) : safeArray(raw.partes).filter((p: any) => p?.is_autora || p?.relacaoNormalizado === "AUTOR");
  const passiveParties = safeArray(data.partes_passivas).length ? safeArray(data.partes_passivas) : safeArray(raw.partes).filter((p: any) => p?.is_re || p?.relacaoNormalizado === "REU");
  const classes = safeArray(raw.classes);
  const hearings = safeArray(raw.audiencias);
  const firstHearing = hearings[0] || null;
  const courtUnit = text(raw.vara_original) ? `${text(raw.vara_original)}ª Vara` : text(data.vara);
  const instance = text(raw.instancia) ? `${text(raw.instancia)}ª instância` : "—";
  const updatedAt = text(raw.alteradoEm) || data.updated_at || data.created_at;

  const providerMovements = safeArray(raw.movs).map((mov: any, index: number) => ({
    id: `provider-${mov?.[4] ?? index}`,
    event_date: text(mov?.[0]),
    title: text(mov?.[1]) || "Movimentação",
    client_summary: text(mov?.[2]),
    internal_note: text(mov?.[3]),
    source: "provider",
  }));

  const movements = providerMovements.length ? providerMovements : timelineEvents;

  const rawAutos = safeArray(raw.anexos).map((item: any, index: number) => ({
    id: `raw-auto-${item?.[0] ?? index}`,
    file_name: text(item?.[7]) || `Documento ${index + 1}`,
    source_url: text(item?.[1]),
    file_path: text(item?.[1]),
    file_type: text(item?.[2]) || "Documento",
    created_at: text(item?.[3]) || text(item?.[5]),
  })).filter((doc: any) => doc.source_url || doc.file_name);

  const autos = storedAutos.length ? storedAutos : rawAutos;
  const documentCount = Math.max(Number(raw.num_anexos || 0), autos.length);
  const term = movementSearch.trim().toLowerCase();
  const filteredMovements = term
    ? movements.filter((item: any) => [item.title, item.client_summary, item.internal_note, item.event_date].some((v) => String(v || "").toLowerCase().includes(term)))
    : movements;

  return (
    <div className="space-y-10 md:space-y-12">
      <section className="space-y-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <h1 className="break-words font-serif text-2xl font-semibold text-primary md:text-3xl">
              {data.tribunal || "Processo"} - Nº {data.process_number || "—"}
            </h1>
            <p className="mt-3 text-sm text-muted-foreground">{text(data.foro) || text(raw.fonte_sistema) || "—"}</p>
          </div>
          <div className="flex flex-col items-start gap-2 lg:items-end">
            <div className="text-sm text-muted-foreground">Atualizado em {fmtDateTime(updatedAt)}</div>
            <Button variant="outline" size="sm" onClick={() => syncDetails(true)} disabled={syncing}>
              <RefreshCw className={`mr-2 h-4 w-4 ${syncing ? "animate-spin" : ""}`} />
              Sincronizar detalhes
            </Button>
          </div>
        </div>
        {syncing && <div className="rounded-lg border bg-muted/30 p-3 text-sm text-muted-foreground">Sincronizando movimentações e autos já existentes no provedor...</div>}
        {syncMessage && !syncing && <div className="rounded-lg border bg-muted/20 p-3 text-sm text-muted-foreground">{syncMessage}</div>}

        <div>
          <h2 className="mb-5 text-lg font-semibold">Detalhes do processo</h2>
          <div className="grid gap-x-10 gap-y-4 md:grid-cols-2">
            <div className="space-y-2 text-sm">
              <p>{data.area || "—"} / {instance}</p>
              <p className="font-medium">{data.natureza || text(raw.classeNatureza) || "—"}</p>
              {classes.length > 0 && <div className="space-y-1 text-muted-foreground">{classes.map((item, i) => <p key={`${String(item)}-${i}`}>- {String(item)}</p>)}</div>}
            </div>
            <dl className="grid grid-cols-[150px_1fr] gap-x-4 gap-y-2 text-sm">
              <dt className="text-muted-foreground">Comarca</dt><dd>{data.comarca || text(raw.comarca_cnj) || "—"}</dd>
              <dt className="text-muted-foreground">Vara</dt><dd>{courtUnit || "—"}</dd>
              <dt className="text-muted-foreground">Data de distribuição</dt><dd>{fmtDate(data.data_distribuicao || text(raw.distribuicaoData))}</dd>
              <dt className="text-muted-foreground">Audiência</dt><dd>{firstHearing ? fmtDateTime(text(firstHearing.datahora ?? firstHearing?.[0])) : "—"}</dd>
              <dt className="text-muted-foreground">Valor da causa</dt><dd>{data.valor != null ? currency.format(Number(data.valor)) : "—"}</dd>
              <dt className="text-muted-foreground">Status</dt><dd>{data.status_processual || (raw.arquivado ? "Arquivado" : "Em andamento")}</dd>
            </dl>
          </div>
        </div>
      </section>

      <PartyTable title="Autor" rows={activeParties} />
      <PartyTable title="Réu" rows={passiveParties} />

      <section className="space-y-5">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-xl font-semibold">{movements.length} Movimentações</h2>
            <p className="mt-1 text-xs text-muted-foreground">Histórico processual disponível na TK2 Juris.</p>
          </div>
          <div className="relative w-full md:w-72">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input value={movementSearch} onChange={(e) => setMovementSearch(e.target.value)} placeholder="Buscar nas movimentações" className="legal-input h-10 w-full pl-9" />
          </div>
        </div>

        {filteredMovements.length > 0 ? (
          <div className="overflow-x-auto border-y">
            <table className="w-full min-w-[800px] text-sm">
              <thead className="text-left text-xs text-muted-foreground"><tr><th className="px-3 py-3 font-medium">Data</th><th className="px-3 py-3 font-medium">Tipo</th><th className="px-3 py-3 font-medium">Texto</th></tr></thead>
              <tbody>{filteredMovements.map((item: any) => <tr key={item.id} className="border-t align-top"><td className="px-3 py-4 whitespace-nowrap">{fmtDate(item.event_date)}</td><td className="px-3 py-4 font-medium">{item.title || "Movimentação"}</td><td className="px-3 py-4 text-muted-foreground">{item.client_summary || item.internal_note || "—"}</td></tr>)}</tbody>
            </table>
          </div>
        ) : (
          <div className="rounded-lg border bg-muted/20 p-5 text-sm text-muted-foreground">
            {syncing ? "Sincronizando movimentações existentes..." : "Nenhuma movimentação foi retornada pela base atual do provedor para este processo."}
          </div>
        )}
      </section>

      <section className="space-y-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div><h2 className="text-xl font-semibold">{documentCount} Autos</h2><p className="mt-1 text-xs text-muted-foreground">Documentos e anexos já existentes na base.</p></div>
          {autos.length > 0 && <Button variant="outline" onClick={() => autos.forEach((doc: any) => { const url = doc.source_url || doc.file_path; if (url && /^https?:\/\//i.test(url)) window.open(url, "_blank", "noopener,noreferrer"); })}><Download className="mr-2 h-4 w-4" />Abrir autos disponíveis</Button>}
        </div>

        {autos.length > 0 ? (
          <div className="overflow-x-auto border-y">
            <table className="w-full min-w-[720px] text-sm"><thead className="text-left text-xs text-muted-foreground"><tr><th className="px-3 py-3 font-medium">Título</th><th className="px-3 py-3 font-medium">Data</th><th className="px-3 py-3 font-medium">Tipo</th><th className="px-3 py-3 font-medium">Ação</th></tr></thead><tbody>{autos.map((doc: any) => { const url = doc.source_url || doc.file_path; const canOpen = Boolean(url && /^https?:\/\//i.test(url)); return <tr key={doc.id} className="border-t"><td className="px-3 py-4 font-medium">{doc.file_name || "Documento"}</td><td className="px-3 py-4">{fmtDate(doc.created_at)}</td><td className="px-3 py-4">{doc.file_type || "—"}</td><td className="px-3 py-4">{canOpen ? <a href={url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-medium text-primary hover:underline">Abrir <ExternalLink className="h-3.5 w-3.5" /></a> : "—"}</td></tr>; })}</tbody></table>
          </div>
        ) : (
          <div className="rounded-lg border bg-muted/20 p-5 text-sm text-muted-foreground">{syncing ? "Sincronizando autos existentes..." : "Nenhum auto foi retornado pela base atual do provedor para este processo."}</div>
        )}
      </section>

      <details className="rounded-lg border p-4">
        <summary className="cursor-pointer text-sm font-medium">Outras informações recebidas da API</summary>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {Object.entries(raw).filter(([key]) => !["partes", "classes", "audiencias", "movs", "anexos"].includes(key)).map(([key, value]) => (
            <div key={key} className="rounded-md bg-muted/30 p-3"><p className="text-xs text-muted-foreground">{key}</p><p className="mt-1 break-words text-sm">{typeof value === "object" ? JSON.stringify(value) : String(value ?? "—")}</p></div>
          ))}
        </div>
      </details>

      <div className="flex items-center gap-2 text-xs text-muted-foreground"><FileText className="h-4 w-4" />A tela usa os dados já existentes na base do provedor e não solicita atualização no tribunal nem nova baixa de autos.</div>
    </div>
  );
}
