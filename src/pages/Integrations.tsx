import { Crown, ArrowRight, CheckCircle } from "lucide-react";
import { ClickUpSettings } from "@/components/integrations/ClickUpSettings";
import { PublicationIntegrationsSettings } from "@/components/publications/PublicationIntegrationsSettings";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";

export function IntegrationsPage() {
  const { hasRole } = useAuth();
  const isSupremo = hasRole("supremo");

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="legal-card">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center">
              <Crown className="w-6 h-6 text-white" />
            </div>
            <div>
              <h2 className="font-serif text-2xl font-semibold">Integrações</h2>
              <p className="text-muted-foreground">Conecte com suas ferramentas favoritas</p>
            </div>
          </div>
          {!isSupremo && (
            <Button className="bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600">
              <Crown className="w-4 h-4 mr-2" />
              Upgrade para Supremo
            </Button>
          )}
        </div>
      </div>

      {/* Plan Status */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <PlanCard 
          name="Gratuito" 
          active={!hasRole("premium") && !isSupremo}
          features={["Até 10 documentos", "5 casos ativos", "Agenda básica"]}
        />
        <PlanCard 
          name="Premium" 
          active={hasRole("premium") && !isSupremo}
          features={["Documentos ilimitados", "Casos ilimitados", "Assistente IA completo"]}
          highlighted
        />
        <PlanCard 
          name="Supremo" 
          active={isSupremo}
          features={["Tudo do Premium", "Integração ClickUp", "Sincronização de tarefas", "Suporte prioritário"]}
          premium
        />
      </div>

      {/* Rastreamento automático de Publicações */}
      <PublicationIntegrationsSettings />

      {/* ClickUp Integration */}
      <ClickUpSettings />

      {/* Future Integrations */}
      <div className="legal-card">
        <h3 className="font-semibold mb-4">Em breve</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <FutureIntegration name="Google Drive" description="Sincronize documentos" />
          <FutureIntegration name="Slack" description="Notificações em tempo real" />
          <FutureIntegration name="Trello" description="Gestão visual de tarefas" />
        </div>
      </div>
    </div>
  );
}

function PlanCard({ 
  name, 
  active, 
  features, 
  highlighted, 
  premium 
}: { 
  name: string; 
  active: boolean; 
  features: string[];
  highlighted?: boolean;
  premium?: boolean;
}) {
  return (
    <div className={`p-5 rounded-xl border-2 transition-all ${
      active 
        ? premium 
          ? "border-purple-500 bg-gradient-to-br from-purple-500/10 to-pink-500/10" 
          : highlighted 
            ? "border-primary bg-primary/5" 
            : "border-muted-foreground/30 bg-muted/50"
        : "border-muted hover:border-muted-foreground/30"
    }`}>
      <div className="flex items-center justify-between mb-3">
        <span className={`font-semibold ${premium ? "text-purple-500" : ""}`}>{name}</span>
        {active && (
          <span className={`text-xs px-2 py-1 rounded-full ${
            premium ? "bg-purple-500 text-white" : "bg-primary text-primary-foreground"
          }`}>
            Ativo
          </span>
        )}
      </div>
      <ul className="space-y-2">
        {features.map((feature, i) => (
          <li key={i} className="text-sm text-muted-foreground flex items-center gap-2">
            <CheckCircle className={`w-4 h-4 ${active ? "text-success" : "text-muted-foreground/50"}`} />
            {feature}
          </li>
        ))}
      </ul>
      {!active && (
        <Button variant="outline" className="w-full mt-4" size="sm">
          Fazer Upgrade <ArrowRight className="w-4 h-4 ml-2" />
        </Button>
      )}
    </div>
  );
}

function FutureIntegration({ name, description }: { name: string; description: string }) {
  return (
    <div className="p-4 rounded-lg border border-dashed border-muted-foreground/30 text-center">
      <p className="font-medium text-muted-foreground">{name}</p>
      <p className="text-xs text-muted-foreground/70">{description}</p>
    </div>
  );
}
