import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { User, Mail, Phone, Award, Briefcase, Loader2, Save, Shield } from "lucide-react";
import { toast } from "sonner";

export function ProfilePage() {
  const { user, profile, roles, updateProfile } = useAuth();
  const [isLoading, setIsLoading] = useState(false);

  const [formData, setFormData] = useState({
    full_name: profile?.full_name || "",
    phone: profile?.phone || "",
    oab_number: profile?.oab_number || "",
    specialty: profile?.specialty || "",
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData((prev) => ({
      ...prev,
      [e.target.name]: e.target.value,
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    const { error } = await updateProfile(formData);

    if (error) {
      toast.error("Erro ao atualizar perfil", {
        description: error.message,
      });
    } else {
      toast.success("Perfil atualizado com sucesso!");
    }

    setIsLoading(false);
  };

  const getInitials = (name: string | null) => {
    if (!name) return "U";
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  };

  const getRoleBadge = (role: string) => {
    switch (role) {
      case "admin":
        return <Badge variant="destructive">Administrador</Badge>;
      case "premium":
        return <Badge className="bg-amber-500 hover:bg-amber-600">Premium</Badge>;
      default:
        return <Badge variant="secondary">Usuário</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-serif text-3xl font-bold text-foreground">Meu Perfil</h1>
        <p className="text-muted-foreground mt-1">Gerencie suas informações pessoais</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Profile Card */}
        <Card className="lg:col-span-1">
          <CardHeader className="text-center">
            <div className="flex justify-center mb-4">
              <Avatar className="w-24 h-24">
                <AvatarImage src={profile?.avatar_url || ""} />
                <AvatarFallback className="text-2xl bg-primary text-primary-foreground">
                  {getInitials(profile?.full_name)}
                </AvatarFallback>
              </Avatar>
            </div>
            <CardTitle>{profile?.full_name || "Usuário"}</CardTitle>
            <CardDescription>{user?.email}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <Separator />
              <div className="flex items-start justify-between gap-2">
                <span className="text-sm text-muted-foreground flex items-center gap-2 shrink-0">
                  <Shield className="w-4 h-4" />
                  Nível de Acesso
                </span>
                <div className="flex flex-wrap gap-1 justify-end">
                  {Array.from(new Set(roles.map((r) => r.role))).map((role) => (
                    <span key={role}>{getRoleBadge(role)}</span>
                  ))}
                </div>
              </div>
              {profile?.oab_number && (
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground flex items-center gap-2">
                    <Award className="w-4 h-4" />
                    OAB
                  </span>
                  <span className="text-sm font-medium">{profile.oab_number}</span>
                </div>
              )}
              {profile?.specialty && (
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground flex items-center gap-2">
                    <Briefcase className="w-4 h-4" />
                    Especialidade
                  </span>
                  <span className="text-sm font-medium">{profile.specialty}</span>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Edit Form */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Informações Pessoais</CardTitle>
            <CardDescription>
              Atualize suas informações de perfil profissional
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="full_name" className="flex items-center gap-2">
                    <User className="w-4 h-4" />
                    Nome Completo
                  </Label>
                  <Input
                    id="full_name"
                    name="full_name"
                    value={formData.full_name}
                    onChange={handleChange}
                    placeholder="Dr. João Silva"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="email" className="flex items-center gap-2">
                    <Mail className="w-4 h-4" />
                    E-mail
                  </Label>
                  <Input
                    id="email"
                    type="email"
                    value={user?.email || ""}
                    disabled
                    className="bg-muted"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="phone" className="flex items-center gap-2">
                    <Phone className="w-4 h-4" />
                    Telefone
                  </Label>
                  <Input
                    id="phone"
                    name="phone"
                    value={formData.phone}
                    onChange={handleChange}
                    placeholder="(11) 99999-9999"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="oab_number" className="flex items-center gap-2">
                    <Award className="w-4 h-4" />
                    Número da OAB
                  </Label>
                  <Input
                    id="oab_number"
                    name="oab_number"
                    value={formData.oab_number}
                    onChange={handleChange}
                    placeholder="123456/SP"
                  />
                </div>

                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="specialty" className="flex items-center gap-2">
                    <Briefcase className="w-4 h-4" />
                    Área de Especialização
                  </Label>
                  <Input
                    id="specialty"
                    name="specialty"
                    value={formData.specialty}
                    onChange={handleChange}
                    placeholder="Direito Civil, Trabalhista, etc."
                  />
                </div>
              </div>

              <div className="flex justify-end">
                <Button type="submit" disabled={isLoading}>
                  {isLoading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Salvando...
                    </>
                  ) : (
                    <>
                      <Save className="mr-2 h-4 w-4" />
                      Salvar Alterações
                    </>
                  )}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
