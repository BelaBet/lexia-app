import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CalendarOff, Loader2, Plus, Trash2 } from "lucide-react";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  useAgendaBlockedDates,
  useCreateAgendaBlockedDate,
  useDeleteAgendaBlockedDate,
  BlockedDateScope,
} from "@/hooks/useAgendaBlockedDates";

const scopeLabels: Record<BlockedDateScope, string> = {
  nacional: "Nacional",
  estadual: "Estadual",
  municipal: "Municipal",
  comarca: "Comarca",
  interno: "Interno",
};

// "Bloqueios e Feriados": feriados nacionais e o recesso forense (CPC art.
// 220) já vêm cadastrados globalmente (somente leitura aqui) — o
// escritório só precisa complementar com o que for específico da própria
// comarca (feriado estadual/municipal) ou um bloqueio pontual (greve,
// calamidade). Isso é o que corrige o prazo real de resposta quando ele
// chega via API — ver supabase/functions/_shared/businessDays.ts.
export function AgendaBlockedDatesCard() {
  const { data: blockedDates = [], isLoading } = useAgendaBlockedDates();
  const createBlockedDate = useCreateAgendaBlockedDate();
  const deleteBlockedDate = useDeleteAgendaBlockedDate();

  const [title, setTitle] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [scope, setScope] = useState<BlockedDateScope>("comarca");

  const globalDates = blockedDates.filter((d) => d.user_id === null);
  const ownDates = blockedDates.filter((d) => d.user_id !== null);

  const handleAdd = async () => {
    if (!title.trim() || !startDate) return;
    await createBlockedDate.mutateAsync({
      title: title.trim(),
      start_date: startDate,
      end_date: endDate || startDate,
      scope,
    });
    setTitle("");
    setStartDate("");
    setEndDate("");
    setScope("comarca");
  };

  const formatRange = (start: string, end: string) => {
    const startLabel = format(parseISO(start), "dd/MM/yyyy", { locale: ptBR });
    if (start === end) return startLabel;
    return `${startLabel} — ${format(parseISO(end), "dd/MM/yyyy", { locale: ptBR })}`;
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CalendarOff className="w-5 h-5" />
          Bloqueios e Feriados da Agenda
        </CardTitle>
        <CardDescription>
          Dias sem expediente forense usados para corrigir o prazo real de resposta quando ele chega
          automaticamente via API — se o prazo cair num feriado ou bloqueio, o sistema já prorroga para o
          próximo dia útil (CPC art. 224 §1º). Feriados nacionais e o recesso forense já estão cadastrados;
          adicione aqui só os feriados da sua comarca ou bloqueios pontuais (greve, calamidade).
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 items-end">
          <div className="space-y-1.5 lg:col-span-2">
            <Label>Título</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ex.: Feriado Municipal de Caruaru" />
          </div>
          <div className="space-y-1.5">
            <Label>Data inicial</Label>
            <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Data final (opcional)</Label>
            <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Âmbito</Label>
            <Select value={scope} onValueChange={(v) => setScope(v as BlockedDateScope)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="comarca">Comarca</SelectItem>
                <SelectItem value="municipal">Municipal</SelectItem>
                <SelectItem value="estadual">Estadual</SelectItem>
                <SelectItem value="interno">Interno (escritório)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button
            onClick={handleAdd}
            disabled={createBlockedDate.isPending || !title.trim() || !startDate}
            className="lg:col-span-5 sm:col-span-2 w-full sm:w-auto sm:justify-self-start"
          >
            {createBlockedDate.isPending ? (
              <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
            ) : (
              <Plus className="w-4 h-4 mr-1.5" />
            )}
            Adicionar bloqueio
          </Button>
        </div>

        <div className="space-y-3">
          <p className="text-sm font-medium text-muted-foreground">Bloqueios cadastrados por você</p>
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Carregando...</p>
          ) : ownDates.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum bloqueio específico cadastrado ainda.</p>
          ) : (
            <div className="space-y-2">
              {ownDates.map((d) => (
                <div key={d.id} className="flex items-center justify-between rounded-lg border border-border p-3">
                  <div className="flex items-center gap-3">
                    <Badge variant="outline">{scopeLabels[d.scope]}</Badge>
                    <div>
                      <p className="font-medium text-sm">{d.title}</p>
                      <p className="text-xs text-muted-foreground">{formatRange(d.start_date, d.end_date)}</p>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => deleteBlockedDate.mutate(d.id)}
                    disabled={deleteBlockedDate.isPending}
                  >
                    <Trash2 className="w-4 h-4 text-destructive" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="space-y-3">
          <p className="text-sm font-medium text-muted-foreground">
            Feriados nacionais e recesso forense ({globalDates.length} cadastrados)
          </p>
          <p className="text-xs text-muted-foreground">
            Já valem para todas as contas automaticamente — não é preciso cadastrar.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
