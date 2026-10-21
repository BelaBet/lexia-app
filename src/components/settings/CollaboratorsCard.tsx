import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Users, UserPlus, X } from "lucide-react";
import { useCaseCollaborators, useRemoveCaseCollaborator } from "@/hooks/useCaseCollaborators";
import { InviteCollaboratorDialog } from "@/components/settings/InviteCollaboratorDialog";

// Agrupa os vínculos de case_collaborators por colaborador, para listar
// "Fulano — 3 processos" em vez de uma linha solta por processo.
export function CollaboratorsCard() {
  const { data: rows = [] } = useCaseCollaborators();
  const removeAccess = useRemoveCaseCollaborator();
  const [inviteOpen, setInviteOpen] = useState(false);

  const byCollaborator = new Map<string, { name: string; items: typeof rows }>();
  for (const row of rows) {
    const key = row.collaborator_user_id;
    const entry = byCollaborator.get(key) ?? { name: row.collaborator_full_name || "Colaborador", items: [] };
    entry.items.push(row);
    byCollaborator.set(key, entry);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Users className="w-5 h-5" />
          Colaboradores
        </CardTitle>
        <CardDescription>
          Dê a outro advogado ou estagiário acesso a processos específicos — ele só verá os processos atribuídos.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {byCollaborator.size === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhum colaborador adicionado ainda.</p>
        ) : (
          <div className="space-y-3">
            {[...byCollaborator.entries()].map(([userId, entry]) => (
              <div key={userId} className="rounded-lg border p-3">
                <p className="font-medium text-sm">{entry.name}</p>
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {entry.items.map((item) => (
                    <Badge key={item.id} variant="secondary" className="gap-1 pr-1">
                      {item.case?.title || item.case?.case_number || "Processo"}
                      <button
                        type="button"
                        onClick={() => removeAccess.mutate(item.id)}
                        className="ml-1 rounded-full hover:bg-muted-foreground/20 p-0.5"
                        title="Remover acesso a este processo"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
        <Button variant="outline" className="w-full" onClick={() => setInviteOpen(true)}>
          <UserPlus className="w-4 h-4 mr-2" />
          Convidar colaborador
        </Button>
      </CardContent>
      <InviteCollaboratorDialog open={inviteOpen} onOpenChange={setInviteOpen} />
    </Card>
  );
}
