import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import { useWhiteLabelSettings, DEFAULT_BRANDING } from "@/hooks/useWhiteLabelSettings";

export default function PrivacyPolicy() {
  const navigate = useNavigate();
  const { data: branding } = useWhiteLabelSettings();
  const brandName = branding?.brand_name || DEFAULT_BRANDING.brand_name;

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto max-w-3xl px-4 py-8">
        <Button
          variant="ghost"
          onClick={() => navigate(-1)}
          className="mb-8 gap-2 text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="w-4 h-4" />
          Voltar
        </Button>

        <h1 className="font-serif text-3xl font-bold mb-2">Política de Privacidade</h1>
        <p className="text-sm text-muted-foreground mb-8">Última atualização: 29 de setembro de 2026</p>

        <div className="space-y-6 text-sm leading-relaxed text-muted-foreground">
          <section>
            <h2 className="text-base font-semibold text-foreground mb-2">1. Dados que coletamos</h2>
            <p>
              Coletamos dados de cadastro (nome, e-mail, dados do escritório), dados de processos e
              clientes inseridos ou sincronizados por você, e dados de uso da plataforma necessários para
              seu funcionamento e segurança.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-foreground mb-2">2. Como usamos seus dados</h2>
            <p>
              Utilizamos os dados para operar o {brandName}, sincronizar informações processuais junto a
              provedores e tribunais, enviar notificações relevantes (prazos, movimentações, faturamento)
              e melhorar a plataforma.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-foreground mb-2">3. Compartilhamento de dados</h2>
            <p>
              Dados processuais podem ser compartilhados com provedores de dados jurídicos (ex.: JusBrasil)
              e com serviços de infraestrutura (hospedagem, banco de dados, pagamentos) estritamente para
              viabilizar as funcionalidades contratadas. Não vendemos dados pessoais a terceiros.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-foreground mb-2">4. Segurança</h2>
            <p>
              Adotamos controles técnicos e organizacionais, incluindo controle de acesso por perfil,
              autenticação multifator e isolamento de dados entre escritórios (multi-tenant), para proteger
              as informações armazenadas.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-foreground mb-2">5. Retenção e exclusão</h2>
            <p>
              Mantemos os dados enquanto sua conta estiver ativa ou conforme exigido por obrigações legais.
              Você pode solicitar a exclusão dos seus dados pelos canais de suporte da plataforma.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-foreground mb-2">6. Seus direitos</h2>
            <p>
              Conforme a Lei Geral de Proteção de Dados (LGPD), você pode solicitar acesso, correção,
              portabilidade ou exclusão dos seus dados pessoais, além de revogar consentimentos dados
              anteriormente.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-foreground mb-2">7. Contato</h2>
            <p>
              Solicitações relacionadas a esta política podem ser enviadas pelos canais de suporte
              disponíveis dentro da plataforma.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
