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
  Lightbulb,
  LogOut,
  Link2,
  Crown,
  ShieldCheck,
  ChevronDown,
  ChevronRight,
  Bell,
  CreditCard,
  ShoppingBag,
  ListChecks,
  BookOpen,
  FileSearch,
  Palette,
  Wallet,
  UserSearch
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
  { id: "process-search", label: "Buscar Processos", icon: UserSearch },
  { id: "calendar", label: "Agenda", icon: Calendar },
  { id: "documents", label: "Meus Documentos", icon: FileText },
  { id: "document-creator", label: "Criar Documento", icon: FilePlus },
  { id: "checklists", label: "Checklists", icon: ListChecks },
  { id: "assistant", label: "Assistente IA", icon: MessageSquare },
  { id: "pdf-reader", label: "Leitor PDF", icon: Upload },
  { id: "financial-counter", label: "Contador Financeiro", icon: Wallet },
  { id: "guide", label: "Guia de Uso", icon: BookOpen },
];
const settingsSubItems = [
  { id: "settings", label: "Preferências", icon: Settings },
  { id: "integrations", label: "Integrações", icon: Link2, premium: true },
  { id: "notifications", label: "Notificações", icon: Bell },
  { id: "billing", label: "Planos e Pagamentos", icon: CreditCard },
  { id: "branding", label: "Marca da Plataforma", icon: Palette, adminOnly: true },
  { id: "feature-request", label: "Solicitar Funcionalidade", icon: Lightbulb, highlight: true },
];
export function Sidebar({ activeTab, onTabChange }: SidebarProps) {
  const { user, profile, signOut, hasRole } = useAuth();
  const isSupremo = hasRole("supremo");
  const isAdmin = hasRole("admin");
  const { data: branding } = useWhiteLabelSettings();
  const brandName = branding?.brand_name || DEFAULT_BRANDING.brand_name;
  const brandTagline = branding?.tagline || DEFAULT_BRANDING.tagline;
  const brandLogo = branding?.logo_url;
  const settingsTabs = ["settings", "integrations", "notifications", "billing", "branding", "feature-request"];
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
    <aside className="w-64 h-screen bg-sidebar fixed left-0 top-0 flex flex-col">
      {/* Logo */}
      <div className="p-6 border-b border-sidebar-border">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-sidebar-primary flex items-center justify-center overflow-hidden shrink-0">
            {brandLogo ? (
              <img src={brandLogo} alt={brandName} className="w-full h-full object-contain p-0.5" />
            ) : (
              <Scale className="w-6 h-6 text-sidebar-primary-foreground" />
            )}
          </div>
          <div>
            <h1 className="font-serif text-xl font-bold text-sidebar-foreground">{brandName}</h1>
            <p className="text-xs text-sidebar-foreground/60">{brandTagline}</p>
          </div>
          <div className="ml-auto">
            <NotificationBell onTabChange={onTabChange} className="text-sidebar-foreground hover:bg-sidebar-accent" />
          </div>
        </div>
      </div>
      {/* Navigation */}
      <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
        {navItems.map((item) => (
          <button
            key={item.id}
            onClick={() => onTabChange(item.id)}
            className={cn(
              "sidebar-nav-item w-full",
              activeTab === item.id && "active"
            )}
          >
            <item.icon className="w-5 h-5" />
            <span className="font-medium">{item.label}</span>
          </button>
        ))}
        <Separator className="my-4 bg-sidebar-border" />
        {/* Sales Page - visible to all */}
        <button
          onClick={() => onTabChange("sales")}
          className={cn(
            "sidebar-nav-item w-full text-emerald-400 hover:text-emerald-300",
            activeTab === "sales" && "active"
          )}
        >
          <ShoppingBag className="w-5 h-5" />
          <span className="font-medium">Planos</span>
        </button>
        {/* Settings with submenu */}
        <Collapsible open={settingsOpen} onOpenChange={setSettingsOpen}>
          <CollapsibleTrigger asChild>
            <button
              className={cn(
                "sidebar-nav-item w-full",
                isSettingsTab && "active"
              )}
            >
              <Settings className="w-5 h-5" />
              <span className="font-medium flex-1 text-left">Configurações</span>
              {settingsOpen ? (
                <ChevronDown className="w-4 h-4" />
              ) : (
                <ChevronRight className="w-4 h-4" />
              )}
            </button>
          </CollapsibleTrigger>
          <CollapsibleContent className="pl-4 space-y-1 mt-1">
            {visibleSettingsSubItems.map((item) => (
              <button
                key={item.id}
                onClick={() => onTabChange(item.id)}
                className={cn(
                  "sidebar-nav-item w-full text-sm",
                  activeTab === item.id && "active",
                  item.highlight && "text-amber-500 hover:text-amber-400",
                  item.premium && "text-purple-400 hover:text-purple-300"
                )}
              >
                <item.icon className="w-4 h-4" />
                <span className="font-medium">{item.label}</span>
                {item.premium && isSupremo && (
                  <Crown className="w-3 h-3 text-purple-400 ml-auto" />
                )}
              </button>
            ))}
          </CollapsibleContent>
        </Collapsible>
        {/* Admin link - only for admins */}
        {isAdmin && (
          <button
            onClick={() => onTabChange("admin")}
            className={cn(
              "sidebar-nav-item w-full text-red-400 hover:text-red-300",
              activeTab === "admin" && "active"
            )}
          >
            <ShieldCheck className="w-5 h-5" />
            <span className="font-medium">Administração</span>
          </button>
        )}
      </nav>
      {/* User Profile */}
      <div className="p-4 border-t border-sidebar-border space-y-2">
        <button
          onClick={() => onTabChange("profile")}
          className={cn(
            "sidebar-nav-item w-full",
            activeTab === "profile" && "active"
          )}
        >
          <User className="w-5 h-5" />
          <span className="font-medium">Meu Perfil</span>
        </button>
        <Separator className="my-2 bg-sidebar-border" />
        {/* User Info */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex items-center gap-3 w-full p-2 rounded-lg hover:bg-sidebar-accent transition-colors">
              <Avatar className="w-8 h-8">
                <AvatarImage src={profile?.avatar_url || ""} />
                <AvatarFallback className="bg-primary text-primary-foreground text-xs">
                  {getInitials(profile?.full_name)}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 text-left">
                <p className="text-sm font-medium text-sidebar-foreground truncate">
                  {profile?.full_name || "Usuário"}
                </p>
                <p className="text-xs text-sidebar-foreground/60 truncate">
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
