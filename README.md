# KP Writing Lab

KET/PET 写作评分、反馈报告生成与学生成长看板。

KP Writing Lab is a lightweight local web app for English teachers who want to grade Cambridge KET/PET writing, generate printable feedback reports, archive results, and review class-level progress from historical PDF reports.

## Core Pain Point

Teachers do not only need an AI comment. They need a **standardized writing assessment report** that can be sent to students, printed as PDF, archived, and compared over time.

Input a writing task and a student response. KP Writing Lab turns them into a structured report with a numbered annotated text, explanation table, model rewrite, scoring, and archive-ready metadata.

View an anonymized output example:

- [Actual PDF writing report example](reports/PET-Writing-Report-Student-A-Computer-Games.pdf)
- [Standardized PET writing report example](reports/PET-Writing-Report-Student-A-Computer-Games.html)
- [中文：标准化报告输出说明](docs/标准化报告输出示例.md)

## 中文入口

- [中文使用指南](docs/中文使用指南.md)
- [Skill 输入到报告的变化](docs/中文使用指南.md#使用-skill-后的变化)
- [标准化报告输出示例](docs/标准化报告输出示例.md)
- [中文推广文案](docs/中文推广文案.md)
- [隐私与安全说明](SECURITY.md)

## Highlights

- **Single writing assessment**: paste a student response and generate a structured HTML feedback report.
- **Cambridge-style dimensions**: organize comments around content, organisation, communicative achievement, and language.
- **Teacher dashboard**: import historical PDF reports and review class averages, score distribution, risk records, and student histories.
- **Archive workflow**: save generated reports automatically after login.
- **Local-first storage**: data is stored in SQLite on your own machine.
- **Graceful demo mode**: without an API key, the app still runs and returns a local preview report.

## Who This Is For

- English teachers preparing KET/PET learners
- Tutors who need repeatable writing feedback templates
- Small classes tracking writing progress over time
- Teachers experimenting with AI-assisted marking while keeping records local

## Quick Start

```bash
git clone https://github.com/honglily0530xx-cmd/ket-pet-rater.git
cd ket-pet-rater
npm start
```

Open:

```text
http://127.0.0.1:3000
```

Then register a local teacher account in the left sidebar.

## Optional AI Configuration

The app can call OpenAI-compatible or Anthropic-compatible APIs. If no model key is configured, it runs in local fallback mode.

OpenAI:

```bash
export OPENAI_API_KEY="your-api-key"
export OPENAI_MODEL="gpt-4.1-mini"
npm start
```

Anthropic-compatible endpoint:

```bash
export ANTHROPIC_AUTH_TOKEN="your-api-key"
export ANTHROPIC_BASE_URL="https://api.example.com/anthropic"
export ANTHROPIC_MODEL="claude-3-5-sonnet-latest"
npm start
```

## Main Workflow

1. Log in or register a local account.
2. Paste the writing task and student response.
3. Choose KET or PET, genre, target band, and layout mode.
4. Generate a feedback report.
5. Download or open the HTML report.
6. Review saved reports in the archive tab.
7. Import historical PDF reports into the student dashboard.

## Dashboard Features

- Class average score out of 20
- Average Cambridge English Scale estimate
- Score distribution
- Risk list for low total score or weak language score
- Student folders and individual history
- CSV export
- Original uploaded PDF viewing and download

## Project Structure

```text
.
├── public/                  # Browser UI
├── services/                # Auth, SQLite dashboard, PDF import/export
├── prompts/                 # System prompt for report generation
├── reports/                 # Anonymized report examples
├── ket-pet-writing-rater/   # Codex skill assets and prompt references
├── data/                    # Local SQLite runtime files, ignored by Git
└── server.js                # Node.js HTTP server
```

## Privacy Notes

This project is designed for local teacher workflows, but writing records can still contain sensitive student data.

- Do not commit real student names, essays, or generated reports.
- Keep local SQLite files out of Git.
- Use anonymized examples such as `Student A`.
- Review uploaded PDFs before sharing the repository publicly.

See [SECURITY.md](SECURITY.md) for practical publishing checks.

## API Overview

Authentication:

- `POST /api/auth/register`
- `POST /api/auth/login`
- `POST /api/auth/logout`
- `GET /api/auth/me`

Writing assessment:

- `POST /api/generate-report`

Dashboard:

- `POST /api/import-reports`
- `GET /api/dashboard/summary`
- `GET /api/dashboard/students`
- `GET /api/dashboard/folders`
- `GET /api/dashboard/student/:name/records`

Exports and records:

- `GET /api/export/csv`
- `GET /api/export/report-html/:recordId`
- `GET /api/report-record/:recordId/content`
- `GET /api/report-record/:recordId/pdf`
- `DELETE /api/report-record/:recordId`
- `DELETE /api/report-records`

Archive:

- `GET /api/archive/summary`
- `GET /api/archive/reports`
- `GET /api/archive/report/:id`

## Roadmap Ideas

- Add hosted demo deployment notes
- Add screenshot gallery
- Add rubric presets for KET, PET, FCE, and school writing
- Add anonymized sample dataset
- Add teacher-facing export templates

## License

MIT
