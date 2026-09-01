import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Plus,
  FileSearch,
  Loader2,
  MoreVertical,
  Trash2,
  Eye,
  Pencil,
  Gavel,
  Scale,
} from "lucide-react";
import { format, isPast, isToday, differenceInDays } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";
import {
  usePublications,
  useDeletePublication,
  Publication,
  PublicationStatus,
} from "@/hooks/usePublications";
import { PublicationDialog } from "./PublicationDialog";
import { PublicationDetailDialog } from "./PublicationDetailDialog";

const statusConfig: Record<PublicationStatus, { label: string; color: string }> = {
  pending: { label: "Pendente", color: "bg-yellow-500/10 text-yellow-600" },
  in_progress: { label: "Em Andamento", color: "bg-blue-500/10 text-blue-600" },
  completed: { label: "Concluído", color: "bg-green-500/10 text-green-600" },
  overdue: { label: "Atrasado", color: "bg-red-500/10 text-red-600" },
  cancelled: { label: "Cancelado", color: "bg-gray-500/10 text-gray-600" },
};

const sourceLabels: Record<string, string> = {
  manual: "Manual",
  jusbrasil: "JusBrasil",
  webjur: "WebJur",
  escavador: "Escavador",
  outro: "Outro",
};

function deadlineBadge(date: string | null) {
  if (!date) return null;
  const d = new Date(date);
  const days = differenceInDays(d, new Date());
  const label = format(d, "dd/MM/yyyy", { locale: ptBR });

  if (isPast(d) && !isToday(d)) {
    return <span className="text-red-600 font-medium">{label} (atrasado)</span>;
  }
  if (isToday(d)) {
    return <span className="text-red-600 font-medium">{label} (hoje)</span>;
  }
  if (days <= 3) {
    return <span className="text-orange-600 font-medium">{label}</span>;
  }
  return <span>{label}</span>;
}

export function PublicationsManager() {
  const [statusFilter, setStatusFilter] = useState<PublicationStatus | "all">("all");
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<Publication | null>(null);
  const [viewing, setViewing] = useState<Publication | null>(null);

  const { data: publications = [], isLoading } = usePublications(
    statusFilter !== "all" ? { status: statusFilter } : undefined
  );
  const deletePublication = useDeletePublication();

  const sorted = useMemo(() => publications, [publications]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="font-serif text-3xl font-bold text-foreground">Rastreamento de Publicações</h1>
          <p className="text-muted-foreground mt-1">
            Publicações do Diário, prazos internos/externos, followups e teses
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)} className="gap-2">
          <Plus className="w-4 h-4" /> Nova Publicação
        </Button>
      </div>

      <div className="flex items-center gap-3">
        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as PublicationStatus | "all")}>
          <SelectTrigger className="w-[200px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os status</SelectItem>
            <SelectItem value="pending">Pendente</SelectItem>
            <SelectItem value="in_progress">Em Andamento</SelectItem>
            <SelectItem value="completed">Concluído</SelectItem>
            <SelectItem value="overdue">Atrasado</SelectItem>
            <SelectItem value="cancelled">Cancelado</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : sorted.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <FileSearch className="w-10 h-10 text-muted-foreground mb-3" />
            <p className="font-medium">Nenhuma publicação cadastrada</p>
            <p className="text-sm text-muted-foreground mt-1 max-w-sm">
              Cadastre publicações manualmente para acompanhar prazos internos e externos, followups e teses.
            </p>
            <Button className="mt-4 gap-2" onClick={() => setCreateOpen(true)}>
              <Plus className="w-4 h-4" /> Nova Publicação
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {sorted.map((pub) => (
            <Card key={pub.id} className="hover:shadow-md transition-shadow">
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1 cursor-pointer" onClick={() => setViewing(pub)}>
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className="font-medium truncate">
                        {pub.process_number || "Sem número de processo"}
                      </span>
                      <Badge variant="outline" className="text-xs">{sourceLabels[pub.source]}</Badge>
                      <Badge className={cn("text-xs border-0", statusConfig[pub.status].color)}>
                        {statusConfig[pub.status].label}
                      </Badge>
                      {pub.imported_automatically && (
                        <Badge variant="outline" className="text-xs border-blue-500/30 text-blue-600">
                          Importado automaticamente
                        </Badge>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground line-clamp-2">{pub.content}</p>
                    <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground flex-wrap">
                      {pub.external_deadline && (
                        <span className="flex items-center gap-1">
                          <Gavel className="w-3.5 h-3.5" /> Externo: {deadlineBadge(pub.external_deadline)}
                        </span>
                      )}
                      {pub.internal_deadline && (
                        <span className="flex items-center gap-1">
                          <Scale className="w-3.5 h-3.5" /> Interno: {deadlineBadge(pub.internal_deadline)}
                        </span>
                      )}
                    </div>
                  </div>

                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="shrink-0" aria-label="Mais opções">
                        <MoreVertical className="w-4 h-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => setViewing(pub)}>
                        <Eye className="w-4 h-4 mr-2" /> Ver detalhes
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => setEditing(pub)}>
                        <Pencil className="w-4 h-4 mr-2" /> Editar
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        className="text-destructive"
                        onClick={() => {
                          if (confirm("Tem certeza que deseja excluir esta publicação?")) {
                            deletePublication.mutate(pub.id);
                          }
                        }}
                      >
                        <Trash2 className="w-4 h-4 mr-2" /> Excluir
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <PublicationDialog open={createOpen} onOpenChange={setCreateOpen} />
      <PublicationDialog open={!!editing} onOpenChange={(open) => !open && setEditing(null)} publication={editing} />
      <PublicationDetailDialog publication={viewing} onOpenChange={(open) => !open && setViewing(null)} />
    </div>
  );
}
