import { useState } from "react";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useCases } from "@/hooks/useCases";
import { useChecklistTemplates, useCreateChecklist, useCreateFromTemplate } from "@/hooks/useChecklists";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { FileText, Plus, Sparkles, LayoutTemplate } from "lucide-react";

const formSchema = z.object({
  title: z.string().min(1, "Título é obrigatório"),
  description: z.string().optional(),
  context: z.enum(["case", "client", "general"]),
  priority: z.enum(["low", "medium", "high", "urgent"]),
  due_date: z.string().optional(),
  case_id: z.string().optional(),
  client_name: z.string().optional(),
});

type FormData = z.infer<typeof formSchema>;

interface ChecklistDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ChecklistDialog({ open, onOpenChange }: ChecklistDialogProps) {
  const [mode, setMode] = useState<"new" | "template">("new");
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  const [templateDueDate, setTemplateDueDate] = useState("");
  const [templateCaseId, setTemplateCaseId] = useState("");
  const [templateClientName, setTemplateClientName] = useState("");

  const { data: cases = [] } = useCases();
  const { data: templates = [] } = useChecklistTemplates();
  const createChecklist = useCreateChecklist();
  const createFromTemplate = useCreateFromTemplate();

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      title: "",
      description: "",
      context: "general",
      priority: "medium",
      due_date: "",
      case_id: "",
      client_name: "",
    },
  });

  const context = form.watch("context");

  const onSubmit = async (data: FormData) => {
    await createChecklist.mutateAsync({
      title: data.title,
      description: data.description || null,
      context: data.context,
      priority: data.priority,
      due_date: data.due_date || null,
      case_id: data.context === "case" && data.case_id ? data.case_id : null,
      client_name: data.context === "client" ? data.client_name || null : null,
      status: "pending",
      template_id: null,
      completed_at: null,
      items: [],
    });
    form.reset();
    onOpenChange(false);
  };

  const handleCreateFromTemplate = async () => {
    if (!selectedTemplateId) return;
    
    await createFromTemplate.mutateAsync({
      templateId: selectedTemplateId,
      dueDate: templateDueDate || undefined,
      caseId: templateCaseId || undefined,
      clientName: templateClientName || undefined,
    });
    
    setSelectedTemplateId(null);
    setTemplateDueDate("");
    setTemplateCaseId("");
    setTemplateClientName("");
    onOpenChange(false);
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-primary" />
            Criar Novo Checklist
          </DialogTitle>
        </DialogHeader>

        <Tabs value={mode} onValueChange={(v) => setMode(v as "new" | "template")}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="new" className="gap-2">
              <Plus className="w-4 h-4" />
              Criar do Zero
            </TabsTrigger>
            <TabsTrigger value="template" className="gap-2">
              <LayoutTemplate className="w-4 h-4" />
              Usar Template
            </TabsTrigger>
          </TabsList>

          <TabsContent value="new" className="mt-4">
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <FormField
                  control={form.control}
                  name="title"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Título</FormLabel>
                      <FormControl>
                        <Input placeholder="Ex: Contestação - Prazo 15 dias" {...field} />
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
                          placeholder="Descreva o checklist..."
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
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
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
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
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

                {context === "case" && (
                  <FormField
                    control={form.control}
                    name="case_id"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Processo</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Selecione um processo" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {cases.map((c) => (
                              <SelectItem key={c.id} value={c.id}>
                                {c.case_number} - {c.title}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}

                {context === "client" && (
                  <FormField
                    control={form.control}
                    name="client_name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Nome do Cliente</FormLabel>
                        <FormControl>
                          <Input placeholder="Nome do cliente" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}

                <FormField
                  control={form.control}
                  name="due_date"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Data Limite (opcional)</FormLabel>
                      <FormControl>
                        <Input type="date" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="flex justify-end gap-2 pt-4">
                  <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                    Cancelar
                  </Button>
                  <Button type="submit" disabled={createChecklist.isPending}>
                    {createChecklist.isPending ? "Criando..." : "Criar Checklist"}
                  </Button>
                </div>
              </form>
            </Form>
          </TabsContent>

          <TabsContent value="template" className="mt-4 space-y-4">
            {templates.length === 0 ? (
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-8">
                  <LayoutTemplate className="w-12 h-12 text-muted-foreground mb-4" />
                  <p className="text-muted-foreground text-center">
                    Nenhum template encontrado.<br />
                    Crie um template na aba "Templates".
                  </p>
                </CardContent>
              </Card>
            ) : (
              <>
                <div className="grid gap-2 max-h-48 overflow-y-auto">
                  {templates.map((template) => (
                    <Card 
                      key={template.id}
                      className={`cursor-pointer transition-colors ${
                        selectedTemplateId === template.id 
                          ? "border-primary bg-primary/5" 
                          : "hover:bg-muted/50"
                      }`}
                      onClick={() => setSelectedTemplateId(template.id)}
                    >
                      <CardContent className="p-4">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <FileText className="w-4 h-4 text-muted-foreground" />
                            <span className="font-medium">{template.title}</span>
                          </div>
                          <Badge variant="secondary">
                            {template.items?.length || 0} itens
                          </Badge>
                        </div>
                        {template.description && (
                          <p className="text-sm text-muted-foreground mt-1">
                            {template.description}
                          </p>
                        )}
                      </CardContent>
                    </Card>
                  ))}
                </div>

                {selectedTemplateId && (
                  <div className="space-y-4 pt-4 border-t">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <label className="text-sm font-medium">Data Limite</label>
                        <Input 
                          type="date" 
                          value={templateDueDate}
                          onChange={(e) => setTemplateDueDate(e.target.value)}
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-sm font-medium">Processo (opcional)</label>
                        <Select value={templateCaseId} onValueChange={setTemplateCaseId}>
                          <SelectTrigger>
                            <SelectValue placeholder="Selecione" />
                          </SelectTrigger>
                          <SelectContent>
                            {cases.map((c) => (
                              <SelectItem key={c.id} value={c.id}>
                                {c.case_number}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Cliente (opcional)</label>
                      <Input 
                        placeholder="Nome do cliente"
                        value={templateClientName}
                        onChange={(e) => setTemplateClientName(e.target.value)}
                      />
                    </div>
                  </div>
                )}

                <div className="flex justify-end gap-2 pt-4">
                  <Button variant="outline" onClick={() => onOpenChange(false)}>
                    Cancelar
                  </Button>
                  <Button 
                    onClick={handleCreateFromTemplate}
                    disabled={!selectedTemplateId || createFromTemplate.isPending}
                  >
                    {createFromTemplate.isPending ? "Criando..." : "Criar a partir do Template"}
                  </Button>
                </div>
              </>
            )}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
