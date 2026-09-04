export interface PromptTemplate {
  id: string;
  title: string;
  category: string;
  prompt: string;
}

export const PROMPT_TEMPLATE_CATEGORIES = [
  "Petições",
  "Contratos",
  "Recursos",
  "Pareceres",
  "Prazos",
  "Documentos",
] as const;

export const PROMPT_TEMPLATES: PromptTemplate[] = [
  {
    id: "peticao-inicial-civel",
    title: "Petição inicial cível",
    category: "Petições",
    prompt:
      "Ajude-me a redigir uma petição inicial cível. Vou te passar os dados do autor, do réu e os fatos; me devolva a estrutura completa (endereçamento, dos fatos, do direito, dos pedidos, valor da causa) para eu preencher.",
  },
  {
    id: "peticao-trabalhista",
    title: "Reclamação trabalhista",
    category: "Petições",
    prompt:
      "Preciso montar uma reclamação trabalhista. Me ajude a estruturar os pedidos mais comuns (verbas rescisórias, horas extras, danos morais quando cabível) a partir dos fatos que vou descrever.",
  },
  {
    id: "contestacao",
    title: "Contestação",
    category: "Petições",
    prompt:
      "Me ajude a estruturar uma contestação, organizando preliminares, mérito e pedidos, a partir do resumo da petição inicial que vou colar aqui.",
  },
  {
    id: "contrato-prestacao-servicos",
    title: "Contrato de prestação de serviços",
    category: "Contratos",
    prompt:
      "Gere uma minuta de contrato de prestação de serviços com as cláusulas essenciais (objeto, prazo, valor e forma de pagamento, obrigações das partes, rescisão, foro). Vou te passar os dados das partes e do serviço.",
  },
  {
    id: "contrato-locacao",
    title: "Contrato de locação",
    category: "Contratos",
    prompt:
      "Preciso de uma minuta de contrato de locação residencial/comercial com as cláusulas padrão (prazo, valor, reajuste, garantias, obrigações de locador e locatário). Vou te passar os detalhes do imóvel e das partes.",
  },
  {
    id: "revisao-clausula",
    title: "Revisão de cláusula contratual",
    category: "Contratos",
    prompt:
      "Vou colar uma cláusula de contrato. Analise se ela é clara, se há riscos jurídicos ou ambiguidades, e sugira uma redação alternativa mais protetiva para o meu cliente.",
  },
  {
    id: "recurso-apelacao",
    title: "Recurso de apelação",
    category: "Recursos",
    prompt:
      "Me ajude a estruturar as razões de um recurso de apelação a partir da sentença que vou resumir, organizando por tópicos (fatos, fundamentos do recurso, pedido de reforma).",
  },
  {
    id: "embargos-declaracao",
    title: "Embargos de declaração",
    category: "Recursos",
    prompt:
      "Preciso redigir embargos de declaração apontando omissão, contradição ou obscuridade na decisão. Vou descrever o ponto da decisão que precisa ser esclarecido.",
  },
  {
    id: "agravo-instrumento",
    title: "Agravo de instrumento",
    category: "Recursos",
    prompt:
      "Me ajude a organizar as razões de um agravo de instrumento contra uma decisão interlocutória, incluindo a demonstração do cabimento e do risco de dano.",
  },
  {
    id: "parecer-viabilidade",
    title: "Parecer sobre viabilidade da ação",
    category: "Pareceres",
    prompt:
      "Preciso de um parecer avaliando a viabilidade jurídica de uma ação a partir dos fatos que vou descrever: pontos favoráveis, riscos, prazo prescricional aplicável e recomendação.",
  },
  {
    id: "parecer-contratual",
    title: "Parecer sobre contrato",
    category: "Pareceres",
    prompt:
      "Vou colar um contrato (ou trecho dele). Faça um parecer apontando cláusulas de risco, pontos que merecem negociação e sugestões de ajuste.",
  },
  {
    id: "calculo-prazo",
    title: "Cálculo de prazo processual",
    category: "Prazos",
    prompt:
      "Me ajude a calcular um prazo processual. Vou informar o tipo de prazo, a data de início (intimação/citação) e se corre em dias úteis ou corridos, e o tribunal/instância.",
  },
  {
    id: "checklist-prazos-caso",
    title: "Checklist de prazos de um processo",
    category: "Prazos",
    prompt:
      "A partir da descrição do processo que vou fazer, monte uma lista dos principais prazos que preciso acompanhar (recursais, de manifestação, prescricionais) com a base legal de cada um.",
  },
  {
    id: "procuracao",
    title: "Procuração ad judicia",
    category: "Documentos",
    prompt:
      "Gere uma minuta de procuração ad judicia et extra com os poderes usuais para atuação em processo judicial. Vou te passar os dados do outorgante e do(a) advogado(a).",
  },
  {
    id: "notificacao-extrajudicial",
    title: "Notificação extrajudicial",
    category: "Documentos",
    prompt:
      "Preciso redigir uma notificação extrajudicial cobrando uma obrigação ou comunicando uma decisão formalmente. Vou descrever a situação e o que preciso comunicar.",
  },
  {
    id: "resumo-documento",
    title: "Resumir um documento jurídico",
    category: "Documentos",
    prompt:
      "Vou colar o texto de um documento jurídico. Faça um resumo objetivo com os pontos principais, prazos mencionados e obrigações de cada parte.",
  },
];
