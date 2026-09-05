import { useState } from "react";
import { Save, FileText, Calendar, Download, ChevronDown, Loader2, FileType, FileType2, ScanText, Eye, EyeOff } from "lucide-react";
import { jsPDF } from "jspdf";
import { Document, Packer, Paragraph, TextRun, HeadingLevel } from "docx";
import { saveAs } from "file-saver";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useCreateDocument } from "@/hooks/useDocuments";
import { getTodayDateStr } from "@/hooks/useEvents";
import { toast } from "sonner";

interface PDFSaveOptionsProps {
  extractedText: string;
  summary: string;
  fileName: string;
  disabled?: boolean;
}

export function PDFSaveOptions({ 
  extractedText, 
  summary, 
  fileName, 
  disabled = false 
}: PDFSaveOptionsProps) {
  const [showDocumentDialog, setShowDocumentDialog] = useState(false);
  const [showEventDialog, setShowEventDialog] = useState(false);
  const [documentTitle, setDocumentTitle] = useState("");
  const [eventTitle, setEventTitle] = useState("");
  const [eventDate, setEventDate] = useState(() => getTodayDateStr());
  const [eventTime, setEventTime] = useState("09:00");
  const [isSaving, setIsSaving] = useState(false);
  const [showPreview, setShowPreview] = useState(false);

  const createDocument = useCreateDocument();

  const getContentToSave = () => {
    let content = "";
    if (summary) {
      content += "=== ANÁLISE DO DOCUMENTO ===\n\n" + summary + "\n\n";
    }
    if (extractedText) {
      content += "=== TEXTO EXTRAÍDO ===\n\n" + extractedText;
    }
    return content;
  };

  const handleSaveToDocuments = async () => {
    if (!documentTitle.trim()) {
      toast.error("Digite um título para o documento");
      return;
    }

    setIsSaving(true);
    try {
      await createDocument.mutateAsync({
        title: documentTitle.trim(),
        type: "PDF Extraído",
        content: getContentToSave(),
        status: "completed",
      });
      setShowDocumentDialog(false);
      setDocumentTitle("");
      toast.success("Documento salvo com sucesso!");
    } catch (error) {
      console.error("Error saving document:", error);
      toast.error("Erro ao salvar documento");
    } finally {
      setIsSaving(false);
    }
  };

  const handleAddToEvent = async () => {
    if (!eventTitle.trim()) {
      toast.error("Digite um título para o evento");
      return;
    }

    setIsSaving(true);
    try {
      // Create a text file blob to be used as attachment
      const textContent = getContentToSave();
      const blob = new Blob([textContent], { type: "text/plain" });
      const file = new File([blob], `${fileName.replace(".pdf", "")}-texto.txt`, { 
        type: "text/plain" 
      });

      // Import useCreateEvent dynamically
      const { supabase } = await import("@/integrations/supabase/client");
      
      // Get current user
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Usuário não autenticado");

      // Create the event
      const { data: event, error: eventError } = await supabase
        .from("events")
        .insert({
          title: eventTitle.trim(),
          description: `Texto extraído do arquivo: ${fileName}`,
          event_date: eventDate,
          event_time: eventTime,
          type: "meeting",
          user_id: user.id,
          notification_enabled: false,
        })
        .select()
        .single();

      if (eventError) throw eventError;

      // Upload the file as attachment
      const filePath = `${user.id}/${event.id}/${Date.now()}_${file.name}`;
      const { error: uploadError } = await supabase.storage
        .from("event-files")
        .upload(filePath, file);

      let attachmentSaved = false;
      if (uploadError) {
        console.error("Error uploading file:", uploadError);
      } else {
        // Create attachment record
        const { error: attachmentError } = await supabase
          .from("event_attachments")
          .insert({
            event_id: event.id,
            file_name: file.name,
            file_path: filePath,
            file_size: file.size,
            file_type: file.type,
          });
        if (attachmentError) {
          console.error("Error creating attachment record:", attachmentError);
        } else {
          attachmentSaved = true;
        }
      }

      setShowEventDialog(false);
      setEventTitle("");
      if (attachmentSaved) {
        toast.success("Evento criado com anexo!");
      } else {
        toast.warning("Evento criado, mas não foi possível anexar o arquivo. Tente anexar novamente pela Agenda.");
      }
    } catch (error) {
      console.error("Error creating event:", error);
      toast.error("Erro ao criar evento");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDownloadTxt = () => {
    const content = getContentToSave();
    const blob = new Blob([content], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${fileName.replace(".pdf", "")}-texto-extraido.txt`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Download TXT iniciado!");
  };

  const handleDownloadPdf = () => {
    const content = getContentToSave();
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    const margin = 15;
    const maxWidth = pageWidth - margin * 2;
    
    doc.setFontSize(16);
    doc.text("Documento Extraído", margin, 20);
    
    doc.setFontSize(10);
    doc.text(`Arquivo: ${fileName}`, margin, 30);
    doc.text(`Data: ${new Date().toLocaleDateString("pt-BR")}`, margin, 36);
    
    doc.setFontSize(11);
    const lines = doc.splitTextToSize(content, maxWidth);
    let y = 50;
    
    for (const line of lines) {
      if (y > doc.internal.pageSize.getHeight() - 20) {
        doc.addPage();
        y = 20;
      }
      doc.text(line, margin, y);
      y += 6;
    }
    
    doc.save(`${fileName.replace(".pdf", "")}-texto-extraido.pdf`);
    toast.success("Download PDF iniciado!");
  };

  const handleDownloadDocx = async () => {
    const content = getContentToSave();
    const paragraphs = content.split("\n").filter(p => p.trim());
    
    const doc = new Document({
      sections: [{
        properties: {},
        children: [
          new Paragraph({
            children: [
              new TextRun({
                text: "Documento Extraído",
                bold: true,
                size: 32,
              }),
            ],
            heading: HeadingLevel.HEADING_1,
          }),
          new Paragraph({
            children: [
              new TextRun({
                text: `Arquivo: ${fileName} | Data: ${new Date().toLocaleDateString("pt-BR")}`,
                italics: true,
                size: 20,
              }),
            ],
          }),
          new Paragraph({ children: [] }),
          ...paragraphs.map(text => 
            new Paragraph({
              children: [
                new TextRun({
                  text,
                  size: 22,
                }),
              ],
            })
          ),
        ],
      }],
    });

    const blob = await Packer.toBlob(doc);
    saveAs(blob, `${fileName.replace(".pdf", "")}-texto-extraido.docx`);
    toast.success("Download Word iniciado!");
  };

  const handleDownloadOcr = () => {
    // OCR específico - apenas o texto bruto extraído sem análise
    const blob = new Blob([extractedText || ""], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${fileName.replace(".pdf", "")}-ocr.txt`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Download OCR iniciado!");
  };

  const openDocumentDialog = () => {
    setDocumentTitle(fileName.replace(".pdf", ""));
    setShowDocumentDialog(true);
  };

  const openEventDialog = () => {
    setEventTitle(`Documento: ${fileName.replace(".pdf", "")}`);
    setShowEventDialog(true);
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            disabled={disabled || (!extractedText && !summary)}
            className="legal-button-primary flex items-center gap-2"
          >
            <Save className="w-4 h-4" />
            Salvar Dados
            <ChevronDown className="w-4 h-4" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuLabel>Escolha onde salvar</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={openDocumentDialog} className="cursor-pointer">
            <FileText className="w-4 h-4 mr-2" />
            Salvar em Documentos
          </DropdownMenuItem>
          <DropdownMenuItem onClick={openEventDialog} className="cursor-pointer">
            <Calendar className="w-4 h-4 mr-2" />
            Adicionar à Agenda
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuLabel className="text-xs text-muted-foreground">Formatos de Download</DropdownMenuLabel>
          <DropdownMenuItem onClick={handleDownloadPdf} className="cursor-pointer">
            <FileText className="w-4 h-4 mr-2" />
            Baixar como PDF
          </DropdownMenuItem>
          <DropdownMenuItem onClick={handleDownloadDocx} className="cursor-pointer">
            <FileType2 className="w-4 h-4 mr-2" />
            Baixar como Word (.docx)
          </DropdownMenuItem>
          <DropdownMenuItem onClick={handleDownloadTxt} className="cursor-pointer">
            <FileType className="w-4 h-4 mr-2" />
            Baixar como Texto (.txt)
          </DropdownMenuItem>
          <DropdownMenuItem onClick={handleDownloadOcr} className="cursor-pointer" disabled={!extractedText}>
            <ScanText className="w-4 h-4 mr-2" />
            Baixar OCR (texto bruto)
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Dialog: Save to Documents */}
      <Dialog open={showDocumentDialog} onOpenChange={setShowDocumentDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Salvar em Documentos</DialogTitle>
            <DialogDescription>
              O texto extraído e a análise serão salvos como um novo documento.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="doc-title">Título do Documento</Label>
              <Input
                id="doc-title"
                value={documentTitle}
                onChange={(e) => setDocumentTitle(e.target.value)}
                placeholder="Ex: Contrato de Prestação de Serviços"
              />
            </div>
            <div className="text-sm text-muted-foreground bg-muted/50 p-3 rounded-lg">
              <p className="font-medium mb-1">Será salvo:</p>
              <ul className="list-disc list-inside space-y-1 text-xs">
                {summary && <li>Análise do documento</li>}
                {extractedText && <li>Texto extraído ({extractedText.length.toLocaleString()} caracteres)</li>}
              </ul>
            </div>
            
            {/* Preview Section */}
            <Collapsible open={showPreview} onOpenChange={setShowPreview}>
              <CollapsibleTrigger asChild>
                <Button variant="outline" className="w-full justify-between">
                  <span className="flex items-center gap-2">
                    {showPreview ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    {showPreview ? "Ocultar Preview" : "Ver Preview do Documento"}
                  </span>
                  <ChevronDown className={`w-4 h-4 transition-transform ${showPreview ? "rotate-180" : ""}`} />
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent className="mt-3">
                <div className="border rounded-lg overflow-hidden">
                  <div className="bg-muted/30 px-3 py-2 border-b">
                    <p className="text-xs font-medium text-muted-foreground">Preview do conteúdo que será salvo</p>
                  </div>
                  <ScrollArea className="h-[200px]">
                    <div className="p-3 space-y-4 text-sm">
                      {summary && (
                        <div>
                          <h4 className="font-semibold text-primary mb-2">📋 Análise do Documento</h4>
                          <div className="whitespace-pre-wrap text-muted-foreground text-xs leading-relaxed">
                            {summary}
                          </div>
                        </div>
                      )}
                      {extractedText && (
                        <div>
                          <h4 className="font-semibold text-primary mb-2">📄 Texto Extraído</h4>
                          <div className="whitespace-pre-wrap text-muted-foreground text-xs leading-relaxed">
                            {extractedText.substring(0, 2000)}
                            {extractedText.length > 2000 && (
                              <span className="text-primary font-medium">... (+ {(extractedText.length - 2000).toLocaleString()} caracteres)</span>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  </ScrollArea>
                </div>
              </CollapsibleContent>
            </Collapsible>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDocumentDialog(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSaveToDocuments} disabled={isSaving}>
              {isSaving ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Salvando...
                </>
              ) : (
                <>
                  <Save className="w-4 h-4 mr-2" />
                  Salvar
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: Add to Event */}
      <Dialog open={showEventDialog} onOpenChange={setShowEventDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Adicionar à Agenda</DialogTitle>
            <DialogDescription>
              Crie um evento na agenda com o texto extraído como anexo.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="event-title">Título do Evento</Label>
              <Input
                id="event-title"
                value={eventTitle}
                onChange={(e) => setEventTitle(e.target.value)}
                placeholder="Ex: Revisar contrato XYZ"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="event-date">Data</Label>
                <Input
                  id="event-date"
                  type="date"
                  value={eventDate}
                  onChange={(e) => setEventDate(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="event-time">Hora</Label>
                <Input
                  id="event-time"
                  type="time"
                  value={eventTime}
                  onChange={(e) => setEventTime(e.target.value)}
                />
              </div>
            </div>
            <div className="text-sm text-muted-foreground bg-muted/50 p-3 rounded-lg">
              <p className="font-medium mb-1">Anexo que será adicionado:</p>
              <p className="text-xs">{fileName.replace(".pdf", "")}-texto.txt</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEventDialog(false)}>
              Cancelar
            </Button>
            <Button onClick={handleAddToEvent} disabled={isSaving}>
              {isSaving ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Criando...
                </>
              ) : (
                <>
                  <Calendar className="w-4 h-4 mr-2" />
                  Criar Evento
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
