FROM node:18-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY . .
VOLUME ["/app/data"]
EXPOSE 8087
CMD ["node", "index.js"]
