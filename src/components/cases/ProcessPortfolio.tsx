import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Building2, CalendarDays, ChevronLeft, ChevronRight, Download, FileSpreadsheet, FolderOpen, RefreshCw, Scale, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { BrazilStatesMap } from "./BrazilStatesMap";

interface ReportRow { id:string; search_name:string; status:string; result_count:number|null; preview_data:Record<string,unknown>|null; requested_at:string; completed_at:string|null; updated_at:string; }
interface ResultRow { id:string; report_id:string; process_number:string|null; tribunal:string|null; data_distribuicao:string|null; area:string|null; natureza:string|null; valor:number|null; partes_ativas:unknown; partes_passivas:unknown; advogados:unknown; comarca:string|null; foro:string|null; vara:string|null; ultima_movimentacao_data:string|null; ultima_movimentacao_tipo:string|null; ultima_movimentacao_texto:string|null; juiz:string|null; status_processual:string|null; case_id:string|null; autos_status:string|null; raw_data:Record<string,unknown>|null; }

type RawData = { comarca_geo?: unknown; uf?: unknown; papel?: unknown; arquivado?: unknown; extinto?: unknown; classeNatureza?: unknown; partes?: unknown; alteradoEm?: unknown; };
type CountItem = { name:string; value:number };

const PAGE_SIZE = 15;
const currency = new Intl.NumberFormat("pt-BR", { style:"currency", currency:"BRL" });
const fmtDate = (value?:string|null) => { if(!value) return "—"; const date=new Date(value); return Number.isNaN(date.getTime()) ? "—" : date.toLocaleDateString("pt-BR"); };
const textValue = (value:unknown) => { if(value==null)return ""; if(typeof value==="string")return value; if(Array.isArray(value))return value.map((item)=>(typeof item==="string"?item:JSON.stringify(item))).join(" | "); return JSON.stringify(value); };
const csvEscape = (value:unknown) => `"${String(value??"").replace(/"/g,'""')}"`;
const safeText = (value:unknown) => typeof value === "string" ? value.trim() : "";
const raw = (row:ResultRow) => (row.raw_data && typeof row.raw_data === "object" ? row.raw_data : {}) as RawData;

function downloadCsv(filename:string, rows:ResultRow[]) {
  const headers=["Número do processo","Parte","Tribunal","Área","Natureza","Valor","Distribuição","Última movimentação","Comarca","Foro","Vara","Juiz","Status"];
  const lines=rows.map((row)=>[row.process_number,partyLabel(row),row.tribunal,row.area,row.natureza,row.valor,row.data_distribuicao,row.ultima_movimentacao_data,row.comarca,row.foro,row.vara,row.juiz,row.status_processual]);
  const csv=[headers,...lines].map((line)=>line.map(csvEscape).join(";")).join("\n");
  const blob=new Blob(["\uFEFF",csv],{type:"text/csv;charset=utf-8"});
  const url=URL.createObjectURL(blob); const link=document.createElement("a"); link.href=url; link.download=filename; document.body.appendChild(link); link.click(); link.remove(); URL.revokeObjectURL(url);
}
function getExpectedTotal(report:ReportRow){ const preview=report.preview_data as {total_procs?:unknown}|null; const expected=Number(preview?.total_procs); return Number.isFinite(expected)&&expected>=0 ? expected : Number(report.result_count||0); }
function latestDate(rows:ResultRow[]){ const dates=rows.map((item)=>item.ultima_movimentacao_data||safeText(raw(item).alteradoEm)).filter((v):v is string=>Boolean(v)).sort(); return dates.length?dates[dates.length-1]:null; }
function countBy(rows:ResultRow[], getter:(row:ResultRow)=>string){ const map=new Map<string,number>(); rows.forEach((row)=>{const name=getter(row)||"Não informado";map.set(name,(map.get(name)||0)+1);}); return [...map.entries()].map(([name,value])=>({name,value})).sort((a,b)=>b.value-a.value); }
function yearData(rows:ResultRow[]){ return countBy(rows,(row)=>{const value=row.data_distribuicao||"";const match=value.match(/\d{4}/);return match?.[0]||"Sem data";}).sort((a,b)=>a.name.localeCompare(b.name)); }
function natureData(rows:ResultRow[]){ return countBy(rows,(row)=>row.area?.trim()||safeText(raw(row).classeNatureza)||row.natureza?.trim()||"OUTROS").slice(0,8); }
function statusData(rows:ResultRow[]){ return countBy(rows,(row)=>{const source=raw(row);const status=(row.status_processual||"").toLowerCase();const closed=Boolean(source.arquivado)||Boolean(source.extinto)||/arquiv|baixad|encerr|extint/.test(status);return closed?"Encerrado":"Não encerrado";}); }
function poloData(rows:ResultRow[]){ return countBy(rows,(row)=>{const papel=safeText(raw(row).papel);if(/ativo/i.test(papel))return "Polo ativo";if(/passivo|réu|reu/i.test(papel))return "Polo passivo";return papel||"Sem dados";}).slice(0,4); }
function stateData(rows:ResultRow[]){
  const valid = new Set(["AC","AL","AP","AM","BA","CE","DF","ES","GO","MA","MT","MS","MG","PA","PB","PR","PE","PI","RJ","RN","RS","RO","RR","SC","SP","SE","TO"]);
  const map = new Map<string,number>();
  rows.forEach((row)=>{
    const uf = safeText(raw(row).uf).toUpperCase();
    if(valid.has(uf)) map.set(uf,(map.get(uf)||0)+1);
  });
  return [...map.entries()].map(([uf,count])=>({uf,count})).sort((a,b)=>b.count-a.count);
}
function partyLabel(row:ResultRow){
  const source=raw(row).partes;
  if(Array.isArray(source)){
    const names=source.map((item)=>item&&typeof item==="object"?safeText((item as Record<string,unknown>).nomeParte):"").filter(Boolean);
    if(names.length)return names.slice(0,4).join(" · ");
  }
  const fallback=[textValue(row.partes_ativas),textValue(row.partes_passivas)].filter(Boolean).join(" · ");
  return fallback||"—";
}

function ReportPanel({title,children,className=""}:{title:string;children:React.ReactNode;className?:string}){
  return <section className={`min-w-0 ${className}`}><h3 className="mb-4 text-center text-sm font-medium text-foreground sm:text-base">{title}</h3>{children}</section>;
}
function VerticalYearChart({data}:{data:CountItem[]}){
  const max=Math.max(1,...data.map((item)=>item.value));
  return <div className="h-[330px] w-full overflow-x-auto"><div className="flex h-full min-w-[520px] items-end gap-3 border-b border-l px-4 pb-7 pt-4 sm:gap-5">{data.map((item)=><div key={item.name} className="flex min-w-[34px] flex-1 flex-col items-center justify-end gap-2"><span className="text-[11px] font-semibold">{item.value}</span><div className="w-full max-w-[42px] rounded-t bg-primary/75" style={{height:`${Math.max(6,(item.value/max)*235)}px`}}/><span className="origin-center -rotate-45 text-[10px] text-muted-foreground sm:text-xs">{item.name}</span></div>)}</div></div>;
}
function HorizontalBars({data}:{data:CountItem[]}){
  const max=Math.max(1,...data.map((item)=>item.value));
  return <div className="space-y-3">{data.map((item)=><div key={item.name} className="grid grid-cols-[96px_1fr_36px] items-center gap-2 text-xs sm:grid-cols-[130px_1fr_40px]"><span className="truncate text-right text-muted-foreground" title={item.name}>{item.name}</span><div className="h-8 bg-muted/35"><div className="h-full bg-primary/75" style={{width:`${Math.max(3,(item.value/max)*100)}%`}}/></div><strong>{item.value}</strong></div>)}</div>;
}
function Donut({data}:{data:CountItem[]}){
  const total=data.reduce((sum,item)=>sum+item.value,0)||1;
  const first=data[0]?.value||0;
  const p1=Math.round((first/total)*100);
  return <div className="flex min-h-[270px] flex-col items-center justify-center gap-5"><div className="flex h-44 w-44 items-center justify-center rounded-full p-8" style={{background:`conic-gradient(hsl(var(--primary)) 0 ${p1}%, hsl(var(--muted-foreground) / .25) ${p1}% 100%)`}}><div className="h-full w-full rounded-full bg-background"/></div><div className="flex flex-wrap justify-center gap-x-5 gap-y-2 text-xs">{data.map((item,index)=><span key={item.name} className="flex items-center gap-2"><span className={`h-2.5 w-2.5 rounded-full ${index===0?"bg-primary":"bg-muted-foreground/40"}`}/>{item.name}: <strong>{item.value}</strong></span>)}</div></div>;
}

export function ProcessPortfolio(){
  const navigate=useNavigate();
  const [selectedReportId,setSelectedReportId]=useState<string|null>(null);
  const [searchTerm,setSearchTerm]=useState("");
  const [page,setPage]=useState(1);
  const {data,isLoading,isError,error,refetch,isFetching}=useQuery({queryKey:["cases","portfolio"],queryFn:async()=>{const [{data:reports,error:reportsError},{data:results,error:resultsError}]=await Promise.all([supabase.from("process_search_reports").select("*").order("created_at",{ascending:false}),supabase.from("process_search_results").select("*").order("data_distribuicao",{ascending:false})]);if(reportsError)throw reportsError;if(resultsError)throw resultsError;return{reports:(reports||[])as ReportRow[],results:(results||[])as ResultRow[]};},refetchOnWindowFocus:true});
  const reports=data?.reports||[];const results=data?.results||[];
  const reportResults=useMemo(()=>{const grouped=new Map<string,ResultRow[]>();results.forEach((result)=>{const current=grouped.get(result.report_id)||[];current.push(result);grouped.set(result.report_id,current);});return grouped;},[results]);
  const selectedReport=reports.find((report)=>report.id===selectedReportId)||null;
  const selectedResults=selectedReport?reportResults.get(selectedReport.id)||[]:[];
  const filteredResults=useMemo(()=>{const term=searchTerm.trim().toLowerCase();if(!term)return selectedResults;return selectedResults.filter((row)=>[row.process_number,row.tribunal,row.area,row.natureza,row.comarca,row.vara,row.status_processual,partyLabel(row)].some((value)=>String(value||"").toLowerCase().includes(term)));},[selectedResults,searchTerm]);
  const totalPages=Math.max(1,Math.ceil(filteredResults.length/PAGE_SIZE));
  const currentPage=Math.min(page,totalPages);
  const pagedResults=filteredResults.slice((currentPage-1)*PAGE_SIZE,currentPage*PAGE_SIZE);

  if(isLoading)return <div className="legal-card"><p className="text-sm text-muted-foreground">Carregando processos...</p></div>;
  if(isError)return <div className="legal-card"><h2 className="font-semibold">Não foi possível carregar os processos</h2><p className="mt-2 text-sm text-muted-foreground">{error instanceof Error?error.message:"Erro inesperado ao carregar os dados."}</p><Button className="mt-4" variant="outline" onClick={()=>refetch()}>Tentar novamente</Button></div>;

  if(selectedReport){
    const expectedTotal=getExpectedTotal(selectedReport);const latestMovement=latestDate(selectedResults);const years=yearData(selectedResults);const natures=natureData(selectedResults);const statuses=statusData(selectedResults);const polos=poloData(selectedResults);const states=stateData(selectedResults);
    return <div className="mx-auto w-full max-w-[1220px] space-y-8 pb-8 sm:space-y-10">
      <header className="border-b pb-6">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0"><Button variant="ghost" size="sm" className="-ml-3 mb-3" onClick={()=>{setSelectedReportId(null);setSearchTerm("");setPage(1);}}><ArrowLeft className="mr-2 h-4 w-4"/>Voltar</Button><h1 className="break-words font-serif text-2xl font-semibold leading-tight text-primary sm:text-3xl">Relatório LEXIA - {selectedReport.search_name} ({fmtDate(selectedReport.updated_at)})</h1></div>
          <div className="flex flex-col gap-2 sm:flex-row"><Button variant="outline" onClick={()=>refetch()} disabled={isFetching}><RefreshCw className={`mr-2 h-4 w-4 ${isFetching?"animate-spin":""}`}/>Atualizar relatório</Button><Button variant="outline" onClick={()=>downloadCsv(`${selectedReport.search_name}-processos.csv`,selectedResults)} disabled={!selectedResults.length}><Download className="mr-2 h-4 w-4"/>Salvar relatório</Button></div>
        </div>
        <div className="mt-7"><h2 className="mb-4 text-lg font-semibold">Resumo da busca</h2><div className="grid gap-4 border-b pb-4 text-sm sm:grid-cols-2 lg:grid-cols-5"><div><p className="text-xs text-muted-foreground">Termos buscados</p><p className="mt-1 font-medium">{selectedReport.search_name}</p></div><div><p className="text-xs text-muted-foreground">Tribunal</p><p className="mt-1 font-medium">{[...new Set(selectedResults.map(r=>r.tribunal).filter(Boolean))].slice(0,5).join(", ")||"—"}</p></div><div><p className="text-xs text-muted-foreground">Período</p><p className="mt-1 font-medium">até {fmtDate(selectedReport.updated_at)}</p></div><div><p className="text-xs text-muted-foreground">Processos identificados</p><p className="mt-1 font-medium">{expectedTotal}</p></div><div><p className="text-xs text-muted-foreground">Disponíveis na LexIA</p><p className="mt-1 font-medium">{selectedResults.length}</p></div></div><div className="mt-4 bg-muted/60 px-4 py-3 text-center text-sm text-muted-foreground">{selectedReport.status==="concluido"?"Relatório concluído.":"Relatório em sincronização."} Processos atualizados em {fmtDate(selectedReport.updated_at)}. Última movimentação: {fmtDate(latestMovement)}.</div></div>
      </header>

      <section className="grid gap-10 lg:grid-cols-2">
        <BrazilStatesMap counts={states}/>
        <ReportPanel title="Data de distribuição"><VerticalYearChart data={years}/></ReportPanel>
      </section>

      <section className="grid gap-10 lg:grid-cols-2">
        <ReportPanel title="Polo">{polos.length===1&&polos[0].name==="Sem dados"?<div className="flex min-h-[270px] items-center justify-center text-xl font-semibold">Sem dados disponíveis.</div>:<Donut data={polos}/>}</ReportPanel>
        <ReportPanel title="Status"><Donut data={statuses}/></ReportPanel>
      </section>

      <ReportPanel title="Natureza" className="mx-auto w-full max-w-[760px]"><HorizontalBars data={natures}/></ReportPanel>

      <section className="pt-3">
        <div className="mb-4 flex flex-col gap-4 md:flex-row md:items-end md:justify-between"><div><h2 className="text-xl font-semibold">Lista de processos</h2><p className="mt-1 text-xs text-muted-foreground">{filteredResults.length} registro(s)</p></div><div className="relative w-full md:w-72"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"/><input value={searchTerm} onChange={(e)=>{setSearchTerm(e.target.value);setPage(1);}} placeholder="Localizar na tabela" className="legal-input h-10 w-full pl-9"/></div></div>

        <div className="divide-y rounded-lg border md:hidden">{pagedResults.map((row)=><article key={row.id} className="p-4"><button onClick={()=>row.case_id&&navigate(`/processos/${row.case_id}`)} className="break-all text-left font-mono text-xs font-bold text-[#18324A] hover:underline dark:text-[#DCE9F3]">{row.process_number||"—"}</button><p className="mt-2 text-xs leading-relaxed">{partyLabel(row)}</p><div className="mt-3 grid grid-cols-2 gap-3 text-xs"><div><span className="text-muted-foreground">Distribuição</span><p>{fmtDate(row.data_distribuicao)}</p></div><div><span className="text-muted-foreground">Tribunal</span><p>{row.tribunal||"—"}</p></div><div><span className="text-muted-foreground">Valor</span><p>{row.valor!=null?currency.format(Number(row.valor)):"—"}</p></div><div><span className="text-muted-foreground">Área</span><p>{row.area||"—"}</p></div><div className="col-span-2"><span className="text-muted-foreground">Natureza</span><p>{row.natureza||safeText(raw(row).classeNatureza)||"—"}</p></div></div><div className="mt-4 flex gap-2"><Button variant="outline" size="sm" onClick={()=>downloadCsv(`${row.process_number||"processo"}.csv`,[row])}><Download className="h-4 w-4"/></Button><Button size="sm" className="flex-1" disabled={!row.case_id} onClick={()=>row.case_id&&navigate(`/processos/${row.case_id}`)}>Ver detalhes</Button></div></article>)}</div>

        <div className="hidden overflow-x-auto md:block"><table className="w-full min-w-[1040px] text-sm"><thead className="border-y text-left text-xs text-muted-foreground"><tr><th className="px-3 py-3 font-medium">Número do processo</th><th className="px-3 py-3 font-medium">Parte</th><th className="px-3 py-3 font-medium">Distribuição</th><th className="px-3 py-3 font-medium">Tribunal</th><th className="px-3 py-3 font-medium">Valor (R$)</th><th className="px-3 py-3 font-medium">Área</th><th className="px-3 py-3 font-medium">Natureza</th><th className="px-3 py-3 font-medium">Ações</th></tr></thead><tbody>{pagedResults.map((row)=><tr key={row.id} className="border-b align-top hover:bg-muted/20"><td className="px-3 py-4"><button className="font-mono text-xs font-bold text-[#18324A] hover:underline dark:text-[#DCE9F3]" onClick={()=>row.case_id&&navigate(`/processos/${row.case_id}`)}>{row.process_number||"—"}</button></td><td className="max-w-[330px] px-3 py-4 text-xs leading-5">{partyLabel(row)}</td><td className="px-3 py-4">{fmtDate(row.data_distribuicao)}</td><td className="px-3 py-4">{row.tribunal||"—"}</td><td className="px-3 py-4">{row.valor!=null?currency.format(Number(row.valor)):"—"}</td><td className="px-3 py-4">{row.area||"—"}</td><td className="max-w-[220px] px-3 py-4 text-xs leading-5">{row.natureza||safeText(raw(row).classeNatureza)||"—"}</td><td className="px-3 py-4"><div className="flex gap-2"><Button variant="outline" size="sm" onClick={()=>downloadCsv(`${row.process_number||"processo"}.csv`,[row])}><Download className="h-4 w-4"/></Button><Button size="sm" disabled={!row.case_id} onClick={()=>row.case_id&&navigate(`/processos/${row.case_id}`)}>Abrir</Button></div></td></tr>)}</tbody></table></div>

        {totalPages>1&&<div className="mt-6 flex flex-wrap items-center justify-center gap-1"><Button variant="ghost" size="icon" disabled={currentPage===1} onClick={()=>setPage(p=>Math.max(1,p-1))}><ChevronLeft className="h-4 w-4"/></Button>{Array.from({length:Math.min(totalPages,7)},(_,i)=>i+1).map(n=><Button key={n} size="sm" variant={currentPage===n?"default":"ghost"} className="h-8 min-w-8 px-2" onClick={()=>setPage(n)}>{n}</Button>)}{totalPages>7&&<span className="px-1 text-sm text-muted-foreground">… {totalPages}</span>}<Button variant="ghost" size="icon" disabled={currentPage===totalPages} onClick={()=>setPage(p=>Math.min(totalPages,p+1))}><ChevronRight className="h-4 w-4"/></Button></div>}
      </section>
    </div>;
  }

  return <div className="min-w-0 max-w-full space-y-4 sm:space-y-6"><section className="legal-card min-w-0 !p-4 sm:!p-6"><div className="flex min-w-0 flex-col gap-4 md:flex-row md:items-center md:justify-between"><div className="flex min-w-0 items-center gap-3"><div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gold-light sm:h-12 sm:w-12"><FolderOpen className="h-5 w-5 text-gold-warm sm:h-6 sm:w-6"/></div><div className="min-w-0"><h2 className="font-serif text-xl font-semibold sm:text-2xl">Processos</h2><p className="text-sm leading-snug text-muted-foreground sm:text-base">Relatórios organizados por pesquisa, empresa ou pessoa consultada</p></div></div><Button className="w-full md:w-auto" variant="outline" onClick={()=>refetch()} disabled={isFetching}><RefreshCw className={`mr-2 h-4 w-4 ${isFetching?"animate-spin":""}`}/>Atualizar</Button></div></section>{!reports.length?<section className="legal-card py-10 text-center sm:py-12"><Building2 className="mx-auto h-10 w-10 text-muted-foreground"/><p className="mt-3 font-medium">Nenhuma pesquisa processual encontrada.</p></section>:<div className="grid min-w-0 grid-cols-1 gap-3 sm:gap-5 xl:grid-cols-2">{reports.map((report)=>{const items=reportResults.get(report.id)||[];const expectedTotal=getExpectedTotal(report);const totalValue=items.reduce((sum,item)=>sum+Number(item.valor||0),0);const latestMovement=latestDate(items);return <article key={report.id} className="legal-card min-w-0 cursor-pointer !p-4 transition-all hover:shadow-md sm:!p-6" onClick={()=>{setSelectedReportId(report.id);setPage(1);}}><div className="flex min-w-0 items-start justify-between gap-2"><div className="min-w-0 flex-1"><p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground sm:text-xs">Nome pesquisado</p><h3 className="mt-1 break-words font-serif text-lg font-bold leading-tight sm:text-xl">{report.search_name}</h3></div><Badge className="max-w-[40%] shrink-0 whitespace-normal text-center text-[10px] sm:text-xs" variant={report.status==="concluido"?"secondary":"outline"}>{report.status}</Badge></div><div className="mt-4 grid grid-cols-2 gap-2 sm:mt-5 sm:gap-3"><div className="min-w-0 rounded-lg bg-muted/40 p-3"><p className="text-[11px] text-muted-foreground sm:text-xs">Quantidade</p><p className="mt-1 text-xl font-bold sm:text-2xl">{expectedTotal}</p>{items.length!==expectedTotal&&<p className="text-[10px] text-muted-foreground sm:text-xs">{items.length} disponíveis</p>}</div><div className="min-w-0 rounded-lg bg-muted/40 p-3"><p className="flex items-center gap-1 text-[11px] text-muted-foreground sm:text-xs"><Scale className="h-3.5 w-3.5 shrink-0"/>Valor total</p><p className="mt-1 break-words text-sm font-bold sm:text-lg">{currency.format(totalValue)}</p></div><div className="min-w-0 rounded-lg bg-muted/40 p-3"><p className="flex items-center gap-1 text-[11px] text-muted-foreground sm:text-xs"><CalendarDays className="h-3.5 w-3.5 shrink-0"/>Atualização</p><p className="mt-1 text-sm font-semibold sm:text-base">{fmtDate(report.updated_at)}</p></div><div className="min-w-0 rounded-lg bg-muted/40 p-3"><p className="text-[11px] text-muted-foreground sm:text-xs">Movimentação</p><p className="mt-1 text-sm font-semibold sm:text-base">{fmtDate(latestMovement)}</p></div></div><div className="mt-4 border-t pt-4 sm:mt-5"><Button className="w-full sm:w-auto sm:float-right" variant="outline" size="sm" disabled={!items.length} onClick={(e)=>{e.stopPropagation();downloadCsv(`${report.search_name}-processos.csv`,items);}}><FileSpreadsheet className="mr-2 h-4 w-4"/>Baixar relatório</Button><div className="clear-both"/></div></article>})}</div>}</div>;
}
