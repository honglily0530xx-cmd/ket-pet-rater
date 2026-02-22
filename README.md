# KET/PET 写作评分 + 学生测评看板（含登录与存档）

本项目支持：
- 登录后进行单篇写作评分
- 评分结果自动存档
- 批量上传历史 PDF 报告并做班级分析看板

## 启动

```bash
cd "/Users/hongcaimei/Documents/New project"
npm start
```

访问：<http://127.0.0.1:3000>

## 第一次使用

1. 在页面左侧“账号登录”模块注册账号（用户名+密码）
2. 注册后点击登录
3. 登录成功后可使用“写作评分 / 学生看板 / 评分存档”三个 Tab

## 模型配置（可选）

```bash
export ANTHROPIC_AUTH_TOKEN="..."
export ANTHROPIC_BASE_URL="https://api.minimaxi.com/anthropic"
export ANTHROPIC_MODEL="MiniMax-M2.5"
```

未配置时，单篇评分返回降级预览 HTML。

## 历史报告上传（学生看板）

在“学生看板”Tab：

- 可设置“学生姓名文件夹（归档分组）”，导入报告时会写入该分组
- 方式A：填目录路径并导入（推荐本机部署）
- 方式B：直接选择多个 PDF 文件导入

导入后可查看：
- 班级均分（/20）
- CES 均值
- 分数分布
- 风险名单（总分<12 或 Language<=2）
- 学生卡片（展开看历史记录）
- 可按“学生文件夹”聚合查看与筛选

支持导出：
- 班级 CSV
- 记录行导出单人 HTML
- 记录行可直接“查看PDF/下载PDF”（原版式不变）
- 记录行点击“查看”可查看上传文件解析内容
- 记录行删除已上传文档（不可恢复）
- 一键清空当前账号全部学生记录（用于重建分组）

## 评分存档分析

在“评分存档”Tab：
- 自动统计存档总数/平均总分/平均CES
- 展示历史评分记录
- 点击“打开”可加载旧报告预览

## API 概览

认证：
- `POST /api/auth/register`
- `POST /api/auth/login`
- `POST /api/auth/logout`
- `GET /api/auth/me`

评分：
- `POST /api/generate-report`（需登录，自动存档）

看板导入与查询：
- `POST /api/import-reports`
- `GET /api/dashboard/summary`
- `GET /api/dashboard/students`
- `GET /api/dashboard/folders`
- `GET /api/dashboard/student/:name/records`

导出：
- `GET /api/export/csv`
- `GET /api/export/report-html/:recordId`
- `GET /api/report-record/:recordId/content`
- `GET /api/report-record/:recordId/pdf`
- `DELETE /api/report-record/:recordId`
- `DELETE /api/report-records`

存档：
- `GET /api/archive/summary`
- `GET /api/archive/reports`
- `GET /api/archive/report/:id`

## 数据存储

SQLite 文件：`/Users/hongcaimei/Documents/New project/data/dashboard.sqlite`

主要表：
- `users`
- `sessions`
- `generated_reports`
- `report_records`
- `import_batches`
- `import_failures`

说明：数据按用户隔离（登录用户仅看自己的导入与存档）。
