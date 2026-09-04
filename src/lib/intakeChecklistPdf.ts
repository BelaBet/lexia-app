import { jsPDF } from "jspdf";

interface ChecklistSection {
  title: string;
  items: string[];
}

const SECTIONS: ChecklistSection[] = [
  {
    title: "Dados do Cliente",
    items: [
      "Nome completo",
      "CPF/CNPJ",
      "RG (número e órgão emissor)",
      "Endereço completo",
      "Telefone e e-mail",
      "Estado civil e profissão",
    ],
  },
  {
    title: "Dados do Processo",
    items: [
      "Tipo de ação/serviço solicitado",
      "Parte contrária (nome e qualificação, se houver)",
      "Número do processo (se já existir)",
      "Vara/Comarca ou órgão responsável",
      "Valor da causa (se aplicável)",
      "Prazo ou data-limite conhecida",
    ],
  },
  {
    title: "Documentos a Anexar",
    items: [
      "RG e CPF (cópia)",
      "Comprovante de residência",
      "Procuração assinada",
      "Contrato ou documento que originou o processo",
      "Comprovantes de pagamento, se houver",
      "Outros documentos relevantes",
    ],
  },
];

/**
 * Generates a printable, single-page PDF checklist for the user to fill out
 * (by hand, on paper) with the information a lawyer needs before that
 * information is entered into the system — reduces back-and-forth when
 * starting a new case or document.
 */
export function generateIntakeChecklistPdf(): void {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 16;
  const contentWidth = pageWidth - margin * 2;
  let y = margin;

  // Header
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.text("Checklist de Coleta de Dados", margin, y);
  y += 6;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(90, 90, 90);
  doc.text(
    "Preencha antes de enviar as informações ao sistema. Isso ajuda a organizar o processo e evita retrabalho.",
    margin,
    y,
  );
  doc.setTextColor(0, 0, 0);
  y += 4;
  doc.setDrawColor(200, 200, 200);
  doc.line(margin, y, pageWidth - margin, y);
  y += 7;

  const checkboxSize = 4;
  const lineHeight = 7.2;

  for (const section of SECTIONS) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.text(section.title, margin, y);
    y += 5.5;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(10.5);
    for (const item of section.items) {
      // Checkbox
      doc.setDrawColor(60, 60, 60);
      doc.rect(margin, y - checkboxSize + 1.5, checkboxSize, checkboxSize);
      // Item label
      doc.text(item, margin + checkboxSize + 3, y);
      // Fill-in line for the value
      const labelWidth = doc.getTextWidth(item);
      const lineStartX = margin + checkboxSize + 3 + labelWidth + 4;
      if (lineStartX < margin + contentWidth - 15) {
        doc.setDrawColor(180, 180, 180);
        doc.line(lineStartX, y, margin + contentWidth, y);
      }
      y += lineHeight;
    }
    y += 2;
  }

  // Notes section fills remaining space on the page
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.text("Observações", margin, y);
  y += 6;

  doc.setDrawColor(180, 180, 180);
  const notesBottom = pageHeight - margin - 6;
  for (let lineY = y; lineY <= notesBottom; lineY += 8) {
    doc.line(margin, lineY, margin + contentWidth, lineY);
  }

  // Footer
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(140, 140, 140);
  doc.text(
    `Gerado por LexIA em ${new Date().toLocaleDateString("pt-BR")} — documento apenas para coleta manual, não constitui aconselhamento jurídico.`,
    margin,
    pageHeight - 6,
  );

  doc.save("checklist-coleta-dados.pdf");
}
