import { useState } from "react";
import { Search, Loader2, ShieldCheck, Database } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { useJusbrasilCnj, JusbrasilCnjResponse } from "@/hooks/useJusbrasilCnj";

export function CnjSearchCard() {
  const [cnj, setCnj] = useState("");
  const [validatedCnj, setValidatedCnj] = useState<string | null>(null);
  const [result, setResult] = useState<JusbrasilCnjResponse | null>(null);
  const consultation = useJusbrasilCnj();

  const handleValidate = async () => {
    try {
      const data = await consultation.mutateAsync({ cnj, dryRun: true });
      setValidatedCnj(data.cnj);
      setResult(null);
      toast.success("CNJ validado. Você já pode consultar o processo.");
    } catch (error) {
      setValidatedCnj(null);
      setResult(null);
      toast.error(error instanceof Error ? error.message : "Não foi possível validar o CNJ");
    }
  };

  const handleConsult = async () => {
    if (!validatedCnj) return;
    try {
      const data = await consultation.mutateAsync({ cnj: validatedCnj, dryRun: false, confirmCharge: true });
      setResult(data);
      toast.success("Consulta concluída no JusBrasil.");
    } catch (error) {
      setResult(null);
      toast.error(error instanceof Error ? error.message : "Não foi possível consultar o processo");
    }
  };

  const dataText = result?.data ? JSON.stringify(result.data, null, 2) : "";

  return (
    <Card className="legal-card">
      <CardHeader className="pb-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle className="text-base">Consulta por número CNJ</CardTitle>
          <Badge variant="secondary" className="w-fit gap-1"><ShieldCheck className="h-3 w-3" /> JusBrasil conectado</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">Digite o número CNJ. A LEXIA valida primeiro sem cobrança e só consulta o JusBrasil quando você confirmar no segundo botão.</p>
        <div className="flex flex-col gap-3 sm:flex-row">
          <Input
            value={cnj}
            onChange={(event) => { setCnj(event.target.value); setValidatedCnj(null); setResult(null); }}
            onKeyDown={(event) => event.key === "Enter" && handleValidate()}
            placeholder="0000000-00.0000.0.00.0000"
            aria-label="Número CNJ do processo"
          />
          <Button onClick={handleValidate} disabled={consultation.isPending || !cnj.trim()} variant="outline" className="sm:w-44">
            {consultation.isPending && !validatedCnj ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ShieldCheck className="mr-2 h-4 w-4" />}
            Validar CNJ
          </Button>
        </div>

        {validatedCnj && !result && (
          <div className="rounded-lg border bg-muted/40 p-4 space-y-3">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="font-medium">CNJ válido:</span><code>{validatedCnj}</code><Badge variant="outline">sem cobrança até aqui</Badge>
            </div>
            <Button onClick={handleConsult} disabled={consultation.isPending}>
              {consultation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Search className="mr-2 h-4 w-4" />}
              Consultar processo no JusBrasil
            </Button>
            <p className="text-xs text-muted-foreground">Ao clicar em consultar, a LEXIA executa a consulta real do processo usando a integração central.</p>
          </div>
        )}

        {result && !result.dry_run && (
          <div className="rounded-lg border p-4 space-y-3">
            <div className="flex items-center gap-2"><Database className="h-4 w-4" /><span className="font-medium">Resultado da consulta</span><Badge variant="secondary">{result.cnj}</Badge></div>
            <div className="max-h-[520px] overflow-auto rounded-md bg-muted/40 p-3">
              <pre className="whitespace-pre-wrap break-words text-xs">{dataText || "Nenhum dado retornado."}</pre>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
