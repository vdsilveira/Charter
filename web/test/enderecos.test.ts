/**
 * Resolução de endereço antes de transacionar.
 *
 * A regra: o nome federado se resolve **no cliente**, antes de montar qualquer
 * coisa, e o que vai para a carteira e para a cadeia é sempre o endereço. Não é
 * escolha de conveniência — contrato Soroban não entende nome, e mandar um
 * significaria alguém traduzindo por dentro sem o usuário ver o quê.
 *
 * Por isso a resolução devolve o endereço para a tela mostrar antes de assinar:
 * quem assina precisa ver para onde o valor vai de fato.
 */
import { describe, expect, it, vi } from "vitest";
import { resolverEndereco } from "@/lib/enderecos";

const CONTA = "GBG6UX7LDUU5ZAVRASDVB3EP7BXKM7ZXVHZQWPPPQXTVVUOSNRCWCGQO";
const CONTRATO = "CC2GKKQFWLRIWD56OHO25HVSDWNJVPNWZCXYGMRPEGYMQUTEZWTB7BIX";

const federacao = (account_id: string) =>
  vi.fn().mockResolvedValue({ ok: true, json: async () => ({ account_id }) });

describe("resolução de endereço", () => {
  it("endereço de conta passa direto, sem consultar nada", async () => {
    const buscar = vi.fn();
    expect(await resolverEndereco(CONTA, buscar)).toBe(CONTA);
    expect(buscar).not.toHaveBeenCalled();
  });

  it("endereço de contrato também passa", async () => {
    // A conta corporativa de uma organização é um contrato; pagar a um agente
    // significa pagar a ela.
    expect(await resolverEndereco(CONTRATO, vi.fn())).toBe(CONTRATO);
  });

  it("nome federado vira endereço", async () => {
    const buscar = federacao(CONTRATO);
    expect(await resolverEndereco("Neo*Matrix*charter.local", buscar)).toBe(CONTRATO);

    const url = String(buscar.mock.calls[0][0]);
    expect(url).toContain("type=name");
    expect(decodeURIComponent(url)).toContain("Neo*Matrix*charter.local");
  });

  it("espaço em volta não atrapalha", async () => {
    expect(await resolverEndereco(`  ${CONTA}  `, vi.fn())).toBe(CONTA);
  });

  it("nome que não resolve vira erro com o motivo da federação", async () => {
    const buscar = vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ detail: "agente não encontrado" }),
    });

    await expect(resolverEndereco("Trinity*Matrix*charter.local", buscar)).rejects.toThrow(
      /não encontrado/,
    );
  });

  it("texto que não é endereço nem nome é recusado", async () => {
    for (const v of ["", "   ", "nao-e-nada", "GABC"]) {
      await expect(resolverEndereco(v, vi.fn())).rejects.toThrow(/address|name/i);
    }
  });

  it("federação que devolve lixo não vira endereço inválido", async () => {
    // Aceitar isso mandaria a transação para um destino sem sentido, e o erro
    // apareceria só na assinatura.
    const buscar = federacao("nao-e-endereco");
    await expect(resolverEndereco("Neo*Matrix*charter.local", buscar)).rejects.toThrow(
      /address/i,
    );
  });
});
