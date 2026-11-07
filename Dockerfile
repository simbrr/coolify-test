# Node.js 26 (Lithium) is the Active LTS line. 26.13.0 entered LTS on 2026-10-28.
# Digest is the official multi-arch index for library/node:26.13.0-bookworm-slim.
FROM node:26.13.0-bookworm-slim@sha256:add5c17c14752c54d2f3d519ec46a3815684d41c33f198bcb09fb998f7dcbf68

ENV NODE_ENV=production \
    PORT=3000

WORKDIR /app

COPY --chown=node:node package.json server.js ./

USER node

EXPOSE 3000

STOPSIGNAL SIGTERM

# Node's built-in fetch probes liveness. The slim image is not assumed to include an HTTP client package.
HEALTHCHECK --interval=10s --timeout=3s --start-period=5s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/health').then((res)=>process.exit(res.ok?0:1)).catch(()=>process.exit(1))"]

ENTRYPOINT ["node", "server.js"]
