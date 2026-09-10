import { useState } from "react";
import { Search, Loader2, ShieldCheck } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { useJusbrasilCnj, JusbrasilCnjResponse } from "@/hooks/useJusbrasilCnj";

export function CnjSearchCard() {
  const [cnj, setCnj] = useState("");
  const [result, setResult] = useState<JusbrasilCnjResponse | null>(null);
  const consultation = useJusbrasilCnj();

  const handleValidate = async () => {
    try {
      const data = await consultation.mutateAsync({ cnj, dryRun: true });
      setResult(data);
      toast.success("CNJ validado sem consumir créditos do JusBrasil.");
    } catch (error) {
      setResult(null);
      toast.error(error instanceof Error ? error.message : "Não foi possível validar o CNJ");
    }
  };

  return (
    <Card className="legal-card">
      <CardHeader className="pb-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle className="text-base">Consulta por número CNJ</CardTitle>
          <Badge variant="secondary" className="w-fit gap-1">
            <ShieldCheck className="h-3 w-3" /> Modo seguro
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Valide o número do processo e prepare a consulta ao JusBrasil. Nesta etapa nenhuma consulta paga é executada.
        </p>
        <div className="flex flex-col gap-3 sm:flex-row">
          <Input
            value={cnj}
            onChange={(event) => setCnj(event.target.value)}
            onKeyDown={(event) => event.key === "Enter" && handleValidate()}
            placeholder="0000000-00.0000.0.00.0000"
            aria-label="Número CNJ do processo"
          />
          <Button onClick={handleValidate} disabled={consultation.isPending || !cnj.trim()} className="sm:w-44">
            {consultation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Search className="mr-2 h-4 w-4" />}
            Validar CNJ
          </Button>
        </div>

        {result?.dry_run && (
          <div className="rounded-lg border bg-muted/40 p-3 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium">CNJ validado:</span>
              <code>{result.cnj}</code>
              <Badge variant="outline">sem cobrança</Badge>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              {result.message ?? "Pré-validação concluída. Nenhuma chamada ao JusBrasil foi executada."}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
