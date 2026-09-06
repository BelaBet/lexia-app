import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Bell, Moon, Sun, Globe, Shield, CreditCard, Crown, User, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { AgendaBlockedDatesCard } from "@/components/settings/AgendaBlockedDatesCard";
import { useUserSettings, useSaveUserSettings, DEFAULT_USER_SETTINGS, UserSettings } from "@/hooks/useUserSettings";
import { applyTheme } from "@/lib/applyTheme";
import { ChangePasswordDialog } from "@/components/settings/ChangePasswordDialog";
import { TwoFactorCard } from "@/components/settings/TwoFactorCard";
import { DeleteAccountDialog } from "@/components/settings/DeleteAccountDialog";

interface SettingsPageProps {
  onTabChange?: (tab: string) => void;
}

export function SettingsPage({ onTabChange }: SettingsPageProps) {
  const { profile, hasRole } = useAuth();
  const { toast } = useToast();
  const { data: savedSettings, isLoading: isLoadingSettings } = useUserSettings();
  const saveSettings = useSaveUserSettings();

  // Rascunho local editado na tela — sincronizado a partir do que já está
  // salvo assim que a consulta carrega (BUG-05 corrigido: antes isto nunca
  // vinha do banco, só existia em memória e "Salvar" era um toast falso).
  const [draft, setDraft] = useState<UserSettings>(DEFAULT_USER_SETTINGS);
  const [isChangePasswordOpen, setIsChangePasswordOpen] = useState(false);
  const [isDeleteAccountOpen, setIsDeleteAccountOpen] = useState(false);

  useEffect(() => {
    if (savedSettings) {
      setDraft(savedSettings);
      applyTheme(savedSettings.theme);
    }
  }, [savedSettings]);

  const isPremium = hasRole("premium");
  const isSupremo = hasRole("supremo");

  const getCurrentPlan = () => {
    if (isSupremo) return { name: "Supremo", color: "bg-purple-500/20 text-purple-400 border-purple-500/30" };
    if (isPremium) return { name: "Premium", color: "bg-amber-500/20 text-amber-400 border-amber-500/30" };
    return { name: "Gratuito", color: "bg-muted text-muted-foreground border-border" };
  };

  const plan = getCurrentPlan();

  const handleThemeChange = (value: string) => {
    const theme = value as UserSettings["theme"];
    setDraft((prev) => ({ ...prev, theme }));
    applyTheme(theme); // pré-visualização imediata, sem esperar salvar
  };

  const handleSave = () => {
    saveSettings.mutate(draft, {
      onSuccess: () => {
        toast({
          title: "Configurações salvas",
          description: "Suas preferências foram atualizadas com sucesso.",
        });
      },
      onError: (error: Error) => {
        toast({
          title: "Erro ao salvar configurações",
          description: error.message || "Tente novamente em instantes.",
          variant: "destructive",
        });
      },
    });
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-serif text-3xl font-bold text-foreground">Configurações</h1>
        <p className="text-muted-foreground mt-1">Gerencie suas preferências e configurações da conta</p>
      </div>

      <div className="grid gap-6">
        {/* Plano Atual */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CreditCard className="w-5 h-5" />
              Plano Atual
            </CardTitle>
            <CardDescription>Informações sobre sua assinatura</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-3 rounded-lg bg-primary/10">
                  <Crown className="w-6 h-6 text-primary" />
                </div>
                <div>
                  <p className="font-medium">Plano {plan.name}</p>
                  <p className="text-sm text-muted-foreground">
                    {isSupremo
                      ? "Acesso completo a todas as funcionalidades"
                      : isPremium
                      ? "Acesso a funcionalidades premium"
                      : "Funcionalidades básicas incluídas"}
                  </p>
                </div>
              </div>
              <Badge variant="outline" className={plan.color}>
                {plan.name}
              </Badge>
            </div>
            {!isSupremo && (
              <Button variant="outline" className="w-full" onClick={() => onTabChange?.("sales")}>
                Fazer Upgrade
              </Button>
            )}
          </CardContent>
        </Card>

        {/* Notificações */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Bell className="w-5 h-5" />
              Notificações
            </CardTitle>
            <CardDescription>Configure como você deseja receber notificações</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>Notificações por Email</Label>
                <p className="text-sm text-muted-foreground">Receber atualizações por email</p>
              </div>
              <Switch
                disabled={isLoadingSettings}
                checked={draft.notify_email}
                onCheckedChange={(checked) => setDraft((prev) => ({ ...prev, notify_email: checked }))}
              />
            </div>
            <Separator />
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>Notificações Push</Label>
                <p className="text-sm text-muted-foreground">Receber notificações no navegador</p>
              </div>
              <Switch
                disabled={isLoadingSettings}
                checked={draft.notify_push}
                onCheckedChange={(checked) => setDraft((prev) => ({ ...prev, notify_push: checked }))}
              />
            </div>
            <Separator />
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>Alertas de Prazos</Label>
                <p className="text-sm text-muted-foreground">Ser avisado sobre prazos próximos</p>
              </div>
              <Switch
                disabled={isLoadingSettings}
                checked={draft.notify_deadlines}
                onCheckedChange={(checked) => setDraft((prev) => ({ ...prev, notify_deadlines: checked }))}
              />
            </div>
            <Separator />
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>Atualizações de Processos</Label>
                <p className="text-sm text-muted-foreground">Notificações sobre mudanças em processos</p>
              </div>
              <Switch
                disabled={isLoadingSettings}
                checked={draft.notify_cases}
                onCheckedChange={(checked) => setDraft((prev) => ({ ...prev, notify_cases: checked }))}
              />
            </div>
          </CardContent>
        </Card>

        {/* Bloqueios e Feriados da Agenda */}
        <AgendaBlockedDatesCard />

        {/* Aparência */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Sun className="w-5 h-5" />
              Aparência
            </CardTitle>
            <CardDescription>Personalize a aparência do aplicativo</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>Tema</Label>
                <p className="text-sm text-muted-foreground">Escolha o tema do aplicativo</p>
              </div>
              <Select value={draft.theme} onValueChange={handleThemeChange} disabled={isLoadingSettings}>
                <SelectTrigger className="w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="light">
                    <div className="flex items-center gap-2">
                      <Sun className="w-4 h-4" />
                      Claro
                    </div>
                  </SelectItem>
                  <SelectItem value="dark">
                    <div className="flex items-center gap-2">
                      <Moon className="w-4 h-4" />
                      Escuro
                    </div>
                  </SelectItem>
                  <SelectItem value="system">Sistema</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Separator />
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>Idioma</Label>
                <p className="text-sm text-muted-foreground">Idioma da interface</p>
              </div>
              <Select
                value={draft.language}
                onValueChange={(value) => setDraft((prev) => ({ ...prev, language: value as UserSettings["language"] }))}
                disabled={isLoadingSettings}
              >
                <SelectTrigger className="w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pt-BR">
                    <div className="flex items-center gap-2">
                      <Globe className="w-4 h-4" />
                      Português (BR)
                    </div>
                  </SelectItem>
                  <SelectItem value="en">
                    <div className="flex items-center gap-2">
                      <Globe className="w-4 h-4" />
                      English
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Autenticação de Dois Fatores */}
        <TwoFactorCard />

        {/* Privacidade */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield className="w-5 h-5" />
              Privacidade e Segurança
            </CardTitle>
            <CardDescription>Gerencie suas configurações de segurança</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Button variant="outline" className="w-full justify-start" onClick={() => setIsChangePasswordOpen(true)}>
              <User className="w-4 h-4 mr-2" />
              Alterar Senha
            </Button>
            <Separator />
            <div className="pt-2">
              <Button variant="destructive" className="w-full" onClick={() => setIsDeleteAccountOpen(true)}>
                Excluir Conta
              </Button>
              <p className="text-xs text-muted-foreground mt-2 text-center">
                Esta ação é irreversível e excluirá todos os seus dados.
              </p>
            </div>
          </CardContent>
        </Card>

        <div className="flex justify-end">
          <Button onClick={handleSave} disabled={saveSettings.isPending || isLoadingSettings}>
            {saveSettings.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Salvar Configurações
          </Button>
        </div>
      </div>

      <ChangePasswordDialog open={isChangePasswordOpen} onOpenChange={setIsChangePasswordOpen} />
      <DeleteAccountDialog open={isDeleteAccountOpen} onOpenChange={setIsDeleteAccountOpen} />
    </div>
  );
}
