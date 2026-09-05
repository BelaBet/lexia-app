import { useOutletContext, Link } from "react-router-dom";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useCaseTimeline, useCaseRequests } from "@/hooks/useClientPortal";
import type { PortalOutletContext } from "@/hooks/useClientPortal";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AlertCircle, CheckCircle2, Clock, ArrowRight } from "lucide-react";

const STATUS_LABEL: Record<string, string> = {
  active: "Em andamento",
  archived: "Arquivado",
  closed: "Encerrado",
};

// "Meu Processo" — a tela inicial do cliente: status, última atualização
// (resumida) e se ele precisa fazer alguma coisa agora.
export default function PortalHome() {
  const { caseId, caseInfo } = useOutletContext<PortalOutletContext>();
  const { data: timeline } = useCaseTimeline(caseId);
  const { data: requests } = useCaseRequests(caseId);

  const pendingRequests = (requests ?? []).filter((r) => r.status === "pending");
  const latestEvent = timeline?.[0];

  return (
    <div className="space-y-5">
      <div>
        <p className="text-sm text-muted-foreground">Olá! 👋</p>
        <h1 className="text-2xl font-serif font-bold text-foreground">{caseInfo?.title || "Seu processo"}</h1>
        {caseInfo?.case_number && <p className="text-sm text-muted-foreground mt-0.5">Processo {caseInfo.case_number}</p>}
      </div>

      <Card>
        <CardContent className="pt-6 flex items-center gap-3">
          <span className={`w-3 h-3 rounded-full ${caseInfo?.status === "active" ? "bg-green-500" : "bg-muted-foreground"}`} />
          <div>
            <p className="text-sm text-muted-foreground">Status</p>
            <p className="font-medium text-foreground">{STATUS_LABEL[caseInfo?.status ?? ""] || "Em andamento"}</p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Clock className="w-4 h-4 text-primary" /> Última atualização
          </CardTitle>
        </CardHeader>
        <CardContent>
          {latestEvent ? (
            <>
              <p className="text-sm text-muted-foreground mb-1">
                {format(new Date(latestEvent.event_date + "T00:00:00"), "d 'de' MMMM", { locale: ptBR })}
              </p>
              <p className="font-medium text-foreground mb-1">{latestEvent.title}</p>
              <p className="text-sm text-muted-foreground">{latestEvent.client_summary}</p>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">Ainda não há atualizações registradas neste processo.</p>
          )}
          <Link to="../timeline" className="inline-flex items-center gap-1 text-sm text-primary mt-3 hover:underline">
            Ver tudo <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </CardContent>
      </Card>

      <Card className={pendingRequests.length > 0 ? "border-amber-300 bg-amber-50/50 dark:bg-amber-950/10" : ""}>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            {pendingRequests.length > 0 ? (
              <AlertCircle className="w-4 h-4 text-amber-600" />
            ) : (
              <CheckCircle2 className="w-4 h-4 text-green-600" />
            )}
            Você precisa fazer algo?
          </CardTitle>
        </CardHeader>
        <CardContent>
          {pendingRequests.length === 0 ? (
            <p className="text-sm text-muted-foreground">Tudo certo — nenhuma ação necessária no momento.</p>
          ) : (
            <div className="space-y-2">
              {pendingRequests.slice(0, 3).map((req) => (
                <div key={req.id} className="flex items-center justify-between gap-2 text-sm">
                  <span className="text-foreground">{req.title}</span>
                  <Badge variant="outline" className="border-amber-400 text-amber-700">Pendente</Badge>
                </div>
              ))}
              <Link to="../solicitacoes">
                <Button size="sm" variant="outline" className="mt-2 w-full">Ver solicitações</Button>
              </Link>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
