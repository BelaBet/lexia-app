import { FileText, Upload, MessageSquare, FolderPlus, ClipboardList } from "lucide-react";
import { generateIntakeChecklistPdf } from "@/lib/intakeChecklistPdf";

interface QuickActionsProps {
  onTabChange: (tab: string) => void;
}

interface QuickAction {
  id: string;
  title: string;
  description: string;
  icon: typeof FileText;
  color: string;
  // When present, runs instead of navigating to a tab (e.g. a direct download).
  onClick?: () => void;
}

const baseActions: Omit<QuickAction, "onClick">[] = [
  {
    id: "documents",
    title: "Criar Documento",
    description: "Gere petições, contratos e mais",
    icon: FileText,
    color: "bg-primary/10 text-primary",
  },
  {
    id: "pdf-reader",
    title: "Analisar PDF",
    description: "Resuma documentos com IA",
    icon: Upload,
    color: "bg-gold-light text-gold-warm",
  },
  {
    id: "assistant",
    title: "Consultar IA",
    description: "Tire dúvidas jurídicas",
    icon: MessageSquare,
    color: "bg-success/10 text-success",
  },
  {
    id: "cases",
    title: "Novo Processo",
    description: "Cadastre um processo",
    icon: FolderPlus,
    color: "bg-accent text-accent-foreground",
  },
];

export function QuickActions({ onTabChange }: QuickActionsProps) {
  const actions: QuickAction[] = [
    ...baseActions,
    {
      id: "intake-checklist",
      title: "Checklist de Coleta",
      description: "PDF para o cliente preencher",
      icon: ClipboardList,
      color: "bg-warning/10 text-warning",
      onClick: () => generateIntakeChecklistPdf(),
    },
  ];

  return (
    <div className="legal-card">
      <h3 className="font-serif text-xl font-semibold mb-4">Ações Rápidas</h3>
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {actions.map((action, index) => (
          <button
            key={action.id}
            onClick={() => (action.onClick ? action.onClick() : onTabChange(action.id))}
            className="p-4 rounded-xl bg-muted/50 hover:bg-muted transition-all text-left group fade-in"
            style={{ animationDelay: `${index * 50}ms` }}
          >
            <div className={`w-10 h-10 rounded-lg ${action.color} flex items-center justify-center mb-3 group-hover:scale-110 transition-transform`}>
              <action.icon className="w-5 h-5" />
            </div>
            <p className="font-medium text-sm">{action.title}</p>
            <p className="text-xs text-muted-foreground mt-1">{action.description}</p>
          </button>
        ))}
      </div>
    </div>
  );
}
