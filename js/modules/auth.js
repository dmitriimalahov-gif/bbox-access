/**
 * B'BOX Production - Auth Module
 * Модуль авторизации
 */

(function() {
  'use strict';
  
  if (window.AuthModule && window.AuthModule.loaded) {
    console.log('Auth module already loaded');
    return;
  }
  
  console.log('Loading Auth module...');
  
  // Check current user
  async function checkAuth() {
    try {
      const res = await api("/api/auth/me");
      window.currentUser = res;
      state.currentUser = res;
      return res;
    } catch(e) {
      window.currentUser = null;
      state.currentUser = null;
      return null;
    }
  }
  
  // Login as operator
  async function loginAsOperator(operatorId, operatorName) {
    try {
      const res = await api("/api/auth/login-operator", {
        method: "POST",
        body: JSON.stringify({ operatorId, operatorName })
      });
      window.currentUser = res;
      state.currentUser = res;
      return res;
    } catch(e) {
      throw e;
    }
  }
  
  // Login as admin
  async function loginAsAdmin(password) {
    try {
      const res = await api("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ username: "admin", password })
      });
      window.currentUser = res;
      state.currentUser = res;
      return res;
    } catch(e) {
      throw e;
    }
  }
  
  // Logout
  async function logout() {
    try {
      await api("/api/auth/logout", { method: "POST" });
    } catch(e) {
      console.error("Logout error:", e);
    }
    window.currentUser = null;
    state.currentUser = null;
  }
  
  // Expose globally
  window.checkAuth = checkAuth;
  window.loginAsOperator = loginAsOperator;
  window.loginAsAdmin = loginAsAdmin;
  window.logout = logout;
  
  // Module export
  window.AuthModule = {
    loaded: true,
    checkAuth,
    loginAsOperator,
    loginAsAdmin,
    logout
  };
  
  console.log('Auth module loaded successfully');
  
})();


