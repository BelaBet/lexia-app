import { useEffect, useState } from "react";
import { Search, Loader2, FileSearch, StickyNote, Scale, Lock, Download, Unlock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import {
  useProcessSearchReports,
  useProcessSearchResults,
  useProcessSearchDocuments,
  useCreateNameSearch,
  useCheckNameSearch,
  useUpdateProcessSearchResult,
  useRequestCaseAutos,
  useAdminUnlockAutosDownload,
  getProcessSearchDocumentUrl,
  PipelineStage,
  ProcessSearchResult,
} from "@/hooks/useProcessSearch";

const stageConfig: Record<PipelineStage, { label: string }> = {
  novo: { label: "Novo" },
  em_analise: { label: "Em análise" },
  relevante: { label: "Relevante" },
  descartado: { label: "Descartado" },
  convertido: { label: "Convertido" },
};

const stageColumns: PipelineStage[] = ["novo", "em_analise", "relevante", "descartado", "convertido"];

const reportStatusConfig: Record<string, { label: string; className: string }> = {
  criando: { label: "Iniciando...", className: "bg-muted text-muted-foreground" },
  processando: { label: "Processando no JusBrasil", className: "bg-warning/10 text-warning" },
  concluido: { label: "Concluída", className: "bg-success/10 text-success" },
  erro: { label: "Erro", className: "bg-destructive/10 text-destructive" },
};

export function ProcessSearchCRM() {
  const { hasRole } = useAuth();
  const isAdmin = hasRole("admin") || hasRole("supremo");

  const [searchName, setSearchName] = useState("");
  const [selectedReportId, setSelectedReportId] = useState<string | null>(null);
  const [notesResult, setNotesResult] = useState<ProcessSearchResult | null>(null);
  const [notesDraft, setNotesDraft] = useState("");
  const [autosResult, setAutosResult] = useState<ProcessSearchResult | null>(null);

  const { data: reports = [], isLoading: reportsLoading } = useProcessSearchReports();
  const { data: results = [] } = useProcessSearchResults(selectedReportId);
  const createSearch = useCreateNameSearch();
  const checkSearch = useCheckNameSearch();
  const updateResult = useUpdateProcessSearchResult();
  const requestAutos = useRequestCaseAutos();
  const unlockAutos = useAdminUnlockAutosDownload();

  useEffect(() => {
    if (!selectedReportId && reports.length > 0) setSelectedReportId(reports[0].id);
  }, [reports, selectedReportId]);

  const handleCreateSearch = async () => {
    if (!searchName.trim() || searchName.trim().length < 3) return;
    const result = await createSearch.mutateAsync(searchName.trim());
    setSearchName("");
    setSelectedReportId(result.report_id);
  };

  const selectedReport = reports.find((r) => r.id === selectedReportId) || null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-serif text-3xl font-bold text-foreground">Buscar Processos</h1>
        <p className="text-muted-foreground mt-1">
          Busque processos por nome no JusBrasil e organize os resultados como num CRM — não usamos mais
          CPF/CNPJ nessa busca.
        </p>
      </div>

      <Card>
        <CardContent className="p-4 space-y-3">
          <h3 className="font-semibold">Nova busca por nome</h3>
          <div className="flex flex-col sm:flex-row gap-3">
            <Input
              value={searchName}
              onChange={(e) => setSearchName(e.target.value)}
              placeholder="Nome completo da pessoa ou empresa"
              className="flex-1"
              onKeyDown={(e) => e.key === "Enter" && handleCreateSearch()}
            />
            <Button onClick={handleCreateSearch} disabled={createSearch.isPending || searchName.trim().length < 3}>
              {createSearch.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Search className="w-4 h-4 mr-2" />}
              Buscar
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Cada busca é uma consulta paga no JusBrasil e pode levar até 72 horas para concluir.
          </p>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-6">
        <Card className="h-fit">
          <CardContent className="p-4 space-y-3">
            <h3 className="font-semibold">Minhas buscas</h3>
            {reportsLoading ? (
              <div className="flex justify-center py-6">
                <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
              </div>
            ) : reports.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4">Nenhuma busca realizada ainda.</p>
            ) : (
              <div className="space-y-2">
                {reports.map((report) => {
                  const status = reportStatusConfig[report.status] || reportStatusConfig.criando;
                  return (
                    <button
                      key={report.id}
                      onClick={() => setSelectedReportId(report.id)}
                      className={cn(
                        "w-full text-left p-3 rounded-lg border transition-colors",
                        selectedReportId === report.id
                          ? "border-primary bg-primary/5"
                          : "border-border hover:bg-muted",
                      )}
                    >
                      <p className="font-medium text-sm truncate">{report.search_name}</p>
                      <div className="flex items-center justify-between mt-1.5">
                        <Badge className={cn("text-xs font-normal", status.className)}>{status.label}</Badge>
                        {report.status === "concluido" && (
                          <span className="text-xs text-muted-foreground">{report.result_count} processo(s)</span>
                        )}
                      </div>
                      {report.status === "processando" && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="w-full mt-2 h-7 text-xs"
                          disabled={checkSearch.isPending}
                          onClick={(e) => {
                            e.stopPropagation();
                            checkSearch.mutate(report.id);
                          }}
                        >
                          {checkSearch.isPending ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : null}
                          Verificar resultado
                        </Button>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {selectedReport ? (
          <div className="overflow-x-auto">
            <div className="flex gap-4 min-w-max pb-2">
              {stageColumns.map((stage) => {
                const stageResults = results.filter((r) => r.pipeline_stage === stage);
                return (
                  <div key={stage} className="w-72 shrink-0">
                    <div className="flex items-center gap-2 mb-3">
                      <h4 className="font-semibold text-sm">{stageConfig[stage].label}</h4>
                      <Badge variant="outline" className="rounded-full text-xs">{stageResults.length}</Badge>
                    </div>
                    <div className="space-y-3">
                      {stageResults.map((result) => (
                        <Card key={result.id}>
                          <CardContent className="p-3 space-y-2">
                            <p className="font-mono text-xs font-medium">{result.process_number || "Sem número identificado"}</p>
                            <p className="text-xs text-muted-foreground">
                              {[result.tribunal, result.comarca].filter(Boolean).join(" — ") || "—"}
                            </p>
                            {result.ultima_movimentacao_texto && (
                              <p className="text-xs line-clamp-2">{result.ultima_movimentacao_texto}</p>
                            )}
                            {result.status_processual && (
                              <Badge variant="outline" className="text-xs">{result.status_processual}</Badge>
                            )}
                            <Select
                              value={result.pipeline_stage}
                              onValueChange={(value) => updateResult.mutate({ id: result.id, pipeline_stage: value as PipelineStage })}
                            >
                              <SelectTrigger className="h-8 text-xs">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {stageColumns.map((s) => (
                                  <SelectItem key={s} value={s} className="text-xs">{stageConfig[s].label}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <div className="flex gap-2">
                              <Button
                                size="sm"
                                variant="outline"
                                className="flex-1 h-8 text-xs"
                                onClick={() => {
                                  setNotesResult(result);
                                  setNotesDraft(result.notes || "");
                                }}
                              >
                                <StickyNote className="w-3.5 h-3.5 mr-1" /> Notas
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                className="flex-1 h-8 text-xs"
                                onClick={() => setAutosResult(result)}
                              >
                                <Scale className="w-3.5 h-3.5 mr-1" /> Autos
                              </Button>
                            </div>
                            {result.autos_download_locked && (
                              <div className="flex items-center gap-1 text-xs text-warning bg-warning/10 rounded px-2 py-1">
                                <Lock className="w-3 h-3" /> Autos já baixados
                              </div>
                            )}
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <Card>
            <CardContent className="p-8 text-center text-muted-foreground">
              <FileSearch className="w-10 h-10 mx-auto mb-3 opacity-50" />
              Faça uma busca por nome para começar.
            </CardContent>
          </Card>
        )}
      </div>

      <Dialog open={!!notesResult} onOpenChange={(open) => !open && setNotesResult(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="font-serif">Notas — {notesResult?.process_number || "Processo"}</DialogTitle>
          </DialogHeader>
          <Textarea
            value={notesDraft}
            onChange={(e) => setNotesDraft(e.target.value)}
            rows={6}
            placeholder="Anotações sobre este processo..."
          />
          <Button
            onClick={async () => {
              if (!notesResult) return;
              await updateResult.mutateAsync({ id: notesResult.id, notes: notesDraft });
              setNotesResult(null);
            }}
            disabled={updateResult.isPending}
          >
            {updateResult.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
            Salvar
          </Button>
        </DialogContent>
      </Dialog>

      <AutosDialog
        result={autosResult}
        isAdmin={isAdmin}
        onOpenChange={(open) => !open && setAutosResult(null)}
        onRequestAutos={(id) => requestAutos.mutate(id)}
        onUnlock={(id) => unlockAutos.mutate({ resultId: id })}
        requestPending={requestAutos.isPending}
        unlockPending={unlockAutos.isPending}
      />
    </div>
  );
}

function AutosDialog({
  result,
  isAdmin,
  onOpenChange,
  onRequestAutos,
  onUnlock,
  requestPending,
  unlockPending,
}: {
  result: ProcessSearchResult | null;
  isAdmin: boolean;
  onOpenChange: (open: boolean) => void;
  onRequestAutos: (id: string) => void;
  onUnlock: (id: string) => void;
  requestPending: boolean;
  unlockPending: boolean;
}) {
  const { data: documents = [] } = useProcessSearchDocuments(result?.id || null);

  const handleDownload = async (filePath: string, fileName: string) => {
    const url = await getProcessSearchDocumentUrl(filePath);
    if (!url) return;
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.click();
  };

  return (
    <Dialog open={!!result} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="font-serif">
            Autos processuais — {result?.process_number || "Processo"}
          </DialogTitle>
        </DialogHeader>

        {result?.autos_download_locked ? (
          <div className="rounded-lg border border-warning/30 bg-warning/10 p-4 space-y-3">
            <p className="font-semibold text-warning flex items-center gap-2">
              <Lock className="w-4 h-4" /> Download já realizado
            </p>
            <p className="text-sm text-muted-foreground">
              Os autos deste processo só podem ser baixados uma única vez. Um novo download só pode ser
              liberado por um administrador.
            </p>
            {isAdmin ? (
              <Button
                variant="outline"
                onClick={() => result && onUnlock(result.id)}
                disabled={unlockPending}
              >
                {unlockPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Unlock className="w-4 h-4 mr-2" />}
                Liberar novo download (admin)
              </Button>
            ) : (
              <p className="text-xs text-muted-foreground">Peça a um administrador para liberar um novo download.</p>
            )}
          </div>
        ) : (
          <Button
            onClick={() => result && onRequestAutos(result.id)}
            disabled={requestPending || !result?.process_number}
          >
            {requestPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Download className="w-4 h-4 mr-2" />}
            Baixar autos
          </Button>
        )}

        {documents.length > 0 && (
          <div className="space-y-2 pt-2 border-t">
            <p className="text-sm font-medium">Documentos baixados</p>
            {documents.map((doc) => (
              <button
                key={doc.id}
                onClick={() => handleDownload(doc.file_path, doc.file_name)}
                className="flex items-center gap-2 text-sm text-primary hover:underline w-full text-left"
              >
                <Download className="w-3.5 h-3.5" /> {doc.file_name}
              </button>
            ))}
          </div>
        )}

        {result?.autos_error && (
          <p className="text-xs text-destructive">{result.autos_error}</p>
        )}
      </DialogContent>
    </Dialog>
  );
}
