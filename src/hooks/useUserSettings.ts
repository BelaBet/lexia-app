// BUG-05 (corrigido): a tela de Configurações guardava notificações/tema/
// idioma só em useState — "Salvar Configurações" era um toast sem nenhuma
// persistência real. Este hook lê e grava de verdade em user_settings (uma
// linha por usuário, ver migration 20260906010000_user_settings.sql).

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type ThemePreference = "light" | "dark" | "system";
export type LanguagePreference = "pt-BR" | "en";

export interface UserSettings {
  notify_email: boolean;
  notify_push: boolean;
  notify_deadlines: boolean;
  notify_cases: boolean;
  theme: ThemePreference;
  language: LanguagePreference;
}

export const DEFAULT_USER_SETTINGS: UserSettings = {
  notify_email: true,
  notify_push: false,
  notify_deadlines: true,
  notify_cases: true,
  theme: "system",
  language: "pt-BR",
};

export function useUserSettings() {
  return useQuery({
    queryKey: ["user-settings"],
    queryFn: async (): Promise<UserSettings> => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return DEFAULT_USER_SETTINGS;

      const { data, error } = await supabase
        .from("user_settings")
        .select("*")
        .eq("user_id", user.id)
        .maybeSingle();
      if (error) throw error;

      // Nenhuma linha ainda (usuário nunca salvou) — padrão, sem gravar
      // nada até o primeiro "Salvar Configurações". theme/language vêm do
      // banco como `string` (a restrição real é um CHECK, não um enum),
      // daí o cast para as uniões usadas no app.
      return data
        ? { ...DEFAULT_USER_SETTINGS, ...data, theme: data.theme as ThemePreference, language: data.language as LanguagePreference }
        : DEFAULT_USER_SETTINGS;
    },
  });
}

export function useSaveUserSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (settings: UserSettings) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Usuário não autenticado");

      const { error } = await supabase
        .from("user_settings")
        .upsert({ user_id: user.id, ...settings }, { onConflict: "user_id" });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["user-settings"] });
    },
  });
}
