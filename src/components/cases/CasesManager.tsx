import { useState } from "react";
import { FolderOpen, Radio, Search, Filter, MoreVertical, Calendar, FileText, User, X, ChevronDown, ClipboardList, Scale, Gavel, Landmark, Users, UserPlus } from "lucide-react";
import { generateIntakeChecklistPdf } from "@/lib/intakeChecklistPdf";
import { useCases, useDeleteCase, Case } from "@/hooks/useCases";
import { useDocuments } from "@/hooks/useDocuments";
import { format, isAfter, isBefore, startOfDay, endOfDay, subDays, subMonths, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { SyncToClickUpButton } from "@/components/integrations/SyncToClickUpButton";
import ClientPortalPanel from "@/components/cases/ClientPortalPanel";
import NewClientSearchDialog from "@/components/cases/NewClientSearchDialog";

const statusConfig = {
  active: { label: "Ativo", class: "bg-success/10 text-success" },
  pending: { label: "Pendente", class: "bg-warning/10 text-warning" },
  closed: { label: "Encerrado", class: "bg-muted text-muted-foreground" },
};

const typeOptions = ["Cível", "Trabalhista", "Família", "Criminal", "Tributário", "Administrativo"];

const datePresets = [
  { label: "Todos", value: "all" },
  { label: "Últimos 7 dias", value: "7days" },
  { label: "Últimos 30 dias", value: "30days" },
  { label: "Últimos 3 meses", value: "3months" },
  { label: "Personalizado", value: "custom" },
];

interface Filters {
  status: string[];
  type: string[];
  datePreset: string;
  dateFrom: Date | undefined;
  dateTo: Date | undefined;
}

interface CasesManagerProps {
  onTabChange?: (tab: string) => void;
}

export function CasesManager({ onTabChange }: CasesManagerProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCase, setSelectedCase] = useState<Case | null>(null);
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [portalCase, setPortalCase] = useState<Case | null>(null);
  const [isNewClientDialogOpen, setIsNewClientDialogOpen] = useState(false);

  // Filter states
  const [filters, setFilters] = useState<Filters>({
    status: [],
    type: [],
    datePreset: "all",
    dateFrom: undefined,
    dateTo: undefined,
  });

  const { data: cases = [], isLoading } = useCases();
  const { data: documents = [] } = useDocuments();
  const deleteCase = useDeleteCase();

  // Count active filters
  const activeFilterCount = 
    filters.status.length + 
    filters.type.length + 
    (filters.datePreset !== "all" ? 1 : 0);

  // Apply filters
  const filteredCases = cases.filter((c) => {
    // Search filter
    const matchesSearch = 
      c.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      c.case_number.includes(searchTerm) ||
      c.client.toLowerCase().includes(searchTerm.toLowerCase());
    
    if (!matchesSearch) return false;

    // Status filter
    if (filters.status.length > 0 && !filters.status.includes(c.status)) {
      return false;
    }

    // Type filter
    if (filters.type.length > 0 && !filters.type.includes(c.type)) {
      return false;
    }

    // Date filter
    const caseDate = new Date(c.created_at);
    const now = new Date();

    if (filters.datePreset === "7days") {
      if (isBefore(caseDate, subDays(now, 7))) return false;
    } else if (filters.datePreset === "30days") {
      if (isBefore(caseDate, subDays(now, 30))) return false;
    } else if (filters.datePreset === "3months") {
      if (isBefore(caseDate, subMonths(now, 3))) return false;
    } else if (filters.datePreset === "custom") {
      if (filters.dateFrom && isBefore(caseDate, startOfDay(filters.dateFrom))) return false;
      if (filters.dateTo && isAfter(caseDate, endOfDay(filters.dateTo))) return false;
    }

    return true;
  });

  const currencyFormatter = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

  const getDocumentCount = (caseId: string) => {
    return documents.length;
  };

  const toggleStatusFilter = (status: string) => {
    setFilters(prev => ({
      ...prev,
      status: prev.status.includes(status)
        ? prev.status.filter(s => s !== status)
        : [...prev.status, status]
    }));
  };

  const toggleTypeFilter = (type: string) => {
    setFilters(prev => ({
      ...prev,
      type: prev.type.includes(type)
        ? prev.type.filter(t => t !== type)
        : [...prev.type, type]
    }));
  };

  const clearFilters = () => {
    setFilters({
      status: [],
      type: [],
      datePreset: "all",
      dateFrom: undefined,
      dateTo: undefined,
    });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="legal-card">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-gold-light flex items-center justify-center">
              <FolderOpen className="w-6 h-6 text-gold-warm" />
            </div>
            <div>
              <h2 className="font-serif text-2xl font-semibold">Gestão de Processos</h2>
              <p className="text-muted-foreground">Organize e acompanhe seus processos</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => generateIntakeChecklistPdf()}
              className="px-6 py-3 rounded-lg font-medium transition-all duration-300 border border-border hover:bg-muted flex items-center gap-2"
              title="Baixe um checklist em PDF para o cliente preencher antes de você lançar os dados no sistema"
            >
              <ClipboardList className="w-5 h-5" />
              Checklist de Coleta (PDF)
            </button>
            <button
              onClick={() => setIsNewClientDialogOpen(true)}
              className="px-6 py-3 rounded-lg font-medium transition-all duration-300 border border-border hover:bg-muted flex items-center gap-2"
              title="Cadastre o cliente primeiro e já dispare a busca do processo dele pelo nome no JusBrasil"
            >
              <UserPlus className="w-5 h-5" />
              Novo Cliente
            </button>
            <button
              onClick={() => onTabChange?.("integrations")}
              className="legal-button-primary flex items-center gap-2"
              title="Processos são criados automaticamente quando localizados via JusBrasil"
            >
              <Radio className="w-5 h-5" />
              Configurar busca no JusBrasil
            </button>
          </div>
        </div>
        <p className="text-xs text-muted-foreground mt-3 pt-3 border-t border-border">
          Não é mais possível cadastrar um processo manualmente: todo processo é criado automaticamente
          quando localizado pela integração com o JusBrasil (webhook ou busca ativa, configurados em
          Integrações), ou a partir do cadastro de um cliente em "Novo Cliente".
        </p>
      </div>

      {/* Search and Filter */}
      <div className="legal-card !p-4">
        <div className="flex gap-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Buscar por número, título ou cliente..."
              className="legal-input pl-10"
            />
          </div>
          <button className="legal-button-primary flex items-center gap-2">
            <Search className="w-5 h-5" />
            Pesquisar
          </button>
          <Popover open={isFilterOpen} onOpenChange={setIsFilterOpen}>
            <PopoverTrigger asChild>
              <button className="legal-button-primary flex items-center gap-2 !bg-muted !text-foreground hover:!bg-muted/80 relative">
                <Filter className="w-5 h-5" />
                Filtrar
                {activeFilterCount > 0 && (
                  <Badge className="absolute -top-2 -right-2 h-5 w-5 p-0 flex items-center justify-center bg-primary text-primary-foreground text-xs">
                    {activeFilterCount}
                  </Badge>
                )}
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-80 p-4 bg-card border border-border shadow-lg z-50" align="end">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h4 className="font-medium">Filtros Avançados</h4>
                  {activeFilterCount > 0 && (
                    <button 
                      onClick={clearFilters}
                      className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                    >
                      Limpar filtros
                    </button>
                  )}
                </div>

                {/* Status Filter */}
                <div className="space-y-2">
                  <label className="text-sm font-medium text-muted-foreground">Status</label>
                  <div className="flex flex-wrap gap-2">
                    {Object.entries(statusConfig).map(([key, { label }]) => (
                      <button
                        key={key}
                        onClick={() => toggleStatusFilter(key)}
                        className={cn(
                          "px-3 py-1.5 text-sm rounded-full border transition-colors",
                          filters.status.includes(key)
                            ? "bg-primary text-primary-foreground border-primary"
                            : "bg-background border-border hover:bg-muted"
                        )}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Type Filter */}
                <div className="space-y-2">
                  <label className="text-sm font-medium text-muted-foreground">Tipo</label>
                  <div className="flex flex-wrap gap-2">
                    {typeOptions.map((type) => (
                      <button
                        key={type}
                        onClick={() => toggleTypeFilter(type)}
                        className={cn(
                          "px-3 py-1.5 text-sm rounded-full border transition-colors",
                          filters.type.includes(type)
                            ? "bg-primary text-primary-foreground border-primary"
                            : "bg-background border-border hover:bg-muted"
                        )}
                      >
                        {type}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Date Filter */}
                <div className="space-y-2">
                  <label className="text-sm font-medium text-muted-foreground">Data de Criação</label>
                  <div className="flex flex-wrap gap-2">
                    {datePresets.map((preset) => (
                      <button
                        key={preset.value}
                        onClick={() => setFilters(prev => ({ 
                          ...prev, 
                          datePreset: preset.value,
                          dateFrom: preset.value !== "custom" ? undefined : prev.dateFrom,
                          dateTo: preset.value !== "custom" ? undefined : prev.dateTo,
                        }))}
                        className={cn(
                          "px-3 py-1.5 text-sm rounded-full border transition-colors",
                          filters.datePreset === preset.value
                            ? "bg-primary text-primary-foreground border-primary"
                            : "bg-background border-border hover:bg-muted"
                        )}
                      >
                        {preset.label}
                      </button>
                    ))}
                  </div>

                  {/* Custom Date Range */}
                  {filters.datePreset === "custom" && (
                    <div className="grid grid-cols-2 gap-2 mt-3">
                      <Popover>
                        <PopoverTrigger asChild>
                          <button className="legal-input flex items-center justify-between text-sm">
                            {filters.dateFrom ? format(filters.dateFrom, "dd/MM/yyyy") : "De"}
                            <Calendar className="w-4 h-4 text-muted-foreground" />
                          </button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0 bg-card border border-border z-[60]" align="start">
                          <CalendarComponent
                            mode="single"
                            selected={filters.dateFrom}
                            onSelect={(date) => setFilters(prev => ({ ...prev, dateFrom: date }))}
                            initialFocus
                            className={cn("p-3 pointer-events-auto")}
                          />
                        </PopoverContent>
                      </Popover>
                      <Popover>
                        <PopoverTrigger asChild>
                          <button className="legal-input flex items-center justify-between text-sm">
                            {filters.dateTo ? format(filters.dateTo, "dd/MM/yyyy") : "Até"}
                            <Calendar className="w-4 h-4 text-muted-foreground" />
                          </button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0 bg-card border border-border z-[60]" align="start">
                          <CalendarComponent
                            mode="single"
                            selected={filters.dateTo}
                            onSelect={(date) => setFilters(prev => ({ ...prev, dateTo: date }))}
                            initialFocus
                            className={cn("p-3 pointer-events-auto")}
                          />
                        </PopoverContent>
                      </Popover>
                    </div>
                  )}
                </div>

                {/* Apply Button */}
                <button 
                  onClick={() => setIsFilterOpen(false)}
                  className="legal-button-gold w-full"
                >
                  Aplicar Filtros
                </button>
              </div>
            </PopoverContent>
          </Popover>
        </div>

        {/* Active Filters Display */}
        {activeFilterCount > 0 && (
          <div className="flex flex-wrap gap-2 mt-4 pt-4 border-t border-border">
            <span className="text-sm text-muted-foreground">Filtros ativos:</span>
            {filters.status.map(status => (
              <Badge 
                key={status} 
                variant="secondary" 
                className="flex items-center gap-1 cursor-pointer hover:bg-destructive/10"
                onClick={() => toggleStatusFilter(status)}
              >
                {statusConfig[status as keyof typeof statusConfig]?.label || status}
                <X className="w-3 h-3" />
              </Badge>
            ))}
            {filters.type.map(type => (
              <Badge 
                key={type} 
                variant="secondary" 
                className="flex items-center gap-1 cursor-pointer hover:bg-destructive/10"
                onClick={() => toggleTypeFilter(type)}
              >
                {type}
                <X className="w-3 h-3" />
              </Badge>
            ))}
            {filters.datePreset !== "all" && (
              <Badge 
                variant="secondary" 
                className="flex items-center gap-1 cursor-pointer hover:bg-destructive/10"
                onClick={() => setFilters(prev => ({ ...prev, datePreset: "all", dateFrom: undefined, dateTo: undefined }))}
              >
                {filters.datePreset === "custom" 
                  ? `${filters.dateFrom ? format(filters.dateFrom, "dd/MM") : "?"} - ${filters.dateTo ? format(filters.dateTo, "dd/MM") : "?"}`
                  : datePresets.find(p => p.value === filters.datePreset)?.label
                }
                <X className="w-3 h-3" />
              </Badge>
            )}
            <button 
              onClick={clearFilters}
              className="text-sm text-destructive hover:underline"
            >
              Limpar todos
            </button>
          </div>
        )}
      </div>

      {/* Cases Grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="legal-card animate-pulse">
              <div className="h-4 bg-muted rounded w-1/4 mb-3" />
              <div className="h-5 bg-muted rounded w-3/4 mb-2" />
              <div className="h-4 bg-muted rounded w-1/2" />
            </div>
          ))}
        </div>
      ) : filteredCases.length === 0 ? (
        <div className="legal-card flex flex-col items-center justify-center h-48">
          <FolderOpen className="w-12 h-12 text-muted-foreground/30 mb-4" />
          <p className="text-muted-foreground">
            {searchTerm || activeFilterCount > 0
              ? "Nenhum processo encontrado com os filtros aplicados"
              : "Nenhum processo cadastrado ainda — assim que um processo for localizado via JusBrasil, ele aparece aqui automaticamente"}
          </p>
          {!searchTerm && activeFilterCount === 0 && (
            <button
              onClick={() => onTabChange?.("integrations")}
              className="mt-4 text-gold-warm hover:text-gold-dark transition-colors"
            >
              Configurar busca no JusBrasil
            </button>
          )}
          {activeFilterCount > 0 && (
            <button
              onClick={clearFilters}
              className="mt-4 text-primary hover:underline transition-colors"
            >
              Limpar filtros
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {filteredCases.map((caseItem, index) => (
            <div
              key={caseItem.id}
              onClick={() => setSelectedCase(caseItem)}
              className={`document-card fade-in ${
                selectedCase?.id === caseItem.id ? "!border-gold-warm" : ""
              }`}
              style={{ animationDelay: `${index * 50}ms` }}
            >
              <div className="flex items-start justify-between mb-3">
                <div>
                  <span className={`text-xs px-2 py-1 rounded-full ${statusConfig[caseItem.status as keyof typeof statusConfig]?.class || statusConfig.active.class}`}>
                    {statusConfig[caseItem.status as keyof typeof statusConfig]?.label || caseItem.status}
                  </span>
                  <span className="text-xs text-muted-foreground ml-2">{caseItem.type}</span>
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button className="p-1 hover:bg-muted rounded" onClick={(e) => e.stopPropagation()}>
                      <MoreVertical className="w-4 h-4 text-muted-foreground" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="bg-card border border-border">
                    <DropdownMenuItem
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteCase.mutate(caseItem.id);
                      }}
                      className="text-destructive"
                    >
                      Excluir processo
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>

              <h4 className="font-medium text-foreground mb-1">{caseItem.title}</h4>
              <p className="text-sm text-muted-foreground font-mono mb-2">{caseItem.case_number}</p>

              {/* Dados processuais em destaque: vara, comarca e valor da causa */}
              {(caseItem.vara || caseItem.comarca || caseItem.valor_causa != null) && (
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground mb-3">
                  {caseItem.vara && (
                    <span className="flex items-center gap-1">
                      <Gavel className="w-3.5 h-3.5" />
                      {caseItem.vara}
                    </span>
                  )}
                  {caseItem.comarca && (
                    <span className="flex items-center gap-1">
                      <Landmark className="w-3.5 h-3.5" />
                      {caseItem.comarca}
                    </span>
                  )}
                  {caseItem.valor_causa != null && (
                    <span className="flex items-center gap-1 font-medium text-foreground">
                      <Scale className="w-3.5 h-3.5" />
                      {currencyFormatter.format(caseItem.valor_causa)}
                    </span>
                  )}
                </div>
              )}

              <div className="flex items-center justify-between text-sm text-muted-foreground mb-1">
                <div className="flex items-center gap-4">
                  <span className="flex items-center gap-1">
                    <User className="w-4 h-4" />
                    {caseItem.client}
                    {caseItem.parte_diversa && (
                      <span className="text-xs">× {caseItem.parte_diversa}</span>
                    )}
                  </span>
                </div>
                <div className="flex items-center gap-4">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setPortalCase(caseItem);
                    }}
                    title="Espaço do Cliente"
                    className="flex items-center gap-1 hover:text-gold-warm transition-colors"
                  >
                    <Users className="w-4 h-4" />
                  </button>
                  <SyncToClickUpButton
                    title={caseItem.title}
                    description={`Processo: ${caseItem.case_number}\nCliente: ${caseItem.client}\nTipo: ${caseItem.type}`}
                    type="case"
                  />
                  <span className="flex items-center gap-1">
                    <FileText className="w-4 h-4" />
                    {getDocumentCount(caseItem.id)}
                  </span>
                  <span className="flex items-center gap-1">
                    <Calendar className="w-4 h-4" />
                    {format(new Date(caseItem.created_at), "dd/MM/yyyy", { locale: ptBR })}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Novo Cliente: cadastra o cliente e já busca o processo dele pelo nome */}
      <NewClientSearchDialog open={isNewClientDialogOpen} onOpenChange={setIsNewClientDialogOpen} />

      {/* Espaço do Cliente — Meu Jurídico */}
      <Dialog open={!!portalCase} onOpenChange={(open) => !open && setPortalCase(null)}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-serif">
              {portalCase?.title} — Espaço do Cliente
            </DialogTitle>
          </DialogHeader>
          {portalCase && <ClientPortalPanel caseId={portalCase.id} />}
        </DialogContent>
      </Dialog>

      {/* Detalhe do Processo: destaca os dados processuais (vara, comarca, valor
          da causa, datas de abertura/aceitação e parte diversa) */}
      <Dialog open={!!selectedCase} onOpenChange={(open) => !open && setSelectedCase(null)}>
        <DialogContent className="max-w-lg">
          {selectedCase && (
            <>
              <DialogHeader>
                <DialogTitle className="font-serif flex items-center gap-2 flex-wrap">
                  {selectedCase.title}
                  <span className={`text-xs px-2 py-1 rounded-full ${statusConfig[selectedCase.status as keyof typeof statusConfig]?.class || statusConfig.active.class}`}>
                    {statusConfig[selectedCase.status as keyof typeof statusConfig]?.label || selectedCase.status}
                  </span>
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-4 mt-2">
                <p className="text-sm text-muted-foreground font-mono">{selectedCase.case_number}</p>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                  <div>
                    <p className="text-xs text-muted-foreground">Cliente</p>
                    <p className="font-medium">{selectedCase.client}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Parte Diversa</p>
                    <p className="font-medium">{selectedCase.parte_diversa || "—"}</p>
                  </div>
                </div>

                <div className="rounded-lg border border-border p-3 space-y-3">
                  <p className="text-sm font-semibold flex items-center gap-1.5">
                    <Scale className="w-4 h-4" /> Dados Processuais
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                    <div>
                      <p className="text-xs text-muted-foreground flex items-center gap-1"><Gavel className="w-3 h-3" /> Vara</p>
                      <p className="font-medium">{selectedCase.vara || "—"}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground flex items-center gap-1"><Landmark className="w-3 h-3" /> Comarca</p>
                      <p className="font-medium">{selectedCase.comarca || "—"}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Valor da Causa</p>
                      <p className="font-medium">
                        {selectedCase.valor_causa != null ? currencyFormatter.format(selectedCase.valor_causa) : "—"}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Abertura no Tribunal</p>
                      <p className="font-medium">
                        {selectedCase.data_abertura_tribunal
                          ? format(parseISO(selectedCase.data_abertura_tribunal), "dd/MM/yyyy", { locale: ptBR })
                          : "—"}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Data de Aceitação</p>
                      <p className="font-medium">
                        {selectedCase.data_aceitacao
                          ? format(parseISO(selectedCase.data_aceitacao), "dd/MM/yyyy", { locale: ptBR })
                          : "—"}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
