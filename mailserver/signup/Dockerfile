FROM node:20-alpine
RUN apk add --no-cache openssl
WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev
COPY server.js ./
COPY public ./public
EXPOSE 8081
USER node
CMD ["node", "server.js"]
