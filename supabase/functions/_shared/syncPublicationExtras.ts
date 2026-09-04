// Compartilhado entre publication-webhook e poll-jusbrasil: depois que uma
// publicação é gravada, este módulo cuida de duas coisas que devem
// acontecer automaticamente, sem depender de ação manual do advogado:
//
// 1) syncDeadlineEvents — cria (ou atualiza) na Agenda um evento para cada
//    prazo da publicação (externo e interno), do mesmo jeito que acontece
//    quando o prazo é lançado manualmente pela tela de Publicações (ver
//    `syncPublicationDeadlineEvents` em src/hooks/usePublications.ts —
//    mantenha os dois em sincronia se a lógica mudar).
//
// 2) attachDocumentIfAvailable — quando o payload da fonte externa já traz
//    o documento/anexo do processo (PDF da petição, decisão etc.), baixa e
//    guarda esse arquivo junto da publicação, para não depender de upload
//    manual depois. O nome do campo com a URL do documento varia por
//    provedor e não estava confirmado no momento em que este código foi
//    escrito — TODO: ajustar a lista de campos abaixo contra um payload de
//    exemplo real assim que houver acesso à conta ativa.

// deno-lint-ignore no-explicit-any
type AdminClient = any;

function firstString(...values: unknown[]): string | null {
  for (const v of values) {
    if (typeof v === "string" && v.trim().length > 0) return v.trim();
  }
  return null;
}

export async function syncDeadlineEvents(
  adminClient: AdminClient,
  userId: string,
  publication: {
    id: string;
    case_id: string | null;
    process_number: string | null;
    content: string;
    external_deadline: string | null;
    internal_deadline: string | null;
  },
): Promise<void> {
  const identifier = publication.process_number || publication.content.slice(0, 60);
  const deadlines: Array<{ type: string; date: string | null; label: string; priority: "high" | "medium" }> = [
    { type: "prazo_externo", date: publication.external_deadline, label: "Prazo externo", priority: "high" },
    { type: "prazo_interno", date: publication.internal_deadline, label: "Prazo interno", priority: "medium" },
  ];

  for (const deadline of deadlines) {
    const { data: existing } = await adminClient
      .from("events")
      .select("id")
      .eq("publication_id", publication.id)
      .eq("type", deadline.type)
      .maybeSingle();

    if (!deadline.date) {
      if (existing) {
        await adminClient.from("events").delete().eq("id", existing.id);
      }
      continue;
    }

    if (existing) {
      await adminClient.from("events").update({ event_date: deadline.date }).eq("id", existing.id);
    } else {
      const { error } = await adminClient.from("events").insert({
        user_id: userId,
        title: `${deadline.label}: ${identifier}`,
        description: publication.content.slice(0, 500),
        event_date: deadline.date,
        event_time: "09:00:00",
        type: deadline.type,
        case_id: publication.case_id,
        publication_id: publication.id,
        status: "pending",
        priority: deadline.priority,
        notification_enabled: true,
        notification_minutes_before: 60 * 24,
      });
      if (error) console.error("Error creating deadline event:", error);
    }
  }
}

export async function attachDocumentIfAvailable(
  adminClient: AdminClient,
  publicationId: string,
  // deno-lint-ignore no-explicit-any
  payload: Record<string, any>,
): Promise<void> {
  // TODO: confirmar o(s) nome(s) real(is) do campo com a URL do documento
  // assim que houver um payload de exemplo real do provedor.
  const documentUrl = firstString(
    payload.documento_url,
    payload.documentoUrl,
    payload.anexo_url,
    payload.anexoUrl,
    payload.arquivo_url,
    payload.arquivoUrl,
    payload.pdf_url,
    payload.pdfUrl,
    payload.url_documento,
    payload.link_documento,
  );
  if (!documentUrl) return;

  try {
    const response = await fetch(documentUrl);
    if (!response.ok) {
      console.error(`Failed to download publication document (${response.status}): ${documentUrl}`);
      return;
    }

    const contentType = response.headers.get("content-type") || "application/octet-stream";
    const blob = await response.blob();
    const extension = contentType.includes("pdf") ? "pdf" : (documentUrl.split(".").pop() || "bin").slice(0, 10);
    const fileName = firstString(payload.documento_nome, payload.documentoNome) || `documento-${Date.now()}.${extension}`;
    const filePath = `${publicationId}/${Date.now()}_${fileName}`;

    const { error: uploadError } = await adminClient.storage
      .from("publication-attachments")
      .upload(filePath, blob, { contentType });
    if (uploadError) {
      console.error("Error uploading publication document:", uploadError);
      return;
    }

    const { error: insertError } = await adminClient.from("publication_attachments").insert({
      publication_id: publicationId,
      file_name: fileName,
      file_path: filePath,
      file_size: blob.size,
      file_type: contentType,
      source: "api",
    });
    if (insertError) console.error("Error saving publication attachment record:", insertError);
  } catch (err) {
    console.error("Error fetching publication document:", err instanceof Error ? err.message : String(err));
  }
}
