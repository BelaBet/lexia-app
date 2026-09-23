import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

export interface Company {
  id: string;
  name: string;
  legal_name: string | null;
  document: string | null;
  slug: string;
  logo_url: string | null;
  primary_color: string | null;
  secondary_color: string | null;
  status: "active" | "inactive" | "suspended";
  created_at: string;
}

export interface CompanyMember {
  user_id: string;
  full_name: string | null;
  created_at: string;
}

export function useCompanies() {
  return useQuery({
    queryKey: ["companies"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("whitelabel_companies")
        .select("*")
        .order("name");
      if (error) throw error;
      return data as Company[];
    },
  });
}

export function useCompanyBranding(companyId: string | null | undefined) {
  return useQuery({
    queryKey: ["company-branding", companyId],
    queryFn: async () => {
      if (!companyId) return null;
      const { data, error } = await supabase
        .from("whitelabel_companies")
        .select("name, logo_url, primary_color, secondary_color")
        .eq("id", companyId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!companyId,
    staleTime: 5 * 60 * 1000,
  });
}

export interface CreateCompanyInput {
  name: string;
  legal_name?: string;
  document?: string;
  slug?: string;
  logo_url?: string;
  primary_color?: string;
  secondary_color?: string;
}

export function useCreateCompany() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: CreateCompanyInput) => {
      const { data, error } = await supabase.functions.invoke("admin-create-company", { body: input });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data.company as Company;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["companies"] });
      toast({ title: "Empresa cadastrada", description: "A nova empresa já pode receber usuários." });
    },
    onError: (error: Error) => toast({ variant: "destructive", title: "Erro ao cadastrar empresa", description: error.message }),
  });
}

export function useCompanyMembers(companyId: string | null) {
  return useQuery({
    queryKey: ["company-members", companyId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_profiles_for_admin");
      if (error) throw error;
      return (data as (CompanyMember & { company_id: string | null })[])
        .filter((p) => p.company_id === companyId)
        .map(({ user_id, full_name, created_at }) => ({ user_id, full_name, created_at }));
    },
    enabled: !!companyId,
  });
}

export interface InviteCompanyMemberInput {
  company_id: string;
  full_name: string;
  email: string;
}

export function useInviteCompanyMember() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: InviteCompanyMemberInput) => {
      const { data, error } = await supabase.functions.invoke("invite-company-member", { body: input });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data as { success: true; user_id: string | null; company: string; already_existed: boolean };
    },
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["company-members", variables.company_id] });
      toast({
        title: data.already_existed ? "Usuário associado" : "Convite enviado",
        description: data.already_existed
          ? "O usuário já tinha conta e foi associado à empresa."
          : "Um e-mail foi enviado para o usuário definir a senha.",
      });
    },
    onError: (error: Error) => toast({ variant: "destructive", title: "Erro ao convidar usuário", description: error.message }),
  });
}
