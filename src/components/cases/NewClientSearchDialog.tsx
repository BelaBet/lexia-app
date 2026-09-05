import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/ui/password-input";
import { Loader2, UserPlus, Search } from "lucide-react";
import { toast } from "sonner";
import { useCreateClientWithSearch } from "@/hooks/useNewClientSearch";

// "Novo Cliente": cadastra o cliente e já dispara a busca do processo dele
// no JusBrasil pelo nome, sem precisar que o processo exista antes. Ver
// src/hooks/useNewClientSearch.ts para o passo a passo completo.
export default function NewClientSearchDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const createClientWithSearch = useCreateClientWithSearch();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [apiKey, setApiKey] = useState("");

  const reset = () => {
    setFullName("");
    setEmail("");
    setPhone("");
    setApiKey("");
  };

  const handleSubmit = async () => {
    if (!fullName.trim() || !email.trim()) {
      toast.error("Informe nome e e-mail do cliente");
      return;
    }
    try {
      const result = await createClientWithSearch.mutateAsync({
        full_name: fullName,
        email,
        phone,
        api_key: apiKey,
      });
      if (result.imported > 0) {
        toast.success(`Cliente cadastrado e convidado! Já encontramos ${result.imported} processo(s).`);
      } else {
        toast.success(
          "Cliente cadastrado e convidado! A busca do processo pelo nome pode levar até 72h — assim que aparecer, já fica vinculado a este cliente.",
        );
      }
      reset();
      onOpenChange(false);
    } catch {
      // erro já mostrado via toast pelo hook
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) reset(); onOpenChange(next); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="font-serif flex items-center gap-2">
            <UserPlus className="w-5 h-5" /> Novo Cliente
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 mt-2">
          <p className="text-sm text-muted-foreground">
            Cadastre o cliente e o sistema já busca o processo dele no JusBrasil pelo nome. Quando o processo
            for encontrado, ele aparece automaticamente já vinculado a este cliente.
          </p>
          <div className="space-y-1.5">
            <Label>Nome completo do cliente</Label>
            <Input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Nome completo ou razão social" />
          </div>
          <div className="space-y-1.5">
            <Label>E-mail</Label>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="cliente@email.com" />
          </div>
          <div className="space-y-1.5">
            <Label>Telefone (opcional)</Label>
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="(00) 00000-0000" />
          </div>
          <div className="space-y-1.5">
            <Label>Chave de API do JusBrasil</Label>
            <PasswordInput
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="Deixe em branco para reaproveitar a chave já configurada"
            />
            <p className="text-xs text-muted-foreground">
              Se você já configurou uma busca antes em Integrações, pode deixar em branco.
            </p>
          </div>
        </div>
        <DialogFooter>
          <Button onClick={handleSubmit} disabled={createClientWithSearch.isPending}>
            {createClientWithSearch.isPending ? (
              <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
            ) : (
              <Search className="w-4 h-4 mr-1.5" />
            )}
            Cadastrar e buscar processo
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
