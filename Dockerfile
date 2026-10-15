FROM node:24-alpine

WORKDIR /app

RUN apk add --no-cache bash docker procps coreutils

COPY package*.json ./

RUN npm install

COPY . .

RUN chmod +x metrics.sh

RUN npx tsc

EXPOSE 4000

CMD ["node", "dist/agent.js"]