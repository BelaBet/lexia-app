import { useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { Loader2, Send, Trash2, Scale, Gavel, Users, Landmark, Upload, FileText, Download } from "lucide-react";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  Publication,
  usePublicationFollowups,
  useAddPublicationFollowup,
  useDeletePublicationFollowup,
  usePublicationAttachments,
  useUploadPublicationAttachment,
  useDeletePublicationAttachment,
  getPublicationAttachmentUrl,
} from "@/hooks/usePublications";
import { toast } from "sonner";

interface PublicationDetailDialogProps {
  publication: Publication | null;
  onOpenChange: (open: boolean) => void;
}

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

export function PublicationDetailDialog({ publication, onOpenChange }: PublicationDetailDialogProps) {
  const [note, setNote] = useState("");
  const { data: followups = [], isLoading } = usePublicationFollowups(publication?.id || null);
  const addFollowup = useAddPublicationFollowup();
  const deleteFollowup = useDeletePublicationFollowup();
  const { data: attachments = [] } = usePublicationAttachments(publication?.id || null);
  const uploadAttachment = useUploadPublicationAttachment();
  const deleteAttachment = useDeletePublicationAttachment();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const currencyFormatter = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

  if (!publication) return null;

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
    <Dialog open={!!publication} onOpenChange={(open) => !open && onOpenChange(false)}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 flex-wrap">
            {publication.process_number || "Publicação sem número de processo"}
            <Badge variant="outline">{sourceLabels[publication.source]}</Badge>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-5">
          <div>
            <p className="text-sm font-medium text-muted-foreground mb-1">Teor</p>
            <p className="text-sm whitespace-pre-wrap">{publication.content}</p>
            <p className="text-xs text-muted-foreground mt-2">
              Publicado em {format(parseISO(publication.published_date), "dd/MM/yyyy", { locale: ptBR })}
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

            {isLoading ? (
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
        </div>
      </DialogContent>
    </Dialog>
  );
}
