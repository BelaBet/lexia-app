import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  Building2,
  ChevronRight,
  Download,
  FileSpreadsheet,
  FolderOpen,
  MapPin,
  RefreshCw,
  Search,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

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
  id: string;
  report_id: string;
  process_number: string | null;
  tribunal: string | null;
  data_distribuicao: string | null;
  area: string | null;
  natureza: string | null;
  valor: number | null;
  partes_ativas: unknown;
  partes_passivas: unknown;
  advogados: unknown;
  comarca: string | null;
  foro: string | null;
  vara: string | null;
  ultima_movimentacao_data: string | null;
  ultima_movimentacao_tipo: string | null;
  ultima_movimentacao_texto: string | null;
  juiz: string | null;
  status_processual: string | null;
  case_id: string | null;
  autos_status: string | null;
  raw_data: Record<string, unknown> | null;
}

type RawProcessData = {
  uf?: string;
  comarca_geo?: [number, number];
  arquivado?: boolean;
  extinto?: number | boolean;
  papel?: string;
  alteradoEm?: string;
  classeNatureza?: string;
  partes?: Array<{ nomeParte?: string }>;
};

const currency = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const chartColors = ["hsl(var(--primary))", "hsl(var(--muted-foreground))", "hsl(var(--accent))", "hsl(var(--secondary-foreground))"];

const fmtDate = (value?: string | null) => {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleDateString("pt-BR");
};

const textValue = (value: unknown) => {
  if (value == null) return "";
  if (typeof value === "string") return value;
  if (Array.isArray(value)) {
    return value.map((item) => (typeof item === "string" ? item : JSON.stringify(item))).join(" | ");
  }
  return JSON.stringify(value);
};

const csvEscape = (value: unknown) => `"${String(value ?? "").replace(/"/g, '""')}"`;

function downloadCsv(filename: string, rows: ResultRow[]) {
  const headers = [
    "Número do processo",
    "Tribunal",
    "Área",
    "Natureza",
    "Valor",
    "Distribuição",
    "Última movimentação",
    "Comarca",
    "Foro",
    "Vara",
    "Juiz",
    "Status",
    "Partes ativas",
    "Partes passivas",
    "Advogados",
  ];
  const lines = rows.map((row) => [
    row.process_number,
    row.tribunal,
    row.area,
    row.natureza,
    row.valor,
    row.data_distribuicao,
    row.ultima_movimentacao_data,
    row.comarca,
    row.foro,
    row.vara,
    row.juiz,
    row.status_processual,
    textValue(row.partes_ativas),
    textValue(row.partes_passivas),
    textValue(row.advogados),
  ]);
  const csv = [headers, ...lines].map((line) => line.map(csvEscape).join(";")).join("\n");
  const blob = new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function getExpectedTotal(report: ReportRow) {
  const preview = report.preview_data as { total_procs?: unknown } | null;
  const expected = Number(preview?.total_procs);
  if (Number.isFinite(expected) && expected >= 0) return expected;
  return Number(report.result_count || 0);
}

function raw(row: ResultRow): RawProcessData {
  return (row.raw_data || {}) as RawProcessData;
}

function partyLabel(row: ResultRow) {
  const names = raw(row).partes?.map((part) => part.nomeParte).filter(Boolean) || [];
  if (names.length) return names.slice(0, 3).join(" • ");
  const fallback = [textValue(row.partes_ativas), textValue(row.partes_passivas)].filter(Boolean).join(" • ");
  return fallback || "Partes não informadas";
}

function buildYearData(rows: ResultRow[]) {
  const counts = new Map<string, number>();
  rows.forEach((row) => {
    const year = row.data_distribuicao?.slice(0, 4);
    if (year) counts.set(year, (counts.get(year) || 0) + 1);
  });
  return [...counts.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([year, total]) => ({ year, total }));
}

function buildNatureData(rows: ResultRow[]) {
  const counts = new Map<string, number>();
  rows.forEach((row) => {
    const name = row.area?.trim() || row.natureza?.trim() || raw(row).classeNatureza?.trim() || "OUTROS";
    counts.set(name.toUpperCase(), (counts.get(name.toUpperCase()) || 0) + 1);
  });
  const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  const top = sorted.slice(0, 5);
  const others = sorted.slice(5).reduce((sum, [, value]) => sum + value, 0);
  if (others) top.push(["OUTROS", others]);
  return top.map(([name, total]) => ({ name, total }));
}

function buildStatusData(rows: ResultRow[]) {
  let closed = 0;
  let open = 0;
  rows.forEach((row) => {
    const item = raw(row);
    if (item.arquivado || Boolean(item.extinto) || /encerr|arquiv|baixad/i.test(row.status_processual || "")) closed += 1;
    else open += 1;
  });
  return [
    { name: "Não encerrado", value: open },
    { name: "Encerrado", value: closed },
  ].filter((item) => item.value > 0);
}

function buildPoloData(rows: ResultRow[]) {
  const counts = new Map<string, number>();
  rows.forEach((row) => {
    const value = raw(row).papel?.trim() || "Não informado";
    const label = /ativo/i.test(value) ? "Polo ativo" : /passivo|re[uú]/i.test(value) ? "Polo passivo" : value;
    counts.set(label, (counts.get(label) || 0) + 1);
  });
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([name, value]) => ({ name, value }));
}

function projectPoint(lat: number, lon: number) {
  const minLon = -74;
  const maxLon = -34;
  const minLat = -34;
  const maxLat = 6;
  const x = ((lon - minLon) / (maxLon - minLon)) * 430 + 35;
  const y = ((maxLat - lat) / (maxLat - minLat)) * 340 + 35;
  return { x, y };
}

function BrazilProcessMap({ rows }: { rows: ResultRow[] }) {
  const points = rows
    .map((row) => {
      const geo = raw(row).comarca_geo;
      if (!Array.isArray(geo) || geo.length < 2) return null;
      const lat = Number(geo[0]);
      const lon = Number(geo[1]);
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
      return { ...projectPoint(lat, lon), label: row.comarca || raw(row).uf || "Processo" };
    })
    .filter(Boolean) as Array<{ x: number; y: number; label: string }>;

  return (
    <div className="h-[390px] overflow-hidden rounded-md border bg-muted/20 p-3">
      <svg viewBox="0 0 500 410" className="h-full w-full" role="img" aria-label="Mapa de distribuição geográfica dos processos">
        <rect x="0" y="0" width="500" height="410" rx="16" fill="hsl(var(--muted) / .18)" />
        <path
          d="M205 35 L270 58 L320 52 L354 82 L390 106 L410 147 L397 184 L421 215 L402 249 L367 265 L349 301 L318 321 L302 369 L269 389 L244 357 L224 329 L194 309 L173 279 L143 257 L126 223 L91 197 L76 163 L94 126 L122 111 L137 75 L173 70 Z"
          fill="hsl(var(--background))"
          stroke="hsl(var(--border))"
          strokeWidth="2"
        />
        <text x="247" y="207" textAnchor="middle" fill="hsl(var(--muted-foreground))" fontSize="18" fontWeight="600">Brasil</text>
        {points.map((point, index) => (
          <g key={`${point.x}-${point.y}-${index}`}>
            <circle cx={point.x} cy={point.y} r="8" fill="hsl(var(--primary) / .22)" />
            <circle cx={point.x} cy={point.y} r="3.5" fill="hsl(var(--primary))">
              <title>{point.label}</title>
            </circle>
          </g>
        ))}
      </svg>
      <div className="pointer-events-none -mt-9 flex items-center gap-2 px-3 text-xs text-muted-foreground">
        <MapPin className="h-3.5 w-3.5" /> {points.length} processo(s) com coordenadas geográficas
      </div>
    </div>
  );
}

function AnalyticsCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border bg-card p-4 shadow-sm">
      <h3 className="mb-4 text-center text-sm font-medium text-foreground">{title}</h3>
      {children}
    </section>
  );
}

export function ProcessPortfolio() {
  const navigate = useNavigate();
  const [selectedReportId, setSelectedReportId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["cases", "portfolio"],
    queryFn: async () => {
      const [{ data: reports, error: reportsError }, { data: results, error: resultsError }] = await Promise.all([
        supabase.from("process_search_reports").select("*").order("created_at", { ascending: false }),
        supabase.from("process_search_results").select("*").order("data_distribuicao", { ascending: false }),
      ]);
      if (reportsError) throw reportsError;
      if (resultsError) throw resultsError;
      return { reports: (reports || []) as ReportRow[], results: (results || []) as ResultRow[] };
    },
    refetchOnWindowFocus: true,
  });

  const reports = data?.reports || [];
  const results = data?.results || [];

  const reportResults = useMemo(() => {
    const grouped = new Map<string, ResultRow[]>();
    results.forEach((result) => {
      const current = grouped.get(result.report_id) || [];
      current.push(result);
      grouped.set(result.report_id, current);
    });
    return grouped;
  }, [results]);

  const selectedReport = reports.find((report) => report.id === selectedReportId) || null;
  const selectedResults = selectedReport ? reportResults.get(selectedReport.id) || [] : [];

  const filteredResults = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    if (!term) return selectedResults;
    return selectedResults.filter((row) =>
      [row.process_number, row.tribunal, row.area, row.natureza, row.comarca, row.vara, row.status_processual, partyLabel(row)]
        .some((value) => String(value || "").toLowerCase().includes(term)),
    );
  }, [selectedResults, searchTerm]);

  if (isLoading) {
    return <div className="legal-card"><p className="text-sm text-muted-foreground">Carregando processos...</p></div>;
  }

  if (selectedReport) {
    const expectedTotal = getExpectedTotal(selectedReport);
    const totalValue = selectedResults.reduce((sum, item) => sum + Number(item.valor || 0), 0);
    const latestMovement = selectedResults
      .map((item) => item.ultima_movimentacao_data || raw(item).alteradoEm)
      .filter(Boolean)
      .sort()
      .at(-1) || null;
    const yearData = buildYearData(selectedResults);
    const natureData = buildNatureData(selectedResults);
    const statusData = buildStatusData(selectedResults);
    const poloData = buildPoloData(selectedResults);

    return (
      <div className="space-y-5">
        <section className="rounded-lg border bg-card shadow-sm">
          <div className="flex flex-col gap-4 border-b p-5 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0">
              <Button variant="ghost" size="sm" className="-ml-3 mb-3" onClick={() => { setSelectedReportId(null); setSearchTerm(""); }}>
                <ArrowLeft className="mr-2 h-4 w-4" /> Voltar
              </Button>
              <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Relatório LEXIA</p>
              <h1 className="mt-1 truncate font-serif text-2xl font-semibold md:text-3xl">{selectedReport.search_name}</h1>
              <p className="mt-1 text-sm text-muted-foreground">Pesquisa atualizada em {fmtDate(selectedReport.updated_at)}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => refetch()} disabled={isFetching}>
                <RefreshCw className={`mr-2 h-4 w-4 ${isFetching ? "animate-spin" : ""}`} /> Atualizar
              </Button>
              <Button onClick={() => downloadCsv(`${selectedReport.search_name}-processos.csv`, selectedResults)} disabled={!selectedResults.length}>
                <Download className="mr-2 h-4 w-4" /> Salvar relatório
              </Button>
            </div>
          </div>

          <div className="p-5">
            <h2 className="mb-4 text-base font-semibold">Resumo da busca</h2>
            <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-5">
              <div><p className="text-xs text-muted-foreground">Termo buscado</p><p className="mt-1 font-medium">{selectedReport.search_name}</p></div>
              <div><p className="text-xs text-muted-foreground">Processos</p><p className="mt-1 font-medium">{expectedTotal}</p></div>
              <div><p className="text-xs text-muted-foreground">Disponíveis na LexIA</p><p className="mt-1 font-medium">{selectedResults.length}</p></div>
              <div><p className="text-xs text-muted-foreground">Valor total</p><p className="mt-1 font-medium">{currency.format(totalValue)}</p></div>
              <div><p className="text-xs text-muted-foreground">Última movimentação</p><p className="mt-1 font-medium">{fmtDate(latestMovement)}</p></div>
            </div>
            <div className="mt-5 rounded-md bg-muted/50 px-4 py-3 text-center text-sm text-muted-foreground">
              {selectedReport.status === "concluido" ? "Relatório concluído." : "Relatório em sincronização."} Processos atualizados em {fmtDate(selectedReport.updated_at)}.
            </div>
          </div>
        </section>

        <div className="grid gap-5 xl:grid-cols-2">
          <AnalyticsCard title={`Distribuição geográfica — ${selectedResults.length} processos`}>
            <BrazilProcessMap rows={selectedResults} />
          </AnalyticsCard>

          <AnalyticsCard title="Data de distribuição">
            <div className="h-[390px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={yearData} margin={{ top: 10, right: 15, left: -15, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="year" tick={{ fontSize: 12 }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
                  <Tooltip />
                  <Bar dataKey="total" name="Processos" fill="hsl(var(--primary))" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </AnalyticsCard>
        </div>

        <div className="grid gap-5 xl:grid-cols-2">
          <AnalyticsCard title="Polo / papel no processo">
            <div className="h-[260px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={poloData} dataKey="value" nameKey="name" innerRadius={55} outerRadius={95} paddingAngle={2}>
                    {poloData.map((_, index) => <Cell key={index} fill={chartColors[index % chartColors.length]} />)}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="flex flex-wrap justify-center gap-3 text-xs text-muted-foreground">
              {poloData.map((item) => <span key={item.name}>{item.name}: <strong className="text-foreground">{item.value}</strong></span>)}
            </div>
          </AnalyticsCard>

          <AnalyticsCard title="Status">
            <div className="h-[260px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={statusData} dataKey="value" nameKey="name" innerRadius={55} outerRadius={95} paddingAngle={2}>
                    {statusData.map((_, index) => <Cell key={index} fill={chartColors[index % chartColors.length]} />)}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="flex justify-center gap-4 text-xs text-muted-foreground">
              {statusData.map((item) => <span key={item.name}>{item.name}: <strong className="text-foreground">{item.value}</strong></span>)}
            </div>
          </AnalyticsCard>
        </div>

        <AnalyticsCard title="Natureza">
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={natureData} layout="vertical" margin={{ top: 5, right: 25, left: 80, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                <XAxis type="number" allowDecimals={false} tick={{ fontSize: 12 }} />
                <YAxis type="category" dataKey="name" width={150} tick={{ fontSize: 11 }} />
                <Tooltip />
                <Bar dataKey="total" name="Processos" fill="hsl(var(--primary))" radius={[0, 3, 3, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </AnalyticsCard>

        <section className="rounded-lg border bg-card shadow-sm">
          <div className="flex flex-col gap-3 border-b p-4 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-lg font-semibold">Lista de processos</h2>
              <p className="text-xs text-muted-foreground">{filteredResults.length} registro(s) exibido(s)</p>
            </div>
            <div className="relative w-full md:w-80">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder="Localizar na tabela"
                className="legal-input h-10 pl-9"
              />
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[1180px] text-sm">
              <thead className="border-b bg-muted/20 text-left text-xs text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 font-medium">Número do processo</th>
                  <th className="px-4 py-3 font-medium">Parte</th>
                  <th className="px-4 py-3 font-medium">Distribuição</th>
                  <th className="px-4 py-3 font-medium">Tribunal</th>
                  <th className="px-4 py-3 font-medium">Valor</th>
                  <th className="px-4 py-3 font-medium">Área</th>
                  <th className="px-4 py-3 font-medium">Natureza</th>
                  <th className="px-4 py-3 text-right font-medium">Ações</th>
                </tr>
              </thead>
              <tbody>
                {filteredResults.map((row) => (
                  <tr key={row.id} className="border-b last:border-0 hover:bg-muted/20">
                    <td className="px-4 py-3">
                      <button
                        className="font-mono text-xs font-medium text-primary hover:underline"
                        onClick={() => row.case_id && navigate(`/processos/${row.case_id}`)}
                      >
                        {row.process_number || "—"}
                      </button>
                    </td>
                    <td className="max-w-[320px] px-4 py-3 text-xs leading-5">{partyLabel(row)}</td>
                    <td className="px-4 py-3">{fmtDate(row.data_distribuicao)}</td>
                    <td className="px-4 py-3">{row.tribunal || "—"}</td>
                    <td className="px-4 py-3">{row.valor != null ? currency.format(Number(row.valor)) : "—"}</td>
                    <td className="px-4 py-3">{row.area || "—"}</td>
                    <td className="max-w-[240px] px-4 py-3 text-xs">{row.natureza || raw(row).classeNatureza || "—"}</td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          title="Baixar este processo"
                          onClick={() => downloadCsv(`${row.process_number || "processo"}.csv`, [row])}
                        >
                          <Download className="h-4 w-4" />
                        </Button>
                        <Button size="sm" disabled={!row.case_id} onClick={() => row.case_id && navigate(`/processos/${row.case_id}`)}>
                          Ver detalhes <ChevronRight className="ml-1 h-4 w-4" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!filteredResults.length && <div className="p-10 text-center text-sm text-muted-foreground">Nenhum processo encontrado.</div>}
        </section>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <section className="rounded-lg border bg-card p-5 shadow-sm">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-primary/10">
              <FolderOpen className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h1 className="font-serif text-2xl font-semibold">Processos</h1>
              <p className="text-sm text-muted-foreground">Relatórios processuais organizados por nome pesquisado</p>
            </div>
          </div>
          <Button variant="outline" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw className={`mr-2 h-4 w-4 ${isFetching ? "animate-spin" : ""}`} /> Atualizar
          </Button>
        </div>
      </section>

      {reports.length === 0 ? (
        <section className="rounded-lg border bg-card py-14 text-center shadow-sm">
          <Building2 className="mx-auto h-10 w-10 text-muted-foreground" />
          <p className="mt-3 font-medium">Nenhuma pesquisa processual encontrada.</p>
        </section>
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">
          {reports.map((report) => {
            const items = reportResults.get(report.id) || [];
            const expectedTotal = getExpectedTotal(report);
            const totalValue = items.reduce((sum, item) => sum + Number(item.valor || 0), 0);
            const latestMovement = items.map((item) => item.ultima_movimentacao_data || raw(item).alteradoEm).filter(Boolean).sort().at(-1) || null;

            return (
              <article
                key={report.id}
                className="cursor-pointer rounded-lg border bg-card p-5 shadow-sm transition hover:border-primary/40 hover:shadow-md"
                onClick={() => setSelectedReportId(report.id)}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">Nome pesquisado</p>
                    <h2 className="mt-1 truncate font-serif text-xl font-semibold">{report.search_name}</h2>
                  </div>
                  <Badge variant={report.status === "concluido" ? "secondary" : "outline"}>{report.status}</Badge>
                </div>

                <div className="mt-5 grid grid-cols-2 gap-x-5 gap-y-4 text-sm">
                  <div><p className="text-xs text-muted-foreground">Quantidade de processos</p><p className="mt-1 text-xl font-semibold">{expectedTotal}</p></div>
                  <div><p className="text-xs text-muted-foreground">Registros disponíveis</p><p className="mt-1 text-xl font-semibold">{items.length}</p></div>
                  <div><p className="text-xs text-muted-foreground">Última atualização</p><p className="mt-1 font-medium">{fmtDate(report.updated_at)}</p></div>
                  <div><p className="text-xs text-muted-foreground">Última movimentação</p><p className="mt-1 font-medium">{fmtDate(latestMovement)}</p></div>
                  <div className="col-span-2"><p className="text-xs text-muted-foreground">Valor total</p><p className="mt-1 text-lg font-semibold">{currency.format(totalValue)}</p></div>
                </div>

                <div className="mt-5 flex items-center justify-between border-t pt-4">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={(event) => {
                      event.stopPropagation();
                      downloadCsv(`${report.search_name}-processos.csv`, items);
                    }}
                    disabled={!items.length}
                  >
                    <FileSpreadsheet className="mr-2 h-4 w-4" /> Baixar relatório
                  </Button>
                  <span className="flex items-center text-sm font-medium text-primary">Abrir relatório <ChevronRight className="ml-1 h-4 w-4" /></span>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
