# Anime Stream – Web (Angular)

FE (Angular) cho BE `AnimeStreamingApi` (project riêng: `D:\Project\AnimeStreamingApi`).

## Chạy

Yêu cầu Node.js 20.19+ hoặc 22.12+.

```bash
# 1. Chạy BE (http://localhost:5200)
dotnet run --project ../AnimeStreamingApi/src/Anime.Api

# 2. Chạy FE (http://localhost:4200)
npm install
npm start
```

`proxy.conf.json` chuyển mọi request `/api/*` từ `localhost:4200` sang `localhost:5200`, nên không cần cấu hình CORS khi dev.
Nếu BE chạy port khác, sửa `target` trong `proxy.conf.json`.

## Luồng xem phim

1. `GET /api/v1/search` / `GET /api/v1/autocomplete` – tìm anime, lấy `id`
2. `GET /api/v1/metadata?id=` – chi tiết + `streamingProviders` (danh sách provider)
3. `GET /api/v1/stream/episodes/servers` + `GET /api/v1/stream/episodes` – danh sách tập, lấy `episodeId`
4. `GET /api/v1/stream/source?episodeData={episodeId}` – link stream (`HLS` / `EMBED` / `DIRECT`)
5. Phát:
   - `EMBED` → iframe
   - `HLS` → hls.js; nếu `corsProxyRequired = true` thì phát qua `GET /api/v1/stream/proxy?url=...&h=...`
     (BE gửi kèm `proxyHeaders` như `Referer` và rewrite link segment trong playlist)
   - `DIRECT` → thẻ `<video>` (cũng qua proxy nếu cần)

Nếu video không phát, tick **“Luôn dùng proxy”** rồi bấm lại tập.

## Cấu trúc

```
src/app/
  core/
    api.config.ts              # API_BASE_URL ('' = dùng dev proxy)
    models/api.models.ts       # interface khớp response BE
    services/anime-api.ts      # gọi BE (có timeout) + buildProxyUrl()
    utils/media.utils.ts       # pickTitle, statusLabel, formatLabel...
  features/
    search/search-page.*       # trang chủ: tab, theo mùa, tìm kiếm (50 phim/lần + "Xem thêm")
    watch/watch-page.*         # trang xem: player, danh sách tập, thông tin phim
    watch/watch-store.ts       # state + logic tự chuyển nguồn
  shared/
    ui/                        # UI primitives dùng chung – import từ '@shared/ui'
      button (uiBtn), icon, badge, dropdown, scroll-area, table (+ uiCell),
      tabs, switch, spinner, skeleton, empty-state, toast (ToastService + ui-toaster)
    components/
      search-box/              # ô tìm kiếm có gợi ý, phím tắt "/" hoặc Ctrl+K
      video-player/            # HLS (hls.js) / DIRECT / EMBED, báo ready / lỗi / treo
      media-card/              # thẻ poster anime
    pipes/safe-resource-url.pipe.ts
```

Alias import: `@core/*` → `src/app/core/*`, `@shared/*` → `src/app/shared/*` (tsconfig.json).
Design tokens (màu, radius, shadow…) và thanh cuộn custom nằm trong `src/styles.scss`.### Tự động chuyển nguồn (chạy ngầm, người xem không thấy)

Logic ở `features/watch/watch-store.ts`:

- Mọi request có timeout (`REQUEST_TIMEOUT` trong `anime-api.ts`). Timeout, 5xx, 504, lỗi mạng → bỏ qua nguồn đó.
- Danh sách tập = gộp từ mọi provider (tải song song), so số tập theo giá trị (`001` == `1`).
- Thứ tự provider: nguồn ổn định trước, `LOW_PRIORITY_PROVIDERS` (ANIMEVIETSUB – hay sập buổi tối) xếp cuối, còn lại theo `similarity`.
- Bấm tập: lấy link → phát trực tiếp → qua proxy → server/provider khác có tập đó.
- Player không phát được sau 20s, hoặc đang xem mà đứng > 25s / lỗi HLS → tự đổi nguồn, phát tiếp đúng vị trí cũ.
- Mọi nguồn đều lỗi → hiện "Tập phim này hiện chưa xem được" + nút Thử lại.

## Cấu trúc

```
src/app/
  core/
    api.config.ts              # API_BASE_URL ('' = dùng dev proxy)
    models/api.models.ts       # interface khớp response BE
    services/anime-api.ts      # gọi BE (có timeout) + buildProxyUrl()
    utils/media.utils.ts       # pickTitle, statusLabel, formatLabel...
  features/
    search/search-page.*       # trang chủ: tab, theo mùa, tìm kiếm (50 phim/lần + "Xem thêm")
    watch/watch-page.*         # trang xem: player, danh sách tập, bảng nguồn
    watch/watch-store.ts       # state + logic tự chuyển nguồn
  shared/
    ui/                        # UI primitives dùng chung – import từ '@shared/ui'
      button (uiBtn), icon, badge, dropdown, scroll-area, table (+ uiCell),
      tabs, switch, spinner, skeleton, empty-state, toast (ToastService + ui-toaster)
    components/
      search-box/              # ô tìm kiếm có gợi ý, phím tắt "/" hoặc Ctrl+K
      video-player/            # HLS (hls.js) / DIRECT / EMBED, báo ready / lỗi / treo
      media-card/              # thẻ poster anime
    pipes/safe-resource-url.pipe.ts
```

Alias import: `@core/*` → `src/app/core/*`, `@shared/*` → `src/app/shared/*` (tsconfig.json).
Design tokens (màu, radius, shadow…) và thanh cuộn custom nằm trong `src/styles.scss`.
