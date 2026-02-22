function esc(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

export function toCsv(records) {
  const headers = [
    "id",
    "student_name",
    "exam_level",
    "genre",
    "topic_title",
    "word_count_est",
    "content_score",
    "ca_score",
    "org_score",
    "lang_score",
    "total_score_20",
    "ces_score",
    "cefr_level",
    "risk_flag",
    "source_file",
    "created_at",
  ];

  const lines = [headers.join(",")];
  for (const r of records) {
    const row = headers.map((h) => {
      const val = r[h] ?? "";
      const text = String(val).replaceAll('"', '""');
      return `"${text}"`;
    });
    lines.push(row.join(","));
  }

  return `\uFEFF${lines.join("\n")}`;
}

export function renderRecordHtml(record) {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${esc(record.exam_level || "PET")} Writing 报告 — ${esc(record.student_name || "未命名")}</title>
  <style>
    body{font-family:"Helvetica Neue",Arial,sans-serif;background:#f4f4f5;margin:0;padding:16px;color:#111827}
    .page{max-width:920px;margin:0 auto;background:#fff;padding:20px;border:1px solid #d1d5db;border-radius:10px}
    h1{margin:0 0 6px;color:#0f4c81}
    h2{margin:16px 0 8px;border-bottom:1px solid #d1d5db;padding-bottom:4px}
    table{width:100%;border-collapse:collapse}
    th,td{border:1px solid #d1d5db;padding:8px;vertical-align:top}
    th{background:#f8fafc;text-align:left}
    pre{white-space:pre-wrap;background:#fafafa;border:1px solid #e5e7eb;padding:10px;border-radius:8px}
  </style>
</head>
<body>
  <section class="page">
    <h1>${esc(record.exam_level || "PET")} Writing 报告 — ${esc(record.student_name || "未命名")} · ${esc(record.topic_title || "—")}</h1>
    <p>任务类型：${esc(record.genre || "—")}｜字数：约 ${esc(record.word_count_est ?? "—")} 词｜导入批次：${esc(record.import_batch_id)}</p>

    <h2>评分结果</h2>
    <table>
      <tbody>
        <tr><th>Content</th><td>${esc(record.content_score ?? "—")} / 5</td></tr>
        <tr><th>Communicative Achievement</th><td>${esc(record.ca_score ?? "—")} / 5</td></tr>
        <tr><th>Organisation</th><td>${esc(record.org_score ?? "—")} / 5</td></tr>
        <tr><th>Language</th><td>${esc(record.lang_score ?? "—")} / 5</td></tr>
        <tr><th>Total</th><td>${esc(record.total_score_20 ?? "—")} / 20</td></tr>
        <tr><th>CES</th><td>${esc(record.ces_score ?? "—")}</td></tr>
        <tr><th>CEFR</th><td>${esc(record.cefr_level ?? "—")}</td></tr>
        <tr><th>风险标记</th><td>${record.risk_flag ? "是" : "否"}</td></tr>
      </tbody>
    </table>

    <h2>一句整体评价</h2>
    <p>${esc(record.overall_comment || "—")}</p>

    <h2>原始文本（抽取）</h2>
    <pre>${esc(record.raw_text || "")}</pre>
  </section>
</body>
</html>`;
}
