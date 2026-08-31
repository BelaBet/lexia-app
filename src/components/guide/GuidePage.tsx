import { BookOpen } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { GUIDE_FLOWS } from "@/lib/guideExamples";
import { FlowExampleStages } from "./FlowExampleStages";

export function GuidePage() {
  return (
    <div className="space-y-6">
      <div className="legal-card">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-gold-light flex items-center justify-center">
            <BookOpen className="w-6 h-6 text-gold-warm" />
          </div>
          <div>
            <h2 className="font-serif text-2xl font-semibold">Guia de Uso</h2>
            <p className="text-muted-foreground">
              Exemplos reais de cada etapa: entrada do usuário, resumo, criação de documento e revisão.
            </p>
          </div>
        </div>
      </div>

      <div className="legal-card">
        <Tabs defaultValue={GUIDE_FLOWS[0].id}>
          <TabsList>
            {GUIDE_FLOWS.map((flow) => (
              <TabsTrigger key={flow.id} value={flow.id}>
                {flow.title}
              </TabsTrigger>
            ))}
          </TabsList>
          {GUIDE_FLOWS.map((flow) => (
            <TabsContent key={flow.id} value={flow.id} className="mt-4">
              <FlowExampleStages flow={flow} />
            </TabsContent>
          ))}
        </Tabs>
      </div>
    </div>
  );
}
