import { useChecklists } from "@/hooks/useChecklists";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { 
  CheckCircle2, 
  Clock, 
  AlertTriangle, 
  ListChecks,
  TrendingUp,
  Calendar
} from "lucide-react";
import { format, startOfMonth, endOfMonth, isWithinInterval, isPast, isToday, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";

export function ChecklistStats() {
  const { data: checklists = [], isLoading } = useChecklists();

  if (isLoading) {
    return (
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {[1, 2, 3, 4].map((i) => (
          <Card key={i} className="animate-pulse">
            <CardContent className="p-6">
              <div className="h-8 bg-muted rounded w-1/2 mb-2" />
              <div className="h-12 bg-muted rounded w-3/4" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  const now = new Date();
  const monthStart = startOfMonth(now);
  const monthEnd = endOfMonth(now);

  // Stats calculations
  const total = checklists.length;
  const completed = checklists.filter(c => c.status === 'completed').length;
  const pending = checklists.filter(c => c.status === 'pending' || c.status === 'in_progress').length;
  const overdue = checklists.filter(c => {
    if (c.status === 'completed' || c.status === 'cancelled') return false;
    if (!c.due_date) return false;
    // due_date é uma coluna DATE (sem timezone) — parseISO evita que o dia
    // mude por causa do fuso horário local (Brasil é UTC-3, então
    // `new Date("2026-09-05")` vira 04/09 à noite aqui).
    return isPast(parseISO(c.due_date)) && !isToday(parseISO(c.due_date));
  }).length;

  const thisMonth = checklists.filter(c => {
    if (!c.created_at) return false;
    return isWithinInterval(new Date(c.created_at), { start: monthStart, end: monthEnd });
  });

  const completedThisMonth = thisMonth.filter(c => c.status === 'completed').length;
  const completionRate = total > 0 ? Math.round((completed / total) * 100) : 0;

  // Upcoming deadlines (next 7 days)
  const upcomingDeadlines = checklists
    .filter(c => {
      if (c.status === 'completed' || c.status === 'cancelled') return false;
      if (!c.due_date) return false;
      const dueDate = parseISO(c.due_date);
      const in7Days = new Date();
      in7Days.setDate(in7Days.getDate() + 7);
      return dueDate >= now && dueDate <= in7Days;
    })
    .sort((a, b) => parseISO(a.due_date!).getTime() - parseISO(b.due_date!).getTime())
    .slice(0, 5);

  // By priority
  const byPriority = {
    urgent: checklists.filter(c => c.priority === 'urgent' && c.status !== 'completed').length,
    high: checklists.filter(c => c.priority === 'high' && c.status !== 'completed').length,
    medium: checklists.filter(c => c.priority === 'medium' && c.status !== 'completed').length,
    low: checklists.filter(c => c.priority === 'low' && c.status !== 'completed').length,
  };

  return (
    <div className="space-y-6">
      {/* Main stats cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total de Checklists
            </CardTitle>
            <ListChecks className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{total}</div>
            <p className="text-xs text-muted-foreground">
              {thisMonth.length} criados este mês
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Concluídos
            </CardTitle>
            <CheckCircle2 className="w-4 h-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{completed}</div>
            <p className="text-xs text-muted-foreground">
              {completedThisMonth} este mês
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Pendentes
            </CardTitle>
            <Clock className="w-4 h-4 text-yellow-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-yellow-600">{pending}</div>
            <p className="text-xs text-muted-foreground">
              {byPriority.urgent + byPriority.high} de alta prioridade
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Atrasados
            </CardTitle>
            <AlertTriangle className="w-4 h-4 text-red-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">{overdue}</div>
            <p className="text-xs text-muted-foreground">
              Necessitam atenção imediata
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Completion rate & Priority breakdown */}
      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-primary" />
              Taxa de Conclusão
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-end gap-4">
              <div className="text-4xl font-bold">{completionRate}%</div>
              <div className="text-sm text-muted-foreground pb-1">
                {completed} de {total} checklists
              </div>
            </div>
            <Progress value={completionRate} className="h-3" />
            <div className="grid grid-cols-2 gap-4 pt-2">
              <div className="text-center p-3 rounded-lg bg-green-500/10">
                <div className="text-lg font-semibold text-green-600">{completed}</div>
                <div className="text-xs text-muted-foreground">Concluídos</div>
              </div>
              <div className="text-center p-3 rounded-lg bg-yellow-500/10">
                <div className="text-lg font-semibold text-yellow-600">{pending}</div>
                <div className="text-xs text-muted-foreground">Em andamento</div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calendar className="w-5 h-5 text-primary" />
              Próximos Prazos
            </CardTitle>
          </CardHeader>
          <CardContent>
            {upcomingDeadlines.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">
                Nenhum prazo nos próximos 7 dias
              </p>
            ) : (
              <div className="space-y-3">
                {upcomingDeadlines.map((checklist) => (
                  <div 
                    key={checklist.id}
                    className="flex items-center justify-between p-3 rounded-lg bg-muted/50"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm truncate">{checklist.title}</p>
                      {checklist.client_name && (
                        <p className="text-xs text-muted-foreground">{checklist.client_name}</p>
                      )}
                    </div>
                    <div className="text-sm font-medium text-primary">
                      {format(parseISO(checklist.due_date!), "dd/MM", { locale: ptBR })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Priority breakdown */}
      <Card>
        <CardHeader>
          <CardTitle>Distribuição por Prioridade (Pendentes)</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-4 gap-4">
            <div className="text-center p-4 rounded-lg bg-red-500/10">
              <div className="text-2xl font-bold text-red-600">{byPriority.urgent}</div>
              <div className="text-sm text-muted-foreground">Urgente</div>
            </div>
            <div className="text-center p-4 rounded-lg bg-orange-500/10">
              <div className="text-2xl font-bold text-orange-600">{byPriority.high}</div>
              <div className="text-sm text-muted-foreground">Alta</div>
            </div>
            <div className="text-center p-4 rounded-lg bg-blue-500/10">
              <div className="text-2xl font-bold text-blue-600">{byPriority.medium}</div>
              <div className="text-sm text-muted-foreground">Média</div>
            </div>
            <div className="text-center p-4 rounded-lg bg-slate-500/10">
              <div className="text-2xl font-bold text-slate-600">{byPriority.low}</div>
              <div className="text-sm text-muted-foreground">Baixa</div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
