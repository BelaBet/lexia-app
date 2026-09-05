import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { 
  useChecklist, 
  useUpdateChecklistItem, 
  useAddChecklistItem,
  useDeleteChecklistItem,
  ChecklistItem
} from "@/hooks/useChecklists";
import { supabase } from "@/integrations/supabase/client";
import { 
  Plus, 
  Trash2, 
  Sparkles, 
  Loader2,
  Calendar,
  GripVertical
} from "lucide-react";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface ChecklistDetailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  checklistId: string;
}

interface AISuggestion {
  title: string;
  description: string;
  priority: string;
  days_before_deadline?: number;
  is_required: boolean;
}

export function ChecklistDetailDialog({ 
  open, 
  onOpenChange, 
  checklistId 
}: ChecklistDetailDialogProps) {
  const [newItemTitle, setNewItemTitle] = useState("");
  const [isLoadingAI, setIsLoadingAI] = useState(false);
  const [suggestions, setSuggestions] = useState<AISuggestion[]>([]);

  const { data: checklist, isLoading } = useChecklist(checklistId);
  const updateItem = useUpdateChecklistItem();
  const addItem = useAddChecklistItem();
  const deleteItem = useDeleteChecklistItem();

  const getProgress = () => {
    if (!checklist?.items?.length) return 0;
    const completed = checklist.items.filter(item => item.is_completed).length;
    return Math.round((completed / checklist.items.length) * 100);
  };

  const handleToggleItem = (item: ChecklistItem) => {
    updateItem.mutate({
      id: item.id,
      is_completed: !item.is_completed,
    });
  };

  const handleAddItem = () => {
    if (!newItemTitle.trim()) return;
    
    addItem.mutate({
      checklist_id: checklistId,
      title: newItemTitle.trim(),
      description: null,
      order_index: checklist?.items?.length || 0,
      is_required: true,
      is_completed: false,
      completed_at: null,
      due_date: null,
      notes: null,
    });
    setNewItemTitle("");
  };

  const handleAddSuggestion = (suggestion: AISuggestion) => {
    addItem.mutate({
      checklist_id: checklistId,
      title: suggestion.title,
      description: suggestion.description,
      order_index: checklist?.items?.length || 0,
      is_required: suggestion.is_required,
      is_completed: false,
      completed_at: null,
      due_date: null,
      notes: null,
    });
    setSuggestions(prev => prev.filter(s => s.title !== suggestion.title));
    toast.success("Item adicionado!");
  };

  const handleGetSuggestions = async () => {
    if (!checklist) return;
    
    setIsLoadingAI(true);
    try {
      const { data, error } = await supabase.functions.invoke('suggest-checklist-items', {
        body: {
          context: checklist.context,
          caseType: checklist.case?.title,
          clientInfo: checklist.client_name,
          existingItems: checklist.items?.map(i => i.title) || [],
        },
      });

      if (error) throw error;
      
      if (data?.suggestions) {
        setSuggestions(data.suggestions);
        toast.success(`${data.suggestions.length} sugestões encontradas!`);
      }
    } catch (error) {
      console.error("Error getting suggestions:", error);
      toast.error("Erro ao obter sugestões da IA");
    } finally {
      setIsLoadingAI(false);
    }
  };

  const priorityConfig = {
    low: { label: "Baixa", color: "bg-slate-500/10 text-slate-600" },
    medium: { label: "Média", color: "bg-blue-500/10 text-blue-600" },
    high: { label: "Alta", color: "bg-orange-500/10 text-orange-600" },
    urgent: { label: "Urgente", color: "bg-red-500/10 text-red-600" },
  };

  if (isLoading || !checklist) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent>
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  const sortedItems = [...(checklist.items || [])].sort((a, b) => {
    if (a.is_completed !== b.is_completed) return a.is_completed ? 1 : -1;
    return a.order_index - b.order_index;
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between">
            <span>{checklist.title}</span>
            <Badge className={priorityConfig[checklist.priority].color}>
              {priorityConfig[checklist.priority].label}
            </Badge>
          </DialogTitle>
          {checklist.description && (
            <p className="text-sm text-muted-foreground">{checklist.description}</p>
          )}
        </DialogHeader>

        <div className="space-y-4">
          {/* Progress */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Progresso</span>
              <span className="font-medium">{getProgress()}%</span>
            </div>
            <Progress value={getProgress()} className="h-2" />
          </div>

          {/* Meta info */}
          <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
            {checklist.due_date && (
              <div className="flex items-center gap-1">
                <Calendar className="w-4 h-4" />
                Prazo: {format(parseISO(checklist.due_date), "dd/MM/yyyy", { locale: ptBR })}
              </div>
            )}
            {checklist.case && (
              <div>Processo: {checklist.case.case_number}</div>
            )}
            {checklist.client_name && (
              <div>Cliente: {checklist.client_name}</div>
            )}
          </div>

          <Separator />

          {/* AI Suggestions Button */}
          <Button 
            variant="outline" 
            className="w-full gap-2"
            onClick={handleGetSuggestions}
            disabled={isLoadingAI}
          >
            {isLoadingAI ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Sparkles className="w-4 h-4 text-primary" />
            )}
            {isLoadingAI ? "Obtendo sugestões..." : "Sugerir itens com IA"}
          </Button>

          {/* AI Suggestions */}
          {suggestions.length > 0 && (
            <div className="space-y-2">
              <p className="text-sm font-medium text-primary">Sugestões da IA:</p>
              <div className="space-y-2">
                {suggestions.map((suggestion, index) => (
                  <div 
                    key={index}
                    className="flex items-start gap-3 p-3 rounded-lg bg-primary/5 border border-primary/10"
                  >
                    <div className="flex-1">
                      <p className="font-medium text-sm">{suggestion.title}</p>
                      <p className="text-xs text-muted-foreground">{suggestion.description}</p>
                    </div>
                    <Button 
                      size="sm" 
                      onClick={() => handleAddSuggestion(suggestion)}
                    >
                      <Plus className="w-4 h-4" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Add new item */}
          <div className="flex gap-2">
            <Input
              placeholder="Adicionar novo item..."
              value={newItemTitle}
              onChange={(e) => setNewItemTitle(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAddItem()}
            />
            <Button onClick={handleAddItem} disabled={!newItemTitle.trim()}>
              <Plus className="w-4 h-4" />
            </Button>
          </div>

          {/* Items list */}
          <div className="space-y-2">
            {sortedItems.length === 0 ? (
              <p className="text-center text-muted-foreground py-4">
                Nenhum item no checklist. Adicione itens ou use a IA para sugestões.
              </p>
            ) : (
              sortedItems.map((item) => (
                <div
                  key={item.id}
                  className={cn(
                    "flex items-start gap-3 p-3 rounded-lg border transition-colors",
                    item.is_completed ? "bg-muted/50 border-muted" : "bg-card"
                  )}
                >
                  <GripVertical className="w-4 h-4 text-muted-foreground mt-0.5 cursor-grab" />
                  <Checkbox
                    checked={item.is_completed}
                    onCheckedChange={() => handleToggleItem(item)}
                  />
                  <div className="flex-1 min-w-0">
                    <p className={cn(
                      "font-medium text-sm",
                      item.is_completed && "line-through text-muted-foreground"
                    )}>
                      {item.title}
                    </p>
                    {item.description && (
                      <p className="text-xs text-muted-foreground mt-1">
                        {item.description}
                      </p>
                    )}
                    {item.due_date && (
                      <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                        <Calendar className="w-3 h-3" />
                        {format(parseISO(item.due_date), "dd/MM/yyyy", { locale: ptBR })}
                      </p>
                    )}
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-muted-foreground hover:text-destructive"
                    onClick={() => deleteItem.mutate(item.id)}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              ))
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
