window.KP_API_CONFIG = {
  endpoint: "https://your-api.example.com/writing/report",
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "Authorization": "Bearer YOUR_TOKEN"
  },
  mapRequest(payload) {
    return {
      student_name: payload.studentName,
      exam_level: payload.examLevel,
      genre: payload.genre,
      target_level: payload.targetLevel,
      layout_mode: payload.layoutMode,
      prompt_text: payload.promptText,
      student_text: payload.studentText,
      date: payload.date
    };
  },
  extractHtml(resp) {
    return resp.data?.report_html || resp.report_html;
  }
};
