FROM node:24.11-alpine AS development

WORKDIR /app

COPY package*.json ./
COPY prisma ./prisma/

RUN npm install

COPY . .

RUN npx prisma generate

EXPOSE 8000

CMD ["npm", "run", "start:dev"]