import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface WhiteLabelSettings {
  id: boolean;
  brand_name: string;
  tagline: string;
  logo_url: string | null;
  primary_color: string;
  sidebar_color: string;
  updated_at: string;
}

// Valores usados enquanto a configuração ainda não carregou, para a tela
// não "piscar" sem marca nenhuma.
export const DEFAULT_BRANDING: Pick<
  WhiteLabelSettings,
  "brand_name" | "tagline" | "logo_url" | "primary_color" | "sidebar_color"
> = {
  brand_name: "LexIA",
  tagline: "Assistente Jurídico Inteligente",
  logo_url: null,
  primary_color: "#B8860B",
  sidebar_color: "#152238",
};

export function useWhiteLabelSettings() {
  return useQuery({
    queryKey: ["white_label_settings"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("white_label_settings")
        .select("*")
        .eq("id", true)
        .maybeSingle();
      if (error) throw error;
      return (data as WhiteLabelSettings) || null;
    },
    staleTime: 5 * 60 * 1000,
  });
}

export interface UpdateWhiteLabelSettingsInput {
  brand_name?: string;
  tagline?: string;
  logo_url?: string | null;
  primary_color?: string;
  sidebar_color?: string;
}

export function useUpdateWhiteLabelSettings() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (updates: UpdateWhiteLabelSettingsInput) => {
      const { data, error } = await supabase
        .from("white_label_settings")
        .update(updates)
        .eq("id", true)
        .select()
        .single();

      if (error) throw error;
      return data as WhiteLabelSettings;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["white_label_settings"] });
      toast.success("Marca da plataforma atualizada!");
    },
    onError: (error) => {
      console.error("Error updating white label settings:", error);
      toast.error("Erro ao salvar a marca da plataforma");
    },
  });
}

export function useUploadBrandLogo() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (file: File) => {
      const ext = file.name.split(".").pop() || "png";
      const path = `logo-${Date.now()}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from("branding")
        .upload(path, file, { upsert: true });
      if (uploadError) throw uploadError;

      const { data: publicUrlData } = supabase.storage.from("branding").getPublicUrl(path);

      const { data, error } = await supabase
        .from("white_label_settings")
        .update({ logo_url: publicUrlData.publicUrl })
        .eq("id", true)
        .select()
        .single();

      if (error) throw error;
      return data as WhiteLabelSettings;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["white_label_settings"] });
      toast.success("Logo atualizado!");
    },
    onError: (error) => {
      console.error("Error uploading brand logo:", error);
      toast.error("Erro ao enviar o logo");
    },
  });
}
