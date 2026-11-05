/**
 * B'BOX Production - Application State
 * =====================================
 */

// Load saved preferences from localStorage
const savedSortBy = localStorage.getItem("sortBy") || "order";
const savedMaterialsSortBy = localStorage.getItem("materialsSortBy") || "name";
const savedMaterialsSortDir = localStorage.getItem("materialsSortDir") || "asc";
const savedOpsColumnSort = localStorage.getItem("opsColumnSort") || "";
const savedOpsSortDir = localStorage.getItem("opsSortDir") || "asc";

// Global application state
const state = {
  // Core data
  operators: [],
  machines: [],
  materials: [],
  orders: [],
  orderItemsByOrder: {},
  ops: [],
  templates: [],
  
  // Product templates (MVP)
  productTemplates: [],
  
  // Client profiles
  clientProfiles: [],
  clientProfileItems: {}, // profile_id -> items
  
  // Units
  units: [],
  
  // UI state
  activeOrderId: "",
  currentTemplate: "Коробка крышка-дно",
  
  // Sorting preferences
  sortBy: savedSortBy,
  materialsSortBy: savedMaterialsSortBy,
  materialsSortDir: savedMaterialsSortDir,
  opsColumnSort: savedOpsColumnSort,
  opsSortDir: savedOpsSortDir,
  
  // Server column widths cache (for admin)
  serverColumnWidths: {}
};

// Current authenticated user
let currentUser = null; // { username, role, operatorName }

// Export to global scope
window.state = state;
window.currentUser = currentUser;

// Helper to update currentUser
function setCurrentUser(user) {
  currentUser = user;
  window.currentUser = user;
}

window.setCurrentUser = setCurrentUser;


