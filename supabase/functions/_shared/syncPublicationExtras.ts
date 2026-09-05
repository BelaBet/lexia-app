import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.57.0";

function firstString(...values: unknown[]): string | null {
  for (const v of values) {
    if (typeof v === "string" && v.trim().length > 0) return v.trim();
  }
  return null;
}

export async function syncDeadlineEvents(
  adminClient: SupabaseClient,
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
    const { data: existing, error: findError } = await adminClient
      .from("events")
      .select("id")
      .eq("publication_id", publication.id)
      .eq("type", deadline.type)
      .maybeSingle();

    if (findError) {
      console.error("Error checking existing deadline event:", findError);
      continue;
    }

    if (!deadline.date) {
      if (existing) {
        const { error: deleteError } = await adminClient.from("events").delete().eq("id", existing.id);
        if (deleteError) console.error("Error deleting deadline event:", deleteError);
      }
      continue;
    }

    if (existing) {
      const { error: updateError } = await adminClient
        .from("events")
        .update({ event_date: deadline.date })
        .eq("id", existing.id);
      if (updateError) console.error("Error updating deadline event:", updateError);
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
  adminClient: SupabaseClient,
  publicationId: string,
  payload: Record<string, unknown>,
): Promise<void> {
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
