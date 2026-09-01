import { Calendar, FileText, FolderOpen, Menu, MessageSquare, Scale, FileSearch } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { NotificationBell } from "@/components/layout/NotificationBell";

interface MobileNavProps { activeTab: string; onTabChange: (tab: string) => void; }

const items = [
  ["dashboard", "Dashboard"],
  ["documents", "Documentos"],
  ["assistant", "Assistente IA"],
  ["cases", "Casos"],
  ["calendar", "Agenda"],
  ["publications", "Publicações"],
  ["checklists", "Checklists"],
  ["pdf-reader", "Leitor PDF"],
  ["document-creator", "Criar Documento"],
  ["guide", "Guia de Uso"],
  ["profile", "Meu Perfil"],
  ["settings", "Configurações"],
] as const;

export function MobileNav({ activeTab, onTabChange }: MobileNavProps) {
  return (
    <div className="md:hidden fixed top-0 left-0 right-0 z-50 h-16 border-b bg-background/95 backdrop-blur flex items-center justify-between px-4">
      <div className="flex items-center gap-2 font-serif font-bold"><Scale className="w-5 h-5 text-primary" />LexIA</div>
      <div className="flex items-center gap-2">
        <NotificationBell onTabChange={onTabChange} className="text-foreground hover:bg-accent" />
        <DropdownMenu>
          <DropdownMenuTrigger asChild><Button variant="outline" size="icon" aria-label="Abrir menu"><Menu className="h-5 w-5" /></Button></DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            {items.map(([id, label]) => <DropdownMenuItem key={id} onClick={() => onTabChange(id)}>{label}{activeTab === id ? " ✓" : ""}</DropdownMenuItem>)}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
