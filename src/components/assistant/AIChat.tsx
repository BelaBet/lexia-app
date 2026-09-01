import { useState, useRef, useEffect } from "react";
import { Send, Sparkles, FileText, BookOpen, Lightbulb, Scale, Paperclip, X, Image, File, LayoutGrid, ChevronDown } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import DOMPurify from "dompurify";
import { supabase } from "@/integrations/supabase/client";
import { PromptTemplateGallery } from "./PromptTemplateGallery";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { FlowExampleStages } from "@/components/guide/FlowExampleStages";
import { GUIDE_FLOWS } from "@/lib/guideExamples";

const CHAT_FLOW = GUIDE_FLOWS.find((flow) => flow.id === "chat")!;

interface Attachment {
  id: string;
  file: File;
  preview?: string;
  type: "image" | "pdf" | "document";
}

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
  attachments?: Attachment[];
}

const suggestions = [
  { icon: FileText, text: "Criar petição inicial" },
  { icon: BookOpen, text: "Resumir documento jurídico" },
  { icon: Lightbulb, text: "Quais são os prazos recursais?" },
];

const CHAT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/legal-chat`;
const MAX_FILE_SIZE = 10 * 1024 * 1024;
const MAX_ATTACHMENTS = 5;

interface AIChatProps {
  /** Navigate to the full in-app guide page. Omit to hide the "see full guide" link. */
  onOpenGuide?: () => void;
}

export function AIChat({ onOpenGuide }: AIChatProps = {}) {
  const { toast } = useToast();
  const [showExamples, setShowExamples] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "1",
      role: "assistant",
      content: "Olá! Sou o **LexIA**, seu assistente jurídico com inteligência artificial especializado em direito brasileiro.\n\nPosso ajudá-lo com:\n- 📄 Criação de petições, contratos e documentos\n- 📚 Resumos e análises de documentos jurídicos\n- ⚖️ Consultas sobre legislação e jurisprudência\n- 📅 Cálculo de prazos processuais\n- 💡 Sugestões e orientações legais\n\nComo posso ajudar?",
      timestamp: new Date(),
    },
  ]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [showTemplateGallery, setShowTemplateGallery] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  // Preview blob: URLs for images stay alive as long as the message history
  // renders them, so they're revoked on unmount instead of right after send.
  const objectUrlsRef = useRef<Set<string>>(new Set());

  const scrollToBottom = () => messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  useEffect(() => { scrollToBottom(); }, [messages]);
  useEffect(() => () => { objectUrlsRef.current.forEach((url) => URL.revokeObjectURL(url)); }, []);

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    if (!files.length) return;

    const remaining = MAX_ATTACHMENTS - attachments.length;
    if (remaining <= 0) {
      toast({ variant: "destructive", title: "Limite de anexos", description: `Você pode anexar no máximo ${MAX_ATTACHMENTS} arquivos por mensagem.` });
      return;
    }

    const newAttachments: Attachment[] = [];
    for (const file of files.slice(0, remaining)) {
      if (file.size > MAX_FILE_SIZE) {
        toast({ variant: "destructive", title: "Arquivo muito grande", description: `${file.name} excede o limite de 10 MB.` });
        continue;
      }
      const allowed = file.type.startsWith("image/") || file.type === "application/pdf" || ["text/plain", "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"].includes(file.type);
      if (!allowed) {
        toast({ variant: "destructive", title: "Tipo de arquivo não suportado", description: `${file.name} não é um formato aceito.` });
        continue;
      }

      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
      let type: Attachment["type"] = "document";
      let preview: string | undefined;
      if (file.type.startsWith("image/")) {
        type = "image";
        preview = URL.createObjectURL(file);
        objectUrlsRef.current.add(preview);
      } else if (file.type === "application/pdf") {
        type = "pdf";
      }
      newAttachments.push({ id, file, preview, type });
    }

    setAttachments((prev) => [...prev, ...newAttachments]);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const removeAttachment = (id: string) => {
    setAttachments((prev) => {
      const attachment = prev.find((a) => a.id === id);
      if (attachment?.preview) {
        URL.revokeObjectURL(attachment.preview);
        objectUrlsRef.current.delete(attachment.preview);
      }
      return prev.filter((a) => a.id !== id);
    });
  };

  const fileToBase64 = (file: File): Promise<string> => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
  });

  const handleSend = async () => {
    if ((!input.trim() && attachments.length === 0) || isLoading) return;
    const currentAttachments = [...attachments];
    const userMessage: Message = {
      id: Date.now().toString(),
      role: "user",
      content: input || `[${currentAttachments.length} anexo(s)]`,
      timestamp: new Date(),
      attachments: currentAttachments,
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setAttachments([]);
    setIsLoading(true);
    let assistantContent = "";

    const upsertAssistant = (nextChunk: string) => {
      assistantContent += nextChunk;
      setMessages((prev) => {
        const last = prev[prev.length - 1];
        if (last?.role === "assistant" && last.id.startsWith("stream-")) {
          return prev.map((m, i) => i === prev.length - 1 ? { ...m, content: assistantContent } : m);
        }
        return [...prev, { id: `stream-${Date.now()}`, role: "assistant" as const, content: assistantContent, timestamp: new Date() }];
      });
    };

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        toast({ variant: "destructive", title: "Não autenticado", description: "Faça login para usar o assistente jurídico." });
        throw new Error("User not authenticated");
      }

      // Keep text and image inputs separate: Base64 must never be sent as ordinary prompt text.
      const imageContents = await Promise.all(currentAttachments.filter((a) => a.type === "image").map(async (att) => ({
        type: "image_url" as const,
        image_url: { url: await fileToBase64(att.file) },
      })));
      const fileDescriptions = currentAttachments.filter((a) => a.type !== "image").map((att) =>
        att.type === "pdf" ? `[PDF anexado: ${att.file.name}]` : `[Documento anexado: ${att.file.name}]`
      );
      const textContent = [input.trim(), ...fileDescriptions].filter(Boolean).join("\n\n");

      const history = messages.filter((m) => m.id !== "1").map((m) => ({ role: m.role, content: m.content }));
      const currentContent = imageContents.length > 0
        ? [{ type: "text" as const, text: textContent || "Analise a imagem anexada." }, ...imageContents]
        : textContent;
      const allMessages = [...history, { role: "user" as const, content: currentContent }];

      const response = await fetch(CHAT_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ messages: allMessages }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        if (response.status === 401) {
          toast({ variant: "destructive", title: "Sessão expirada", description: "Faça login novamente para continuar." });
        } else if (response.status === 413) {
          toast({ variant: "destructive", title: "Mensagem muito grande", description: errorData.error || "Reduza o tamanho dos anexos." });
        } else if (response.status === 429) {
          toast({ variant: "destructive", title: "Limite excedido", description: errorData.error || "Muitas requisições. Aguarde um momento." });
        } else if (response.status === 402) {
          toast({ variant: "destructive", title: "Créditos insuficientes", description: errorData.error || "Adicione créditos para continuar usando." });
        }
        throw new Error(errorData.error || `Request failed (${response.status})`);
      }

      if (!response.body) throw new Error("No response body");
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let textBuffer = "";
      let streamDone = false;

      while (!streamDone) {
        const { done, value } = await reader.read();
        if (done) break;
        textBuffer += decoder.decode(value, { stream: true });
        let newlineIndex: number;
        while ((newlineIndex = textBuffer.indexOf("\n")) !== -1) {
          let line = textBuffer.slice(0, newlineIndex);
          textBuffer = textBuffer.slice(newlineIndex + 1);
          if (line.endsWith("\r")) line = line.slice(0, -1);
          if (line.startsWith(":") || line.trim() === "" || !line.startsWith("data: ")) continue;
          const jsonStr = line.slice(6).trim();
          if (jsonStr === "[DONE]") { streamDone = true; break; }
          try {
            const parsed = JSON.parse(jsonStr);
            const content = parsed.choices?.[0]?.delta?.content as string | undefined;
            if (content) upsertAssistant(content);
          } catch {
            textBuffer = line + "\n" + textBuffer;
            break;
          }
        }
      }

      if (textBuffer.trim()) {
        for (let raw of textBuffer.split("\n")) {
          if (!raw) continue;
          if (raw.endsWith("\r")) raw = raw.slice(0, -1);
          if (!raw.startsWith("data: ")) continue;
          const jsonStr = raw.slice(6).trim();
          if (jsonStr === "[DONE]") continue;
          try {
            const parsed = JSON.parse(jsonStr);
            const content = parsed.choices?.[0]?.delta?.content as string | undefined;
            if (content) upsertAssistant(content);
          } catch { /* ignore partial leftovers */ }
        }
      }
    } catch (error) {
      console.error("Chat error:", error);
      if (assistantContent === "") {
        setMessages((prev) => [...prev, { id: `error-${Date.now()}`, role: "assistant", content: "Desculpe, ocorreu um erro ao processar sua solicitação. Por favor, tente novamente.", timestamp: new Date() }]);
      }
    } finally {
      // Preview URLs for sent attachments are kept alive: they're still
      // referenced by this message in the chat history above. They're
      // revoked together on unmount (see objectUrlsRef cleanup effect).
      setIsLoading(false);
    }
  };

  const handleSuggestionClick = (text: string) => setInput(text);

  const getAttachmentIcon = (type: Attachment["type"]) => {
    switch (type) {
      case "image": return <Image className="w-4 h-4" />;
      case "pdf": return <FileText className="w-4 h-4" />;
      default: return <File className="w-4 h-4" />;
    }
  };

  const renderMarkdown = (text: string) => {
    const purifyConfig = { ALLOWED_TAGS: ["strong", "em", "code", "pre", "br"], ALLOWED_ATTR: [] };
    return text.split("\n").map((line, i) => {
      if (line.startsWith("## ")) return <h2 key={i} className="font-serif text-lg font-semibold mt-4 mb-2">{line.replace("## ", "")}</h2>;
      if (line.startsWith("### ")) return <h3 key={i} className="font-serif font-semibold mt-3 mb-1 text-gold-dark">{line.replace("### ", "")}</h3>;
      const formatted = line.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>");
      const sanitized = DOMPurify.sanitize(formatted, purifyConfig);
      if (line.startsWith("- ")) return <p key={i} className="ml-4 my-1" dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize("• " + formatted.slice(2), purifyConfig) }} />;
      if (line.startsWith("⚠️")) return <p key={i} className="text-warning bg-warning/10 p-2 rounded my-2">{line}</p>;
      return <p key={i} className="my-1" dangerouslySetInnerHTML={{ __html: sanitized }} />;
    });
  };

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)]">
      <div className="legal-card mb-4"><div className="flex items-center gap-3"><div className="w-12 h-12 rounded-xl bg-gradient-to-br from-gold-warm to-gold-dark flex items-center justify-center"><Scale className="w-6 h-6 text-primary-foreground" /></div><div className="flex-1"><h2 className="font-serif text-2xl font-semibold">Assistente Jurídico IA</h2><p className="text-muted-foreground">Especializado em legislação e jurisprudência brasileira</p></div><div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted px-3 py-1.5 rounded-full"><Sparkles className="w-3 h-3 text-gold-warm" />IA Ativa</div></div></div>

      <Collapsible open={showExamples} onOpenChange={setShowExamples} className="mb-4">
        <CollapsibleTrigger asChild>
          <button className="flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
            <BookOpen className="w-4 h-4" />
            Como funciona: exemplo de entrada, resumo, documento e revisão
            <ChevronDown className={`w-4 h-4 transition-transform ${showExamples ? "rotate-180" : ""}`} />
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent className="mt-3">
          <div className="legal-card !p-4 max-h-[50vh] overflow-y-auto space-y-3">
            <FlowExampleStages flow={CHAT_FLOW} compact />
            {onOpenGuide && (
              <button onClick={onOpenGuide} className="text-sm text-gold-warm hover:underline font-medium">
                Ver guia completo →
              </button>
            )}
          </div>
        </CollapsibleContent>
      </Collapsible>

      <div className="flex-1 overflow-y-auto space-y-4 mb-4 pr-2">
        {messages.map((message) => <div key={message.id} className={`ai-message ${message.role} fade-in`}>
          {message.attachments && message.attachments.length > 0 && <div className="flex flex-wrap gap-2 mb-2">{message.attachments.map((att) => <div key={att.id} className="relative">{att.type === "image" && att.preview ? <img src={att.preview} alt={att.file.name} className="w-20 h-20 object-cover rounded-lg border border-border" /> : <div className="flex items-center gap-2 px-3 py-2 bg-muted rounded-lg">{getAttachmentIcon(att.type)}<span className="text-xs truncate max-w-[100px]">{att.file.name}</span></div>}</div>)}</div>}
          <div className="whitespace-pre-wrap text-sm leading-relaxed">{renderMarkdown(message.content)}</div>
          <span className="text-xs opacity-60 mt-2 block">{message.timestamp.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</span>
        </div>)}
        {isLoading && messages[messages.length - 1]?.role !== "assistant" && <div className="ai-message assistant fade-in"><div className="flex items-center gap-2"><div className="w-2 h-2 bg-gold-warm rounded-full animate-bounce" /><div className="w-2 h-2 bg-gold-warm rounded-full animate-bounce" style={{ animationDelay: "0.1s" }} /><div className="w-2 h-2 bg-gold-warm rounded-full animate-bounce" style={{ animationDelay: "0.2s" }} /></div></div>}
        <div ref={messagesEndRef} />
      </div>
      {messages.length <= 2 && <div className="flex gap-3 mb-4 overflow-x-auto pb-2">{suggestions.map((suggestion, index) => <button key={index} onClick={() => handleSuggestionClick(suggestion.text)} className="flex items-center gap-2 px-4 py-2 rounded-full bg-accent hover:bg-accent/80 transition-colors whitespace-nowrap"><suggestion.icon className="w-4 h-4 text-gold-warm" /><span className="text-sm font-medium">{suggestion.text}</span></button>)}<button onClick={() => setShowTemplateGallery(true)} className="flex items-center gap-2 px-4 py-2 rounded-full border border-dashed border-gold-warm/50 hover:bg-accent/80 transition-colors whitespace-nowrap"><LayoutGrid className="w-4 h-4 text-gold-warm" /><span className="text-sm font-medium">Ver todos os templates</span></button></div>}
      {attachments.length > 0 && <div className="flex flex-wrap gap-2 mb-2 p-3 bg-muted/50 rounded-lg">{attachments.map((att) => <div key={att.id} className="relative group">{att.type === "image" && att.preview ? <div className="relative"><img src={att.preview} alt={att.file.name} className="w-16 h-16 object-cover rounded-lg border border-border" /><button onClick={() => removeAttachment(att.id)} className="absolute -top-2 -right-2 w-5 h-5 bg-destructive text-destructive-foreground rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"><X className="w-3 h-3" /></button></div> : <div className="relative flex items-center gap-2 px-3 py-2 bg-background rounded-lg border border-border">{getAttachmentIcon(att.type)}<span className="text-xs truncate max-w-[80px]">{att.file.name}</span><button onClick={() => removeAttachment(att.id)} className="w-4 h-4 bg-destructive text-destructive-foreground rounded-full flex items-center justify-center"><X className="w-2.5 h-2.5" /></button></div>}</div>)}</div>}
      <div className="legal-card !p-4"><div className="flex items-center gap-3"><input type="file" ref={fileInputRef} onChange={handleFileSelect} accept="image/*,.pdf,.doc,.docx,.txt" multiple className="hidden" /><button onClick={() => fileInputRef.current?.click()} disabled={isLoading} className="p-3 rounded-lg bg-muted hover:bg-muted/80 transition-colors disabled:opacity-50" title="Anexar arquivo"><Paperclip className="w-5 h-5 text-muted-foreground" /></button><button onClick={() => setShowTemplateGallery(true)} disabled={isLoading} className="p-3 rounded-lg bg-muted hover:bg-muted/80 transition-colors disabled:opacity-50" title="Templates de prompts"><LayoutGrid className="w-5 h-5 text-muted-foreground" /></button><input type="text" value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && handleSend()} placeholder="Digite sua pergunta jurídica..." className="legal-input flex-1" disabled={isLoading} /><button onClick={handleSend} disabled={isLoading || (!input.trim() && attachments.length === 0)} className="legal-button-gold !px-4 !py-3 disabled:opacity-50 disabled:cursor-not-allowed"><Send className="w-5 h-5" /></button></div></div>
      <PromptTemplateGallery
        open={showTemplateGallery}
        onOpenChange={setShowTemplateGallery}
        onSelectTemplate={(prompt) => setInput(prompt)}
      />
    </div>
  );
}
