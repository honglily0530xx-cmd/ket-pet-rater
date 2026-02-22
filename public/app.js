const $ = (id) => document.getElementById(id);

const apiConfig = window.KP_API_CONFIG || {
  endpoint: "/api/generate-report",
  method: "POST",
  headers: { "Content-Type": "application/json" },
  mapRequest: (payload) => payload,
  extractHtml: (resp) => resp.reportHtml
};

const els = {
  status: $("status"),
  preview: $("preview"),
  dashboardView: $("dashboardView"),
  archiveView: $("archiveView"),

  authLoggedOut: $("authLoggedOut"),
  authLoggedIn: $("authLoggedIn"),
  authUsername: $("authUsername"),
  authPassword: $("authPassword"),
  authDisplayName: $("authDisplayName"),
  loginBtn: $("loginBtn"),
  registerBtn: $("registerBtn"),
  logoutBtn: $("logoutBtn"),
  currentUserText: $("currentUserText"),

  tabWriter: $("tabWriter"),
  tabDashboard: $("tabDashboard"),
  tabArchive: $("tabArchive"),
  writerPanel: $("writerPanel"),
  dashboardPanel: $("dashboardPanel"),
  archivePanel: $("archivePanel"),

  studentName: $("studentName"),
  examLevel: $("examLevel"),
  genre: $("genre"),
  targetLevel: $("targetLevel"),
  layoutMode: $("layoutMode"),
  promptText: $("promptText"),
  studentText: $("studentText"),
  generateBtn: $("generateBtn"),
  downloadBtn: $("downloadBtn"),
  openBtn: $("openBtn"),

  folderPath: $("folderPath"),
  studentFolder: $("studentFolder"),
  pdfFiles: $("pdfFiles"),
  importBtn: $("importBtn"),
  importResult: $("importResult"),
  filterName: $("filterName"),
  filterTopic: $("filterTopic"),
  filterFolder: $("filterFolder"),
  filterMin: $("filterMin"),
  filterMax: $("filterMax"),
  filterRisk: $("filterRisk"),
  refreshDashboardBtn: $("refreshDashboardBtn"),
  clearAllRecordsBtn: $("clearAllRecordsBtn"),
  exportCsvLink: $("exportCsvLink"),

  sumRecords: $("sumRecords"),
  sumAvgTotal: $("sumAvgTotal"),
  sumAvgCes: $("sumAvgCes"),
  sumRisk: $("sumRisk"),
  distribution: $("distribution"),
  folderList: $("folderList"),
  riskList: $("riskList"),
  studentCards: $("studentCards"),

  refreshArchiveBtn: $("refreshArchiveBtn"),
  arcTotal: $("arcTotal"),
  arcAvgTotal: $("arcAvgTotal"),
  arcAvgCes: $("arcAvgCes"),
  arcRecent: $("arcRecent"),
  archiveList: $("archiveList"),
  contentModal: $("contentModal"),
  contentModalTitle: $("contentModalTitle"),
  contentModalBody: $("contentModalBody"),
  closeContentModal: $("closeContentModal"),
};

let latestHtml = "";
let currentMode = "writer";
let authed = false;

async function parseResponse(resp) {
  const raw = await resp.text();
  try {
    return { ok: resp.ok, status: resp.status, data: JSON.parse(raw) };
  } catch {
    return { ok: resp.ok, status: resp.status, data: { error: raw || `HTTP ${resp.status}` } };
  }
}

function setStatus(text, isError = false) {
  els.status.textContent = text;
  els.status.style.color = isError ? "#b91c1c" : "#1f2937";
}

function nowDateString() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function esc(s) {
  return String(s ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

function showContentModal(title, content) {
  els.contentModalTitle.textContent = title || "上传文件内容";
  els.contentModalBody.textContent = content || "";
  els.contentModal.classList.remove("hidden");
}

function hideContentModal() {
  els.contentModal.classList.add("hidden");
}

function setAuthUI(user) {
  authed = !!user;
  els.authLoggedOut.classList.toggle("hidden", authed);
  els.authLoggedIn.classList.toggle("hidden", !authed);
  els.currentUserText.textContent = authed ? `${user.display_name || user.username} (@${user.username})` : "-";

  [els.generateBtn, els.importBtn, els.refreshDashboardBtn, els.refreshArchiveBtn, els.clearAllRecordsBtn].forEach((btn) => {
    btn.disabled = !authed;
  });

  if (!authed) setStatus("请先登录", true);
  else setStatus("已登录，可以评分与分析");
}

async function authMe() {
  const parsed = await parseResponse(await fetch("/api/auth/me"));
  const data = parsed.data;
  setAuthUI(data.authenticated ? data.user : null);
}

async function login() {
  try {
    const parsed = await parseResponse(await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: els.authUsername.value.trim(), password: els.authPassword.value }),
    }));
    const data = parsed.data;
    if (!parsed.ok) throw new Error(data.error || "登录失败");
    setAuthUI(data.user);
    setStatus("登录成功");
  } catch (e) {
    setStatus(`登录失败：${e.message}`, true);
  }
}

async function register() {
  try {
    const parsed = await parseResponse(await fetch("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: els.authUsername.value.trim(),
        password: els.authPassword.value,
        displayName: els.authDisplayName.value.trim(),
      }),
    }));
    const data = parsed.data;
    if (!parsed.ok) throw new Error(data.error || "注册失败");
    setStatus("注册成功，请点击登录");
  } catch (e) {
    setStatus(`注册失败：${e.message}`, true);
  }
}

async function logout() {
  await fetch("/api/auth/logout", { method: "POST" });
  setAuthUI(null);
}

function switchMode(mode) {
  currentMode = mode;
  els.tabWriter.classList.toggle("active", mode === "writer");
  els.tabDashboard.classList.toggle("active", mode === "dashboard");
  els.tabArchive.classList.toggle("active", mode === "archive");

  els.writerPanel.classList.toggle("hidden", mode !== "writer");
  els.dashboardPanel.classList.toggle("hidden", mode !== "dashboard");
  els.archivePanel.classList.toggle("hidden", mode !== "archive");

  els.preview.classList.toggle("hidden", mode !== "writer");
  els.dashboardView.classList.toggle("hidden", mode !== "dashboard");
  els.archiveView.classList.toggle("hidden", mode !== "archive");

  if (mode === "dashboard" && authed) refreshDashboard();
  if (mode === "archive" && authed) refreshArchive();
}

function buildWriterPayload() {
  return {
    studentName: els.studentName.value.trim(),
    examLevel: els.examLevel.value,
    genre: els.genre.value,
    targetLevel: els.targetLevel.value,
    layoutMode: els.layoutMode.value,
    promptText: els.promptText.value.trim(),
    studentText: els.studentText.value.trim(),
    date: nowDateString(),
  };
}

async function generateReport() {
  if (!authed) return setStatus("请先登录", true);
  const payload = buildWriterPayload();
  if (!payload.studentName || !payload.promptText || !payload.studentText) return setStatus("请先填写学生姓名、题目和学生原文。", true);

  els.generateBtn.disabled = true;
  setStatus("正在生成评分报告...");
  try {
    const reqBody = apiConfig.mapRequest(payload);
    const parsed = await parseResponse(await fetch(apiConfig.endpoint, {
      method: apiConfig.method || "POST",
      headers: apiConfig.headers || { "Content-Type": "application/json" },
      body: JSON.stringify(reqBody),
    }));
    const data = parsed.data;
    if (!parsed.ok) throw new Error(data.error || "生成失败");

    latestHtml = apiConfig.extractHtml(data);
    if (!latestHtml.includes("<html")) throw new Error("无效HTML");

    els.preview.srcdoc = latestHtml;
    els.downloadBtn.disabled = false;
    els.openBtn.disabled = false;
    setStatus("报告生成并已自动存档");
  } catch (e) {
    setStatus(`生成失败：${e.message}`, true);
  } finally {
    els.generateBtn.disabled = !authed;
  }
}

function downloadHtml() {
  if (!latestHtml) return;
  const blob = new Blob([latestHtml], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${els.studentName.value.trim() || "student"}-writing-report.html`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function openInNewWindow() {
  if (!latestHtml) return;
  const w = window.open();
  if (!w) return;
  w.document.open();
  w.document.write(latestHtml);
  w.document.close();
}

function getFilterParams() {
  const q = new URLSearchParams();
  if (els.filterName.value.trim()) q.set("name", els.filterName.value.trim());
  if (els.filterTopic.value.trim()) q.set("topic", els.filterTopic.value.trim());
  if (els.filterFolder.value.trim()) q.set("folder", els.filterFolder.value.trim());
  if (els.filterMin.value.trim()) q.set("score_min", els.filterMin.value.trim());
  if (els.filterMax.value.trim()) q.set("score_max", els.filterMax.value.trim());
  if (els.filterRisk.checked) q.set("risk_only", "1");
  return q;
}

function renderDistribution(rows) {
  if (!rows.length) return (els.distribution.innerHTML = "<div class='muted'>暂无数据</div>");
  const maxCount = Math.max(...rows.map((r) => r.count), 1);
  els.distribution.innerHTML = rows.map((r) => {
    const width = Math.round((r.count / maxCount) * 100);
    return `<div class='dist-row'><span>${esc(r.bucket)}</span><div class='dist-bar-wrap'><div class='dist-bar' style='width:${width}%'></div></div><span>${r.count}</span></div>`;
  }).join("");
}

function renderFolderList(folders) {
  if (!folders.length) {
    els.folderList.innerHTML = "<div class='muted'>暂无文件夹</div>";
    return;
  }
  els.folderList.innerHTML = folders.map((f) => `
    <div class='list-item'>
      <div>
        <strong>${esc(f.student_folder)}</strong>
        <div class='card-meta'>${f.records_count} 份｜均分 ${esc(f.avg_total ?? "—")}</div>
      </div>
      <button class='small-btn pick-folder' data-folder='${esc(f.student_folder === "未分组" ? "" : f.student_folder)}'>筛选</button>
    </div>
  `).join("");
  document.querySelectorAll(".pick-folder").forEach((btn) => btn.addEventListener("click", () => {
    els.filterFolder.value = btn.dataset.folder || "";
    refreshDashboard();
  }));
}

function renderRiskList(list) {
  if (!list.length) return (els.riskList.innerHTML = "<div class='muted'>暂无风险记录</div>");
  els.riskList.innerHTML = list.map((r) => `<div class='list-item'><div><strong>${esc(r.student_name || "未命名")}</strong><div class='card-meta'>${esc(r.topic_title || "—")}｜总分 ${esc(r.total_score_20)}｜Language ${esc(r.lang_score)}</div></div><button class='jump-student' data-name='${esc(r.student_name || "")}' >定位</button></div>`).join("");
  document.querySelectorAll(".jump-student").forEach((btn) => btn.addEventListener("click", () => {
    els.filterName.value = btn.dataset.name || "";
    refreshDashboard();
  }));
}

async function loadStudentRecords(studentName, container) {
  const parsed = await parseResponse(await fetch(`/api/dashboard/student/${encodeURIComponent(studentName)}/records`));
  const data = parsed.data;
  if (!parsed.ok) throw new Error(data.error || "加载失败");

  container.innerHTML = !data.records.length
    ? "<div class='muted'>暂无记录</div>"
    : `<table class='records-table'><thead><tr><th>日期</th><th>文件夹</th><th>题目</th><th>总分</th><th>CES</th><th>Lang</th><th>风险</th><th>HTML</th><th>查看PDF</th><th>下载PDF</th><th>查看内容</th><th>删除</th></tr></thead><tbody>${data.records.map((r) => `<tr><td>${esc(r.created_at || "—")}</td><td>${esc(r.student_folder || "未分组")}</td><td>${esc(r.topic_title || "—")}</td><td>${esc(r.total_score_20 ?? "—")}</td><td>${esc(r.ces_score ?? "—")}</td><td>${esc(r.lang_score ?? "—")}</td><td>${r.risk_flag ? "是" : "否"}</td><td><a class='link-btn' href='/api/export/report-html/${r.id}' target='_blank'>HTML</a></td><td><a class='link-btn' href='/api/report-record/${r.id}/pdf' target='_blank'>查看</a></td><td><a class='link-btn' href='/api/report-record/${r.id}/pdf?download=1' target='_blank'>下载</a></td><td><button class='view-content' data-id='${r.id}'>查看</button></td><td><button class='delete-record' data-id='${r.id}' data-student='${esc(studentName)}'>删除</button></td></tr>`).join("")}</tbody></table>`;

  container.querySelectorAll(".delete-record").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const ok = window.confirm("确认删除这条上传记录？此操作不可恢复。");
      if (!ok) return;
      const parsed = await parseResponse(await fetch(`/api/report-record/${btn.dataset.id}`, { method: "DELETE" }));
      if (!parsed.ok) {
        setStatus(`删除失败：${parsed.data?.error || "unknown"}`, true);
        return;
      }
      setStatus("删除成功，正在刷新看板...");
      const card = btn.closest("details.card");
      if (card) {
        const c = card.querySelector(".records-container");
        if (c) c.dataset.loaded = "";
      }
      await refreshDashboard();
    });
  });

  container.querySelectorAll(".view-content").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const parsed = await parseResponse(await fetch(`/api/report-record/${btn.dataset.id}/content`));
      if (!parsed.ok) {
        setStatus(`读取内容失败：${parsed.data?.error || "unknown"}`, true);
        return;
      }
      const row = parsed.data;
      const title = `${row.student_name || "未命名"} · ${row.topic_title || "未命名题目"} · ${row.student_folder || "未分组"}`;
      showContentModal(title, row.raw_text || "暂无可显示文本");
    });
  });
}

function renderStudentCards(students) {
  if (!students.length) return (els.studentCards.innerHTML = "<div class='muted'>暂无学生数据</div>");
  els.studentCards.innerHTML = students.map((s, idx) => `<details class='card' ${idx < 3 ? "open" : ""}><summary>${esc(s.student_name)}（${s.records_count} 份）</summary><div class='card-meta'>最新总分 ${esc(s.latest_total ?? "—")}｜最新CES ${esc(s.latest_ces ?? "—")}｜均分 ${esc(s.avg_total ?? "—")}｜风险记录 ${esc(s.risk_records)}</div><div class='records-container' data-student='${esc(s.student_name)}'>点击展开后加载...</div></details>`).join("");

  document.querySelectorAll("details.card").forEach((d) => d.addEventListener("toggle", async () => {
    if (!d.open) return;
    const c = d.querySelector(".records-container");
    if (!c || c.dataset.loaded === "1") return;
    c.dataset.loaded = "1";
    try { await loadStudentRecords(c.dataset.student || "", c); } catch (e) { c.innerHTML = `<div class='muted'>${esc(e.message)}</div>`; }
  }));

  document.querySelectorAll("details.card[open] .records-container").forEach(async (c) => {
    if (c.dataset.loaded === "1") return;
    c.dataset.loaded = "1";
    try { await loadStudentRecords(c.dataset.student || "", c); } catch (e) { c.innerHTML = `<div class='muted'>${esc(e.message)}</div>`; }
  });
}

async function refreshDashboard() {
  if (!authed) return;
  const q = getFilterParams();
  els.exportCsvLink.href = `/api/export/csv?${q.toString()}`;

  const [sRaw, uRaw, fRaw] = await Promise.all([
    fetch(`/api/dashboard/summary?${q.toString()}`),
    fetch(`/api/dashboard/students?${q.toString()}`),
    fetch("/api/dashboard/folders"),
  ]);
  const [sParsed, uParsed, fParsed] = await Promise.all([parseResponse(sRaw), parseResponse(uRaw), parseResponse(fRaw)]);
  const s = sParsed.data;
  const u = uParsed.data;
  const f = fParsed.data;
  if (!sParsed.ok) throw new Error(s.error || "summary失败");
  if (!uParsed.ok) throw new Error(u.error || "students失败");
  if (!fParsed.ok) throw new Error(f.error || "folders失败");

  els.sumRecords.textContent = s.total_records ?? 0;
  els.sumAvgTotal.textContent = s.avg_total_20 ?? 0;
  els.sumAvgCes.textContent = s.avg_ces ?? 0;
  els.sumRisk.textContent = s.risk_count ?? 0;

  renderDistribution(s.distribution || []);
  renderFolderList(f.folders || []);
  renderRiskList(s.risk_students || []);
  renderStudentCards(u.students || []);
  setStatus("看板已更新");
}

async function importReports() {
  if (!authed) return setStatus("请先登录", true);
  els.importBtn.disabled = true;
  setStatus("正在导入报告...");

  try {
    let resp;
    if (els.pdfFiles.files.length > 0) {
      const form = new FormData();
      for (const f of els.pdfFiles.files) form.append("pdfFiles", f, f.name);
      if (els.folderPath.value.trim()) form.append("folderPath", els.folderPath.value.trim());
      if (els.studentFolder.value.trim()) form.append("studentFolder", els.studentFolder.value.trim());
      resp = await parseResponse(await fetch("/api/import-reports", { method: "POST", body: form }));
    } else {
      const folderPath = els.folderPath.value.trim();
      if (!folderPath) throw new Error("请提供文件夹路径或选择PDF文件");
      resp = await parseResponse(await fetch("/api/import-reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ folderPath, studentFolder: els.studentFolder.value.trim() }),
      }));
    }
    const data = resp.data;
    if (!resp.ok) throw new Error(data.error || "导入失败");

    els.importResult.textContent = JSON.stringify(data, null, 2);
    setStatus(`导入完成：成功 ${data.success_count}，失败 ${data.failed_count}`);
    await refreshDashboard();
  } catch (e) {
    setStatus(`导入失败：${e.message}`, true);
    els.importResult.textContent = String(e.message);
  } finally {
    els.importBtn.disabled = !authed;
  }
}

async function clearAllRecords() {
  if (!authed) return setStatus("请先登录", true);
  const ok = window.confirm("确认清空当前账号下所有学生记录与导入批次？此操作不可恢复。");
  if (!ok) return;
  const parsed = await parseResponse(await fetch("/api/report-records", { method: "DELETE" }));
  if (!parsed.ok) {
    setStatus(`清空失败：${parsed.data?.error || "unknown"}`, true);
    return;
  }
  els.importResult.textContent = "已清空所有学生记录";
  setStatus("已清空所有学生记录");
  await refreshDashboard();
}

async function refreshArchive() {
  if (!authed) return;
  const [sRaw, lRaw] = await Promise.all([fetch("/api/archive/summary"), fetch("/api/archive/reports")]);
  const [sParsed, lParsed] = await Promise.all([parseResponse(sRaw), parseResponse(lRaw)]);
  const s = sParsed.data;
  const l = lParsed.data;
  if (!sParsed.ok) throw new Error(s.error || "存档汇总失败");
  if (!lParsed.ok) throw new Error(l.error || "存档列表失败");

  const reports = l.reports || [];
  els.arcTotal.textContent = s.total_reports ?? 0;
  els.arcAvgTotal.textContent = s.avg_total_20 ?? 0;
  els.arcAvgCes.textContent = s.avg_ces ?? 0;
  els.arcRecent.textContent = reports[0]?.created_at || "-";

  if (!reports.length) {
    els.archiveList.innerHTML = "<div class='muted'>暂无评分存档</div>";
    return;
  }

  els.archiveList.innerHTML = reports.map((r) => `
    <div class='list-item'>
      <div>
        <strong>${esc(r.student_name || "未命名")}</strong>
        <div class='card-meta'>${esc(r.exam_level || "—")} ${esc(r.genre || "—")}｜总分 ${esc(r.total_score_20 ?? "—")}｜CES ${esc(r.ces_score ?? "—")}｜${esc(r.created_at || "")}</div>
      </div>
      <button class='open-archive' data-id='${r.id}'>打开</button>
    </div>
  `).join("");

  document.querySelectorAll(".open-archive").forEach((btn) => btn.addEventListener("click", async () => {
    const resp = await fetch(`/api/archive/report/${btn.dataset.id}`);
    const html = await resp.text();
    if (!resp.ok) return setStatus("打开存档失败", true);
    latestHtml = html;
    switchMode("writer");
    els.preview.srcdoc = html;
    els.downloadBtn.disabled = false;
    els.openBtn.disabled = false;
    setStatus("已打开存档报告");
  }));

  setStatus("存档分析已更新");
}

els.loginBtn.addEventListener("click", login);
els.registerBtn.addEventListener("click", register);
els.logoutBtn.addEventListener("click", logout);

els.tabWriter.addEventListener("click", () => switchMode("writer"));
els.tabDashboard.addEventListener("click", () => switchMode("dashboard"));
els.tabArchive.addEventListener("click", () => switchMode("archive"));

els.generateBtn.addEventListener("click", generateReport);
els.downloadBtn.addEventListener("click", downloadHtml);
els.openBtn.addEventListener("click", openInNewWindow);
els.importBtn.addEventListener("click", importReports);
els.clearAllRecordsBtn.addEventListener("click", clearAllRecords);
els.refreshDashboardBtn.addEventListener("click", async () => { try { await refreshDashboard(); } catch (e) { setStatus(e.message, true); } });
els.refreshArchiveBtn.addEventListener("click", async () => { try { await refreshArchive(); } catch (e) { setStatus(e.message, true); } });
els.closeContentModal.addEventListener("click", hideContentModal);
els.contentModal.addEventListener("click", (e) => {
  if (e.target === els.contentModal) hideContentModal();
});

switchMode("writer");
authMe();
