/**
 * B'BOX Production - Configuration & Feature Flags
 * ==================================================
 */

const CONFIG = {
  // API Settings
  API_TIMEOUT: 30000,
  
  // Feature Flags - toggle features on/off
  FEATURES: {
    MATERIALS: true,           // Управление материалами
    BARCODE: true,             // Штрихкоды
    FORECASTING: true,         // Прогнозирование
    ANALYTICS: true,           // Расширенная аналитика
    CLIENT_PROFILES: true,     // Профили клиентов
    PRODUCT_TEMPLATES: true,   // Шаблоны изделий (MVP)
    FILE_ATTACHMENTS: true,    // Вложения к операциям
    ADVANCED_WIZARD: true,     // Расширенный мастер заказов
    TIMER: true,               // Таймер наладки и работы
    SORTING: true,             // Сортировка таблиц
    RESIZABLE_COLUMNS: true,   // Изменяемая ширина столбцов
  },
  
  // UI Settings
  UI: {
    TOAST_DURATION: 2500,
    NOTIFICATION_DURATION: 10000,
    DEBOUNCE_SAVE: 500,
    ANIMATION_DURATION: 200,
  },
  
  // Date/Time formats
  DATE_LOCALE: "ru-RU",
  
  // Product Types
  PRODUCT_TYPES: ["Коробка", "Крышка", "Ложемент"],
  
  // Default statuses
  STATUSES: ["Ожидает", "В работе", "Выполнено"],
};

// Helper to check if feature is enabled
function isFeatureEnabled(featureName) {
  return CONFIG.FEATURES[featureName] === true;
}

// Export to global scope
window.CONFIG = CONFIG;
window.isFeatureEnabled = isFeatureEnabled;


