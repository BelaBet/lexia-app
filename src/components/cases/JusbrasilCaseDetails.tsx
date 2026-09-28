import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Download, ExternalLink, FileText, Loader2, RefreshCw, Search, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";

const currency = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

// Dados crus vindos da API do JusBrasil (armazenados como JSON sem schema
// fixo) — acessados via indexação solta (chave de objeto ou índice de
// tupla), nunca com um shape conhecido em tempo de compilação.
type JsonRecord = Record<string, unknown>;

function safeObject(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : {};
}

// supabase.functions.invoke() só expõe o corpo JSON de uma resposta de erro
// via error.context (a Response crua) — por padrão error.message é o texto
// genérico "Edge Function returned a non-2xx status code", que esconde a
// mensagem real retornada pelo backend.
async function extractFunctionErrorMessage(error: unknown): Promise<string> {
  const context = (error as { context?: Response } | null)?.context;
  if (context && typeof context.clone === "function") {
    try {
      const payload = await context.clone().json();
      const message = typeof payload?.error === "string" ? payload.error : typeof payload?.message === "string" ? payload.message : "";
      if (message) return message;
    } catch { /* mantém o fallback abaixo */ }
  }
  return error instanceof Error ? error.message : "Erro inesperado";
}

function normalizeLawyer(value: unknown): JsonRecord | null {
  if (value && typeof value === "object" && !Array.isArray(value)) return value as JsonRecord;
  if (Array.isArray(value)) {
    return { advogadoID: value[0], nomeNormalizado: value[1], oab: value[2], cnpjCpf: value[3], uf: value[4] };
  }
  return null;
}

function normalizeParty(value: unknown): JsonRecord | null {
  if (value && typeof value === "object" && !Array.isArray(value)) return value as JsonRecord;
  if (Array.isArray(value)) {
    return {
      processoParteAdvogadoID: value[0],
      parteID: value[1],
      nomeParte: value[2],
      nomeNormalizado: value[3],
      cnpj: value[4],
      cpf: value[5],
      documento: value[6],
      parteRelacaoID: value[7],
      relacaoNormalizado: value[8],
      advogados: Array.isArray(value[9]) ? value[9].map(normalizeLawyer).filter(Boolean) : [],
      is_autora: value[10],
      is_coautora: value[11],
      is_re: value[12],
      is_neutra: value[13],
    };
  }
  return null;
}

function safeArray(value: unknown): JsonRecord[] {
  return Array.isArray(value) ? value.map(normalizeParty).filter((item): item is JsonRecord => Boolean(item)) : [];
}

// Movimentações, anexos, audiências e assuntos vêm do provedor como tuplas
// indexadas por posição (data, título, texto...), não como partes — passar
// esses arrays por normalizeParty (que remapeia para as chaves de UMA parte,
// como nomeParte/cnpj/advogados) destrói a tupla e some com todo o conteúdo,
// deixando "Movimentação" genérico e "—" em todo campo. Aqui só filtra o que
// não é array, sem tocar no formato de cada item.
function rawArray(value: unknown): JsonRecord[] {
  return Array.isArray(value) ? (value as JsonRecord[]) : [];
}

function rawPartyArray(value: unknown): JsonRecord[] {
  return Array.isArray(value) ? value.map(normalizeParty).filter((item): item is JsonRecord => Boolean(item)) : [];
}

function text(value: unknown) {
  if (value == null || value === "") return "";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return String(value);
  return "";
}

function parseDate(value: unknown) {
  if (typeof value !== "string" || !value) return null;
  const br = value.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (br) {
    const d = new Date(Number(br[3]), Number(br[2]) - 1, Number(br[1]));
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function fmtDate(value: unknown) {
  const str = text(value);
  if (!str) return "—";
  const d = parseDate(str);
  return d ? d.toLocaleDateString("pt-BR") : str;
}

function fmtDateTime(value: unknown) {
  const str = text(value);
  if (!str) return "—";
  const d = parseDate(str);
  return d ? d.toLocaleString("pt-BR") : str;
}

function lawyerName(value: JsonRecord) {
  return text(value?.nomeNormalizado) || text(value?.nome) || "—";
}

function lawyerOab(value: JsonRecord) {
  return text(value?.oab) || "—";
}

// Identifica um advogado de forma estável entre partes (advogadoID é o mais
// confiável; OAB e nome servem de fallback quando o provedor não manda o ID).
function lawyerKey(value: JsonRecord) {
  return text(value?.advogadoID) || text(value?.oab) || text(value?.nomeNormalizado) || "";
}

// Coleta as chaves de advogado que aparecem tanto do lado do autor quanto do
// réu — um mesmo advogado não pode representar as duas partes de uma ação.
// Quando isso acontece, o dado veio assim do provedor (JusBrasil); nunca
// inferimos qual lado está "certo", só sinalizamos para conferência.
function findConflictingLawyerKeys(activeParties: JsonRecord[], passiveParties: JsonRecord[]): Set<string> {
  const collect = (parties: JsonRecord[]) => {
    const keys = new Set<string>();
    parties.forEach((party) => {
      const lawyers = Array.isArray(party?.advogados) ? party.advogados as JsonRecord[] : [];
      lawyers.forEach((lawyer) => { const key = lawyerKey(lawyer); if (key) keys.add(key); });
    });
    return keys;
  };
  const activeKeys = collect(activeParties);
  const passiveKeys = collect(passiveParties);
  const conflicts = new Set<string>();
  activeKeys.forEach((key) => { if (passiveKeys.has(key)) conflicts.add(key); });
  return conflicts;
}

function PartyTable({ title, rows, conflictingLawyerKeys }: { title: string; rows: JsonRecord[]; conflictingLawyerKeys: Set<string> }) {
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
              const lawyers = Array.isArray(party?.advogados)
                ? (party.advogados as unknown[]).map(normalizeLawyer).filter((item): item is JsonRecord => Boolean(item))
                : [];
              const first = lawyers[0];
              const hasConflict = Boolean(first) && conflictingLawyerKeys.has(lawyerKey(first));
              return (
                <tr key={`${text(party?.nomeParte)}-${index}`} className="border-t align-top">
                  <td className="px-3 py-3 font-medium">{text(party?.nomeParte) || "—"}</td>
                  <td className="px-3 py-3">
                    {first ? (
                      <span className="inline-flex items-center gap-1.5">
                        {lawyerName(first)}
                        {hasConflict && (
                          <span title="Este advogado também consta na parte contrária deste processo, segundo o provedor de dados — confira a fonte antes de considerar definitivo.">
                            <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-500" />
                          </span>
                        )}
                      </span>
                    ) : "—"}
                  </td>
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

function MovementTimeline({ movements }: { movements: JsonRecord[] }) {
  const chronological = [...movements]
    .filter((item) => parseDate(item.event_date))
    .sort((a, b) => (parseDate(a.event_date)?.getTime() || 0) - (parseDate(b.event_date)?.getTime() || 0));

  if (!chronological.length) return null;

  // A linha do tempo não amostra mais apenas alguns pontos. Agrupa TODOS os
  // eventos pela data processual e exibe cada movimentação no respectivo dia.
  const days = chronological.reduce<Array<{ key: string; date: Date; items: JsonRecord[] }>>((groups, item) => {
    const date = parseDate(item.event_date);
    if (!date) return groups;
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
    const current = groups[groups.length - 1];
    if (current?.key === key) current.items.push(item);
    else groups.push({ key, date, items: [item] });
    return groups;
  }, []);

  return (
    <div className="rounded-xl border bg-background px-4 py-5 sm:px-6">
      <div className="mb-6 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-semibold">Linha do tempo das movimentações</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Todas as movimentações, agrupadas no respectivo dia, do primeiro ao último evento.
          </p>
        </div>
        <span className="w-fit shrink-0 rounded-full bg-muted px-3 py-1 text-xs font-medium">
          {movements.length} eventos em {days.length} {days.length === 1 ? "dia" : "dias"}
        </span>
      </div>

      <div className="relative space-y-0">
        <div className="absolute bottom-2 left-[7px] top-2 w-px bg-border" aria-hidden="true" />
        {days.map((day, dayIndex) => (
          <div key={day.key} className="relative grid grid-cols-[16px_minmax(0,1fr)] gap-4 pb-7 last:pb-0">
            <div className={`relative z-10 mt-1.5 h-[15px] w-[15px] rounded-full border-[3px] border-background shadow-sm ${dayIndex === days.length - 1 ? "bg-destructive" : "bg-primary"}`} />
            <div className="min-w-0">
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <time className="text-sm font-semibold" dateTime={day.key}>
                  {day.date.toLocaleDateString("pt-BR")}
                </time>
                <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                  {day.items.length} {day.items.length === 1 ? "movimentação" : "movimentações"}
                </span>
              </div>

              <div className="space-y-2">
                {day.items.map((item, itemIndex) => (
                  <div key={`${text(item.id) || day.key}-${itemIndex}`} className="rounded-lg border bg-muted/10 p-3">
                    <p className="text-sm font-medium">{text(item.title) || "Movimentação"}</p>
                    {(text(item.client_summary) || text(item.internal_note)) && (
                      <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">
                        {text(item.client_summary) || text(item.internal_note)}
                      </p>
                    )}
                    {text(item.client_summary) && text(item.internal_note) && text(item.client_summary) !== text(item.internal_note) && (
                      <p className="mt-2 whitespace-pre-wrap text-xs leading-relaxed text-muted-foreground">
                        {text(item.internal_note)}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function JusbrasilCaseDetails({ caseId }: { caseId: string }) {
  const queryClient = useQueryClient();
  const [movementSearch, setMovementSearch] = useState("");
  const [movementType, setMovementType] = useState("all");
  const [movementDateFrom, setMovementDateFrom] = useState("");
  const [movementDateTo, setMovementDateTo] = useState("");
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
      return data as JsonRecord;
    },
    refetchInterval: (query) => {
      const row = query.state.data as JsonRecord | undefined;
      const raw = safeObject(row?.raw_data);
      const requested = text(raw._tribunal_update_requested_at);
      const completed = text(raw._tribunal_updated_at);
      return requested && (!completed || new Date(completed).getTime() < new Date(requested).getTime()) ? 15000 : false;
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
      if (error) throw new Error(await extractFunctionErrorMessage(error));
      if (syncData?.success === false || syncData?.provider_unavailable) {
        setSyncMessage(syncData?.message || "O provedor de dados está temporariamente indisponível. Os dados já existentes foram preservados.");
        return;
      }
      setSyncMessage(syncData?.update_requested
        ? "Atualização solicitada ao tribunal. A LEXIA atualizará esta tela automaticamente quando o provedor concluir a consulta."
        : `${syncData?.movements ?? 0} movimentação(ões) e ${syncData?.autos ?? 0} auto(s) sincronizados.`);
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
    // Processos importados em lote (busca por nome/CRM) gravam raw_data já
    // com "movs"/"anexos" como array — só que VAZIO, porque esse import não
    // busca o detalhe completo do processo. `Array.isArray([])` é true, então
    // a checagem antiga considerava isso "já sincronizado" e nunca disparava
    // a sincronização automática — o processo ficava com a aba de
    // Movimentações permanentemente vazia até alguém clicar manualmente em
    // "Atualizar no tribunal". Só conta como já sincronizado quando há
    // conteúdo de fato ou um _details_synced_at registrado (prova de que o
    // detalhe completo já foi buscado ao menos uma vez, mesmo que vazio por
    // motivo legítimo como segredo de justiça).
    const hasProviderDetails = Boolean(raw._details_synced_at)
      || (Array.isArray(raw.movs) && raw.movs.length > 0)
      || (Array.isArray(raw.anexos) && raw.anexos.length > 0);
    if (!hasProviderDetails) {
      setAutoSyncDone(true);
      void syncDetails(false);
    }
  }, [data, autoSyncDone]);

  if (isLoading) return <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Carregando dados do processo...</div>;
  if (isError || !data) return <p className="text-sm text-muted-foreground">Este processo ainda não possui dados detalhados importados.</p>;

  const raw = safeObject(data.raw_data);
  // A fonte mais atual é raw.partes, preenchida pela sincronização de detalhes.
  // Cada advogado deve permanecer ligado à SUA parte; nunca reutilizamos um
  // advogado globalmente entre autor e réu. O provedor pode retornar partes
  // tanto como objetos quanto como tuplas, por isso normalizamos os dois formatos.
  const providerParties = rawPartyArray(raw.partes);
  const storedActive = safeArray(data.partes_ativas);
  const storedPassive = safeArray(data.partes_passivas);
  const activeFromProvider = providerParties.filter((p) => Boolean(p.is_autora) || /AUTOR|ATIVO/i.test(text(p.relacaoNormalizado)));
  const passiveFromProvider = providerParties.filter((p) => Boolean(p.is_re) || /REU|RÉU|PASSIVO/i.test(text(p.relacaoNormalizado)));
  const activeParties = activeFromProvider.length ? activeFromProvider : storedActive;
  const passiveParties = passiveFromProvider.length ? passiveFromProvider : storedPassive;
  const conflictingLawyerKeys = findConflictingLawyerKeys(activeParties, passiveParties);
  const classesFromProvider = rawArray(raw.classes).map((item) => text(item).trim()).filter(Boolean);
  const assuntoExtra = text(raw.assuntoExtra).split(",").map((item) => item.trim()).filter(Boolean);
  // "Motivos / assuntos" vêm de campos estruturados do provedor. Nunca
  // inferimos o motivo a partir de movimentações, sentença ou documentos.
  const reasons = Array.from(new Set(classesFromProvider.length ? classesFromProvider : assuntoExtra));
  const hearings = rawArray(raw.audiencias);
  const firstHearing = hearings[0] || null;
  const courtUnit = text(raw.vara_original) ? `${text(raw.vara_original)}ª Vara` : text(data.vara);
  const instance = text(raw.instancia) ? `${text(raw.instancia)}ª instância` : "—";
  const updatedAt = text(raw.alteradoEm) || data.updated_at || data.created_at;

  const providerMovements = rawArray(raw.movs).map((mov: JsonRecord, index: number) => ({
    id: `provider-${mov?.[4] ?? index}`,
    event_date: text(mov?.[0]),
    title: text(mov?.[1]) || "Movimentação",
    client_summary: text(mov?.[2]),
    internal_note: text(mov?.[3]),
    source: "provider",
  }));

  const movements = providerMovements.length ? providerMovements : timelineEvents;
  const movementTypes = Array.from(new Set(movements.map((item: JsonRecord) => text(item.title) || "Movimentação"))).sort((a, b) => a.localeCompare(b, "pt-BR"));

  const rawAutos = rawArray(raw.anexos).map((item: JsonRecord, index: number) => ({
    id: `raw-auto-${item?.[0] ?? index}`,
    file_name: text(item?.[7]) || `Documento ${index + 1}`,
    source_url: text(item?.[1]),
    file_path: text(item?.[1]),
    file_type: text(item?.[2]) || "Documento",
    created_at: text(item?.[3]) || text(item?.[5]),
  })).filter((doc) => doc.source_url || doc.file_name);

  const autos = storedAutos.length ? storedAutos : rawAutos;
  const documentCount = Math.max(Number(raw.num_anexos || 0), autos.length);
  const term = movementSearch.trim().toLowerCase();
  const fromDate = movementDateFrom ? new Date(`${movementDateFrom}T00:00:00`) : null;
  const toDate = movementDateTo ? new Date(`${movementDateTo}T23:59:59`) : null;
  const filteredMovements = movements.filter((item) => {
    const searchable = [item.title, item.client_summary, item.internal_note, item.event_date].some((v) => String(v || "").toLowerCase().includes(term));
    if (term && !searchable) return false;
    if (movementType !== "all" && (text(item.title) || "Movimentação") !== movementType) return false;
    const itemDate = parseDate(item.event_date);
    if (fromDate && (!itemDate || itemDate < fromDate)) return false;
    if (toDate && (!itemDate || itemDate > toDate)) return false;
    return true;
  });
  const hasMovementFilters = Boolean(term || movementType !== "all" || movementDateFrom || movementDateTo);

  const clearMovementFilters = () => {
    setMovementSearch("");
    setMovementType("all");
    setMovementDateFrom("");
    setMovementDateTo("");
  };

  return (
    <div className="space-y-10 md:space-y-12">
      <section className="space-y-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <h1 className="break-words font-serif text-2xl font-semibold text-primary md:text-3xl">
              {text(data.tribunal) || "Processo"} - Nº {text(data.process_number) || "—"}
            </h1>
            <p className="mt-3 text-sm text-muted-foreground">{text(data.foro) || text(raw.fonte_sistema) || "—"}</p>
          </div>
          <div className="flex flex-col items-start gap-2 lg:items-end">
            <div className="text-sm text-muted-foreground">Atualizado em {fmtDateTime(updatedAt)}</div>
            <Button variant="outline" size="sm" onClick={() => { setSyncMessage(null); void syncDetails(true); }} disabled={syncing}>
              <RefreshCw className={`mr-2 h-4 w-4 ${syncing ? "animate-spin" : ""}`} />
              Sincronizar detalhes
            </Button>
          </div>
        </div>
        {syncing && <div className="rounded-lg border bg-muted/30 p-3 text-sm text-muted-foreground">Solicitando atualização do processo no tribunal...</div>}
        {syncMessage && !syncing && <div className="rounded-lg border bg-muted/20 p-3 text-sm text-muted-foreground">{syncMessage}</div>}

        <div>
          <h2 className="mb-5 text-lg font-semibold">Detalhes do processo</h2>
          <div className="grid gap-x-10 gap-y-4 md:grid-cols-2">
            <div className="space-y-2 text-sm">
              <p>{text(data.area) || "—"} / {instance}</p>
              <p className="font-medium">{text(data.natureza) || text(raw.classeNatureza) || "—"}</p>
              <div className="pt-2">
                <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Motivos / assuntos</p>
                {reasons.length > 0 ? <div className="space-y-1 text-muted-foreground">{reasons.map((item, i) => <p key={`${item}-${i}`}>- {item}</p>)}</div> : <p className="text-sm text-muted-foreground">Nenhum motivo informado pelo provedor.</p>}
              </div>
            </div>
            <dl className="grid grid-cols-[150px_1fr] gap-x-4 gap-y-2 text-sm">
              <dt className="text-muted-foreground">Comarca</dt><dd>{text(data.comarca) || text(raw.comarca_cnj) || "—"}</dd>
              <dt className="text-muted-foreground">Vara</dt><dd>{courtUnit || "—"}</dd>
              <dt className="text-muted-foreground">Data de distribuição</dt><dd>{fmtDate(data.data_distribuicao || text(raw.distribuicaoData))}</dd>
              <dt className="text-muted-foreground">Audiência</dt><dd>{firstHearing ? fmtDateTime(text(firstHearing.datahora ?? firstHearing?.[0])) : "—"}</dd>
              <dt className="text-muted-foreground">Valor da causa</dt><dd>{data.valor != null ? currency.format(Number(data.valor)) : "—"}</dd>
              <dt className="text-muted-foreground">Status</dt><dd>{text(data.status_processual) || (raw.arquivado ? "Arquivado" : "Em andamento")}</dd>
            </dl>
          </div>
        </div>
      </section>

      <PartyTable title="Autor" rows={activeParties} conflictingLawyerKeys={conflictingLawyerKeys} />
      <PartyTable title="Réu" rows={passiveParties} conflictingLawyerKeys={conflictingLawyerKeys} />

      <section className="space-y-5">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <h2 className="text-xl font-semibold">{movements.length} Movimentações</h2>
            <p className="mt-1 text-xs text-muted-foreground">Histórico processual disponível na TK2 Juris.</p>
          </div>
          <div className="relative w-full md:w-72">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input value={movementSearch} onChange={(e) => setMovementSearch(e.target.value)} placeholder="Buscar nas movimentações" className="legal-input h-10 w-full pl-9" />
          </div>
        </div>

        <MovementTimeline movements={filteredMovements} />

        <div className="rounded-xl border bg-muted/10 p-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[1.35fr_1fr_1fr_auto] lg:items-end">
            <label className="space-y-1.5 text-xs font-medium text-muted-foreground">
              <span>Tipo de movimentação</span>
              <select value={movementType} onChange={(e) => setMovementType(e.target.value)} className="legal-input h-10 w-full bg-background px-3 text-sm text-foreground">
                <option value="all">Todos os tipos</option>
                {movementTypes.map((type) => <option key={type} value={type}>{type}</option>)}
              </select>
            </label>
            <label className="space-y-1.5 text-xs font-medium text-muted-foreground">
              <span>Data inicial</span>
              <input type="date" value={movementDateFrom} onChange={(e) => setMovementDateFrom(e.target.value)} className="legal-input h-10 w-full bg-background px-3 text-sm text-foreground" />
            </label>
            <label className="space-y-1.5 text-xs font-medium text-muted-foreground">
              <span>Data final</span>
              <input type="date" value={movementDateTo} onChange={(e) => setMovementDateTo(e.target.value)} className="legal-input h-10 w-full bg-background px-3 text-sm text-foreground" />
            </label>
            <Button variant="outline" onClick={clearMovementFilters} disabled={!hasMovementFilters} className="h-10 w-full lg:w-auto">
              <X className="mr-2 h-4 w-4" />Limpar
            </Button>
          </div>
          <div className="mt-3 text-xs text-muted-foreground">Exibindo {filteredMovements.length} de {movements.length} movimentações.</div>
        </div>

        {filteredMovements.length > 0 ? (
          <div className="overflow-x-auto border-y">
            <table className="w-full min-w-[800px] text-sm">
              <thead className="text-left text-xs text-muted-foreground"><tr><th className="px-3 py-3 font-medium">Data</th><th className="px-3 py-3 font-medium">Tipo</th><th className="px-3 py-3 font-medium">Texto</th></tr></thead>
              <tbody>{filteredMovements.map((item) => <tr key={item.id} className="border-t align-top"><td className="px-3 py-4 whitespace-nowrap">{fmtDate(item.event_date)}</td><td className="px-3 py-4 font-medium">{item.title || "Movimentação"}</td><td className="px-3 py-4 text-muted-foreground">{item.client_summary || item.internal_note || "—"}</td></tr>)}</tbody>
            </table>
          </div>
        ) : (
          <div className="rounded-lg border bg-muted/20 p-5 text-sm text-muted-foreground">
            {syncing ? "Sincronizando movimentações existentes..." : hasMovementFilters ? "Nenhuma movimentação corresponde aos filtros selecionados." : "Nenhuma movimentação foi retornada pela base atual do provedor para este processo."}
          </div>
        )}
      </section>

      <section className="space-y-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div><h2 className="text-xl font-semibold">{documentCount} Autos</h2><p className="mt-1 text-xs text-muted-foreground">Documentos e anexos já existentes na base.</p></div>
          {autos.length > 0 && <Button variant="outline" onClick={() => autos.forEach((doc) => { const url = doc.source_url || doc.file_path; if (url && /^https?:\/\//i.test(url)) window.open(url, "_blank", "noopener,noreferrer"); })}><Download className="mr-2 h-4 w-4" />Abrir autos disponíveis</Button>}
        </div>

        {autos.length > 0 ? (
          <div className="overflow-x-auto border-y">
            <table className="w-full min-w-[720px] text-sm"><thead className="text-left text-xs text-muted-foreground"><tr><th className="px-3 py-3 font-medium">Título</th><th className="px-3 py-3 font-medium">Data</th><th className="px-3 py-3 font-medium">Tipo</th><th className="px-3 py-3 font-medium">Ação</th></tr></thead><tbody>{autos.map((doc) => { const url = doc.source_url || doc.file_path; const canOpen = Boolean(url && /^https?:\/\//i.test(url)); return <tr key={doc.id} className="border-t"><td className="px-3 py-4 font-medium">{doc.file_name || "Documento"}</td><td className="px-3 py-4">{fmtDate(doc.created_at)}</td><td className="px-3 py-4">{doc.file_type || "—"}</td><td className="px-3 py-4">{canOpen ? <a href={url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-medium text-primary hover:underline">Abrir <ExternalLink className="h-3.5 w-3.5" /></a> : "—"}</td></tr>; })}</tbody></table>
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

      <div className="flex items-center gap-2 text-xs text-muted-foreground"><FileText className="h-4 w-4" />Ao abrir a tela, a LEXIA exibe os dados já salvos. Ao clicar em “Atualizar no tribunal”, solicita uma atualização real do processo e incorpora as novas movimentações assim que o provedor concluir. A baixa de novos autos permanece uma ação separada.</div>
    </div>
  );
}
