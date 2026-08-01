FROM node:20-alpine
WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev
COPY server.js ./
COPY public ./public
EXPOSE 8082
# root: пишем сессии в примонтированный /data, принадлежащий root на хосте
CMD ["node", "server.js"]
