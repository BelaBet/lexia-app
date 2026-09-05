import { useRef, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useCaseDocuments, useUploadClientDocument, getClientDocumentDownloadUrl } from "@/hooks/useClientPortal";
import type { PortalOutletContext } from "@/hooks/useClientPortal";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, FileText, Upload, Download } from "lucide-react";
import { toast } from "sonner";

// "Documentos" — os arquivos trocados entre o cliente e o escritório dentro
// deste processo. O cliente pode enviar novos documentos aqui a qualquer
// momento (não só em resposta a uma solicitação).
export default function PortalDocuments() {
  const { caseId } = useOutletContext<PortalOutletContext>();
  const { data: documents, isLoading } = useCaseDocuments(caseId);
  const uploadMutation = useUploadClientDocument();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !caseId) return;
    try {
      await uploadMutation.mutateAsync({ caseId, file, uploadedBy: "client" });
      toast.success("Documento enviado!");
    } catch (err) {
      toast.error("Erro ao enviar documento", { description: err instanceof Error ? err.message : undefined });
    } finally {
      e.target.value = "";
    }
  };

  const handleDownload = async (path: string) => {
    try {
      const url = await getClientDocumentDownloadUrl(path);
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (err) {
      toast.error("Erro ao abrir documento", { description: err instanceof Error ? err.message : undefined });
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-xl font-serif font-bold text-foreground">Documentos</h1>
        <input ref={fileInputRef} type="file" className="hidden" onChange={handleFileSelected} />
        <Button size="sm" onClick={() => fileInputRef.current?.click()} disabled={uploadMutation.isPending}>
          {uploadMutation.isPending ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Upload className="w-4 h-4 mr-1.5" />}
          Enviar documento
        </Button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
        </div>
      ) : !documents || documents.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhum documento trocado neste processo ainda.</p>
      ) : (
        <div className="space-y-2">
          {documents.map((doc) => (
            <Card key={doc.id}>
              <CardContent className="pt-4 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 min-w-0">
                  <FileText className="w-4 h-4 text-primary shrink-0" />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{doc.file_name}</p>
                    <p className="text-xs text-muted-foreground">
                      {format(new Date(doc.created_at), "d 'de' MMMM 'de' yyyy", { locale: ptBR })}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Badge variant="outline">{doc.uploaded_by === "client" ? "Enviado por você" : "Do escritório"}</Badge>
                  <Button size="icon" variant="ghost" onClick={() => handleDownload(doc.file_path)} title="Baixar">
                    <Download className="w-4 h-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
