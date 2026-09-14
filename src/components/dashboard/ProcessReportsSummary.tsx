import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { FileSearch, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

interface ProcessReportsSummaryProps {
  onTabChange: (tab: string) => void;
}

interface ReportRow {
  id: string;
  search_name: string;
  status: string;
  result_count: number | null;
  preview_data: Record<string, unknown> | null;
  requested_at: string;
  completed_at: string | null;
  updated_at: string;
}

interface ResultRow {
  report_id: string;
  tribunal: string | null;
  data_distribuicao: string | null;
}

const formatDateTime = (value?: string | null) => {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return `${date.toLocaleDateString("pt-BR")} ${date.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`;
};

const formatDate = (value?: string | null) => {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleDateString("pt-BR");
};

export function ProcessReportsSummary({ onTabChange }: ProcessReportsSummaryProps) {
  const [search, setSearch] = useState("");
  const { data, isLoading } = useQuery({
    queryKey: ["dashboard", "process-reports-summary"],
    queryFn: async () => {
      const [{ data: reports, error: reportsError }, { data: results, error: resultsError }] = await Promise.all([
        supabase
          .from("process_search_reports")
          .select("id,search_name,status,result_count,preview_data,requested_at,completed_at,updated_at")
          .order("requested_at", { ascending: false })
          .limit(20),
        supabase
          .from("process_search_results")
          .select("report_id,tribunal,data_distribuicao")
          .order("data_distribuicao", { ascending: true }),
      ]);
      if (reportsError) throw reportsError;
      if (resultsError) throw resultsError;
      return { reports: (reports || []) as ReportRow[], results: (results || []) as ResultRow[] };
    },
    staleTime: 60_000,
  });

  const rows = useMemo(() => {
    const reports = data?.reports || [];
    const results = data?.results || [];
    const term = search.trim().toLowerCase();

    return reports
      .map((report) => {
        const reportResults = results.filter((item) => item.report_id === report.id);
        const tribunals = [...new Set(reportResults.map((item) => item.tribunal).filter(Boolean))] as string[];
        const dates = reportResults
          .map((item) => item.data_distribuicao)
          .filter((value): value is string => Boolean(value))
          .sort();
        const preview = report.preview_data as { total_procs?: unknown } | null;
        const previewTotal = Number(preview?.total_procs);
        const total = Number.isFinite(previewTotal) && previewTotal >= 0 ? previewTotal : Number(report.result_count || 0);
        return {
          ...report,
          total,
          tribunals,
          periodStart: dates[0] || null,
          periodEnd: dates[dates.length - 1] || null,
        };
      })
      .filter((report) => !term || report.search_name.toLowerCase().includes(term) || report.tribunals.join(" ").toLowerCase().includes(term));
  }, [data, search]);

  return (
    <section className="legal-card min-w-0 overflow-hidden !p-0">
      <div className="flex flex-col gap-4 border-b p-4 sm:p-6 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <h2 className="font-serif text-xl font-semibold text-foreground sm:text-2xl">Relatórios de localização de processos</h2>
          <p className="mt-1 text-sm text-muted-foreground">Consultas realizadas e relatórios disponíveis na TK2 Juris.</p>
        </div>
        <Button variant="outline" className="w-full lg:w-auto" onClick={() => onTabChange("process-search")}>
          <Search className="mr-2 h-4 w-4" />Fazer uma nova busca
        </Button>
      </div>

      <div className="flex justify-end border-b p-4 sm:px-6">
        <div className="relative w-full sm:w-72">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Localizar na tabela"
            className="legal-input h-10 w-full pl-9"
          />
        </div>
      </div>

      {isLoading ? (
        <div className="p-6 text-sm text-muted-foreground">Carregando relatórios...</div>
      ) : !rows.length ? (
        <div className="flex flex-col items-center justify-center px-6 py-10 text-center">
          <FileSearch className="h-9 w-9 text-muted-foreground" />
          <p className="mt-3 font-medium">Nenhum relatório encontrado.</p>
        </div>
      ) : (
        <>
          <div className="divide-y md:hidden">
            {rows.map((report) => (
              <button key={report.id} onClick={() => onTabChange("cases")} className="block w-full p-4 text-left hover:bg-muted/30">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="break-words font-semibold text-primary">TK2 Juris - {report.search_name}</p>
                    <p className="mt-1 text-xs text-muted-foreground">Criado em {formatDateTime(report.requested_at)}</p>
                  </div>
                  <Badge variant={report.status === "concluido" ? "secondary" : "outline"}>{report.status}</Badge>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-3 text-xs">
                  <div><span className="text-muted-foreground">Processos</span><p className="font-semibold">{report.total}</p></div>
                  <div><span className="text-muted-foreground">Tribunais</span><p>{report.tribunals.slice(0, 4).join(", ") || "—"}</p></div>
                  <div className="col-span-2"><span className="text-muted-foreground">Período</span><p>{formatDate(report.periodStart)} a {formatDate(report.periodEnd)}</p></div>
                </div>
              </button>
            ))}
          </div>

          <div className="hidden overflow-x-auto md:block">
            <table className="w-full min-w-[880px] text-sm">
              <thead className="border-b bg-muted/20 text-left text-xs text-muted-foreground">
                <tr>
                  <th className="px-6 py-3 font-medium">Nome do relatório</th>
                  <th className="px-4 py-3 font-medium">Data criação</th>
                  <th className="px-4 py-3 font-medium">Termos buscados</th>
                  <th className="px-4 py-3 font-medium">Tribunal</th>
                  <th className="px-4 py-3 font-medium">Período</th>
                  <th className="px-4 py-3 font-medium">Processos</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((report) => (
                  <tr key={report.id} onClick={() => onTabChange("cases")} className="cursor-pointer border-b align-top transition-colors hover:bg-muted/30">
                    <td className="px-6 py-4 font-semibold text-primary">TK2 Juris - {report.search_name}</td>
                    <td className="px-4 py-4 text-xs">{formatDateTime(report.requested_at)}</td>
                    <td className="px-4 py-4">{report.search_name}</td>
                    <td className="max-w-[220px] px-4 py-4 text-xs">{report.tribunals.slice(0, 5).join(", ") || "—"}{report.tribunals.length > 5 ? " e outros" : ""}</td>
                    <td className="px-4 py-4 text-xs">{formatDate(report.periodStart)} a {formatDate(report.periodEnd)}</td>
                    <td className="px-4 py-4 font-semibold">{report.total}</td>
                    <td className="px-4 py-4"><Badge variant={report.status === "concluido" ? "secondary" : "outline"}>{report.status}</Badge></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}
