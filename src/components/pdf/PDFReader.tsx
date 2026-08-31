import { useState, useCallback, useRef, useEffect } from "react";
import { Upload, FileText, X, Sparkles, Copy, Download, CheckCircle, Send, MessageSquare, ScanText, BookOpen, ChevronDown } from "lucide-react";
import { toast } from "sonner";
import * as pdfjsLib from "pdfjs-dist";
import { supabase } from "@/integrations/supabase/client";
import { PDFSaveOptions } from "./PDFSaveOptions";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { FlowExampleStages } from "@/components/guide/FlowExampleStages";
import { GUIDE_FLOWS } from "@/lib/guideExamples";

const PDF_READER_FLOW = GUIDE_FLOWS.find((flow) => flow.id === "pdf-reader")!;

// Narrow an unknown catch value down to the fields we actually read (name/message),
// without resorting to `any`.
function asErrorLike(error: unknown): { name?: string; message?: string } {
  if (error instanceof Error) return { name: error.name, message: error.message };
  if (typeof error === "object" && error !== null) {
    const { name, message } = error as { name?: unknown; message?: unknown };
    return {
      name: typeof name === "string" ? name : undefined,
      message: typeof message === "string" ? message : undefined,
    };
  }
  return {};
}

// Dynamically match worker version to installed pdfjs-dist version
const PDFJS_VERSION = pdfjsLib.version;
const WORKER_SOURCES = [
  `https://unpkg.com/pdfjs-dist@${PDFJS_VERSION}/build/pdf.worker.min.mjs`,
  `https://cdn.jsdelivr.net/npm/pdfjs-dist@${PDFJS_VERSION}/build/pdf.worker.min.mjs`, 
  `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${PDFJS_VERSION}/pdf.worker.min.mjs`,
];

// Try to load worker from multiple sources with fallback
const initializeWorker = async (): Promise<boolean> => {
  for (const source of WORKER_SOURCES) {
    try {
      console.log(`[PDFReader] Tentando carregar worker de: ${source}`);
      
      // Test if the worker URL is accessible
      const response = await fetch(source, { method: "HEAD", mode: "cors" });
      
      if (response.ok) {
        pdfjsLib.GlobalWorkerOptions.workerSrc = source;
        console.log(`[PDFReader] Worker carregado com sucesso de: ${source}`);
        return true;
      }
    } catch (error) {
      console.warn(`[PDFReader] Falha ao carregar worker de ${source}:`, error);
    }
  }
  
  // Fallback: try setting the first source anyway (might work with import)
  console.warn("[PDFReader] Usando fonte de worker padrão como fallback");
  pdfjsLib.GlobalWorkerOptions.workerSrc = WORKER_SOURCES[0];
  return false;
};

// Initialize worker immediately
let workerInitialized = false;
initializeWorker().then((success) => {
  workerInitialized = success;
});

interface UploadedFile {
  name: string;
  size: number;
  type: string;
  file: File;
  pageCount?: number;
}

interface ExtractionProgress {
  currentPage: number;
  totalPages: number;
}

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

interface PDFReaderProps {
  /** Navigate to the full in-app guide page. Omit to hide the "see full guide" link. */
  onOpenGuide?: () => void;
}

export function PDFReader({ onOpenGuide }: PDFReaderProps = {}) {
  const [showExamples, setShowExamples] = useState(false);
  const [uploadedFile, setUploadedFile] = useState<UploadedFile | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [summary, setSummary] = useState<string>("");
  const [extractedText, setExtractedText] = useState<string>("");
  const [isExtracting, setIsExtracting] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isOcrProcessing, setIsOcrProcessing] = useState(false);
  const [ocrProgress, setOcrProgress] = useState<string>("");
  const [extractionProgress, setExtractionProgress] = useState<ExtractionProgress | null>(null);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [questionInput, setQuestionInput] = useState("");
  const [isAskingQuestion, setIsAskingQuestion] = useState(false);
  const [showOcrOption, setShowOcrOption] = useState(false);
  const [autoAnalyze, setAutoAnalyze] = useState(false); // Flag para análise automática
  const abortControllerRef = useRef<AbortController | null>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);

  // Auto-analyze when text is extracted and flag is set
  useEffect(() => {
    if (autoAnalyze && extractedText && extractedText.length >= 100 && uploadedFile && !isAnalyzing) {
      console.log("[PDFReader] Iniciando análise automática...");
      setAutoAnalyze(false); // Reset flag
      analyzeDocument();
    }
  }, [extractedText, autoAnalyze, uploadedFile, isAnalyzing]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const extractTextFromPDF = async (file: File): Promise<string> => {
    setIsExtracting(true);
    setExtractionProgress({ currentPage: 0, totalPages: 0 });

    console.log(`[PDFReader] Iniciando extração do arquivo: ${file.name} (${(file.size / 1024 / 1024).toFixed(2)} MB)`);

    try {
      const arrayBuffer = await file.arrayBuffer();
      console.log(`[PDFReader] ArrayBuffer criado: ${arrayBuffer.byteLength} bytes`);
      
      const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
      
      loadingTask.onProgress = (progress: { loaded: number; total: number }) => {
        if (progress.total > 0) {
          console.log(`[PDFReader] Carregando PDF: ${Math.round((progress.loaded / progress.total) * 100)}%`);
        }
      };
      
      const pdf = await loadingTask.promise;
      const numPages = pdf.numPages;
      console.log(`[PDFReader] PDF carregado com sucesso: ${numPages} páginas`);
      
      // Update page count in uploaded file
      setUploadedFile(prev => prev ? { ...prev, pageCount: numPages } : null);
      
      let fullText = "";

      setExtractionProgress({ currentPage: 0, totalPages: numPages });

      for (let i = 1; i <= numPages; i++) {
        try {
          const page = await pdf.getPage(i);
          const textContent = await page.getTextContent();
          const pageText = textContent.items
            .map((item) => ("str" in item ? item.str : ""))
            .join(" ");
          fullText += `\n--- Página ${i} ---\n${pageText}`;
          setExtractionProgress({ currentPage: i, totalPages: numPages });
          
          if (i % 10 === 0) {
            console.log(`[PDFReader] Progresso: ${i}/${numPages} páginas extraídas`);
          }
        } catch (pageError) {
          console.error(`[PDFReader] Erro ao extrair página ${i}:`, pageError);
          fullText += `\n--- Página ${i} ---\n[Erro ao extrair texto desta página]`;
        }
      }

      console.log(`[PDFReader] Extração concluída: ${fullText.length} caracteres extraídos`);
      return fullText.trim();
    } catch (rawError) {
      const error = asErrorLike(rawError);
      console.error("[PDFReader] Erro na extração do PDF:", rawError);

      // Diagnóstico detalhado baseado no tipo de erro
      let errorMessage = "Erro ao extrair texto do PDF";
      let errorDetails = "";

      if (error?.name === "PasswordException") {
        errorMessage = "PDF protegido por senha";
        errorDetails = "Este PDF requer uma senha para ser aberto.";
      } else if (error?.name === "InvalidPDFException") {
        errorMessage = "PDF inválido ou corrompido";
        errorDetails = "O arquivo não é um PDF válido ou está corrompido.";
      } else if (error?.name === "MissingPDFException") {
        errorMessage = "PDF não encontrado";
        errorDetails = "O arquivo PDF está vazio ou não contém dados.";
      } else if (error?.message?.includes("worker")) {
        errorMessage = "Erro no worker do PDF.js";
        errorDetails = `Versão do worker pode estar incompatível. Detalhes: ${error.message}`;
      } else if (error?.message?.includes("fetch") || error?.message?.includes("network")) {
        errorMessage = "Erro de rede";
        errorDetails = "Problema ao carregar recursos necessários para processar o PDF.";
      } else if (error?.message) {
        errorDetails = error.message;
      }

      console.error(`[PDFReader] Tipo de erro: ${error?.name || "Desconhecido"}`);
      console.error(`[PDFReader] Mensagem: ${errorMessage}`);
      console.error(`[PDFReader] Detalhes: ${errorDetails}`);
      
      throw new Error(`${errorMessage}${errorDetails ? `: ${errorDetails}` : ""}`);
    } finally {
      setIsExtracting(false);
      setExtractionProgress(null);
    }
  };

  // Função para renderizar páginas do PDF como imagens para OCR
  const renderPagesToImages = async (file: File, maxPages: number = 5): Promise<string[]> => {
    console.log(`[PDFReader] Renderizando até ${maxPages} páginas como imagens para OCR`);
    
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    const numPages = Math.min(pdf.numPages, maxPages);
    const images: string[] = [];
    
    for (let i = 1; i <= numPages; i++) {
      setOcrProgress(`Preparando página ${i} de ${numPages}...`);
      
      const page = await pdf.getPage(i);
      const scale = 2; // Alta resolução para melhor OCR
      const viewport = page.getViewport({ scale });
      
      const canvas = document.createElement("canvas");
      const context = canvas.getContext("2d");
      
      if (!context) {
        throw new Error("Could not create canvas context");
      }
      
      canvas.height = viewport.height;
      canvas.width = viewport.width;
      
      await page.render({
        canvasContext: context,
        viewport: viewport,
        canvas: canvas,
      }).promise;
      
      // Converter canvas para base64 JPEG (menor que PNG)
      const imageData = canvas.toDataURL("image/jpeg", 0.85);
      images.push(imageData);
      
      console.log(`[PDFReader] Página ${i} renderizada: ${(imageData.length / 1024).toFixed(1)} KB`);
    }
    
    return images;
  };

  // Função para processar OCR usando IA (chamada manual pelo botão)
  const processOcr = async () => {
    if (!uploadedFile) return;
    await processOcrForFile(uploadedFile.file);
  };

  // Função para calcular o texto real (sem os marcadores de página)
  const getRealTextContent = (text: string): string => {
    // Remove os marcadores de página e conta apenas o texto real
    return text
      .replace(/---\s*Página\s*\d+\s*---/gi, "")
      .replace(/\[Erro ao extrair texto desta página\]/gi, "")
      .trim();
  };

  const processFile = async (file: File) => {
    // Validação de tipo
    if (file.type !== "application/pdf") {
      console.warn(`[PDFReader] Tipo de arquivo inválido: ${file.type}`);
      toast.error("Por favor, selecione apenas arquivos PDF");
      return;
    }
    
    // Validação de tamanho (máximo 50MB)
    const maxSize = 50 * 1024 * 1024;
    if (file.size > maxSize) {
      console.warn(`[PDFReader] Arquivo muito grande: ${(file.size / 1024 / 1024).toFixed(2)} MB`);
      toast.error("O arquivo é muito grande. Máximo permitido: 50MB");
      return;
    }
    
    // Validação de arquivo vazio
    if (file.size === 0) {
      console.warn(`[PDFReader] Arquivo vazio detectado`);
      toast.error("O arquivo está vazio");
      return;
    }

    console.log(`[PDFReader] Processando arquivo: ${file.name}`);

    setUploadedFile({
      name: file.name,
      size: file.size,
      type: file.type,
      file: file,
    });
    setSummary("");
    setExtractedText("");
    setShowOcrOption(false);

    try {
      const text = await extractTextFromPDF(file);
      
      // Calcular o texto REAL (sem marcadores de página)
      const realText = getRealTextContent(text);
      const minRealTextLength = 50; // Mínimo de caracteres REAIS para considerar válido
      
      console.log(`[PDFReader] Texto total: ${text.length} chars, Texto real: ${realText.length} chars`);
      
      if (realText.length < minRealTextLength) {
        console.warn(`[PDFReader] PDF com pouco texto extraível (${realText.length} chars reais) - iniciando OCR automático`);
        
        // Armazenar o arquivo para referência
        setExtractedText(""); // Limpar texto vazio
        
        // Iniciar OCR automaticamente para PDFs escaneados
        toast.info("📄 PDF escaneado detectado. Iniciando OCR automático com IA...");
        
        // Disparar OCR automaticamente
        setTimeout(async () => {
          await processOcrForFile(file);
        }, 100);
      } else {
        setShowOcrOption(false);
        setExtractedText(text);
        setAutoAnalyze(true); // Ativar análise automática
        toast.success(`PDF carregado! Iniciando análise automática...`);
      }
    } catch (rawError) {
      console.error("[PDFReader] Falha ao processar PDF:", rawError);
      toast.error(asErrorLike(rawError).message || "Erro ao processar o PDF. Verifique se o arquivo não está corrompido.");
      setUploadedFile(null);
    }
  };

  // Função separada para processar OCR com arquivo específico
  const processOcrForFile = async (file: File) => {
    setIsOcrProcessing(true);
    setOcrProgress("Iniciando OCR automático com IA...");
    
    try {
      // Get user session
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        toast.error("Faça login para usar o OCR.");
        setShowOcrOption(true);
        return;
      }
      
      // Renderizar páginas como imagens
      const images = await renderPagesToImages(file);
      
      if (images.length === 0) {
        toast.error("Não foi possível renderizar as páginas do PDF.");
        setShowOcrOption(true);
        return;
      }
      
      setOcrProgress(`Enviando ${images.length} página(s) para análise IA...`);
      
      // Enviar para edge function de OCR
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/pdf-ocr`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            images,
            fileName: file.name,
          }),
        }
      );
      
      if (response.status === 429) {
        toast.error("Limite de requisições atingido. Aguarde um momento.");
        setShowOcrOption(true);
        return;
      }
      
      if (response.status === 402) {
        toast.error("Créditos insuficientes para OCR.");
        setShowOcrOption(true);
        return;
      }
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || "Erro no processamento OCR");
      }
      
      const data = await response.json();
      
      if (data.text && data.text.length > 0) {
        setExtractedText(data.text);
        setAutoAnalyze(true); // Ativar análise automática após OCR
        toast.success(`OCR concluído! Iniciando análise automática...`);
        console.log(`[PDFReader] OCR bem-sucedido: ${data.text.length} caracteres`);
      } else {
        toast.warning("O OCR não conseguiu extrair texto das imagens.");
        setShowOcrOption(true);
      }
    } catch (rawError) {
      console.error("[PDFReader] Erro no OCR:", rawError);
      toast.error(asErrorLike(rawError).message || "Erro ao processar OCR.");
      setShowOcrOption(true);
    } finally {
      setIsOcrProcessing(false);
      setOcrProgress("");
    }
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);

    const files = e.dataTransfer.files;
    if (files.length > 0) {
      processFile(files[0]);
    }
  }, []);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      processFile(files[0]);
    }
  };

  const removeFile = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    setUploadedFile(null);
    setSummary("");
    setExtractedText("");
    setChatMessages([]);
    setQuestionInput("");
  };

  const askQuestion = async () => {
    if (!questionInput.trim() || !extractedText || isAskingQuestion) return;

    const userQuestion = questionInput.trim();
    setQuestionInput("");
    setChatMessages(prev => [...prev, { role: "user", content: userQuestion }]);
    setIsAskingQuestion(true);

    try {
      // Get user session token
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        toast.error("Faça login para usar esta funcionalidade.");
        setIsAskingQuestion(false);
        return;
      }

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/legal-chat`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            messages: [
              {
                role: "system",
                content: `Você está analisando o documento "${uploadedFile?.name}". Use o texto do documento para responder perguntas específicas. Seja preciso e cite trechos relevantes quando possível.

TEXTO DO DOCUMENTO:
${extractedText.substring(0, 25000)}${extractedText.length > 25000 ? "\n\n[... texto truncado ...]" : ""}

${summary ? `ANÁLISE PRÉVIA:\n${summary.substring(0, 5000)}` : ""}`,
              },
              ...chatMessages.map(m => ({ role: m.role, content: m.content })),
              { role: "user", content: userQuestion },
            ],
          }),
        }
      );

      if (response.status === 429) {
        toast.error("Limite de requisições atingido. Aguarde um momento.");
        setChatMessages(prev => prev.slice(0, -1));
        setIsAskingQuestion(false);
        return;
      }

      if (response.status === 402) {
        toast.error("Créditos insuficientes.");
        setChatMessages(prev => prev.slice(0, -1));
        setIsAskingQuestion(false);
        return;
      }

      if (!response.ok || !response.body) {
        throw new Error("Erro na resposta");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let fullResponse = "";

      setChatMessages(prev => [...prev, { role: "assistant", content: "" }]);

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        let newlineIndex: number;
        while ((newlineIndex = buffer.indexOf("\n")) !== -1) {
          let line = buffer.slice(0, newlineIndex);
          buffer = buffer.slice(newlineIndex + 1);

          if (line.endsWith("\r")) line = line.slice(0, -1);
          if (line.startsWith(":") || line.trim() === "") continue;
          if (!line.startsWith("data: ")) continue;

          const jsonStr = line.slice(6).trim();
          if (jsonStr === "[DONE]") break;

          try {
            const parsed = JSON.parse(jsonStr);
            const content = parsed.choices?.[0]?.delta?.content;
            if (content) {
              fullResponse += content;
              setChatMessages(prev => {
                const updated = [...prev];
                updated[updated.length - 1] = { role: "assistant", content: fullResponse };
                return updated;
              });
            }
          } catch {
            buffer = line + "\n" + buffer;
            break;
          }
        }
      }

      // Scroll to bottom
      setTimeout(() => {
        chatContainerRef.current?.scrollTo({
          top: chatContainerRef.current.scrollHeight,
          behavior: "smooth",
        });
      }, 100);
    } catch (error) {
      console.error("Question error:", error);
      toast.error("Erro ao processar pergunta.");
      setChatMessages(prev => prev.slice(0, -1));
    } finally {
      setIsAskingQuestion(false);
    }
  };
  const analyzeDocument = async () => {
    if (!uploadedFile || !extractedText) return;

    setIsAnalyzing(true);
    setSummary("");

    abortControllerRef.current = new AbortController();

    try {
      // Get user session token
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        toast.error("Faça login para analisar documentos.");
        setIsAnalyzing(false);
        return;
      }

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/legal-chat`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            messages: [
              {
                role: "user",
                content: `Analise o seguinte documento PDF chamado "${uploadedFile.name}" e forneça:

1. **Resumo Executivo**: Uma síntese clara do documento
2. **Tipo de Documento**: Identifique se é contrato, petição, sentença, parecer, etc.
3. **Partes Envolvidas**: Liste as partes mencionadas
4. **Principais Cláusulas/Pontos**: Destaque os pontos mais importantes
5. **Aspectos Jurídicos Relevantes**: Fundamentos legais, artigos citados, jurisprudência
6. **Pontos de Atenção**: Cláusulas que merecem revisão ou atenção especial
7. **Sugestões**: Recomendações para o advogado

TEXTO DO DOCUMENTO:
${extractedText.substring(0, 30000)}${extractedText.length > 30000 ? "\n\n[... texto truncado por limite de caracteres ...]" : ""}`,
              },
            ],
          }),
          signal: abortControllerRef.current.signal,
        }
      );

      if (response.status === 429) {
        toast.error("Limite de requisições atingido. Aguarde um momento.");
        setIsAnalyzing(false);
        return;
      }

      if (response.status === 402) {
        toast.error("Créditos insuficientes. Adicione mais créditos ao workspace.");
        setIsAnalyzing(false);
        return;
      }

      if (!response.ok || !response.body) {
        throw new Error("Erro na análise");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let fullResponse = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        let newlineIndex: number;
        while ((newlineIndex = buffer.indexOf("\n")) !== -1) {
          let line = buffer.slice(0, newlineIndex);
          buffer = buffer.slice(newlineIndex + 1);

          if (line.endsWith("\r")) line = line.slice(0, -1);
          if (line.startsWith(":") || line.trim() === "") continue;
          if (!line.startsWith("data: ")) continue;

          const jsonStr = line.slice(6).trim();
          if (jsonStr === "[DONE]") break;

          try {
            const parsed = JSON.parse(jsonStr);
            const content = parsed.choices?.[0]?.delta?.content;
            if (content) {
              fullResponse += content;
              setSummary(fullResponse);
            }
          } catch {
            buffer = line + "\n" + buffer;
            break;
          }
        }
      }
    } catch (rawError) {
      if (asErrorLike(rawError).name !== "AbortError") {
        console.error("Analysis error:", rawError);
        toast.error("Erro ao analisar documento. Tente novamente.");
      }
    } finally {
      setIsAnalyzing(false);
    }
  };

  const copyToClipboard = async () => {
    if (summary) {
      await navigator.clipboard.writeText(summary);
      toast.success("Resumo copiado!");
    }
  };

  const downloadSummary = () => {
    if (!summary || !uploadedFile) return;

    const blob = new Blob([summary], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `resumo-${uploadedFile.name.replace(".pdf", "")}.txt`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Resumo baixado!");
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
    return (bytes / (1024 * 1024)).toFixed(1) + " MB";
  };

  const renderMarkdown = (text: string) => {
    return text.split("\n").map((line, i) => {
      if (line.startsWith("## ")) {
        return (
          <h2 key={i} className="font-serif text-lg font-semibold mt-0 mb-3">
            {line.replace("## ", "")}
          </h2>
        );
      }
      if (line.startsWith("### ")) {
        return (
          <h3 key={i} className="font-serif font-semibold mt-4 mb-2 text-gold-dark">
            {line.replace("### ", "")}
          </h3>
        );
      }
      if (line.startsWith("**") && line.includes("**:")) {
        const parts = line.split("**:");
        const title = parts[0].replace("**", "");
        const content = parts.slice(1).join("**:");
        return (
          <p key={i} className="my-1">
            <strong className="text-foreground">{title}:</strong>
            {content}
          </p>
        );
      }
      if (line.startsWith("⚠️") || line.includes("Atenção") || line.includes("ATENÇÃO")) {
        return (
          <p key={i} className="text-warning bg-warning/10 p-2 rounded my-1">
            {line}
          </p>
        );
      }
      if (line.match(/^\d+\.\s/)) {
        return (
          <p key={i} className="ml-4 my-1">
            {line}
          </p>
        );
      }
      if (line.startsWith("- ") || line.startsWith("• ")) {
        return (
          <p key={i} className="ml-4 my-1">
            • {line.replace(/^[-•]\s/, "")}
          </p>
        );
      }
      return (
        <p key={i} className="my-1">
          {line}
        </p>
      );
    });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="legal-card">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
            <Upload className="w-6 h-6 text-primary" />
          </div>
          <div>
            <h2 className="font-serif text-2xl font-semibold">Leitor de PDF</h2>
            <p className="text-muted-foreground">
              Envie documentos para extração de texto e análise com IA jurídica
            </p>
          </div>
        </div>
      </div>

      <Collapsible open={showExamples} onOpenChange={setShowExamples}>
        <CollapsibleTrigger asChild>
          <button className="flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
            <BookOpen className="w-4 h-4" />
            Como funciona: exemplo de entrada, resumo, documento e revisão
            <ChevronDown className={`w-4 h-4 transition-transform ${showExamples ? "rotate-180" : ""}`} />
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent className="mt-3">
          <div className="legal-card !p-4 space-y-3">
            <FlowExampleStages flow={PDF_READER_FLOW} compact />
            {onOpenGuide && (
              <button onClick={onOpenGuide} className="text-sm text-primary hover:underline font-medium">
                Ver guia completo →
              </button>
            )}
          </div>
        </CollapsibleContent>
      </Collapsible>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Upload Area */}
        <div className="space-y-4">
          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={`legal-card !p-8 border-2 border-dashed transition-all ${
              isDragging
                ? "border-gold-warm bg-gold-light/50"
                : "border-border hover:border-gold-warm/50"
            }`}
          >
            <div className="text-center">
              <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-accent flex items-center justify-center">
                <Upload className="w-8 h-8 text-gold-warm" />
              </div>
              <h3 className="font-medium text-lg mb-2">Arraste seu PDF aqui</h3>
              <p className="text-muted-foreground text-sm mb-4">
                ou clique para selecionar
              </p>
              <label className="legal-button-primary cursor-pointer inline-block">
                <input
                  type="file"
                  accept=".pdf"
                  onChange={handleFileSelect}
                  className="hidden"
                />
                Selecionar Arquivo
              </label>
            </div>
          </div>

          {/* Extraction Progress */}
          {isExtracting && extractionProgress && (
            <div className="legal-card fade-in">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                <span className="font-medium">Extraindo texto...</span>
              </div>
              <div className="w-full bg-muted rounded-full h-2">
                <div
                  className="bg-primary h-2 rounded-full transition-all duration-300"
                  style={{
                    width: `${
                      (extractionProgress.currentPage / extractionProgress.totalPages) * 100
                    }%`,
                  }}
                />
              </div>
              <p className="text-sm text-muted-foreground mt-2">
                Página {extractionProgress.currentPage} de {extractionProgress.totalPages}
              </p>
            </div>
          )}

          {/* Uploaded File */}
          {uploadedFile && !isExtracting && (
            <div className="legal-card fade-in">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-lg bg-destructive/10 flex items-center justify-center">
                  <FileText className="w-6 h-6 text-destructive" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">{uploadedFile.name}</p>
                  <p className="text-sm text-muted-foreground">
                    {formatFileSize(uploadedFile.size)}
                    {uploadedFile.pageCount && (
                      <span className="ml-2">• {uploadedFile.pageCount} página{uploadedFile.pageCount > 1 ? 's' : ''}</span>
                    )}
                  </p>
                </div>
                <button
                  onClick={removeFile}
                  className="p-2 hover:bg-muted rounded-lg transition-colors"
                >
                  <X className="w-5 h-5 text-muted-foreground" />
                </button>
              </div>

              {extractedText && (
                <div className="mt-3 p-3 bg-muted/50 rounded-lg">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-sm text-success">
                      <CheckCircle className="w-4 h-4" />
                      <span>
                        {extractedText.length.toLocaleString()} caracteres extraídos
                      </span>
                    </div>
                    <PDFSaveOptions
                      extractedText={extractedText}
                      summary={summary}
                      fileName={uploadedFile.name}
                      disabled={isAnalyzing || isOcrProcessing}
                    />
                  </div>
                </div>
              )}

              {/* OCR Option for scanned PDFs */}
              {(showOcrOption || extractedText.length < 100) && !isOcrProcessing && (
                <div className="mt-3 p-3 bg-warning/10 border border-warning/30 rounded-lg">
                  <div className="flex items-center gap-2 text-sm text-warning mb-2">
                    <ScanText className="w-4 h-4" />
                    <span className="font-medium">PDF parece ser escaneado</span>
                  </div>
                  <p className="text-xs text-muted-foreground mb-3">
                    Este documento parece conter imagens ao invés de texto. Use o OCR com IA para extrair o texto.
                  </p>
                  <button
                    onClick={processOcr}
                    className="legal-button-primary w-full flex items-center justify-center gap-2"
                  >
                    <ScanText className="w-4 h-4" />
                    Extrair texto com OCR (IA)
                  </button>
                </div>
              )}

              {/* OCR Processing */}
              {isOcrProcessing && (
                <div className="mt-3 p-3 bg-primary/10 border border-primary/30 rounded-lg">
                  <div className="flex items-center gap-3">
                    <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                    <div>
                      <span className="font-medium text-sm">Processando OCR com IA...</span>
                      {ocrProgress && (
                        <p className="text-xs text-muted-foreground">{ocrProgress}</p>
                      )}
                    </div>
                  </div>
                </div>
              )}

              <button
                onClick={analyzeDocument}
                disabled={isAnalyzing || !extractedText}
                className="legal-button-gold w-full mt-4 flex items-center justify-center gap-2"
              >
                {isAnalyzing ? (
                  <>
                    <div className="w-5 h-5 border-2 border-current border-t-transparent rounded-full animate-spin" />
                    Analisando com IA...
                  </>
                ) : (
                  <>
                    <Sparkles className="w-5 h-5" />
                    Analisar com IA Jurídica
                  </>
                )}
              </button>
            </div>
          )}

          {/* Extracted Text Preview */}
          {extractedText && !isExtracting && (
            <div className="legal-card">
              <h4 className="font-medium mb-2 flex items-center gap-2">
                <FileText className="w-4 h-4" />
                Texto Extraído (Prévia)
              </h4>
              <div className="max-h-48 overflow-y-auto text-sm text-muted-foreground bg-muted/30 rounded-lg p-3">
                <pre className="whitespace-pre-wrap font-sans">
                  {extractedText.substring(0, 2000)}
                  {extractedText.length > 2000 && "..."}
                </pre>
              </div>
            </div>
          )}
        </div>

        {/* Summary and Chat */}
        <div className="space-y-4">
          <div className="legal-card">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-serif text-xl font-semibold">Análise do Documento</h3>
              {summary && (
                <div className="flex gap-2">
                  <button
                    onClick={copyToClipboard}
                    className="p-2 hover:bg-muted rounded-lg transition-colors"
                    title="Copiar resumo"
                  >
                    <Copy className="w-4 h-4 text-muted-foreground" />
                  </button>
                  <button
                    onClick={downloadSummary}
                    className="p-2 hover:bg-muted rounded-lg transition-colors"
                    title="Baixar resumo"
                  >
                    <Download className="w-4 h-4 text-muted-foreground" />
                  </button>
                </div>
              )}
            </div>

            {isAnalyzing && !summary && (
              <div className="flex flex-col items-center justify-center h-64 space-y-6">
                {/* Animated spinner */}
                <div className="relative">
                  <div className="w-16 h-16 border-4 border-primary/20 rounded-full" />
                  <div className="absolute inset-0 w-16 h-16 border-4 border-primary border-t-transparent rounded-full animate-spin" />
                  <Sparkles className="absolute inset-0 m-auto w-6 h-6 text-primary animate-pulse" />
                </div>
                
                {/* Progress steps */}
                <div className="space-y-2 text-center">
                  <p className="font-medium text-foreground">Analisando documento...</p>
                  <div className="flex flex-col gap-1 text-sm text-muted-foreground">
                    <div className="flex items-center justify-center gap-2">
                      <CheckCircle className="w-4 h-4 text-success" />
                      <span>Texto extraído com sucesso</span>
                    </div>
                    <div className="flex items-center justify-center gap-2">
                      <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                      <span>Processando análise jurídica com IA...</span>
                    </div>
                  </div>
                </div>
                
                {/* Progress bar animation */}
                <div className="w-full max-w-xs">
                  <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                    <div className="h-full bg-gradient-to-r from-primary via-primary/80 to-primary rounded-full animate-[progress_2s_ease-in-out_infinite]" 
                         style={{ width: '60%', animation: 'progress 2s ease-in-out infinite' }} />
                  </div>
                  <p className="text-xs text-muted-foreground text-center mt-2">
                    Isso pode levar alguns segundos...
                  </p>
                </div>
              </div>
            )}

            {summary ? (
              <div className="prose prose-sm max-w-none fade-in max-h-[400px] overflow-y-auto">
                <div className="whitespace-pre-wrap text-sm leading-relaxed">
                  {renderMarkdown(summary)}
                </div>
                {isAnalyzing && (
                  <span className="inline-block w-2 h-4 bg-primary animate-pulse ml-1" />
                )}
              </div>
            ) : (
              !isAnalyzing && (
                <div className="flex flex-col items-center justify-center h-64 text-center">
                  <FileText className="w-12 h-12 text-muted-foreground/30 mb-4" />
                  <p className="text-muted-foreground">
                    Envie um documento PDF para ver a análise jurídica aqui
                  </p>
                  <p className="text-sm text-muted-foreground/60 mt-2">
                    A IA irá identificar tipo, partes, cláusulas e pontos de atenção
                  </p>
                </div>
              )
            )}
          </div>

          {/* Chat Section - Only show after analysis */}
          {summary && (
            <div className="legal-card fade-in">
              <div className="flex items-center gap-2 mb-4">
                <MessageSquare className="w-5 h-5 text-primary" />
                <h3 className="font-serif text-lg font-semibold">Perguntas sobre o Documento</h3>
              </div>

              {/* Chat Messages */}
              {chatMessages.length > 0 && (
                <div
                  ref={chatContainerRef}
                  className="max-h-64 overflow-y-auto space-y-3 mb-4 p-3 bg-muted/30 rounded-lg"
                >
                  {chatMessages.map((msg, i) => (
                    <div
                      key={i}
                      className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                    >
                      <div
                        className={`max-w-[85%] p-3 rounded-lg text-sm ${
                          msg.role === "user"
                            ? "bg-primary text-primary-foreground"
                            : "bg-muted"
                        }`}
                      >
                        <div className="whitespace-pre-wrap">{msg.content}</div>
                        {isAskingQuestion && i === chatMessages.length - 1 && msg.role === "assistant" && (
                          <span className="inline-block w-2 h-4 bg-primary animate-pulse ml-1" />
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Question Input */}
              <div className="flex gap-2">
                <input
                  type="text"
                  value={questionInput}
                  onChange={(e) => setQuestionInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && askQuestion()}
                  placeholder="Faça uma pergunta sobre o documento..."
                  className="flex-1 px-4 py-2 rounded-lg border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                  disabled={isAskingQuestion}
                />
                <button
                  onClick={askQuestion}
                  disabled={!questionInput.trim() || isAskingQuestion}
                  className="legal-button-gold px-4 flex items-center gap-2"
                >
                  {isAskingQuestion ? (
                    <div className="w-5 h-5 border-2 border-current border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <Send className="w-5 h-5" />
                  )}
                </button>
              </div>

              <p className="text-xs text-muted-foreground mt-2">
                Exemplos: "Qual o prazo de vigência?", "Quais são as multas previstas?", "Explique a cláusula 5"
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
