/**
 * B'BOX Production - Utility Functions
 * =====================================
 * 
 * Базовые утилиты. Notifications определены в index.html.
 */

// DOM helper
function $(id) { return document.getElementById(id); }

// Escape HTML
function esc(s) { 
  return String(s ?? "").replace(/[&<>"']/g, m => ({ 
    "&": "&amp;", 
    "<": "&lt;", 
    ">": "&gt;", 
    '"': "&quot;", 
    "'": "&#039;" 
  }[m])); 
}

// Today's date in ISO format
function todayISO() {
  const d = new Date();
  const off = d.getTimezoneOffset();
  const local = new Date(d.getTime() - off * 60000);
  return local.toISOString().slice(0, 10);
}

// Format ISO date to readable format
function formatDate(isoDate) {
  if (!isoDate) return "";
  const parts = isoDate.split("-");
  if (parts.length !== 3) return isoDate;
  const [year, month, day] = parts;
  return `${day}.${month}.${year}`;
}

// Generate unique ID
function uid() { 
  return Math.random().toString(16).slice(2, 10) + "-" + Date.now().toString(16).slice(-6); 
}

// Format duration in seconds to readable format
function formatDuration(seconds) {
  if (!seconds || seconds <= 0) return "—";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}ч ${m}м`;
  if (m > 0) return `${m}м ${s}с`;
  return `${s}с`;
}

// Format stock value
function formatStock(x) { 
  if (x === null || x === undefined) return "—";
  return parseFloat(x).toFixed(2).replace(/\.?0+$/, ""); 
}

// File to Base64 conversion
async function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const res = String(reader.result || "");
      const base64 = res.includes(",") ? res.split(",")[1] : res;
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// Parse time string (HH:MM) to Date
function parseTimeToDate(timeStr, refDate = new Date()) {
  if (!timeStr) return null;
  const [h, m] = timeStr.split(":").map(Number);
  const d = new Date(refDate);
  d.setHours(h, m, 0, 0);
  return d;
}

// Compatibility entry points; columns.js is the only resize/persistence owner.
function initTableColumnResize(tableIdOrElement) {
  const table = typeof tableIdOrElement === 'string' ? document.getElementById(tableIdOrElement) : tableIdOrElement;
  return window.ColumnsModule?.initTable(table);
}
function initAllTableColumnResize() { return window.ColumnsModule?.initAll(); }

// Export utilities for global access
window.$ = $;
window.esc = esc;
window.todayISO = todayISO;
window.formatDate = formatDate;
window.uid = uid;
window.formatDuration = formatDuration;
window.formatStock = formatStock;
window.fileToBase64 = fileToBase64;
window.parseTimeToDate = parseTimeToDate;
window.initTableColumnResize = initTableColumnResize;
window.initAllTableColumnResize = initAllTableColumnResize;
// Width persistence and application are exported exclusively by columns.js.
