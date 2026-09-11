import { useEffect, useMemo, useRef, useState } from "react";
import { MapPin } from "lucide-react";

export type StateCount = { uf: string; count: number };

const MAP_URL = "https://raw.githubusercontent.com/LucasBassetti/mapa-brasil-svg/master/index.html";

const PALETTE = {
  navy: "#18324A",
  navyMid: "#496D82",
  slate: "#8FA8B5",
  paleBlue: "#D6E0E5",
  empty: "#ECEDEA",
  gold: "#C6A15B",
  border: "#FFFFFF",
  text: "#263746",
};

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

function stateColor(count: number, maxCount: number) {
  if (count <= 0) return PALETTE.empty;
  const ratio = count / Math.max(1, maxCount);
  if (ratio <= 0.2) return PALETTE.paleBlue;
  if (ratio <= 0.45) return PALETTE.slate;
  if (ratio <= 0.7) return PALETTE.navyMid;
  return PALETTE.navy;
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
        svg.setAttribute("class", "h-auto w-full max-w-[700px]");
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
      const fill = stateColor(count, maxCount);
      const paths = Array.from(anchor.querySelectorAll<SVGPathElement>("path:not(.circle)"));
      const circles = Array.from(anchor.querySelectorAll<SVGPathElement>("path.circle"));
      const label = anchor.querySelector<SVGTextElement>("text");

      paths.forEach((path) => {
        path.style.fill = fill;
        path.style.stroke = PALETTE.border;
        path.style.strokeWidth = "1.25";
        path.style.transition = "fill .18s ease, stroke .18s ease, stroke-width .18s ease, filter .18s ease";
      });

      circles.forEach((circle) => {
        circle.style.fill = count > 0 ? PALETTE.gold : "#B8C0C5";
        circle.style.stroke = PALETTE.border;
        circle.style.strokeWidth = "0.8";
      });

      if (label) {
        const darkState = count > 0 && count / maxCount > 0.45;
        label.style.fill = darkState ? "#FFFFFF" : PALETTE.text;
        label.style.fontWeight = "700";
        label.style.pointerEvents = "none";
      }

      anchor.style.cursor = "default";
      anchor.onmouseenter = () => {
        paths.forEach((path) => {
          path.style.stroke = PALETTE.gold;
          path.style.strokeWidth = "2.4";
          path.style.filter = "drop-shadow(0 2px 3px rgba(24, 50, 74, .16))";
        });
      };
      anchor.onmouseleave = () => {
        paths.forEach((path) => {
          path.style.stroke = PALETTE.border;
          path.style.strokeWidth = "1.25";
          path.style.filter = "none";
        });
      };

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
      <div className="mb-3 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Distribuição geográfica</p>
          <h3 className="mt-1 text-base font-semibold sm:text-lg">Processos por estado</h3>
        </div>
        <p className="text-[11px] text-muted-foreground">{total} processo(s) com UF identificada</p>
      </div>

      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_150px] lg:items-start">
        <div className="min-w-0">
          <div className="flex min-h-[390px] items-center justify-center rounded-lg border bg-[#F7F7F5] p-1 sm:min-h-[470px] sm:p-2 lg:min-h-[520px]">
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

          <div className="mt-2 flex flex-wrap items-center gap-x-2.5 gap-y-1.5 text-[10px] text-muted-foreground">
            <span className="font-medium text-foreground">Concentração:</span>
            <span className="flex items-center gap-1"><i className="h-2 w-2 rounded-sm" style={{ background: PALETTE.empty }} />0</span>
            <span className="flex items-center gap-1"><i className="h-2 w-2 rounded-sm" style={{ background: PALETTE.paleBlue }} />Baixa</span>
            <span className="flex items-center gap-1"><i className="h-2 w-2 rounded-sm" style={{ background: PALETTE.slate }} />Média</span>
            <span className="flex items-center gap-1"><i className="h-2 w-2 rounded-sm" style={{ background: PALETTE.navyMid }} />Alta</span>
            <span className="flex items-center gap-1"><i className="h-2 w-2 rounded-sm" style={{ background: PALETTE.navy }} />Muito alta</span>
          </div>
        </div>

        <div className="min-w-0">
          <p className="mb-1.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Estados</p>
          <div className="grid grid-cols-3 gap-1 sm:grid-cols-5 lg:grid-cols-1">
            {ranked.map(({ uf, count }) => (
              <div key={uf} className="flex min-w-0 items-center justify-between rounded border bg-background px-2 py-1 text-[10px] leading-4 sm:text-[11px]">
                <span className="flex items-center gap-1.5 font-semibold">
                  <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: stateColor(count, maxCount) }} />
                  {uf}
                </span>
                <span className="ml-1 tabular-nums text-muted-foreground">{count}</span>
              </div>
            ))}
          </div>
          {!ranked.length && <p className="text-[11px] text-muted-foreground">Nenhum estado identificado.</p>}
        </div>
      </div>
    </section>
  );
}
