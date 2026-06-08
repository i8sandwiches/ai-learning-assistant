// JUnit XML(test-results/junit.xml) → Excel(.xlsx) 변환기
// 사용법: node scripts/junit-to-xlsx.js [입력 xml] [출력 xlsx]
// exceljs 필요: npm install exceljs --no-save
const fs = require("fs");
const path = require("path");
const ExcelJS = require("exceljs");

const inPath = process.argv[2] || "test-results/junit.xml";
const outPath = process.argv[3] || "test-results/test-results.xlsx";

const xml = fs.readFileSync(inPath, "utf8");

const attr = (tag, name) => {
  // \b 로 단어 경계 고정: "name" 이 "classname" 안에서 오매칭되지 않도록
  const m = tag.match(new RegExp(`\\b${name}="([^"]*)"`));
  return m ? m[1] : "";
};
const decode = (s) =>
  s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"')
   .replace(/&apos;/g, "'").replace(/&amp;/g, "&");

// 전체 요약
const rootTag = xml.match(/<testsuites[^>]*>/)?.[0] ?? "";
const summary = {
  tests: +attr(rootTag, "tests") || 0,
  failures: +attr(rootTag, "failures") || 0,
  errors: +attr(rootTag, "errors") || 0,
  time: +attr(rootTag, "time") || 0,
};

// 각 testcase 파싱 (실패/스킵 자식 노드 포함)
const rows = [];
const suiteRe = /<testsuite\b([^>]*)>([\s\S]*?)<\/testsuite>/g;
let sm;
while ((sm = suiteRe.exec(xml))) {
  const suiteName = decode(attr(`<x ${sm[1]}>`, "name"));
  const body = sm[2];
  const caseRe = /<testcase\b([^>]*?)(\/>|>([\s\S]*?)<\/testcase>)/g;
  let cm;
  while ((cm = caseRe.exec(body))) {
    const head = `<x ${cm[1]}>`;
    const inner = cm[3] || "";
    let status = "통과";
    let detail = "";
    if (/<failure/.test(inner) || /<error/.test(inner)) {
      status = "실패";
      detail = decode((inner.match(/<(?:failure|error)[^>]*>([\s\S]*?)<\/(?:failure|error)>/)?.[1] || "").trim()).split("\n")[0];
    } else if (/<skipped/.test(inner)) {
      status = "건너뜀";
    }
    rows.push({
      suite: suiteName,
      classname: decode(attr(head, "classname")),
      name: decode(attr(head, "name")),
      status,
      time: +attr(head, "time") || 0,
      detail,
    });
  }
}

const wb = new ExcelJS.Workbook();
const FONT = { name: "Arial" };
const headerFill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1F4E78" } };
const headerFont = { ...FONT, bold: true, color: { argb: "FFFFFFFF" } };

// --- 시트 1: 요약 ---
const s1 = wb.addWorksheet("요약");
s1.columns = [{ width: 22 }, { width: 16 }];
s1.addRow(["테스트 결과 요약"]).font = { ...FONT, bold: true, size: 14 };
s1.addRow([]);
const passed = summary.tests - summary.failures - summary.errors;
const rate = summary.tests ? passed / summary.tests : 0;
const meta = [
  ["전체 테스트", summary.tests],
  ["통과", passed],
  ["실패", summary.failures + summary.errors],
  ["통과율", rate],
  ["총 소요시간(초)", summary.time],
  ["생성 시각", new Date().toLocaleString("ko-KR")],
];
meta.forEach(([k, v]) => {
  const r = s1.addRow([k, v]);
  r.getCell(1).font = { ...FONT, bold: true };
  r.getCell(2).font = FONT;
});
s1.getCell("B6").numFmt = "0.0%"; // 통과율

// --- 시트 2: 상세 ---
const s2 = wb.addWorksheet("상세 결과");
s2.columns = [
  { header: "#", key: "idx", width: 6 },
  { header: "테스트 그룹(describe)", key: "classname", width: 26 },
  { header: "테스트 케이스", key: "name", width: 60 },
  { header: "결과", key: "status", width: 10 },
  { header: "소요(초)", key: "time", width: 10 },
  { header: "실패 메시지", key: "detail", width: 50 },
];
s2.getRow(1).eachCell((c) => {
  c.font = headerFont;
  c.fill = headerFill;
  c.alignment = { vertical: "middle", horizontal: "center" };
});
rows.forEach((r, i) => {
  const row = s2.addRow({ idx: i + 1, classname: r.classname, name: r.name, status: r.status, time: r.time, detail: r.detail });
  row.eachCell((c) => (c.font = FONT));
  const statusCell = row.getCell("status");
  statusCell.alignment = { horizontal: "center" };
  if (r.status === "실패") statusCell.font = { ...FONT, bold: true, color: { argb: "FFC00000" } };
  else if (r.status === "통과") statusCell.font = { ...FONT, color: { argb: "FF1E7B34" } };
  row.getCell("time").numFmt = "0.000";
});
s2.autoFilter = { from: "A1", to: "F1" };
s2.views = [{ state: "frozen", ySplit: 1 }];

fs.mkdirSync(path.dirname(outPath), { recursive: true });
wb.xlsx.writeFile(outPath).then(() => {
  console.log(`완료: ${outPath} (${rows.length} cases, ${passed}/${summary.tests} passed)`);
});
