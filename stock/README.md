# PulseBoard for Cloudflare Pages

GitHub와 Cloudflare Pages로 바로 배포할 수 있는 실시간 마켓 대시보드입니다.

## 포함 기능

- Coinbase WebSocket 기반 실시간 코인 시세
- Cloudflare Pages Function 기반 미국 주식 조회 API
- 모바일과 데스크톱 모두 대응하는 대시보드 UI

## 프로젝트 구조

- `public/index.html`: 메인 화면
- `public/styles.css`: 스타일
- `public/app.js`: 코인 스트림 연결과 주식 API 호출
- `functions/api/stocks.js`: Cloudflare Pages Function
- `wrangler.jsonc`: Pages 설정

## 로컬 실행

Node.js를 설치한 뒤 실행합니다.

```powershell
npm install
npm run dev
```

브라우저 주소:

```text
http://127.0.0.1:8788
```

## Cloudflare Pages 배포

다음 설정으로 배포하면 됩니다.

```text
Framework preset: None
Build command: (leave empty)
Build output directory: public
Root directory: /
```

만약 GitHub 저장소 안에서 이 프로젝트가 `stock` 폴더 안에 들어 있다면 `Root directory`는 `stock`으로 설정하면 됩니다.
