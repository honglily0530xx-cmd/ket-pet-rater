window.KP_API_CONFIG = {
  endpoint: "/api/generate-report",
  method: "POST",
  headers: {
    "Content-Type": "application/json"
  },
  // If your backend expects different request keys, map them here.
  mapRequest(payload) {
    return payload;
  },
  // Return the HTML string from your backend response.
  // Example alternative: return resp.data.html;
  extractHtml(resp) {
    return resp.reportHtml;
  }
};
