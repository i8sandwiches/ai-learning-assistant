# AI 학습 어시스턴트

요구사항 문서의 P0/P1 범위를 반영한 Next.js 기반 학습 관리 MVP입니다.

## 주요 기능

- Google/Kakao 데모 로그인 및 세션 유지
- PDF, 이미지, TXT, MD 학습 자료 업로드 및 파일 형식 검증
- Gemini API 기반 AI 요약, API 키가 없을 때 로컬 폴백 요약
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

`.env.example`을 참고해 `.env.local`에 `GEMINI_API_KEY`를 넣으면 실제 Gemini 요약/문제 생성을 사용합니다. 키가 없거나 호출이 실패하면 앱은 데모 가능한 로컬 요약 엔진으로 자동 전환됩니다.

## 데이터 저장

앱은 MongoDB를 기본 저장소로 사용합니다. 로그인, 자료/요약, 노트, 복습 문제, 학습 세션은 `/api/store`를 통해 사용자별 컬렉션에 저장됩니다. MongoDB 요청이 실패해도 화면 작업이 끊기지 않도록 브라우저 `localStorage`가 보조 저장소로 유지됩니다.

연결 확인:

```bash
curl http://localhost:3000/api/health/db
```
