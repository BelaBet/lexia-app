import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import { useWhiteLabelSettings, DEFAULT_BRANDING } from "@/hooks/useWhiteLabelSettings";

export default function Terms() {
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

        <h1 className="font-serif text-3xl font-bold mb-2">Termos de Serviço</h1>
        <p className="text-sm text-muted-foreground mb-8">Última atualização: 29 de setembro de 2026</p>

        <div className="space-y-6 text-sm leading-relaxed text-muted-foreground">
          <section>
            <h2 className="text-base font-semibold text-foreground mb-2">1. Aceitação dos termos</h2>
            <p>
              Ao criar uma conta ou utilizar o {brandName}, você concorda com estes Termos de Serviço.
              Caso não concorde com alguma cláusula, não utilize a plataforma.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-foreground mb-2">2. Descrição do serviço</h2>
            <p>
              O {brandName} é uma plataforma de gestão jurídica que auxilia escritórios de advocacia e
              profissionais do direito no acompanhamento de processos, prazos, clientes e documentos,
              incluindo integrações com provedores externos de dados processuais.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-foreground mb-2">3. Conta e responsabilidades do usuário</h2>
            <p>
              Você é responsável por manter a confidencialidade das suas credenciais de acesso e por
              todas as atividades realizadas em sua conta. Informações cadastradas devem ser verdadeiras
              e atualizadas.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-foreground mb-2">4. Planos e cobrança</h2>
            <p>
              Funcionalidades pagas são cobradas conforme o plano contratado, exibido na página de
              Planos. Buscas e sincronizações adicionais junto a provedores externos podem gerar cobranças
              conforme informado na plataforma.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-foreground mb-2">5. Limitação de responsabilidade</h2>
            <p>
              O {brandName} atua como ferramenta de apoio e organização; não presta consultoria jurídica
              nem substitui o julgamento profissional do usuário. Dados de processos são obtidos de
              provedores e tribunais terceiros e podem estar sujeitos a atrasos ou imprecisões alheios ao
              nosso controle.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-foreground mb-2">6. Alterações destes termos</h2>
            <p>
              Podemos atualizar estes termos periodicamente. Alterações relevantes serão comunicadas pelos
              canais habituais da plataforma.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-foreground mb-2">7. Contato</h2>
            <p>
              Dúvidas sobre estes termos podem ser enviadas pelos canais de suporte disponíveis dentro da
              plataforma.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
