/**
 * Patrocínio de taxa: o agente assina, o fundador paga.
 *
 * O agente tem a chave que **autoriza** a operação e nada mais — nenhum XLM,
 * nenhuma conta financiada. Quem paga a taxa é o patrocinador, que não tem
 * poder algum sobre o tesouro da organização. Separar as duas coisas é o ponto:
 * um agente comprometido não drena nada além do que sua procuração permite, e
 * um patrocinador comprometido não move valor nenhum.
 *
 * A decisão de segurança que estes testes guardam: **o patrocinador remonta a
 * operação a partir de campos tipados e nunca executa calldata recebida**. Um
 * patrocinador que assina o que mandarem é uma torneira de taxa — e pior, seria
 * um oráculo de execução para qualquer contrato.
 */
import { describe, expect, it } from "vitest";
import { validarPedido } from "@/lib/patrocinio";

const DESTINO = "GBG6UX7LDUU5ZAVRASDVB3EP7BXKM7ZXVHZQWPPPQXTVVUOSNRCWCGQO";
const ENTRADA = "AAAAAQ=="; // XDR qualquer; a forma é o que importa aqui

const pedido = (over: Record<string, unknown> = {}) => ({
  org: "alphafund",
  destinatario: DESTINO,
  valor: "100",
  entradas: [ENTRADA],
  ...over,
});

describe("validação do pedido de patrocínio", () => {
  it("aceita um pedido bem formado", () => {
    expect(validarPedido(pedido())).toBeNull();
  });

  it("recusa pedido sem autorização assinada", () => {
    // Sem a assinatura do agente não há o que patrocinar: submeter gastaria
    // taxa numa transação destinada a reverter.
    expect(validarPedido(pedido({ entradas: [] }))).toMatch(/authoriz/i);
    expect(validarPedido(pedido({ entradas: undefined }))).toMatch(/authoriz/i);
  });

  it("recusa destinatário que não é endereço Stellar", () => {
    expect(validarPedido(pedido({ destinatario: "nao-e-endereco" }))).toMatch(/recipient/i);
  });

  it("recusa valor ausente, zero ou negativo", () => {
    for (const valor of ["", "0", "-5"]) {
      expect(validarPedido(pedido({ valor }))).toMatch(/amount/i);
    }
  });

  it("recusa valor que não é inteiro", () => {
    // i128 não tem casas decimais; aceitar "1.5" viraria erro de conversão
    // três camadas adiante.
    expect(validarPedido(pedido({ valor: "1.5" }))).toMatch(/amount/i);
  });

  it("recusa organização vazia", () => {
    expect(validarPedido(pedido({ org: "  " }))).toMatch(/organization/i);
  });

  it("ignora campos extras em vez de repassá-los", () => {
    // Um pedido com `contrato` ou `funcao` não vira execução arbitrária: o
    // patrocinador remonta a operação e esses campos morrem aqui.
    const r = validarPedido(pedido({ contrato: "CQUALQUER", funcao: "burn" }) as never);
    expect(r).toBeNull();
  });

  it("aceita várias entradas assinadas", () => {
    expect(validarPedido(pedido({ entradas: [ENTRADA, ENTRADA] }))).toBeNull();
  });
});
