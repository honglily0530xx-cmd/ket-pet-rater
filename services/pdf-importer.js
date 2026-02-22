import { mkdtempSync, writeFileSync, readdirSync, statSync, mkdirSync, copyFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import {
  addImportFailure,
  addReportRecord,
  createImportBatch,
  finalizeImportBatch,
} from "./dashboard-db.js";

const RISK_TOTAL_THRESHOLD = 12;
const RISK_LANG_THRESHOLD = 2;

function collectPdfPaths(folderPath) {
  const files = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      const st = statSync(full);
      if (st.isDirectory()) walk(full);
      else if (/\.pdf$/i.test(entry)) files.push(full);
    }
  };
  walk(folderPath);
  return files;
}

function extractPdfText(sourcePath) {
  const r = spawnSync("pdftotext", ["-layout", sourcePath, "-"], { encoding: "utf8" });
  if (r.status !== 0) {
    throw new Error(`pdftotext failed: ${r.stderr || "unknown error"}`);
  }
  return r.stdout || "";
}

function safeInt(v) {
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) ? n : null;
}

function findScore(text, labelRegex) {
  const m = text.match(new RegExp(`${labelRegex}[\\s\\S]{0,80}?(\\d)\\s*/\\s*5`, "i"));
  return m ? safeInt(m[1]) : null;
}

function parseFields(rawText, sourceFile) {
  const normalized = rawText.replace(/\u000c/g, "\n");

  const titleMatch = normalized.match(/(KET|PET)\s+Writing\s+报告\s*[—-]\s*([^·\n]+?)\s*·\s*([^\n]+)/i);
  const studentFromTitle = titleMatch?.[2]?.trim() || null;
  const topicFromTitle = titleMatch?.[3]?.trim() || null;
  const examLevel = titleMatch?.[1]?.toUpperCase() || (normalized.match(/\b(KET|PET)\b/i)?.[1]?.toUpperCase() ?? null);

  const studentMatch = normalized.match(/学生[：:]\s*([^\n]+)/);
  const studentName = (studentMatch?.[1] || studentFromTitle || null)?.trim() || null;

  const topicMatch = normalized.match(/主题[：:]\s*([^\n]+)/);
  const topicTitle = (topicMatch?.[1] || topicFromTitle || null)?.trim() || null;

  const genreMatch = normalized.match(/(?:任务类型|体裁)[：:]\s*([A-Za-z]+)/i);
  const genre = genreMatch?.[1]?.toLowerCase() || null;

  const wordCountMatch = normalized.match(/字数[：:]\s*约?\s*(\d+)\s*词/);
  const wordCount = wordCountMatch ? safeInt(wordCountMatch[1]) : null;

  const dateMatch = normalized.match(/日期[：:]\s*([^\n]+)/);
  const reportDateText = dateMatch?.[1]?.trim() || null;

  const contentScore = findScore(normalized, "Content");
  const caScore = findScore(normalized, "Communicative\\s+Achievement");
  const orgScore = findScore(normalized, "Organisation");
  const langScore = findScore(normalized, "Language");

  const totalMatch = normalized.match(/(?:原始总分|总分)[^\n]{0,40}?(\d{1,2})\s*\/\s*20/i);
  const totalScore = totalMatch ? safeInt(totalMatch[1]) : null;

  const cesMatch = normalized.match(/(?:Cambridge\s+English\s+Scale|剑桥英语量表分数)[^\n]{0,40}?(\d{3})/i);
  const cesScore = cesMatch ? safeInt(cesMatch[1]) : null;

  const cefrMatch = normalized.match(/(?:对应\s*CEFR\s*等级|CEFR)[^\n]{0,30}?(A2|B1\+?|B2)/i);
  const cefrLevel = cefrMatch?.[1] || null;

  let overallComment = null;
  const commentLine = normalized.match(/一句整体评价\s*([^\n]+)/);
  if (commentLine?.[1]) overallComment = commentLine[1].trim();

  const hasAnyScore = [contentScore, caScore, orgScore, langScore, totalScore, cesScore].some((x) => Number.isFinite(x));
  if (!studentName && !hasAnyScore) {
    throw new Error("核心字段缺失：无法识别学生姓名且无评分字段");
  }

  const computedTotal = Number.isFinite(totalScore)
    ? totalScore
    : [contentScore, caScore, orgScore, langScore].every((x) => Number.isFinite(x))
      ? contentScore + caScore + orgScore + langScore
      : null;

  const riskFlag = Number.isFinite(computedTotal) && computedTotal < RISK_TOTAL_THRESHOLD
    || Number.isFinite(langScore) && langScore <= RISK_LANG_THRESHOLD
    ? 1
    : 0;

  return {
    source_file: sourceFile,
    student_name: studentName,
    exam_level: examLevel,
    genre,
    topic_title: topicTitle,
    word_count_est: wordCount,
    report_date_text: reportDateText,
    content_score: contentScore,
    ca_score: caScore,
    org_score: orgScore,
    lang_score: langScore,
    total_score_20: computedTotal,
    ces_score: cesScore,
    cefr_level: cefrLevel,
    overall_comment: overallComment,
    risk_flag: riskFlag,
    raw_text: normalized,
  };
}

function parseMultipart(bodyBuffer, contentType) {
  const boundaryMatch = contentType.match(/boundary=(.+)$/i);
  if (!boundaryMatch) return { fields: {}, files: [] };
  const boundary = `--${boundaryMatch[1]}`;
  const parts = bodyBuffer.toString("latin1").split(boundary);

  const fields = {};
  const files = [];

  for (const partRaw of parts) {
    const part = partRaw.trim();
    if (!part || part === "--") continue;

    const idx = part.indexOf("\r\n\r\n");
    if (idx === -1) continue;

    const headerText = part.slice(0, idx);
    let bodyText = part.slice(idx + 4);
    if (bodyText.endsWith("\r\n")) bodyText = bodyText.slice(0, -2);

    const nameMatch = headerText.match(/name="([^"]+)"/i);
    const filenameMatch = headerText.match(/filename="([^"]*)"/i);
    const contentTypeMatch = headerText.match(/content-type:\s*([^\r\n]+)/i);

    if (!nameMatch) continue;
    const fieldName = nameMatch[1];

    if (filenameMatch && filenameMatch[1]) {
      files.push({
        fieldName,
        filename: basename(filenameMatch[1]),
        contentType: contentTypeMatch?.[1] || "application/octet-stream",
        buffer: Buffer.from(bodyText, "latin1"),
      });
    } else {
      fields[fieldName] = bodyText;
    }
  }

  return { fields, files };
}

function persistUploadedFiles(files) {
  const dir = mkdtempSync(join(tmpdir(), "kp-import-"));
  const paths = [];
  for (const file of files) {
    if (!/\.pdf$/i.test(file.filename)) continue;
    const p = join(dir, file.filename);
    writeFileSync(p, file.buffer);
    paths.push(p);
  }
  return paths;
}

function persistImportedPdfIfTemporary(sourcePath, userId, batchId) {
  if (!String(sourcePath).includes("/kp-import-")) return sourcePath;
  const targetDir = resolve("./data/uploaded_pdfs", `user_${userId || "anonymous"}`, batchId);
  mkdirSync(targetDir, { recursive: true });
  const targetPath = join(targetDir, basename(sourcePath));
  copyFileSync(sourcePath, targetPath);
  return targetPath;
}

export function parseImportPayload({ contentType, rawBuffer, jsonBody }) {
  if (contentType?.includes("multipart/form-data")) {
    const { fields, files } = parseMultipart(rawBuffer, contentType);
    const uploadedPaths = persistUploadedFiles(files);
    return {
      studentFolder: fields.studentFolder || "",
      folderPath: fields.folderPath || "",
      pdfPaths: uploadedPaths,
    };
  }

  const body = jsonBody || {};
  const folderPath = body.folderPath ? resolve(body.folderPath) : "";
  const fromFolder = folderPath ? collectPdfPaths(folderPath) : [];
  const fromInput = Array.isArray(body.pdfPaths) ? body.pdfPaths.map((p) => resolve(p)) : [];
  const merged = [...new Set([...fromFolder, ...fromInput])].filter((p) => /\.pdf$/i.test(p));

  return { studentFolder: body.studentFolder || "", folderPath, pdfPaths: merged };
}

export function runImportBatch({ userId = null, studentFolder = "", folderPath, pdfPaths }) {
  const batchId = randomUUID();
  const list = Array.isArray(pdfPaths) ? pdfPaths : [];

  createImportBatch({ id: batchId, userId, studentFolder, folderPath: folderPath || null, fileCount: list.length });

  let successCount = 0;
  let failedCount = 0;
  const failures = [];

  for (const path of list) {
    try {
      const persistedPath = persistImportedPdfIfTemporary(path, userId, batchId);
      const rawText = extractPdfText(persistedPath);
      const record = parseFields(rawText, persistedPath);
      addReportRecord({
        ...record,
        student_folder: studentFolder || record.student_name || null,
        user_id: userId,
        import_batch_id: batchId
      });
      successCount += 1;
    } catch (err) {
      failedCount += 1;
      const reason = String(err?.message || "unknown import error");
      addImportFailure({ userId, batchId, sourceFile: path, reason });
      failures.push({ source_file: path, reason });
    }
  }

  finalizeImportBatch({ id: batchId, userId, successCount, failedCount });

  return {
    batch_id: batchId,
    file_count: list.length,
    success_count: successCount,
    failed_count: failedCount,
    failures,
  };
}
