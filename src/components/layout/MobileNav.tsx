import { Menu, Palette, Scale } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { NotificationBell } from "@/components/layout/NotificationBell";
import { useAuth } from "@/contexts/AuthContext";
import { useWhiteLabelSettings, DEFAULT_BRANDING } from "@/hooks/useWhiteLabelSettings";

interface MobileNavProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
}

const items = [
  ["dashboard", "Dashboard"],
  ["publications", "Publicações"],
  ["cases", "Processos"],
  ["process-search", "Buscar Processos"],
  ["calendar", "Agenda"],
  ["documents", "Documentos"],
  ["assistant", "Assistente IA"],
  ["financial-counter", "Contador Financeiro"],
  ["checklists", "Checklists"],
  ["pdf-reader", "Leitor PDF"],
  ["document-creator", "Criar Documento"],
  ["guide", "Guia de Uso"],
  ["profile", "Meu Perfil"],
  ["settings", "Configurações"],
] as const;

export function MobileNav({ activeTab, onTabChange }: MobileNavProps) {
  const { hasRole } = useAuth();
  const isAdmin = hasRole("admin");
  const { data: branding } = useWhiteLabelSettings();
  const brandName = branding?.brand_name || DEFAULT_BRANDING.brand_name;
  const brandLogo = branding?.logo_url;

  const handleNavigate = (tab: string) => {
    onTabChange(tab);
  };

  return (
    <header className="fixed inset-x-0 top-0 z-50 flex h-16 items-center justify-between gap-2 border-b bg-background/95 px-3 backdrop-blur supports-[backdrop-filter]:bg-background/80 md:hidden sm:px-4">
      <div className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden font-serif font-bold">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary/10">
          {brandLogo ? (
            <img src={brandLogo} alt={brandName} className="h-5 w-5 object-contain" />
          ) : (
            <Scale className="h-5 w-5 text-primary" />
          )}
        </div>
        <span className="truncate text-sm sm:text-base">{brandName}</span>
      </div>

      <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
        <NotificationBell onTabChange={onTabChange} className="text-foreground hover:bg-accent" />

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="icon" className="h-9 w-9 shrink-0" aria-label="Abrir menu de navegação">
              <Menu className="h-5 w-5" />
            </Button>
          </DropdownMenuTrigger>

          <DropdownMenuContent
            align="end"
            sideOffset={8}
            collisionPadding={8}
            className="max-h-[calc(100dvh-5rem)] w-[calc(100vw-1rem)] max-w-[320px] overflow-y-auto overscroll-contain p-1.5"
          >
            <DropdownMenuLabel className="px-2 py-2 text-xs text-muted-foreground">
              Navegação
            </DropdownMenuLabel>
            <DropdownMenuSeparator />

            {items.map(([id, label]) => (
              <DropdownMenuItem
                key={id}
                onSelect={() => handleNavigate(id)}
                className="min-h-11 cursor-pointer justify-between rounded-md px-3 py-2.5 text-sm"
              >
                <span className="min-w-0 truncate">{label}</span>
                {activeTab === id && <span className="ml-3 shrink-0 text-xs font-semibold text-primary">Atual</span>}
              </DropdownMenuItem>
            ))}

            {isAdmin && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onSelect={() => handleNavigate("branding")}
                  className="min-h-11 cursor-pointer rounded-md px-3 py-2.5 text-sm"
                >
                  <Palette className="mr-2 h-4 w-4 shrink-0" />
                  <span className="min-w-0 flex-1 truncate">Marca da Plataforma</span>
                  {activeTab === "branding" && <span className="ml-3 shrink-0 text-xs font-semibold text-primary">Atual</span>}
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
