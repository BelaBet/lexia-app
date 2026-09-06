import { Navigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useMfaChallengeRequired } from "@/hooks/useMfa";
import { Loader2 } from "lucide-react";

interface ProtectedRouteProps {
  children: React.ReactNode;
  requiredRole?: "admin" | "user" | "premium";
}

export function ProtectedRoute({ children, requiredRole }: ProtectedRouteProps) {
  const { user, loading, hasRole } = useAuth();
  // BUG-07: sem isto, uma sessão de senha (aal1) já bastava para entrar no
  // app mesmo com 2FA ativado — bastava abrir "/" direto numa aba nova
  // (ou digitar a URL) sem passar pelo desafio mostrado em /auth.
  const { checking: checkingMfa, required: mfaRequired } = useMfaChallengeRequired(user);

  if (loading || checkingMfa) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/auth" replace />;
  }

  if (mfaRequired) {
    return <Navigate to="/auth" replace />;
  }

  if (requiredRole && !hasRole(requiredRole)) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}
