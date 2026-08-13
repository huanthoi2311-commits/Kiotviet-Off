# syntax=docker/dockerfile:1
#
# T051.04 — build context PHẢI là GỐC REPO, không phải frontend/ (xem docker-compose.yml,
# service `frontend`: `context: .`, `dockerfile: frontend/Dockerfile`). Lý do: orval.config.ts
# (frontend/orval.config.ts) đọc `../docs/api/openapi.json` — file này nằm NGOÀI thư mục
# frontend/, Docker build context không cho phép COPY vượt ra ngoài context của chính nó, nên
# context phải đủ rộng để bao gồm cả frontend/ lẫn docs/api/openapi.json.
#
# WORKDIR bên trong container vẫn là /app, mirror đúng vị trí frontend/ mirror trong repo thật —
# docs/api/openapi.json được đặt lại ở /docs/api/openapi.json (một cấp ngoài /app), GIỮ NGUYÊN
# quan hệ tương đối `../docs/api/openapi.json` mà orval.config.ts đã viết sẵn, không cần sửa gì
# ở orval.config.ts.

FROM node:22-alpine AS deps
WORKDIR /app
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci

FROM node:22-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY frontend/. .
COPY docs/api/openapi.json /docs/api/openapi.json
RUN npm run generate:api

# NEXT_PUBLIC_* được Next.js NHÚNG THẲNG vào bundle client tại thời điểm build (không phải
# runtime) — bắt buộc truyền qua build ARG, không chỉ ENV lúc chạy container (xem
# docs/release/WINDOWS-DEPLOYMENT-RUNBOOK.md, mục Environment Contract).
ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_WS_URL
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}
ENV NEXT_PUBLIC_WS_URL=${NEXT_PUBLIC_WS_URL}
RUN npm run build

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
# HOSTNAME=0.0.0.0 bắt buộc — mặc định server.js standalone chỉ bind localhost BÊN TRONG
# container, không nhận được kết nối từ ngoài dù đã map port (đã xác nhận qua tài liệu Next.js
# standalone output — không tái hiện được cục bộ vì sandbox này không có Docker, chỉ audit mã
# nguồn `.next/standalone/server.js` mà `next build` sinh ra tại thời điểm build thật).
ENV HOSTNAME=0.0.0.0
ENV PORT=3001

## Dự án hiện KHÔNG có frontend/public/ (đã xác nhận: không tồn tại trong repo) — không COPY thư
## mục này. Nếu về sau thêm static assets vào frontend/public/, phải bổ sung lại dòng
## `COPY --from=build /app/public ./public` tại đây.
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static

EXPOSE 3001
CMD ["node", "server.js"]
