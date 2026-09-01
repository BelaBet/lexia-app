import { useState, useEffect } from "react";
import { Settings, CheckCircle, Link2, Trash2, Loader2, ExternalLink } from "lucide-react";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  useClickUpIntegration,
  useSaveClickUpIntegration,
  useDeleteClickUpIntegration,
  fetchClickUpWorkspaces,
  fetchClickUpLists,
  ClickUpWorkspace,
  ClickUpList,
} from "@/hooks/useClickUp";
import { useAuth } from "@/contexts/AuthContext";

export function ClickUpSettings() {
  const { hasRole } = useAuth();
  const { data: integration, isLoading } = useClickUpIntegration();
  const saveIntegration = useSaveClickUpIntegration();
  const deleteIntegration = useDeleteClickUpIntegration();

  const [apiToken, setApiToken] = useState("");
  const [workspaceId, setWorkspaceId] = useState("");
  const [listId, setListId] = useState("");
  const [workspaces, setWorkspaces] = useState<ClickUpWorkspace[]>([]);
  const [lists, setLists] = useState<ClickUpList[]>([]);
  const [loadingWorkspaces, setLoadingWorkspaces] = useState(false);
  const [loadingLists, setLoadingLists] = useState(false);

  const isSupremo = hasRole("supremo");

  useEffect(() => {
    if (integration) {
      setApiToken(integration.api_token);
      setWorkspaceId(integration.workspace_id || "");
      setListId(integration.list_id || "");
    }
  }, [integration]);

  const handleFetchWorkspaces = async () => {
    if (!apiToken) return;
    setLoadingWorkspaces(true);
    const result = await fetchClickUpWorkspaces(apiToken);
    setWorkspaces(result);
    setLoadingWorkspaces(false);
  };

  const handleWorkspaceChange = async (value: string) => {
    setWorkspaceId(value);
    setListId("");
    setLists([]);
    
    if (value && apiToken) {
      setLoadingLists(true);
      const result = await fetchClickUpLists(apiToken, value);
      setLists(result);
      setLoadingLists(false);
    }
  };

  const handleSave = async () => {
    await saveIntegration.mutateAsync({
      api_token: apiToken,
      workspace_id: workspaceId || undefined,
      list_id: listId || undefined,
    });
  };

  const handleDelete = async () => {
    if (confirm("Tem certeza que deseja remover a integração com o ClickUp?")) {
      await deleteIntegration.mutateAsync();
      setApiToken("");
      setWorkspaceId("");
      setListId("");
      setWorkspaces([]);
      setLists([]);
    }
  };

  if (!isSupremo) {
    return (
      <div className="legal-card">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-lg bg-purple-500/10 flex items-center justify-center">
            <Settings className="w-5 h-5 text-purple-500" />
          </div>
          <div>
            <h3 className="font-semibold">Integração ClickUp</h3>
            <p className="text-sm text-muted-foreground">Exclusivo plano Supremo</p>
          </div>
        </div>
        
        <div className="text-center py-8 space-y-4">
          <div className="w-16 h-16 mx-auto rounded-full bg-gradient-to-br from-purple-500/20 to-pink-500/20 flex items-center justify-center">
            <Link2 className="w-8 h-8 text-purple-500" />
          </div>
          <div>
            <h4 className="font-medium text-lg">Funcionalidade Premium</h4>
            <p className="text-muted-foreground text-sm max-w-md mx-auto">
              A integração com ClickUp está disponível apenas para assinantes do plano Supremo. 
              Sincronize tarefas, prazos e casos automaticamente.
            </p>
          </div>
          <Button className="bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600">
            Fazer Upgrade para Supremo
          </Button>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="legal-card flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="legal-card">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-purple-500/10 flex items-center justify-center">
            <Settings className="w-5 h-5 text-purple-500" />
          </div>
          <div>
            <h3 className="font-semibold">Integração ClickUp</h3>
            <p className="text-sm text-muted-foreground">Configure sua conexão</p>
          </div>
        </div>
        {integration && (
          <div className="flex items-center gap-2 text-sm text-success">
            <CheckCircle className="w-4 h-4" />
            Conectado
          </div>
        )}
      </div>

      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="api-token">API Token</Label>
          <div className="flex gap-2">
            <PasswordInput
              id="api-token"
              className="flex-1"
              value={apiToken}
              onChange={(e) => setApiToken(e.target.value)}
              placeholder="pk_..."
            />
            <Button
              variant="outline" 
              onClick={handleFetchWorkspaces}
              disabled={!apiToken || loadingWorkspaces}
            >
              {loadingWorkspaces ? <Loader2 className="w-4 h-4 animate-spin" /> : "Conectar"}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Obtenha seu token em{" "}
            <a 
              href="https://app.clickup.com/settings/apps" 
              target="_blank" 
              rel="noopener noreferrer"
              className="text-primary hover:underline inline-flex items-center gap-1"
            >
              ClickUp Settings <ExternalLink className="w-3 h-3" />
            </a>
          </p>
        </div>

        {workspaces.length > 0 && (
          <div className="space-y-2">
            <Label>Workspace</Label>
            <Select value={workspaceId} onValueChange={handleWorkspaceChange}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione um workspace" />
              </SelectTrigger>
              <SelectContent>
                {workspaces.map((ws) => (
                  <SelectItem key={ws.id} value={ws.id}>
                    {ws.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {lists.length > 0 && (
          <div className="space-y-2">
            <Label>Lista padrão para tarefas</Label>
            <Select value={listId} onValueChange={setListId}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione uma lista" />
              </SelectTrigger>
              <SelectContent>
                {lists.map((list) => (
                  <SelectItem key={list.id} value={list.id}>
                    {list.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {loadingLists && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin" />
            Carregando listas...
          </div>
        )}

        <div className="flex gap-2 pt-4">
          <Button 
            onClick={handleSave} 
            disabled={!apiToken || saveIntegration.isPending}
            className="flex-1"
          >
            {saveIntegration.isPending ? (
              <Loader2 className="w-4 h-4 animate-spin mr-2" />
            ) : null}
            Salvar Configuração
          </Button>
          {integration && (
            <Button 
              variant="destructive" 
              onClick={handleDelete}
              disabled={deleteIntegration.isPending}
            >
              <Trash2 className="w-4 h-4" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
