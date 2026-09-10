import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { ExternalLink, Loader2 } from "lucide-react";

function text(value: unknown) {
  if (value == null || value === "") return "";
  if (Array.isArray(value)) return value.map(text).filter(Boolean).join("; ");
  if (typeof value === "object") return Object.values(value as Record<string, unknown>).map(text).filter(Boolean).join("; ");
  return String(value);
}

function rawValue(raw: Record<string, unknown>, ...keys: string[]) {
  for (const key of keys) if (raw[key] != null && raw[key] !== "") return raw[key];
  return null;
}

function safeUrl(value: unknown) {
  const candidate = text(value).trim();
  return /^https?:\/\//i.test(candidate) ? candidate : null;
}

export function JusbrasilCaseDetails({ caseId }: { caseId: string }) {
  const { data, isLoading } = useQuery({
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

  if (isLoading) return <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Carregando dados do JusBrasil...</div>;
  if (!data) return <p className="text-sm text-muted-foreground">Este processo ainda não possui dados detalhados importados do JusBrasil.</p>;

  const raw = (data.raw_data && typeof data.raw_data === "object" ? data.raw_data : {}) as Record<string, unknown>;
  const detailUrl = safeUrl(rawValue(raw, "Link detalhes", "link_detalhes", "url_detalhes"));
  const attachmentUrl = safeUrl(rawValue(raw, "URL Anexo", "url_anexo", "URL anexo"));
  const activeLawyers = rawValue(raw, "Advogados (parte ativa)", "Advogados da parte ativa");
  const activeOab = rawValue(raw, "OAB advogado (parte ativa)", "OAB advogado da parte ativa");
  const passiveLawyers = rawValue(raw, "Advogados (parte passiva)", "Advogados da parte passiva");
  const passiveOab = rawValue(raw, "OAB advogado (parte passiva)", "OAB advogado da parte passiva");
  const allParties = rawValue(raw, "Todas partes", "todas_partes");
  const hearingDate = rawValue(raw, "Data Audiência", "data_audiencia");
  const hearingType = rawValue(raw, "Tipo Audiência", "tipo_audiencia");
  const hearingPlace = rawValue(raw, "Local Audiência", "local_audiencia");
  const sentenceDate = rawValue(raw, "Data Sentença", "data_sentenca");
  const sentenceClass = rawValue(raw, "Classificação sentença", "classificacao_sentenca");
  const sentenceText = rawValue(raw, "Texto Sentença", "texto_sentenca", "Sentença");

  const Field = ({ label, value }: { label: string; value: unknown }) => text(value) ? (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-sm whitespace-pre-wrap break-words">{text(value)}</p>
    </div>
  ) : null;

  const allRawEntries = Object.entries(raw).filter(([, value]) => text(value));

  return (
    <div className="space-y-4">
      <div>
        <p className="font-semibold">Informações completas do processo</p>
        <p className="text-xs text-muted-foreground">Tudo o que foi recebido do JusBrasil fica preservado e consultável dentro da LEXIA.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 rounded-lg border p-3">
        <Field label="Número do processo" value={data.process_number} />
        <Field label="Tribunal" value={data.tribunal} />
        <Field label="Área" value={data.area} />
        <Field label="Natureza" value={data.natureza} />
        <Field label="Foro" value={data.foro} />
        <Field label="Vara" value={data.vara} />
        <Field label="Comarca" value={data.comarca} />
        <Field label="Valor" value={data.valor} />
        <Field label="Data de distribuição" value={data.data_distribuicao} />
        <Field label="Partes" value={allParties || [data.partes_ativas, data.partes_passivas]} />
        <Field label="Parte ativa" value={data.partes_ativas} />
        <Field label="Parte passiva" value={data.partes_passivas} />
        <Field label="Todos os advogados" value={data.advogados} />
        <Field label="Advogados — parte ativa" value={activeLawyers} />
        <Field label="OAB — parte ativa" value={activeOab} />
        <Field label="Advogados — parte passiva" value={passiveLawyers} />
        <Field label="OAB — parte passiva" value={passiveOab} />
      </div>

      {(data.ultima_movimentacao_texto || data.ultima_movimentacao_tipo || data.juiz || data.ultima_movimentacao_data) && (
        <div className="rounded-lg border p-3 space-y-2">
          <p className="text-sm font-semibold">Última movimentação</p>
          <Field label="Data" value={data.ultima_movimentacao_data} />
          <Field label="Tipo" value={data.ultima_movimentacao_tipo} />
          <Field label="Movimentação" value={data.ultima_movimentacao_texto} />
          <Field label="Juiz" value={data.juiz} />
        </div>
      )}

      {(hearingDate || hearingType || hearingPlace) && (
        <div className="rounded-lg border p-3 grid grid-cols-1 md:grid-cols-3 gap-3">
          <Field label="Data da audiência" value={hearingDate} />
          <Field label="Tipo de audiência" value={hearingType} />
          <Field label="Local da audiência" value={hearingPlace} />
        </div>
      )}

      {(sentenceDate || sentenceClass || sentenceText || data.status_processual) && (
        <div className="rounded-lg border p-3 space-y-2">
          <p className="text-sm font-semibold">Sentença / situação processual</p>
          <Field label="Data" value={sentenceDate} />
          <Field label="Classificação" value={sentenceClass} />
          <Field label="Sentença" value={sentenceText} />
          <Field label="Status processual" value={data.status_processual} />
          <Field label="Total de movimentações" value={rawValue(raw, "Total movs.", "total_movs")} />
          <Field label="Arquivado" value={rawValue(raw, "Arquivado", "arquivado")} />
          <Field label="Extinto" value={rawValue(raw, "Extinto", "extinto")} />
          <Field label="Suspenso" value={rawValue(raw, "Suspenso", "suspenso")} />
          <Field label="Transitado em julgado" value={rawValue(raw, "Transitado julg.", "transitado_julgado")} />
          <Field label="Liminar" value={rawValue(raw, "Liminar", "liminar")} />
          <Field label="Recurso" value={rawValue(raw, "Recurso", "recurso")} />
          <Field label="Risco" value={rawValue(raw, "Risco", "risco")} />
        </div>
      )}

      {(detailUrl || attachmentUrl) && (
        <div className="rounded-lg border p-3 space-y-2">
          <p className="text-sm font-semibold">Links e documentos já disponibilizados</p>
          {attachmentUrl && <a href={attachmentUrl} target="_blank" rel="noreferrer" className="flex items-center gap-2 text-sm underline">Abrir anexo <ExternalLink className="h-3.5 w-3.5" /></a>}
          {detailUrl && <a href={detailUrl} target="_blank" rel="noreferrer" className="flex items-center gap-2 text-sm underline">Ver detalhes da origem <ExternalLink className="h-3.5 w-3.5" /></a>}
          <p className="text-xs text-muted-foreground">A LEXIA mostra os arquivos e links que já vierem no retorno. Novos autos não são solicitados automaticamente.</p>
        </div>
      )}

      {allRawEntries.length > 0 && (
        <div className="rounded-lg border p-3">
          <div className="mb-3">
            <p className="text-sm font-semibold">Todos os campos recebidos da API</p>
            <p className="text-xs text-muted-foreground">Nenhum campo retornado pelo provedor é descartado.</p>
          </div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {allRawEntries.map(([key, value]) => {
              const url = safeUrl(value);
              return (
                <div key={key} className="rounded-md bg-muted/30 p-2">
                  <p className="text-xs text-muted-foreground">{key}</p>
                  {url ? (
                    <a href={url} target="_blank" rel="noreferrer" className="mt-1 inline-flex items-center gap-1 break-all text-sm underline">Abrir conteúdo <ExternalLink className="h-3.5 w-3.5" /></a>
                  ) : (
                    <p className="mt-1 whitespace-pre-wrap break-words text-sm">{text(value)}</p>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      <details className="rounded-lg border p-3">
        <summary className="cursor-pointer text-sm font-medium">JSON original completo</summary>
        <pre className="mt-3 max-h-96 overflow-auto whitespace-pre-wrap break-words rounded bg-muted/40 p-3 text-xs">{JSON.stringify(raw, null, 2)}</pre>
      </details>
    </div>
  );
}
