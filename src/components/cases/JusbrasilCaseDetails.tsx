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
  if (!data) return null;

  const raw = (data.raw_data && typeof data.raw_data === "object" ? data.raw_data : {}) as Record<string, unknown>;
  const detailUrl = safeUrl(rawValue(raw, "Link detalhes", "link_detalhes", "url_detalhes"));
  const attachmentUrl = safeUrl(rawValue(raw, "URL Anexo", "url_anexo", "URL anexo"));
  const activeLawyers = rawValue(raw, "Advogados (parte ativa)");
  const activeOab = rawValue(raw, "OAB advogado (parte ativa)");
  const passiveLawyers = rawValue(raw, "Advogados (parte passiva)");
  const passiveOab = rawValue(raw, "OAB advogado (parte passiva)");
  const allParties = rawValue(raw, "Todas partes", "todas_partes");
  const hearingDate = rawValue(raw, "Data Audiência", "data_audiencia");
  const hearingType = rawValue(raw, "Tipo Audiência", "tipo_audiencia");
  const hearingPlace = rawValue(raw, "Local Audiência", "local_audiencia");
  const sentenceDate = rawValue(raw, "Data Sentença", "data_sentenca");
  const sentenceClass = rawValue(raw, "Classificação sentença", "classificacao_sentenca");
  const sentenceText = rawValue(raw, "Texto Sentença", "texto_sentenca", "Sentença");

  const Field = ({ label, value }: { label: string; value: unknown }) => text(value) ? <div><p className="text-xs text-muted-foreground">{label}</p><p className="text-sm whitespace-pre-wrap break-words">{text(value)}</p></div> : null;

  return (
    <div className="space-y-4 border-t pt-4">
      <div><p className="font-semibold">Dados importados do JusBrasil</p><p className="text-xs text-muted-foreground">Informações preservadas pela LEXIA a partir do relatório da busca.</p></div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 rounded-lg border p-3">
        <Field label="Tribunal" value={data.tribunal} /><Field label="Área" value={data.area} />
        <Field label="Natureza" value={data.natureza} /><Field label="Foro" value={data.foro} />
        <Field label="Vara" value={data.vara} /><Field label="Comarca" value={data.comarca} />
        <Field label="Partes" value={allParties || [data.partes_ativas, data.partes_passivas]} />
        <Field label="Advogados" value={data.advogados} />
        <Field label="Advogados — parte ativa" value={activeLawyers} /><Field label="OAB — parte ativa" value={activeOab} />
        <Field label="Advogados — parte passiva" value={passiveLawyers} /><Field label="OAB — parte passiva" value={passiveOab} />
      </div>
      {(data.ultima_movimentacao_texto || data.ultima_movimentacao_tipo || data.juiz) && <div className="rounded-lg border p-3 space-y-2"><p className="text-sm font-semibold">Última movimentação</p><Field label="Data" value={data.ultima_movimentacao_data} /><Field label="Tipo" value={data.ultima_movimentacao_tipo} /><Field label="Movimentação" value={data.ultima_movimentacao_texto} /><Field label="Juiz" value={data.juiz} /></div>}
      {(hearingDate || hearingType || hearingPlace) && <div className="rounded-lg border p-3 grid grid-cols-1 md:grid-cols-3 gap-3"><Field label="Data da audiência" value={hearingDate} /><Field label="Tipo de audiência" value={hearingType} /><Field label="Local da audiência" value={hearingPlace} /></div>}
      {(sentenceDate || sentenceClass || sentenceText) && <div className="rounded-lg border p-3 space-y-2"><p className="text-sm font-semibold">Sentença / situação</p><Field label="Data" value={sentenceDate} /><Field label="Classificação" value={sentenceClass} /><Field label="Sentença" value={sentenceText} /><Field label="Status processual" value={data.status_processual} /></div>}
      {(detailUrl || attachmentUrl) && <div className="rounded-lg border p-3 space-y-2"><p className="text-sm font-semibold">Links e documentos já disponibilizados</p>{attachmentUrl && <a href={attachmentUrl} target="_blank" rel="noreferrer" className="flex items-center gap-2 text-sm underline">Abrir anexo <ExternalLink className="h-3.5 w-3.5" /></a>}{detailUrl && <a href={detailUrl} target="_blank" rel="noreferrer" className="flex items-center gap-2 text-sm underline">Ver detalhes da origem <ExternalLink className="h-3.5 w-3.5" /></a>}<p className="text-xs text-muted-foreground">A LEXIA não solicita novos autos automaticamente nesta tela.</p></div>}
      <details className="rounded-lg border p-3"><summary className="cursor-pointer text-sm font-medium">Dados completos recebidos da API</summary><pre className="mt-3 max-h-72 overflow-auto whitespace-pre-wrap break-words rounded bg-muted/40 p-3 text-xs">{JSON.stringify(raw, null, 2)}</pre></details>
    </div>
  );
}
