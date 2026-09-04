import { useState } from "react";
import { 
  useChecklistTemplates, 
  useDeleteTemplate,
  ChecklistTemplate 
} from "@/hooks/useChecklists";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { 
  Plus, 
  MoreVertical,
  Trash2,
  Edit,
  Copy,
  LayoutTemplate,
  RefreshCw
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { TemplateDialog } from "./TemplateDialog";

const recurrenceLabels = {
  none: "Sem recorrência",
  daily: "Diário",
  weekly: "Semanal",
  monthly: "Mensal",
  quarterly: "Trimestral",
  yearly: "Anual",
};

const contextLabels = {
  case: "Por Processo",
  client: "Por Cliente",
  general: "Geral",
};

export function TemplateList() {
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<ChecklistTemplate | null>(null);
  
  const { data: templates = [], isLoading } = useChecklistTemplates();
  const deleteTemplate = useDeleteTemplate();

  if (isLoading) {
    return (
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {[1, 2, 3].map((i) => (
          <Card key={i} className="animate-pulse">
            <CardContent className="p-6">
              <div className="h-6 bg-muted rounded w-1/2 mb-4" />
              <div className="h-4 bg-muted rounded w-3/4" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={() => setCreateDialogOpen(true)}>
          <Plus className="w-4 h-4 mr-2" />
          Novo Template
        </Button>
      </div>

      {templates.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <LayoutTemplate className="w-12 h-12 text-muted-foreground mb-4" />
            <p className="text-muted-foreground text-center">
              Nenhum template encontrado.<br />
              Crie templates para reutilizar checklists comuns.
            </p>
            <Button 
              className="mt-4" 
              onClick={() => setCreateDialogOpen(true)}
            >
              <Plus className="w-4 h-4 mr-2" />
              Criar Primeiro Template
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {templates.map((template) => (
            <Card key={template.id} className="hover:shadow-md transition-shadow">
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between">
                  <CardTitle className="text-lg flex items-center gap-2">
                    <LayoutTemplate className="w-5 h-5 text-primary" />
                    {template.title}
                  </CardTitle>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon">
                        <MoreVertical className="w-4 h-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => setEditingTemplate(template)}>
                        <Edit className="w-4 h-4 mr-2" />
                        Editar
                      </DropdownMenuItem>
                      <DropdownMenuItem>
                        <Copy className="w-4 h-4 mr-2" />
                        Duplicar
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem 
                        onClick={() => deleteTemplate.mutate(template.id)}
                        className="text-destructive"
                      >
                        <Trash2 className="w-4 h-4 mr-2" />
                        Excluir
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {template.description && (
                  <p className="text-sm text-muted-foreground line-clamp-2">
                    {template.description}
                  </p>
                )}
                
                <div className="flex flex-wrap gap-2">
                  <Badge variant="secondary">
                    {contextLabels[template.context]}
                  </Badge>
                  {template.recurrence !== 'none' && (
                    <Badge variant="outline" className="gap-1">
                      <RefreshCw className="w-3 h-3" />
                      {recurrenceLabels[template.recurrence]}
                    </Badge>
                  )}
                  <Badge variant="outline">
                    {template.items?.length || 0} itens
                  </Badge>
                </div>

                {template.category && (
                  <p className="text-xs text-muted-foreground">
                    Categoria: {template.category}
                  </p>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <TemplateDialog 
        open={createDialogOpen || !!editingTemplate} 
        onOpenChange={(open) => {
          if (!open) {
            setCreateDialogOpen(false);
            setEditingTemplate(null);
          }
        }}
        template={editingTemplate}
      />
    </div>
  );
}
