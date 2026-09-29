import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, Root } from "react-dom/client";
import { PublicationKanban } from "./PublicationKanban";
import type { Publication } from "@/hooks/usePublications";

const { mutate, navigate } = vi.hoisted(() => ({ mutate: vi.fn(), navigate: vi.fn() }));

vi.mock("react-router-dom", () => ({ useNavigate: () => navigate }));
vi.mock("@/hooks/usePublications", () => ({
  PIPELINE_STAGES: [
    { value: "novo", label: "Novo" },
    { value: "em_analise", label: "Em Análise" },
    { value: "prazo_definido", label: "Prazo Definido" },
    { value: "providencia_tomada", label: "Providência Tomada" },
    { value: "concluido", label: "Concluído" },
  ],
  useUpdatePublicationStage: () => ({ mutate, isPending: false }),
}));

const publication = {
  id: "publication-1",
  process_number: "1234567-89.2026.8.17.0001",
  content: "Publicação de teste",
  pipeline_stage: "novo",
  status: "pending",
  external_deadline: null,
} as Publication;

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  mutate.mockReset();
  navigate.mockReset();
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  globalThis.ResizeObserver = class {
    observe() {}
    disconnect() {}
    unobserve() {}
  };
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root.render(<PublicationKanban publications={[publication]} />));
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

function column(label: string) {
  const heading = [...container.querySelectorAll("p")].find((item) => item.textContent === label);
  if (!heading?.parentElement?.parentElement) throw new Error(`Coluna ${label} não encontrada`);
  return heading.parentElement.parentElement;
}

function dragEvent(type: string) {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperty(event, "dataTransfer", {
    value: { setData: vi.fn(), effectAllowed: "", dropEffect: "" },
  });
  return event;
}

it("move um cartão entre etapas e desfaz a posição se o salvamento falhar", () => {
  const card = column("Novo").querySelector<HTMLElement>("[draggable='true']");
  expect(card).not.toBeNull();

  act(() => card!.dispatchEvent(dragEvent("dragstart")));
  act(() => column("Em Análise").dispatchEvent(dragEvent("drop")));

  expect(mutate).toHaveBeenCalledOnce();
  expect(mutate.mock.calls[0][0]).toEqual({ id: publication.id, pipeline_stage: "em_analise" });
  expect(column("Em Análise").querySelector("[draggable]")).not.toBeNull();
  expect(navigate).not.toHaveBeenCalled();

  act(() => mutate.mock.calls[0][1].onError());
  expect(column("Novo").querySelector("[draggable]")).not.toBeNull();
});

it("não grava uma alteração ao soltar o cartão na própria etapa", () => {
  const card = column("Novo").querySelector<HTMLElement>("[draggable='true']");
  act(() => card!.dispatchEvent(dragEvent("dragstart")));
  act(() => column("Novo").dispatchEvent(dragEvent("drop")));
  expect(mutate).not.toHaveBeenCalled();
});
