const nextJest = require("next/jest");

const createJestConfig = nextJest({
  // Next.js 앱 루트(next.config / .env 로드 기준)
  dir: "./",
});

/** @type {import('jest').Config} */
const customJestConfig = {
  // localStorage 등 브라우저 API를 쓰는 lib/anki.ts 테스트를 위해 jsdom 사용
  testEnvironment: "jsdom",
  // "@/..." 경로 별칭 매핑 (tsconfig paths와 동일)
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/$1",
  },
  // 테스트 대상 파일 위치
  testMatch: ["**/__tests__/**/*.test.ts", "**/?(*.)+(spec|test).ts"],
  // 커버리지 수집 대상: 순수 로직이 모인 lib/ 중심
  collectCoverageFrom: [
    "lib/**/*.ts",
    "!lib/types.ts",
    "!lib/mongodb.ts",
    "!lib/dbCollections.ts",
  ],
  coverageDirectory: "<rootDir>/coverage",
  coverageReporters: ["text", "text-summary", "lcov", "html"],
  // 테스트 결과(pass/fail)를 콘솔 + JUnit XML 파일로 동시 출력.
  // CI(GitHub Actions 등)가 test-results/junit.xml을 읽어 결과를 표로 보여준다.
  reporters: [
    "default",
    [
      "jest-junit",
      {
        outputDirectory: "<rootDir>/test-results",
        outputName: "junit.xml",
        // 케이스 이름에 describe 블록명을 함께 붙여 가독성 향상
        ancestorSeparator: " › ",
        classNameTemplate: "{classname}",
        titleTemplate: "{title}",
      },
    ],
  ],
};

module.exports = createJestConfig(customJestConfig);
