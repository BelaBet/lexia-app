import { useState } from "react";
import { Check, Crown, Zap, Shield, Clock, Users, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";

// Stripe Price IDs for Supremo plan
const SUPREMO_PRICES = {
  monthly: {
    priceId: "price_1SsVeVB62jczasHd0kQM5Exd",
    amount: 1700,
    interval: "mês",
  },
  yearly: {
    priceId: "price_1SsVekB62jczasHd7vpwpuW8",
    amount: 18360,
    interval: "ano",
    monthlyEquivalent: 1530,
    savings: 10,
  },
};

const features = [
  { icon: Zap, text: "Assistente Jurídico IA ilimitado" },
  { icon: Shield, text: "Análise de documentos com IA" },
  { icon: Clock, text: "Gestão completa de prazos" },
  { icon: Users, text: "Integração com ClickUp" },
  { icon: Check, text: "Criação de documentos jurídicos" },
  { icon: Check, text: "Calendário de eventos" },
  { icon: Check, text: "Gestão de processos e clientes" },
  { icon: Check, text: "Suporte prioritário" },
  { icon: Check, text: "Atualizações exclusivas" },
];

export default function Pricing() {
  const [isYearly, setIsYearly] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();

  const currentPlan = isYearly ? SUPREMO_PRICES.yearly : SUPREMO_PRICES.monthly;

  const handleSubscribe = async () => {
    setIsLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session) {
        toast.error("Faça login para assinar o plano.");
        navigate("/auth");
        return;
      }

      const { data, error } = await supabase.functions.invoke("create-checkout", {
        body: { priceId: currentPlan.priceId },
      });

      if (error) throw error;

      if (data?.url) {
        window.open(data.url, "_blank");
      }
    } catch (error) {
      console.error("Checkout error:", error);
      toast.error("Erro ao iniciar checkout. Tente novamente.");
    } finally {
      setIsLoading(false);
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(amount);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-accent/20">
      {/* Header */}
      <div className="container mx-auto px-4 py-8">
        <Button
          variant="ghost"
          onClick={() => navigate("/")}
          className="mb-8 gap-2 text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="w-4 h-4" />
          Voltar
        </Button>

        <div className="text-center max-w-3xl mx-auto mb-12">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-gold-warm/10 text-gold-dark mb-6">
            <Crown className="w-4 h-4" />
            <span className="text-sm font-medium">Plano Supremo</span>
          </div>
          <h1 className="font-serif text-4xl md:text-5xl font-bold mb-4">
            Eleve sua prática jurídica ao{" "}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-gold-warm to-gold-dark">
              próximo nível
            </span>
          </h1>
          <p className="text-lg text-muted-foreground">
            Acesso completo a todas as funcionalidades do LexIA com recursos exclusivos,
            integrações avançadas e suporte prioritário.
          </p>
        </div>

        {/* Billing Toggle */}
        <div className="flex items-center justify-center gap-4 mb-12">
          <Label
            htmlFor="billing-toggle"
            className={`text-sm font-medium transition-colors ${!isYearly ? "text-foreground" : "text-muted-foreground"}`}
          >
            Mensal
          </Label>
          <Switch
            id="billing-toggle"
            checked={isYearly}
            onCheckedChange={setIsYearly}
            className="data-[state=checked]:bg-gold-warm"
          />
          <Label
            htmlFor="billing-toggle"
            className={`text-sm font-medium transition-colors ${isYearly ? "text-foreground" : "text-muted-foreground"}`}
          >
            Anual
          </Label>
          {isYearly && (
            <Badge className="bg-green-500/10 text-green-600 border-green-500/20">
              Economize 10%
            </Badge>
          )}
        </div>

        {/* Pricing Card */}
        <div className="max-w-lg mx-auto">
          <Card className="relative overflow-hidden border-2 border-gold-warm/30 shadow-2xl shadow-gold-warm/10">
            {/* Decorative gradient */}
            <div className="absolute inset-0 bg-gradient-to-br from-gold-warm/5 via-transparent to-gold-dark/5 pointer-events-none" />
            
            <CardHeader className="relative text-center pb-2">
              <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-gold-warm to-gold-dark flex items-center justify-center shadow-lg shadow-gold-warm/30">
                <Crown className="w-8 h-8 text-white" />
              </div>
              <CardTitle className="font-serif text-2xl">Plano Supremo</CardTitle>
              <CardDescription>
                Tudo que você precisa para gerenciar sua prática jurídica
              </CardDescription>
            </CardHeader>

            <CardContent className="relative pt-4">
              {/* Price Display */}
              <div className="text-center mb-8">
                <div className="flex items-baseline justify-center gap-1">
                  <span className="text-5xl font-bold text-foreground">
                    {formatCurrency(isYearly ? SUPREMO_PRICES.yearly.monthlyEquivalent : currentPlan.amount)}
                  </span>
                  <span className="text-muted-foreground">/mês</span>
                </div>
                {isYearly && (
                  <div className="mt-2 space-y-1">
                    <p className="text-sm text-muted-foreground">
                      Cobrado {formatCurrency(SUPREMO_PRICES.yearly.amount)} por ano
                    </p>
                    <p className="text-sm text-green-600 font-medium">
                      Você economiza {formatCurrency(SUPREMO_PRICES.monthly.amount * 12 - SUPREMO_PRICES.yearly.amount)} por ano
                    </p>
                  </div>
                )}
                {!isYearly && (
                  <p className="text-sm text-muted-foreground mt-2">
                    Cobrado mensalmente
                  </p>
                )}
              </div>

              {/* Features List */}
              <ul className="space-y-3">
                {features.map((feature, index) => (
                  <li key={index} className="flex items-center gap-3">
                    <div className="w-5 h-5 rounded-full bg-gold-warm/10 flex items-center justify-center flex-shrink-0">
                      <feature.icon className="w-3 h-3 text-gold-dark" />
                    </div>
                    <span className="text-sm">{feature.text}</span>
                  </li>
                ))}
              </ul>
            </CardContent>

            <CardFooter className="relative pt-6">
              <Button
                onClick={handleSubscribe}
                disabled={isLoading}
                className="w-full h-12 text-lg font-semibold bg-gradient-to-r from-gold-warm to-gold-dark hover:from-gold-dark hover:to-gold-warm text-white shadow-lg shadow-gold-warm/30 transition-all duration-300"
              >
                {isLoading ? (
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <>Assinar Agora</>
                )}
              </Button>
            </CardFooter>
          </Card>

          {/* Trust badges */}
          <div className="mt-8 flex flex-wrap items-center justify-center gap-6 text-sm text-muted-foreground">
            <div className="flex items-center gap-2">
              <Shield className="w-4 h-4" />
              <span>Pagamento seguro</span>
            </div>
            <div className="flex items-center gap-2">
              <Check className="w-4 h-4" />
              <span>Cancele quando quiser</span>
            </div>
            <div className="flex items-center gap-2">
              <Zap className="w-4 h-4" />
              <span>Acesso imediato</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
