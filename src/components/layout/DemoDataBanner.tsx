import { Sparkles, Trash2, Loader2 } from "lucide-react";
import { useHasDemoData, useDeleteDemoData } from "@/hooks/useDemoData";
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

// Aviso fixo no topo enquanto existir QUALQUER dado de demonstração na
// conta (processos, agenda, publicações, checklists ou documentos — ver
// useHasDemoData). Some sozinho assim que o botão abaixo apagar tudo, sem
// precisar recarregar a página.
export function DemoDataBanner() {
  const { data: hasDemoData } = useHasDemoData();
  const deleteDemoData = useDeleteDemoData();

  if (!hasDemoData) return null;

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 bg-amber-500/10 border border-amber-500/30 rounded-lg px-4 py-3 mb-6">
      <div className="flex items-center gap-2 text-sm text-amber-700 dark:text-amber-400">
        <Sparkles className="w-4 h-4 shrink-0" />
        <span>
          <strong className="font-medium">Modo demonstração:</strong> os processos, prazos e documentos que você está vendo são fictícios, só para você explorar o sistema.
        </span>
      </div>
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <button
            disabled={deleteDemoData.isPending}
            className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-md border border-amber-500/40 text-amber-700 dark:text-amber-400 hover:bg-amber-500/20 transition-colors disabled:opacity-50 shrink-0"
          >
            {deleteDemoData.isPending ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Trash2 className="w-3.5 h-3.5" />
            )}
            Apagar dados de demonstração
          </button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Apagar todos os dados de demonstração?</AlertDialogTitle>
            <AlertDialogDescription>
              Isso remove permanentemente todos os processos, itens da Agenda, publicações, checklists e
              documentos marcados como demonstração. Seus dados reais não são afetados. Essa ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteDemoData.mutate()}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Apagar tudo
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
