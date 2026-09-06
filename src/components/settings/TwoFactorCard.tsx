import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { Shield, ShieldCheck, Loader2 } from "lucide-react";
import { useMfaFactors, useEnrollMfa, useVerifyMfaEnrollment, useUnenrollMfa } from "@/hooks/useMfa";
import { useToast } from "@/hooks/use-toast";

// BUG-07 (corrigido): antes o botão "Autenticação de Dois Fatores" não
// tinha nenhuma ação — o usuário podia interpretar que tinha ativado 2FA
// quando a interface não fazia nada. Usa TOTP nativo do Supabase Auth
// (auth.mfa.enroll/challenge/verify/unenroll); a exigência do código no
// login está em src/pages/Auth.tsx.
export function TwoFactorCard() {
  const { toast } = useToast();
  const { data: factors, isLoading } = useMfaFactors();
  const enroll = useEnrollMfa();
  const verify = useVerifyMfaEnrollment();
  const unenroll = useUnenrollMfa();

  const [isEnrollOpen, setIsEnrollOpen] = useState(false);
  const [pendingFactorId, setPendingFactorId] = useState<string | null>(null);
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [code, setCode] = useState("");

  const verifiedFactor = factors?.find((f) => f.status === "verified");

  const startEnrollment = async () => {
    setIsEnrollOpen(true);
    setCode("");
    try {
      const data = await enroll.mutateAsync();
      setPendingFactorId(data.id);
      setQrCode(data.totp.qr_code);
      setSecret(data.totp.secret);
    } catch (error) {
      toast({
        title: "Erro ao iniciar ativação do 2FA",
        description: error instanceof Error ? error.message : undefined,
        variant: "destructive",
      });
      setIsEnrollOpen(false);
    }
  };

  // Fecha o diálogo sem deixar um fator "pendurado" (criado mas nunca
  // verificado) na conta — se o usuário cancelar no meio, desfaz o enroll.
  const cancelEnrollment = async () => {
    const factorId = pendingFactorId;
    setIsEnrollOpen(false);
    setPendingFactorId(null);
    setQrCode(null);
    setSecret(null);
    setCode("");
    if (factorId) {
      await unenroll.mutateAsync(factorId).catch(() => {
        // Best-effort — se falhar, o fator fica unverified e não afeta o
        // login (só fatores "verified" contam para o desafio de MFA).
      });
    }
  };

  const confirmEnrollment = async () => {
    if (!pendingFactorId || code.length !== 6) return;
    try {
      await verify.mutateAsync({ factorId: pendingFactorId, code });
      toast({ title: "Autenticação de dois fatores ativada" });
      setIsEnrollOpen(false);
      setPendingFactorId(null);
      setQrCode(null);
      setSecret(null);
      setCode("");
    } catch (error) {
      toast({
        title: "Código inválido",
        description: "Confira o código gerado pelo seu app autenticador e tente novamente.",
        variant: "destructive",
      });
    }
  };

  const handleDisable = async () => {
    if (!verifiedFactor) return;
    try {
      await unenroll.mutateAsync(verifiedFactor.id);
      toast({ title: "Autenticação de dois fatores desativada" });
    } catch (error) {
      toast({
        title: "Erro ao desativar 2FA",
        description: error instanceof Error ? error.message : undefined,
        variant: "destructive",
      });
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Shield className="w-5 h-5" />
          Autenticação de Dois Fatores
        </CardTitle>
        <CardDescription>
          Exige um código do seu app autenticador (Google Authenticator, Authy, 1Password, etc.) além da senha ao entrar.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin" />
            Verificando status...
          </div>
        ) : verifiedFactor ? (
          <div className="flex items-center justify-between">
            <Badge variant="outline" className="bg-success/10 text-success border-success/30 flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5" />
              Ativada
            </Badge>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="outline" size="sm">Desativar</Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Desativar autenticação de dois fatores?</AlertDialogTitle>
                  <AlertDialogDescription>
                    A partir de agora, entrar na sua conta vai exigir apenas a senha.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                  <AlertDialogAction onClick={handleDisable}>Desativar</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        ) : (
          <Button variant="outline" className="w-full justify-start" onClick={startEnrollment}>
            <Shield className="w-4 h-4 mr-2" />
            Ativar Autenticação de Dois Fatores
          </Button>
        )}
      </CardContent>

      <Dialog open={isEnrollOpen} onOpenChange={(open) => { if (!open) cancelEnrollment(); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Ativar autenticação de dois fatores</DialogTitle>
            <DialogDescription>
              Escaneie o QR code com seu app autenticador e digite o código de 6 dígitos gerado.
            </DialogDescription>
          </DialogHeader>
          {enroll.isPending ? (
            <div className="flex justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="space-y-4">
              {qrCode && (
                <div className="flex justify-center bg-white p-3 rounded-lg">
                  {/* qr_code do Supabase já vem como data URI de um SVG */}
                  <img src={qrCode} alt="QR code para configurar o autenticador" className="w-48 h-48" />
                </div>
              )}
              {secret && (
                <p className="text-xs text-muted-foreground text-center">
                  Não consegue escanear? Digite manualmente: <span className="font-mono">{secret}</span>
                </p>
              )}
              <div className="flex justify-center">
                <InputOTP maxLength={6} value={code} onChange={setCode}>
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
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={cancelEnrollment} disabled={verify.isPending}>
              Cancelar
            </Button>
            <Button onClick={confirmEnrollment} disabled={code.length !== 6 || verify.isPending || enroll.isPending}>
              {verify.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Confirmar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
