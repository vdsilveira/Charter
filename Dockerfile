# Imagem única para os três processos do Charter: vendedor x402, agente
# comprador e o app web. Qual deles roda é decidido pelo compose, não por
# imagens separadas — o código e as dependências são os mesmos, e três
# Dockerfiles quase idênticos só criariam três oportunidades de divergir.

FROM node:24-slim AS base
ENV PNPM_HOME=/pnpm PATH="/pnpm:$PATH"
RUN corepack enable
WORKDIR /app

# ---------------------------------------------------------------------------
# deps: instala uma vez e reaproveita. O lockfile e os manifests entram antes
# do código para que uma mudança em src/ não invalide a camada de dependências.
# ---------------------------------------------------------------------------
FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY web/package.json ./web/
COPY vendor/ctd-sdk/package.json ./vendor/ctd-sdk/
# `--config.dangerouslyAllowAllBuilds`: o pnpm 11 aborta quando um pacote traz
# build script não aprovado, e a lista declarativa do workspace não é lida no
# build limpo do container. Dentro de uma imagem descartável, permitir os
# scripts é seguro — o que se instala aqui é exatamente o que o lockfile fixa.
RUN pnpm install --frozen-lockfile --config.dangerouslyAllowAllBuilds=true

# ---------------------------------------------------------------------------
# web: build de produção do Next
# ---------------------------------------------------------------------------
FROM deps AS web-build
COPY . .
# O SDK confidencial é vendorizado e precisa ser compilado antes do app.
RUN cd vendor/ctd-sdk && ./node_modules/.bin/tsc -p tsconfig.json
RUN pnpm --filter @charter/web build

FROM base AS web
ENV NODE_ENV=production
COPY --from=web-build /app ./
EXPOSE 3000
CMD ["pnpm", "--filter", "@charter/web", "start"]

# ---------------------------------------------------------------------------
# x402: vendedor e agente. O mesmo alvo serve aos dois; o comando muda.
# ---------------------------------------------------------------------------
FROM deps AS x402
COPY . .
ENV NODE_ENV=production
EXPOSE 3001
CMD ["node", "src/x402-server.mjs"]
