import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { 
  useCreateTemplate, 
  useUpdateTemplate,
  ChecklistTemplate,
  ChecklistTemplateItem
} from "@/hooks/useChecklists";
import { supabase } from "@/integrations/supabase/client";
import { Plus, Trash2, GripVertical, Sparkles, Loader2 } from "lucide-react";
import { toast } from "sonner";

const formSchema = z.object({
  title: z.string().min(1, "Título é obrigatório"),
  description: z.string().optional(),
  context: z.enum(["case", "client", "general"]),
  category: z.string().optional(),
  priority: z.enum(["low", "medium", "high", "urgent"]),
  recurrence: z.enum(["none", "daily", "weekly", "monthly", "quarterly", "yearly"]),
  recurrence_day: z.number().optional(),
});

type FormData = z.infer<typeof formSchema>;

interface TemplateItem {
  id?: string;
  title: string;
  description: string;
  days_before_deadline: number;
  is_required: boolean;
}

interface TemplateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  template?: ChecklistTemplate | null;
}

export function TemplateDialog({ open, onOpenChange, template }: TemplateDialogProps) {
  const [items, setItems] = useState<TemplateItem[]>([]);
  const [newItemTitle, setNewItemTitle] = useState("");
  const [isLoadingAI, setIsLoadingAI] = useState(false);

  const createTemplate = useCreateTemplate();
  const updateTemplate = useUpdateTemplate();

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      title: "",
      description: "",
      context: "general",
      category: "",
      priority: "medium",
      recurrence: "none",
    },
  });

  useEffect(() => {
    if (template) {
      form.reset({
        title: template.title,
        description: template.description || "",
        context: template.context,
        category: template.category || "",
        priority: template.priority,
        recurrence: template.recurrence,
        recurrence_day: template.recurrence_day || undefined,
      });
      setItems(
        template.items?.map((item) => ({
          id: item.id,
          title: item.title,
          description: item.description || "",
          days_before_deadline: item.days_before_deadline || 0,
          is_required: item.is_required,
        })) || []
      );
    } else {
      form.reset({
        title: "",
        description: "",
        context: "general",
        category: "",
        priority: "medium",
        recurrence: "none",
      });
      setItems([]);
    }
  }, [template, form]);

  const onSubmit = async (data: FormData) => {
    if (template) {
      await updateTemplate.mutateAsync({
        id: template.id,
        ...data,
        recurrence_day: data.recurrence_day ?? null,
      });
    } else {
      await createTemplate.mutateAsync({
        title: data.title,
        context: data.context,
        priority: data.priority,
        recurrence: data.recurrence,
        description: data.description || null,
        category: data.category || null,
        recurrence_day: data.recurrence_day ?? null,
        is_active: true,
        items: items.map((item, index) => ({
          title: item.title,
          description: item.description || null,
          order_index: index,
          days_before_deadline: item.days_before_deadline,
          is_required: item.is_required,
        })),
      });
    }
    onOpenChange(false);
  };

  const handleAddItem = () => {
    if (!newItemTitle.trim()) return;
    setItems([
      ...items,
      {
        title: newItemTitle.trim(),
        description: "",
        days_before_deadline: 0,
        is_required: true,
      },
    ]);
    setNewItemTitle("");
  };

  const handleRemoveItem = (index: number) => {
    setItems(items.filter((_, i) => i !== index));
  };

  const handleGetSuggestions = async () => {
    const formValues = form.getValues();
    
    setIsLoadingAI(true);
    try {
      const { data, error } = await supabase.functions.invoke('suggest-checklist-items', {
        body: {
          context: formValues.context,
          existingItems: items.map(i => i.title),
        },
      });

      if (error) throw error;
      
      if (data?.suggestions) {
        const newItems = (data.suggestions as Array<{
          title: string;
          description?: string;
          days_before_deadline?: number;
          is_required?: boolean;
        }>).map((s) => ({
          title: s.title,
          description: s.description || "",
          days_before_deadline: s.days_before_deadline || 0,
          is_required: s.is_required ?? true,
        }));
        setItems([...items, ...newItems]);
        toast.success(`${data.suggestions.length} sugestões adicionadas!`);
      }
    } catch (error) {
      console.error("Error getting suggestions:", error);
      toast.error("Erro ao obter sugestões da IA");
    } finally {
      setIsLoadingAI(false);
    }
  };

  const contextOptions = [
    { value: "general", label: "Obrigação Geral" },
    { value: "case", label: "Por Processo" },
    { value: "client", label: "Por Cliente" },
  ];

  const priorityOptions = [
    { value: "low", label: "Baixa" },
    { value: "medium", label: "Média" },
    { value: "high", label: "Alta" },
    { value: "urgent", label: "Urgente" },
  ];

  const recurrenceOptions = [
    { value: "none", label: "Sem recorrência" },
    { value: "daily", label: "Diário" },
    { value: "weekly", label: "Semanal" },
    { value: "monthly", label: "Mensal" },
    { value: "quarterly", label: "Trimestral" },
    { value: "yearly", label: "Anual" },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {template ? "Editar Template" : "Criar Novo Template"}
          </DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="title"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Título</FormLabel>
                  <FormControl>
                    <Input placeholder="Ex: Prazo de Contestação" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Descrição (opcional)</FormLabel>
                  <FormControl>
                    <Textarea 
                      placeholder="Descreva o template..."
                      {...field} 
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="context"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Contexto</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Selecione" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {contextOptions.map((opt) => (
                          <SelectItem key={opt.value} value={opt.value}>
                            {opt.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="priority"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Prioridade</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Selecione" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {priorityOptions.map((opt) => (
                          <SelectItem key={opt.value} value={opt.value}>
                            {opt.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="category"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Categoria (opcional)</FormLabel>
                    <FormControl>
                      <Input placeholder="Ex: Trabalhista, Cível" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="recurrence"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Recorrência</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Selecione" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {recurrenceOptions.map((opt) => (
                          <SelectItem key={opt.value} value={opt.value}>
                            {opt.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* Items Section */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <FormLabel>Itens do Template</FormLabel>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleGetSuggestions}
                  disabled={isLoadingAI}
                >
                  {isLoadingAI ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <Sparkles className="w-4 h-4 mr-2" />
                  )}
                  Sugerir com IA
                </Button>
              </div>

              <div className="flex gap-2">
                <Input
                  placeholder="Adicionar item..."
                  value={newItemTitle}
                  onChange={(e) => setNewItemTitle(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddItem())}
                />
                <Button type="button" onClick={handleAddItem} disabled={!newItemTitle.trim()}>
                  <Plus className="w-4 h-4" />
                </Button>
              </div>

              <div className="space-y-2 max-h-48 overflow-y-auto">
                {items.map((item, index) => (
                  <div
                    key={index}
                    className="flex items-center gap-2 p-2 rounded-lg border bg-card"
                  >
                    <GripVertical className="w-4 h-4 text-muted-foreground cursor-grab" />
                    <Checkbox
                      checked={item.is_required}
                      onCheckedChange={(checked) => {
                        const newItems = [...items];
                        newItems[index].is_required = !!checked;
                        setItems(newItems);
                      }}
                    />
                    <span className="flex-1 text-sm">{item.title}</span>
                    <Input
                      type="number"
                      className="w-20 h-8"
                      placeholder="Dias"
                      value={item.days_before_deadline || ""}
                      onChange={(e) => {
                        const newItems = [...items];
                        newItems[index].days_before_deadline = parseInt(e.target.value) || 0;
                        setItems(newItems);
                      }}
                    />
                    <span className="text-xs text-muted-foreground">dias antes</span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => handleRemoveItem(index)}
                    >
                      <Trash2 className="w-4 h-4 text-destructive" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-4">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancelar
              </Button>
              <Button 
                type="submit" 
                disabled={createTemplate.isPending || updateTemplate.isPending}
              >
                {createTemplate.isPending || updateTemplate.isPending 
                  ? "Salvando..." 
                  : template ? "Salvar" : "Criar Template"}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
