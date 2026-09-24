import { useState } from "react";
import {
  LayoutDashboard,
  FileText,
  FilePlus,
  MessageSquare,
  Upload,
  Calendar,
  FolderOpen,
  Settings,
  Scale,
  User,
  LogOut,
  Crown,
  ShieldCheck,
  Building2,
  ChevronDown,
  ChevronRight,
  CreditCard,
  ShoppingBag,
  ListChecks,
  BookOpen,
  FileSearch,
  Palette,
  Wallet,
  Search
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import { NotificationBell } from "@/components/layout/NotificationBell";
import { useWhiteLabelSettings, DEFAULT_BRANDING } from "@/hooks/useWhiteLabelSettings";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
interface SidebarProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
}
const navItems = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { id: "publications", label: "Publicações", icon: FileSearch },
  { id: "cases", label: "Processos", icon: FolderOpen },
  { id: "process-search", label: "Buscar Processos", icon: Search },
  { id: "calendar", label: "Agenda", icon: Calendar },
  { id: "documents", label: "Meus Documentos", icon: FileText },
  { id: "document-creator", label: "Criar Documento", icon: FilePlus, supremoOnly: true },
  { id: "checklists", label: "Checklists", icon: ListChecks },
  { id: "assistant", label: "Assistente IA", icon: MessageSquare },
  { id: "pdf-reader", label: "Leitor PDF", icon: Upload },
  { id: "financial-counter", label: "Contador Financeiro", icon: Wallet },
  { id: "guide", label: "Guia de Uso", icon: BookOpen },
];
const settingsSubItems = [
  { id: "settings", label: "Preferências", icon: Settings },
  { id: "billing", label: "Planos e Pagamentos", icon: CreditCard },
  { id: "branding", label: "Marca da Plataforma", icon: Palette, adminOnly: true },
];
export function Sidebar({ activeTab, onTabChange }: SidebarProps) {
  const { user, profile, signOut, hasRole } = useAuth();
  const isSupremo = hasRole("supremo");
  const isAdmin = hasRole("admin");
  const { data: branding } = useWhiteLabelSettings();
  const brandName = branding?.brand_name || DEFAULT_BRANDING.brand_name;
  const brandTagline = branding?.tagline || DEFAULT_BRANDING.tagline;
  const brandLogo = branding?.logo_url;
  const settingsTabs = ["settings", "billing", "branding"];
  const isSettingsTab = settingsTabs.includes(activeTab);
  const [settingsOpen, setSettingsOpen] = useState(isSettingsTab);
  const visibleSettingsSubItems = settingsSubItems.filter((item) => !item.adminOnly || isAdmin);
  const getInitials = (name: string | null | undefined) => {
    if (!name) return user?.email?.charAt(0).toUpperCase() || "U";
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  };
  return (
    <aside className="fixed left-0 top-0 hidden h-screen w-56 flex-col bg-sidebar md:flex lg:w-60 xl:w-64">
      {/* Logo */}
      <div className="border-b border-sidebar-border p-4 xl:p-6">
        <div className="flex min-w-0 items-center gap-2.5 xl:gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-sidebar-primary">
            {brandLogo ? (
              <img src={brandLogo} alt={brandName} className="h-full w-full object-contain p-0.5" />
            ) : (
              <Scale className="h-6 w-6 text-sidebar-primary-foreground" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="truncate font-serif text-lg font-bold text-sidebar-foreground xl:text-xl" title={brandName}>{brandName}</h1>
            <p className="truncate text-[11px] text-sidebar-foreground/60 xl:text-xs" title={brandTagline}>{brandTagline}</p>
          </div>
          <div className="shrink-0">
            <NotificationBell onTabChange={onTabChange} className="text-sidebar-foreground hover:bg-sidebar-accent" />
          </div>
        </div>
      </div>
      {/* Navigation */}
      <nav className="flex-1 space-y-1 overflow-y-auto p-3 xl:p-4">
        {navItems.filter((item) => !item.supremoOnly || isSupremo).map((item) => (
          <button
            key={item.id}
            onClick={() => onTabChange(item.id)}
            title={item.label}
            className={cn(
              "sidebar-nav-item w-full min-w-0",
              activeTab === item.id && "active"
            )}
          >
            <item.icon className="h-5 w-5 shrink-0" />
            <span className="min-w-0 truncate font-medium">{item.label}</span>
          </button>
        ))}
        <Separator className="my-4 bg-sidebar-border" />
        {/* Sales Page - visible to all */}
        <button
          onClick={() => onTabChange("sales")}
          title="Planos"
          className={cn(
            "sidebar-nav-item w-full min-w-0 text-emerald-400 hover:text-emerald-300",
            activeTab === "sales" && "active"
          )}
        >
          <ShoppingBag className="h-5 w-5 shrink-0" />
          <span className="min-w-0 truncate font-medium">Planos</span>
        </button>
        {/* Settings with submenu */}
        <Collapsible open={settingsOpen} onOpenChange={setSettingsOpen}>
          <CollapsibleTrigger asChild>
            <button
              title="Configurações"
              className={cn(
                "sidebar-nav-item w-full min-w-0",
                isSettingsTab && "active"
              )}
            >
              <Settings className="h-5 w-5 shrink-0" />
              <span className="min-w-0 flex-1 truncate text-left font-medium">Configurações</span>
              {settingsOpen ? (
                <ChevronDown className="h-4 w-4 shrink-0" />
              ) : (
                <ChevronRight className="h-4 w-4 shrink-0" />
              )}
            </button>
          </CollapsibleTrigger>
          <CollapsibleContent className="mt-1 space-y-1 pl-2 lg:pl-3 xl:pl-4">
            {visibleSettingsSubItems.map((item) => (
              <button
                key={item.id}
                onClick={() => onTabChange(item.id)}
                title={item.label}
                className={cn(
                  "sidebar-nav-item w-full min-w-0 text-sm",
                  activeTab === item.id && "active",
                  item.highlight && "text-amber-500 hover:text-amber-400",
                  item.premium && "text-purple-400 hover:text-purple-300"
                )}
              >
                <item.icon className="h-4 w-4 shrink-0" />
                <span className="min-w-0 truncate font-medium">{item.label}</span>
                {item.premium && isSupremo && (
                  <Crown className="ml-auto h-3 w-3 shrink-0 text-purple-400" />
                )}
              </button>
            ))}
          </CollapsibleContent>
        </Collapsible>
        {/* Admin links - only for admins */}
        {isAdmin && (
          <>
            <button
              onClick={() => onTabChange("admin")}
              title="Administração"
              className={cn(
                "sidebar-nav-item w-full min-w-0 text-red-400 hover:text-red-300",
                activeTab === "admin" && "active"
              )}
            >
              <ShieldCheck className="h-5 w-5 shrink-0" />
              <span className="min-w-0 truncate font-medium">Administração</span>
            </button>
            <button
              onClick={() => onTabChange("companies")}
              title="Empresas"
              className={cn(
                "sidebar-nav-item w-full min-w-0 text-red-400 hover:text-red-300",
                activeTab === "companies" && "active"
              )}
            >
              <Building2 className="h-5 w-5 shrink-0" />
              <span className="min-w-0 truncate font-medium">Empresas</span>
            </button>
          </>
        )}
      </nav>
      {/* User Profile */}
      <div className="space-y-2 border-t border-sidebar-border p-3 xl:p-4">
        <button
          onClick={() => onTabChange("profile")}
          title="Meu Perfil"
          className={cn(
            "sidebar-nav-item w-full min-w-0",
            activeTab === "profile" && "active"
          )}
        >
          <User className="h-5 w-5 shrink-0" />
          <span className="min-w-0 truncate font-medium">Meu Perfil</span>
        </button>
        <Separator className="my-2 bg-sidebar-border" />
        {/* User Info */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex w-full min-w-0 items-center gap-2.5 rounded-lg p-2 transition-colors hover:bg-sidebar-accent xl:gap-3">
              <Avatar className="h-8 w-8 shrink-0">
                <AvatarImage src={profile?.avatar_url || ""} />
                <AvatarFallback className="bg-primary text-xs text-primary-foreground">
                  {getInitials(profile?.full_name)}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1 text-left">
                <p className="truncate text-sm font-medium text-sidebar-foreground">
                  {profile?.full_name || "Usuário"}
                </p>
                <p className="truncate text-xs text-sidebar-foreground/60">
                  {user?.email}
                </p>
              </div>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel>Minha Conta</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => onTabChange("profile")}>
              <User className="mr-2 h-4 w-4" />
              Ver Perfil
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onTabChange("settings")}>
              <Settings className="mr-2 h-4 w-4" />
              Configurações
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={signOut} className="text-destructive">
              <LogOut className="mr-2 h-4 w-4" />
              Sair
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </aside>
  );
}
