/**
 * B'BOX Production - Module Loader
 * Lazy loading модулей при переключении вкладок
 */

const ModuleLoader = {
  loaded: new Set(),
  loading: new Map(),
  activating: new Map(),
  mounted: new Set(),
  
  // Версия для cache-busting (обновлять при изменениях)
  version: '20261105-pages1',
  
  // Маппинг разделов на модули
  moduleMap: {
    'orders': ['modules/orders.js'],
    'routing': ['modules/routing.js'],
    'my': ['modules/my.js'],
    'machine': ['modules/machine.js'],
    'designer': ['modules/designer.js'],
    'techcards': ['tech-card-model.js', 'tech-card-print.js', 'modules/tech-cards.js'],
    'brain': ['modules/brain.js'],
         'cutting': ['modules/cutting.js'],
         'cutting-simple': ['modules/cutting-simple.js'],
    'settings': ['modules/settings.js'],
    'stats': ['modules/stats.js'],
    'clients': ['modules/clients.js'],
    'warehouse': ['modules/warehouse.js'],
    'finance': ['modules/finance.js'],
    'barcode': ['modules/barcode.js'],
    'processes': ['modules/process-tracking.js'],
    'auth': ['modules/auth.js'],
    'diagnostics': ['modules/diagnostics.js']
  },
  
  // Загрузить модуль
  async load(modulePath) {
    if (this.loaded.has(modulePath)) {
      return Promise.resolve();
    }
    
    if (this.loading.has(modulePath)) {
      return this.loading.get(modulePath);
    }
    
    const promise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'js/' + modulePath + '?v=' + this.version;
      script.async = true;
      script.onload = () => {
        this.loaded.add(modulePath);
        this.loading.delete(modulePath);
        console.log(`Module loaded: ${modulePath}`);
        resolve();
      };
      script.onerror = (e) => {
        this.loading.delete(modulePath);
        console.error(`Failed to load module: ${modulePath}`, e);
        reject(e);
      };
      document.head.appendChild(script);
    });
    
    this.loading.set(modulePath, promise);
    return promise;
  },
  
  // Загрузить модули для раздела
  loadForPane(paneId) {
    if (this.activating.has(paneId)) return this.activating.get(paneId);
    const modules = this.moduleMap[paneId];
    if (!modules?.length) return Promise.resolve();
    const activation = (async () => {
      if (paneId === 'techcards') {
        // Print code reads the model while evaluating the script.
        for (const modulePath of modules) await this.load(modulePath);
      } else {
        await Promise.all(modules.map(modulePath => this.load(modulePath)));
      }
      await this.initModule(paneId);
    })().finally(() => this.activating.delete(paneId));
    this.activating.set(paneId, activation);
    return activation;
  },

  // Инициализировать модуль
  async initModule(paneId) {
    switch(paneId) {
      case 'brain':
        if (window.BrainModule?.init) await window.BrainModule.init();
        break;
      case 'techcards':
        if (window.TechCardsModule?.init) await window.TechCardsModule.init();
        break;
      case 'designer':
        // Designer.init binds listeners; re-entry only restarts live updates in switchPane.
        if (!this.mounted.has(paneId) && window.DesignerModule?.init) {
          await window.DesignerModule.init();
          this.mounted.add(paneId);
        }
        break;
      case 'settings':
        if(window.SettingsModule?.init) {
          await window.SettingsModule.init();
        }
        // Рендерим материалы, типы материалов и единицы измерения
        console.log("[loader] Инициализация вкладки settings");
        console.log("[loader] state.materialTypes:", window.state?.materialTypes);
        if(window.renderMaterialsSettings) {
          console.log("[loader] Вызываем renderMaterialsSettings()");
          renderMaterialsSettings();
        }
        if(window.renderMaterialTypesSettings) {
          console.log("[loader] Вызываем renderMaterialTypesSettings()");
          renderMaterialTypesSettings();
        } else {
          console.warn("[loader] renderMaterialTypesSettings не найдена");
        }
        if(window.renderUnitsSettings) renderUnitsSettings();
        if(window.renderProductTypesSettings) renderProductTypesSettings();
        if(window.renderProductTemplatesSettings) renderProductTemplatesSettings();
        if(window.renderClientProfilesSettings) renderClientProfilesSettings();
        break;
      case 'stats':
        if(window.StatsModule?.init) {
          await window.StatsModule.init();
        }
        break;
      case 'clients':
        if(window.ClientsModule?.renderClients) {
          await window.ClientsModule.renderClients();
        }
        break;
      case 'warehouse':
        if(window.WarehouseModule?.init) {
          await window.WarehouseModule.init();
        }
        break;
      case 'finance':
        if(window.FinanceModule?.init) {
          await window.FinanceModule.init();
        }
        break;
      case 'cutting':
        if(window.CuttingModule) {
          // Инициализируем модуль при переключении на вкладку
          if(window.CuttingModule.init) {
            await window.CuttingModule.init();
          } else if(window.CuttingModule.renderCutting) {
            await window.CuttingModule.renderCutting();
          }
        }
        break;
      case 'cutting-simple':
        if (window.SimpleCuttingModule?.init) await window.SimpleCuttingModule.init();
        break;
      case 'processes':
        // Инициализация вкладки процессов
        if (window.initializeProcessesTab) {
          await window.initializeProcessesTab();
        } else {
          // Загружаем данные при открытии
          setTimeout(() => {
            if (window.ProcessTrackingModule) {
              const orderFilter = $('processOrderFilter');
              const statusFilter = $('processStatusFilter');
              
              if (orderFilter && statusFilter) {
                // Заполняем фильтр заказов
                const orders = (window.state?.orders || []).slice().sort((a, b) => a.id.localeCompare(b.id));
                orderFilter.innerHTML = '<option value="">(Все заказы)</option>' +
                  orders.map(o => `<option value="${o.id}">${o.id} - ${o.client || ''}</option>`).join('');
                
                // Устанавливаем обработчики
                const refreshBtn = $('refreshProcesses');
                if (refreshBtn) {
                  refreshBtn.onclick = async () => {
                    const orderId = orderFilter.value || null;
                    window.ProcessTrackingModule.state.filterStatus = statusFilter.value || 'all';
                    await window.ProcessTrackingModule.updateProcessVisualization(orderId, null);
                  };
                }
                
                orderFilter.onchange = () => {
                  if (refreshBtn) refreshBtn.onclick();
                };
                
                statusFilter.onchange = () => {
                  if (window.ProcessTrackingModule) {
                    window.ProcessTrackingModule.state.filterStatus = statusFilter.value || 'all';
                    const orderId = orderFilter.value || null;
                    window.ProcessTrackingModule.updateProcessVisualization(orderId, null);
                  }
                };
                
                // Загружаем данные
                if (window.ProcessTrackingModule) {
                  window.ProcessTrackingModule.updateProcessVisualization(null, null);
                }
              }
            }
          }, 100);
        }
        break;
      case 'diagnostics':
        if (window.DiagnosticsModule?.init) {
          await window.DiagnosticsModule.init();
        }
        break;
    }
  },
  
  // Предзагрузка критичных модулей
  async preloadCritical() {
    // Boot and lazy navigation share one versioned script registry.
    const critical = ['modules/routing.js', 'modules/my.js', 'modules/orders.js', 'modules/routing-column-manager.js', 'modules/process-tracking.js'];
    return Promise.all(critical.map(m => this.load(m)));
  }
};

// Expose globally
window.ModuleLoader = ModuleLoader;

