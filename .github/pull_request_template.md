## Description

<!-- Thay đổi gì, tại sao cần thay đổi này? Link issue liên quan (VD: Closes #12). -->

## Checklist

- [ ] Commit message theo Conventional Commit (`type(scope): subject`)
- [ ] `npm run build` pass (backend và/hoặc frontend liên quan)
- [ ] `npx eslint` pass, không còn lỗi lint
- [ ] `npx tsc --noEmit` pass
- [ ] Unit test đã thêm/cập nhật cho logic mới — `npx jest` pass
- [ ] `npx prisma validate` pass (nếu có đổi `schema.prisma`)
- [ ] Đã cập nhật `CHANGELOG.md` (mục `[Unreleased]`) nếu là thay đổi đáng chú ý
- [ ] Đã cập nhật tài liệu liên quan trong `docs/` (nếu đổi kiến trúc/API)

## Risk

<!-- Thay đổi này có rủi ro gì? Có breaking change không? Có cần rollback plan không? -->

- [ ] Không có breaking change
- [ ] Có breaking change — mô tả bên dưới:

## Testing

<!-- Bạn đã test bằng cách nào? Unit test / thủ công qua Swagger / curl...? -->

## Screenshot

<!-- Nếu có thay đổi UI, đính kèm ảnh trước/sau. Xóa mục này nếu không áp dụng. -->

## Migration

<!-- Nếu có migration Prisma mới: tên migration, có cần chạy thủ công gì thêm không (seed, data backfill)? Xóa mục này nếu không áp dụng. -->
