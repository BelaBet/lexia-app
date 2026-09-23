import { useState } from "react";
import { FileText, Plus, Wand2, Save, Download, ChevronRight, ChevronsUpDown, Check, Scale, UserRound, CalendarClock } from "lucide-react";
import { useCreateDocument, useUpdateDocument, Document } from "@/hooks/useDocuments";
import { useCases, Case } from "@/hooks/useCases";
import { useCreateEvent, useUpdateEvent, useDeleteEvent, isRetroactiveEventDateChange, getTodayDateStr } from "@/hooks/useEvents";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";

const documentTypes = [
  { id: "peticao", name: "Petição Inicial", description: "Crie petições personalizadas" },
  { id: "contrato", name: "Contrato", description: "Modelos de contratos diversos" },
  { id: "procuracao", name: "Procuração", description: "Procurações ad judicia e extrajudiciais" },
  { id: "recurso", name: "Recurso", description: "Recursos e contrarrazões" },
  { id: "parecer", name: "Parecer", description: "Pareceres jurídicos" },
  { id: "notificacao", name: "Notificação", description: "Notificações extrajudiciais" },
];

const templates: Record<string, string> = {
  peticao: `EXCELENTÍSSIMO(A) SENHOR(A) DOUTOR(A) JUIZ(A) DE DIREITO DA ___ VARA CÍVEL DA COMARCA DE ___

[TÍTULO]

[NOME DO AUTOR], [nacionalidade], [estado civil], [profissão], portador(a) do RG nº [número] e inscrito(a) no CPF sob o nº [número], residente e domiciliado(a) em [endereço completo], vem, respeitosamente, à presença de Vossa Excelência, por seu(sua) advogado(a) que esta subscreve (procuração em anexo), propor a presente

AÇÃO [TIPO DE AÇÃO]

em face de [NOME DO RÉU], [qualificação completa], pelos fatos e fundamentos a seguir expostos:

I - DOS FATOS
[Descrever os fatos que originaram a demanda]

II - DO DIREITO
[Fundamentação jurídica]

III - DOS PEDIDOS
Ante o exposto, requer:
a) A citação do(a) réu(ré) para, querendo, contestar a presente ação;
b) A procedência total dos pedidos;
c) A condenação do(a) réu(ré) ao pagamento das custas processuais e honorários advocatícios.

Dá-se à causa o valor de R$ [valor].

Termos em que,
Pede deferimento.

[Cidade], [data].

_______________________________
[Nome do Advogado]
OAB/[UF] nº [número]`,

  contrato: `CONTRATO DE [TÍTULO]

Pelo presente instrumento particular, as partes a seguir qualificadas:

CONTRATANTE: [Nome/Razão Social], [nacionalidade], [estado civil/natureza jurídica], inscrito(a) no CPF/CNPJ sob o nº [número], com endereço em [endereço completo];

CONTRATADO(A): [Nome/Razão Social], [nacionalidade], [estado civil/natureza jurídica], inscrito(a) no CPF/CNPJ sob o nº [número], com endereço em [endereço completo];

Têm entre si justo e contratado o presente instrumento, que se regerá pelas cláusulas e condições seguintes:

CLÁUSULA PRIMEIRA - DO OBJETO
[Descrever o objeto do contrato]

CLÁUSULA SEGUNDA - DO PRAZO
O presente contrato terá vigência de [prazo], iniciando-se em [data inicial] e terminando em [data final].

CLÁUSULA TERCEIRA - DO VALOR E FORMA DE PAGAMENTO
[Descrever valores e condições de pagamento]

CLÁUSULA QUARTA - DAS OBRIGAÇÕES DAS PARTES
[Descrever obrigações]

CLÁUSULA QUINTA - DA RESCISÃO
[Condições de rescisão]

CLÁUSULA SEXTA - DO FORO
Fica eleito o foro da Comarca de [cidade/UF] para dirimir quaisquer dúvidas oriundas do presente contrato.

E, por estarem assim justos e contratados, firmam o presente instrumento em duas vias de igual teor e forma.

[Cidade], [data].

_______________________________
CONTRATANTE

_______________________________
CONTRATADO(A)`,

  procuracao: `PROCURAÇÃO AD JUDICIA

OUTORGANTE: [Nome completo], [nacionalidade], [estado civil], [profissão], portador(a) da Cédula de Identidade RG nº [número] e inscrito(a) no CPF sob o nº [número], residente e domiciliado(a) em [endereço completo].

OUTORGADO(A): [Nome do Advogado], [nacionalidade], [estado civil], advogado(a), inscrito(a) na OAB/[UF] sob o nº [número], com escritório profissional em [endereço completo].

PODERES: O(A) outorgante nomeia e constitui o(a) outorgado(a) seu(sua) bastante procurador(a), a quem confere amplos poderes para o foro em geral, com a cláusula "ad judicia", para representá-lo(a) em qualquer juízo, instância ou tribunal, podendo propor ações, contestar, reconvir, transigir, desistir, receber e dar quitação, firmar compromissos, recorrer, substabelecer com ou sem reservas de poderes, e praticar todos os atos necessários ao bom e fiel cumprimento deste mandato.

[Cidade], [data].

_______________________________
[Nome do Outorgante]`,

  recurso: `EXCELENTÍSSIMO(A) SENHOR(A) DOUTOR(A) JUIZ(A) DE DIREITO DA ___ VARA ___ DA COMARCA DE ___

Processo nº: [número do processo]

[NOME DO RECORRENTE], já qualificado nos autos do processo em epígrafe, por seu advogado que esta subscreve, vem, respeitosamente, à presença de Vossa Excelência, interpor o presente

RECURSO DE [TIPO DE RECURSO]

com fundamento no artigo [número] do [CPC/CPP/CLT], pelos fatos e fundamentos a seguir expostos:

I - TEMPESTIVIDADE
O presente recurso é tempestivo, tendo sido interposto dentro do prazo legal de [X] dias.

II - DOS FATOS
[Resumo dos fatos e da decisão recorrida]

III - DAS RAZÕES DO INCONFORMISMO
[Fundamentação do recurso]

IV - DO PEDIDO
Ante o exposto, requer seja conhecido e provido o presente recurso, para que seja reformada a r. decisão recorrida.

Termos em que,
Pede deferimento.

[Cidade], [data].

_______________________________
[Nome do Advogado]
OAB/[UF] nº [número]`,

  parecer: `PARECER JURÍDICO

CONSULENTE: [Nome/Razão Social]
ASSUNTO: [Título]
DATA: [Data]

I - DA CONSULTA
[Descrição da questão jurídica apresentada]

II - DOS FATOS
[Narrativa dos fatos relevantes]

III - DO DIREITO APLICÁVEL
[Análise da legislação, doutrina e jurisprudência]

IV - DA CONCLUSÃO
[Parecer conclusivo sobre a questão]

V - RECOMENDAÇÕES
[Sugestões de procedimentos a serem adotados]

É o parecer.

[Cidade], [data].

_______________________________
[Nome do Advogado]
OAB/[UF] nº [número]`,

  notificacao: `NOTIFICAÇÃO EXTRAJUDICIAL

NOTIFICANTE: [Nome/Razão Social], [qualificação completa], residente/com sede em [endereço completo].

NOTIFICADO(A): [Nome/Razão Social], [qualificação completa], residente/com sede em [endereço completo].

Prezado(a) Senhor(a),

Pelo presente instrumento, e na melhor forma de direito, venho NOTIFICAR Vossa Senhoria para os seguintes fins:

[Descrição do motivo da notificação e providências requeridas]

Outrossim, fica Vossa Senhoria desde já notificado(a) para, no prazo de [X] dias, [ação requerida], sob pena de [consequências legais].

A presente notificação visa resguardar os direitos do(a) NOTIFICANTE, servindo como prova em eventual ação judicial.

Sem mais para o momento, subscrevo-me.

[Cidade], [data].

_______________________________
[Nome do Notificante]

RECEBI EM ___/___/______

_______________________________
[Nome do Notificado]`,
};

function CaseCombobox({ cases, value, onChange }: { cases: Case[]; value: string; onChange: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  const selected = cases.find((c) => c.id === value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button type="button" className="legal-input flex items-center justify-between text-left gap-2">
          <span className={cn("truncate", !selected && "text-muted-foreground")}>
            {selected ? `${selected.case_number} · ${selected.client}` : "Nenhum"}
          </span>
          <ChevronsUpDown className="w-4 h-4 text-muted-foreground shrink-0" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <Command filter={(_value, search, keywords) => {
          const haystack = (keywords || []).join(" ").toLowerCase();
          return haystack.includes(search.toLowerCase()) ? 1 : 0;
        }}>
          <CommandInput placeholder="Buscar por número do processo ou cliente..." />
          <CommandList>
            <CommandEmpty>Nenhum processo encontrado.</CommandEmpty>
            <CommandGroup>
              <CommandItem value="__none__" onSelect={() => { onChange(""); setOpen(false); }}>
                <Check className={cn("mr-2 h-4 w-4 shrink-0", !value ? "opacity-100" : "opacity-0")} />
                Nenhum
              </CommandItem>
              {cases.map((c) => (
                <CommandItem
                  key={c.id}
                  value={c.id}
                  keywords={[c.case_number, c.client, c.title]}
                  onSelect={() => { onChange(c.id); setOpen(false); }}
                >
                  <Check className={cn("mr-2 h-4 w-4 shrink-0", value === c.id ? "opacity-100" : "opacity-0")} />
                  <div className="min-w-0">
                    <p className="truncate">{c.case_number}</p>
                    <p className="text-xs text-muted-foreground truncate">{c.client}</p>
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

export function DocumentCreator() {
  const [selectedType, setSelectedType] = useState<string | null>(null);
  const [documentContent, setDocumentContent] = useState("");
  const [title, setTitle] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [currentDocId, setCurrentDocId] = useState<string | null>(null);
  const [selectedCaseId, setSelectedCaseId] = useState<string>("");
  const [responsibleName, setResponsibleName] = useState("");
  const [deadlineDate, setDeadlineDate] = useState("");
  const [deadlineEventId, setDeadlineEventId] = useState<string | null>(null);
  const [savedDeadlineDate, setSavedDeadlineDate] = useState<string | null>(null);

  const createDocument = useCreateDocument();
  const updateDocument = useUpdateDocument();
  const createEvent = useCreateEvent();
  const updateEvent = useUpdateEvent();
  const deleteEvent = useDeleteEvent();
  const { data: cases = [] } = useCases();

  const isSaving = createDocument.isPending || updateDocument.isPending || createEvent.isPending || updateEvent.isPending || deleteEvent.isPending;

  const handleTypeSelect = (typeId: string) => {
    setSelectedType(typeId);
    setTitle("");
    setDocumentContent("");
    setCurrentDocId(null);
    setSelectedCaseId("");
    setResponsibleName("");
    setDeadlineDate("");
    setDeadlineEventId(null);
    setSavedDeadlineDate(null);
  };

  const generateWithAI = async () => {
    if (!selectedType || !title) return;

    setIsGenerating(true);

    const template = templates[selectedType] || "Documento em construção...";
    const content = template.replace("[TÍTULO]", title.toUpperCase());

    setDocumentContent(content);
    setIsGenerating(false);
  };

  const saveDocument = async () => {
    if (!title || !documentContent || !selectedType) return;

    if (deadlineDate && isRetroactiveEventDateChange(deadlineDate, savedDeadlineDate ?? undefined)) {
      toast.error("O prazo não pode ser uma data passada.");
      return;
    }

    let nextDeadlineEventId = deadlineEventId;

    try {
      if (!deadlineDate && deadlineEventId) {
        await deleteEvent.mutateAsync({ id: deadlineEventId, publication_id: null });
        nextDeadlineEventId = null;
      } else if (deadlineDate && !deadlineEventId) {
        const { event } = await createEvent.mutateAsync({
          title: `Prazo: ${title}`,
          description: responsibleName ? `Responsável: ${responsibleName}` : undefined,
          event_date: deadlineDate,
          event_time: "09:00",
          type: "deadline",
          case_id: selectedCaseId || undefined,
          notification_enabled: true,
          notification_minutes_before: 120,
        });
        nextDeadlineEventId = event.id;
      } else if (deadlineDate && deadlineEventId && deadlineDate !== savedDeadlineDate) {
        await updateEvent.mutateAsync({ id: deadlineEventId, event_date: deadlineDate });
      }
    } catch {
      toast.error("Não foi possível atualizar o prazo na Agenda. O documento não foi salvo.");
      return;
    }

    const typeName = documentTypes.find(t => t.id === selectedType)?.name || selectedType;
    const payload = {
      title,
      content: documentContent,
      status: "draft" as const,
      case_id: selectedCaseId || null,
      responsible_name: responsibleName || null,
      deadline_date: deadlineDate || null,
      deadline_event_id: nextDeadlineEventId,
    };

    if (currentDocId) {
      await updateDocument.mutateAsync({ id: currentDocId, ...payload });
    } else {
      const result = await createDocument.mutateAsync({ title, type: typeName, ...payload }) as Document;
      setCurrentDocId(result.id);
    }
    setDeadlineEventId(nextDeadlineEventId);
    setSavedDeadlineDate(deadlineDate || null);
  };

  const downloadDocument = () => {
    if (!documentContent || !title) return;

    const blob = new Blob([documentContent], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${title.replace(/\s+/g, "_")}.txt`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Documento baixado!");
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="legal-card">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
            <Plus className="w-6 h-6 text-primary" />
          </div>
          <div>
            <h2 className="font-serif text-2xl font-semibold">Criar Documento</h2>
            <p className="text-muted-foreground">Use modelos para gerar documentos jurídicos</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Document Types */}
        <div className="lg:col-span-1 space-y-4">
          <h3 className="font-serif text-lg font-semibold mb-4">Tipo de Documento</h3>
          {documentTypes.map((type) => (
            <button
              key={type.id}
              onClick={() => handleTypeSelect(type.id)}
              className={`w-full p-4 rounded-xl border text-left transition-all ${
                selectedType === type.id
                  ? "border-gold-warm bg-gold-light"
                  : "border-border bg-card hover:border-gold-warm/50"
              }`}
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">{type.name}</p>
                  <p className="text-sm text-muted-foreground">{type.description}</p>
                </div>
                <ChevronRight className={`w-5 h-5 transition-transform ${
                  selectedType === type.id ? "text-gold-warm rotate-90" : "text-muted-foreground"
                }`} />
              </div>
            </button>
          ))}
        </div>

        {/* Document Editor */}
        <div className="lg:col-span-2 space-y-4">
          {selectedType ? (
            <>
              <div className="legal-card">
                <label className="block text-sm font-medium mb-2">Título do Documento</label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Ex: Ação de Cobrança, Contrato de Locação..."
                  className="legal-input"
                />

                <label className="block text-sm font-medium mb-2 mt-4 flex items-center gap-1.5">
                  <Scale className="w-4 h-4" />
                  Processo vinculado
                </label>
                <CaseCombobox cases={cases} value={selectedCaseId} onChange={setSelectedCaseId} />
                <p className="text-xs text-muted-foreground mt-1">
                  Busque pelo número do processo ou pelo nome do cliente.
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
                  <div>
                    <label className="block text-sm font-medium mb-2 flex items-center gap-1.5">
                      <UserRound className="w-4 h-4" />
                      Responsável
                    </label>
                    <input
                      type="text"
                      value={responsibleName}
                      onChange={(e) => setResponsibleName(e.target.value)}
                      placeholder="Nome de quem é responsável"
                      className="legal-input"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-2 flex items-center gap-1.5">
                      <CalendarClock className="w-4 h-4" />
                      Prazo (opcional)
                    </label>
                    <input
                      type="date"
                      min={getTodayDateStr()}
                      value={deadlineDate}
                      onChange={(e) => setDeadlineDate(e.target.value)}
                      className="legal-input"
                    />
                  </div>
                </div>
                {deadlineDate && (
                  <p className="text-xs text-muted-foreground mt-1">
                    Ao salvar, este prazo entra na Agenda automaticamente.
                  </p>
                )}

                <button
                  onClick={generateWithAI}
                  disabled={!title || isGenerating}
                  className="legal-button-gold w-full mt-4 flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {isGenerating ? (
                    <>
                      <div className="w-5 h-5 border-2 border-current border-t-transparent rounded-full animate-spin" />
                      Gerando...
                    </>
                  ) : (
                    <>
                      <Wand2 className="w-5 h-5" />
                      Gerar Modelo
                    </>
                  )}
                </button>
              </div>

              <div className="legal-card">
                <div className="flex items-center justify-between mb-4">
                  <label className="block text-sm font-medium">Conteúdo</label>
                  {documentContent && (
                    <div className="flex gap-2">
                      <button
                        onClick={saveDocument}
                        disabled={isSaving}
                        className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
                      >
                        <Save className="w-4 h-4" />
                        {isSaving ? "Salvando..." : "Salvar"}
                      </button>
                      <button
                        onClick={downloadDocument}
                        className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
                      >
                        <Download className="w-4 h-4" />
                        Exportar
                      </button>
                    </div>
                  )}
                </div>
                <textarea
                  value={documentContent}
                  onChange={(e) => setDocumentContent(e.target.value)}
                  placeholder="O documento gerado aparecerá aqui..."
                  className="legal-input min-h-[500px] font-mono text-sm resize-none"
                />
              </div>
            </>
          ) : (
            <div className="legal-card flex flex-col items-center justify-center h-96">
              <FileText className="w-16 h-16 text-muted-foreground/30 mb-4" />
              <p className="text-lg font-medium text-muted-foreground">
                Selecione um tipo de documento
              </p>
              <p className="text-sm text-muted-foreground">
                Escolha o modelo para começar
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
