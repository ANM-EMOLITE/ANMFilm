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
    api.config.ts            # API_BASE_URL ('' = dùng dev proxy)
    models/api.models.ts     # interface khớp response BE
    services/anime-api.ts    # gọi BE + buildProxyUrl()
    utils/media.utils.ts     # pickTitle, pickDescription...
  features/
    search/search-page.*     # trang tìm kiếm / anime phổ biến
    watch/watch-page.*       # chi tiết + chọn provider/server/tập + player
  shared/
    search-box/              # ô tìm kiếm có autocomplete
    video-player/            # player HLS (hls.js) / DIRECT / EMBED
```
