import path from 'path';
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // T051.04 — build ra runtime image tối thiểu (chỉ node_modules thực sự cần dùng + server.js),
  // dùng cho frontend/Dockerfile production. Không ảnh hưởng `next dev`/`next start` chạy trực
  // tiếp trên host (dev workflow không đổi).
  output: 'standalone',
  // Repo gốc có package.json riêng (tooling commitlint/husky) NẰM NGOÀI frontend/ — nếu không
  // ghim rõ root, Next.js tự dò lockfile/package.json Ở TRÊN và coi ĐÓ là workspace root, khiến
  // `.next/standalone/` lồng thêm 1 cấp `frontend/` bên trong (đã xác nhận thực nghiệm: chạy
  // `npm run build` cục bộ ra `.next/standalone/frontend/server.js`, không phải
  // `.next/standalone/server.js` như tài liệu Next.js mô tả cho trường hợp KHÔNG lồng). Ghim
  // cứng root = chính thư mục frontend/ để hành vi xác định, khớp đúng cấu trúc COPY trong
  // frontend/Dockerfile.
  outputFileTracingRoot: path.join(__dirname),
};

export default nextConfig;
