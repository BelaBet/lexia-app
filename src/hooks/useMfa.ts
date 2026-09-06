// BUG-07 (corrigido): o botão "Autenticação de Dois Fatores" não tinha
// nenhuma ação associada. Usa o suporte nativo a MFA/TOTP do Supabase Auth
// (auth.mfa.*) — não é preciso nenhuma tabela própria, o GoTrue já guarda
// os fatores. A imposição no login (exigir o código quando há fator
// verificado) usa useMfaChallengeRequired abaixo, consumido tanto por
// src/pages/Auth.tsx (mostra o desafio) quanto por
// src/components/auth/ProtectedRoute.tsx (bloqueia acesso direto ao app
// numa segunda aba/URL sem completar o desafio na primeira).

import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { User } from "@supabase/supabase-js";

// A sessão de senha sozinha já é uma sessão válida (nível "aal1") — sem
// checar o AAL explicitamente, ter um fator TOTP verificado não bloqueava
// nada de verdade, só decorava a tela de Configurações.
export function useMfaChallengeRequired(user: User | null) {
  const [checking, setChecking] = useState(true);
  const [required, setRequired] = useState(false);

  useEffect(() => {
    if (!user) {
      setChecking(false);
      setRequired(false);
      return;
    }
    let cancelled = false;
    setChecking(true);
    supabase.auth.mfa.getAuthenticatorAssuranceLevel().then(({ data, error }) => {
      if (cancelled) return;
      const needsChallenge = !error && !!data && data.nextLevel === "aal2" && data.currentLevel !== data.nextLevel;
      setRequired(needsChallenge);
      setChecking(false);
    });
    return () => {
      cancelled = true;
    };
  }, [user]);

  return { checking, required };
}

export function useMfaFactors() {
  return useQuery({
    queryKey: ["mfa-factors"],
    queryFn: async () => {
      const { data, error } = await supabase.auth.mfa.listFactors();
      if (error) throw error;
      return data.totp;
    },
  });
}

export function useEnrollMfa() {
  return useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.auth.mfa.enroll({ factorType: "totp" });
      if (error) throw error;
      return data;
    },
  });
}

export function useVerifyMfaEnrollment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ factorId, code }: { factorId: string; code: string }) => {
      const { data: challenge, error: challengeError } = await supabase.auth.mfa.challenge({ factorId });
      if (challengeError) throw challengeError;

      const { error: verifyError } = await supabase.auth.mfa.verify({
        factorId,
        challengeId: challenge.id,
        code,
      });
      if (verifyError) throw verifyError;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["mfa-factors"] });
    },
  });
}

export function useUnenrollMfa() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (factorId: string) => {
      const { error } = await supabase.auth.mfa.unenroll({ factorId });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["mfa-factors"] });
    },
  });
}
