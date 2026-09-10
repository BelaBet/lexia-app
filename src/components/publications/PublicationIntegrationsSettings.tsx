import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Copy, Check, RefreshCw, Trash2, Radio, Loader2, Search, AlertTriangle, PlayCircle, DollarSign, ShieldCheck } from "lucide-react";
import {
  usePublicationIntegrations,
  useCreatePublicationIntegration,
  useRegeneratePublicationIntegrationSecret,
  useTogglePublicationIntegration,
  useUpdatePublicationIntegrationConfig,
  useDeletePublicationIntegration,
  useTriggerManualSearch,
  PublicationIntegration,
  WebhookSource,
} from "@/hooks/usePublicationIntegrations";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

const sourceInfo: Record<WebhookSource, { label: string; description: string }> = {
  jusbrasil: {
    label: "JusBrasil",
    description: "Monitoramento de processos, novas distribuições e busca ativa usando a integração central da Lex IA.",
  },
  webjur: { label: "WebJur", description: "Serviço de recorte/monitoramento de publicações." },
  escavador: { label: "Escavador", description: "Monitoramento de processos via webhook." },
};

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
    } catch { /* navegador sem permissão */ }
  };
  return <div className="space-y-1">
    <p className="text-xs font-medium text-muted-foreground">{label}</p>
    <div className="flex items-center gap-2">
      <code className="flex-1 text-xs bg-muted rounded px-2 py-1.5 overflow-x-auto whitespace-nowrap">{value}</code>
      <Button type="button" variant="outline" size="icon" className="h-8 w-8 shrink-0" onClick={handleCopy}>
        {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
      </Button>
    </div>
  </div>;
}

function JusbrasilPollingConfig({ integration }: { integration: PublicationIntegration }) {
  const updateConfig = useUpdatePublicationIntegrationConfig();
  const triggerManualSearch = useTriggerManualSearch();
  const [name, setName] = useState(integration.monitor_name || "");
  const [oab, setOab] = useState(integration.monitor_oab || "");
  const [pricePerSearch, setPricePerSearch] = useState(integration.price_per_search != null ? String(integration.price_per_search) : "");

  useEffect(() => {
    setName(integration.monitor_name || "");
    setOab(integration.monitor_oab || "");
    setPricePerSearch(integration.price_per_search != null ? String(integration.price_per_search) : "");
  }, [integration.id, integration.monitor_name, integration.monitor_oab, integration.price_per_search]);

  const handleSave = () => {
    const normalizedPrice = pricePerSearch.trim().replace(",", ".");
    const parsedPrice = normalizedPrice ? Number(normalizedPrice) : null;
    updateConfig.mutate({
      id: integration.id,
      monitor_name: name || null,
      monitor_oab: oab || null,
      price_per_search: parsedPrice != null && !Number.isNaN(parsedPrice) ? parsedPrice : null,
    });
  };

  return <div className="space-y-3 mt-3 pt-3 border-t">
    <div className="flex items-center gap-1.5"><Search className="w-3.5 h-3.5 text-muted-foreground" /><p className="text-xs font-semibold">Busca e monitoramento JusBrasil</p></div>
    <div className="flex items-start gap-2 rounded-lg border bg-muted/30 p-3 text-xs text-muted-foreground">
      <ShieldCheck className="w-4 h-4 shrink-0 mt-0.5" />
      <span>A credencial da API é administrada centralmente pela Lex IA. Nenhum cliente ou tenant precisa cadastrar uma chave do JusBrasil.</span>
    </div>
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      <div className="space-y-1"><Label htmlFor={`name-${integration.id}`} className="text-xs">Nome ou razão social</Label><Input id={`name-${integration.id}`} value={name} onChange={(e) => setName(e.target.value)} placeholder="Nome completo ou razão social" /></div>
      <div className="space-y-1"><Label htmlFor={`oab-${integration.id}`} className="text-xs">Número da OAB</Label><Input id={`oab-${integration.id}`} value={oab} onChange={(e) => setOab(e.target.value)} placeholder="123456/SP" /></div>
    </div>
    <div className="space-y-1">
      <Label htmlFor={`price-${integration.id}`} className="text-xs flex items-center gap-1"><DollarSign className="w-3 h-3" /> Valor cobrado por pesquisa (R$)</Label>
      <Input id={`price-${integration.id}`} value={pricePerSearch} onChange={(e) => setPricePerSearch(e.target.value)} placeholder="0,00" inputMode="decimal" />
    </div>
    <p className="text-[11px] text-muted-foreground">A busca por nome é assíncrona e pode levar até 72 horas. Operações pagas só devem ser iniciadas por ação manual explícita; o agendamento não cria novas cobranças automaticamente.</p>
    {integration.last_poll_status === "error" && integration.last_poll_error && <div className="flex items-start gap-1.5 text-xs text-destructive bg-destructive/10 rounded p-2"><AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" /><span>Última busca falhou: {integration.last_poll_error}</span></div>}
    <div className="flex flex-wrap gap-2">
      <Button type="button" size="sm" variant="outline" onClick={handleSave} disabled={updateConfig.isPending}>{updateConfig.isPending && <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />}Salvar configuração</Button>
      <Button type="button" size="sm" variant="secondary" className="gap-1.5" onClick={() => triggerManualSearch.mutate(integration.id)} disabled={triggerManualSearch.isPending || (!integration.monitor_name && !integration.monitor_oab)}>
        {triggerManualSearch.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <PlayCircle className="w-3.5 h-3.5" />}Buscar agora
      </Button>
    </div>
  </div>;
}

export function PublicationIntegrationsSettings() {
  const { data: integrations = [], isLoading } = usePublicationIntegrations();
  const createIntegration = useCreatePublicationIntegration();
  const regenerateSecret = useRegeneratePublicationIntegrationSecret();
  const toggleIntegration = useTogglePublicationIntegration();
  const deleteIntegration = useDeletePublicationIntegration();
  const bySource = (source: WebhookSource) => integrations.find((i) => i.source === source);

  return <div className="legal-card">
    <div className="flex items-center gap-3 mb-2"><div className="w-10 h-10 rounded-lg bg-blue-500/10 flex items-center justify-center"><Radio className="w-5 h-5 text-blue-500" /></div><div><h3 className="font-semibold">Importação Automática de Publicações</h3><p className="text-sm text-muted-foreground">JusBrasil, WebJur e Escavador</p></div></div>
    <p className="text-xs text-muted-foreground mb-6">A Lex IA recebe eventos dos provedores e direciona cada publicação para a conta correta.</p>
    {isLoading ? <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div> : <div className="space-y-4">
      {(Object.keys(sourceInfo) as WebhookSource[]).map((source) => {
        const integration = bySource(source);
        const webhookUrl = integration ? (source === "jusbrasil" ? `${FUNCTIONS_BASE_URL}/jusbrasil-webhook` : `${FUNCTIONS_BASE_URL}/publication-webhook/${integration.user_id}?source=${source}`) : "";
        return <Card key={source}><CardContent className="p-4">
          <div className="flex items-start justify-between gap-3 mb-3"><div><div className="flex items-center gap-2"><h4 className="font-medium text-sm">{sourceInfo[source].label}</h4>{integration && <Badge variant={integration.is_active ? "default" : "secondary"} className="text-xs">{integration.is_active ? "Ativo" : "Pausado"}</Badge>}</div><p className="text-xs text-muted-foreground mt-0.5">{sourceInfo[source].description}</p></div>
          {integration ? <Switch checked={integration.is_active} onCheckedChange={(checked) => toggleIntegration.mutate({ id: integration.id, is_active: checked })} /> : <Button size="sm" variant="outline" onClick={() => createIntegration.mutate(source)} disabled={createIntegration.isPending}>Ativar integração</Button>}</div>
          {integration && <div className="space-y-3 mt-3 pt-3 border-t">
            <CopyField label="URL do webhook" value={webhookUrl} />
            {source !== "jusbrasil" && <CopyField label="Segredo (header x-webhook-secret)" value={integration.webhook_secret} />}
            {source === "jusbrasil" && <p className="text-[11px] text-muted-foreground">O webhook do JusBrasil usa identificação central por api_name e roteamento multiempresa por source_user_custom.</p>}
            {integration.last_received_at && <p className="text-xs text-muted-foreground">Última publicação recebida em {format(new Date(integration.last_received_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}</p>}
            <div className="flex gap-2 pt-1">
              {source !== "jusbrasil" && <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={() => regenerateSecret.mutate(integration.id)} disabled={regenerateSecret.isPending}><RefreshCw className="w-3.5 h-3.5" /> Gerar novo segredo</Button>}
              <Button type="button" variant="outline" size="sm" className="gap-1.5 text-destructive hover:text-destructive" onClick={() => { if (confirm("Remover esta integração?")) deleteIntegration.mutate(integration.id); }}><Trash2 className="w-3.5 h-3.5" /> Remover</Button>
            </div>
            {source === "jusbrasil" && <JusbrasilPollingConfig integration={integration} />}
          </div>}
        </CardContent></Card>;
      })}
    </div>}
  </div>;
}
