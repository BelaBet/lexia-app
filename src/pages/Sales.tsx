import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { Check, Users, Zap, Shield, Clock, Star, ArrowRight, Loader2, CreditCard } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const PLANS = {
  profissional: {
    priceId: "price_1SopLIB62jczasHd8X2avmnk",
    productId: "prod_TmO7JarJtYfuEM",
    name: "Profissional",
    price: 350,
    users: 5,
    description: "Ideal para escritórios de pequeno e médio porte",
    features: [
      "5 usuários inclusos",
      "Assistente IA ilimitado",
      "Gestão completa de processos",
      "Geração de documentos",
      "Calendário integrado",
      "Suporte prioritário",
      "Integrações avançadas",
      "Backup automático"
    ],
    highlighted: true
  }
};

export default function Sales() {
  const [searchParams] = useSearchParams();
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [subscription, setSubscription] = useState<{
    subscribed: boolean;
    productId?: string;
    subscriptionEnd?: string;
  } | null>(null);
  const [checkingSubscription, setCheckingSubscription] = useState(true);

  useEffect(() => {
    if (searchParams.get("success") === "true") {
      toast.success("Assinatura realizada com sucesso! Bem-vindo ao LexIA Profissional.");
      checkSubscription();
    } else if (searchParams.get("canceled") === "true") {
      toast.info("Checkout cancelado. Você pode tentar novamente quando quiser.");
    }
  }, [searchParams]);

  useEffect(() => {
    if (user) {
      checkSubscription();
    } else {
      setCheckingSubscription(false);
    }
  }, [user]);

  const checkSubscription = async () => {
    try {
      setCheckingSubscription(true);
      const { data, error } = await supabase.functions.invoke("check-subscription");
      
      if (error) throw error;
      
      setSubscription(data);
    } catch (error) {
      console.error("Error checking subscription:", error);
    } finally {
      setCheckingSubscription(false);
    }
  };

  const handleCheckout = async (priceId: string) => {
    if (!user) {
      toast.error("Você precisa estar logado para assinar um plano.");
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("create-checkout", {
        body: { priceId }
      });

      if (error) throw error;

      if (data?.url) {
        window.open(data.url, "_blank");
      }
    } catch (error) {
      console.error("Checkout error:", error);
      toast.error("Erro ao iniciar checkout. Tente novamente.");
    } finally {
      setLoading(false);
    }
  };

  const handleManageSubscription = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("customer-portal");

      if (error) throw error;

      if (data?.url) {
        window.open(data.url, "_blank");
      }
    } catch (error) {
      console.error("Portal error:", error);
      toast.error("Erro ao abrir portal de gerenciamento.");
    } finally {
      setLoading(false);
    }
  };

  const isCurrentPlan = subscription?.subscribed && subscription?.productId === PLANS.profissional.productId;

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted/20">
      <div className="container mx-auto px-4 py-12">
        {/* Header */}
        <div className="text-center mb-16">
          <Badge className="mb-4 bg-primary/10 text-primary hover:bg-primary/20">
            <Star className="h-3 w-3 mr-1" />
            Oferta Especial de Lançamento
          </Badge>
          <h1 className="text-4xl md:text-5xl font-bold text-foreground mb-4">
            Potencialize seu Escritório com{" "}
            <span className="text-primary">Inteligência Artificial</span>
          </h1>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
            Automatize tarefas, gerencie processos e documentos com a IA jurídica mais avançada do mercado.
          </p>
        </div>

        {/* Features Grid */}
        <div className="grid md:grid-cols-4 gap-6 mb-16">
          {[
            { icon: Zap, title: "IA Avançada", description: "Assistente jurídico inteligente 24/7" },
            { icon: Users, title: "Multi-usuários", description: "Colaboração em tempo real" },
            { icon: Shield, title: "Segurança", description: "Dados criptografados e protegidos" },
            { icon: Clock, title: "Economia", description: "Reduza 70% do tempo em tarefas" }
          ].map((feature, index) => (
            <Card key={index} className="border-border/50 bg-card/50 backdrop-blur">
              <CardContent className="pt-6 text-center">
                <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center mx-auto mb-4">
                  <feature.icon className="h-6 w-6 text-primary" />
                </div>
                <h3 className="font-semibold text-foreground mb-1">{feature.title}</h3>
                <p className="text-sm text-muted-foreground">{feature.description}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Pricing Card */}
        <div className="max-w-lg mx-auto mb-16">
          <Card className={`relative overflow-hidden border-2 ${isCurrentPlan ? 'border-green-500' : 'border-primary'} shadow-xl`}>
            {isCurrentPlan && (
              <div className="absolute top-0 right-0 bg-green-500 text-white px-4 py-1 text-sm font-medium">
                Seu Plano Atual
              </div>
            )}
            {!isCurrentPlan && (
              <div className="absolute top-0 right-0 bg-primary text-primary-foreground px-4 py-1 text-sm font-medium">
                Mais Popular
              </div>
            )}
            <CardHeader className="text-center pb-2">
              <CardTitle className="text-2xl">{PLANS.profissional.name}</CardTitle>
              <CardDescription>{PLANS.profissional.description}</CardDescription>
            </CardHeader>
            <CardContent className="text-center">
              <div className="mb-6">
                <span className="text-5xl font-bold text-foreground">R$ {PLANS.profissional.price}</span>
                <span className="text-muted-foreground">/mês</span>
              </div>
              <div className="inline-flex items-center gap-2 bg-muted rounded-full px-4 py-2 mb-6">
                <Users className="h-4 w-4 text-primary" />
                <span className="text-sm font-medium">{PLANS.profissional.users} usuários inclusos</span>
              </div>
              <ul className="space-y-3 text-left">
                {PLANS.profissional.features.map((feature, index) => (
                  <li key={index} className="flex items-center gap-3">
                    <div className="w-5 h-5 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                      <Check className="h-3 w-3 text-primary" />
                    </div>
                    <span className="text-sm text-foreground">{feature}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
            <CardFooter className="flex flex-col gap-3">
              {checkingSubscription ? (
                <Button className="w-full" disabled>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Verificando assinatura...
                </Button>
              ) : isCurrentPlan ? (
                <Button 
                  className="w-full" 
                  variant="outline"
                  onClick={handleManageSubscription}
                  disabled={loading}
                >
                  {loading ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : (
                    <CreditCard className="h-4 w-4 mr-2" />
                  )}
                  Gerenciar Assinatura
                </Button>
              ) : (
                <Button 
                  className="w-full h-12 text-lg" 
                  onClick={() => handleCheckout(PLANS.profissional.priceId)}
                  disabled={loading || !user}
                >
                  {loading ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : (
                    <>
                      Começar Agora
                      <ArrowRight className="h-5 w-5 ml-2" />
                    </>
                  )}
                </Button>
              )}
              {!user && (
                <p className="text-sm text-muted-foreground text-center">
                  Faça login para assinar
                </p>
              )}
              {subscription?.subscriptionEnd && isCurrentPlan && (
                <p className="text-sm text-muted-foreground text-center">
                  Próxima cobrança: {new Date(subscription.subscriptionEnd).toLocaleDateString('pt-BR')}
                </p>
              )}
            </CardFooter>
          </Card>
        </div>

        {/* Upgrade Section */}
        <div className="max-w-2xl mx-auto text-center">
          <Card className="bg-muted/30 border-dashed">
            <CardContent className="pt-6">
              <Users className="h-10 w-10 text-primary mx-auto mb-4" />
              <h3 className="text-xl font-semibold mb-2">Precisa de mais usuários?</h3>
              <p className="text-muted-foreground mb-4">
                Entre em contato conosco para adicionar mais usuários ao seu plano. 
                Oferecemos pacotes personalizados para escritórios de todos os tamanhos.
              </p>
              <Button variant="outline" onClick={() => toast.info("Em breve: sistema de upgrade de usuários")}>
                Solicitar Upgrade
              </Button>
            </CardContent>
          </Card>
        </div>

        {/* Trust Section */}
        <div className="mt-16 text-center">
          <p className="text-sm text-muted-foreground mb-4">Pagamento seguro processado por</p>
          <div className="flex items-center justify-center gap-8 opacity-60">
            <div className="text-2xl font-bold text-foreground">Stripe</div>
          </div>
        </div>
      </div>
    </div>
  );
}
