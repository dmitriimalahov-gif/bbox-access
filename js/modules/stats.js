/**
 * B'BOX Production - Stats Module
 * Модуль статистики и аналитики
 */

(function() {
  'use strict';
  
  if (window.StatsModule && window.StatsModule.loaded) {
    console.log('Stats module already loaded');
    return;
  }
  
  console.log('Loading Stats module...');

function renderAnalytics(data){
  const container = $("analyticsResults");
  container.style.display = "block";
  
  if(data.type === "operator"){
    // Аналитика по оператору
    let html = `
      <div style="margin-bottom:20px">
        <h4 style="margin-bottom:10px">📊 Метрики оператора: <b>${esc(data.operator)}</b></h4>
        <div class="row" style="gap:10px;flex-wrap:wrap">
          <div style="flex:1;min-width:150px;padding:12px;background:rgba(0,207,181,.1);border-radius:8px;border:1px solid rgba(0,207,181,.3)">
            <div style="font-size:11px;color:var(--muted);margin-bottom:4px">Всего операций</div>
            <div style="font-weight:800;font-size:18px">${data.metrics.totalOps}</div>
          </div>
          <div style="flex:1;min-width:150px;padding:12px;background:rgba(46,204,113,.1);border-radius:8px;border:1px solid rgba(46,204,113,.3)">
            <div style="font-size:11px;color:var(--muted);margin-bottom:4px">Среднее время</div>
            <div style="font-weight:800;font-size:18px">${formatDuration(data.metrics.avgDuration)}</div>
          </div>
          <div style="flex:1;min-width:150px;padding:12px;background:rgba(255,176,32,.1);border-radius:8px;border:1px solid rgba(255,176,32,.3)">
            <div style="font-size:11px;color:var(--muted);margin-bottom:4px">Эффективность</div>
            <div style="font-weight:800;font-size:18px">${data.metrics.avgEfficiency}%</div>
          </div>
          <div style="flex:1;min-width:150px;padding:12px;background:rgba(46,204,113,.1);border-radius:8px;border:1px solid rgba(46,204,113,.3)">
            <div style="font-size:11px;color:var(--muted);margin-bottom:4px">Качество</div>
            <div style="font-weight:800;font-size:18px">${data.metrics.qualityScore}%</div>
          </div>
        </div>
      </div>
    `;
    
    // Узкие места
    if(data.bottlenecks.length > 0){
      html += `
        <div style="margin-bottom:20px">
          <h4 style="margin-bottom:10px">⚠️ Выявленные узкие места (${data.bottlenecks.length})</h4>
          <div style="max-height:400px;overflow-y:auto">
      `;
      
      for(const bottleneck of data.bottlenecks){
        const severityColor = bottleneck.severity === "critical" ? "var(--bad)" : "var(--warn)";
        const severityBg = bottleneck.severity === "critical" ? "rgba(255,77,77,.1)" : "rgba(255,176,32,.1)";
        const severityBorder = bottleneck.severity === "critical" ? "rgba(255,77,77,.3)" : "rgba(255,176,32,.3)";
        
        html += `
          <div style="padding:12px;margin-bottom:8px;background:${severityBg};border-radius:8px;border:1px solid ${severityBorder}">
            <div style="display:flex;justify-content:space-between;align-items:start;margin-bottom:6px">
              <div>
                <div style="font-weight:800;color:${severityColor};margin-bottom:4px">
                  ${bottleneck.severity === "critical" ? "🚨" : "⚠️"} ${esc(bottleneck.message)}
                </div>
                <div style="font-size:12px;color:var(--muted)">
                  Операция: ${esc(bottleneck.operation)} · Заказ: ${esc(bottleneck.orderId)} · №${bottleneck.no}
                </div>
              </div>
            </div>
            <div style="display:flex;gap:12px;margin-top:8px;font-size:11px">
              <span>План: <b>${formatDuration(bottleneck.planned)}</b></span>
              <span>Факт: <b style="color:${severityColor}">${formatDuration(bottleneck.actual)}</b></span>
              <span>Превышение: <b style="color:${severityColor}">+${formatDuration(bottleneck.overtime)} (${bottleneck.overtimePercent}%)</b></span>
            </div>
          </div>
        `;
      }
      
      html += `
          </div>
        </div>
      `;
    } else {
      html += `
        <div style="padding:12px;background:rgba(46,204,113,.1);border-radius:8px;border:1px solid rgba(46,204,113,.3);margin-bottom:20px">
          ✅ Узких мест не выявлено! Оператор работает эффективно.
        </div>
      `;
    }
    
    // Группировка по операциям
    if(Object.keys(data.byOperation).length > 0){
      html += `
        <div style="margin-bottom:20px">
          <h4 style="margin-bottom:10px">📋 Статистика по типам операций</h4>
          <table class="resizable-table">
            <thead>
              <tr>
                <th style="width:200px">Операция</th>
                <th style="width:100px">Количество</th>
                <th style="width:120px">Среднее время</th>
                <th style="width:120px">Средняя наладка</th>
              </tr>
            </thead>
            <tbody>
      `;
      
      const sortedOps = Object.entries(data.byOperation).sort((a,b) => b[1].count - a[1].count);
      for(const [opName, opData] of sortedOps){
        html += `
          <tr>
            <td><b>${esc(opName)}</b></td>
            <td>${opData.count}</td>
            <td>${formatDuration(opData.avgDuration)}</td>
            <td>${formatDuration(opData.avgSetupTime)}</td>
          </tr>
        `;
      }
      
      html += `
            </tbody>
          </table>
        </div>
      `;
    }
    
    container.innerHTML = html;
  } else if(data.type === "order"){
    // Аналитика по заказу
    let html = `
      <div style="margin-bottom:20px">
        <h4 style="margin-bottom:10px">📦 Анализ заказа: <b>${esc(data.orderId)}</b></h4>
        <div class="row" style="gap:10px">
          <div style="flex:1;padding:12px;background:rgba(0,207,181,.1);border-radius:8px;border:1px solid rgba(0,207,181,.3)">
            <div style="font-size:11px;color:var(--muted);margin-bottom:4px">Всего операций</div>
            <div style="font-weight:800;font-size:18px">${data.totalOps}</div>
          </div>
          <div style="flex:1;padding:12px;background:rgba(46,204,113,.1);border-radius:8px;border:1px solid rgba(46,204,113,.3)">
            <div style="font-size:11px;color:var(--muted);margin-bottom:4px">Выполнено</div>
            <div style="font-weight:800;font-size:18px">${data.completedOps}</div>
          </div>
        </div>
      </div>
    `;
    
    // Узкие места
    if(data.bottlenecks.length > 0){
      html += `
        <div style="margin-bottom:20px">
          <h4 style="margin-bottom:10px">⚠️ Узкие места в заказе (${data.bottlenecks.length})</h4>
      `;
      
      for(const bottleneck of data.bottlenecks){
        const severityColor = bottleneck.severity === "critical" ? "var(--bad)" : "var(--warn)";
        const severityBg = bottleneck.severity === "critical" ? "rgba(255,77,77,.1)" : "rgba(255,176,32,.1)";
        
        html += `
          <div style="padding:12px;margin-bottom:8px;background:${severityBg};border-radius:8px;border:1px solid ${severityColor}">
            <div style="font-weight:800;color:${severityColor};margin-bottom:4px">
              ${bottleneck.severity === "critical" ? "🚨" : "⚠️"} Операция №${bottleneck.no}: ${esc(bottleneck.operation)}
            </div>
            <div style="font-size:12px;color:var(--muted);margin-bottom:6px">
              Оператор: ${esc(bottleneck.operator)} · Машина: ${esc(bottleneck.machine)}
            </div>
            <div style="display:flex;gap:12px;font-size:11px">
              <span>План: <b>${formatDuration(bottleneck.planned)}</b></span>
              <span>Факт: <b style="color:${severityColor}">${formatDuration(bottleneck.actual)}</b></span>
              <span>Превышение: <b style="color:${severityColor}">+${formatDuration(bottleneck.overtime)} (${bottleneck.overtimePercent}%)</b></span>
            </div>
          </div>
        `;
      }
      
      html += `</div>`;
    }
    
    // Временная линия
    if(data.timeline && data.timeline.length > 0){
      html += `
        <div style="margin-bottom:20px">
          <h4 style="margin-bottom:10px">⏱️ Временная линия операций</h4>
          <table class="resizable-table">
            <thead>
              <tr>
                <th style="width:50px">№</th>
                <th style="width:180px">Операция</th>
                <th style="width:120px">Оператор</th>
                <th style="width:120px">Машина</th>
                <th style="width:100px">Статус</th>
                <th style="width:100px">Время наладки</th>
                <th style="width:120px">Время производства</th>
                <th style="width:80px">План</th>
              </tr>
            </thead>
            <tbody>
      `;
      
      for(const op of data.timeline){
        const statusColor = op.status === "Выполнено" ? "var(--ok)" : op.status === "В работе" ? "var(--warn)" : "var(--muted)";
        html += `
          <tr>
            <td>${op.no}</td>
            <td>${esc(op.name)}</td>
            <td>${esc(op.operator)}</td>
            <td>${esc(op.machine)}</td>
            <td><span style="color:${statusColor};font-weight:700">${esc(op.status)}</span></td>
            <td>${op.setupTime > 0 ? formatDuration(op.setupTime) : "—"}</td>
            <td>${op.duration > 0 ? formatDuration(op.duration) : "—"}</td>
            <td>${op.plannedDuration > 0 ? formatDuration(op.plannedDuration) : "—"}</td>
          </tr>
        `;
      }
      
      html += `
            </tbody>
          </table>
        </div>
      `;
    }
    
    container.innerHTML = html;
  }
}

// Загрузка статистики
async function loadStats(){
  try{
    const params = new URLSearchParams();
    
    const startDate = $("stats_start").value;
    const endDate = $("stats_end").value;
    const operator = $("stats_operator").value;
    const machine = $("stats_machine").value;
    const orderId = $("stats_order").value;
    const sortBy = $("stats_sort").value;
    
    if(startDate) params.append("startDate", startDate);
    if(endDate) params.append("endDate", endDate);
    if(operator) params.append("operator", operator);
    if(machine) params.append("machine", machine);
    if(orderId) params.append("orderId", orderId);
    if(sortBy) params.append("sortBy", sortBy);
    
    const result = await api("/api/stats?" + params.toString());
    renderStats(result);
    toast("Статистика загружена");
  }catch(e){
    console.error("Ошибка загрузки статистики:", e);
    alert("Ошибка загрузки статистики: " + e.message);
  }
}

// Сохраняем последние загруженные данные статистики для экспорта
let lastStatsData = null;

// Графики
let charts = {
  operators: null,
  machines: null,
  duration: null,
  timeline: null
};

// Состояние сканера QR
let qrScannerState = {
  modal: null,
  video: null,
  canvas: null,
  ctx: null,
  stream: null,
  raf: null,
  result: null,
  hint: null
};

// Цветовая палитра
const chartColors = [
  'rgba(0, 207, 181, 0.8)',
  'rgba(3, 0, 86, 0.8)',
  'rgba(46, 204, 113, 0.8)',
  'rgba(255, 176, 32, 0.8)',
  'rgba(255, 77, 77, 0.8)',
  'rgba(155, 89, 182, 0.8)',
  'rgba(52, 152, 219, 0.8)',
  'rgba(241, 196, 15, 0.8)',
  'rgba(230, 126, 34, 0.8)',
  'rgba(149, 165, 166, 0.8)'
];

function renderStats(data){
  lastStatsData = data; // Сохраняем для экспорта
  const { operations, summary } = data;
  
  // Сводка
  $("stats_total").textContent = summary.totalOps;
  $("stats_total_time").textContent = formatDuration(summary.totalDuration);
  $("stats_total_setup").textContent = formatDuration(summary.totalSetupTime || 0);
  $("stats_avg_time").textContent = formatDuration(summary.avgDuration);
  $("stats_avg_setup").textContent = formatDuration(summary.avgSetupTime || 0);
  $("stats_min_time").textContent = formatDuration(summary.minDuration);
  $("stats_max_time").textContent = formatDuration(summary.maxDuration);
  
  // По операторам
  const opTb = $("stats_by_operator");
  opTb.innerHTML = "";
  const operators = Object.entries(summary.byOperator).sort((a,b) => b[1].totalDuration - a[1].totalDuration);
  for(const [operator, data] of operators){
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td><b>${esc(operator)}</b></td>
      <td>${data.count}</td>
      <td>${formatDuration(data.totalDuration)}</td>
      <td>${formatDuration(data.totalSetupTime || 0)}</td>
      <td>${formatDuration(data.avgDuration)}</td>
    `;
    opTb.appendChild(tr);
  }
  if(operators.length === 0){
    opTb.innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--muted)">Нет данных</td></tr>';
  }
  
  // По машинам
  const mTb = $("stats_by_machine");
  mTb.innerHTML = "";
  const machines = Object.entries(summary.byMachine).sort((a,b) => b[1].totalDuration - a[1].totalDuration);
  for(const [machine, data] of machines){
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td><b>${esc(machine)}</b></td>
      <td>${data.count}</td>
      <td>${formatDuration(data.totalDuration)}</td>
      <td>${formatDuration(data.totalSetupTime || 0)}</td>
      <td>${formatDuration(data.avgDuration)}</td>
    `;
    mTb.appendChild(tr);
  }
  if(machines.length === 0){
    mTb.innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--muted)">Нет данных</td></tr>';
  }
  
  // По заказам
  const orderTb = $("stats_by_order");
  orderTb.innerHTML = "";
  const orders = Object.entries(summary.byOrder).sort((a,b) => b[1].totalDuration - a[1].totalDuration);
  for(const [orderId, data] of orders){
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td class="mono"><b>${esc(orderId)}</b></td>
      <td>${data.count}</td>
      <td>${formatDuration(data.totalDuration)}</td>
      <td>${formatDuration(data.totalSetupTime || 0)}</td>
      <td>${formatDuration(data.avgDuration)}</td>
    `;
    orderTb.appendChild(tr);
  }
  if(orders.length === 0){
    orderTb.innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--muted)">Нет данных</td></tr>';
  }
  
  // Сравнение производительности операторов
  const compTb = $("stats_comparison");
  compTb.innerHTML = "";
  
  if(operators.length > 0){
    // Расчет метрик для каждого оператора
    const operatorMetrics = [];
    
    for(const [operator, data] of operators){
      // Операции этого оператора
      const operatorOps = operations.filter(op => op.operator === operator);
      
      // Скорость (операций в час)
      const speed = data.totalDuration > 0 ? (data.count / (data.totalDuration / 3600)).toFixed(2) : 0;
      
      // Качество (процент операций без брака)
      const opsWithoutScrap = operatorOps.filter(op => (!op.scrap || op.scrap === 0)).length;
      const quality = data.count > 0 ? ((opsWithoutScrap / data.count) * 100).toFixed(1) : 0;
      
      // Эффективность (скорость выполнения относительно плана)
      let efficiency = 100;
      let plannedCount = 0;
      let totalEfficiency = 0;
      
      for(const op of operatorOps){
        if(op.planned_duration > 0 && op.total_duration > 0){
          plannedCount++;
          // Если выполнено быстрее плана - эффективность > 100%, медленнее - < 100%
          const opEfficiency = (op.planned_duration / op.total_duration) * 100;
          totalEfficiency += opEfficiency;
        }
      }
      
      if(plannedCount > 0){
        efficiency = (totalEfficiency / plannedCount).toFixed(1);
      }
      
      operatorMetrics.push({
        operator,
        count: data.count,
        totalDuration: data.totalDuration,
        avgDuration: data.avgDuration,
        speed: parseFloat(speed),
        quality: parseFloat(quality),
        efficiency: parseFloat(efficiency),
        // Общий балл (средневзвешенная оценка)
        score: (parseFloat(speed) * 0.3 + parseFloat(quality) * 0.3 + parseFloat(efficiency) * 0.4)
      });
    }
    
    // Сортируем по общему баллу
    operatorMetrics.sort((a, b) => b.score - a.score);
    
    // Отображаем
    for(let i = 0; i < operatorMetrics.length; i++){
      const m = operatorMetrics[i];
      const place = i + 1;
      
      // Медали для топ-3
      let medal = '';
      if(place === 1) medal = '🥇';
      else if(place === 2) medal = '🥈';
      else if(place === 3) medal = '🥉';
      
      // Цвет эффективности
      let effColor = 'var(--text)';
      let effBg = 'transparent';
      if(m.efficiency >= 100){
        effColor = 'var(--ok)';
        effBg = 'rgba(46,204,113,.08)';
      } else if(m.efficiency < 80){
        effColor = 'var(--bad)';
        effBg = 'rgba(255,77,77,.08)';
      } else {
        effColor = 'var(--warn)';
        effBg = 'rgba(255,176,32,.08)';
      }
      
      const tr = document.createElement("tr");
      if(place <= 3) tr.style.background = 'rgba(0,207,181,.04)';
      
      tr.innerHTML = `
        <td style="font-weight:900;font-size:16px">${medal} ${place}</td>
        <td><b>${esc(m.operator)}</b></td>
        <td>${m.count}</td>
        <td>${formatDuration(m.totalDuration)}</td>
        <td>${formatDuration(m.avgDuration)}</td>
        <td><b>${m.speed}</b> оп/ч</td>
        <td><span class="pill ok">${m.quality}%</span></td>
        <td style="background:${effBg};color:${effColor};font-weight:800">${m.efficiency}%</td>
      `;
      compTb.appendChild(tr);
    }
  }
  
  if(operators.length === 0){
    compTb.innerHTML = '<tr><td colspan="8" style="text-align:center;color:var(--muted)">Нет данных для сравнения</td></tr>';
  }
  
  // Детальная таблица
  const detailTb = $("stats_details");
  detailTb.innerHTML = "";
  for(const op of operations){
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td class="mono">${esc(op.order_id)}</td>
      <td class="mono">${op.no||""}</td>
      <td>${esc(op.name||"")}</td>
      <td>${esc(op.operator||"")}</td>
      <td>${esc(op.machine||"")}</td>
      <td style="font-size:11px">${formatDateTime(op.started_at)}</td>
      <td style="font-size:11px">${formatDateTime(op.completed_at)}</td>
      <td><b>${formatDuration(op.total_duration)}</b></td>
      <td>${op.plan||0}</td>
      <td>${op.fact||0}</td>
      <td>${op.scrap||0}</td>
    `;
    detailTb.appendChild(tr);
  }
  if(operations.length === 0){
    detailTb.innerHTML = '<tr><td colspan="11" style="text-align:center;padding:20px;color:var(--muted)">Нет выполненных операций в выбранном диапазоне</td></tr>';
  }
  
  // Отрисовка графиков
  renderCharts(data);
}

function renderCharts(data){
  const { operations, summary } = data;
  
  // Уничтожаем старые графики
  Object.values(charts).forEach(chart => {
    if(chart) chart.destroy();
  });
  
  // График 1: Время по операторам (горизонтальная столбчатая диаграмма)
  const operatorsData = Object.entries(summary.byOperator)
    .sort((a,b) => b[1].totalDuration - a[1].totalDuration)
    .slice(0, 10); // Топ-10
  
  if(operatorsData.length > 0){
    const ctx1 = document.getElementById('chartOperators').getContext('2d');
    charts.operators = new Chart(ctx1, {
      type: 'bar',
      data: {
        labels: operatorsData.map(([name]) => name),
        datasets: [{
          label: 'Время (часы)',
          data: operatorsData.map(([, data]) => (data.totalDuration / 3600).toFixed(2)),
          backgroundColor: chartColors[0],
          borderColor: chartColors[0].replace('0.8', '1'),
          borderWidth: 1
        }]
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: function(context) {
                const seconds = operatorsData[context.dataIndex][1].totalDuration;
                return 'Время: ' + formatDuration(seconds) + ' (' + operatorsData[context.dataIndex][1].count + ' оп.)';
              }
            }
          }
        },
        scales: {
          x: {
            beginAtZero: true,
            title: { display: true, text: 'Часы' }
          }
        }
      }
    });
  }
  
  // График 2: Время по машинам (круговая диаграмма)
  const machinesData = Object.entries(summary.byMachine)
    .sort((a,b) => b[1].totalDuration - a[1].totalDuration)
    .slice(0, 10); // Топ-10
  
  if(machinesData.length > 0){
    const ctx2 = document.getElementById('chartMachines').getContext('2d');
    charts.machines = new Chart(ctx2, {
      type: 'doughnut',
      data: {
        labels: machinesData.map(([name]) => name),
        datasets: [{
          data: machinesData.map(([, data]) => data.totalDuration),
          backgroundColor: chartColors.slice(0, machinesData.length),
          borderWidth: 2,
          borderColor: '#fff'
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: 'right',
            labels: { boxWidth: 15, padding: 10, font: { size: 11 } }
          },
          tooltip: {
            callbacks: {
              label: function(context) {
                const data = machinesData[context.dataIndex][1];
                return machinesData[context.dataIndex][0] + ': ' + formatDuration(data.totalDuration) + ' (' + data.count + ' оп.)';
              }
            }
          }
        }
      }
    });
  }
  
  // График 3: Распределение длительности операций (гистограмма)
  if(operations.length > 0){
    // Группируем по диапазонам времени
    const ranges = {
      '0-15 мин': 0,
      '15-30 мин': 0,
      '30-60 мин': 0,
      '1-2 часа': 0,
      '2-4 часа': 0,
      '4+ часов': 0
    };
    
    for(const op of operations){
      const mins = (op.total_duration || 0) / 60;
      if(mins < 15) ranges['0-15 мин']++;
      else if(mins < 30) ranges['15-30 мин']++;
      else if(mins < 60) ranges['30-60 мин']++;
      else if(mins < 120) ranges['1-2 часа']++;
      else if(mins < 240) ranges['2-4 часа']++;
      else ranges['4+ часов']++;
    }
    
    const ctx3 = document.getElementById('chartDuration').getContext('2d');
    charts.duration = new Chart(ctx3, {
      type: 'bar',
      data: {
        labels: Object.keys(ranges),
        datasets: [{
          label: 'Количество операций',
          data: Object.values(ranges),
          backgroundColor: chartColors[2],
          borderColor: chartColors[2].replace('0.8', '1'),
          borderWidth: 1
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: function(context) {
                const total = operations.length;
                const percent = ((context.parsed.y / total) * 100).toFixed(1);
                return context.parsed.y + ' операций (' + percent + '%)';
              }
            }
          }
        },
        scales: {
          y: {
            beginAtZero: true,
            ticks: { stepSize: 1 }
          }
        }
      }
    });
  }
  
  // График 4: Динамика по дням (линейный график)
  if(operations.length > 0){
    // Группируем по дням
    const byDate = {};
    for(const op of operations){
      if(op.completed_at){
        const date = op.completed_at.split('T')[0];
        if(!byDate[date]) byDate[date] = { count: 0, totalDuration: 0 };
        byDate[date].count++;
        byDate[date].totalDuration += op.total_duration || 0;
      }
    }
    
    const sortedDates = Object.keys(byDate).sort();
    
    const ctx4 = document.getElementById('chartTimeline').getContext('2d');
    charts.timeline = new Chart(ctx4, {
      type: 'line',
      data: {
        labels: sortedDates.map(d => formatDate(d)),
        datasets: [
          {
            label: 'Количество операций',
            data: sortedDates.map(d => byDate[d].count),
            borderColor: chartColors[0],
            backgroundColor: chartColors[0].replace('0.8', '0.2'),
            tension: 0.3,
            yAxisID: 'y'
          },
          {
            label: 'Среднее время (мин)',
            data: sortedDates.map(d => (byDate[d].totalDuration / byDate[d].count / 60).toFixed(1)),
            borderColor: chartColors[3],
            backgroundColor: chartColors[3].replace('0.8', '0.2'),
            tension: 0.3,
            yAxisID: 'y1'
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: {
          mode: 'index',
          intersect: false
        },
        plugins: {
          legend: {
            position: 'top',
            labels: { boxWidth: 15, padding: 15, font: { size: 11 } }
          }
        },
        scales: {
          y: {
            type: 'linear',
            display: true,
            position: 'left',
            beginAtZero: true,
            title: { display: true, text: 'Количество операций' }
          },
          y1: {
            type: 'linear',
            display: true,
            position: 'right',
            beginAtZero: true,
            title: { display: true, text: 'Среднее время (мин)' },
            grid: { drawOnChartArea: false }
          }
        }
      }
    });
  }
}

function fillStatsFilters(){
  // Операторы для статистики
  const opSel = $("stats_operator");
  opSel.innerHTML = '<option value="">(Все)</option>';
  for(const op of state.operators){
    const opt = document.createElement("option");
    opt.value = op;
    opt.textContent = op;
    opSel.appendChild(opt);
  }
  
  // Операторы для прогноза
  const fopSel = $("forecast_operator");
  fopSel.innerHTML = '<option value="">(Любой)</option>';
  for(const op of state.operators){
    const opt = document.createElement("option");
    opt.value = op;
    opt.textContent = op;
    fopSel.appendChild(opt);
  }
  
  // Машины для статистики
  const mSel = $("stats_machine");
  mSel.innerHTML = '<option value="">(Все)</option>';
  for(const m of state.machines){
    const opt = document.createElement("option");
    opt.value = m;
    opt.textContent = m;
    mSel.appendChild(opt);
  }
  
  // Машины для прогноза
  const fmSel = $("forecast_machine");
  fmSel.innerHTML = '<option value="">(Любая)</option>';
  for(const m of state.machines){
    const opt = document.createElement("option");
    opt.value = m;
    opt.textContent = m;
    fmSel.appendChild(opt);
  }
  
  // Заказы для статистики
  const oSel = $("stats_order");
  oSel.innerHTML = '<option value="">(Все)</option>';
  const orders = state.orders.slice().sort((a,b) => a.id.localeCompare(b.id));
  for(const o of orders){
    const opt = document.createElement("option");
    opt.value = o.id;
    opt.textContent = o.id;
    oSel.appendChild(opt);
  }
  
  // Операторы для аналитики
  const aOpSel = $("analytics_operator");
  if(aOpSel){
    aOpSel.innerHTML = '<option value="">(Выберите оператора)</option>';
    for(const op of state.operators){
      const opt = document.createElement("option");
      opt.value = op;
      opt.textContent = op;
      aOpSel.appendChild(opt);
    }
  }
  
  // Заказы для аналитики
  const aOrdSel = $("analytics_order");
  if(aOrdSel){
    aOrdSel.innerHTML = '<option value="">(Выберите заказ)</option>';
    for(const o of orders){
      const opt = document.createElement("option");
      opt.value = o.id;
      opt.textContent = o.id;
      aOrdSel.appendChild(opt);
    }
  }
  
  // Заказы для прогнозирования
  const foSel = $("forecast_order");
  foSel.innerHTML = '<option value="">-- Выберите заказ --</option>';
  for(const o of orders){
    const opt = document.createElement("option");
    opt.value = o.id;
    opt.textContent = `${o.id} — ${o.client || 'без клиента'} — ${o.product || 'без продукта'}`;
    foSel.appendChild(opt);
  }
}

// Прогнозирование времени
async function getForecast(){
  try{
    const params = new URLSearchParams();
    
    const operator = $("forecast_operator").value;
    const machine = $("forecast_machine").value;
    const operationName = $("forecast_operation").value.trim();
    
    if(operator) params.append("operator", operator);
    if(machine) params.append("machine", machine);
    if(operationName) params.append("operationName", operationName);
    
    const result = await api("/api/forecast?" + params.toString());
    
    if(!result.hasForecast){
      $("forecastResult").style.display = "none";
      alert(result.message || "Недостаточно данных для прогноза");
      return;
    }
    
    // Отображаем прогноз
    $("forecast_opt").textContent = formatDuration(result.optimistic);
    $("forecast_main").textContent = formatDuration(result.forecast);
    $("forecast_pes").textContent = formatDuration(result.pessimistic);
    $("forecast_samples").textContent = result.sampleSize;
    
    const confidenceLabels = {
      'high': 'Высокая ✓',
      'medium': 'Средняя',
      'low': 'Низкая'
    };
    $("forecast_confidence").textContent = confidenceLabels[result.confidence] || result.confidence;
    
    // По операторам
    if(Object.keys(result.byOperator).length > 0){
      const opContainer = $("forecast_operators");
      opContainer.innerHTML = "";
      
      const sortedOps = Object.entries(result.byOperator).sort((a,b) => a[1] - b[1]);
      for(const [op, duration] of sortedOps){
        const chip = document.createElement("span");
        chip.className = "chip";
        chip.innerHTML = `<b>${esc(op)}:</b> ${formatDuration(duration)}`;
        opContainer.appendChild(chip);
      }
      
      $("forecastByOperator").style.display = "block";
    } else {
      $("forecastByOperator").style.display = "none";
    }
    
    // По машинам
    if(Object.keys(result.byMachine).length > 0){
      const mContainer = $("forecast_machines");
      mContainer.innerHTML = "";
      
      const sortedMachines = Object.entries(result.byMachine).sort((a,b) => a[1] - b[1]);
      for(const [m, duration] of sortedMachines){
        const chip = document.createElement("span");
        chip.className = "chip";
        chip.innerHTML = `<b>${esc(m)}:</b> ${formatDuration(duration)}`;
        mContainer.appendChild(chip);
      }
      
      $("forecastByMachine").style.display = "block";
    } else {
      $("forecastByMachine").style.display = "none";
    }
    
    $("forecastResult").style.display = "block";
    toast("Прогноз получен");
  }catch(e){
    console.error("Ошибка получения прогноза:", e);
    alert("Ошибка получения прогноза: " + e.message);
  }
}

// Прогнозирование времени для конкретного заказа
async function getOrderForecast(){
  try{
    const orderId = $("forecast_order").value;
    
    if(!orderId){
      alert("Выберите заказ для прогнозирования");
      return;
    }
    
    const result = await api("/api/forecast-order?orderId=" + encodeURIComponent(orderId));
    
    if(!result.hasForecast){
      $("orderForecastResult").style.display = "none";
      alert(result.message || "Недостаточно данных для прогноза");
      return;
    }
    
    // Отображаем информацию о заказе
    $("order_forecast_title").textContent = `Заказ ${result.orderId}`;
    $("order_forecast_client").textContent = result.orderInfo.client || "—";
    $("order_forecast_product").textContent = result.orderInfo.product || "—";
    $("order_forecast_qty").textContent = result.orderInfo.qty || "—";
    $("order_forecast_status").textContent = result.orderInfo.status || "—";
    
    // Отображаем сводку времени
    $("order_forecast_setup").textContent = formatDuration(result.summary.totalSetupTime);
    $("order_forecast_production").textContent = formatDuration(result.summary.totalProductionTime);
    $("order_forecast_total").textContent = formatDuration(result.summary.totalTime);
    
    // Отображаем прогресс
    $("order_forecast_completed").textContent = `${result.summary.completedOperations} / ${result.summary.totalOperations} (${result.summary.completionPercent}%)`;
    $("order_forecast_remaining").textContent = formatDuration(result.summary.remainingTime);
    
    // Отображаем дату завершения
    if(result.summary.estimatedCompletion){
      const eta = new Date(result.summary.estimatedCompletion);
      $("order_forecast_eta").textContent = eta.toLocaleString('ru-RU', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } else {
      $("order_forecast_eta").textContent = "Завершено";
    }
    
    // Отображаем операции
    const opsTable = $("order_forecast_operations");
    opsTable.innerHTML = "";
    
    for(const op of result.operations){
      const tr = document.createElement("tr");
      
      // Определяем цвет статуса
      let statusColor = '';
      let statusIcon = '';
      if(op.status === 'Выполнено'){
        statusColor = 'background:rgba(46,204,113,.2);color:#27ae60';
        statusIcon = '✅';
      } else if(op.status === 'В работе'){
        statusColor = 'background:rgba(0,207,181,.2);color:#00cfb5';
        statusIcon = '⏱️';
      } else {
        statusColor = 'background:rgba(149,165,166,.2);color:#7f8c8d';
        statusIcon = '📋';
      }
      
      tr.innerHTML = `
        <td style="text-align:center"><b>${op.no}</b></td>
        <td><b>${esc(op.name || '—')}</b></td>
        <td>${esc(op.machine || '—')}</td>
        <td>${esc(op.operator || '—')}</td>
        <td>
          <span style="padding:4px 8px;border-radius:4px;font-size:11px;font-weight:700;${statusColor}">
            ${statusIcon} ${esc(op.status)}
          </span>
        </td>
        <td style="text-align:right">${formatDuration(op.setupTime)}</td>
        <td style="text-align:right">${formatDuration(op.productionTime)}</td>
        <td style="text-align:right;font-weight:700">${formatDuration(op.totalTime)}</td>
      `;
      opsTable.appendChild(tr);
    }
    
    $("orderForecastResult").style.display = "block";
    toast("Прогноз по заказу получен");
  }catch(e){
    console.error("Ошибка получения прогноза по заказу:", e);
    console.error("Детали ошибки:", e.stack);
    alert("Ошибка получения прогноза по заказу: " + e.message);
  }
}

// Функция проверки и исправления запланированного времени
async function fixMissingPlannedTimes(){
  let fixedCount = 0;
  const updates = [];
  
  for(const op of state.ops){
    const needsFix = (!op.planned_duration || op.planned_duration === 0) || (!op.planned_setup_time || op.planned_setup_time === 0);
    
    if(needsFix && op.name && op.machine){
      // Ищем похожую операцию в шаблонах
      const matchingTemplate = state.templates.find(t => 
        t.operation_name && op.name && 
        (t.operation_name.toLowerCase().trim() === op.name.toLowerCase().trim() || 
         t.operation_name.toLowerCase().includes(op.name.toLowerCase()) ||
         op.name.toLowerCase().includes(t.operation_name.toLowerCase())) &&
        t.machine && op.machine &&
        (t.machine === op.machine || t.machine.toLowerCase() === op.machine.toLowerCase())
      );
      
      if(matchingTemplate){
        const update = {};
        let hasUpdate = false;
        
        // Вычисляем planned_duration из шаблона: time_per_unit * plan (тираж)
        if((!op.planned_duration || op.planned_duration === 0) && matchingTemplate.planned_duration > 0 && op.plan > 0){
          // planned_duration в шаблонах - это время на единицу в секундах
          update.planned_duration = matchingTemplate.planned_duration * op.plan;
          hasUpdate = true;
        }
        
        // Устанавливаем planned_setup_time из шаблона
        if((!op.planned_setup_time || op.planned_setup_time === 0) && matchingTemplate.setup_time > 0){
          // setup_time в шаблонах хранится в секундах
          update.planned_setup_time = matchingTemplate.setup_time;
          hasUpdate = true;
        }
        
        // Проверяем, что объект update действительно содержит поля перед добавлением
        if(hasUpdate && Object.keys(update).length > 0){
          updates.push({ opId: op.id, update });
          fixedCount++;
        } else if(needsFix && matchingTemplate){
          // Логируем, если шаблон найден, но обновление не создано
          console.warn(`Шаблон найден для операции ${op.id}, но обновление не создано:`, {
            op: { planned_duration: op.planned_duration, planned_setup_time: op.planned_setup_time, plan: op.plan },
            template: { planned_duration: matchingTemplate.planned_duration, setup_time: matchingTemplate.setup_time }
          });
        }
      }
    } else if(needsFix){
      // Нет шаблона или не заданы name/machine — ставим нули, чтобы не было пустых значений
      const update = {};
      let hasUpdate = false;
      if(!op.planned_duration || op.planned_duration === 0){
        update.planned_duration = 0;
        hasUpdate = true;
      }
      if(!op.planned_setup_time || op.planned_setup_time === 0){
        update.planned_setup_time = 0;
        hasUpdate = true;
      }
      if(hasUpdate){
        updates.push({ id: op.id, ...update });
      }
    }
  }
  
  // Применяем все обновления
  if(updates.length > 0){
    try{
      for(const { opId, update } of updates){
        // Проверяем, что объект update не пустой
        if(Object.keys(update).length === 0){
          console.warn(`Пропущено пустое обновление для операции ${opId}`);
          continue;
        }
        const opObj = state.ops.find(o => o.id === opId) || { id: opId, version: 0 };
        await updateOp(opObj, update);
      }
      
      // Перезагружаем данные после обновлений
      const [settings, orders, ops, templates] = await Promise.all([
        api("/api/settings"),
        api("/api/orders"),
        api("/api/ops"),
        api("/api/templates")
      ]);
      state.operators = settings.operators;
      state.machines = settings.machines;
      state.orders = orders;
      state.ops = ops;
      state.templates = templates;
      
      if(fixedCount > 0){
        console.log(`Исправлено запланированное время для ${fixedCount} операций`);
      }
    }catch(e){
      console.error("Ошибка при исправлении запланированного времени:", e);
    }
  }
  
  return fixedCount;
}

// Refresh
async function refreshAll(showToast=true){
  try{
    // Используем window.api если доступна, иначе api из глобальной области
    const apiFn = window.api || api;
    if(!apiFn){
      console.error("[refreshAll] Функция api() не найдена!");
      throw new Error("API function not available");
    }
    
    const materialsP = (currentUser ? apiFn("/api/materials").catch(()=>[]) : Promise.resolve([]));
    const materialTypesP = (currentUser ? apiFn("/api/materials/types").catch((e)=>{
      console.error("[refreshAll] Ошибка загрузки типов материалов:", e);
      return [];
    }) : Promise.resolve([]));
    const unitsP = (currentUser ? apiFn("/api/units").catch(()=>({units:[]})) : Promise.resolve({units:[]}));
    const productTemplatesP = (currentUser && currentUser.role === 'admin') ? apiFn("/api/product-templates").catch(()=>[]) : Promise.resolve([]);
    const clientProfilesP = (currentUser && currentUser.role === 'admin') ? apiFn("/api/client-profiles").catch(()=>[]) : Promise.resolve([]);
    const [settings, orders, ops, templates, materials, materialTypes, unitsRes] = await Promise.all([
      apiFn("/api/settings"),
      apiFn("/api/orders"),
      apiFn("/api/ops"),
      apiFn("/api/templates"),
      materialsP,
      materialTypesP,
      unitsP
    ]);
    state.operators = settings.operators;
    state.machines = settings.machines;
    state.materials = Array.isArray(materials) ? materials : [];
    state.materialTypes = Array.isArray(materialTypes) ? materialTypes : [];
    state.units = Array.isArray(unitsRes?.units) ? unitsRes.units : [];
    state.orders = orders;
    state.ops = ops;
    state.templates = templates;
    if(!state.activeOrderId && state.orders[0]) state.activeOrderId = state.orders[0].id;
    
    // Отладочная информация
    console.log("[refreshAll] Загружено типов материалов:", state.materialTypes.length);
    console.log("[refreshAll] materialTypes данные:", materialTypes);
    console.log("[refreshAll] state.materialTypes после присвоения:", state.materialTypes);

    // Админ-настройки: шаблоны изделий и профили клиентов
    try{
      const [pts, cps] = await Promise.all([productTemplatesP, clientProfilesP]);
      state.productTemplates = Array.isArray(pts) ? pts : [];
      state.clientProfiles = Array.isArray(cps) ? cps : [];
    }catch(_e){}

    // Изделия по заказам (для чипов/фильтра)
    try{
      if(currentUser){
        const ids = state.orders.map(o=>o.id).filter(Boolean);
        const results = await Promise.allSettled(
          ids.map(id => api("/api/orders/"+encodeURIComponent(id)+"/items").then(items=>({ id, items })))
        );
        for(const r of results){
          if(r.status === "fulfilled"){
            state.orderItemsByOrder[r.value.id] = Array.isArray(r.value.items) ? r.value.items : [];
          }
        }
      }
    }catch(_e){}
    
    // Загружаем настройки таймера бездействия
    if(settings.appSettings){
      // Настройки для администратора
      if(currentUser && currentUser.role === 'admin'){
        adminIdleTimeout = parseInt(settings.appSettings.admin_idle_timeout || '0', 10);
        if($("adminIdleTimeout")){
          $("adminIdleTimeout").value = adminIdleTimeout;
        }
        operatorIdleTimeout = parseInt(settings.appSettings.operator_idle_timeout || '10', 10);
        if($("operatorIdleTimeout")){
          $("operatorIdleTimeout").value = operatorIdleTimeout;
        }
      } else {
        // Для операторов тоже загружаем настройку (но не показываем поле)
        operatorIdleTimeout = parseInt(settings.appSettings.operator_idle_timeout || '10', 10);
      }
      // Перезапускаем таймер с новыми настройками
      if(idleTimer) resetIdleTimer();
    }
    
    // Проверяем и исправляем отсутствующее запланированное время
    const fixedCount = await fixMissingPlannedTimes();
    
    // Сбрасываем кеш таймеров при обновлении данных
    timerCache.timers = null;
    timerCache.setupTimers = null;
    timerCache.lastUpdate = 0;
    
    if(showToast){
      if(fixedCount > 0){
        toast(`Обновлено. Исправлено запланированное время для ${fixedCount} операций`);
      } else {
        toast("Обновлено");
      }
    }
    renderAll();
    // Переинициализируем ширины столбцов после рендера
    setTimeout(()=> initColumnWidthsAfterAuth(), 200);
  }catch(e){
    console.error("Ошибка обновления данных:", e);
    alert("Ошибка загрузки данных: "+e.message);
  }
}


  // Expose functions globally
  window.renderAnalytics = renderAnalytics;
  window.loadStats = loadStats;
  window.renderStats = renderStats;
  window.renderCharts = renderCharts;
  
  // Module export
  window.StatsModule = {
    loaded: true,
    renderAnalytics,
    loadStats,
    renderStats,
    renderCharts
  };
  
  console.log('Stats module loaded successfully');
  
})();
