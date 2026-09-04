import { useMemo, useState } from "react";
import { Wallet, Search, PlayCircle, Radio, Loader2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useProcessSearchCharges, summarizeByDocument, DocumentType } from "@/hooks/useProcessSearchCharges";
import { format, isAfter, startOfMonth, subDays } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";

const periodOptions = [
  { label: "Todos", value: "all" },
  { label: "Últimos 30 dias", value: "30days" },
  { label: "Este mês", value: "month" },
] as const;

const documentTypeLabels: Record<DocumentType, string> = {
  cpf: "CPF",
  cnpj: "CNPJ",
  oab: "OAB",
  outro: "Outro",
};

const currencyFormatter = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

export function ProcessSearchFinancialCounter() {
  const { data: charges = [], isLoading } = useProcessSearchCharges();
  const [period, setPeriod] = useState<(typeof periodOptions)[number]["value"]>("all");

  const filteredCharges = useMemo(() => {
    if (period === "all") return charges;
    const cutoff = period === "30days" ? subDays(new Date(), 30) : startOfMonth(new Date());
    return charges.filter((c) => isAfter(new Date(c.created_at), cutoff));
  }, [charges, period]);

  const summary = useMemo(() => summarizeByDocument(filteredCharges), [filteredCharges]);

  const totals = useMemo(() => {
    const totalSearches = filteredCharges.length;
    const totalCharged = filteredCharges.reduce((sum, c) => sum + Number(c.charged_amount), 0);
    const totalManual = filteredCharges.filter((c) => c.search_type === "manual").length;
    const totalPoll = filteredCharges.filter((c) => c.search_type === "poll").length;
    return { totalSearches, totalCharged, totalManual, totalPoll };
  }, [filteredCharges]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-serif text-3xl font-bold text-foreground flex items-center gap-2">
          <Wallet className="w-7 h-7 text-primary" />
          Contador Financeiro
        </h1>
        <p className="text-muted-foreground mt-1">
          Quantidade e valor cobrado por CNPJ/CPF (ou OAB) monitorado em cada pesquisa processual realizada via
          API — busca ativa diária e buscas manuais.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {periodOptions.map((opt) => (
          <button
            key={opt.value}
            onClick={() => setPeriod(opt.value)}
            className={cn(
              "px-3 py-1.5 rounded-full text-sm font-medium border transition-colors",
              period === opt.value
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-background text-muted-foreground border-border hover:bg-muted",
            )}
          >
            {opt.label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="stat-card">
          <div className="flex items-center justify-between">
            <Search className="w-8 h-8 text-primary" />
          </div>
          <div className="mt-4">
            <p className="stat-value">{totals.totalSearches}</p>
            <p className="stat-label">Pesquisas realizadas</p>
          </div>
        </div>
        <div className="stat-card">
          <div className="flex items-center justify-between">
            <PlayCircle className="w-8 h-8 text-gold-warm" />
          </div>
          <div className="mt-4">
            <p className="stat-value">{totals.totalManual}</p>
            <p className="stat-label">Buscas manuais</p>
          </div>
        </div>
        <div className="stat-card">
          <div className="flex items-center justify-between">
            <Radio className="w-8 h-8 text-warning" />
          </div>
          <div className="mt-4">
            <p className="stat-value">{totals.totalPoll}</p>
            <p className="stat-label">Buscas ativas (diárias)</p>
          </div>
        </div>
        <div className="stat-card">
          <div className="flex items-center justify-between">
            <Wallet className="w-8 h-8 text-success" />
          </div>
          <div className="mt-4">
            <p className="stat-value">{currencyFormatter.format(totals.totalCharged)}</p>
            <p className="stat-label">Total cobrado</p>
          </div>
        </div>
      </div>

      <Card>
        <CardContent className="p-4">
          <h3 className="font-semibold mb-4">Por CNPJ/CPF/OAB monitorado</h3>

          {isLoading ? (
            <div className="flex justify-center py-6">
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            </div>
          ) : summary.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">
              Nenhuma pesquisa processual registrada ainda. Configure o valor por pesquisa e use "Buscar agora"
              em Integrações, ou aguarde a próxima busca ativa diária.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Documento</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Fonte</TableHead>
                    <TableHead className="text-right">Manuais</TableHead>
                    <TableHead className="text-right">Busca ativa</TableHead>
                    <TableHead className="text-right">Total pesquisas</TableHead>
                    <TableHead className="text-right">Valor total cobrado</TableHead>
                    <TableHead>Última pesquisa</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {summary.map((row) => (
                    <TableRow key={`${row.source}:${row.document}`}>
                      <TableCell className="font-medium">{row.document}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-xs">
                          {documentTypeLabels[row.document_type]}
                        </Badge>
                      </TableCell>
                      <TableCell className="capitalize">{row.source}</TableCell>
                      <TableCell className="text-right">{row.manualSearches}</TableCell>
                      <TableCell className="text-right">{row.pollSearches}</TableCell>
                      <TableCell className="text-right font-medium">{row.totalSearches}</TableCell>
                      <TableCell className="text-right font-medium text-success">
                        {currencyFormatter.format(row.totalCharged)}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {format(new Date(row.lastSearchAt), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
