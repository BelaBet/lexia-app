import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { format, isPast, isToday, differenceInDays, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";
import {
  Publication,
  PublicationStatus,
  PipelineStage,
  PIPELINE_STAGES,
  useUpdatePublicationStage,
} from "@/hooks/usePublications";

const statusConfig: Record<PublicationStatus, { label: string; color: string }> = {
  pending: { label: "Pendente", color: "bg-yellow-500/10 text-yellow-600" },
  in_progress: { label: "Em Andamento", color: "bg-blue-500/10 text-blue-600" },
  completed: { label: "Concluído", color: "bg-green-500/10 text-green-600" },
  overdue: { label: "Atrasado", color: "bg-red-500/10 text-red-600" },
  cancelled: { label: "Cancelado", color: "bg-gray-500/10 text-gray-600" },
};

function deadlineBadge(date: string | null) {
  if (!date) return null;
  const d = parseISO(date);
  const label = format(d, "dd/MM/yyyy", { locale: ptBR });
  if (isPast(d) && !isToday(d)) return <span className="text-red-600 font-medium">{label}</span>;
  if (isToday(d)) return <span className="text-red-600 font-medium">{label} (hoje)</span>;
  if (differenceInDays(d, new Date()) <= 3) return <span className="text-orange-600 font-medium">{label}</span>;
  return <span>{label}</span>;
}

interface PublicationKanbanProps {
  publications: Publication[];
}

export function PublicationKanban({ publications }: PublicationKanbanProps) {
  const navigate = useNavigate();
  const updateStage = useUpdatePublicationStage();
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [targetStage, setTargetStage] = useState<PipelineStage | null>(null);
  const [optimisticStages, setOptimisticStages] = useState<Record<string, PipelineStage>>({});
  const lastDragEnd = useRef(0);

  useEffect(() => {
    setOptimisticStages((previous) => {
      const next = { ...previous };
      for (const pub of publications) {
        if (next[pub.id] === pub.pipeline_stage) delete next[pub.id];
      }
      return Object.keys(next).length === Object.keys(previous).length ? previous : next;
    });
  }, [publications]);

  const byStage = useMemo(() => {
    const map = new Map<PipelineStage, Publication[]>();
    for (const stage of PIPELINE_STAGES) map.set(stage.value, []);
    for (const pub of publications) {
      const stage = optimisticStages[pub.id] ?? pub.pipeline_stage;
      const list = map.get(stage);
      if (list) list.push(pub);
      else map.set(stage, [pub]);
    }
    return map;
  }, [publications, optimisticStages]);

  const movePublication = (id: string, stage: PipelineStage) => {
    const publication = publications.find((pub) => pub.id === id);
    if (!publication || updateStage.isPending || (optimisticStages[id] ?? publication.pipeline_stage) === stage) return;
    setOptimisticStages((previous) => ({ ...previous, [id]: stage }));
    updateStage.mutate({ id, pipeline_stage: stage }, {
      onError: () => {
        setOptimisticStages((previous) => {
          const next = { ...previous };
          delete next[id];
          return next;
        });
      },
    });
  };

  const finishDrag = () => {
    lastDragEnd.current = Date.now();
    setDraggedId(null);
    setTargetStage(null);
  };

  // Com colunas longas, a barra de rolagem nativa do quadro fica lá embaixo,
  // fora da tela. Esta barra fica presa no rodapé da janela e rola o quadro
  // junto (nos dois sentidos), para navegar por todas as colunas.
  const boardRef = useRef<HTMLDivElement>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const [scrollWidth, setScrollWidth] = useState(0);
  const [overflowing, setOverflowing] = useState(false);

  useEffect(() => {
    const board = boardRef.current;
    if (!board) return;
    const measure = () => {
      setScrollWidth(board.scrollWidth);
      setOverflowing(board.scrollWidth > board.clientWidth + 1);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(board);
    if (board.firstElementChild) observer.observe(board.firstElementChild);
    return () => observer.disconnect();
  }, [publications]);

  // Quadro e barra têm larguras visíveis diferentes, então a posição é
  // repassada proporcionalmente; só escreve quando muda, o que evita o
  // vai-e-volta entre os dois eventos de scroll.
  const syncScroll = (from: HTMLDivElement | null, to: HTMLDivElement | null) => {
    if (!from || !to) return;
    const fromMax = from.scrollWidth - from.clientWidth;
    const toMax = to.scrollWidth - to.clientWidth;
    const target = fromMax > 0 ? (from.scrollLeft / fromMax) * toMax : 0;
    if (Math.abs(to.scrollLeft - target) > 1) to.scrollLeft = target;
  };

  // Uma coluna (w-80 = 320px) + o espaço entre colunas (gap-4 = 16px).
  const scrollByColumn = (direction: 1 | -1) => {
    boardRef.current?.scrollBy({ left: direction * 336, behavior: "smooth" });
  };

  const scrollWhileDragging = (clientX: number) => {
    const board = boardRef.current;
    if (!board || !draggedId) return;
    const bounds = board.getBoundingClientRect();
    if (clientX < bounds.left + 48) board.scrollLeft -= 18;
    else if (clientX > bounds.right - 48) board.scrollLeft += 18;
  };

  return (
    <div>
    <p className="mb-3 text-xs text-muted-foreground">Arraste uma publicação para outra coluna ou altere a etapa pelo seletor do cartão.</p>
    <div
      ref={boardRef}
      onScroll={() => syncScroll(boardRef.current, barRef.current)}
      onDragOver={(event) => scrollWhileDragging(event.clientX)}
      className="overflow-x-auto pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
    <div className="flex w-max gap-4">
      {PIPELINE_STAGES.map((stage) => {
        const items = byStage.get(stage.value) || [];
        return (
          <div
            key={stage.value}
            className={cn("w-80 shrink-0 rounded-lg transition-colors", draggedId && targetStage === stage.value && "bg-primary/10 ring-2 ring-primary/40")}
            onDragEnter={(event) => {
              if (draggedId && !updateStage.isPending) {
                event.preventDefault();
                setTargetStage(stage.value);
              }
            }}
            onDragOver={(event) => {
              if (draggedId && !updateStage.isPending) {
                event.preventDefault();
                event.dataTransfer.dropEffect = "move";
              }
            }}
            onDragLeave={(event) => {
              if (!event.currentTarget.contains(event.relatedTarget as Node)) setTargetStage(null);
            }}
            onDrop={(event) => {
              event.preventDefault();
              if (draggedId) movePublication(draggedId, stage.value);
              finishDrag();
            }}
          >
            <div className="flex items-center justify-between mb-2 px-1">
              <p className="text-sm font-semibold">{stage.label}</p>
              <Badge variant="outline" className="text-xs">{items.length}</Badge>
            </div>
            <div className="space-y-2 min-h-[80px]">
              {items.map((pub) => (
                <Card
                  key={pub.id}
                  draggable={!updateStage.isPending}
                  onDragStart={(event) => {
                    event.dataTransfer.effectAllowed = "move";
                    event.dataTransfer.setData("text/plain", pub.id);
                    setDraggedId(pub.id);
                  }}
                  onDragEnd={finishDrag}
                  className={cn("hover:shadow-md transition-opacity cursor-grab active:cursor-grabbing", draggedId === pub.id && "opacity-50")}
                  onClick={() => {
                    if (Date.now() - lastDragEnd.current < 300) return;
                    navigate(`/publicacoes/${pub.id}`, { state: { from: "publications" } });
                  }}
                >
                  <CardContent className="p-3 space-y-2">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-sm font-medium truncate">
                        {pub.process_number || "Sem número"}
                      </span>
                      <Badge className={cn("text-[10px] border-0", statusConfig[pub.status].color)}>
                        {statusConfig[pub.status].label}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground line-clamp-2">{pub.content}</p>
                    {pub.external_deadline && (
                      <p className="text-[11px] text-muted-foreground">
                        Prazo externo: {deadlineBadge(pub.external_deadline)}
                      </p>
                    )}
                    <div onClick={(e) => e.stopPropagation()}>
                      <Select
                        value={optimisticStages[pub.id] ?? pub.pipeline_stage}
                        onValueChange={(value) => movePublication(pub.id, value as PipelineStage)}
                        disabled={updateStage.isPending}
                      >
                        <SelectTrigger className="h-7 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {PIPELINE_STAGES.map((s) => (
                            <SelectItem key={s.value} value={s.value} className="text-xs">{s.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </CardContent>
                </Card>
              ))}
              {items.length === 0 && (
                <p className="text-xs text-muted-foreground text-center py-6 border border-dashed rounded-lg">
                  Nenhuma publicação
                </p>
              )}
            </div>
          </div>
        );
      })}
    </div>
    </div>
      {overflowing && (
        <div className="sticky bottom-0 z-10 -mx-1 mt-2 flex items-center gap-2 rounded-lg border bg-background/95 px-2 py-1.5 shadow-sm backdrop-blur">
          <Button type="button" variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => scrollByColumn(-1)} aria-label="Coluna anterior">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <div
            ref={barRef}
            onScroll={() => syncScroll(barRef.current, boardRef.current)}
            className="h-3 min-w-0 flex-1 overflow-x-auto overflow-y-hidden [scrollbar-color:hsl(var(--muted-foreground)/0.45)_hsl(var(--muted))] [scrollbar-width:thin] [&::-webkit-scrollbar-thumb:hover]:bg-muted-foreground/70 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-muted-foreground/45 [&::-webkit-scrollbar-track]:rounded-full [&::-webkit-scrollbar-track]:bg-muted [&::-webkit-scrollbar]:h-2.5"
            aria-label="Rolar colunas do Kanban"
          >
            <div style={{ width: scrollWidth, height: 1 }} />
          </div>
          <Button type="button" variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => scrollByColumn(1)} aria-label="Próxima coluna">
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      )}
    </div>
  );
}
