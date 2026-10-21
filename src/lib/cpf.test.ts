import { describe, expect, it } from "vitest";
import { formatCpf, isValidCpf } from "./cpf";

describe("formatCpf", () => {
  it("applies the mask progressively as digits are typed", () => {
    expect(formatCpf("049")).toBe("049");
    expect(formatCpf("049221")).toBe("049.221");
    expect(formatCpf("04922148671")).toBe("049.221.486-71");
  });

  it("ignores non-digit characters and caps at 11 digits", () => {
    expect(formatCpf("049.221.486-71")).toBe("049.221.486-71");
    expect(formatCpf("0492214867112345")).toBe("049.221.486-71");
  });
});

describe("isValidCpf", () => {
  it("accepts a real CPF with correct check digits", () => {
    expect(isValidCpf("049.221.486-71")).toBe(true);
    expect(isValidCpf("04922148671")).toBe(true);
  });

  it("rejects wrong check digits, short input and repeated-digit sequences", () => {
    expect(isValidCpf("049.221.486-00")).toBe(false);
    expect(isValidCpf("123")).toBe(false);
    expect(isValidCpf("000.000.000-00")).toBe(false);
    expect(isValidCpf("111.111.111-11")).toBe(false);
  });
});
