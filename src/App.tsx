import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { BrandingProvider } from "@/components/layout/BrandingProvider";
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import Pricing from "./pages/Pricing";
import NotFound from "./pages/NotFound";
import ResetPassword from "./pages/ResetPassword";
import PortalAuth from "./pages/portal/PortalAuth";
import PortalSetPassword from "./pages/portal/PortalSetPassword";
import PortalLayout from "./pages/portal/PortalLayout";
import PortalHome from "./pages/portal/PortalHome";
import PortalTimeline from "./pages/portal/PortalTimeline";
import PortalDocuments from "./pages/portal/PortalDocuments";
import PortalRequests from "./pages/portal/PortalRequests";
const queryClient = new QueryClient();
const App = () => (
  <QueryClientProvider client={queryClient}>
    <BrandingProvider>
      <AuthProvider>
        <TooltipProvider>
          <Toaster />
          <Sonner />
          <BrowserRouter>
            <Routes>
              <Route path="/auth" element={<Auth />} />
              <Route path="/reset-password" element={<ResetPassword />} />
              <Route path="/pricing" element={<Pricing />} />
              <Route path="/portal/entrar" element={<PortalAuth />} />
              <Route path="/portal/definir-senha" element={<PortalSetPassword />} />
              <Route path="/portal" element={<PortalLayout />}>
                <Route index element={<PortalHome />} />
                <Route path="timeline" element={<PortalTimeline />} />
                <Route path="documentos" element={<PortalDocuments />} />
                <Route path="solicitacoes" element={<PortalRequests />} />
              </Route>
              <Route
                path="/"
                element={
                  <ProtectedRoute>
                    <Index />
                  </ProtectedRoute>
                }
              />
              {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
              <Route path="*" element={<NotFound />} />
            </Routes>
          </BrowserRouter>
        </TooltipProvider>
      </AuthProvider>
    </BrandingProvider>
  </QueryClientProvider>
);
export default App;
