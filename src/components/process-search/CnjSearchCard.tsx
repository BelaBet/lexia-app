import { useMemo, useState } from "react";
import { Search, Loader2, ShieldCheck, Database, ChevronDown, ChevronUp } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { useJusbrasilCnj, JusbrasilCnjResponse } from "@/hooks/useJusbrasilCnj";

type AnyRecord = Record<string, unknown>;

function asRecord(value: unknown): AnyRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? value as AnyRecord : {};
}

function text(value: unknown): string {
  if (value == null) return "—";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return value.map((item) => typeof item === "object" ? (asRecord(item).nome ?? asRecord(item).name ?? asRecord(item).descricao ?? "") : item).filter(Boolean).join(", ") || "—";
  const obj = asRecord(value);
  return String(obj.nome ?? obj.name ?? obj.sigla ?? obj.descricao ?? "—");
}

function getFirst(obj: AnyRecord, keys: string[]): unknown {
  for (const key of keys) if (obj[key] != null) return obj[key];
  return undefined;
}

function ResultSummary({ data, cnj }: { data: unknown; cnj: string }) {
  const [showRaw, setShowRaw] = useState(false);
  const record = asRecord(data);
  const parties = getFirst(record, ["partes", "parties", "envolvidos"]);
  const movements = getFirst(record, ["movimentacoes", "movements", "andamentos"]);
  const tribunal = getFirst(record, ["tribunal", "tribunal_nome", "court"]);
  const location = getFirst(record, ["comarca", "foro", "local", "orgao_julgador"]);
  const subject = getFirst(record, ["assunto", "assuntos", "subject", "classe"]);
  const status = getFirst(record, ["status", "situacao", "status_processual"]);

  const movementItems = Array.isArray(movements) ? movements.slice(0, 8) : [];
  const rawPreview = useMemo(() => {
    if (!showRaw) return "";
    try {
      const serialized = JSON.stringify(data, null, 2);
      return serialized.length > 50000 ? `${serialized.slice(0, 50000)}\n\n… resposta truncada na tela para manter a LEXIA estável.` : serialized;
    } catch {
      return "Não foi possível exibir o JSON bruto.";
    }
  }, [data, showRaw]);

  return (
    <div className="rounded-lg border p-4 space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Database className="h-4 w-4" />
        <span className="font-medium">Resultado da consulta</span>
        <Badge variant="secondary">{cnj}</Badge>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 text-sm">
        <div><span className="text-muted-foreground">Tribunal</span><p className="font-medium break-words">{text(tribunal)}</p></div>
        <div><span className="text-muted-foreground">Local/Comarca</span><p className="font-medium break-words">{text(location)}</p></div>
        <div><span className="text-muted-foreground">Situação</span><p className="font-medium break-words">{text(status)}</p></div>
        <div className="sm:col-span-2 lg:col-span-3"><span className="text-muted-foreground">Assunto/Classe</span><p className="font-medium break-words">{text(subject)}</p></div>
        <div className="sm:col-span-2 lg:col-span-3"><span className="text-muted-foreground">Partes</span><p className="font-medium break-words">{text(parties)}</p></div>
      </div>

      {movementItems.length > 0 && (
        <div>
          <h4 className="text-sm font-medium mb-2">Últimas movimentações</h4>
          <div className="space-y-2">
            {movementItems.map((item, index) => {
              const movement = asRecord(item);
              const description = getFirst(movement, ["texto", "descricao", "description", "conteudo", "movimento"]);
              const date = getFirst(movement, ["data", "date", "data_movimentacao", "created_at"]);
              return <div key={index} className="rounded-md bg-muted/40 p-3 text-sm"><div className="text-xs text-muted-foreground">{text(date)}</div><div className="break-words">{text(description)}</div></div>;
            })}
          </div>
        </div>
      )}

      <Button type="button" variant="outline" size="sm" onClick={() => setShowRaw((value) => !value)}>
        {showRaw ? <ChevronUp className="mr-2 h-4 w-4" /> : <ChevronDown className="mr-2 h-4 w-4" />}
        {showRaw ? "Ocultar dados técnicos" : "Ver dados técnicos"}
      </Button>
      {showRaw && <div className="max-h-[420px] overflow-auto rounded-md bg-muted/40 p-3"><pre className="whitespace-pre-wrap break-words text-xs">{rawPreview}</pre></div>}
    </div>
  );
}

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
    if (!validatedCnj || consultation.isPending) return;
    try {
      const data = await consultation.mutateAsync({ cnj: validatedCnj, dryRun: false, confirmCharge: true });
      setResult(data);
      toast.success("Consulta concluída no JusBrasil.");
    } catch (error) {
      setResult(null);
      toast.error(error instanceof Error ? error.message : "Não foi possível consultar o processo");
    }
  };

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
          <Input value={cnj} onChange={(event) => { setCnj(event.target.value); setValidatedCnj(null); setResult(null); }} onKeyDown={(event) => event.key === "Enter" && handleValidate()} placeholder="0000000-00.0000.0.00.0000" aria-label="Número CNJ do processo" />
          <Button onClick={handleValidate} disabled={consultation.isPending || !cnj.trim()} variant="outline" className="sm:w-44">
            {consultation.isPending && !validatedCnj ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ShieldCheck className="mr-2 h-4 w-4" />}Validar CNJ
          </Button>
        </div>

        {validatedCnj && !result && <div className="rounded-lg border bg-muted/40 p-4 space-y-3"><div className="flex flex-wrap items-center gap-2 text-sm"><span className="font-medium">CNJ válido:</span><code>{validatedCnj}</code><Badge variant="outline">sem cobrança até aqui</Badge></div><Button onClick={handleConsult} disabled={consultation.isPending}>{consultation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Search className="mr-2 h-4 w-4" />}Consultar processo no JusBrasil</Button><p className="text-xs text-muted-foreground">Ao clicar em consultar, a LEXIA executa uma única consulta real usando a integração central.</p></div>}

        {result && !result.dry_run && <ResultSummary data={result.data} cnj={result.cnj} />}
      </CardContent>
    </Card>
  );
}
