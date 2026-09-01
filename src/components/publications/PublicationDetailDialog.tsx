import { useState } from "react";
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
import { Loader2, Send, Trash2, Scale, Gavel, Users } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  Publication,
  usePublicationFollowups,
  useAddPublicationFollowup,
  useDeletePublicationFollowup,
} from "@/hooks/usePublications";

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

  if (!publication) return null;

  const handleAddFollowup = async () => {
    if (!note.trim()) return;
    await addFollowup.mutateAsync({ publicationId: publication.id, note: note.trim() });
    setNote("");
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
              Publicado em {format(new Date(publication.published_date), "dd/MM/yyyy", { locale: ptBR })}
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="rounded-lg border p-3 space-y-1">
              <div className="flex items-center gap-1.5 text-sm font-semibold">
                <Gavel className="w-4 h-4" /> Prazo Externo
              </div>
              {publication.external_deadline ? (
                <>
                  <p className="text-sm">{format(new Date(publication.external_deadline), "dd/MM/yyyy", { locale: ptBR })}</p>
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
                  <p className="text-sm">{format(new Date(publication.internal_deadline), "dd/MM/yyyy", { locale: ptBR })}</p>
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
