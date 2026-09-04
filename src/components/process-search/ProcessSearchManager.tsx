// "Buscar Processos" — CRM de busca de processos por NOME no JusBrasil.
// Fluxo: digitar um nome -> busca assíncrona (até 72h) -> resultados viram
// cards organizados num Kanban (Novo / Em análise / Relevante / Descartado
// / Convertido) -> cada card permite baixar os autos processuais (PDF com
// as peças), com trava: só um download por processo, liberado de novo só
// por um admin.

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  Search,
  Loader2,
  RefreshCw,
  Lock,
  Unlock,
  Download,
  FileText,
  AlertTriangle,
  Gavel,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import {
  useSearchReports,
  useSearchResults,
  useResultDocuments,
  useCreateNameSearch,
  useCheckNameSearch,
  useMoveResultStage,
  useUpdateResultNotes,
  useRequestCaseAutos,
  useUnlockAutosDownload,
  getSearchDocumentDownloadUrl,
  SearchReport,
  SearchResult,
  PipelineStage,
} from "@/hooks/useProcessSearch";

const STAGES: { id: PipelineStage; label: string }[] = [
  { id: "novo", label: "Novo" },
  { id: "em_analise", label: "Em análise" },
  { id: "relevante", label: "Relevante" },
  { id: "descartado", label: "Descartado" },
  { id: "convertido", label: "Convertido" },
];

const reportStatusConfig: Record<SearchReport["status"], { label: string; color: string }> = {
  criando: { label: "Criando busca...", color: "bg-gray-500/10 text-gray-600" },
  processando: { label: "Processando no JusBrasil", color: "bg-yellow-500/10 text-yellow-600" },
  concluido: { label: "Concluída", color: "bg-green-500/10 text-green-600" },
  erro: { label: "Erro", color: "bg-red-500/10 text-red-600" },
};

export function ProcessSearchManager() {
  const { hasRole } = useAuth();
  const isAdmin = hasRole("admin") || hasRole("supremo");

  const [name, setName] = useState("");
  const [selectedReportId, setSelectedReportId] = useState<string | undefined>(undefined);
  const [notesResult, setNotesResult] = useState<SearchResult | null>(null);
  const [docsResult, setDocsResult] = useState<SearchResult | null>(null);

  const { data: reports, isLoading: loadingReports } = useSearchReports();
  const { data: results, isLoading: loadingResults } = useSearchResults(selectedReportId);
  const createSearch = useCreateNameSearch();
  const checkSearch = useCheckNameSearch();
  const moveStage = useMoveResultStage();

  const selectedReport = reports?.find((r) => r.id === selectedReportId);

  const handleSearch = async () => {
    if (name.trim().length < 3) {
      toast.error("Informe um nome com pelo menos 3 letras");
      return;
    }
    try {
      const res = await createSearch.mutateAsync(name.trim());
      toast.success(res.message || "Busca iniciada");
      setName("");
      setSelectedReportId(res.report_id);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao iniciar busca");
    }
  };

  const handleCheck = async (reportId: string) => {
    try {
      const res = await checkSearch.mutateAsync(reportId);
      if (res.status === "processando") toast.info(res.message || "Ainda processando");
      else if (res.status === "concluido") toast.success(`${res.imported ?? 0} processo(s) importado(s)`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao verificar resultado");
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-serif text-3xl font-bold text-foreground">Buscar Processos</h1>
        <p className="text-muted-foreground mt-1">
          Busque processos por nome no JusBrasil e organize os resultados como num CRM — não usamos mais CPF/CNPJ nessa busca.
        </p>
      </div>

      <Card className="legal-card">
        <CardHeader><CardTitle className="text-base">Nova busca por nome</CardTitle></CardHeader>
        <CardContent>
          <div className="flex flex-col sm:flex-row gap-3">
            <Input
              placeholder="Nome completo da pessoa ou empresa"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSearch()}
            />
            <Button onClick={handleSearch} disabled={createSearch.isPending} className="sm:w-40">
              {createSearch.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Search className="w-4 h-4 mr-2" />}
              Buscar
            </Button>
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            Cada busca é uma consulta paga no JusBrasil e pode levar até 72 horas para concluir.
          </p>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        <Card className="legal-card lg:col-span-1 h-fit">
          <CardHeader><CardTitle className="text-base">Minhas buscas</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {loadingReports && <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />}
            {!loadingReports && (reports?.length ?? 0) === 0 && (
              <p className="text-sm text-muted-foreground">Nenhuma busca ainda.</p>
            )}
            {reports?.map((report) => {
              const config = reportStatusConfig[report.status];
              return (
                <button
                  key={report.id}
                  onClick={() => setSelectedReportId(report.id)}
                  className={`w-full text-left p-3 rounded-lg border transition-colors ${
                    selectedReportId === report.id ? "border-primary bg-primary/5" : "border-border hover:bg-accent"
                  }`}
                >
                  <div className="font-medium text-sm truncate">{report.search_name}</div>
                  <div className="flex items-center justify-between mt-1">
                    <Badge variant="secondary" className={config.color}>{config.label}</Badge>
                    {report.status === "concluido" && (
                      <span className="text-xs text-muted-foreground">{report.result_count} processo(s)</span>
                    )}
                  </div>
                  {report.status === "processando" && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="mt-2 h-7 text-xs w-full"
                      onClick={(e) => { e.stopPropagation(); handleCheck(report.id); }}
                      disabled={checkSearch.isPending}
                    >
                      <RefreshCw className="w-3 h-3 mr-1" /> Verificar resultado
                    </Button>
                  )}
                  {report.status === "erro" && report.error_message && (
                    <p className="text-xs text-red-600 mt-1">{report.error_message}</p>
                  )}
                </button>
              );
            })}
          </CardContent>
        </Card>

        <div className="lg:col-span-3">
          {!selectedReport && (
            <Card className="legal-card">
              <CardContent className="py-12 text-center text-muted-foreground">
                Selecione uma busca à esquerda para ver os processos encontrados.
              </CardContent>
            </Card>
          )}

          {selectedReport && selectedReport.status !== "concluido" && (
            <Card className="legal-card">
              <CardContent className="py-12 text-center text-muted-foreground">
                {selectedReport.status === "erro"
                  ? `Erro nesta busca: ${selectedReport.error_message ?? "erro desconhecido"}`
                  : "Ainda processando no JusBrasil — pode levar até 72 horas."}
              </CardContent>
            </Card>
          )}

          {selectedReport && selectedReport.status === "concluido" && (
            <div className="overflow-x-auto">
              <div className="flex gap-4 min-w-[900px] pb-2">
                {STAGES.map((stage) => {
                  const items = (results ?? []).filter((r) => r.pipeline_stage === stage.id);
                  return (
                    <div key={stage.id} className="flex-1 min-w-[220px]">
                      <div className="flex items-center justify-between mb-2 px-1">
                        <h3 className="font-medium text-sm">{stage.label}</h3>
                        <Badge variant="outline">{items.length}</Badge>
                      </div>
                      <div className="space-y-3">
                        {loadingResults && <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />}
                        {items.map((result) => (
                          <ResultCard
                            key={result.id}
                            result={result}
                            isAdmin={isAdmin}
                            onMoveStage={(stage) => moveStage.mutate({ resultId: result.id, stage })}
                            onOpenNotes={() => setNotesResult(result)}
                            onOpenDocs={() => setDocsResult(result)}
                          />
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      {notesResult && <NotesDialog result={notesResult} onClose={() => setNotesResult(null)} />}
      {docsResult && <DocsDialog result={docsResult} isAdmin={isAdmin} onClose={() => setDocsResult(null)} />}
    </div>
  );
}

function ResultCard({
  result,
  isAdmin,
  onMoveStage,
  onOpenNotes,
  onOpenDocs,
}: {
  result: SearchResult;
  isAdmin: boolean;
  onMoveStage: (stage: PipelineStage) => void;
  onOpenNotes: () => void;
  onOpenDocs: () => void;
}) {
  return (
    <Card className="legal-card">
      <CardContent className="p-3 space-y-2">
        <div className="font-mono text-xs font-medium">{result.process_number ?? "sem número"}</div>
        <div className="text-xs text-muted-foreground">{result.tribunal} {result.comarca ? `— ${result.comarca}` : ""}</div>
        {result.ultima_movimentacao_texto && (
          <p className="text-xs line-clamp-2">{result.ultima_movimentacao_texto}</p>
        )}
        {result.status_processual && (
          <Badge variant="secondary" className="text-xs">{result.status_processual}</Badge>
        )}

        <Select value={result.pipeline_stage} onValueChange={(v) => onMoveStage(v as PipelineStage)}>
          <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            {STAGES.map((s) => <SelectItem key={s.id} value={s.id}>{s.label}</SelectItem>)}
          </SelectContent>
        </Select>

        <div className="flex gap-2">
          <Button size="sm" variant="outline" className="h-7 text-xs flex-1" onClick={onOpenNotes}>
            <FileText className="w-3 h-3 mr-1" /> Notas
          </Button>
          <Button size="sm" variant="outline" className="h-7 text-xs flex-1" onClick={onOpenDocs}>
            <Gavel className="w-3 h-3 mr-1" /> Autos
          </Button>
        </div>

        {result.autos_download_locked && (
          <div className="flex items-center gap-1 text-xs text-amber-600 bg-amber-500/10 rounded px-2 py-1">
            <Lock className="w-3 h-3 shrink-0" /> Autos já baixados
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function NotesDialog({ result, onClose }: { result: SearchResult; onClose: () => void }) {
  const [notes, setNotes] = useState(result.notes ?? "");
  const updateNotes = useUpdateResultNotes();

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Notas — {result.process_number}</DialogTitle></DialogHeader>
        <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={6} placeholder="Anotações internas sobre este processo..." />
        <Button
          onClick={async () => {
            await updateNotes.mutateAsync({ resultId: result.id, notes });
            toast.success("Notas salvas");
            onClose();
          }}
          disabled={updateNotes.isPending}
        >
          Salvar
        </Button>
      </DialogContent>
    </Dialog>
  );
}

function DocsDialog({ result, isAdmin, onClose }: { result: SearchResult; isAdmin: boolean; onClose: () => void }) {
  const { data: documents } = useResultDocuments(result.id);
  const requestAutos = useRequestCaseAutos();
  const unlockAutos = useUnlockAutosDownload();

  const handleDownloadAutos = async () => {
    try {
      const res = await requestAutos.mutateAsync(result.id);
      toast.success(`${res.documents_saved ?? 0} documento(s) baixado(s) dos autos`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao baixar autos");
    }
  };

  const handleUnlock = async () => {
    try {
      await unlockAutos.mutateAsync({ resultId: result.id });
      toast.success("Novo download liberado");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao liberar download");
    }
  };

  const handleOpenFile = async (path: string) => {
    try {
      const url = await getSearchDocumentDownloadUrl(path);
      window.open(url, "_blank", "noopener,noreferrer");
    } catch {
      toast.error("Erro ao gerar link do documento");
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>Autos processuais — {result.process_number}</DialogTitle></DialogHeader>

        {result.autos_download_locked ? (
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-4 space-y-2">
            <div className="flex items-center gap-2 text-amber-700 font-medium">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              Download já realizado
            </div>
            <p className="text-sm text-amber-800">
              Os autos deste processo só podem ser baixados uma única vez. Um novo download só pode ser liberado por um administrador.
            </p>
            {isAdmin && (
              <Button size="sm" variant="outline" onClick={handleUnlock} disabled={unlockAutos.isPending}>
                {unlockAutos.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Unlock className="w-4 h-4 mr-2" />}
                Liberar novo download (admin)
              </Button>
            )}
          </div>
        ) : (
          <Button onClick={handleDownloadAutos} disabled={requestAutos.isPending}>
            {requestAutos.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Download className="w-4 h-4 mr-2" />}
            Baixar autos do processo
          </Button>
        )}

        {result.autos_error && <p className="text-sm text-red-600">{result.autos_error}</p>}

        {(documents?.length ?? 0) > 0 && (
          <div className="space-y-2 mt-2">
            <p className="text-sm font-medium">Documentos baixados</p>
            {documents?.map((doc) => (
              <button
                key={doc.id}
                onClick={() => handleOpenFile(doc.file_path)}
                className="w-full flex items-center gap-2 text-sm p-2 rounded border hover:bg-accent text-left"
              >
                <FileText className="w-4 h-4 shrink-0 text-muted-foreground" />
                <span className="truncate">{doc.file_name}</span>
              </button>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
