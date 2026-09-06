import { useState } from "react";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface DeleteAccountDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const CONFIRM_PHRASE = "EXCLUIR";

// BUG-06 (corrigido): "Excluir Conta" não tinha nenhum fluxo — apenas o
// botão e um aviso de que a ação era irreversível. Exige digitar a
// palavra de confirmação (evita clique acidental num botão destrutivo) e
// chama a edge function delete-account, que apaga os dados do usuário e a
// própria conta (auth.admin.deleteUser) — nunca a de outra pessoa, sempre
// a partir do id extraído do JWT de quem está chamando.
export function DeleteAccountDialog({ open, onOpenChange }: DeleteAccountDialogProps) {
  const { toast } = useToast();
  const [confirmText, setConfirmText] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);

  const reset = () => setConfirmText("");

  const handleDelete = async () => {
    setIsDeleting(true);
    const { error } = await supabase.functions.invoke("delete-account");
    if (error) {
      setIsDeleting(false);
      toast({
        title: "Erro ao excluir conta",
        description: error.message || "Tente novamente em instantes.",
        variant: "destructive",
      });
      return;
    }

    await supabase.auth.signOut();
    window.location.href = "/auth";
  };

  return (
    <AlertDialog open={open} onOpenChange={(next) => { if (!next) reset(); onOpenChange(next); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Excluir conta permanentemente?</AlertDialogTitle>
          <AlertDialogDescription>
            Isso apaga todos os seus processos, documentos, agenda, checklists, publicações e a própria conta.
            Não pode ser desfeito.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="space-y-2">
          <Label htmlFor="delete-confirm">
            Digite <span className="font-mono font-semibold">{CONFIRM_PHRASE}</span> para confirmar
          </Label>
          <Input
            id="delete-confirm"
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            autoComplete="off"
          />
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isDeleting}>Cancelar</AlertDialogCancel>
          <Button
            variant="destructive"
            disabled={confirmText !== CONFIRM_PHRASE || isDeleting}
            onClick={handleDelete}
          >
            {isDeleting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Excluir conta
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
