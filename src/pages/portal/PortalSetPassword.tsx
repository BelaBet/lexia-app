import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { PasswordInput } from "@/components/ui/password-input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, Scale } from "lucide-react";
import { toast } from "sonner";
import { useWhiteLabelSettings, DEFAULT_BRANDING } from "@/hooks/useWhiteLabelSettings";

// Página de destino do link de convite (enviado pela edge function
// invite-client via Supabase Auth). O próprio link já autentica o
// navegador — aqui só pedimos para o cliente escolher a senha definitiva.
export default function PortalSetPassword() {
  const navigate = useNavigate();
  const { data: branding } = useWhiteLabelSettings();
  const brandLogo = branding?.logo_url;
  const brandName = branding?.brand_name || DEFAULT_BRANDING.brand_name;

  const [checkingSession, setCheckingSession] = useState(true);
  const [hasSession, setHasSession] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setHasSession(Boolean(data.session));
      setCheckingSession(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setHasSession(Boolean(session));
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 6) {
      toast.error("A senha deve ter pelo menos 6 caracteres");
      return;
    }
    if (password !== confirmPassword) {
      toast.error("As senhas não coincidem");
      return;
    }
    setIsLoading(true);
    const { error } = await supabase.auth.updateUser({ password });
    setIsLoading(false);
    if (error) {
      toast.error("Erro ao definir a senha", { description: error.message });
      return;
    }
    toast.success("Senha criada! Bem-vindo(a).");
    navigate("/portal", { replace: true });
  };

  if (checkingSession) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-background to-muted/30 p-4">
      <div className="w-full max-w-md">
        <div className="flex flex-col items-center mb-8">
          <div className="w-16 h-16 rounded-2xl bg-primary flex items-center justify-center mb-4 overflow-hidden">
            {brandLogo ? (
              <img src={brandLogo} alt={brandName} className="w-full h-full object-contain p-1" />
            ) : (
              <Scale className="w-9 h-9 text-primary-foreground" />
            )}
          </div>
          <h1 className="font-serif text-3xl font-bold text-foreground">Meu Jurídico</h1>
          <p className="text-muted-foreground mt-1">Bem-vindo! Vamos criar sua senha de acesso.</p>
        </div>
        <Card className="border-border/50 shadow-xl">
          <CardHeader>
            <CardTitle className="text-lg">Definir senha</CardTitle>
            <CardDescription>
              {hasSession
                ? "Escolha uma senha para acompanhar seu processo a partir de agora."
                : "Este link de convite expirou ou já foi usado. Peça ao seu advogado para enviar um novo convite."}
            </CardDescription>
          </CardHeader>
          {hasSession && (
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="new-password">Nova senha</Label>
                  <PasswordInput id="new-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="confirm-password">Confirmar senha</Label>
                  <PasswordInput id="confirm-password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required />
                </div>
                <Button type="submit" className="w-full" disabled={isLoading}>
                  {isLoading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Salvando...
                    </>
                  ) : (
                    "Criar senha e entrar"
                  )}
                </Button>
              </form>
            </CardContent>
          )}
        </Card>
      </div>
    </div>
  );
}
