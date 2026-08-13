# syntax=docker/dockerfile:1

FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
# --ignore-scripts: package.json's "postinstall" chạy `prisma generate`, nhưng ở stage này
# prisma/schema.prisma CHƯA được copy vào (chỉ có package.json/package-lock.json) nên lệnh đó
# chắc chắn fail ("Could not find Prisma Schema"). Client Prisma đã được generate tường minh ở
# stage build (dòng RUN npx prisma generate bên dưới, sau khi COPY . . mang đủ source vào) nên
# việc postinstall tự chạy ở đây vừa thừa vừa gây lỗi build — bỏ qua bằng --ignore-scripts.
RUN npm ci --ignore-scripts

FROM node:22-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate
RUN npm run build

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
# Cùng lý do như stage deps: prisma/ chưa tồn tại ở đây (được COPY ở dòng ngay dưới), nên
# postinstall's `prisma generate` sẽ fail nếu không --ignore-scripts. Client được generate tường
# minh bằng RUN npx prisma generate ngay sau khi COPY prisma/ vào.
RUN npm ci --omit=dev --ignore-scripts
COPY --from=build /app/dist ./dist
COPY --from=build /app/prisma ./prisma
RUN npx prisma generate

EXPOSE 3000
CMD ["node", "dist/main.js"]
