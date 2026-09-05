import { useState } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, UserPlus, Sparkles, Plus, Mail, CheckCircle2, Clock } from "lucide-react";
import { toast } from "sonner";
import {
  useCaseClientsList,
  useInviteClient,
  useCaseTimelineManage,
  translateForClient,
  useCaseRequestsManage,
  useCaseDocumentsManage,
} from "@/hooks/useCaseClientPortal";

// Painel "Espaço do Cliente — Meu Jurídico" para inserir dentro da tela de
// um processo, no painel interno do advogado. Uso:
//
//   import ClientPortalPanel from "@/components/cases/ClientPortalPanel";
//   ...
//   <ClientPortalPanel caseId={caseRow.id} />
//
export default function ClientPortalPanel({ caseId }: { caseId: string }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Espaço do Cliente — Meu Jurídico</CardTitle>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="clientes">
          <TabsList>
            <TabsTrigger value="clientes">Clientes</TabsTrigger>
            <TabsTrigger value="timeline">Andamento</TabsTrigger>
            <TabsTrigger value="solicitacoes">Solicitações</TabsTrigger>
            <TabsTrigger value="documentos">Documentos</TabsTrigger>
          </TabsList>
          <TabsContent value="clientes" className="mt-4">
            <ClientsTab caseId={caseId} />
          </TabsContent>
          <TabsContent value="timeline" className="mt-4">
            <TimelineTab caseId={caseId} />
          </TabsContent>
          <TabsContent value="solicitacoes" className="mt-4">
            <RequestsTab caseId={caseId} />
          </TabsContent>
          <TabsContent value="documentos" className="mt-4">
            <DocumentsTab caseId={caseId} />
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}

function ClientsTab({ caseId }: { caseId: string }) {
  const { data: clients, isLoading } = useCaseClientsList(caseId);
  const inviteMutation = useInviteClient(caseId);
  const [open, setOpen] = useState(false);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");

  const handleInvite = async () => {
    if (!fullName.trim() || !email.trim()) {
      toast.error("Informe nome e e-mail");
      return;
    }
    try {
      const result = await inviteMutation.mutateAsync({ full_name: fullName, email, phone });
      toast.success(result.already_had_access ? "Cliente vinculado ao processo!" : "Convite enviado por e-mail!");
      setOpen(false);
      setFullName("");
      setEmail("");
      setPhone("");
    } catch (err) {
      toast.error("Erro ao convidar cliente", { description: err instanceof Error ? err.message : undefined });
    }
  };

  return (
    <div className="space-y-3">
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button size="sm">
            <UserPlus className="w-4 h-4 mr-1.5" /> Criar acesso para cliente
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Dar acesso ao Meu Jurídico</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label>Nome completo</Label>
              <Input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Nome do cliente" />
            </div>
            <div className="space-y-1.5">
              <Label>E-mail</Label>
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="cliente@email.com" />
            </div>
            <div className="space-y-1.5">
              <Label>Telefone (opcional)</Label>
              <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="(00) 00000-0000" />
            </div>
          </div>
          <DialogFooter>
            <Button onClick={handleInvite} disabled={inviteMutation.isPending}>
              {inviteMutation.isPending ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Mail className="w-4 h-4 mr-1.5" />}
              Enviar convite
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {isLoading ? (
        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
      ) : !clients || clients.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhum cliente com acesso a este processo ainda.</p>
      ) : (
        <div className="space-y-2">
          {clients.map((c) => (
            <div key={c.id} className="flex items-center justify-between gap-2 text-sm border rounded-lg px-3 py-2">
              <div>
                <p className="font-medium text-foreground">{c.full_name}</p>
                <p className="text-muted-foreground">{c.email}</p>
              </div>
              <Badge variant={c.has_access ? "default" : "outline"}>{c.has_access ? "Acesso ativo" : "Convite enviado"}</Badge>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function TimelineTab({ caseId }: { caseId: string }) {
  const { listQuery, createMutation } = useCaseTimelineManage(caseId);
  const [open, setOpen] = useState(false);
  const [rawText, setRawText] = useState("");
  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [eventDate, setEventDate] = useState(new Date().toISOString().slice(0, 10));
  const [visibleToClient, setVisibleToClient] = useState(true);
  const [translating, setTranslating] = useState(false);

  const handleTranslate = async () => {
    if (!rawText.trim()) {
      toast.error("Cole o texto da movimentação primeiro");
      return;
    }
    setTranslating(true);
    try {
      const result = await translateForClient(caseId, rawText);
      setTitle(result.title);
      setSummary(result.client_summary);
      toast.success("Tradução gerada — revise antes de salvar");
    } catch (err) {
      toast.error("Erro ao traduzir", { description: err instanceof Error ? err.message : undefined });
    } finally {
      setTranslating(false);
    }
  };

  const handleSave = async () => {
    if (!title.trim() || !summary.trim()) {
      toast.error("Preencha o título e o resumo para o cliente");
      return;
    }
    try {
      await createMutation.mutateAsync({ title, client_summary: summary, event_date: eventDate, visible_to_client: visibleToClient });
      toast.success("Atualização registrada!");
      setOpen(false);
      setRawText("");
      setTitle("");
      setSummary("");
    } catch {
      toast.error("Erro ao salvar");
    }
  };

  return (
    <div className="space-y-3">
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button size="sm">
            <Plus className="w-4 h-4 mr-1.5" /> Nova atualização
          </Button>
        </DialogTrigger>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Nova atualização para o cliente</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label>Cole aqui o texto jurídico (opcional)</Label>
              <Textarea rows={3} value={rawText} onChange={(e) => setRawText(e.target.value)} placeholder="Ex: juntada de petição intermediária..." />
              <Button type="button" size="sm" variant="outline" onClick={handleTranslate} disabled={translating}>
                {translating ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Sparkles className="w-4 h-4 mr-1.5" />}
                Traduzir com IA
              </Button>
            </div>
            <div className="space-y-1.5">
              <Label>Data</Label>
              <Input type="date" value={eventDate} onChange={(e) => setEventDate(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Título (para o cliente)</Label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ex: Petição apresentada ao juiz" />
            </div>
            <div className="space-y-1.5">
              <Label>O que aconteceu, em linguagem simples</Label>
              <Textarea rows={3} value={summary} onChange={(e) => setSummary(e.target.value)} />
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={visibleToClient} onCheckedChange={setVisibleToClient} id="visible-toggle" />
              <Label htmlFor="visible-toggle" className="text-sm">Mostrar para o cliente</Label>
            </div>
          </div>
          <DialogFooter>
            <Button onClick={handleSave} disabled={createMutation.isPending}>
              {createMutation.isPending && <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {listQuery.isLoading ? (
        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
      ) : !listQuery.data || listQuery.data.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhuma atualização registrada ainda.</p>
      ) : (
        <div className="space-y-2">
          {listQuery.data.map((event) => (
            <div key={event.id} className="border rounded-lg px-3 py-2 text-sm">
              <div className="flex items-center justify-between gap-2">
                <p className="font-medium text-foreground flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-primary" /> {event.title}
                </p>
                {!event.visible_to_client && <Badge variant="outline">Interno</Badge>}
              </div>
              <p className="text-muted-foreground mt-0.5">{event.client_summary}</p>
              <p className="text-xs text-muted-foreground mt-1">
                {format(new Date(event.event_date + "T00:00:00"), "d/MM/yyyy", { locale: ptBR })}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function RequestsTab({ caseId }: { caseId: string }) {
  const { listQuery, createMutation } = useCaseRequestsManage(caseId);
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<"document" | "other" | "signature" | "questionnaire">("document");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [dueDate, setDueDate] = useState("");

  const handleCreate = async () => {
    if (!title.trim()) {
      toast.error("Informe o título da solicitação");
      return;
    }
    try {
      await createMutation.mutateAsync({ type, title, description, due_date: dueDate || undefined });
      toast.success("Solicitação enviada ao cliente!");
      setOpen(false);
      setTitle("");
      setDescription("");
      setDueDate("");
    } catch {
      toast.error("Erro ao criar solicitação");
    }
  };

  return (
    <div className="space-y-3">
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button size="sm">
            <Plus className="w-4 h-4 mr-1.5" /> Nova solicitação
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Pedir algo ao cliente</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label>Tipo</Label>
              <Select value={type} onValueChange={(v) => setType(v as typeof type)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="document">Documento</SelectItem>
                  <SelectItem value="signature">Assinatura</SelectItem>
                  <SelectItem value="questionnaire">Questionário</SelectItem>
                  <SelectItem value="other">Outro</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Título</Label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ex: Enviar comprovante de residência" />
            </div>
            <div className="space-y-1.5">
              <Label>Detalhes (opcional)</Label>
              <Textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Prazo (opcional)</Label>
              <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button onClick={handleCreate} disabled={createMutation.isPending}>
              {createMutation.isPending && <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />}
              Enviar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {listQuery.isLoading ? (
        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
      ) : !listQuery.data || listQuery.data.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhuma solicitação criada ainda.</p>
      ) : (
        <div className="space-y-2">
          {listQuery.data.map((req) => (
            <div key={req.id} className="flex items-center justify-between gap-2 border rounded-lg px-3 py-2 text-sm">
              <div>
                <p className="font-medium text-foreground">{req.title}</p>
                {req.due_date && (
                  <p className="text-xs text-muted-foreground">
                    Prazo: {format(new Date(req.due_date + "T00:00:00"), "d/MM/yyyy", { locale: ptBR })}
                  </p>
                )}
              </div>
              <Badge variant={req.status === "fulfilled" ? "default" : req.status === "cancelled" ? "secondary" : "outline"}>
                {req.status === "fulfilled" ? (
                  <>
                    <CheckCircle2 className="w-3 h-3 mr-1" />
                    Concluída
                  </>
                ) : req.status === "cancelled" ? (
                  "Cancelada"
                ) : (
                  "Pendente"
                )}
              </Badge>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function DocumentsTab({ caseId }: { caseId: string }) {
  const { data: documents, isLoading } = useCaseDocumentsManage(caseId);
  return (
    <div className="space-y-2">
      {isLoading ? (
        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
      ) : !documents || documents.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhum documento trocado com o cliente ainda.</p>
      ) : (
        documents.map((doc) => (
          <div key={doc.id} className="flex items-center justify-between gap-2 border rounded-lg px-3 py-2 text-sm">
            <span className="text-foreground truncate">{doc.file_name}</span>
            <Badge variant="outline">{doc.uploaded_by === "client" ? "Do cliente" : "Do escritório"}</Badge>
          </div>
        ))
      )}
    </div>
  );
}
