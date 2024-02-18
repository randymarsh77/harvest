FROM oven/bun:1 as base
WORKDIR /usr/src/app

FROM base AS install
RUN mkdir -p /temp/dev
COPY package.json bun.lockb /temp/dev/
RUN cd /temp/dev && bun install --frozen-lockfile

RUN mkdir -p /temp/prod
COPY package.json bun.lockb /temp/prod/
RUN cd /temp/prod && bun install --frozen-lockfile --production

FROM base AS prerelease
COPY --from=install /temp/dev/node_modules node_modules
COPY . .

ENV NODE_ENV=production

RUN bun run lint
RUN bun run tsc
RUN bun build ./src/app.ts --target bun --outdir dist

FROM ghcr.io/cirruslabs/orchard:0.15.1 AS orchard

FROM base AS release
COPY --from=install /temp/prod/node_modules node_modules
COPY --from=prerelease /usr/src/app/dist/app.js .
COPY --from=prerelease /usr/src/app/package.json .
COPY --from=orchard /bin/orchard /bin/orchard

ENV ORCHARD_DATA_DIR=/data/orchard
RUN mkdir -p /data/orchard
RUN chown -R bun:bun /data/orchard

USER bun
EXPOSE 3000/tcp
EXPOSE 6120/tcp
ENTRYPOINT [ "bun", "run", "app.js" ]
