# AI 학습 어시스턴트

요구사항 문서의 P0/P1 범위를 반영한 Next.js 기반 학습 관리 MVP입니다.

## 주요 기능

- Google OAuth 로그인 및 Kakao 데모 로그인
- PDF, 이미지, TXT, MD 학습 자료 업로드 및 파일 형식 검증
- Gemini API 기반 AI 요약, 복습 문제 생성, 요약+퀴즈 통합 학습 세트 생성
- 요약본 저장, 조회, 삭제
- 마크다운 학습 노트 작성, 수정, 삭제
- 노트 기반 AI 요약 및 복습 문제 생성
- 스톱워치와 포모도로 타이머
- 학습 시간 자동 기록, 캐릭터 경험치/레벨/성장 단계 반영
- 주간/월간/과목별 학습 통계 대시보드

## 실행

```bash
npm install
npm run dev
```

브라우저에서 `http://localhost:3000`을 엽니다.

## AI 연동

`.env.example`을 참고해 `.env.local`에 `GEMINI_API_KEY`를 넣으면 실제 Gemini 요약/문제 생성을 사용합니다. 기본 모델은 `gemini-2.5-flash`이며, 필요하면 `GEMINI_MODEL`로 바꿀 수 있습니다. 키가 없거나 호출이 실패하면 앱은 데모 가능한 로컬 요약/퀴즈 엔진으로 자동 전환됩니다.

## Google 로그인

Google Cloud Console에서 OAuth 2.0 Client ID를 만든 뒤 다음 환경 변수를 설정합니다.

```bash
AUTH_SECRET=
AUTH_GOOGLE_ID=
AUTH_GOOGLE_SECRET=
```

로컬 개발용 승인된 리디렉션 URI:

```txt
http://localhost:3000/api/auth/callback/google
```

Vercel 배포용 승인된 리디렉션 URI:

```txt
https://배포도메인.vercel.app/api/auth/callback/google
```

## 데이터 저장

앱은 MongoDB를 저장소로 사용합니다. 로그인, 자료/요약, 노트, 복습 문제, 학습 세션은 `/api/store`를 통해 사용자별 컬렉션에 저장됩니다.

연결 확인:

```bash
curl http://localhost:3000/api/health/db
```
