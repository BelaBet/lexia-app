import { createContext, useContext, useEffect, useRef, useState, ReactNode } from "react";
import { User, Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

interface Profile {
  id: string;
  user_id: string;
  full_name: string | null;
  avatar_url: string | null;
  phone: string | null;
  oab_number: string | null;
  specialty: string | null;
}

interface UserRole {
  role: "admin" | "user" | "premium" | "supremo";
}

interface AuthContextType {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  roles: UserRole[];
  loading: boolean;
  signUp: (email: string, password: string, fullName: string) => Promise<{ error: Error | null }>;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
  updateProfile: (data: Partial<Profile>) => Promise<{ error: Error | null }>;
  hasRole: (role: "admin" | "user" | "premium" | "supremo") => boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [roles, setRoles] = useState<UserRole[]>([]);
  const [loading, setLoading] = useState(true);

  // Guarda de "resposta desatualizada": fetchProfile/fetchRoles são
  // assíncronas e disparadas a partir do id do usuário da sessão no
  // momento da chamada. Sem isto, um logout rápido seguido de login com
  // outra conta pode fazer a resposta do fetch da conta ANTERIOR chegar
  // depois da troca e sobrescrever profile/roles com o dado de quem não
  // é mais o usuário atual — este ref sempre reflete o id mais recente
  // solicitado, e cada fetch só aplica o resultado se ainda for o atual.
  const currentUserIdRef = useRef<string | null>(null);

  const fetchProfile = async (userId: string) => {
    const { data, error } = await supabase
      .from("profiles")
      .select("*")
      .eq("user_id", userId)
      .single();

    if (currentUserIdRef.current !== userId) return;

    if (error) {
      console.error("Error fetching profile:", error);
      return;
    }
    if (data) setProfile(data as Profile);
  };

  const fetchRoles = async (userId: string) => {
    const { data, error } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId);

    if (currentUserIdRef.current !== userId) return;

    if (error) {
      console.error("Error fetching roles:", error);
      return;
    }
    if (data) setRoles(data as UserRole[]);
  };

  useEffect(() => {
    // Atualiza session/user/currentUserIdRef de forma síncrona (seguro
    // chamar direto dentro do callback do onAuthStateChange); o
    // carregamento de profile/roles é feito à parte, ver loadUserData.
    const syncSessionState = (session: Session | null) => {
      setSession(session);
      setUser(session?.user ?? null);
      currentUserIdRef.current = session?.user?.id ?? null;
      if (!session?.user) {
        setProfile(null);
        setRoles([]);
      }
      setLoading(false);
    };

    const loadUserData = (userId: string) => {
      fetchProfile(userId);
      fetchRoles(userId);
    };

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        syncSessionState(session);
        // Documentação do Supabase recomenda NUNCA chamar outros métodos
        // supabase.* de forma síncrona dentro deste callback (risco de
        // deadlock, especialmente em TOKEN_REFRESHED) — por isso o
        // setTimeout(…, 0) escapa do contexto síncrono do listener.
        if (session?.user) {
          const userId = session.user.id;
          setTimeout(() => loadUserData(userId), 0);
        }
      }
    );

    supabase.auth.getSession().then(({ data: { session } }) => {
      syncSessionState(session);
      if (session?.user) loadUserData(session.user.id);
    });

    return () => subscription.unsubscribe();
  }, []);

  const signUp = async (email: string, password: string, fullName: string) => {
    // Validate and sanitize full_name before sending
    const sanitizedName = fullName.trim().substring(0, 100);
    if (!sanitizedName) {
      return { error: new Error('Nome completo é obrigatório') };
    }

    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: window.location.origin,
        data: {
          full_name: sanitizedName,
        },
      },
    });
    return { error };
  };

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    return { error };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setSession(null);
    setProfile(null);
    setRoles([]);
  };

  const updateProfile = async (data: Partial<Profile>) => {
    if (!user) return { error: new Error("Not authenticated") };

    const { error } = await supabase
      .from("profiles")
      .update(data)
      .eq("user_id", user.id);

    if (!error) {
      await fetchProfile(user.id);
    }

    return { error };
  };

  const hasRole = (role: "admin" | "user" | "premium" | "supremo") => {
    return roles.some((r) => r.role === role);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        profile,
        roles,
        loading,
        signUp,
        signIn,
        signOut,
        updateProfile,
        hasRole,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
