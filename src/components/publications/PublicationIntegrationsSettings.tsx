import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Label } from "@/components/ui/label";
import { Copy, Check, RefreshCw, Trash2, Radio, Loader2, Search, AlertTriangle } from "lucide-react";
import {
  usePublicationIntegrations,
  useCreatePublicationIntegration,
  useRegeneratePublicationIntegrationSecret,
  useTogglePublicationIntegration,
  useUpdatePublicationIntegrationConfig,
  useDeletePublicationIntegration,
  PublicationIntegration,
  WebhookSource,
} from "@/hooks/usePublicationIntegrations";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

const sourceInfo: Record<WebhookSource, { label: string; description: string }> = {
  jusbrasil: {
    label: "JusBrasil (API Dossiê)",
    description: "Monitoramento de processos e novas distribuições via webhook + busca ativa diária.",
  },
  webjur: {
    label: "WebJur",
    description: "Serviço de recorte/monitoramento de publicações.",
  },
  escavador: {
    label: "Escavador",
    description: "Monitoramento de processos via webhook.",
  },
};

// Base da URL das edge functions do projeto Supabase (mesma usada pelo client).
const FUNCTIONS_BASE_URL = import.meta.env.VITE_SUPABASE_URL
  ? `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`
  : "";

function CopyField({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // ignore
    }
  };

  return (
    <div className="space-y-1">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <div className="flex items-center gap-2">
        <code className="flex-1 text-xs bg-muted rounded px-2 py-1.5 overflow-x-auto whitespace-nowrap">
          {value}
        </code>
        <Button type="button" variant="outline" size="icon" className="h-8 w-8 shrink-0" onClick={handleCopy}>
          {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
        </Button>
      </div>
    </div>
  );
}

function JusbrasilPollingConfig({ integration }: { integration: PublicationIntegration }) {
  const updateConfig = useUpdatePublicationIntegrationConfig();
  const [apiKey, setApiKey] = useState(integration.api_key || "");
  const [document, setDocument] = useState(integration.monitor_document || "");
  const [oab, setOab] = useState(integration.monitor_oab || "");

  useEffect(() => {
    setApiKey(integration.api_key || "");
    setDocument(integration.monitor_document || "");
    setOab(integration.monitor_oab || "");
  }, [integration.id, integration.api_key, integration.monitor_document, integration.monitor_oab]);

  const handleSave = () => {
    updateConfig.mutate({
      id: integration.id,
      api_key: apiKey || null,
      monitor_document: document || null,
      monitor_oab: oab || null,
    });
  };

  return (
    <div className="space-y-3 mt-3 pt-3 border-t">
      <div className="flex items-center gap-1.5">
        <Search className="w-3.5 h-3.5 text-muted-foreground" />
        <p className="text-xs font-semibold text-foreground">Busca ativa diária (além do webhook)</p>
      </div>
      <p className="text-xs text-muted-foreground">
        Preencha sua chave de API e o CPF/CNPJ e/ou OAB a monitorar. Uma consulta automática roda 1x por dia
        buscando novos processos e prazos, mesmo que o JusBrasil não envie webhook para eles.
      </p>

      <div className="space-y-1">
        <Label htmlFor={`api-key-${integration.id}`} className="text-xs">Chave de API do JusBrasil</Label>
        <PasswordInput
          id={`api-key-${integration.id}`}
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          placeholder="Cole aqui a API Key do JusBrasil"
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label htmlFor={`doc-${integration.id}`} className="text-xs">CPF/CNPJ a monitorar</Label>
          <Input
            id={`doc-${integration.id}`}
            value={document}
            onChange={(e) => setDocument(e.target.value)}
            placeholder="000.000.000-00"
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor={`oab-${integration.id}`} className="text-xs">Número da OAB</Label>
          <Input
            id={`oab-${integration.id}`}
            value={oab}
            onChange={(e) => setOab(e.target.value)}
            placeholder="123456/SP"
          />
        </div>
      </div>

      {integration.last_poll_status === "error" && integration.last_poll_error && (
        <div className="flex items-start gap-1.5 text-xs text-destructive bg-destructive/10 rounded p-2">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          <span>Última busca falhou: {integration.last_poll_error}</span>
        </div>
      )}

      <Button type="button" size="sm" variant="outline" onClick={handleSave} disabled={updateConfig.isPending}>
        {updateConfig.isPending && <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />}
        Salvar configuração de busca ativa
      </Button>

      <p className="text-[11px] text-muted-foreground">
        Depois de salvar, é preciso ativar o agendamento uma única vez (script SQL fornecido separadamente,
        rodado no SQL Editor do Supabase).
      </p>
    </div>
  );
}

export function PublicationIntegrationsSettings() {
  const { data: integrations = [], isLoading } = usePublicationIntegrations();
  const createIntegration = useCreatePublicationIntegration();
  const regenerateSecret = useRegeneratePublicationIntegrationSecret();
  const toggleIntegration = useTogglePublicationIntegration();
  const deleteIntegration = useDeletePublicationIntegration();

  const bySource = (source: WebhookSource) => integrations.find((i) => i.source === source);

  return (
    <div className="legal-card">
      <div className="flex items-center gap-3 mb-2">
        <div className="w-10 h-10 rounded-lg bg-blue-500/10 flex items-center justify-center">
          <Radio className="w-5 h-5 text-blue-500" />
        </div>
        <div>
          <h3 className="font-semibold">Importação Automática de Publicações</h3>
          <p className="text-sm text-muted-foreground">JusBrasil, WebJur e Escavador via webhook</p>
        </div>
      </div>
      <p className="text-xs text-muted-foreground mb-6">
        Gere aqui a URL e o segredo de cada provedor e configure-os no painel do JusBrasil/WebJur/Escavador.
        Assim que uma nova publicação for detectada, ela é cadastrada automaticamente em{" "}
        <strong>Publicações</strong> e você recebe uma notificação.
      </p>

      {isLoading ? (
        <div className="flex justify-center py-6">
          <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="space-y-4">
          {(Object.keys(sourceInfo) as WebhookSource[]).map((source) => {
            const integration = bySource(source);
            const webhookUrl = integration
              ? `${FUNCTIONS_BASE_URL}/publication-webhook/${integration.user_id}?source=${source}`
              : "";

            return (
              <Card key={source}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <h4 className="font-medium text-sm">{sourceInfo[source].label}</h4>
                        {integration && (
                          <Badge variant={integration.is_active ? "default" : "secondary"} className="text-xs">
                            {integration.is_active ? "Ativo" : "Pausado"}
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">{sourceInfo[source].description}</p>
                    </div>

                    {integration ? (
                      <Switch
                        checked={integration.is_active}
                        onCheckedChange={(checked) =>
                          toggleIntegration.mutate({ id: integration.id, is_active: checked })
                        }
                      />
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => createIntegration.mutate(source)}
                        disabled={createIntegration.isPending}
                      >
                        Gerar credenciais
                      </Button>
                    )}
                  </div>

                  {integration && (
                    <div className="space-y-3 mt-3 pt-3 border-t">
                      <CopyField label="URL do webhook" value={webhookUrl} />
                      <CopyField label="Segredo (header x-webhook-secret)" value={integration.webhook_secret} />

                      {integration.last_received_at && (
                        <p className="text-xs text-muted-foreground">
                          Última publicação recebida em{" "}
                          {format(new Date(integration.last_received_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                        </p>
                      )}

                      <div className="flex gap-2 pt-1">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="gap-1.5"
                          onClick={() => regenerateSecret.mutate(integration.id)}
                          disabled={regenerateSecret.isPending}
                        >
                          <RefreshCw className="w-3.5 h-3.5" /> Gerar novo segredo
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="gap-1.5 text-destructive hover:text-destructive"
                          onClick={() => {
                            if (confirm("Remover esta integração?")) deleteIntegration.mutate(integration.id);
                          }}
                        >
                          <Trash2 className="w-3.5 h-3.5" /> Remover
                        </Button>
                      </div>

                      {source === "jusbrasil" && <JusbrasilPollingConfig integration={integration} />}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
