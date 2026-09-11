import { useEffect, useMemo, useRef, useState } from "react";
import { MapPin } from "lucide-react";

export type StateCount = { uf: string; count: number };

const MAP_URL = "https://raw.githubusercontent.com/LucasBassetti/mapa-brasil-svg/master/index.html";

const nameToUf: Record<string, string> = {
  acre: "AC", alagoas: "AL", amapa: "AP", amazonas: "AM", bahia: "BA", ceara: "CE",
  distrito_federal: "DF", espirito_santo: "ES", goias: "GO", maranhao: "MA", mato_grosso: "MT",
  mato_grosso_do_sul: "MS", minas_gerais: "MG", para: "PA", paraiba: "PB", parana: "PR",
  pernambuco: "PE", piaui: "PI", rio_de_janeiro: "RJ", rio_grande_do_norte: "RN",
  rio_grande_do_sul: "RS", rondonia: "RO", roraima: "RR", santa_catarina: "SC",
  sao_paulo: "SP", sergipe: "SE", tocantins: "TO",
};

function normalizeName(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "_");
}

export function BrazilStatesMap({ counts }: { counts: StateCount[] }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [svgMarkup, setSvgMarkup] = useState("");
  const [error, setError] = useState(false);

  const countMap = useMemo(() => new Map(counts.map((item) => [item.uf, item.count])), [counts]);
  const maxCount = Math.max(1, ...counts.map((item) => item.count));
  const total = counts.reduce((sum, item) => sum + item.count, 0);

  useEffect(() => {
    let cancelled = false;
    fetch(MAP_URL)
      .then((response) => {
        if (!response.ok) throw new Error("Falha ao carregar o mapa");
        return response.text();
      })
      .then((html) => {
        if (cancelled) return;
        const doc = new DOMParser().parseFromString(html, "text/html");
        const svg = doc.querySelector("#svg-map");
        if (!svg) throw new Error("SVG não encontrado");
        svg.removeAttribute("width");
        svg.removeAttribute("height");
        svg.setAttribute("class", "h-auto w-full max-w-[520px]");
        setSvgMarkup(svg.outerHTML);
        setError(false);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!svgMarkup || !containerRef.current) return;
    const anchors = Array.from(containerRef.current.querySelectorAll<SVGAElement>("a.estado"));
    anchors.forEach((anchor) => {
      const stateName = anchor.getAttribute("name") || "";
      const uf = nameToUf[normalizeName(stateName)] || "";
      const count = countMap.get(uf) || 0;
      const intensity = count / maxCount;
      const paths = Array.from(anchor.querySelectorAll<SVGPathElement>("path:not(.circle)"));
      const circles = Array.from(anchor.querySelectorAll<SVGPathElement>("path.circle"));
      const label = anchor.querySelector<SVGTextElement>("text");

      paths.forEach((path) => {
        path.style.fill = count > 0
          ? `hsl(var(--primary) / ${Math.max(0.22, 0.28 + intensity * 0.72)})`
          : "hsl(var(--muted))";
        path.style.stroke = "hsl(var(--background))";
        path.style.strokeWidth = "1.3";
        path.style.transition = "fill .18s ease, opacity .18s ease";
      });
      circles.forEach((circle) => {
        circle.style.fill = count > 0 ? "hsl(var(--primary))" : "hsl(var(--muted-foreground) / .35)";
      });
      if (label) {
        label.style.fill = count > 0 ? "hsl(var(--primary-foreground))" : "hsl(var(--foreground))";
        label.style.fontWeight = "700";
        label.style.pointerEvents = "none";
      }
      anchor.style.cursor = "default";
      let title = anchor.querySelector("title");
      if (!title) {
        title = document.createElementNS("http://www.w3.org/2000/svg", "title");
        anchor.prepend(title);
      }
      title.textContent = `${stateName} (${uf}) — ${count} processo${count === 1 ? "" : "s"}`;
    });
  }, [svgMarkup, countMap, maxCount]);

  const ranked = [...counts].sort((a, b) => b.count - a.count);

  return (
    <section className="rounded-xl border bg-card p-3 shadow-sm sm:p-4 lg:p-5">
      <div className="mb-4 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Distribuição geográfica</p>
          <h3 className="mt-1 text-base font-semibold sm:text-lg">Processos por estado</h3>
        </div>
        <p className="text-xs text-muted-foreground">{total} processo(s) com UF identificada</p>
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_260px] lg:items-center">
        <div className="flex min-h-[320px] items-center justify-center rounded-lg border bg-muted/10 p-2 sm:min-h-[390px] sm:p-4">
          {error ? (
            <div className="max-w-sm text-center text-sm text-muted-foreground">
              <MapPin className="mx-auto mb-2 h-6 w-6" />
              Não foi possível carregar a malha do Brasil agora.
            </div>
          ) : !svgMarkup ? (
            <div className="text-sm text-muted-foreground">Carregando mapa do Brasil...</div>
          ) : (
            <div ref={containerRef} className="w-full [&_svg]:mx-auto" dangerouslySetInnerHTML={{ __html: svgMarkup }} />
          )}
        </div>

        <div className="space-y-2">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-1">
            {ranked.map(({ uf, count }) => (
              <div key={uf} className="flex items-center justify-between rounded-md border bg-background px-3 py-2 text-sm">
                <span className="font-semibold">{uf}</span>
                <span className="tabular-nums text-muted-foreground">{count}</span>
              </div>
            ))}
          </div>
          {!ranked.length && <p className="text-sm text-muted-foreground">Nenhum estado identificado nos processos.</p>}
          <div className="pt-2 text-xs leading-5 text-muted-foreground">
            Quanto maior a concentração de processos, maior a intensidade do preenchimento no estado. Passe o cursor sobre o estado para ver o total.
          </div>
        </div>
      </div>
    </section>
  );
}
