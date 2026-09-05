import { useRef, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useCaseRequests, useFulfillRequest, useUploadClientDocument } from "@/hooks/useClientPortal";
import type { PortalOutletContext } from "@/hooks/useClientPortal";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, CheckCircle2, Upload } from "lucide-react";
import { toast } from "sonner";

const TYPE_LABEL: Record<string, string> = {
  document: "Documento",
  signature: "Assinatura",
  questionnaire: "Questionário",
  other: "Outro",
};

// "Solicitações" — pedidos do escritório para o cliente (enviar um
// documento, assinar algo, responder um questionário). Quando o pedido é de
// um documento, o cliente pode responder enviando o arquivo diretamente
// aqui; caso contrário, só marca como resolvido.
export default function PortalRequests() {
  const { caseId } = useOutletContext<PortalOutletContext>();
  const { data: requests, isLoading } = useCaseRequests(caseId);
  const fulfillMutation = useFulfillRequest();
  const uploadMutation = useUploadClientDocument();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [activeRequestId, setActiveRequestId] = useState<string | null>(null);

  const handleFulfill = async (requestId: string) => {
    if (!caseId) return;
    try {
      await fulfillMutation.mutateAsync({ requestId, caseId });
      toast.success("Marcado como concluído!");
    } catch (err) {
      toast.error("Erro ao atualizar solicitação", { description: err instanceof Error ? err.message : undefined });
    }
  };

  const handleUploadForRequest = (requestId: string) => {
    setActiveRequestId(requestId);
    fileInputRef.current?.click();
  };

  const handleFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    const requestId = activeRequestId;
    if (!file || !caseId || !requestId) return;
    try {
      await uploadMutation.mutateAsync({ caseId, file, uploadedBy: "client", requestId });
      toast.success("Documento enviado — solicitação concluída!");
    } catch (err) {
      toast.error("Erro ao enviar documento", { description: err instanceof Error ? err.message : undefined });
    } finally {
      e.target.value = "";
      setActiveRequestId(null);
    }
  };

  const pending = (requests ?? []).filter((r) => r.status === "pending");
  const resolved = (requests ?? []).filter((r) => r.status !== "pending");

  return (
    <div className="space-y-5">
      <h1 className="text-xl font-serif font-bold text-foreground">Solicitações</h1>
      <input ref={fileInputRef} type="file" className="hidden" onChange={handleFileSelected} />

      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
        </div>
      ) : !requests || requests.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhuma solicitação por enquanto.</p>
      ) : (
        <>
          {pending.length > 0 && (
            <div className="space-y-2">
              <p className="text-sm font-medium text-muted-foreground">Pendentes</p>
              {pending.map((req) => (
                <Card key={req.id} className="border-amber-300 bg-amber-50/50 dark:bg-amber-950/10">
                  <CardContent className="pt-4 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-medium text-foreground">{req.title}</p>
                      <Badge variant="outline">{TYPE_LABEL[req.type] ?? req.type}</Badge>
                    </div>
                    {req.description && <p className="text-sm text-muted-foreground">{req.description}</p>}
                    {req.due_date && (
                      <p className="text-xs text-muted-foreground">
                        Prazo: {format(new Date(req.due_date + "T00:00:00"), "d/MM/yyyy", { locale: ptBR })}
                      </p>
                    )}
                    <div className="flex gap-2 pt-1">
                      {req.type === "document" ? (
                        <Button
                          size="sm"
                          onClick={() => handleUploadForRequest(req.id)}
                          disabled={uploadMutation.isPending}
                        >
                          {uploadMutation.isPending && activeRequestId === req.id ? (
                            <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
                          ) : (
                            <Upload className="w-4 h-4 mr-1.5" />
                          )}
                          Enviar documento
                        </Button>
                      ) : (
                        <Button size="sm" onClick={() => handleFulfill(req.id)} disabled={fulfillMutation.isPending}>
                          {fulfillMutation.isPending ? (
                            <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
                          ) : (
                            <CheckCircle2 className="w-4 h-4 mr-1.5" />
                          )}
                          Marcar como concluído
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          {resolved.length > 0 && (
            <div className="space-y-2">
              <p className="text-sm font-medium text-muted-foreground">Concluídas</p>
              {resolved.map((req) => (
                <Card key={req.id}>
                  <CardContent className="pt-4 flex items-center justify-between gap-2">
                    <p className="text-foreground">{req.title}</p>
                    <Badge variant={req.status === "fulfilled" ? "default" : "secondary"}>
                      {req.status === "fulfilled" ? "Concluída" : "Cancelada"}
                    </Badge>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
