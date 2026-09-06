import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { Scale, Loader2, Shield } from "lucide-react";
import { toast } from "sonner";
import { useWhiteLabelSettings, DEFAULT_BRANDING } from "@/hooks/useWhiteLabelSettings";
import { useMfaChallengeRequired } from "@/hooks/useMfa";
export default function Auth() {
  const { user, signIn, signUp, signOut, loading } = useAuth();
  const { data: branding } = useWhiteLabelSettings();
  const brandName = branding?.brand_name || DEFAULT_BRANDING.brand_name;
  const brandTagline = branding?.tagline || DEFAULT_BRANDING.tagline;
  const brandLogo = branding?.logo_url;
  const [isLoading, setIsLoading] = useState(false);
  // Login form state
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  // Register form state
  const [registerName, setRegisterName] = useState("");
  const [registerEmail, setRegisterEmail] = useState("");
  const [registerPassword, setRegisterPassword] = useState("");
  const [registerConfirmPassword, setRegisterConfirmPassword] = useState("");
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotLoading, setForgotLoading] = useState(false);

  // BUG-07 (corrigido): ter um fator TOTP verificado não bastava — nada
  // no login de fato EXIGIA o segundo fator. A sessão de senha sozinha já
  // é uma sessão válida (nível "aal1"), então sem esta checagem o usuário
  // caía direto no app após a senha, com o 2FA apenas "decorativo".
  // useMfaChallengeRequired checa o AAL; aqui só buscamos o factorId para
  // montar o desafio quando ele indica que é necessário.
  const { checking: checkingMfa, required: needsMfaChallenge } = useMfaChallengeRequired(user);
  const [mfaFactorId, setMfaFactorId] = useState<string | null>(null);
  const [mfaCode, setMfaCode] = useState("");
  const [mfaSubmitting, setMfaSubmitting] = useState(false);
  // mfa.verify() já eleva o AAL da sessão no servidor, mas o hook só
  // reavalia quando o objeto `user` muda de identidade — este flag evita
  // mostrar o desafio de novo por um instante logo após verificar com
  // sucesso, até o próximo re-render natural do AuthContext.
  const [justVerifiedMfa, setJustVerifiedMfa] = useState(false);

  useEffect(() => {
    if (!needsMfaChallenge) {
      setMfaFactorId(null);
      return;
    }
    let cancelled = false;
    supabase.auth.mfa.listFactors().then(({ data }) => {
      if (cancelled) return;
      const factor = data?.totp.find((f) => f.status === "verified");
      setMfaFactorId(factor?.id ?? null);
    });
    return () => {
      cancelled = true;
    };
  }, [needsMfaChallenge]);

  const handleMfaVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!mfaFactorId || mfaCode.length !== 6) return;
    setMfaSubmitting(true);
    const { data: challenge, error: challengeError } = await supabase.auth.mfa.challenge({ factorId: mfaFactorId });
    if (challengeError) {
      toast.error("Erro ao gerar desafio", { description: challengeError.message });
      setMfaSubmitting(false);
      return;
    }
    const { error: verifyError } = await supabase.auth.mfa.verify({
      factorId: mfaFactorId,
      challengeId: challenge.id,
      code: mfaCode,
    });
    setMfaSubmitting(false);
    if (verifyError) {
      toast.error("Código inválido", { description: "Confira o código do seu app autenticador." });
      setMfaCode("");
      return;
    }
    setJustVerifiedMfa(true);
    toast.success("Bem-vindo de volta!");
  };

  if (loading || checkingMfa) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (user && needsMfaChallenge && !justVerifiedMfa) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-background to-muted/30 p-4">
        <Card className="w-full max-w-md border-border/50 shadow-xl">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield className="w-5 h-5" />
              Verificação em duas etapas
            </CardTitle>
            <CardDescription>Digite o código gerado pelo seu app autenticador.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleMfaVerify} className="space-y-4">
              <div className="flex justify-center">
                <InputOTP maxLength={6} value={mfaCode} onChange={setMfaCode}>
                  <InputOTPGroup>
                    <InputOTPSlot index={0} />
                    <InputOTPSlot index={1} />
                    <InputOTPSlot index={2} />
                    <InputOTPSlot index={3} />
                    <InputOTPSlot index={4} />
                    <InputOTPSlot index={5} />
                  </InputOTPGroup>
                </InputOTP>
              </div>
              <Button type="submit" className="w-full" disabled={mfaCode.length !== 6 || mfaSubmitting || !mfaFactorId}>
                {mfaSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Verificar
              </Button>
              <Button type="button" variant="ghost" className="w-full" onClick={() => signOut()}>
                Sair
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (user) {
    return <Navigate to="/" replace />;
  }
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    const { error } = await signIn(loginEmail, loginPassword);
    if (error) {
      toast.error("Erro ao entrar", {
        description: error.message,
      });
    } else {
      toast.success("Bem-vindo de volta!");
    }
    setIsLoading(false);
  };
  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (registerPassword !== registerConfirmPassword) {
      toast.error("As senhas não coincidem");
      return;
    }
    if (registerPassword.length < 6) {
      toast.error("A senha deve ter pelo menos 6 caracteres");
      return;
    }
    setIsLoading(true);
    const { error } = await signUp(registerEmail, registerPassword, registerName);
    if (error) {
      toast.error("Erro ao criar conta", {
        description: error.message,
      });
    } else {
      toast.success("Conta criada com sucesso!", {
        description: "Você já pode acessar o sistema.",
      });
    }
    setIsLoading(false);
  };
  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setForgotLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(forgotEmail, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    if (error) {
      toast.error("Erro ao enviar e-mail", { description: error.message });
    } else {
      toast.success("E-mail enviado!", {
        description: "Verifique sua caixa de entrada para redefinir sua senha.",
      });
    }
    setForgotLoading(false);
  };
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-background to-muted/30 p-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <div className="w-16 h-16 rounded-2xl bg-primary flex items-center justify-center mb-4 overflow-hidden">
            {brandLogo ? (
              <img src={brandLogo} alt={brandName} className="w-full h-full object-contain p-1" />
            ) : (
              <Scale className="w-9 h-9 text-primary-foreground" />
            )}
          </div>
          <h1 className="font-serif text-3xl font-bold text-foreground">{brandName}</h1>
          <p className="text-muted-foreground mt-1">{brandTagline}</p>
        </div>
        <Card className="border-border/50 shadow-xl">
          <Tabs defaultValue="login" className="w-full">
            <CardHeader className="pb-4">
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="login">Entrar</TabsTrigger>
                <TabsTrigger value="register">Criar Conta</TabsTrigger>
                <TabsTrigger value="forgot">Recuperar</TabsTrigger>
              </TabsList>
            </CardHeader>
            <CardContent>
              <TabsContent value="login" className="mt-0">
                <form onSubmit={handleLogin} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="login-email">E-mail</Label>
                    <Input
                      id="login-email"
                      type="email"
                      placeholder="seu@email.com"
                      value={loginEmail}
                      onChange={(e) => setLoginEmail(e.target.value)}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="login-password">Senha</Label>
                    <PasswordInput
                      id="login-password"
                      placeholder="••••••••"
                      value={loginPassword}
                      onChange={(e) => setLoginPassword(e.target.value)}
                      required
                    />
                  </div>
                  <Button type="submit" className="w-full" disabled={isLoading}>
                    {isLoading ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Entrando...
                      </>
                    ) : (
                      "Entrar"
                    )}
                  </Button>
                </form>
              </TabsContent>
              <TabsContent value="register" className="mt-0">
                <form onSubmit={handleRegister} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="register-name">Nome Completo</Label>
                    <Input
                      id="register-name"
                      type="text"
                      placeholder="Dr. João Silva"
                      value={registerName}
                      onChange={(e) => setRegisterName(e.target.value)}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="register-email">E-mail</Label>
                    <Input
                      id="register-email"
                      type="email"
                      placeholder="seu@email.com"
                      value={registerEmail}
                      onChange={(e) => setRegisterEmail(e.target.value)}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="register-password">Senha</Label>
                    <PasswordInput
                      id="register-password"
                      placeholder="••••••••"
                      value={registerPassword}
                      onChange={(e) => setRegisterPassword(e.target.value)}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="register-confirm-password">Confirmar Senha</Label>
                    <PasswordInput
                      id="register-confirm-password"
                      placeholder="••••••••"
                      value={registerConfirmPassword}
                      onChange={(e) => setRegisterConfirmPassword(e.target.value)}
                      required
                    />
                  </div>
                  <Button type="submit" className="w-full" disabled={isLoading}>
                    {isLoading ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Criando conta...
                      </>
                    ) : (
                      "Criar Conta"
                    )}
                  </Button>
                </form>
              </TabsContent>
              <TabsContent value="forgot" className="mt-0">
                <form onSubmit={handleForgotPassword} className="space-y-4">
                  <CardDescription>
                    Informe seu e-mail e enviaremos um link para redefinir sua senha.
                  </CardDescription>
                  <div className="space-y-2">
                    <Label htmlFor="forgot-email">E-mail</Label>
                    <Input
                      id="forgot-email"
                      type="email"
                      placeholder="seu@email.com"
                      value={forgotEmail}
                      onChange={(e) => setForgotEmail(e.target.value)}
                      required
                    />
                  </div>
                  <Button type="submit" className="w-full" disabled={forgotLoading}>
                    {forgotLoading ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Enviando...
                      </>
                    ) : (
                      "Enviar Link de Recuperação"
                    )}
                  </Button>
                </form>
              </TabsContent>
            </CardContent>
          </Tabs>
        </Card>
        <p className="text-center text-sm text-muted-foreground mt-6">
          Ao continuar, você concorda com nossos Termos de Serviço e Política de Privacidade.
        </p>
      </div>
    </div>
  );
}
