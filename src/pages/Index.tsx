import { useState } from "react";
import { cn } from "@/lib/utils";
import { useLocation, useNavigate } from "react-router-dom";
import { Sidebar } from "@/components/layout/Sidebar";
import { MobileNav } from "@/components/layout/MobileNav";
import { StatsCards } from "@/components/dashboard/StatsCards";
import { RecentDocuments } from "@/components/dashboard/RecentDocuments";
import { UpcomingDeadlines } from "@/components/dashboard/UpcomingDeadlines";
import { QuickActions } from "@/components/dashboard/QuickActions";
import { ProcessReportsSummary } from "@/components/dashboard/ProcessReportsSummary";
import { AIChat } from "@/components/assistant/AIChat";
import { PDFReader } from "@/components/pdf/PDFReader";
import { DocumentCreator } from "@/components/documents/DocumentCreator";
import { DocumentsPage } from "@/components/documents/DocumentsPage";
import { CasesPageNavigator } from "@/components/cases/CasesPageNavigator";
import { CalendarView } from "@/components/calendar/CalendarView";
import { ProfilePage } from "@/components/profile/ProfilePage";
import { AdminUsersPage } from "@/components/admin/AdminUsersPage";
import { AdminCompaniesPage } from "@/components/admin/AdminCompaniesPage";
import { SettingsPage } from "@/components/settings/SettingsPage";
import { ChecklistsManager } from "@/components/checklists/ChecklistsManager";
import { GuidePage } from "@/components/guide/GuidePage";
import { PublicationsManager } from "@/components/publications/PublicationsManager";
import { ProcessSearchFinancialCounter } from "@/components/financial/ProcessSearchFinancialCounter";
import { ProcessSearchManagerV2 } from "@/components/process-search/ProcessSearchManagerV2";
import { BrandingSettings } from "@/components/settings/BrandingSettings";
import Sales from "@/pages/Sales";
import { useAuth } from "@/contexts/AuthContext";
import { DemoDataBanner } from "@/components/layout/DemoDataBanner";

const Index = () => {
  const location = useLocation();
  // Ao voltar de /processos/:id (ver handleOpenCase abaixo), restaura a aba
  // em que o usuário estava antes de abrir o processo — sem isto, como a
  // troca de aba aqui é só estado local (a URL continua "/"), o botão
  // "Voltar" da página do processo sempre caía no Dashboard.
  const [activeTab, setActiveTab] = useState(() => (location.state as { activeTab?: string } | null)?.activeTab || "dashboard");
  const [focusedAgendaEventId, setFocusedAgendaEventId] = useState<string | null>(null);
  const { profile, hasRole } = useAuth();
  const isSupremo = hasRole("supremo");
  const navigate = useNavigate();
  // Menu lateral do desktop: recolhido (só ícones) ou expandido. Lembra a
  // escolha do usuário; sem escolha salva, começa recolhido em telas < 1280px
  // (notebooks), onde o menu completo tomaria espaço demais do conteúdo.
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    try {
      const saved = localStorage.getItem("sidebar-collapsed");
      if (saved !== null) return saved === "1";
    } catch { /* storage indisponível */ }
    return typeof window !== "undefined" && window.innerWidth < 1280;
  });
  const toggleSidebar = () => setSidebarCollapsed((prev) => {
    const next = !prev;
    try { localStorage.setItem("sidebar-collapsed", next ? "1" : "0"); } catch { /* storage indisponível */ }
    return next;
  });

  const handleOpenCase = (caseId: string) => {
    navigate(`/processos/${caseId}`, { state: { from: activeTab } });
  };

  const handleOpenAgendaEvent = (eventId: string) => {
    setFocusedAgendaEventId(eventId);
    setActiveTab("calendar");
  };

  const renderContent = () => {
    switch (activeTab) {
      case "dashboard": return <div className="space-y-6"><div><h1 className="font-serif text-3xl font-bold text-foreground">Bem-vindo, {profile?.full_name?.split(" ")[0] || "Advogado"}!</h1><p className="text-muted-foreground mt-1">Seu assistente jurídico inteligente</p></div><StatsCards /><QuickActions onTabChange={setActiveTab} /><ProcessReportsSummary onTabChange={setActiveTab} /><div className="grid grid-cols-1 lg:grid-cols-2 gap-6"><RecentDocuments /><UpcomingDeadlines onTabChange={setActiveTab} onOpenAgendaEvent={handleOpenAgendaEvent} /></div></div>;
      case "assistant": return <AIChat onOpenGuide={() => setActiveTab("guide")} />;
      case "pdf-reader": return <PDFReader onOpenGuide={() => setActiveTab("guide")} />;
      case "document-creator": return isSupremo ? <DocumentCreator /> : <div className="rounded-lg border p-6"><h2 className="text-lg">Acesso restrito</h2><p className="mt-1 text-sm text-muted-foreground">A criação de documentos é exclusiva do Super Admin.</p></div>;
      case "documents": return <DocumentsPage />;
      case "cases": return <CasesPageNavigator onTabChange={setActiveTab} />;
      case "process-search": return <ProcessSearchManagerV2 onOpenCase={handleOpenCase} />;
      case "checklists": return <ChecklistsManager />;
      case "guide": return <GuidePage />;
      case "calendar": return <CalendarView onOpenCase={handleOpenCase} focusEventId={focusedAgendaEventId} onFocusEventHandled={() => setFocusedAgendaEventId(null)} />;
      case "publications": return <PublicationsManager />;
      case "financial-counter": return <ProcessSearchFinancialCounter />;
      case "profile": return <ProfilePage />;
      case "branding": return <BrandingSettings />;
      case "admin": return <AdminUsersPage />;
      case "companies": return <AdminCompaniesPage />;
      case "settings":
      case "notifications":
      case "billing": return <SettingsPage onTabChange={setActiveTab} />;
      case "sales": return <Sales />;
      default: return <div className="rounded-lg border p-6"><h2 className="text-lg font-semibold">Página não encontrada</h2><p className="mt-1 text-sm text-muted-foreground">Volte ao Dashboard pelo menu lateral.</p></div>;
    }
  };

  return <div className="min-h-screen bg-background"><MobileNav activeTab={activeTab} onTabChange={setActiveTab} onOpenAgendaEvent={handleOpenAgendaEvent} /><Sidebar activeTab={activeTab} onTabChange={setActiveTab} onOpenAgendaEvent={handleOpenAgendaEvent} collapsed={sidebarCollapsed} onToggleCollapsed={toggleSidebar} /><main className={cn("min-w-0 p-4 pt-20 transition-[margin] duration-200 md:p-6 md:pt-6 lg:p-7 xl:p-8", sidebarCollapsed ? "md:ml-16" : "md:ml-56 lg:ml-60 xl:ml-64")}><DemoDataBanner />{renderContent()}</main></div>;
};

export default Index;
