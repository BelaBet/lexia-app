import { useState } from "react";
import { Sidebar } from "@/components/layout/Sidebar";
import { MobileNav } from "@/components/layout/MobileNav";
import { StatsCards } from "@/components/dashboard/StatsCards";
import { RecentDocuments } from "@/components/dashboard/RecentDocuments";
import { UpcomingDeadlines } from "@/components/dashboard/UpcomingDeadlines";
import { QuickActions } from "@/components/dashboard/QuickActions";
import { AIChat } from "@/components/assistant/AIChat";
import { PDFReader } from "@/components/pdf/PDFReader";
import { DocumentCreator } from "@/components/documents/DocumentCreator";
import { DocumentsPage } from "@/components/documents/DocumentsPage";
import { CasesManager } from "@/components/cases/CasesManager";
import { CalendarView } from "@/components/calendar/CalendarView";
import { ProfilePage } from "@/components/profile/ProfilePage";
import { FeatureRequestForm } from "@/components/features/FeatureRequestForm";
import { IntegrationsPage } from "@/pages/Integrations";
import { AdminUsersPage } from "@/components/admin/AdminUsersPage";
import { SettingsPage } from "@/components/settings/SettingsPage";
import { ChecklistsManager } from "@/components/checklists/ChecklistsManager";
import { GuidePage } from "@/components/guide/GuidePage";
import { PublicationsManager } from "@/components/publications/PublicationsManager";
import { ProcessSearchFinancialCounter } from "@/components/financial/ProcessSearchFinancialCounter";
import { ProcessSearchManager } from "@/components/process-search/ProcessSearchManager";
import { BrandingSettings } from "@/components/settings/BrandingSettings";
import Sales from "@/pages/Sales";
import { useAuth } from "@/contexts/AuthContext";
const Index = () => {
  const [activeTab, setActiveTab] = useState("dashboard");
  const { profile } = useAuth();
  const renderContent = () => {
    switch (activeTab) {
      case "dashboard": return <div className="space-y-6"><div><h1 className="font-serif text-3xl font-bold text-foreground">Bem-vindo, {profile?.full_name?.split(" ")[0] || "Advogado"}!</h1><p className="text-muted-foreground mt-1">Seu assistente jurídico inteligente</p></div><StatsCards /><QuickActions onTabChange={setActiveTab} /><div className="grid grid-cols-1 lg:grid-cols-2 gap-6"><RecentDocuments /><UpcomingDeadlines /></div></div>;
      case "assistant": return <AIChat onOpenGuide={() => setActiveTab("guide")} />;
      case "pdf-reader": return <PDFReader onOpenGuide={() => setActiveTab("guide")} />;
      case "document-creator": return <DocumentCreator />;
      case "documents": return <DocumentsPage />;
      case "cases": return <CasesManager />;
      case "process-search": return <ProcessSearchManager />;
      case "checklists": return <ChecklistsManager />;
      case "guide": return <GuidePage />;
      case "calendar": return <CalendarView />;
      case "publications": return <PublicationsManager />;
      case "financial-counter": return <ProcessSearchFinancialCounter />;
      case "profile": return <ProfilePage />;
      case "feature-request": return <FeatureRequestForm />;
      case "integrations": return <IntegrationsPage />;
      case "branding": return <BrandingSettings />;
      case "admin": return <AdminUsersPage />;
      case "settings":
      case "notifications":
      case "billing": return <SettingsPage />;
      case "sales": return <Sales />;
      default: return null;
    }
  };
  return <div className="min-h-screen bg-background"><MobileNav activeTab={activeTab} onTabChange={setActiveTab} /><Sidebar activeTab={activeTab} onTabChange={setActiveTab} /><main className="min-w-0 p-4 pt-20 md:pt-8 md:ml-64 md:p-8">{renderContent()}</main></div>;
};
export default Index;
