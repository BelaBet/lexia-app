import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Building2, CalendarDays, ChevronRight, Download, FileSpreadsheet, FolderOpen, RefreshCw, Scale, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

interface ReportRow { id:string; search_name:string; status:string; result_count:number|null; preview_data:Record<string,unknown>|null; requested_at:string; completed_at:string|null; updated_at:string; }
interface ResultRow { id:string; report_id:string; process_number:string|null; tribunal:string|null; data_distribuicao:string|null; area:string|null; natureza:string|null; valor:number|null; partes_ativas:unknown; partes_passivas:unknown; advogados:unknown; comarca:string|null; foro:string|null; vara:string|null; ultima_movimentacao_data:string|null; ultima_movimentacao_tipo:string|null; ultima_movimentacao_texto:string|null; juiz:string|null; status_processual:string|null; case_id:string|null; autos_status:string|null; raw_data:Record<string,unknown>|null; }

const currency = new Intl.NumberFormat("pt-BR", { style:"currency", currency:"BRL" });
const fmtDate = (value?:string|null) => { if(!value) return "—"; const date=new Date(value); return Number.isNaN(date.getTime()) ? "—" : date.toLocaleDateString("pt-BR"); };
const textValue = (value:unknown) => { if(value==null)return ""; if(typeof value==="string")return value; if(Array.isArray(value))return value.map((item)=>(typeof item==="string"?item:JSON.stringify(item))).join(" | "); return JSON.stringify(value); };
const csvEscape = (value:unknown) => `"${String(value??"").replace(/"/g,'""')}"`;

function downloadCsv(filename:string, rows:ResultRow[]) {
  const headers=["Número do processo","Tribunal","Área","Natureza","Valor","Distribuição","Última movimentação","Tipo da última movimentação","Descrição da última movimentação","Comarca","Foro","Vara","Juiz","Status","Partes ativas","Partes passivas","Advogados"];
  const lines=rows.map((row)=>[row.process_number,row.tribunal,row.area,row.natureza,row.valor,row.data_distribuicao,row.ultima_movimentacao_data,row.ultima_movimentacao_tipo,row.ultima_movimentacao_texto,row.comarca,row.foro,row.vara,row.juiz,row.status_processual,textValue(row.partes_ativas),textValue(row.partes_passivas),textValue(row.advogados)]);
  const csv=[headers,...lines].map((line)=>line.map(csvEscape).join(";")).join("\n");
  const blob=new Blob(["\uFEFF",csv],{type:"text/csv;charset=utf-8"}); const url=URL.createObjectURL(blob); const link=document.createElement("a"); link.href=url; link.download=filename; document.body.appendChild(link); link.click(); link.remove(); URL.revokeObjectURL(url);
}
function getExpectedTotal(report:ReportRow){ const preview=report.preview_data as {total_procs?:unknown}|null; const expected=Number(preview?.total_procs); return Number.isFinite(expected)&&expected>=0 ? expected : Number(report.result_count||0); }
function latestDate(rows:ResultRow[]){ const dates=rows.map((item)=>item.ultima_movimentacao_data).filter((v):v is string=>Boolean(v)).sort(); return dates.length?dates[dates.length-1]:null; }

export function ProcessPortfolio(){
  const navigate=useNavigate();
  const [selectedReportId,setSelectedReportId]=useState<string|null>(null);
  const [searchTerm,setSearchTerm]=useState("");
  const {data,isLoading,isError,error,refetch,isFetching}=useQuery({
    queryKey:["cases","portfolio"],
    queryFn:async()=>{ const [{data:reports,error:reportsError},{data:results,error:resultsError}]=await Promise.all([supabase.from("process_search_reports").select("*").order("created_at",{ascending:false}),supabase.from("process_search_results").select("*").order("data_distribuicao",{ascending:false})]); if(reportsError)throw reportsError; if(resultsError)throw resultsError; return {reports:(reports||[]) as ReportRow[],results:(results||[]) as ResultRow[]}; },
    refetchOnWindowFocus:true,
  });
  const reports=data?.reports||[]; const results=data?.results||[];
  const reportResults=useMemo(()=>{ const grouped=new Map<string,ResultRow[]>(); results.forEach((result)=>{const current=grouped.get(result.report_id)||[];current.push(result);grouped.set(result.report_id,current);}); return grouped; },[results]);
  const selectedReport=reports.find((report)=>report.id===selectedReportId)||null;
  const selectedResults=selectedReport?reportResults.get(selectedReport.id)||[]:[];
  const filteredResults=useMemo(()=>{ const term=searchTerm.trim().toLowerCase(); if(!term)return selectedResults; return selectedResults.filter((row)=>[row.process_number,row.tribunal,row.area,row.natureza,row.comarca,row.vara,row.status_processual].some((value)=>String(value||"").toLowerCase().includes(term))); },[selectedResults,searchTerm]);

  if(isLoading) return <div className="legal-card mx-auto w-full max-w-full"><p className="text-sm text-muted-foreground">Carregando processos...</p></div>;
  if(isError) return <div className="legal-card mx-auto w-full max-w-full"><h2 className="font-semibold">Não foi possível carregar os processos</h2><p className="mt-2 break-words text-sm text-muted-foreground">{error instanceof Error?error.message:"Erro inesperado ao carregar os dados."}</p><Button className="mt-4 w-full sm:w-auto" variant="outline" onClick={()=>refetch()}>Tentar novamente</Button></div>;

  if(selectedReport){
    const expectedTotal=getExpectedTotal(selectedReport); const totalValue=selectedResults.reduce((sum,item)=>sum+Number(item.valor||0),0); const latestMovement=latestDate(selectedResults);
    return <div className="min-w-0 max-w-full space-y-4 sm:space-y-6">
      <section className="legal-card min-w-0 !p-4 sm:!p-6">
        <div className="flex min-w-0 flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0 flex-1">
            <Button variant="outline" size="sm" className="max-w-full" onClick={()=>{setSelectedReportId(null);setSearchTerm("");}}><ArrowLeft className="mr-2 h-4 w-4 shrink-0"/><span className="truncate">Voltar para pesquisas</span></Button>
            <p className="mt-4 text-[11px] font-medium uppercase tracking-wide text-muted-foreground sm:mt-5 sm:text-xs">Pesquisa processual</p>
            <h1 className="mt-1 break-words font-serif text-xl font-bold leading-tight sm:text-2xl md:text-3xl">{selectedReport.search_name}</h1>
            <div className="mt-3 flex flex-wrap gap-2"><Badge variant="secondary" className="max-w-full whitespace-normal text-left">{expectedTotal} processo(s) identificados</Badge><Badge variant="outline" className="max-w-full whitespace-normal text-left">{selectedResults.length} disponível(is) na LexIA</Badge><Badge variant="outline" className="max-w-full whitespace-normal text-left">Atualizado em {fmtDate(selectedReport.updated_at)}</Badge></div>
          </div>
          <Button className="w-full shrink-0 sm:w-auto" onClick={()=>downloadCsv(`${selectedReport.search_name}-processos.csv`,selectedResults)} disabled={!selectedResults.length}><FileSpreadsheet className="mr-2 h-4 w-4"/>Baixar relatório completo</Button>
        </div>
        <div className="mt-5 grid grid-cols-2 gap-2 sm:mt-6 sm:gap-4 lg:grid-cols-4">
          <div className="min-w-0 rounded-xl border p-3 sm:p-4"><p className="text-[11px] text-muted-foreground sm:text-xs">Processos disponíveis</p><p className="mt-1 text-xl font-bold sm:text-2xl">{selectedResults.length}</p></div>
          <div className="min-w-0 rounded-xl border p-3 sm:p-4"><p className="text-[11px] text-muted-foreground sm:text-xs">Valor total</p><p className="mt-1 break-words text-base font-bold sm:text-xl">{currency.format(totalValue)}</p></div>
          <div className="min-w-0 rounded-xl border p-3 sm:p-4"><p className="text-[11px] text-muted-foreground sm:text-xs">Última movimentação</p><p className="mt-1 text-base font-bold sm:text-xl">{fmtDate(latestMovement)}</p></div>
          <div className="min-w-0 rounded-xl border p-3 sm:p-4"><p className="text-[11px] text-muted-foreground sm:text-xs">Última sincronização</p><p className="mt-1 text-base font-bold sm:text-xl">{fmtDate(selectedReport.updated_at)}</p></div>
        </div>
      </section>

      <section className="legal-card min-w-0 !p-3 sm:!p-4"><div className="relative min-w-0"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"/><input value={searchTerm} onChange={(e)=>setSearchTerm(e.target.value)} placeholder="Buscar processo, tribunal, área..." className="legal-input w-full min-w-0 pl-10 text-sm"/></div></section>

      <section className="min-w-0 overflow-hidden rounded-xl border bg-card">
        <div className="divide-y md:hidden">
          {filteredResults.map((row)=><article key={row.id} className="min-w-0 p-4">
            <div className="flex min-w-0 items-start justify-between gap-2"><button className="min-w-0 break-all text-left font-mono text-xs font-semibold text-primary" onClick={()=>row.case_id&&navigate(`/processos/${row.case_id}`)}>{row.process_number||"—"}</button><Badge variant="outline" className="max-w-[42%] shrink-0 whitespace-normal text-center text-[10px]">{row.status_processual||"—"}</Badge></div>
            <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-3 text-xs"><div className="min-w-0"><p className="text-muted-foreground">Tribunal</p><p className="mt-0.5 break-words font-medium">{row.tribunal||"—"}</p></div><div className="min-w-0"><p className="text-muted-foreground">Valor</p><p className="mt-0.5 break-words font-medium">{row.valor!=null?currency.format(Number(row.valor)):"—"}</p></div><div className="min-w-0"><p className="text-muted-foreground">Natureza</p><p className="mt-0.5 break-words font-medium">{row.natureza||row.area||"—"}</p></div><div><p className="text-muted-foreground">Distribuição</p><p className="mt-0.5 font-medium">{fmtDate(row.data_distribuicao)}</p></div><div className="col-span-2"><p className="text-muted-foreground">Última movimentação</p><p className="mt-0.5 font-medium">{fmtDate(row.ultima_movimentacao_data)}</p></div></div>
            <div className="mt-4 grid grid-cols-[44px_1fr] gap-2"><Button variant="outline" size="sm" aria-label="Baixar processo" onClick={()=>downloadCsv(`${row.process_number||"processo"}.csv`,[row])}><Download className="h-4 w-4"/></Button><Button size="sm" disabled={!row.case_id} onClick={()=>row.case_id&&navigate(`/processos/${row.case_id}`)}>Ver detalhes <ChevronRight className="ml-1 h-4 w-4"/></Button></div>
          </article>)}
        </div>
        <div className="hidden overflow-x-auto md:block"><table className="w-full min-w-[980px] text-sm"><thead className="border-b bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground"><tr><th className="px-4 py-3">Processo</th><th className="px-4 py-3">Tribunal</th><th className="px-4 py-3">Natureza</th><th className="px-4 py-3">Valor</th><th className="px-4 py-3">Distribuição</th><th className="px-4 py-3">Última movimentação</th><th className="px-4 py-3">Status</th><th className="px-4 py-3 text-right">Ações</th></tr></thead><tbody>{filteredResults.map((row)=><tr key={row.id} className="border-b last:border-0 hover:bg-muted/30"><td className="px-4 py-3 font-mono text-xs font-medium">{row.process_number||"—"}</td><td className="px-4 py-3">{row.tribunal||"—"}</td><td className="max-w-[220px] px-4 py-3 break-words">{row.natureza||row.area||"—"}</td><td className="px-4 py-3">{row.valor!=null?currency.format(Number(row.valor)):"—"}</td><td className="px-4 py-3">{fmtDate(row.data_distribuicao)}</td><td className="px-4 py-3">{fmtDate(row.ultima_movimentacao_data)}</td><td className="px-4 py-3"><Badge variant="outline">{row.status_processual||"—"}</Badge></td><td className="px-4 py-3"><div className="flex justify-end gap-2"><Button variant="outline" size="sm" onClick={()=>downloadCsv(`${row.process_number||"processo"}.csv`,[row])}><Download className="h-4 w-4"/></Button><Button size="sm" disabled={!row.case_id} onClick={()=>row.case_id&&navigate(`/processos/${row.case_id}`)}>Ver detalhes <ChevronRight className="ml-1 h-4 w-4"/></Button></div></td></tr>)}</tbody></table></div>
        {!filteredResults.length&&<div className="p-8 text-center text-sm text-muted-foreground sm:p-10">Nenhum processo encontrado.</div>}
      </section>
    </div>;
  }

  return <div className="min-w-0 max-w-full space-y-4 sm:space-y-6">
    <section className="legal-card min-w-0 !p-4 sm:!p-6"><div className="flex min-w-0 flex-col gap-4 md:flex-row md:items-center md:justify-between"><div className="flex min-w-0 items-center gap-3"><div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gold-light sm:h-12 sm:w-12"><FolderOpen className="h-5 w-5 text-gold-warm sm:h-6 sm:w-6"/></div><div className="min-w-0"><h2 className="font-serif text-xl font-semibold sm:text-2xl">Processos</h2><p className="text-sm leading-snug text-muted-foreground sm:text-base">Visão organizada por pesquisa, empresa ou pessoa consultada</p></div></div><Button className="w-full md:w-auto" variant="outline" onClick={()=>refetch()} disabled={isFetching}><RefreshCw className={`mr-2 h-4 w-4 ${isFetching?"animate-spin":""}`}/>Atualizar</Button></div></section>
    {!reports.length?<section className="legal-card py-10 text-center sm:py-12"><Building2 className="mx-auto h-10 w-10 text-muted-foreground"/><p className="mt-3 font-medium">Nenhuma pesquisa processual encontrada.</p></section>:<div className="grid min-w-0 grid-cols-1 gap-3 sm:gap-5 xl:grid-cols-2">{reports.map((report)=>{const items=reportResults.get(report.id)||[];const expectedTotal=getExpectedTotal(report);const totalValue=items.reduce((sum,item)=>sum+Number(item.valor||0),0);const latestMovement=latestDate(items);return <article key={report.id} className="legal-card min-w-0 cursor-pointer !p-4 transition-all hover:shadow-md sm:!p-6" onClick={()=>setSelectedReportId(report.id)}><div className="flex min-w-0 items-start justify-between gap-2"><div className="min-w-0 flex-1"><p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground sm:text-xs">Nome pesquisado</p><h3 className="mt-1 break-words font-serif text-lg font-bold leading-tight sm:text-xl">{report.search_name}</h3></div><Badge className="max-w-[40%] shrink-0 whitespace-normal text-center text-[10px] sm:text-xs" variant={report.status==="concluido"?"secondary":"outline"}>{report.status}</Badge></div><div className="mt-4 grid grid-cols-2 gap-2 sm:mt-5 sm:gap-3"><div className="min-w-0 rounded-lg bg-muted/40 p-3"><p className="text-[11px] text-muted-foreground sm:text-xs">Quantidade</p><p className="mt-1 text-xl font-bold sm:text-2xl">{expectedTotal}</p>{items.length!==expectedTotal&&<p className="text-[10px] text-muted-foreground sm:text-xs">{items.length} disponíveis</p>}</div><div className="min-w-0 rounded-lg bg-muted/40 p-3"><p className="flex items-center gap-1 text-[11px] text-muted-foreground sm:text-xs"><Scale className="h-3.5 w-3.5 shrink-0"/>Valor total</p><p className="mt-1 break-words text-sm font-bold sm:text-lg">{currency.format(totalValue)}</p></div><div className="min-w-0 rounded-lg bg-muted/40 p-3"><p className="flex items-center gap-1 text-[11px] text-muted-foreground sm:text-xs"><CalendarDays className="h-3.5 w-3.5 shrink-0"/>Atualização</p><p className="mt-1 text-sm font-semibold sm:text-base">{fmtDate(report.updated_at)}</p></div><div className="min-w-0 rounded-lg bg-muted/40 p-3"><p className="text-[11px] text-muted-foreground sm:text-xs">Movimentação</p><p className="mt-1 text-sm font-semibold sm:text-base">{fmtDate(latestMovement)}</p></div></div><div className="mt-4 border-t pt-4 sm:mt-5"><Button className="w-full sm:w-auto sm:float-right" variant="outline" size="sm" disabled={!items.length} onClick={(e)=>{e.stopPropagation();downloadCsv(`${report.search_name}-processos.csv`,items);}}><Download className="mr-2 h-4 w-4"/>Baixar relatório</Button><div className="clear-both"/></div></article>})}</div>}
  </div>;
}
