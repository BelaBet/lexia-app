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
import { Building2, Plus, UserPlus, AlertTriangle, Loader2 } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

function CreateCompanyDialog() {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [legalName, setLegalName] = useState("");
  const [document, setDocument] = useState("");
  const createCompany = useCreateCompany();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    createCompany.mutate(
      { name: name.trim(), legal_name: legalName.trim() || undefined, document: document.trim() || undefined },
      {
        onSuccess: () => {
          setOpen(false);
          setName("");
          setLegalName("");
          setDocument("");
        },
      }
    );
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="gap-1.5">
          <Plus className="w-4 h-4" />
          Nova empresa
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Cadastrar empresa</DialogTitle>
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
            <Input id="company-document" value={document} onChange={(e) => setDocument(e.target.value)} />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={createCompany.isPending || !name.trim()} className="gap-1.5">
              {createCompany.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
              Cadastrar
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
  const inviteMember = useInviteCompanyMember();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!fullName.trim() || !email.trim()) return;
    inviteMember.mutate(
      { company_id: company.id, full_name: fullName.trim(), email: email.trim() },
      {
        onSuccess: () => {
          setOpen(false);
          setFullName("");
          setEmail("");
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
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Convidar usuário para {company.name}</DialogTitle>
          <DialogDescription>
            Enviamos um e-mail para a pessoa definir a senha. Se o e-mail já tiver conta sem empresa, associamos direto.
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
          <DialogFooter>
            <Button type="submit" disabled={inviteMember.isPending || !fullName.trim() || !email.trim()} className="gap-1.5">
              {inviteMember.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
              Enviar convite
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
