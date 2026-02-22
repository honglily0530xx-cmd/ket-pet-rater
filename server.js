import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join } from "node:path";
import {
  addGeneratedReport,
  deleteAllStudentData,
  getArchiveReportById,
  getArchiveReports,
  getArchiveSummary,
  deleteReportRecordById,
  getFilteredRecords,
  getFolderStats,
  getRecordById,
  getRecordContentById,
  getStudentRecords,
  getStudents,
  getSummary,
} from "./services/dashboard-db.js";
import { parseImportPayload, runImportBatch } from "./services/pdf-importer.js";
import { renderRecordHtml, toCsv } from "./services/report-export.js";
import {
  buildClearSessionCookie,
  buildSetSessionCookie,
  getAuthedUser,
  getSessionToken,
  loginUser,
  logoutByToken,
  registerUser,
} from "./services/auth.js";

const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || "127.0.0.1";
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";
const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-4.1-mini";
const ANTHROPIC_AUTH_TOKEN = process.env.ANTHROPIC_AUTH_TOKEN || "";
const ANTHROPIC_BASE_URL = process.env.ANTHROPIC_BASE_URL || "";
const ANTHROPIC_MODEL =
  process.env.ANTHROPIC_MODEL ||
  process.env.ANTHROPIC_DEFAULT_SONNET_MODEL ||
  "claude-3-5-sonnet-latest";

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".csv": "text/csv; charset=utf-8",
};

const systemPrompt = await readFile(join(process.cwd(), "prompts/system-prompt.txt"), "utf8");

function sendJson(res, status, payload, extraHeaders = {}) {
  res.writeHead(status, { "Content-Type": MIME[".json"], ...extraHeaders });
  res.end(JSON.stringify(payload));
}

function sanitizeReportHtml(text) {
  const trimmed = (text || "").trim();
  if (trimmed.startsWith("<!DOCTYPE html>")) return trimmed;
  const marker = trimmed.indexOf("<!DOCTYPE html>");
  return marker >= 0 ? trimmed.slice(marker) : trimmed;
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => {
      data += chunk;
      if (data.length > 2_000_000) {
        reject(new Error("Payload too large"));
        req.destroy();
      }
    });
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });
}

function readRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let total = 0;
    req.on("data", (chunk) => {
      chunks.push(chunk);
      total += chunk.length;
      if (total > 80_000_000) {
        reject(new Error("Payload too large"));
        req.destroy();
      }
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

function parseFilters(urlObj) {
  const q = urlObj.searchParams;
  const scoreMin = q.get("score_min");
  const scoreMax = q.get("score_max");
  return {
    name: q.get("name") || "",
    topic: q.get("topic") || "",
    folder: q.get("folder") || "",
    riskOnly: q.get("risk_only") === "1" || q.get("risk_only") === "true",
    scoreMin: scoreMin === null ? null : Number(scoreMin),
    scoreMax: scoreMax === null ? null : Number(scoreMax),
  };
}

function requireAuth(req, res) {
  const user = getAuthedUser(req);
  if (!user) {
    sendJson(res, 401, { error: "请先登录" });
    return null;
  }
  return user;
}

function extractGeneratedMetrics(reportHtml) {
  const text = String(reportHtml || "").replace(/<[^>]+>/g, " ");
  const total = text.match(/(?:原始总分|总分|Total)[^\d]{0,20}(\d{1,2})\s*\/\s*20/i)?.[1];
  const ces = text.match(/(?:Cambridge\s+English\s+Scale|CES|量表分数)[^\d]{0,30}(\d{3})/i)?.[1];
  const cefr = text.match(/\b(A2|B1\+?|B2)\b/i)?.[1];
  return {
    total_score_20: total ? Number(total) : null,
    ces_score: ces ? Number(ces) : null,
    cefr_level: cefr || null,
  };
}

function localFallbackHtml(input) {
  const esc = (s) => (s || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
  const wordCount = (input.studentText || "").trim().split(/\s+/).filter(Boolean).length;
  return `<!DOCTYPE html>
<html lang="zh-CN"><head><meta charset="UTF-8"><title>${esc(input.examLevel)} Writing 报告</title>
<style>body{font-family:Arial,sans-serif;padding:16px} .warn{color:#b91c1c;font-weight:700} pre{white-space:pre-wrap;border:1px solid #ddd;padding:12px;border-radius:8px}</style></head>
<body>
<h1>${esc(input.examLevel)} Writing 报告（本地降级版）</h1>
<p class="warn">未检测到可用模型密钥，当前为降级预览，不含智能评分。</p>
<h2>基本信息</h2>
<ul><li>学生：${esc(input.studentName || "—")}</li><li>体裁：${esc(input.genre || "unknown")}</li><li>字数：约 ${wordCount} 词</li></ul>
<h2>题目</h2><pre>${esc(input.promptText || "")}</pre>
<h2>学生原文</h2><pre>${esc(input.studentText || "")}</pre>
</body></html>`;
}

async function generateWithOpenAI(input) {
  const userPayload = {
    exam_level: input.examLevel,
    genre: input.genre,
    prompt_text: input.promptText,
    student_name: input.studentName,
    date: input.date || null,
    student_text: input.studentText,
    target_level: input.targetLevel,
    layout_mode: input.layoutMode || "B"
  };

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${OPENAI_API_KEY}`
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      temperature: 0.2,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: JSON.stringify(userPayload, null, 2) }
      ]
    })
  });

  if (!response.ok) throw new Error(`OpenAI API error ${response.status}: ${await response.text()}`);
  const json = await response.json();
  return sanitizeReportHtml(json?.choices?.[0]?.message?.content || "");
}

async function generateWithAnthropic(input) {
  const base = ANTHROPIC_BASE_URL.replace(/\/+$/, "");
  const url = `${base}/v1/messages`;
  const timeoutMs = Number(process.env.API_TIMEOUT_MS || 120000);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  const userPayload = {
    exam_level: input.examLevel,
    genre: input.genre,
    prompt_text: input.promptText,
    student_name: input.studentName,
    date: input.date || null,
    student_text: input.studentText,
    target_level: input.targetLevel,
    layout_mode: input.layoutMode || "B"
  };

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_AUTH_TOKEN,
        Authorization: `Bearer ${ANTHROPIC_AUTH_TOKEN}`,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({
        model: ANTHROPIC_MODEL,
        max_tokens: 8192,
        temperature: 0.2,
        system: systemPrompt,
        messages: [{ role: "user", content: JSON.stringify(userPayload, null, 2) }]
      }),
      signal: controller.signal
    });

    if (!response.ok) throw new Error(`Anthropic API error ${response.status}: ${await response.text()}`);
    const json = await response.json();
    const textBlocks = Array.isArray(json?.content) ? json.content.filter((b) => b?.type === "text") : [];
    return sanitizeReportHtml(textBlocks.map((b) => b.text || "").join("\n").trim());
  } finally {
    clearTimeout(timer);
  }
}

async function generateWithOpenAICompat(baseUrl, input) {
  const root = baseUrl.replace(/\/+$/, "").replace(/\/anthropic$/, "");
  const url = `${root}/v1/chat/completions`;
  const timeoutMs = Number(process.env.API_TIMEOUT_MS || 120000);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  const userPayload = {
    exam_level: input.examLevel,
    genre: input.genre,
    prompt_text: input.promptText,
    student_name: input.studentName,
    date: input.date || null,
    student_text: input.studentText,
    target_level: input.targetLevel,
    layout_mode: input.layoutMode || "B"
  };

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_AUTH_TOKEN,
        Authorization: `Bearer ${ANTHROPIC_AUTH_TOKEN}`
      },
      body: JSON.stringify({
        model: ANTHROPIC_MODEL,
        temperature: 0.2,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: JSON.stringify(userPayload, null, 2) }
        ]
      }),
      signal: controller.signal
    });

    if (!response.ok) throw new Error(`OpenAI-compatible API error ${response.status}: ${await response.text()}`);
    const json = await response.json();
    return sanitizeReportHtml(json?.choices?.[0]?.message?.content || "");
  } finally {
    clearTimeout(timer);
  }
}

async function handleRegister(req, res) {
  try {
    const body = JSON.parse(await readBody(req) || "{}");
    if (!body.username || !body.password) return sendJson(res, 400, { error: "缺少用户名或密码" });
    if (String(body.password).length < 6) return sendJson(res, 400, { error: "密码至少6位" });

    const user = registerUser({ username: body.username.trim(), password: body.password, displayName: body.displayName || "" });
    sendJson(res, 200, { user: { id: user.id, username: user.username, display_name: user.display_name } });
  } catch (error) {
    sendJson(res, 400, { error: error.message || "注册失败" });
  }
}

async function handleLogin(req, res) {
  try {
    const body = JSON.parse(await readBody(req) || "{}");
    if (!body.username || !body.password) return sendJson(res, 400, { error: "缺少用户名或密码" });

    const out = loginUser({ username: body.username.trim(), password: body.password });
    sendJson(res, 200, { user: out.user }, { "Set-Cookie": buildSetSessionCookie(out.token) });
  } catch (error) {
    sendJson(res, 401, { error: error.message || "登录失败" });
  }
}

function handleLogout(req, res) {
  const token = getSessionToken(req);
  if (token) logoutByToken(token);
  sendJson(res, 200, { ok: true }, { "Set-Cookie": buildClearSessionCookie() });
}

function handleMe(req, res) {
  const user = getAuthedUser(req);
  if (!user) return sendJson(res, 200, { authenticated: false });
  sendJson(res, 200, { authenticated: true, user: { id: user.id, username: user.username, display_name: user.display_name } });
}

async function handleGenerate(req, res) {
  const authed = requireAuth(req, res);
  if (!authed) return;

  try {
    const input = JSON.parse(await readBody(req) || "{}");
    if (!input.studentName || !input.promptText || !input.studentText || !input.examLevel) {
      return sendJson(res, 400, { error: "Missing required fields" });
    }

    let reportHtml = "";
    if (ANTHROPIC_AUTH_TOKEN && ANTHROPIC_BASE_URL) {
      try {
        reportHtml = await generateWithAnthropic(input);
      } catch (e) {
        const msg = String(e?.message || "");
        if (msg.includes("proxy_error") || msg.includes("502")) reportHtml = await generateWithOpenAICompat(ANTHROPIC_BASE_URL, input);
        else throw e;
      }
    } else if (OPENAI_API_KEY) {
      reportHtml = await generateWithOpenAI(input);
    } else {
      reportHtml = localFallbackHtml(input);
    }

    if (!reportHtml.startsWith("<!DOCTYPE html>")) return sendJson(res, 502, { error: "Model did not return valid HTML report" });

    const metrics = extractGeneratedMetrics(reportHtml);
    addGeneratedReport({
      user_id: authed.id,
      student_name: input.studentName,
      exam_level: input.examLevel,
      genre: input.genre,
      prompt_text: input.promptText,
      student_text: input.studentText,
      report_html: reportHtml,
      total_score_20: metrics.total_score_20,
      ces_score: metrics.ces_score,
      cefr_level: metrics.cefr_level,
    });

    sendJson(res, 200, {
      reportHtml,
      usedFallback: !ANTHROPIC_AUTH_TOKEN && !OPENAI_API_KEY,
      model: ANTHROPIC_AUTH_TOKEN ? ANTHROPIC_MODEL : OPENAI_API_KEY ? OPENAI_MODEL : "local-fallback"
    });
  } catch (error) {
    sendJson(res, 500, { error: error.message || "Internal server error" });
  }
}

async function handleImportReports(req, res) {
  const authed = requireAuth(req, res);
  if (!authed) return;

  try {
    const contentType = req.headers["content-type"] || "";
    const raw = await readRawBody(req);
    const jsonBody = contentType.includes("application/json") ? JSON.parse(raw.toString("utf8") || "{}") : null;
    const payload = parseImportPayload({ contentType, rawBuffer: raw, jsonBody });

    if (!payload.pdfPaths?.length) return sendJson(res, 400, { error: "No PDF files found. Provide folderPath or upload pdf files." });

    const result = runImportBatch({ userId: authed.id, ...payload });
    sendJson(res, 200, result);
  } catch (error) {
    sendJson(res, 500, { error: error.message || "Import failed" });
  }
}

function handleDashboardSummary(req, url, res) {
  const authed = requireAuth(req, res);
  if (!authed) return;
  try {
    sendJson(res, 200, getSummary(authed.id, parseFilters(url)));
  } catch (error) {
    sendJson(res, 500, { error: error.message || "summary failed" });
  }
}

function handleDashboardStudents(req, url, res) {
  const authed = requireAuth(req, res);
  if (!authed) return;
  try {
    sendJson(res, 200, { students: getStudents(authed.id, parseFilters(url)) });
  } catch (error) {
    sendJson(res, 500, { error: error.message || "students query failed" });
  }
}

function handleDashboardFolders(req, res) {
  const authed = requireAuth(req, res);
  if (!authed) return;
  try {
    sendJson(res, 200, { folders: getFolderStats(authed.id) });
  } catch (error) {
    sendJson(res, 500, { error: error.message || "folders query failed" });
  }
}

function handleStudentRecords(req, studentNameEncoded, res) {
  const authed = requireAuth(req, res);
  if (!authed) return;
  try {
    const studentName = decodeURIComponent(studentNameEncoded);
    sendJson(res, 200, { student_name: studentName, records: getStudentRecords(authed.id, studentName) });
  } catch (error) {
    sendJson(res, 500, { error: error.message || "student records query failed" });
  }
}

function handleExportCsv(req, url, res) {
  const authed = requireAuth(req, res);
  if (!authed) return;
  try {
    const csvText = toCsv(getFilteredRecords(authed.id, parseFilters(url)));
    res.writeHead(200, {
      "Content-Type": MIME[".csv"],
      "Content-Disposition": "attachment; filename=\"writing-dashboard.csv\"",
    });
    res.end(csvText);
  } catch (error) {
    sendJson(res, 500, { error: error.message || "csv export failed" });
  }
}

function handleExportRecordHtml(req, recordId, res) {
  const authed = requireAuth(req, res);
  if (!authed) return;
  try {
    const record = getRecordById(authed.id, Number(recordId));
    if (!record) return sendJson(res, 404, { error: "record not found" });
    const html = renderRecordHtml(record);
    res.writeHead(200, {
      "Content-Type": MIME[".html"],
      "Content-Disposition": `attachment; filename=\"${encodeURIComponent(record.student_name || "student")}-record-${record.id}.html\"`,
    });
    res.end(html);
  } catch (error) {
    sendJson(res, 500, { error: error.message || "record html export failed" });
  }
}

function handleRecordContent(req, recordId, res) {
  const authed = requireAuth(req, res);
  if (!authed) return;
  try {
    const row = getRecordContentById(authed.id, Number(recordId));
    if (!row) return sendJson(res, 404, { error: "record not found" });
    sendJson(res, 200, row);
  } catch (error) {
    sendJson(res, 500, { error: error.message || "record content failed" });
  }
}

function handleDeleteReportRecord(req, recordId, res) {
  const authed = requireAuth(req, res);
  if (!authed) return;
  try {
    const changes = deleteReportRecordById(authed.id, Number(recordId));
    if (!changes) return sendJson(res, 404, { error: "record not found" });
    sendJson(res, 200, { ok: true, deleted: changes });
  } catch (error) {
    sendJson(res, 500, { error: error.message || "delete failed" });
  }
}

function handleDeleteAllStudentData(req, res) {
  const authed = requireAuth(req, res);
  if (!authed) return;
  try {
    deleteAllStudentData(authed.id);
    sendJson(res, 200, { ok: true });
  } catch (error) {
    sendJson(res, 500, { error: error.message || "clear failed" });
  }
}

async function handleRecordPdf(req, recordId, url, res) {
  const authed = requireAuth(req, res);
  if (!authed) return;
  try {
    const row = getRecordById(authed.id, Number(recordId));
    if (!row) return sendJson(res, 404, { error: "record not found" });
    if (!row.source_file || !String(row.source_file).toLowerCase().endsWith(".pdf")) {
      return sendJson(res, 400, { error: "record has no pdf source" });
    }
    const data = await readFile(row.source_file);
    const download = url.searchParams.get("download") === "1";
    res.writeHead(200, {
      "Content-Type": "application/pdf",
      "Content-Disposition": download
        ? `attachment; filename=\"${encodeURIComponent(row.student_name || "report")}-${row.id}.pdf\"`
        : "inline",
    });
    res.end(data);
  } catch (error) {
    sendJson(res, 404, { error: error.message || "pdf not found" });
  }
}

function handleArchiveSummary(req, res) {
  const authed = requireAuth(req, res);
  if (!authed) return;
  sendJson(res, 200, getArchiveSummary(authed.id));
}

function handleArchiveReports(req, res) {
  const authed = requireAuth(req, res);
  if (!authed) return;
  sendJson(res, 200, { reports: getArchiveReports(authed.id) });
}

function handleArchiveReportHtml(req, reportId, res) {
  const authed = requireAuth(req, res);
  if (!authed) return;
  const row = getArchiveReportById(authed.id, Number(reportId));
  if (!row) return sendJson(res, 404, { error: "report not found" });
  res.writeHead(200, { "Content-Type": MIME[".html"] });
  res.end(row.report_html);
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (req.method === "POST" && url.pathname === "/api/auth/register") return handleRegister(req, res);
  if (req.method === "POST" && url.pathname === "/api/auth/login") return handleLogin(req, res);
  if (req.method === "POST" && url.pathname === "/api/auth/logout") return handleLogout(req, res);
  if (req.method === "GET" && url.pathname === "/api/auth/me") return handleMe(req, res);

  if (req.method === "POST" && url.pathname === "/api/generate-report") return handleGenerate(req, res);
  if (req.method === "POST" && url.pathname === "/api/import-reports") return handleImportReports(req, res);

  if (req.method === "GET" && url.pathname === "/api/dashboard/summary") return handleDashboardSummary(req, url, res);
  if (req.method === "GET" && url.pathname === "/api/dashboard/students") return handleDashboardStudents(req, url, res);
  if (req.method === "GET" && url.pathname === "/api/dashboard/folders") return handleDashboardFolders(req, res);
  if (req.method === "GET" && url.pathname.startsWith("/api/dashboard/student/") && url.pathname.endsWith("/records")) {
    const prefix = "/api/dashboard/student/";
    const suffix = "/records";
    const encodedName = url.pathname.slice(prefix.length, -suffix.length);
    return handleStudentRecords(req, encodedName, res);
  }

  if (req.method === "GET" && url.pathname === "/api/export/csv") return handleExportCsv(req, url, res);
  if (req.method === "GET" && url.pathname.startsWith("/api/export/report-html/")) {
    return handleExportRecordHtml(req, url.pathname.replace("/api/export/report-html/", ""), res);
  }
  if (req.method === "GET" && url.pathname.startsWith("/api/report-record/") && url.pathname.endsWith("/pdf")) {
    const prefix = "/api/report-record/";
    const suffix = "/pdf";
    const recordId = url.pathname.slice(prefix.length, -suffix.length);
    return handleRecordPdf(req, recordId, url, res);
  }
  if (req.method === "GET" && url.pathname.startsWith("/api/report-record/") && url.pathname.endsWith("/content")) {
    const prefix = "/api/report-record/";
    const suffix = "/content";
    const recordId = url.pathname.slice(prefix.length, -suffix.length);
    return handleRecordContent(req, recordId, res);
  }
  if (req.method === "DELETE" && url.pathname.startsWith("/api/report-record/")) {
    return handleDeleteReportRecord(req, url.pathname.replace("/api/report-record/", ""), res);
  }
  if (req.method === "DELETE" && url.pathname === "/api/report-records") {
    return handleDeleteAllStudentData(req, res);
  }

  if (req.method === "GET" && url.pathname === "/api/archive/summary") return handleArchiveSummary(req, res);
  if (req.method === "GET" && url.pathname === "/api/archive/reports") return handleArchiveReports(req, res);
  if (req.method === "GET" && url.pathname.startsWith("/api/archive/report/")) {
    return handleArchiveReportHtml(req, url.pathname.replace("/api/archive/report/", ""), res);
  }

  if (req.method === "GET" && url.pathname === "/api/health") return sendJson(res, 200, { ok: true });

  if (req.method !== "GET") {
    res.writeHead(405);
    res.end("Method Not Allowed");
    return;
  }

  const requestedPath = url.pathname === "/" ? "/index.html" : url.pathname;
  const filePath = join(process.cwd(), "public", requestedPath);

  try {
    const content = await readFile(filePath);
    const type = MIME[extname(filePath)] || "application/octet-stream";
    res.writeHead(200, { "Content-Type": type });
    res.end(content);
  } catch {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Not Found");
  }
});

server.listen(PORT, HOST, () => {
  console.log(`Server running on http://${HOST}:${PORT}`);
});
