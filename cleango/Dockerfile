# LUMI — production image (23_DEVOPS_INFRASTRUCTURE.md).
# Zero runtime dependencies: just the Node std lib, so the image is tiny and has
# no third-party supply-chain surface. Runs as a non-root user with a container
# HEALTHCHECK wired to the app's own liveness probe.
FROM node:20-alpine

ENV NODE_ENV=production \
    PORT=4000 \
    LUMI_DATA_DIR=/data

WORKDIR /app

# No `npm install` — there are no dependencies. Copying the source is the build.
COPY . .

# Persist the JSON store on a volume and let the non-root user own it.
RUN mkdir -p /data && addgroup -S lumi && adduser -S lumi -G lumi && chown -R lumi:lumi /app /data
USER lumi
VOLUME ["/data"]

EXPOSE 4000

# Liveness probe — orchestrators restart the container if this fails.
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://127.0.0.1:'+(process.env.PORT||4000)+'/healthz',r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"

CMD ["node", "server.js"]
