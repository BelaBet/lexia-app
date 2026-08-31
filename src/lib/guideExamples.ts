export type GuideStageId = "input" | "summary" | "document" | "review";

export interface GuideStageExample {
  stage: GuideStageId;
  stageLabel: string;
  /** What the user types/does at this stage. */
  userPrompt: string;
  /** What LexIA (or the system) responds/produces at this stage. */
  aiResponse: string;
}

export interface GuideFlow {
  id: "chat" | "pdf-reader";
  title: string;
  description: string;
  stages: GuideStageExample[];
}

export const GUIDE_FLOWS: GuideFlow[] = [
  {
    id: "chat",
    title: "Assistente de IA (chat)",
    description: "Fluxo típico ao conversar com a LexIA para tirar dúvidas ou redigir um documento do zero.",
    stages: [
      {
        stage: "input",
        stageLabel: "1. Entrada do usuário",
        userPrompt:
          "Preciso redigir uma petição inicial de cobrança. O cliente é João da Silva, que prestou serviços de consultoria para a empresa ABC Ltda. e não recebeu R$ 8.500,00 referentes à nota fiscal 1234, emitida em 10/03/2026.",
        aiResponse:
          "Entendido. Antes de redigir, confirmo alguns pontos: você quer que eu já monte a petição completa (endereçamento, fatos, direito, pedidos) com esses dados, ou prefere que eu primeiro resuma o caso para você validar as informações? Também preciso saber a comarca/vara e se já há tentativa de cobrança extrajudicial.",
      },
      {
        stage: "summary",
        stageLabel: "2. Resumo",
        userPrompt: "Pode resumir o que você entendeu antes de montar a petição.",
        aiResponse:
          "Resumo do caso: cobrança de R$ 8.500,00 devidos por ABC Ltda. a João da Silva, referentes à NF 1234 (10/03/2026), por serviços de consultoria prestados e não pagos. Ainda faltam: comarca/vara, se houve notificação extrajudicial prévia, e se há contrato assinado entre as partes. Corrija ou complemente qualquer ponto antes de eu seguir para a redação.",
      },
      {
        stage: "document",
        stageLabel: "3. Criação de documento",
        userPrompt: "Está correto. Vara Cível de São Paulo/SP, sem notificação prévia. Pode gerar a petição.",
        aiResponse:
          "EXCELENTÍSSIMO(A) SENHOR(A) DOUTOR(A) JUIZ(A) DE DIREITO DA ___ VARA CÍVEL DA COMARCA DE SÃO PAULO/SP\n\nAÇÃO DE COBRANÇA\n\nJOÃO DA SILVA [qualificação completa], vem propor a presente ação em face de ABC LTDA. [qualificação completa], pelos fatos e fundamentos a seguir:\n\nI – DOS FATOS\nO autor prestou serviços de consultoria à ré, conforme NF nº 1234, emitida em 10/03/2026, no valor de R$ 8.500,00, até hoje não adimplido...\n\n[petição continua com II – DO DIREITO e III – DOS PEDIDOS]\n\n⚠️ Revise os dados de qualificação das partes e confirme o valor atualizado da causa antes de protocolar.",
      },
      {
        stage: "review",
        stageLabel: "4. Revisão",
        userPrompt: "Troque o fundamento jurídico para citar também correção monetária e juros de mora desde o vencimento.",
        aiResponse:
          "Ajustado. Acrescentei ao pedido: correção monetária pelo índice adotado no tribunal desde o vencimento (10/03/2026) e juros de mora de 1% ao mês a partir da citação, conforme art. 405 do Código Civil. Revise a petição atualizada e, antes de protocolar, confirme os valores e a base legal com a jurisprudência atual do seu tribunal — não tenho certeza sobre eventuais súmulas locais recentes.",
      },
    ],
  },
  {
    id: "pdf-reader",
    title: "Leitor de PDF",
    description: "Fluxo típico ao subir um documento em PDF para análise, resumo e criação de um novo documento a partir dele.",
    stages: [
      {
        stage: "input",
        stageLabel: "1. Entrada do usuário",
        userPrompt: "[Upload de contrato-prestacao-servicos.pdf, 6 páginas]",
        aiResponse:
          "PDF carregado (6 páginas). Iniciando extração do texto... Extração concluída: 4.230 caracteres extraídos. Iniciando análise automática do conteúdo.",
      },
      {
        stage: "summary",
        stageLabel: "2. Resumo",
        userPrompt: "(gerado automaticamente após a extração)",
        aiResponse:
          "Resumo: contrato de prestação de serviços entre ABC Ltda. (contratante) e XYZ Consultoria (contratada), vigência de 12 meses a partir de 01/02/2026, valor mensal de R$ 4.000,00, multa rescisória de 20% sobre o saldo remanescente em caso de rescisão antecipada sem justa causa. Cláusula de confidencialidade por 24 meses após o término. ⚠️ Não localizei cláusula de foro — confirme se está em outra página ou se precisa ser incluída.",
      },
      {
        stage: "document",
        stageLabel: "3. Criação de documento",
        userPrompt: "A partir desse resumo, crie uma notificação de rescisão antecipada por descumprimento contratual.",
        aiResponse:
          "NOTIFICAÇÃO EXTRAJUDICIAL\n\nÀ XYZ CONSULTORIA,\n\nVimos, por meio desta, notificá-los da rescisão do contrato de prestação de serviços firmado em 01/02/2026, em razão do descumprimento das obrigações previstas na Cláusula [X], conforme detalhado a seguir...\n\n[notificação continua com fatos, fundamento contratual e prazo para manifestação]\n\n⚠️ Preencha o número da cláusula descumprida e os fatos específicos — não tenho essa informação no resumo gerado.",
      },
      {
        stage: "review",
        stageLabel: "4. Revisão",
        userPrompt: "Antes de salvar, confira se o prazo de resposta está de acordo com o contrato.",
        aiResponse:
          "Revisado: o contrato não especifica um prazo formal para resposta a notificações, então usei o prazo padrão de 10 dias úteis, comum nesse tipo de comunicação — ajuste se o contrato definir outro prazo em cláusula que eu não tenha capturado. Recomendo revisar o documento final com atenção antes de salvá-lo em Documentos ou enviá-lo, especialmente os dados que marquei com ⚠️.",
      },
    ],
  },
];
