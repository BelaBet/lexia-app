import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { normalizeCnj, buildJusbrasilCnjUrl } from "./jusbrasilCnj.ts";

Deno.test("normaliza CNJ formatado e sem pontuação", () => {
  assertEquals(normalizeCnj("00163774620158070003"), "0016377-46.2015.8.07.0003");
  assertEquals(normalizeCnj("0016377-46.2015.8.07.0003"), "0016377-46.2015.8.07.0003");
});

Deno.test("rejeita CNJ com quantidade incorreta de dígitos", () => {
  assertEquals(normalizeCnj("123"), null);
});

Deno.test("monta URL de consulta sem efetuar chamada externa", () => {
  const cnj = "0016377-46.2015.8.07.0003";
  assertEquals(
    buildJusbrasilCnjUrl(cnj),
    "https://op.digesto.com.br/api/base-judicial/tribproc/0016377-46.2015.8.07.0003?tipo_numero=5",
  );
});
