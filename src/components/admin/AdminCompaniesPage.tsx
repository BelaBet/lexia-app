import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import {
  useCompanies,
  useCreateCompany,
  useCompanyMembers,
  useInviteCompanyMember,
  Company,
} from "@/hooks/useCompanies";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Building2, Plus, UserPlus, AlertTriangle, Loader2, Eye, EyeOff } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { formatCnpj, isValidCnpj } from "@/lib/cnpj";

const MIN_PASSWORD_LENGTH = 6;

function PasswordField({ id, label, value, onChange, error }: { id: string; label: string; value: string; onChange: (value: string) => void; error?: string | null }) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <div className="relative">
        <Input
          id={id}
          type={visible ? "text" : "password"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          autoComplete="new-password"
          className="pr-10"
          aria-invalid={Boolean(error)}
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? "Ocultar senha" : "Mostrar senha"}
          title={visible ? "Ocultar senha" : "Mostrar senha"}
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground"
        >
          {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}

function CreateCompanyDialog() {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [legalName, setLegalName] = useState("");
  const [document, setDocument] = useState("");
  const [firstUserName, setFirstUserName] = useState("");
  const [firstUserEmail, setFirstUserEmail] = useState("");
  const [firstUserPassword, setFirstUserPassword] = useState("");
  const createCompany = useCreateCompany();
  const inviteMember = useInviteCompanyMember();

  const cnpjDigits = document.replace(/\D/g, "");
  const cnpjError = cnpjDigits.length > 0 && !isValidCnpj(document) ? "CNPJ inválido" : null;
  const hasFirstUserName = firstUserName.trim().length > 0;
  const hasFirstUserEmail = firstUserEmail.trim().length > 0;
  const firstUserIncomplete = hasFirstUserName !== hasFirstUserEmail;
  const passwordError = firstUserPassword.length > 0 && firstUserPassword.length < MIN_PASSWORD_LENGTH ? `A senha precisa ter pelo menos ${MIN_PASSWORD_LENGTH} caracteres` : null;

  const resetForm = () => {
    setName("");
    setLegalName("");
    setDocument("");
    setFirstUserName("");
    setFirstUserEmail("");
    setFirstUserPassword("");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || cnpjError || firstUserIncomplete || passwordError) return;
    try {
      const company = await createCompany.mutateAsync({
        name: name.trim(),
        legal_name: legalName.trim() || undefined,
        document: cnpjDigits || undefined,
      });
      if (hasFirstUserName && hasFirstUserEmail) {
        await inviteMember.mutateAsync({
          company_id: company.id,
          full_name: firstUserName.trim(),
          email: firstUserEmail.trim(),
          password: firstUserPassword.trim() || undefined,
        });
      }
      setOpen(false);
      resetForm();
    } catch {
      // Erros já são exibidos via toast pelos próprios hooks (useCreateCompany
      // / useInviteCompanyMember) — se a empresa foi criada mas o convite
      // falhou, ela já aparece na lista e o usuário pode convidar de novo
      // pelo botão "Convidar usuário" do card da empresa.
    }
  };

  const isSubmitting = createCompany.isPending || inviteMember.isPending;

  return (
    <Dialog open={open} onOpenChange={(next) => { setOpen(next); if (!next) resetForm(); }}>
      <DialogTrigger asChild>
        <Button className="gap-1.5">
          <Plus className="w-4 h-4" />
          Adicionar empresa
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Adicionar empresa</DialogTitle>
          <DialogDescription>
            Cria uma nova empresa white label. O slug é gerado automaticamente a partir do nome.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="company-name">Nome</Label>
            <Input id="company-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Escritório Exemplo" required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="company-legal-name">Razão social (opcional)</Label>
            <Input id="company-legal-name" value={legalName} onChange={(e) => setLegalName(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="company-document">CNPJ (opcional)</Label>
            <Input
              id="company-document"
              value={document}
              onChange={(e) => setDocument(formatCnpj(e.target.value))}
              placeholder="00.000.000/0000-00"
              inputMode="numeric"
              aria-invalid={Boolean(cnpjError)}
            />
            {cnpjError && <p className="text-sm text-destructive">{cnpjError}</p>}
          </div>
          <div className="space-y-3 rounded-md border border-border p-3">
            <p className="text-sm font-medium">Primeiro usuário (opcional)</p>
            <div className="space-y-2">
              <Label htmlFor="first-user-name">Nome completo</Label>
              <Input id="first-user-name" value={firstUserName} onChange={(e) => setFirstUserName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="first-user-email">E-mail</Label>
              <Input id="first-user-email" type="email" value={firstUserEmail} onChange={(e) => setFirstUserEmail(e.target.value)} />
            </div>
            <PasswordField id="first-user-password" label="Senha inicial (opcional)" value={firstUserPassword} onChange={setFirstUserPassword} error={passwordError} />
            <p className="text-xs text-muted-foreground">Deixe em branco para enviar um convite por e-mail em vez de definir a senha agora. Se definir, a pessoa poderá trocá-la depois em Configurações.</p>
            {firstUserIncomplete && <p className="text-sm text-destructive">Informe nome e e-mail para convidar o primeiro usuário.</p>}
          </div>
          <DialogFooter>
            <Button type="submit" disabled={isSubmitting || !name.trim() || Boolean(cnpjError) || firstUserIncomplete || Boolean(passwordError)} className="gap-1.5">
              {isSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
              Adicionar empresa
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function InviteMemberDialog({ company }: { company: Company }) {
  const [open, setOpen] = useState(false);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const inviteMember = useInviteCompanyMember();

  const passwordError = password.length > 0 && password.length < MIN_PASSWORD_LENGTH ? `A senha precisa ter pelo menos ${MIN_PASSWORD_LENGTH} caracteres` : null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!fullName.trim() || !email.trim() || passwordError) return;
    inviteMember.mutate(
      { company_id: company.id, full_name: fullName.trim(), email: email.trim(), password: password.trim() || undefined },
      {
        onSuccess: () => {
          setOpen(false);
          setFullName("");
          setEmail("");
          setPassword("");
        },
      }
    );
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="gap-1.5">
          <UserPlus className="w-3.5 h-3.5" />
          Convidar usuário
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Convidar usuário para {company.name}</DialogTitle>
          <DialogDescription>
            Defina uma senha inicial para a conta já nascer pronta, ou deixe em branco para enviar um e-mail com link para a pessoa definir a senha. Se o e-mail já tiver conta sem empresa, associamos direto.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="member-name">Nome completo</Label>
            <Input id="member-name" value={fullName} onChange={(e) => setFullName(e.target.value)} required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="member-email">E-mail</Label>
            <Input id="member-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
          <PasswordField id="member-password" label="Senha inicial (opcional)" value={password} onChange={setPassword} error={passwordError} />
          <DialogFooter>
            <Button type="submit" disabled={inviteMember.isPending || !fullName.trim() || !email.trim() || Boolean(passwordError)} className="gap-1.5">
              {inviteMember.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
              {password.trim() ? "Criar usuário" : "Enviar convite"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function CompanyMembersList({ company }: { company: Company }) {
  const { data: members, isLoading } = useCompanyMembers(company.id);

  return (
    <div className="mt-4 space-y-2">
      {isLoading ? (
        <Skeleton className="h-10 w-full" />
      ) : members?.length ? (
        members.map((member) => (
          <div key={member.user_id} className="flex items-center justify-between text-sm border border-border rounded-md px-3 py-2">
            <span>{member.full_name || "Sem nome"}</span>
            <span className="text-xs text-muted-foreground">
              desde {format(new Date(member.created_at), "dd/MM/yyyy", { locale: ptBR })}
            </span>
          </div>
        ))
      ) : (
        <p className="text-sm text-muted-foreground">Nenhum usuário nesta empresa ainda.</p>
      )}
    </div>
  );
}

export function AdminCompaniesPage() {
  const { hasRole } = useAuth();
  const { data: companies, isLoading, error } = useCompanies();
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const isAdmin = hasRole("admin") || hasRole("supremo");

  if (!isAdmin) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] gap-4">
        <AlertTriangle className="w-16 h-16 text-destructive" />
        <h2 className="text-2xl font-bold text-foreground">Acesso Negado</h2>
        <p className="text-muted-foreground">Você não tem permissão para acessar esta página.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="font-serif text-3xl font-bold text-foreground">Empresas</h1>
          <p className="text-muted-foreground mt-1">Cadastre empresas white label e os usuários de cada uma</p>
        </div>
        <CreateCompanyDialog />
      </div>

      {isLoading ? (
        <div className="space-y-4">
          {[...Array(3)].map((_, i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
      ) : error ? (
        <div className="text-center py-8 text-destructive">Erro ao carregar empresas: {error.message}</div>
      ) : !companies?.length ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <Building2 className="w-10 h-10 mx-auto mb-3 opacity-50" />
            Nenhuma empresa cadastrada ainda.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {companies.map((company) => (
            <Card key={company.id}>
              <CardHeader>
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      {company.name}
                      <Badge variant="outline" className={company.status === "active" ? "text-emerald-500 border-emerald-500/30" : "text-muted-foreground"}>
                        {company.status === "active" ? "Ativa" : company.status === "suspended" ? "Suspensa" : "Inativa"}
                      </Badge>
                    </CardTitle>
                    <CardDescription>{company.legal_name || company.slug}</CardDescription>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <InviteMemberDialog company={company} />
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setExpandedId(expandedId === company.id ? null : company.id)}
                    >
                      {expandedId === company.id ? "Ocultar usuários" : "Ver usuários"}
                    </Button>
                  </div>
                </div>
              </CardHeader>
              {expandedId === company.id && (
                <CardContent className="pt-0">
                  <CompanyMembersList company={company} />
                </CardContent>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
