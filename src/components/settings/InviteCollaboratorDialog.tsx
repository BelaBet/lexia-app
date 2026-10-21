import { useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { PasswordInput } from "@/components/ui/password-input";
import { Loader2, Search, Copy, Check } from "lucide-react";
import { useCases } from "@/hooks/useCases";
import { useInviteCollaborator } from "@/hooks/useCaseCollaborators";
import { formatCpf, isValidCpf } from "@/lib/cpf";
import { toast } from "sonner";

const MIN_PASSWORD_LENGTH = 6;

interface InviteCollaboratorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function InviteCollaboratorDialog({ open, onOpenChange }: InviteCollaboratorDialogProps) {
  const { data: cases = [] } = useCases();
  const invite = useInviteCollaborator();

  const [fullName, setFullName] = useState("");
  const [cpf, setCpf] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [search, setSearch] = useState("");
  const [selectedCaseIds, setSelectedCaseIds] = useState<Set<string>>(new Set());
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [linkCopied, setLinkCopied] = useState(false);

  const filteredCases = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return cases;
    return cases.filter((c) =>
      [c.title, c.client, c.case_number, c.type].some((field) => field?.toLowerCase().includes(term)),
    );
  }, [cases, search]);

  const reset = () => {
    setFullName("");
    setCpf("");
    setEmail("");
    setPassword("");
    setSearch("");
    setSelectedCaseIds(new Set());
    setInviteLink(null);
    setLinkCopied(false);
  };

  const copyLink = async () => {
    if (!inviteLink) return;
    try {
      await navigator.clipboard.writeText(inviteLink);
      setLinkCopied(true);
      toast.success("Link copiado!");
    } catch {
      toast.error("Não foi possível copiar o link — copie manualmente");
    }
  };

  const toggleCase = (id: string) => {
    setSelectedCaseIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAllFiltered = () => {
    setSelectedCaseIds((prev) => {
      const next = new Set(prev);
      for (const c of filteredCases) next.add(c.id);
      return next;
    });
  };

  const cpfDigits = cpf.replace(/\D/g, "");
  const cpfError = cpfDigits.length > 0 && !isValidCpf(cpf);
  const passwordError = password.length > 0 && password.length < MIN_PASSWORD_LENGTH
    ? `A senha precisa ter pelo menos ${MIN_PASSWORD_LENGTH} caracteres`
    : null;
  const canSubmit = fullName.trim().length > 0 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && !cpfError && !passwordError && selectedCaseIds.size > 0;

  const handleSubmit = () => {
    if (!canSubmit) return;
    invite.mutate(
      {
        full_name: fullName.trim(),
        cpf: cpfDigits || null,
        email: email.trim(),
        case_ids: [...selectedCaseIds],
        password: password.trim() || undefined,
      },
      {
        onSuccess: (result) => {
          if (result.invite_link) {
            setInviteLink(result.invite_link);
          } else {
            reset();
            onOpenChange(false);
          }
        },
      },
    );
  };

  if (inviteLink) {
    return (
      <Dialog open={open} onOpenChange={(next) => { if (!next) reset(); onOpenChange(next); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Link de convite gerado</DialogTitle>
            <DialogDescription>
              Copie o link abaixo e envie para {fullName.trim() || "o colaborador"} por WhatsApp, e-mail ou qualquer
              outro canal. Ele usa o link para entrar e criar a própria senha — o acesso aos processos selecionados
              já está liberado.
            </DialogDescription>
          </DialogHeader>
          <div className="flex items-center gap-2">
            <Input readOnly value={inviteLink} className="font-mono text-xs" onFocus={(e) => e.target.select()} />
            <Button type="button" variant="outline" size="icon" onClick={copyLink} title="Copiar link">
              {linkCopied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
            </Button>
          </div>
          <DialogFooter>
            <Button onClick={() => { reset(); onOpenChange(false); }}>Concluir</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) reset(); onOpenChange(next); }}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Convidar colaborador</DialogTitle>
          <DialogDescription>
            Ao entrar, ele só verá os processos selecionados abaixo — não o restante da sua conta. Defina uma senha
            inicial para a conta já nascer pronta, ou deixe em branco para gerar um link de convite para enviar por
            qualquer canal.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="collab-name">Nome completo</Label>
            <Input id="collab-name" value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Nome do advogado" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="collab-cpf">CPF (opcional)</Label>
              <Input
                id="collab-cpf"
                value={cpf}
                onChange={(e) => setCpf(formatCpf(e.target.value))}
                placeholder="000.000.000-00"
                className={cpfError ? "border-destructive" : undefined}
              />
              {cpfError && <p className="text-xs text-destructive">CPF inválido</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="collab-email">E-mail</Label>
              <Input id="collab-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="email@exemplo.com" />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="collab-password">Senha inicial (opcional)</Label>
            <PasswordInput
              id="collab-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Deixe em branco para gerar um link de convite"
              aria-invalid={Boolean(passwordError)}
            />
            {passwordError ? (
              <p className="text-xs text-destructive">{passwordError}</p>
            ) : (
              <p className="text-xs text-muted-foreground">
                Informe uma senha para a conta já nascer pronta (a pessoa troca depois em Configurações), ou deixe em
                branco para gerar um link de convite para copiar e enviar.
              </p>
            )}
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Processos a atribuir ({selectedCaseIds.size} selecionado{selectedCaseIds.size === 1 ? "" : "s"})</Label>
              {filteredCases.length > 0 && (
                <Button type="button" variant="ghost" size="sm" onClick={selectAllFiltered} className="h-auto p-0 text-xs">
                  Selecionar todos os filtrados
                </Button>
              )}
            </div>
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Filtrar por cliente, tipo, número..."
                className="pl-8"
              />
            </div>
            <div className="border rounded-md max-h-56 overflow-y-auto divide-y">
              {filteredCases.length === 0 && (
                <p className="text-sm text-muted-foreground p-3">Nenhum processo encontrado.</p>
              )}
              {filteredCases.map((c) => (
                <label key={c.id} className="flex items-start gap-2 p-2.5 cursor-pointer hover:bg-muted/50">
                  <Checkbox checked={selectedCaseIds.has(c.id)} onCheckedChange={() => toggleCase(c.id)} className="mt-0.5" />
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{c.title}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {c.client} · {c.type} · {c.case_number}
                    </p>
                  </div>
                </label>
              ))}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleSubmit} disabled={!canSubmit || invite.isPending}>
            {invite.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            {password.trim() ? "Criar usuário" : "Gerar link"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
