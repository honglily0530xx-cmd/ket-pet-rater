---
name: ket-pet-writing-rater
description: Cambridge KET/PET writing evaluation and classroom-ready report generation. Use when the user asks to grade, annotate, explain, rewrite, or batch-process KET(A2)/PET(B1) student compositions into a single printable HTML report with error indexing, bilingual explanations, model rewrite, and official-style scoring.
---

# KET/PET Writing Rater

Generate one complete HTML report for each composition, optimized for A4 printing and classroom walkthrough.

## Produce Required Input Object

Normalize user input into this structure before writing the report:

```json
{
  "exam_level": "KET | PET",
  "genre": "article | email | story | review | message | unknown",
  "topic_title": "string",
  "prompt_text": "string",
  "student_name": "string | null",
  "date": "string | null",
  "student_text": "string",
  "word_count_est": 0,
  "model_word_count_est": 0,
  "target_level": "PET_Band5 | B2",
  "layout_mode": "A | B",
  "overall_band": "A2 | B1 | B1+ | B2",
  "final_comment": "string"
}
```

Use `layout_mode="B"` by default unless the user explicitly requests mode A.

## Follow 6-Module Workflow

### M1 Input Parser

Extract student name/date when present, infer genre from explicit labels first, estimate word count by whitespace tokens.

### M2 Error Miner

Select classroom-useful issues only.

Prioritize in this order:

1. Sentence-level clarity problems (missing subject/verb, broken word order).
2. High-frequency score impacts (subject-verb agreement, tense, singular/plural, articles, prepositions, collocation).
3. Unnatural linking or phrasing.
4. Word form and spelling.

Do not flag punctuation/spacing artifacts unless they clearly block understanding.

Number issues in appearance order: `[1] [2] [3] ...`.

Each ID maps to one teachable point.

### M3 Two-Column Renderer

Always keep two columns in print mode.

Mode A:

- Left: untouched student text.
- Right: marked text with red underline and IDs.

Mode B (default):

- Left: marked student text.
- Right: error explanation table.

For every error ID provide:

- Error type
- Chinese explanation (one concise sentence)
- One natural English fix

Also provide compact comment rows for this template style:

- `error_rows_compact_html`: one row per index with concise teacher note

### M4 Model Rewrite

Write target-level model text (`PET_Band5` or `B2`) while preserving student strengths and useful advanced words when possible.

Mark inserted/upgraded parts with `<span class="up">...</span>`.

### M5 Upgrade Notes

Provide compact notes for:

- Content
- Organisation
- Language
- Communicative Achievement
- One-line overall summary

Keep each dimension to at most two bullets.

### M6 Scoring + Scale

Score four dimensions with integer `1-5` and short Chinese rationales:

- Content
- Communicative Achievement
- Organisation
- Language

Compute total out of 20.

Map total to Cambridge English Scale using linear interpolation across anchors:

- `5 -> 102`
- `8 -> 120`
- `12 -> 140`
- `17 -> 160`

Round CES to nearest integer and output CEFR band.

## Enforce Output HTML Contract

Return exactly one complete HTML document:

- Start with `<!DOCTYPE html>`.
- Use inline CSS only.
- Keep layout compact and printable on A4.
- Keep section order fixed:
  1. Header meta
  2. 一、学生原文 & 批注（page 1）
  3. 二、优化范文
  4. 三、修改亮点说明
  5. 四、官方标准评分（last）
- Use 2-page default layout.

Use this print-safe baseline:

```css
.two-col{
  display:grid;
  grid-template-columns:1fr 1fr;
  gap:12px;
  align-items:start;
}
@media print{
  .two-col{
    display:grid !important;
    grid-template-columns:1fr 1fr !important;
    gap:10mm !important;
  }
  .page{
    box-shadow:none !important;
    border-radius:0 !important;
    padding:12mm 12mm !important;
  }
  .print-page-break{ page-break-after:always; }
  .avoid-break{ page-break-inside:avoid; break-inside:avoid; }
}
```

## Use This Minimal HTML Class Contract

Use these classes consistently:

- `.err` red underline for error spans
- `.eid` small error ID badge
- `.up` red highlight for model upgrades
- `.two-col` fixed two-column module
- `.page` page container
- `.print-page-break` forced page break
- `.avoid-break` avoid split across pages

## Batch Mode

When user provides multiple compositions, generate one class dashboard HTML:

- One collapsible student card per composition.
- Keep same scoring structure per card.
- Preserve printability.
