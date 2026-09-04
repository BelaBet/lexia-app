import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2 } from "lucide-react";
import {
  Publication,
  CreatePublicationData,
  useCreatePublication,
  useUpdatePublication,
} from "@/hooks/usePublications";

interface PublicationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  publication?: Publication | null;
}

const emptyForm: CreatePublicationData = {
  process_number: "",
  source: "manual",
  content: "",
  published_date: new Date().toISOString().slice(0, 10),
  external_deadline: "",
  external_responsible_name: "",
  external_responsible_role: undefined,
  internal_deadline: "",
  internal_responsible_name: "",
  internal_responsible_role: undefined,
  tese: "",
  status: "pending",
  vara: "",
  comarca: "",
  valor_causa: null,
  data_abertura_tribunal: "",
  data_aceitacao: "",
};

export function PublicationDialog({ open, onOpenChange, publication }: PublicationDialogProps) {
  const [form, setForm] = useState<CreatePublicationData>(emptyForm);
  const [valorCausaInput, setValorCausaInput] = useState("");
  const createPublication = useCreatePublication();
  const updatePublication = useUpdatePublication();
  const isEditing = !!publication;
  const isSaving = createPublication.isPending || updatePublication.isPending;

  useEffect(() => {
    if (open) {
      if (publication) {
        setForm({
          process_number: publication.process_number || "",
          source: publication.source,
          content: publication.content,
          published_date: publication.published_date,
          external_deadline: publication.external_deadline || "",
          external_responsible_name: publication.external_responsible_name || "",
          external_responsible_role: publication.external_responsible_role || undefined,
          internal_deadline: publication.internal_deadline || "",
          internal_responsible_name: publication.internal_responsible_name || "",
          internal_responsible_role: publication.internal_responsible_role || undefined,
          tese: publication.tese || "",
          status: publication.status,
          vara: publication.vara || "",
          comarca: publication.comarca || "",
          valor_causa: publication.valor_causa,
          data_abertura_tribunal: publication.data_abertura_tribunal || "",
          data_aceitacao: publication.data_aceitacao || "",
        });
        setValorCausaInput(publication.valor_causa != null ? String(publication.valor_causa) : "");
      } else {
        setForm(emptyForm);
        setValorCausaInput("");
      }
    }
  }, [open, publication]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.content.trim() || !form.published_date) return;

    const valorCausa = valorCausaInput.trim() ? Number(valorCausaInput.replace(",", ".")) : null;
    const payload: CreatePublicationData = {
      ...form,
      valor_causa: valorCausa !== null && !Number.isNaN(valorCausa) ? valorCausa : null,
    };

    if (isEditing && publication) {
      await updatePublication.mutateAsync({ id: publication.id, ...payload });
    } else {
      await createPublication.mutateAsync(payload);
    }
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEditing ? "Editar Publicação" : "Nova Publicação"}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="process_number">Número do Processo</Label>
              <Input
                id="process_number"
                value={form.process_number}
                onChange={(e) => setForm((f) => ({ ...f, process_number: e.target.value }))}
                placeholder="0000000-00.0000.0.00.0000"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="source">Origem</Label>
              <Select
                value={form.source}
                onValueChange={(value) => setForm((f) => ({ ...f, source: value as CreatePublicationData["source"] }))}
              >
                <SelectTrigger id="source">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="manual">Manual</SelectItem>
                  <SelectItem value="jusbrasil">JusBrasil</SelectItem>
                  <SelectItem value="webjur">WebJur</SelectItem>
                  <SelectItem value="escavador">Escavador</SelectItem>
                  <SelectItem value="outro">Outro</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="content">Teor da Publicação *</Label>
            <Textarea
              id="content"
              value={form.content}
              onChange={(e) => setForm((f) => ({ ...f, content: e.target.value }))}
              placeholder="Cole ou digite o conteúdo da publicação/intimação..."
              rows={4}
              required
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="published_date">Data da Publicação *</Label>
              <Input
                id="published_date"
                type="date"
                value={form.published_date}
                onChange={(e) => setForm((f) => ({ ...f, published_date: e.target.value }))}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="status">Status</Label>
              <Select
                value={form.status}
                onValueChange={(value) => setForm((f) => ({ ...f, status: value as CreatePublicationData["status"] }))}
              >
                <SelectTrigger id="status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pending">Pendente</SelectItem>
                  <SelectItem value="in_progress">Em Andamento</SelectItem>
                  <SelectItem value="completed">Concluído</SelectItem>
                  <SelectItem value="overdue">Atrasado</SelectItem>
                  <SelectItem value="cancelled">Cancelado</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Prazo Externo */}
          <div className="rounded-lg border p-4 space-y-3">
            <p className="text-sm font-semibold text-foreground">Prazo Externo (processual)</p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="space-y-2">
                <Label htmlFor="external_deadline">Data</Label>
                <Input
                  id="external_deadline"
                  type="date"
                  value={form.external_deadline}
                  onChange={(e) => setForm((f) => ({ ...f, external_deadline: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="external_responsible_name">Responsável</Label>
                <Input
                  id="external_responsible_name"
                  value={form.external_responsible_name}
                  onChange={(e) => setForm((f) => ({ ...f, external_responsible_name: e.target.value }))}
                  placeholder="Nome"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="external_responsible_role">Tipo</Label>
                <Select
                  value={form.external_responsible_role || ""}
                  onValueChange={(value) =>
                    setForm((f) => ({ ...f, external_responsible_role: value as CreatePublicationData["external_responsible_role"] }))
                  }
                >
                  <SelectTrigger id="external_responsible_role">
                    <SelectValue placeholder="Selecione" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="advogado">Advogado</SelectItem>
                    <SelectItem value="operacional">Operacional</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          {/* Prazo Interno */}
          <div className="rounded-lg border p-4 space-y-3">
            <p className="text-sm font-semibold text-foreground">Prazo Interno (com folga de segurança)</p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="space-y-2">
                <Label htmlFor="internal_deadline">Data</Label>
                <Input
                  id="internal_deadline"
                  type="date"
                  value={form.internal_deadline}
                  onChange={(e) => setForm((f) => ({ ...f, internal_deadline: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="internal_responsible_name">Responsável</Label>
                <Input
                  id="internal_responsible_name"
                  value={form.internal_responsible_name}
                  onChange={(e) => setForm((f) => ({ ...f, internal_responsible_name: e.target.value }))}
                  placeholder="Nome"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="internal_responsible_role">Tipo</Label>
                <Select
                  value={form.internal_responsible_role || ""}
                  onValueChange={(value) =>
                    setForm((f) => ({ ...f, internal_responsible_role: value as CreatePublicationData["internal_responsible_role"] }))
                  }
                >
                  <SelectTrigger id="internal_responsible_role">
                    <SelectValue placeholder="Selecione" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="advogado">Advogado</SelectItem>
                    <SelectItem value="operacional">Operacional</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          {/* Dados Processuais destacados no sistema */}
          <div className="rounded-lg border p-4 space-y-3">
            <p className="text-sm font-semibold text-foreground">Dados Processuais</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="vara">Vara</Label>
                <Input
                  id="vara"
                  value={form.vara || ""}
                  onChange={(e) => setForm((f) => ({ ...f, vara: e.target.value }))}
                  placeholder="Ex: 3ª Vara Cível"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="comarca">Comarca</Label>
                <Input
                  id="comarca"
                  value={form.comarca || ""}
                  onChange={(e) => setForm((f) => ({ ...f, comarca: e.target.value }))}
                  placeholder="Ex: Caruaru/PE"
                />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="space-y-2">
                <Label htmlFor="valor_causa">Valor da Causa</Label>
                <Input
                  id="valor_causa"
                  inputMode="decimal"
                  value={valorCausaInput}
                  onChange={(e) => setValorCausaInput(e.target.value)}
                  placeholder="0,00"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="data_abertura_tribunal">Abertura no Tribunal</Label>
                <Input
                  id="data_abertura_tribunal"
                  type="date"
                  value={form.data_abertura_tribunal || ""}
                  onChange={(e) => setForm((f) => ({ ...f, data_abertura_tribunal: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="data_aceitacao">Data de Aceitação</Label>
                <Input
                  id="data_aceitacao"
                  type="date"
                  value={form.data_aceitacao || ""}
                  onChange={(e) => setForm((f) => ({ ...f, data_aceitacao: e.target.value }))}
                />
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="tese">Tese Jurídica</Label>
            <Textarea
              id="tese"
              value={form.tese}
              onChange={(e) => setForm((f) => ({ ...f, tese: e.target.value }))}
              placeholder="Anote a tese/argumento jurídico que será utilizado neste processo..."
              rows={3}
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={isSaving}>
              {isSaving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {isEditing ? "Salvar Alterações" : "Cadastrar Publicação"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
