import { useEffect, useState } from "react";
import { Outlet, Navigate, Link, useLocation, useNavigate } from "react-router-dom";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { useMyCases } from "@/hooks/useClientPortal";
import { useWhiteLabelSettings, DEFAULT_BRANDING } from "@/hooks/useWhiteLabelSettings";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, LogOut, Scale, Home, ListTodo, FolderOpen, Clock } from "lucide-react";

const NAV_ITEMS = [
  { to: "", label: "Meu Processo", icon: Home },
  { to: "timeline", label: "Andamento", icon: Clock },
  { to: "documentos", label: "Documentos", icon: FolderOpen },
  { to: "solicitacoes", label: "Solicitações", icon: ListTodo },
];

// Layout do "Meu Jurídico" — o espaço do cliente. Cuida da sessão, escolhe
// (ou deixa escolher, se houver mais de um) o processo ativo, e passa isso para
// as páginas filhas via useOutletContext.
export default function PortalLayout() {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const location = useLocation();
  const navigate = useNavigate();
  const { data: branding } = useWhiteLabelSettings();
  const brandName = branding?.brand_name || DEFAULT_BRANDING.brand_name;
  const brandLogo = branding?.logo_url;

  const { data: cases, isLoading: casesLoading } = useMyCases();
  const [activeCaseId, setActiveCaseId] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, newSession) => setSession(newSession));
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (cases && cases.length > 0 && !activeCaseId) {
      setActiveCaseId(cases[0].id);
    }
  }, [cases, activeCaseId]);

  if (session === undefined) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }
  if (!session) return <Navigate to="/portal/entrar" replace />;

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    navigate("/portal/entrar", { replace: true });
  };

  const basePath = "/portal";
  const currentSub = location.pathname.replace(basePath, "").replace(/^\//, "");

  if (casesLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!cases || cases.length === 0) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-background p-6 text-center gap-4">
        <Scale className="w-10 h-10 text-muted-foreground" />
        <p className="text-muted-foreground max-w-sm">
          Ainda não encontramos nenhum processo vinculado à sua conta. Fale com seu advogado para confirmar seu acesso.
        </p>
        <Button variant="outline" onClick={handleSignOut}>Sair</Button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-muted/20">
      <header className="bg-card border-b border-border sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-primary flex items-center justify-center overflow-hidden shrink-0">
              {brandLogo ? (
                <img src={brandLogo} alt={brandName} className="w-full h-full object-contain p-0.5" />
              ) : (
                <Scale className="w-5 h-5 text-primary-foreground" />
              )}
            </div>
            <div className="min-w-0">
              <p className="font-serif font-semibold text-foreground leading-tight truncate">Meu Jurídico</p>
              <p className="text-xs text-muted-foreground leading-tight truncate">{brandName}</p>
            </div>
          </div>
          {cases.length > 1 && activeCaseId && (
            <Select value={activeCaseId} onValueChange={setActiveCaseId}>
              <SelectTrigger className="w-40 sm:w-56">
                <SelectValue placeholder="Selecione um processo" />
              </SelectTrigger>
              <SelectContent>
                {cases.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.title}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <Button variant="ghost" size="icon" onClick={handleSignOut} title="Sair">
            <LogOut className="w-4 h-4" />
          </Button>
        </div>
        <nav className="max-w-3xl mx-auto px-4 flex gap-1 overflow-x-auto">
          {NAV_ITEMS.map((item) => {
            const to = item.to ? `${basePath}/${item.to}` : basePath;
            const isActive = currentSub === item.to;
            return (
              <Link
                key={item.label}
                to={to}
                className={`flex items-center gap-1.5 px-3 py-2 text-sm border-b-2 whitespace-nowrap transition-colors ${
                  isActive ? "border-primary text-primary font-medium" : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                <item.icon className="w-4 h-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>
      </header>
      <main className="max-w-3xl mx-auto px-4 py-6">
        {activeCaseId && (
          <Outlet context={{ caseId: activeCaseId, caseInfo: cases.find((c) => c.id === activeCaseId) }} />
        )}
      </main>
    </div>
  );
}
