import { User, Bot } from "lucide-react";
import type { GuideFlow } from "@/lib/guideExamples";

interface FlowExampleStagesProps {
  flow: GuideFlow;
  /** Compact mode drops the flow title/description (used when embedded inside a feature page). */
  compact?: boolean;
}

export function FlowExampleStages({ flow, compact = false }: FlowExampleStagesProps) {
  return (
    <div className="space-y-4">
      {!compact && (
        <div>
          <h3 className="font-serif text-lg font-semibold">{flow.title}</h3>
          <p className="text-sm text-muted-foreground">{flow.description}</p>
        </div>
      )}
      <div className="space-y-3">
        {flow.stages.map((stage) => (
          <div key={stage.stage} className="rounded-xl border border-border overflow-hidden">
            <div className="bg-muted/50 px-4 py-2 border-b border-border">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {stage.stageLabel}
              </p>
            </div>
            <div className="p-4 space-y-3">
              <div className="flex gap-2">
                <User className="w-4 h-4 mt-0.5 text-muted-foreground shrink-0" />
                <p className="text-sm whitespace-pre-wrap">{stage.userPrompt}</p>
              </div>
              <div className="flex gap-2">
                <Bot className="w-4 h-4 mt-0.5 text-gold-warm shrink-0" />
                <p className="text-sm whitespace-pre-wrap text-muted-foreground">{stage.aiResponse}</p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
