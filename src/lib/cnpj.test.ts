import { describe, expect, it } from "vitest";
import { formatCnpj, isValidCnpj } from "./cnpj";

describe("formatCnpj", () => {
  it("applies the mask progressively as digits are typed", () => {
    expect(formatCnpj("11")).toBe("11");
    expect(formatCnpj("112223")).toBe("11.222.3");
    expect(formatCnpj("11222333000181")).toBe("11.222.333/0001-81");
  });

  it("ignores non-digit characters and caps at 14 digits", () => {
    expect(formatCnpj("11.222.333/0001-81")).toBe("11.222.333/0001-81");
    expect(formatCnpj("112223330001812345")).toBe("11.222.333/0001-81");
  });
});

describe("isValidCnpj", () => {
  it("accepts real CNPJs with correct check digits", () => {
    expect(isValidCnpj("11.222.333/0001-81")).toBe(true);
    expect(isValidCnpj("11222333000181")).toBe(true);
  });

  it("rejects wrong check digits, short input and repeated-digit sequences", () => {
    expect(isValidCnpj("11.222.333/0001-00")).toBe(false);
    expect(isValidCnpj("123")).toBe(false);
    expect(isValidCnpj("00.000.000/0000-00")).toBe(false);
    expect(isValidCnpj("11.111.111/1111-11")).toBe(false);
  });
});
