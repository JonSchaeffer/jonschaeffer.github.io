FROM node:22-alpine

WORKDIR /app

RUN apk add --no-cache git

COPY package.json package-lock.json ./
RUN npm ci

COPY tina/ ./tina/
COPY content/ ./content/
COPY hugo.toml ./

EXPOSE 4001

CMD ["npx", "tinacms", "dev", "--noWatch"]
