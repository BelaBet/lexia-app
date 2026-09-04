import { useState, useEffect, useRef } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Palette, Upload, Loader2, ShieldAlert } from "lucide-react";
import {
  useWhiteLabelSettings,
  useUpdateWhiteLabelSettings,
  useUploadBrandLogo,
  DEFAULT_BRANDING,
} from "@/hooks/useWhiteLabelSettings";

export function BrandingSettings() {
  const { hasRole } = useAuth();
  const isAdmin = hasRole("admin");

  const { data: settings, isLoading } = useWhiteLabelSettings();
  const updateSettings = useUpdateWhiteLabelSettings();
  const uploadLogo = useUploadBrandLogo();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [brandName, setBrandName] = useState(DEFAULT_BRANDING.brand_name);
  const [tagline, setTagline] = useState(DEFAULT_BRANDING.tagline);
  const [primaryColor, setPrimaryColor] = useState(DEFAULT_BRANDING.primary_color);
  const [sidebarColor, setSidebarColor] = useState(DEFAULT_BRANDING.sidebar_color);

  useEffect(() => {
    if (!settings) return;
    setBrandName(settings.brand_name);
    setTagline(settings.tagline);
    setPrimaryColor(settings.primary_color);
    setSidebarColor(settings.sidebar_color);
  }, [settings]);

  if (!isAdmin) {
    return (
      <div className="legal-card flex items-start gap-3">
        <ShieldAlert className="w-5 h-5 text-muted-foreground mt-0.5 shrink-0" />
        <div>
          <h3 className="font-semibold">Acesso restrito</h3>
          <p className="text-sm text-muted-foreground mt-1">
            Só administradores desta conta podem alterar a marca da plataforma (logo, nome e cores).
          </p>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex justify-center py-10">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const handleSave = () => {
    updateSettings.mutate({
      brand_name: brandName.trim() || DEFAULT_BRANDING.brand_name,
      tagline: tagline.trim(),
      primary_color: primaryColor,
      sidebar_color: sidebarColor,
    });
  };

  const handleLogoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      alert("O arquivo do logo deve ter no máximo 2MB.");
      return;
    }
    uploadLogo.mutate(file);
  };

  const logoUrl = settings?.logo_url;

  return (
    <div className="space-y-6">
      <div className="legal-card">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
            <Palette className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h3 className="font-semibold">Marca da Plataforma (White Label)</h3>
            <p className="text-sm text-muted-foreground">
              Personalize o logo, o nome e as cores desta cópia do sistema.
            </p>
          </div>
        </div>

        <div className="space-y-6 mt-6">
          {/* Logo */}
          <div className="space-y-2">
            <Label>Logo</Label>
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 rounded-lg border border-border flex items-center justify-center bg-muted overflow-hidden shrink-0">
                {logoUrl ? (
                  <img src={logoUrl} alt="Logo" className="w-full h-full object-contain" />
                ) : (
                  <span className="text-xs text-muted-foreground text-center px-1">Sem logo</span>
                )}
              </div>
              <div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/svg+xml,image/webp"
                  className="hidden"
                  onChange={handleLogoChange}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploadLogo.isPending}
                >
                  {uploadLogo.isPending ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Upload className="w-3.5 h-3.5" />
                  )}
                  Enviar logo
                </Button>
                <p className="text-xs text-muted-foreground mt-1">PNG, JPG, SVG ou WebP, até 2MB.</p>
              </div>
            </div>
          </div>

          {/* Nome e slogan */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="brand-name">Nome do sistema</Label>
              <Input
                id="brand-name"
                value={brandName}
                onChange={(e) => setBrandName(e.target.value)}
                placeholder="LexIA"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="brand-tagline">Frase de apoio (login)</Label>
              <Input
                id="brand-tagline"
                value={tagline}
                onChange={(e) => setTagline(e.target.value)}
                placeholder="Gestor Inteligente de Processos"
              />
            </div>
          </div>

          {/* Cores */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="primary-color">Cor principal (botões e destaques)</Label>
              <div className="flex items-center gap-2">
                <input
                  id="primary-color"
                  type="color"
                  value={primaryColor}
                  onChange={(e) => setPrimaryColor(e.target.value)}
                  className="w-10 h-10 rounded border border-border cursor-pointer bg-transparent"
                />
                <Input value={primaryColor} onChange={(e) => setPrimaryColor(e.target.value)} className="font-mono" />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="sidebar-color">Cor do menu lateral</Label>
              <div className="flex items-center gap-2">
                <input
                  id="sidebar-color"
                  type="color"
                  value={sidebarColor}
                  onChange={(e) => setSidebarColor(e.target.value)}
                  className="w-10 h-10 rounded border border-border cursor-pointer bg-transparent"
                />
                <Input value={sidebarColor} onChange={(e) => setSidebarColor(e.target.value)} className="font-mono" />
              </div>
            </div>
          </div>

          <Button type="button" onClick={handleSave} disabled={updateSettings.isPending} className="gap-1.5">
            {updateSettings.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
            Salvar marca
          </Button>

          <p className="text-xs text-muted-foreground">
            As mudanças aparecem para todos que acessarem o sistema (inclusive na tela de login), a partir do
            próximo carregamento da página.
          </p>
        </div>
      </div>
    </div>
  );
}
