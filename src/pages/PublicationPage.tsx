import { useRef, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Kanban, Loader2, Send, Trash2, Scale, Gavel, Users, Landmark, Upload, FileText, Download, Sparkles, AlertTriangle, History, Pencil } from "lucide-react";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import {
  usePublication,
  usePublicationFollowups,
  useAddPublicationFollowup,
  useDeletePublicationFollowup,
  usePublicationAttachments,
  useUploadPublicationAttachment,
  useDeletePublicationAttachment,
  useUpdatePublicationStage,
  usePublicationStageHistory,
  getPublicationAttachmentUrl,
  PIPELINE_STAGES,
  PipelineStage,
} from "@/hooks/usePublications";
import { PublicationDialog } from "@/components/publications/PublicationDialog";
import { toast } from "sonner";

// Textos que costumam trazer prazo (sentença, intimação) — quando nenhum
// prazo foi definido manualmente nem detectado pelo classificador
// automático, avisamos para o advogado conferir, em vez de deixar passar
// batido. O classificador só reconhece um conjunto fixo de "atos" (ver
// _shared/deadlineClassifier.ts) e não cobre tudo — ex.: uma sentença não
// cita o nome do recurso cabível nela mesma.
const DEADLINE_HINT_PATTERN = /sentença|intimaç/i;

const sourceLabels: Record<string, string> = {
  manual: "Manual",
  jusbrasil: "JusBrasil",
  webjur: "WebJur",
  escavador: "Escavador",
  outro: "Outro",
};

const roleLabels: Record<string, string> = {
  advogado: "Advogado",
  operacional: "Operacional",
};

const areaLabels: Record<string, string> = {
  civel: "Cível",
  criminal: "Criminal",
  trabalhista: "Trabalhista",
  administrativo_tributario: "Administrativo/Tributário",
};

const stageLabel = (stage: PipelineStage | null) => PIPELINE_STAGES.find((s) => s.value === stage)?.label ?? stage ?? "—";

// Publicações do Diário Oficial (JusBrasil) trazem duas datas distintas:
// disponibilização (quando o ato entra no sistema) e publicação (o
// primeiro dia útil seguinte, por força da Lei 11.419/2006 art. 4º §3º —
// é essa a data usada para contar prazo, e a que fica em published_date).
// Mostramos as duas para deixar claro que a diferença de um dia é
// esperada, não um erro.
function extractAvailableDate(rawPayload: unknown): Date | null {
  if (!rawPayload || typeof rawPayload !== "object") return null;
  const availableAt = (rawPayload as Record<string, unknown>).available_at;
  if (!availableAt || typeof availableAt !== "object") return null;
  const ms = (availableAt as Record<string, unknown>).$date;
  return typeof ms === "number" ? new Date(ms) : null;
}

export default function PublicationPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  // Mesmo cuidado do CaseDetails.tsx: a troca de abas em "/" é só estado
  // local (não muda a URL), então navigate(-1) sempre voltaria para o
  // Dashboard em vez da aba de onde o usuário veio.
  const fromTab = (location.state as { from?: string } | null)?.from;
  const goBack = () => {
    if (fromTab) navigate("/", { state: { activeTab: fromTab } });
    else navigate(-1);
  };

  const { data: publication, isLoading, isError } = usePublication(id || null);
  const [note, setNote] = useState("");
  const [editing, setEditing] = useState(false);
  const { data: followups = [], isLoading: isLoadingFollowups } = usePublicationFollowups(id || null);
  const addFollowup = useAddPublicationFollowup();
  const deleteFollowup = useDeletePublicationFollowup();
  const { data: attachments = [] } = usePublicationAttachments(id || null);
  const uploadAttachment = useUploadPublicationAttachment();
  const deleteAttachment = useDeletePublicationAttachment();
  const updateStage = useUpdatePublicationStage();
  const { data: stageHistory = [] } = usePublicationStageHistory(id || null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const currencyFormatter = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

  if (isLoading) {
    return <div className="min-h-screen bg-background p-6"><p className="text-sm text-muted-foreground">Carregando publicação...</p></div>;
  }

  if (isError || !publication) {
    return (
      <div className="min-h-screen bg-background p-6">
        <Button variant="outline" onClick={goBack}><ArrowLeft className="mr-2 h-4 w-4" />Voltar</Button>
        <div className="mt-6 rounded-lg border p-6"><h1 className="text-xl font-semibold">Publicação não encontrada</h1></div>
      </div>
    );
  }

  const availableDate = extractAvailableDate(publication.raw_payload);
  const availableDateStr = availableDate ? format(availableDate, "yyyy-MM-dd") : null;

  const handleAddFollowup = async () => {
    if (!note.trim()) return;
    await addFollowup.mutateAsync({ publicationId: publication.id, note: note.trim() });
    setNote("");
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    await uploadAttachment.mutateAsync({ publicationId: publication.id, file });
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleDownload = async (filePath: string) => {
    try {
      const url = await getPublicationAttachmentUrl(filePath);
      window.open(url, "_blank", "noopener,noreferrer");
    } catch {
      toast.error("Erro ao abrir documento");
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <main className="mx-auto w-full max-w-[900px] p-4 pb-10 md:p-8 space-y-6">
        <div>
          <div className="flex items-center justify-between">
            <Button variant="ghost" onClick={goBack} className="-ml-3">
              <ArrowLeft className="mr-2 h-4 w-4" />Voltar para Publicações
            </Button>
            <Button variant="outline" size="sm" onClick={() => setEditing(true)} className="gap-1.5">
              <Pencil className="w-3.5 h-3.5" /> Editar
            </Button>
          </div>
          <div className="flex items-center gap-2 flex-wrap mt-2">
            <h1 className="font-serif text-2xl font-bold">
              {publication.process_number || "Publicação sem número de processo"}
            </h1>
            <Badge variant="outline">{sourceLabels[publication.source]}</Badge>
          </div>
        </div>

        {!publication.external_deadline && !publication.internal_deadline && !publication.classified_act_name &&
          DEADLINE_HINT_PATTERN.test(publication.content) && (
          <div className="rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-950/20 p-3 flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <p className="text-sm text-amber-800 dark:text-amber-400">
              Este teor menciona sentença/intimação, mas nenhum prazo foi definido nem detectado automaticamente.
              Confira se há prazo a cumprir e defina manualmente em "Editar".
            </p>
          </div>
        )}

        {/* Kanban de acompanhamento */}
        <div className="rounded-lg border p-4">
          <p className="text-sm font-semibold flex items-center gap-1.5 mb-3">
            <Kanban className="w-4 h-4" /> Etapa de Acompanhamento
          </p>
          <div className="flex flex-wrap gap-2">
            {PIPELINE_STAGES.map((stage, index) => {
              const currentIndex = PIPELINE_STAGES.findIndex((s) => s.value === publication.pipeline_stage);
              const isCurrent = stage.value === publication.pipeline_stage;
              const isPast = index < currentIndex;
              return (
                <button
                  key={stage.value}
                  type="button"
                  disabled={updateStage.isPending || isCurrent}
                  onClick={() => updateStage.mutate({ id: publication.id, pipeline_stage: stage.value })}
                  className={cn(
                    "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                    isCurrent && "border-primary bg-primary text-primary-foreground",
                    !isCurrent && isPast && "border-primary/30 bg-primary/5 text-primary hover:bg-primary/10",
                    !isCurrent && !isPast && "border-border text-muted-foreground hover:bg-muted",
                  )}
                >
                  {stage.label}
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <p className="text-sm font-medium text-muted-foreground mb-1">Teor</p>
          <p className="text-sm whitespace-pre-wrap">{publication.content}</p>
          <p className="text-xs text-muted-foreground mt-2">
            Publicado em {format(parseISO(publication.published_date), "dd/MM/yyyy", { locale: ptBR })}
            {availableDate && availableDateStr !== publication.published_date && (
              <>
                {" "}· Disponibilizado em {format(availableDate, "dd/MM/yyyy", { locale: ptBR })}
                {" "}(a data de publicação é o 1º dia útil seguinte, por força da Lei 11.419/2006)
              </>
            )}
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="rounded-lg border p-3 space-y-1">
            <div className="flex items-center gap-1.5 text-sm font-semibold">
              <Gavel className="w-4 h-4" /> Prazo Externo
            </div>
            {publication.external_deadline ? (
              <>
                <p className="text-sm">{format(parseISO(publication.external_deadline), "dd/MM/yyyy", { locale: ptBR })}</p>
                {publication.external_responsible_name && (
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    <Users className="w-3 h-3" />
                    {publication.external_responsible_name}
                    {publication.external_responsible_role && ` (${roleLabels[publication.external_responsible_role]})`}
                  </p>
                )}
              </>
            ) : (
              <p className="text-xs text-muted-foreground">Não definido</p>
            )}
          </div>

          <div className="rounded-lg border p-3 space-y-1">
            <div className="flex items-center gap-1.5 text-sm font-semibold">
              <Scale className="w-4 h-4" /> Prazo Interno
            </div>
            {publication.internal_deadline ? (
              <>
                <p className="text-sm">{format(parseISO(publication.internal_deadline), "dd/MM/yyyy", { locale: ptBR })}</p>
                {publication.internal_responsible_name && (
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    <Users className="w-3 h-3" />
                    {publication.internal_responsible_name}
                    {publication.internal_responsible_role && ` (${roleLabels[publication.internal_responsible_role]})`}
                  </p>
                )}
              </>
            ) : (
              <p className="text-xs text-muted-foreground">Não definido</p>
            )}
          </div>
        </div>

        {publication.classified_act_name && (
          <div className={cn("rounded-lg border p-3 space-y-1", publication.classified_needs_review ? "border-amber-300 bg-amber-50 dark:bg-amber-950/20" : "border-primary/30 bg-primary/5")}>
            <div className="flex items-center gap-1.5 text-sm font-semibold">
              {publication.classified_needs_review ? (
                <AlertTriangle className="w-4 h-4 text-amber-600" />
              ) : (
                <Sparkles className="w-4 h-4 text-primary" />
              )}
              Ato Detectado Automaticamente
              <Badge variant="outline" className="ml-auto text-[10px]">
                {areaLabels[publication.classified_area ?? ""] ?? publication.classified_area}
              </Badge>
            </div>
            <p className="text-sm font-medium">{publication.classified_act_name}</p>
            {publication.classified_needs_review ? (
              <p className="text-xs text-amber-700 dark:text-amber-500">
                Prazo variável — confira manualmente. {publication.classified_rule_note}
              </p>
            ) : (
              <>
                <p className="text-sm">
                  Prazo calculado:{" "}
                  {publication.classified_deadline
                    ? format(parseISO(publication.classified_deadline), "dd/MM/yyyy", { locale: ptBR })
                    : "—"}
                </p>
                <p className="text-xs text-muted-foreground">{publication.classified_rule_note}</p>
              </>
            )}
            <p className="text-[10px] text-muted-foreground pt-1">
              Informação complementar — não substitui os prazos externo/interno acima. Confira sempre.
            </p>
          </div>
        )}

        {(publication.vara || publication.comarca || publication.valor_causa != null ||
          publication.data_abertura_tribunal || publication.data_aceitacao) && (
          <div className="rounded-lg border p-3 space-y-3">
            <p className="text-sm font-semibold flex items-center gap-1.5">
              <Scale className="w-4 h-4" /> Dados Processuais
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
              <div>
                <p className="text-xs text-muted-foreground flex items-center gap-1"><Gavel className="w-3 h-3" /> Vara</p>
                <p className="font-medium">{publication.vara || "—"}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground flex items-center gap-1"><Landmark className="w-3 h-3" /> Comarca</p>
                <p className="font-medium">{publication.comarca || "—"}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Valor da Causa</p>
                <p className="font-medium">
                  {publication.valor_causa != null ? currencyFormatter.format(publication.valor_causa) : "—"}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Abertura no Tribunal</p>
                <p className="font-medium">
                  {publication.data_abertura_tribunal
                    ? format(parseISO(publication.data_abertura_tribunal), "dd/MM/yyyy", { locale: ptBR })
                    : "—"}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Data de Aceitação</p>
                <p className="font-medium">
                  {publication.data_aceitacao
                    ? format(parseISO(publication.data_aceitacao), "dd/MM/yyyy", { locale: ptBR })
                    : "—"}
                </p>
              </div>
            </div>
          </div>
        )}

        <div>
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-semibold flex items-center gap-1.5">
              <FileText className="w-4 h-4" /> Documentos
            </p>
            <Button type="button" variant="outline" size="sm" onClick={() => fileInputRef.current?.click()} disabled={uploadAttachment.isPending}>
              {uploadAttachment.isPending ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Upload className="w-3.5 h-3.5 mr-1.5" />}
              Anexar
            </Button>
            <input ref={fileInputRef} type="file" className="hidden" onChange={handleFileSelect} />
          </div>
          {attachments.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              Nenhum documento anexado ainda. Publicações importadas automaticamente via API trazem o documento do processo quando disponível.
            </p>
          ) : (
            <div className="space-y-2">
              {attachments.map((a) => (
                <div key={a.id} className="flex items-center justify-between gap-2 bg-muted/40 rounded-lg p-2.5">
                  <button
                    type="button"
                    onClick={() => handleDownload(a.file_path)}
                    className="flex items-center gap-2 text-sm text-left hover:underline min-w-0"
                  >
                    <Download className="w-3.5 h-3.5 shrink-0 text-muted-foreground" />
                    <span className="truncate">{a.file_name}</span>
                    {a.source === "api" && (
                      <Badge variant="outline" className="text-[10px] shrink-0">API</Badge>
                    )}
                  </button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="shrink-0 h-7 w-7 text-muted-foreground hover:text-destructive"
                    onClick={() => deleteAttachment.mutate({ id: a.id, publicationId: publication.id, filePath: a.file_path })}
                    aria-label="Remover documento"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>

        {publication.tese && (
          <div>
            <p className="text-sm font-medium text-muted-foreground mb-1">Tese Jurídica</p>
            <p className="text-sm whitespace-pre-wrap bg-muted/50 rounded-lg p-3">{publication.tese}</p>
          </div>
        )}

        <Separator />

        <div>
          <p className="text-sm font-semibold mb-3 flex items-center gap-1.5">
            <History className="w-4 h-4" /> Histórico de Etapas
          </p>
          {stageHistory.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhuma movimentação registrada ainda.</p>
          ) : (
            <div className="space-y-2">
              {stageHistory.map((h) => (
                <div key={h.id} className="flex flex-col gap-1 bg-muted/40 rounded-lg p-2.5 text-sm sm:flex-row sm:items-center sm:justify-between">
                  <span>
                    {h.from_stage ? (
                      <>{stageLabel(h.from_stage)} → <span className="font-medium">{stageLabel(h.to_stage)}</span></>
                    ) : (
                      <>Criada em <span className="font-medium">{stageLabel(h.to_stage)}</span></>
                    )}
                  </span>
                  <span className="text-xs text-muted-foreground sm:text-right">
                    <span className="font-medium text-foreground">{h.user_name?.trim() || "Usuário sem nome"}</span>{" · "}
                    {format(new Date(h.changed_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        <Separator />

        <div>
          <p className="text-sm font-semibold mb-3">Followup / Acompanhamento</p>

          <div className="flex gap-2 mb-4">
            <Textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Adicionar uma atualização sobre o andamento..."
              rows={2}
              className="flex-1"
            />
            <Button
              type="button"
              size="icon"
              onClick={handleAddFollowup}
              disabled={!note.trim() || addFollowup.isPending}
            >
              {addFollowup.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            </Button>
          </div>

          {isLoadingFollowups ? (
            <div className="flex justify-center py-4">
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            </div>
          ) : followups.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">Nenhum followup registrado ainda.</p>
          ) : (
            <div className="space-y-3">
              {followups.map((f) => (
                <div key={f.id} className="flex items-start justify-between gap-2 bg-muted/40 rounded-lg p-3">
                  <div>
                    <p className="text-sm whitespace-pre-wrap">{f.note}</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {format(new Date(f.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="shrink-0 h-7 w-7 text-muted-foreground hover:text-destructive"
                    onClick={() => deleteFollowup.mutate({ id: f.id, publicationId: publication.id })}
                    aria-label="Remover followup"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>

      <PublicationDialog open={editing} onOpenChange={setEditing} publication={publication} />
    </div>
  );
}
