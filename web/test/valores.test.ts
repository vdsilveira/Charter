/**
 * Conversão entre XLM e stroops.
 *
 * Quem digita pensa em XLM; a cadeia conta em stroops (1 XLM = 10 000 000).
 * A conversão parece trivial e não é: `Number("8.1") * 1e7` dá
 * `81000000.00000001`, e arredondar o resto é como se perde ou se cria dinheiro
 * sem ninguém notar. Por isso a conta é feita em texto, sem ponto flutuante no
 * caminho.
 */
import { describe, expect, it } from "vitest";
import { emXlm, paraStroops } from "@/lib/valores";

describe("XLM para stroops", () => {
  it("converte inteiros", () => {
    expect(paraStroops("1")).toBe("10000000");
    expect(paraStroops("300")).toBe("3000000000");
  });

  it("converte frações", () => {
    expect(paraStroops("0.5")).toBe("5000000");
    expect(paraStroops("1.25")).toBe("12500000");
  });

  it("não perde precisão onde o ponto flutuante perderia", () => {
    // `Number("8.1") * 1e7` → 81000000.00000001
    expect(paraStroops("8.1")).toBe("81000000");
    expect(paraStroops("0.1")).toBe("1000000");
    expect(paraStroops("1234567.8912345")).toBe("12345678912345");
  });

  it("aceita a menor unidade", () => {
    expect(paraStroops("0.0000001")).toBe("1");
  });

  it("recusa precisão que a cadeia não representa", () => {
    // Aceitar e truncar seria pior: o usuário veria um valor e enviaria outro.
    expect(() => paraStroops("0.00000001")).toThrow(/decimal/i);
  });

  it("recusa valor não positivo", () => {
    for (const v of ["0", "-1", "-0.5"]) {
      expect(() => paraStroops(v)).toThrow(/positive/i);
    }
  });

  it("recusa texto que não é número", () => {
    for (const v of ["", "abc", "1,5", "1.2.3", "1e7"]) {
      expect(() => paraStroops(v)).toThrow();
    }
  });

  it("tolera espaço em volta", () => {
    expect(paraStroops("  2.5  ")).toBe("25000000");
  });
});

describe("stroops para XLM", () => {
  it("mostra inteiros sem casas à toa", () => {
    expect(emXlm("10000000")).toBe("1");
    expect(emXlm("3000000000")).toBe("300");
  });

  it("mostra a fração quando existe", () => {
    expect(emXlm("12500000")).toBe("1.25");
    expect(emXlm("1")).toBe("0.0000001");
  });

  it("zero é zero", () => {
    expect(emXlm("0")).toBe("0");
  });

  it("ida e volta preserva o valor", () => {
    for (const v of ["1", "0.5", "8.1", "1234567.8912345", "0.0000001"]) {
      expect(emXlm(paraStroops(v))).toBe(v.trim());
    }
  });
});
