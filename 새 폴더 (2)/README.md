# PulseBoard for Cloudflare Pages

GitHub와 Cloudflare Pages로 바로 배포할 수 있는 실시간 가격 대시보드입니다.

## 포함 기능

- Coinbase WebSocket 기반 코인 실시간 가격
- Cloudflare Pages Function 기반 미국 주식 조회 API
- 모바일 대응 대시보드 UI

## 프로젝트 구조

- `public/index.html`: 화면 구조
- `public/styles.css`: UI 스타일
- `public/app.js`: 코인 WebSocket 연결과 주식 API 호출
- `functions/api/stocks.js`: Cloudflare Pages Function 주식 API
- `wrangler.jsonc`: Cloudflare Pages 로컬/배포 설정

## 로컬 개발

Node.js를 설치한 뒤 실행합니다.

```powershell
npm install
npm run dev
```

브라우저에서 아래 주소를 엽니다.

```text
http://127.0.0.1:8788
```

## GitHub + Cloudflare Pages 배포

1. 이 폴더를 GitHub 저장소로 올립니다.
2. Cloudflare Dashboard에서 `Workers & Pages`로 이동합니다.
3. `Create application` -> `Pages` -> `Connect to Git`를 선택합니다.
4. GitHub 저장소를 연결합니다.
5. 빌드 설정은 아래처럼 넣습니다.

```text
Framework preset: None
Build command: (leave empty)
Build output directory: public
Root directory: /
```

6. 배포가 끝나면 Cloudflare가 공개 URL을 발급합니다.

## 배포 참고

- 정적 파일은 `public` 폴더에서 제공됩니다.
- `/api/stocks`는 Pages Function이 처리합니다.
- 코인은 브라우저가 Coinbase WebSocket에 직접 연결합니다.
- 주식은 공개 피드를 이용하는 MVP 방식이라 서비스 단계에서는 공식 데이터 공급자로 교체하는 편이 안전합니다.
