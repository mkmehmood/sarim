async function showTab(tab) {
currentActiveTab = tab;
requestAnimationFrame(() => {
const tabs = ['tab-prod', 'tab-sales', 'tab-calc', 'tab-factory', 'tab-payments', 'tab-rep'];
tabs.forEach(id => {
const el = document.getElementById(id);
if (el) el.classList.add('hidden');
});
const selectedTab = document.getElementById('tab-' + tab);
if (selectedTab) {
selectedTab.classList.remove('hidden');
void selectedTab.offsetHeight;
}
const tabButtons = document.querySelectorAll('.tab-btn');
const tabIndexMap = { 'prod': 0, 'sales': 1, 'calc': 2, 'factory': 3, 'payments': 4, 'rep': 5 };
const activeIndex = tabIndexMap[tab];
tabButtons.forEach((btn, i) => {
btn.classList.toggle('active', i === activeIndex);
});
});
window.scrollTo({ top: 0, behavior: 'instant' });
const paymentSummarySection = document.getElementById('payment-summary-section');
const paymentHistorySection = document.getElementById('payment-history-section');
if (paymentSummarySection) {
paymentSummarySection.style.display = tab === 'payments' ? '' : 'none';
paymentSummarySection.style.visibility = tab === 'payments' ? 'visible' : 'hidden';
}
if (paymentHistorySection) {
paymentHistorySection.style.display = tab === 'payments' ? '' : 'none';
paymentHistorySection.style.visibility = tab === 'payments' ? 'visible' : 'hidden';
}
setTimeout(async () => {
await loadChartJs();
const tabLoaders = {
'sales': async () => {
await syncSalesTab();
},
'calc': async () => {
await syncCalculatorTab();
},
'prod': async () => {
await syncProductionTab();
await refreshUI();
},
'factory': async () => {
await syncFactoryTab();
initFactoryTab();
},
'payments': async () => {
await syncPaymentsTab();
await refreshPaymentTab();
},
'rep': async () => {
await syncRepTab();
handleRepTabUI();
}
};
if (tabLoaders[tab]) {
await tabLoaders[tab]();
}
notifyDataChange(tab);
}, 50);
}
function handleRepTabUI() {
const repHeader = document.getElementById('rep-header');
const adminControls = document.getElementById('admin-rep-controls');
const adminAnalytics = document.getElementById('admin-rep-analytics');
const newTransCard = document.getElementById('rep-new-transaction-card');
if (appMode === 'admin') {
if (adminControls) {
adminControls.classList.remove('hidden');
adminControls.style.display = 'block';
}
if (adminAnalytics) {
adminAnalytics.classList.remove('hidden');
adminAnalytics.style.display = 'block';
}
const manageRepsBtnAdmin = document.getElementById('btn-manage-reps');
if (manageRepsBtnAdmin) manageRepsBtnAdmin.style.display = '';
const mainDate = document.getElementById('rep-date');
const adminDate = document.getElementById('admin-rep-date');
if (mainDate && adminDate) {
adminDate.value = mainDate.value;
}
if (repHeader) repHeader.style.display = 'none';
if (newTransCard) newTransCard.style.display = 'none';
if (typeof calculateRepAnalytics === 'function') {
calculateRepAnalytics();
}
requestAnimationFrame(() => {
setTimeout(() => {
if (typeof updateRepLiveMap === 'function') {
const mapContainer = document.getElementById('rep-map-container');
if (mapContainer && repMap) {
repMap.invalidateSize();
}
updateRepLiveMap();
}
}, 100);
});
} else {
if (adminControls) adminControls.style.display = 'none';
if (adminAnalytics) adminAnalytics.style.display = 'none';
const manageRepsBtnRep = document.getElementById('btn-manage-reps');
if (manageRepsBtnRep) manageRepsBtnRep.style.display = 'none';
if (repHeader) repHeader.style.display = 'flex';
if (newTransCard) newTransCard.style.display = 'block';
if (typeof renderRepCustomerTable === 'function') {
renderRepCustomerTable();
}
}
}
(function() {
const scrollableElements = new WeakSet();
window.smoothScrollTo = function(target, options = {}) {
const {
duration = 300,
easing = 'easeOutCubic',
offset = 0
} = options;
const element = typeof target === 'string' ? document.querySelector(target) : target;
if (!element) return;
const startY = window.pageYOffset;
const targetY = element.getBoundingClientRect().top + startY + offset;
const diff = targetY - startY;
const startTime = performance.now();
const easings = {
easeOutCubic: t => 1 - Math.pow(1 - t, 3),
easeInOutCubic: t => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2,
easeOutQuart: t => 1 - Math.pow(1 - t, 4)
};
const easeFn = easings[easing] || easings.easeOutCubic;
function step(currentTime) {
const elapsed = currentTime - startTime;
const progress = Math.min(elapsed / duration, 1);
const easedProgress = easeFn(progress);
window.scrollTo(0, startY + diff * easedProgress);
if (progress < 1) {
requestAnimationFrame(step);
}
}
requestAnimationFrame(step);
};
window.fastScrollToTop = function() {
window.scrollTo({ top: 0, behavior: 'instant' });
};
let scrollRafId = null;
let lastScrollY = 0;
window._rafScrollHandler = () => {
if (scrollRafId === null) {
scrollRafId = requestAnimationFrame(() => {
lastScrollY = window.pageYOffset;
scrollRafId = null;
});
}
};
window.addEventListener('scroll', window._rafScrollHandler, { passive: true });
window.getScrollY = function() {
return lastScrollY;
};
})();
function enableGPUAcceleration(element) {
if (!element) return;
element.style.transform = 'translateZ(0)';
element.style.willChange = 'transform';
element.style.backfaceVisibility = 'hidden';
}
const DOMBatch = {
reads: [],
writes: [],
read(fn) {
this.reads.push(fn);
this.schedule();
},
write(fn) {
this.writes.push(fn);
this.schedule();
},
schedule() {
if (!this.scheduled) {
this.scheduled = true;
requestAnimationFrame(() => this.flush());
}
},
flush() {
let read;
while (read = this.reads.shift()) {
read();
}
let write;
while (write = this.writes.shift()) {
write();
}
this.scheduled = false;
}
};
const lazyLoadObserver = new IntersectionObserver((entries) => {
entries.forEach(entry => {
if (entry.isIntersecting) {
entry.target.classList.add('in-view');
entry.target.dispatchEvent(new CustomEvent('enterViewport'));
} else {
entry.target.classList.remove('in-view');
entry.target.dispatchEvent(new CustomEvent('exitViewport'));
}
});
}, {
root: null,
rootMargin: '50px',
threshold: 0.1
});
function observeLazyLoad(element) {
if (element) {
lazyLoadObserver.observe(element);
}
}
function animateElement(element, keyframes, options = {}) {
if (!element) return Promise.resolve();
const defaultOptions = {
duration: 300,
easing: 'cubic-bezier(0.4, 0, 0.2, 1)',
fill: 'forwards'
};
const animation = element.animate(keyframes, { ...defaultOptions, ...options });
return animation.finished;
}
function fadeIn(element, duration = 150) {
if (!element) return Promise.resolve();
element.style.opacity = '0';
element.style.display = '';
return animateElement(element, [
{ opacity: 0 },
{ opacity: 1 }
], { duration });
}
function fadeOut(element, duration = 100) {
if (!element) return Promise.resolve();
return animateElement(element, [
{ opacity: 1 },
{ opacity: 0 }
], { duration }).then(() => {
element.style.display = 'none';
});
}
function slideIn(element, direction = 'up', duration = 200) {
if (!element) return Promise.resolve();
const transforms = {
up: [{ transform: 'translateY(20px)', opacity: 0 }, { transform: 'translateY(0)', opacity: 1 }],
down: [{ transform: 'translateY(-20px)', opacity: 0 }, { transform: 'translateY(0)', opacity: 1 }],
left: [{ transform: 'translateX(20px)', opacity: 0 }, { transform: 'translateX(0)', opacity: 1 }],
right: [{ transform: 'translateX(-20px)', opacity: 0 }, { transform: 'translateX(0)', opacity: 1 }]
};
element.style.display = '';
return animateElement(element, transforms[direction] || transforms.up, { duration });
}
let frameCount = 0;
let lastTime = performance.now();
function measureFPS() {
frameCount++;
const currentTime = performance.now();
if (currentTime >= lastTime + 1000) {
const fps = Math.round((frameCount * 1000) / (currentTime - lastTime));
frameCount = 0;
lastTime = currentTime;
}
requestAnimationFrame(measureFPS);
}
function handleAdminRepDateChange(val) {
const mainInput = document.getElementById('rep-date');
if(mainInput) {
mainInput.value = val;
}
refreshRepUI();
if (typeof updateRepLiveMap === 'function') {
updateRepLiveMap();
}
if (typeof calculateRepAnalytics === 'function') {
calculateRepAnalytics();
}
}
function setMfgChartMode(mode) {
currentMfgMode = mode;
document.getElementById('mfg-week-btn').className = `toggle-opt ${mode === 'week' ? 'active' : ''}`;
document.getElementById('mfg-month-btn').className = `toggle-opt ${mode === 'month' ? 'active' : ''}`;
document.getElementById('mfg-year-btn').className = `toggle-opt ${mode === 'year' ? 'active' : ''}`;
document.getElementById('mfg-all-btn').className = `toggle-opt ${mode === 'all' ? 'active' : ''}`;
updateMfgCharts();
}
function updateMfgCharts() {
if (typeof Chart === 'undefined') {
return;
}
if(mfgBarChart) mfgBarChart.destroy();
if(mfgPieChart) mfgPieChart.destroy();
let filteredData = currentProductionView === 'combined' ? db : db.filter(item => item.store === currentStore);
let labels = [], dataQty = [];
let totalCost = 0, totalProfit = 0, totalValue = 0;
const selectedDate = document.getElementById('sys-date').value;
const selectedDateObj = new Date(selectedDate);
const selectedYear = selectedDateObj.getFullYear();
const selectedMonth = selectedDateObj.getMonth();
const selectedDay = selectedDateObj.getDate();
const colors = {
text: '#1e3a8a',
grid: 'rgba(37, 99, 235, 0.1)'
};
if (currentMfgMode === 'week') {
for(let i=6; i>=0; i--) {
const d = new Date(selectedDateObj);
d.setDate(selectedDay - i);
const dateStr = d.toISOString().split('T')[0];
labels.push(d.toLocaleDateString('en-US', {weekday:'short'}));
let dayQty = 0;
filteredData.forEach(item => {
if(item.date === dateStr) {
dayQty += (item.net || 0);
}
});
dataQty.push(dayQty);
}
} else if (currentMfgMode === 'month') {
const daysInMonth = new Date(selectedYear, selectedMonth + 1, 0).getDate();
labels = Array.from({length: daysInMonth}, (_, i) => i + 1);
dataQty = new Array(daysInMonth).fill(0);
filteredData.forEach(item => {
const d = new Date(item.date);
if(d.getMonth() === selectedMonth && d.getFullYear() === selectedYear) {
dataQty[d.getDate() - 1] += (item.net || 0);
}
});
} else if (currentMfgMode === 'year') {
const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
labels = months;
dataQty = new Array(12).fill(0);
filteredData.forEach(item => {
const d = new Date(item.date);
if(d.getFullYear() === selectedYear) {
dataQty[d.getMonth()] += (item.net || 0);
}
});
} else if (currentMfgMode === 'all') {
const monthData = {};
filteredData.forEach(item => {
const d = new Date(item.date);
const monthYear = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
const monthLabel = `${d.toLocaleDateString('en-US', {month:'short'})} ${d.getFullYear()}`;
if (!monthData[monthYear]) {
monthData[monthYear] = {
label: monthLabel,
qty: 0
};
}
monthData[monthYear].qty += (item.net || 0);
});
const sortedMonths = Object.keys(monthData).sort();
sortedMonths.forEach(monthKey => {
labels.push(monthData[monthKey].label);
dataQty.push(monthData[monthKey].qty);
});
if (labels.length > 12) {
labels = labels.slice(-12);
dataQty = dataQty.slice(-12);
}
}
filteredData.forEach(item => {
const d = new Date(item.date);
const dYear = d.getFullYear();
const dMonth = d.getMonth();
const dDay = d.getDate();
let include = false;
if(currentMfgMode === 'week') {
const weekStart = new Date(selectedDateObj);
weekStart.setDate(selectedDay - 6);
if(d >= weekStart && d <= selectedDateObj) include = true;
}
if(currentMfgMode === 'month' && dYear === selectedYear && dMonth === selectedMonth) include = true;
if(currentMfgMode === 'year' && dYear === selectedYear) include = true;
if(currentMfgMode === 'all') include = true;
if(include) {
totalCost += (item.totalCost || 0);
totalProfit += (item.profit || 0);
totalValue += (item.totalSale || 0);
}
});
const mfgBarCanvas = document.getElementById('mfgBarChart');
if (!mfgBarCanvas) {
return;
}
const mfgBarCtx = mfgBarCanvas.getContext('2d');
if (!mfgBarCtx) {
return;
}
mfgBarChart = new Chart(mfgBarCtx, {
type: 'bar',
data: {
labels: labels,
datasets: [{
label: 'Net Production (kg)',
data: dataQty,
backgroundColor: 'rgba(37, 99, 235, 0.6)',
borderColor: '#2563eb',
borderWidth: 1,
borderRadius: 4
}]
},
options: {
responsive: true,
maintainAspectRatio: false,
plugins: {
legend: { labels: { color: colors.text } },
title: {
display: true,
text: `Production Quantity (${currentMfgMode === 'all' ? 'All Times' : currentMfgMode.charAt(0).toUpperCase() + currentMfgMode.slice(1)})`,
color: colors.text,
font: { size: 13, weight: 'bold' }
}
},
scales: {
y: { grid: { color: colors.grid }, ticks: { color: colors.text }, beginAtZero: true },
x: { ticks: { color: colors.text, maxRotation: currentMfgMode === 'all' ? 45 : 0 } }
}
}
});
const pieData = [totalCost, totalProfit];
const pieLabels = ['Total Cost', 'Net Profit'];
const mfgPieCanvas = document.getElementById('mfgPieChart');
if (!mfgPieCanvas) {
return;
}
const mfgPieCtx = mfgPieCanvas.getContext('2d');
if (!mfgPieCtx) {
return;
}
mfgPieChart = new Chart(mfgPieCtx, {
type: 'pie',
data: {
labels: pieLabels,
datasets: [{
data: pieData,
backgroundColor: ['#dc2626', '#2563eb'],
borderWidth: 0
}]
},
options: {
responsive: true,
maintainAspectRatio: false,
plugins: {
legend: { position:'bottom', labels: { color: colors.text, font: { size: 10 } } },
title: {
display: true,
text: mfgPieChartShowPercentage ?
`Financials (Percentage) - ${currentMfgMode === 'all' ? 'All Times' : currentMfgMode.charAt(0).toUpperCase() + currentMfgMode.slice(1)}` :
`Financials: ${safeValue(totalValue).toFixed(2)} Total - ${currentMfgMode === 'all' ? 'All Times' : currentMfgMode.charAt(0).toUpperCase() + currentMfgMode.slice(1)}`,
color: colors.text,
font: { size: 13, weight: 'bold' }
},
tooltip: {
callbacks: {
label: function(context) {
if (mfgPieChartShowPercentage) {
const total = context.dataset.data.reduce((a, b) => a + b, 0);
const percentage = total > 0 ? safeNumber((context.parsed / total) * 100, 0).toFixed(2) : 0;
return `${context.label}: ${percentage}%`;
} else {
return `${context.label}: ${safeNumber(context.parsed, 0).toFixed(2)}`;
}
}
}
}
}
}
});
if (mfgPieChartShowPercentage) {
updateMfgPieChart();
}
}
function getWeightPerUnit(storeType) {
const formula = factoryDefaultFormulas[storeType];
if (!formula || formula.length === 0) return 0;
let totalWeight = 0;
formula.forEach(item => {
totalWeight += item.quantity;
});
return totalWeight;
}
function getPreviousDayAvailableUnits(storeType, currentDate) {
const previousDate = new Date(currentDate);
previousDate.setDate(previousDate.getDate() - 1);
const previousDateStr = previousDate.toISOString().split('T')[0];
const prevProduction = db.filter(item => item.date === previousDateStr);
const prevFactoryProduction = factoryProductionHistory.filter(item => item.date === previousDateStr);
const prevUsed = prevProduction.filter(item => item.formulaStore === storeType)
.reduce((sum, item) => sum + (item.formulaUnits || 0), 0);
const prevProduced = prevFactoryProduction.filter(item => item.store === storeType)
.reduce((sum, item) => sum + (item.units || 0), 0);
if (previousDate >= new Date('2020-01-01')) {
const prevPrevAvailable = getPreviousDayAvailableUnits(storeType, previousDate);
return Math.max(0, prevPrevAvailable + prevProduced - prevUsed);
}
return 0;
}
async function updateFactoryUnitsAvailableStats() {
const stdProductionData = db.filter(item => {
return (item.store === 'STORE_A' || item.store === 'STORE_B') && item.isReturn !== true;
});
const stdProducedUnits = factoryProductionHistory
.filter(item => item.store === 'standard')
.reduce((sum, item) => sum + (item.units || 0), 0);
const stdUsedUnits = stdProductionData.reduce((sum, item) => sum + (item.formulaUnits || 0), 0);
const stdOutputQuantity = stdProductionData.reduce((sum, item) => sum + (item.net || 0), 0);
const stdTotalCost = stdProductionData.reduce((sum, item) => sum + (item.totalCost || 0), 0);
const stdTotalSaleValue = stdProductionData.reduce((sum, item) => sum + (item.totalSale || 0), 0);
const stdTotalProfit = stdProductionData.reduce((sum, item) => sum + (item.profit || 0), 0);
const stdAvailableUnits = Math.max(0, stdProducedUnits - stdUsedUnits);
const stdCostPerUnit = getCostPerUnit('standard');
const stdTotalCostValue = stdCostPerUnit * stdAvailableUnits;
const stdProfitPerKg = stdOutputQuantity > 0 ? stdTotalProfit / stdOutputQuantity : 0;
const stdProfitPerUnit = stdUsedUnits > 0 ? stdTotalProfit / stdUsedUnits : 0;
const stdWeightPerUnit = getWeightPerUnit('standard');
const stdRawMaterialsUsed = stdWeightPerUnit * stdUsedUnits;
const stdMaterialsValue = stdTotalCost;
const _setFac = (id, val) => { const el = document.getElementById(id); if (el) el.innerText = val; };
_setFac('factoryStdUnits', stdAvailableUnits.toFixed(2));
_setFac('factoryStdUsedUnits', stdUsedUnits.toFixed(2));
_setFac('factoryStdUnitCost', await formatCurrency(stdCostPerUnit));
_setFac('factoryStdTotalVal', await formatCurrency(stdTotalCostValue));
_setFac('factoryStdOutput', stdOutputQuantity.toFixed(2) + ' kg');
_setFac('factoryStdRawUsed', stdRawMaterialsUsed.toFixed(2) + ' kg');
_setFac('factoryStdMatVal', await formatCurrency(stdMaterialsValue));
_setFac('factoryStdProfit', await formatCurrency(stdTotalProfit));
_setFac('factoryStdProfitUnit', await formatCurrency(stdProfitPerKg) + '/kg');
const asaanProductionData = db.filter(item => item.store === 'STORE_C' && item.isReturn !== true);
const asaanProducedUnits = factoryProductionHistory
.filter(item => item.store === 'asaan')
.reduce((sum, item) => sum + (item.units || 0), 0);
const asaanUsedUnits = asaanProductionData.reduce((sum, item) => sum + (item.formulaUnits || 0), 0);
const asaanOutputQuantity = asaanProductionData.reduce((sum, item) => sum + (item.net || 0), 0);
const asaanTotalCost = asaanProductionData.reduce((sum, item) => sum + (item.totalCost || 0), 0);
const asaanTotalSaleValue = asaanProductionData.reduce((sum, item) => sum + (item.totalSale || 0), 0);
const asaanTotalProfit = asaanProductionData.reduce((sum, item) => sum + (item.profit || 0), 0);
const asaanAvailableUnits = Math.max(0, asaanProducedUnits - asaanUsedUnits);
const asaanCostPerUnit = getCostPerUnit('asaan');
const asaanTotalCostValue = asaanCostPerUnit * asaanAvailableUnits;
const asaanProfitPerKg = asaanOutputQuantity > 0 ? asaanTotalProfit / asaanOutputQuantity : 0;
const asaanProfitPerUnit = asaanUsedUnits > 0 ? asaanTotalProfit / asaanUsedUnits : 0;
const asaanWeightPerUnit = getWeightPerUnit('asaan');
const asaanRawMaterialsUsed = asaanWeightPerUnit * asaanUsedUnits;
const asaanMaterialsValue = asaanTotalCost;
_setFac('factoryAsaanUnits', asaanAvailableUnits.toFixed(2));
_setFac('factoryAsaanUsedUnits', asaanUsedUnits.toFixed(2));
_setFac('factoryAsaanUnitCost', await formatCurrency(asaanCostPerUnit));
_setFac('factoryAsaanTotalVal', await formatCurrency(asaanTotalCostValue));
_setFac('factoryAsaanOutput', asaanOutputQuantity.toFixed(2) + ' kg');
_setFac('factoryAsaanRawUsed', asaanRawMaterialsUsed.toFixed(2) + ' kg');
_setFac('factoryAsaanMatVal', await formatCurrency(asaanMaterialsValue));
_setFac('factoryAsaanProfit', await formatCurrency(asaanTotalProfit));
_setFac('factoryAsaanProfitUnit', await formatCurrency(asaanProfitPerKg) + '/kg');
}
async function updateFactorySummaryCard() {
const mode = currentFactorySummaryMode || 'all';
const selectedDateVal = document.getElementById('factory-date').value || new Date().toISOString().split('T')[0];
const selectedDate = new Date(selectedDateVal);
const selectedYear = selectedDate.getFullYear();
const selectedMonth = selectedDate.getMonth();
const selectedDay = selectedDate.getDate();
let totalProduced = 0, totalConsumed = 0, totalCost = 0, totalOutput = 0, totalProfit = 0;
let totalRawUsed = 0, totalMatValue = 0, totalSaleValue = 0;
factoryProductionHistory.forEach(entry => {
const entryDate = new Date(entry.date);
let include = false;
if (mode === 'daily' && entry.date === selectedDateVal) include = true;
else if (mode === 'weekly') {
const weekStart = new Date(selectedDate);
weekStart.setDate(selectedDay - 6);
if (entryDate >= weekStart && entryDate <= selectedDate) include = true;
}
else if (mode === 'monthly' && entryDate.getMonth() === selectedMonth && entryDate.getFullYear() === selectedYear) include = true;
else if (mode === 'yearly' && entryDate.getFullYear() === selectedYear) include = true;
else if (mode === 'all') include = true;
if (include) {
totalProduced += entry.units || 0;
}
});
db.forEach(entry => {
if (entry.isReturn === true) return;
const entryDate = new Date(entry.date);
let include = false;
if (mode === 'daily' && entry.date === selectedDateVal) include = true;
else if (mode === 'weekly') {
const weekStart = new Date(selectedDate);
weekStart.setDate(selectedDay - 6);
if (entryDate >= weekStart && entryDate <= selectedDate) include = true;
}
else if (mode === 'monthly' && entryDate.getMonth() === selectedMonth && entryDate.getFullYear() === selectedYear) include = true;
else if (mode === 'yearly' && entryDate.getFullYear() === selectedYear) include = true;
else if (mode === 'all') include = true;
if (include) {
totalConsumed += entry.formulaUnits || 0;
totalOutput += entry.net || 0;
totalCost += entry.totalCost || 0;
totalSaleValue += entry.totalSale || 0;
totalProfit += entry.profit || 0;
const formulaStore = entry.formulaStore || (entry.store === 'STORE_C' ? 'asaan' : 'standard');
const weightPerUnit = getWeightPerUnit(formulaStore);
totalRawUsed += weightPerUnit * (entry.formulaUnits || 0);
}
});
totalMatValue = totalCost;
const totalAvailable = Math.max(0, totalProduced - totalConsumed);
const avgCostPerUnit = totalConsumed > 0 ? totalCost / totalConsumed : 0;
const avgProfitPerKg = totalOutput > 0 ? totalProfit / totalOutput : 0;
const _setSum = (id, val) => { const el = document.getElementById(id); if (el) el.innerText = val; };
_setSum('factorySumUnits', safeNumber(totalAvailable, 0).toFixed(2));
_setSum('factorySumUsedUnits', safeNumber(totalConsumed, 0).toFixed(2));
_setSum('factorySumUnitCost', await formatCurrency(avgCostPerUnit));
_setSum('factorySumTotalCost', await formatCurrency(totalCost));
_setSum('factorySumOutput', safeNumber(totalOutput, 0).toFixed(2) + ' kg');
_setSum('factorySumRawUsed', safeNumber(totalRawUsed, 0).toFixed(2) + ' kg');
_setSum('factorySumMatVal', await formatCurrency(totalMatValue));
_setSum('factorySumProfit', await formatCurrency(totalProfit));
_setSum('factorySumProfitUnit', await formatCurrency(avgProfitPerKg) + '/kg');
}
function getInitialAvailableForRange(storeType, mode, endDate) {
const end = new Date(endDate);
let startDate = new Date(end);
if (mode === 'weekly') {
startDate.setDate(end.getDate() - 6);
} else if (mode === 'monthly') {
startDate = new Date(end.getFullYear(), end.getMonth(), 1);
} else if (mode === 'yearly') {
startDate = new Date(end.getFullYear(), 0, 1);
}
return getPreviousDayAvailableUnits(storeType, startDate);
}
async function refreshFactoryTab() {
if (idb && idb.getBatch) {
try {
const factoryKeys = [
'factory_inventory_data',
'factory_production_history',
'factory_unit_tracking',
'factory_default_formulas'
];
const factoryDataMap = await idb.getBatch(factoryKeys);
if (factoryDataMap.get('factory_inventory_data')) {
let freshInventory = factoryDataMap.get('factory_inventory_data') || [];
let fixedCount = 0;
if (Array.isArray(freshInventory) && freshInventory.length > 0) {
freshInventory = freshInventory.map(record => {
if (!record.id || !validateUUID(record.id) ||
!record.createdAt || !validateTimestamp(record.createdAt) ||
!record.updatedAt || !validateTimestamp(record.updatedAt)) {
record = ensureRecordIntegrity(record, false, true);
fixedCount++;
}
return record;
});
if (fixedCount > 0) {
await idb.set('factory_inventory_data', freshInventory);
}
}
factoryInventoryData = freshInventory;
}
if (factoryDataMap.get('factory_production_history')) {
let freshHistory = factoryDataMap.get('factory_production_history') || [];
let fixedCount = 0;
if (Array.isArray(freshHistory) && freshHistory.length > 0) {
freshHistory = freshHistory.map(record => {
if (!record.id || !validateUUID(record.id) ||
!record.createdAt || !validateTimestamp(record.createdAt) ||
!record.updatedAt || !validateTimestamp(record.updatedAt)) {
record = ensureRecordIntegrity(record, false, true);
fixedCount++;
}
return record;
});
if (fixedCount > 0) {
await idb.set('factory_production_history', freshHistory);
}
freshHistory.sort((a, b) => compareTimestamps(getRecordTimestamp(b), getRecordTimestamp(a)));
}
factoryProductionHistory = freshHistory;
}
if (factoryDataMap.get('factory_unit_tracking')) {
factoryUnitTracking = factoryDataMap.get('factory_unit_tracking') || {
standard: { produced: 0, used: 0, returned: 0 },
asaan: { produced: 0, used: 0, returned: 0 }
};
}
if (factoryDataMap.get('factory_default_formulas')) {
factoryDefaultFormulas = factoryDataMap.get('factory_default_formulas') || { standard: [], asaan: [] };
}
} catch (error) {
console.error('Failed to save data locally.', error);
showToast('Failed to save data locally.', 'error');
}
}
const factoryDateInput = document.getElementById('factory-date');
if (!factoryDateInput.value) {
const today = new Date().toISOString().split('T')[0];
factoryDateInput.value = today;
currentFactoryDate = today;
} else {
currentFactoryDate = factoryDateInput.value;
}
updateFactoryUnitsAvailableStats();
updateFactorySummaryCard();
renderFactoryHistory();
renderFactoryInventory();
calculateFactoryProduction();
}
function updateAllTabsWithFactoryCosts() {
const storeSelector = document.getElementById('storeSelector');
if (storeSelector) {
updateUnitsAvailableIndicator();
updateProductionCostOnStoreChange();
}
const supplyStore = document.getElementById('supply-store-value');
if (supplyStore && supplyStore.value) {
calculateCustomerSale();
}
calculateSales();
updateFactoryUnitsAvailableStats();
updateFactorySummaryCard();
refreshUI();
}
function initFactoryTab() {
const factoryDateInput = document.getElementById('factory-date');
if (!factoryDateInput.value) {
const today = new Date().toISOString().split('T')[0];
factoryDateInput.value = today;
currentFactoryDate = today;
}
refreshFactoryTab();
document.querySelectorAll('#tab-factory .toggle-group .toggle-opt').forEach((opt, index) => {
if (index === 0) opt.classList.add('active');
else opt.classList.remove('active');
});
}
function setProductionView(view, event) {
currentProductionView = view;
document.querySelectorAll('.production-toggle-btn').forEach(btn => btn.classList.remove('active'));
if (event && event.target) event.target.classList.add('active');
const entrySection = document.getElementById('production-entry-section');
const combinedOverview = document.getElementById('combinedOverview');
const combinedChart = document.getElementById('combinedChart');
const analyticsSection = document.getElementById('prod-analytics-section');
const historyHeader = document.getElementById('prod-history-header');
const searchBar = document.getElementById('prod-search-bar');
if (view === 'store') {
entrySection.classList.remove('hidden');
if (combinedOverview) combinedOverview.classList.add('hidden');
if (combinedChart) combinedChart.classList.add('hidden');
if (analyticsSection) analyticsSection.classList.add('hidden');
if (historyHeader) historyHeader.classList.remove('hidden');
if (searchBar) searchBar.classList.remove('hidden');
} else {
entrySection.classList.add('hidden');
if (combinedOverview) combinedOverview.classList.remove('hidden');
if (combinedChart) combinedChart.classList.remove('hidden');
if (analyticsSection) analyticsSection.classList.remove('hidden');
if (historyHeader) historyHeader.classList.remove('hidden');
if (searchBar) searchBar.classList.remove('hidden');
updateAllStoresOverview(currentOverviewMode);
}
refreshUI();
}
function updateAllStoresOverview(mode = 'day') {
currentOverviewMode = mode;
const selectedDate = document.getElementById('sys-date').value;
const selectedDateObj = new Date(selectedDate);
const selectedYear = selectedDateObj.getFullYear();
const selectedMonth = selectedDateObj.getMonth();
const stores = ['STORE_A', 'STORE_B', 'STORE_C'];
const storeNames = ['ZUBAIR', 'MAHMOOD', 'ASAAN'];
const storeColors = ['store-a', 'store-b', 'store-c'];
let totalCombined = {
production: 0,
returns: 0,
sold: 0,
qty: 0,
value: 0,
cost: 0,
profit: 0,
formulaUnits: 0,
formulaCost: 0,
productionCredit: 0
};
const allStoresGrid = document.getElementById('all-stores-grid');
allStoresGrid.innerHTML = '';
stores.forEach((store, index) => {
let storeData = {
production: 0,
returns: 0,
sold: 0,
value: 0,
cost: 0,
profit: 0,
formulaUnits: 0,
formulaCost: 0,
productionCredit: 0
};
db.forEach(item => {
const itemDate = new Date(item.date);
const itemYear = itemDate.getFullYear();
const itemMonth = itemDate.getMonth();
let includeItem = false;
if (mode === 'day' && item.date === selectedDate) includeItem = true;
else if (mode === 'week') {
const weekStart = new Date(selectedDateObj);
weekStart.setDate(selectedDateObj.getDate() - 6);
if (itemDate >= weekStart && itemDate <= selectedDateObj) includeItem = true;
}
else if (mode === 'month' && itemYear === selectedYear && itemMonth === selectedMonth) includeItem = true;
else if (mode === 'year' && itemYear === selectedYear) includeItem = true;
else if (mode === 'all') includeItem = true;
if (includeItem && item.store === store) {
if (item.isReturn) {
storeData.returns += (item.net || 0);
if (store === 'STORE_C') {
storeData.productionCredit -= (item.totalSale || 0);
}

} else {
storeData.production += (item.net || 0);
storeData.formulaUnits += (item.formulaUnits || 0);
storeData.formulaCost += (item.formulaCost || 0);
if (store === 'STORE_C') {
  if (item.isMerged) {

    storeData.productionCredit += (item.creditSaleNet || 0);
  } else if (item.paymentStatus === 'CREDIT') {

    storeData.productionCredit += (item.totalSale || 0);
  }
}
storeData.value += (item.totalSale || 0);
storeData.cost += (item.totalCost || 0);
storeData.profit += (item.profit || 0);
}
}
});
let soldQty = 0;
customerSales.forEach(sale => {
if (!isDirectSale(sale)) return;
const saleDate = new Date(sale.date);
const saleYear = saleDate.getFullYear();
const saleMonth = saleDate.getMonth();
let includeSale = false;
if (mode === 'day' && sale.date === selectedDate) includeSale = true;
else if (mode === 'week') {
const weekStart = new Date(selectedDateObj);
weekStart.setDate(selectedDateObj.getDate() - 6);
if (saleDate >= weekStart && saleDate <= selectedDateObj) includeSale = true;
}
else if (mode === 'month' && saleYear === selectedYear && saleMonth === selectedMonth) includeSale = true;
else if (mode === 'year' && saleYear === selectedYear) includeSale = true;
else if (mode === 'all') includeSale = true;
if (includeSale && sale.supplyStore === store) {
soldQty += (sale.quantity || 0);
}
});
storeData.sold = soldQty;

	
	let calcTabStoreReturns = 0;
	if (Array.isArray(salesHistory)) {
		salesHistory.forEach(h => {

			const hDate = new Date(h.date);
			const hYear = hDate.getFullYear();
			const hMonth = hDate.getMonth();
			let includeInCalc = false;
			if (mode === 'day' && h.date === selectedDate) includeInCalc = true;
			else if (mode === 'week') {
				const weekStart = new Date(selectedDateObj);
				weekStart.setDate(selectedDateObj.getDate() - 6);
				if (hDate >= weekStart && hDate <= selectedDateObj) includeInCalc = true;
			}
			else if (mode === 'month' && hYear === selectedYear && hMonth === selectedMonth) includeInCalc = true;
			else if (mode === 'year' && hYear === selectedYear) includeInCalc = true;
			else if (mode === 'all') includeInCalc = true;

			

			if (includeInCalc && (h.returned || 0) > 0) {

				if (h.isMerged && h.returnsByStore && typeof h.returnsByStore === 'object') {

					const storeReturnFromMerged = h.returnsByStore[store] || 0;
					calcTabStoreReturns += storeReturnFromMerged;
				} else {

					
					const returnEntries = db.filter(item => 
						item.isReturn === true && 
						item.returnedBy === h.seller &&
						item.store === store &&
						item.date === h.date
					);
					const storeReturnQty = returnEntries.reduce((sum, item) => sum + (item.net || 0), 0);
					calcTabStoreReturns += storeReturnQty;
				}
			}
		});
	}

	
	if (calcTabStoreReturns > 0 && Math.abs(storeData.returns - calcTabStoreReturns) > 0.01) {
		storeData.returns = calcTabStoreReturns;
	}
const totalIn = storeData.production + storeData.returns;
const remainingQty = totalIn - soldQty;
totalCombined.production += storeData.production;
totalCombined.returns += storeData.returns;
totalCombined.sold += storeData.sold;
totalCombined.qty += totalIn;
totalCombined.value += storeData.value;
totalCombined.cost += storeData.cost;
totalCombined.profit += storeData.profit;
totalCombined.formulaUnits += storeData.formulaUnits;
totalCombined.formulaCost += storeData.formulaCost;
totalCombined.productionCredit += storeData.productionCredit;
let extraInfoHtml = '';
if (store === 'STORE_C') {
extraInfoHtml = `<p><span>Production Credit:</span> <span style="color:var(--warning); font-weight:800;">${safeValue(storeData.productionCredit).toFixed(2)}</span></p>`;
}
let returnsHtml = '';
if (storeData.returns > 0) {
returnsHtml = `<p><span>Returns Recvd:</span> <span style="color:#10b981; font-weight:800;">${safeValue(storeData.returns).toFixed(2)} kg</span></p>`;
}
const card = document.createElement('div');
card.className = `overview-card liquid-card`;
card.innerHTML = `
<span class="store-badge ${storeColors[index]}">${esc(storeNames[index])}</span>
<h4>${esc(storeNames[index])} (${mode === 'all' ? 'All Times' : mode.charAt(0).toUpperCase() + mode.slice(1)})</h4>
<p><span>Produced:</span> <span class="qty-val" style="color:var(--text-main);">${safeValue(storeData.production).toFixed(2)} kg</span></p>
${returnsHtml}
<p><span>Sold (Sales Tab):</span> <span class="cost-val">${safeValue(soldQty).toFixed(2)} kg</span></p>
<div style="border-top:1px dashed var(--glass-border); margin:4px 0; padding-top:4px;">
<p><span>Remaining:</span> <span class="profit-val" style="font-size:1.1rem;">${safeValue(remainingQty).toFixed(2)} kg</span></p>
</div>
<div style="background:rgba(37,99,235,0.03); padding:5px; border-radius:6px; margin:5px 0;">
<p><span>Formula Units:</span> <span class="qty-val u-fw-700" >${safeValue(storeData.formulaUnits).toFixed(2)}</span></p>
<p><span>Formula Cost:</span> <span class="cost-val u-fw-700" >${safeValue(storeData.formulaCost).toFixed(2)}</span></p>
</div>
<hr>
<p><span>Total Value:</span> <span class="rev-val">${safeValue(storeData.value).toFixed(2)}</span></p>
${extraInfoHtml}
<p><span>Net Profit:</span> <span class="profit-val">${safeValue(storeData.profit).toFixed(2)}</span></p>
`;
allStoresGrid.appendChild(card);
});
const combinedRemaining = totalCombined.qty - totalCombined.sold;

	let calcTabTotalReturns = 0;
	if (Array.isArray(salesHistory)) {
		salesHistory.forEach(h => {
			const hDate = new Date(h.date);
			const hYear = hDate.getFullYear();
			const hMonth = hDate.getMonth();
			let includeInCalc = false;
			if (mode === 'day' && h.date === selectedDate) includeInCalc = true;
			else if (mode === 'week') {
				const weekStart = new Date(selectedDateObj);
				weekStart.setDate(selectedDateObj.getDate() - 6);
				if (hDate >= weekStart && hDate <= selectedDateObj) includeInCalc = true;
			}
			else if (mode === 'month' && hYear === selectedYear && hMonth === selectedMonth) includeInCalc = true;
			else if (mode === 'year' && hYear === selectedYear) includeInCalc = true;
			else if (mode === 'all') includeInCalc = true;
			if (includeInCalc) {
				calcTabTotalReturns += (h.returned || 0);
			}
		});
	}

	if (calcTabTotalReturns > 0 && Math.abs(totalCombined.returns - calcTabTotalReturns) > 0.01) {
		totalCombined.returns = calcTabTotalReturns;
	}
const combinedCard = document.createElement('div');
combinedCard.className = `overview-card liquid-card highlight-card`;
combinedCard.innerHTML = `
<h4 style="color: var(--accent);">Total Combined</h4>
<p><span>Fresh Production:</span> <span class="qty-val">${safeValue(totalCombined.production).toFixed(2)} kg</span></p>
${totalCombined.returns > 0 ? `<p><span>Total Returns:</span> <span style="color:#10b981; font-weight:800;">${safeValue(totalCombined.returns).toFixed(2)} kg</span></p>` : ''}
<p><span>Total Sold:</span> <span class="cost-val">${safeValue(totalCombined.sold).toFixed(2)} kg</span></p>
<div style="border-top:1px dashed var(--glass-border); margin:4px 0; padding-top:4px;">
<p><span>Total Remaining:</span> <span class="profit-val" style="font-size:1.1rem;">${safeValue(combinedRemaining).toFixed(2)} kg</span></p>
</div>
<p><span>Total Formula Units:</span> <span class="qty-val">${safeValue(totalCombined.formulaUnits).toFixed(2)}</span></p>
<p><span>Total Formula Cost:</span> <span class="cost-val">${safeValue(totalCombined.formulaCost).toFixed(2)}</span></p>
<hr style="margin:8px 0;">
<p><span>Total Value:</span> <span class="rev-val">${safeValue(totalCombined.value).toFixed(2)}</span></p>
${totalCombined.productionCredit > 0 ? `<p><span>Total Credit:</span> <span style="color:var(--warning); font-weight:800;">${safeValue(totalCombined.productionCredit).toFixed(2)}</span></p>` : ''}
<p><span>Total Cost:</span> <span class="cost-val">${safeValue(totalCombined.cost).toFixed(2)}</span></p>
<p><span>Net Profit:</span> <span class="profit-val">${safeValue(totalCombined.profit).toFixed(2)}</span></p>
`;
allStoresGrid.appendChild(combinedCard);
updateStoreComparisonChart(mode);
}
function setCustomerChartMode(mode) {
currentCustomerChartMode = mode;
document.getElementById('cust-week-btn').className = `toggle-opt ${mode === 'week' ? 'active' : ''}`;
document.getElementById('cust-month-btn').className = `toggle-opt ${mode === 'month' ? 'active' : ''}`;
document.getElementById('cust-year-btn').className = `toggle-opt ${mode === 'year' ? 'active' : ''}`;
document.getElementById('cust-all-btn').className = `toggle-opt ${mode === 'all' ? 'active' : ''}`;
updateCustomerCharts();
}
function updateCustomerCharts() {
if (typeof Chart === 'undefined') return;
if(custSalesChart) custSalesChart.destroy();
if(custPaymentChart) custPaymentChart.destroy();
const selectedDate = document.getElementById('cust-date').value;
if (!selectedDate) return;
const selectedDateObj = new Date(selectedDate);
const selectedYear = selectedDateObj.getFullYear();
const selectedMonth = selectedDateObj.getMonth();
const selectedDay = selectedDateObj.getDate();
let labels = [], cashData = [], creditData = [];
let totalCash = 0, totalCredit = 0;
const colors = {
text: '#1e3a8a',
grid: 'rgba(37, 99, 235, 0.1)'
};
if (currentCustomerChartMode === 'week') {
for(let i=6; i>=0; i--) {
const d = new Date(selectedDateObj);
d.setDate(selectedDay - i);
const dateStr = d.toISOString().split('T')[0];
labels.push(d.toLocaleDateString('en-US', {weekday:'short'}));
let dayCash = 0, dayCredit = 0;
customerSales.forEach(item => {
if (isRepSale(item)) return; 
if(item.date === dateStr) {
if (item.isMerged && item.mergedSummary) {
const ms = item.mergedSummary;
dayCash   += (ms.cashSales    || 0);
dayCredit += (ms.unpaidCredit || 0);
} else if(item.paymentType === 'CASH' || item.creditReceived) {
dayCash += item.totalValue;
} else if(item.paymentType === 'CREDIT' && !item.creditReceived) {
dayCredit += item.totalValue;
}
}
});
cashData.push(dayCash);
creditData.push(dayCredit);
}
} else if (currentCustomerChartMode === 'month') {
const daysInMonth = new Date(selectedYear, selectedMonth + 1, 0).getDate();
labels = Array.from({length: daysInMonth}, (_, i) => i + 1);
cashData = new Array(daysInMonth).fill(0);
creditData = new Array(daysInMonth).fill(0);
customerSales.forEach(item => {
if (isRepSale(item)) return; 
const d = new Date(item.date);
if(d.getMonth() === selectedMonth && d.getFullYear() === selectedYear) {
if (item.isMerged && item.mergedSummary) {
const ms = item.mergedSummary;
cashData[d.getDate()   - 1] += (ms.cashSales    || 0);
creditData[d.getDate() - 1] += (ms.unpaidCredit || 0);
} else if(item.paymentType === 'CASH' || item.creditReceived) {
cashData[d.getDate() - 1] += item.totalValue;
} else if(item.paymentType === 'CREDIT' && !item.creditReceived) {
creditData[d.getDate() - 1] += item.totalValue;
}
}
});
} else if (currentCustomerChartMode === 'year') {
const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
labels = months;
cashData = new Array(12).fill(0);
creditData = new Array(12).fill(0);
customerSales.forEach(item => {
if (isRepSale(item)) return; 
const d = new Date(item.date);
if(d.getFullYear() === selectedYear) {
if (item.isMerged && item.mergedSummary) {
const ms = item.mergedSummary;
cashData[d.getMonth()]   += (ms.cashSales    || 0);
creditData[d.getMonth()] += (ms.unpaidCredit || 0);
} else if(item.paymentType === 'CASH' || item.creditReceived) {
cashData[d.getMonth()] += item.totalValue;
} else if(item.paymentType === 'CREDIT' && !item.creditReceived) {
creditData[d.getMonth()] += item.totalValue;
}
}
});
} else if (currentCustomerChartMode === 'all') {
const monthData = {};
customerSales.forEach(item => {
if (isRepSale(item)) return; 
const d = new Date(item.date);
const monthYear = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
const monthLabel = `${d.toLocaleDateString('en-US', {month:'short'})} ${d.getFullYear()}`;
if (!monthData[monthYear]) {
monthData[monthYear] = {
label: monthLabel,
cash: 0,
credit: 0
};
}
if (item.isMerged && item.mergedSummary) {
const ms = item.mergedSummary;
monthData[monthYear].cash   += (ms.cashSales    || 0);
monthData[monthYear].credit += (ms.unpaidCredit || 0);
} else if(item.paymentType === 'CASH' || item.creditReceived) {
monthData[monthYear].cash += item.totalValue;
} else if(item.paymentType === 'CREDIT' && !item.creditReceived) {
monthData[monthYear].credit += item.totalValue;
}
});
const sortedMonths = Object.keys(monthData).sort();
sortedMonths.forEach(monthKey => {
labels.push(monthData[monthKey].label);
cashData.push(monthData[monthKey].cash);
creditData.push(monthData[monthKey].credit);
});
if (labels.length > 12) {
labels = labels.slice(-12);
cashData = cashData.slice(-12);
creditData = creditData.slice(-12);
}
}
customerSales.forEach(item => {
if (item.isRepModeEntry === true || (item.salesRep && item.salesRep !== 'NONE')) return;
const d = new Date(item.date);
const dYear = d.getFullYear();
const dMonth = d.getMonth();
const dDay = d.getDate();
let include = false;
if(currentCustomerChartMode === 'week') {
const weekStart = new Date(selectedDateObj);
weekStart.setDate(selectedDay - 6);
if(d >= weekStart && d <= selectedDateObj) include = true;
}
if(currentCustomerChartMode === 'month' && dYear === selectedYear && dMonth === selectedMonth) include = true;
if(currentCustomerChartMode === 'year' && dYear === selectedYear) include = true;
if(currentCustomerChartMode === 'all') include = true;
if(include) {
if (item.isMerged && item.mergedSummary) {
const ms = item.mergedSummary;
totalCash   += (ms.cashSales    || 0);
totalCredit += (ms.unpaidCredit || 0);
} else if(item.paymentType === 'CASH' || item.creditReceived) {
totalCash += item.totalValue;
} else if(item.paymentType === 'CREDIT' && !item.creditReceived) {
totalCredit += item.totalValue;
}
}
});
const custSalesCanvas = document.getElementById('custSalesChart');
if (!custSalesCanvas) {
return;
}
const custSalesCtx = custSalesCanvas.getContext('2d');
if (!custSalesCtx) {
return;
}
custSalesChart = new Chart(custSalesCtx, {
type: 'bar',
data: {
labels: labels,
datasets: [
{
label: 'Cash Sales (Inc. Received Credits)',
data: cashData,
backgroundColor: 'rgba(5, 150, 105, 0.6)',
borderColor: '#059669',
borderWidth: 1,
borderRadius: 4
},
{
label: 'Pending Credits',
data: creditData,
backgroundColor: 'rgba(245, 158, 11, 0.6)',
borderColor: '#f59e0b',
borderWidth: 1,
borderRadius: 4
}
]
},
options: {
responsive: true,
maintainAspectRatio: false,
plugins: {
legend: { labels: { color: colors.text, font: { size: 10 } } },
title: {
display: true,
text: `Sales by Payment Type (${currentCustomerChartMode === 'all' ? 'All Times' : currentCustomerChartMode.charAt(0).toUpperCase() + currentCustomerChartMode.slice(1)})`,
color: colors.text,
font: { size: 13, weight: 'bold' }
}
},
scales: {
y: {
stacked: true,
grid: { color: colors.grid },
ticks: { color: colors.text },
beginAtZero: true
},
x: {
stacked: true,
ticks: { color: colors.text, maxRotation: currentCustomerChartMode === 'all' ? 45 : 0 }
}
}
}
});
const pieData = [totalCash, totalCredit];
const pieLabels = ['Cash Sales (Inc. Received Credits)', 'Pending Credits'];
const custPaymentCanvas = document.getElementById('custPaymentChart');
if (!custPaymentCanvas) {
return;
}
const custPaymentCtx = custPaymentCanvas.getContext('2d');
if (!custPaymentCtx) {
return;
}
custPaymentChart = new Chart(custPaymentCtx, {
type: 'pie',
data: {
labels: pieLabels,
datasets: [{
data: pieData,
backgroundColor: ['#059669', '#f59e0b'],
borderWidth: 0
}]
},
options: {
responsive: true,
maintainAspectRatio: false,
plugins: {
legend: { position:'bottom', labels: { color: colors.text, font: { size: 10 } } },
title: {
display: true,
text: custPaymentChartShowPercentage ?
`Payment Distribution (Percentage) - ${currentCustomerChartMode === 'all' ? 'All Times' : ''}` :
`Total: ${safeValue(totalCash + totalCredit).toFixed(2)} - ${currentCustomerChartMode === 'all' ? 'All Times' : ''}`,
color: colors.text,
font: { size: 13, weight: 'bold' }
},
tooltip: {
callbacks: {
label: function(context) {
if (custPaymentChartShowPercentage) {
const total = context.dataset.data.reduce((a, b) => a + b, 0);
const percentage = total > 0 ? safeNumber((context.parsed / total) * 100, 0).toFixed(2) : 0;
return `${context.label}: ${percentage}%`;
} else {
return `${context.label}: ${safeNumber(context.parsed, 0).toFixed(2)}`;
}
}
}
}
}
}
});
if (custPaymentChartShowPercentage) {
updateCustomerPieChart();
}
}
async function refreshCustomerSales(page = 1, force = false) {
const selectedDate = document.getElementById('cust-date').value;
if (!selectedDate) return;
if (idb && idb.get) {
try {
let freshSales = await idb.get('customer_sales', []);
if (force && firebaseDB && currentUser) {
try {
const userDocRef = firebaseDB.collection('users').doc(currentUser.uid);
const snapshot = await userDocRef.collection('sales').get();
if (!snapshot.empty) {
const firestoreSales = [];
snapshot.forEach(doc => {
const data = doc.data();
if (!data._placeholder) {
firestoreSales.push({ id: doc.id, ...data });
}
});
const localMap = new Map((freshSales || []).map(r => [r.id, r]));
for (const cloudRecord of firestoreSales) {
if (!cloudRecord.id) continue;
const localRecord = localMap.get(cloudRecord.id);
if (!localRecord) {
localMap.set(cloudRecord.id, cloudRecord);
} else {
const localTs = localRecord.updatedAt || localRecord.timestamp || 0;
const cloudTs = typeof cloudRecord.updatedAt === 'object' && cloudRecord.updatedAt?.toMillis
? cloudRecord.updatedAt.toMillis()
: (cloudRecord.updatedAt || cloudRecord.timestamp || 0);
if (cloudTs > localTs) {
localMap.set(cloudRecord.id, cloudRecord);
}
}
}
freshSales = Array.from(localMap.values());
await idb.set('customer_sales', freshSales);
}
} catch (firestoreError) {
console.error('Failed to save data locally.', firestoreError);
showToast('Failed to save data locally.', 'error');
}
}
if (freshSales && freshSales.length > 0) {
let fixedCount = 0;
freshSales = freshSales.map(record => {
if (!record.id || !validateUUID(record.id) ||
!record.createdAt || !validateTimestamp(record.createdAt) ||
!record.updatedAt || !validateTimestamp(record.updatedAt)) {
record = ensureRecordIntegrity(record, false, true);
fixedCount++;
}
return record;
});
if (fixedCount > 0) {
await idb.set('customer_sales', freshSales);
}
customerSales = freshSales;
}
} catch (error) {
console.error('Failed to save data locally.', error);
showToast('Failed to save data locally.', 'error');
}
}
const selectedDateObj = new Date(selectedDate);
const selectedYear = selectedDateObj.getFullYear();
const selectedMonth = selectedDateObj.getMonth();
const selectedDay = selectedDateObj.getDate();
const weekStart = new Date(selectedDateObj);
weekStart.setDate(selectedDay - 6);
let stats = {
day: {q:0, v:0, cash:0, credit:0, profit:0},
week: {q:0, v:0, cash:0, credit:0, profit:0},
month: {q:0, v:0, cash:0, credit:0, profit:0},
year: {q:0, v:0, cash:0, credit:0, profit:0},
all: {q:0, v:0, cash:0, credit:0, profit:0}
};
const sortedSales = [...customerSales].sort((a,b) => {
if (a.date === selectedDate && b.date !== selectedDate) return -1;
if (a.date !== selectedDate && b.date === selectedDate) return 1;
return compareTimestamps(getRecordTimestamp(b), getRecordTimestamp(a));
});
sortedSales.forEach(item => {
if (item.isRepModeEntry === true ||
(item.salesRep && item.salesRep !== 'NONE') ||
item.paymentType === 'PARTIAL_PAYMENT' ||
item.paymentType === 'COLLECTION') return;
const rowDate = new Date(item.date);
const rowYear = rowDate.getFullYear();
const rowMonth = rowDate.getMonth();
const rowDay = rowDate.getDate();
const updatePeriod = (period) => {
period.q += item.quantity;
period.v += item.totalValue;
period.profit += item.profit;
if (item.isMerged && item.mergedSummary) {
const ms = item.mergedSummary;
period.cash   += (ms.cashSales    || 0);
period.credit += (ms.unpaidCredit || 0);
} else if(item.paymentType === 'CASH' || item.creditReceived) {
period.cash += item.totalValue;
} else if(item.paymentType === 'CREDIT' && !item.creditReceived) {
period.credit += item.totalValue;
}
};
if(item.date === selectedDate) updatePeriod(stats.day);
if(rowDate >= weekStart && rowDate <= selectedDateObj) updatePeriod(stats.week);
if(rowYear === selectedYear && rowMonth === selectedMonth) updatePeriod(stats.month);
if(rowYear === selectedYear) updatePeriod(stats.year);
updatePeriod(stats.all);
});
const displayData = sortedSales.filter(item =>
!item.isRepModeEntry &&
(!item.salesRep || item.salesRep === 'NONE' || item.salesRep === 'ADMIN') &&
item.paymentType !== 'PARTIAL_PAYMENT' &&
item.paymentType !== 'COLLECTION'
);
const pageData = displayData;
const validPage = 1;
const totalPages = 1;
const totalItems = displayData.length;
const cacheData = {
pageData, stats, selectedDate, totalPages, totalItems, validPage
};
renderSalesFromCache(cacheData);
}
function renderSalesFromCache(cached) {
if (!cached) {
return;
}
const { pageData, stats, selectedDate, totalPages, totalItems, validPage } = cached;
const updateStatDisplay = (prefix, stat) => {
const qtyEl = document.getElementById(`cust-${prefix}-qty`);
const valueEl = document.getElementById(`cust-${prefix}-value`);
const cashEl = document.getElementById(`cust-${prefix}-cash`);
const creditEl = document.getElementById(`cust-${prefix}-credit`);
const profitEl = document.getElementById(`cust-${prefix}-profit`);
if (qtyEl) qtyEl.innerText = safeValue(stat.q).toFixed(2) + ' kg';
if (valueEl) valueEl.innerText = '' + safeValue(stat.v).toFixed(2);
if (cashEl) cashEl.innerText = '' + safeValue(stat.cash).toFixed(2);
if (creditEl) creditEl.innerText = '' + safeValue(stat.credit).toFixed(2);
if (profitEl) profitEl.innerText = '' + safeValue(stat.profit).toFixed(2);
};
updateStatDisplay('day', stats.day);
updateStatDisplay('week', stats.week);
updateStatDisplay('month', stats.month);
updateStatDisplay('year', stats.year);
updateStatDisplay('all', stats.all);
if (typeof setSalesSummaryMode === 'function') setSalesSummaryMode(currentSalesSummaryMode || 'day');
const histContainer = document.getElementById('custHistoryList');
histContainer.innerHTML = '';
if (totalItems === 0) {
histContainer.innerHTML = `<p style="text-align:center; color:var(--text-muted); width:100%; font-size:0.85rem;">No sales found.</p>`;
} else {
const fragment = document.createDocumentFragment();
pageData.forEach(item => {
const isSelected = item.date === selectedDate;
const highlightClass = isSelected ? 'highlight-card' : '';
const dateDisplay = isSelected ? `${formatDisplayDate(item.date)} (Selected)` : formatDisplayDate(item.date);
const creditReceived = item.creditReceived || false;
const paymentType = item.paymentType || 'CASH';
const badgeClass = creditReceived ? 'received' : (paymentType ? paymentType.toLowerCase() : 'cash');
const badgeText = creditReceived ? 'RECEIVED' : paymentType;
const isOldDebtItem = item.transactionType === 'OLD_DEBT';
const supplyTagClass = item.supplyStore === 'STORE_A' ? 'store-a' :
item.supplyStore === 'STORE_B' ? 'store-b' : 'store-c';
const supplyTagText = item.supplyStore === 'STORE_A' ? 'ZUBAIR' :
item.supplyStore === 'STORE_B' ? 'MAHMOOD' : 'ASAAN';
let repBadge = '';
if (item.salesRep && item.salesRep !== 'NONE' && item.salesRep !== 'ADMIN') {
repBadge = `<span style="font-size:0.65rem; background:#e0e7ff; color:#3730a3; padding:2px 6px; border-radius:4px; margin-left:5px;"> ${esc(item.salesRep.split(' ')[0])}</span>`;
}
let mergedBadge = '';
if (item.isMerged) {
mergedBadge = _mergedBadgeHtml(item, {inline:true});
}
const card = document.createElement('div');
card.className = `card liquid-card ${highlightClass}`;
if (item.date) card.setAttribute('data-date', item.date);
let creditSection = '';
if (!isOldDebtItem) {
if (paymentType === 'CREDIT' && !creditReceived) {
creditSection = `
<div class="credit-checkbox-container" onclick="(async () => { await toggleCustomerCreditReceived('${esc(item.id)}', event) })()">
<input type="checkbox" class="credit-checkbox" onclick="(async () => { await toggleCustomerCreditReceived(${item.id}, event); })()">
<label class="credit-checkbox-label">Mark as Received</label>
</div>
`;
} else if (paymentType === 'CREDIT' && creditReceived) {
creditSection = `<div class="received-indicator">Credit Received </div>`;
}
}
const deleteBtnHtml = item.isMerged ? '' : `<button class="tbl-action-btn danger u-w-full u-mt-8" onclick="(async () => { await deleteCustomerSale('${esc(item.id)}') })()">Delete</button>`;
if (isOldDebtItem) {
card.innerHTML = `
<div class="payment-badge credit">CREDIT</div>
<div class="customer-name" style="margin-top: 12px;">${esc(item.customerName)}
<span style="background:rgba(255,159,10,0.15);color:var(--warning);padding:2px 6px;border-radius:4px;font-size:0.65rem;margin-left:6px;font-weight:600;">OLD DEBT</span>${item.isMerged ? _mergedBadgeHtml(item, {inline:true}) : ''}
</div>
<h4 style="margin-top: 5px; font-size: 0.85rem; color: var(--text-muted);">${dateDisplay}</h4>
<hr>
<p><span>Previous Balance:</span> <span class="rev-val">${safeValue(item.totalValue).toFixed(2)}</span></p>
<p class="u-fs-sm u-text-muted" >${esc(item.notes || 'Brought forward from previous records')}</p>
${deleteBtnHtml}
`;
} else {
card.innerHTML = `
<div class="payment-badge ${badgeClass}">${esc(badgeText)}</div>
<div class="customer-name" style="margin-top: 12px;">${esc(item.customerName)} ${repBadge} ${mergedBadge}</div>
<h4 style="margin-top: 5px; font-size: 0.85rem; color: var(--text-muted);">${dateDisplay}</h4>
<div class="supply-tag ${supplyTagClass}">Supply: ${supplyTagText}</div>
<hr>
<p><span>Quantity:</span> <span class="qty-val">${safeValue(item.quantity).toFixed(2)} kg</span></p>
<p><span>Total Value:</span> <span class="rev-val">${safeValue(item.totalValue).toFixed(2)}</span></p>
<p><span>Net Profit:</span> <span class="profit-val">${safeValue(item.profit).toFixed(2)}</span></p>
${creditSection}
${deleteBtnHtml}
`;
}
fragment.appendChild(card);
});
histContainer.appendChild(fragment);
}
const _custDate = (document.getElementById('cust-date') || {}).value || new Date().toISOString().split('T')[0];
_filterHistoryByPeriod('#custHistoryList', _custDate, currentSalesSummaryMode || 'day');
renderCustomersTable();
updateCustomerCharts();
}
async function toggleCustomerCreditReceived(id, event) {
if (event) {
event.preventDefault();
event.stopPropagation();
}
const saleIndex = customerSales.findIndex(item => item.id === id);
if (saleIndex !== -1) {
customerSales[saleIndex].creditReceived = !customerSales[saleIndex].creditReceived;
if (customerSales[saleIndex].creditReceived) {
customerSales[saleIndex].paymentType = 'CASH';
}
customerSales[saleIndex].updatedAt = getTimestamp();
await unifiedSave('customer_sales', customerSales, customerSales[saleIndex]);
refreshCustomerSales();
updateCustomerCharts();
}
}
async function calculateComparisonData() {
const compMode = currentCompMode;
const selectedDate = document.getElementById('sale-date').value;
const selectedDateObj = new Date(selectedDate);
const selectedYear = selectedDateObj.getFullYear();
const selectedMonth = selectedDateObj.getMonth();
const selectedDay = selectedDateObj.getDate();
let history; history = await idb.get('noman_history', []);
const comp = {};
salesRepsList.forEach(rep => { comp[rep] = {prof:0, rev:0, sold:0, ret:0, cred:0, cash:0, coll:0, giv:0, cost:0}; });
history.forEach(h => {
const hDate = new Date(h.date);
const hYear = hDate.getFullYear();
const hMonth = hDate.getMonth();
const hDay = hDate.getDate();
let includeInComp = false;
if (compMode === 'all') includeInComp = true;
else if (compMode === 'week') {
const weekStart = new Date(selectedDateObj);
weekStart.setDate(selectedDay - 6);
if(hDate >= weekStart && hDate <= selectedDateObj) includeInComp = true;
}
else if (compMode === 'month' && hYear === selectedYear && hMonth === selectedMonth) includeInComp = true;
else if (compMode === 'year' && hYear === selectedYear) includeInComp = true;
if(includeInComp && comp[h.seller]) {
comp[h.seller].prof += h.profit;
comp[h.seller].rev += h.revenue;
comp[h.seller].cost += (h.totalCost || 0);
comp[h.seller].sold += h.totalSold;
comp[h.seller].ret += h.returned;
comp[h.seller].cred += h.creditQty;
comp[h.seller].cash += h.cashQty;
comp[h.seller].coll += h.prevColl;
comp[h.seller].giv += h.creditValue;
}
});
return comp;
}
function createReportHTML(title, data, isHistory = false, id = null, sellerName = null, isHighlight = false, isMerged = false) {
const creditVal = safeValue(data.creditVal);
const collected = safeValue(data.collected);
const balance = creditVal - collected;
const received = safeValue(data.received);
const expected = safeValue(data.expected);
const discrepancy = received - expected;
const balClass = balance > 0 ? 'balance-pos' : 'balance-neg';
let discClass = 'qty-val';
let discText = `${Math.abs(discrepancy).toFixed(2)}`;
if (Math.abs(discrepancy) < 0.01) {
discClass = 'units-available-good';
discText = "Perfect Match";
} else if (discrepancy < 0) {
discClass = 'cost-val';
discText = `SHORT: ${Math.abs(discrepancy).toFixed(2)}`;
} else {
discClass = 'profit-val';
discText = `OVER: ${discrepancy.toFixed(2)}`;
}
const displayStatusText = data.statusText || discText;
const displayStatusClass = data.statusClass || (Math.abs(discrepancy) < 0.01 ? 'result-box discrepancy-ok' : 'result-box discrepancy-alert');
const badge = sellerName ? `<span class="seller-badge ${salesRepsList.indexOf(sellerName) === 0 ? 'noran-badge' : 'noman-badge'}">${sellerName.split(' ')[0]}</span>` : '';
const mergedBadge = isMerged ? _mergedBadgeHtml({ isMerged: true, mergedRecordCount: data.mergedRecordCount, mergedSummary: data.mergedSummary }, {inline:true}) : '';
const highlightClass = isHighlight ? 'highlight-card' : '';
const dateAttr = (isHistory && data._rawDate) ? ` data-date="${data._rawDate}"` : '';
let html = `<div class="card liquid-card ${highlightClass}"${dateAttr}>${badge}<h4>${esc(title)}${mergedBadge}</h4>
<p><span>Total Sold:</span> <span class="qty-val">${safeValue(data.sold).toFixed(2)}</span></p>
<p><span>Returned:</span> <span class="qty-val">${safeValue(data.ret).toFixed(2)}</span></p>
<p><span>Cash Qty:</span> <span class="qty-val">${safeValue(data.cash).toFixed(2)}</span></p>
<p><span>Credit Qty:</span> <span class="qty-val">${safeValue(data.cred).toFixed(2)}</span></p>
<hr>
<p><span>Revenue:</span> <span class="rev-val">${safeValue(data.revenue).toFixed(2)}</span></p>
<p><span>Profit:</span> <span class="profit-val">${safeValue(data.profit).toFixed(2)}</span></p>
<p><span>Credit Out:</span> <span class="cost-val">${creditVal.toFixed(2)}</span></p>
<p><span>Credit In:</span> <span class="profit-val">${collected.toFixed(2)}</span></p>
<p><span>Net Debt:</span> <span class="${balClass}">${balance.toFixed(2)}</span></p>
<hr>
<p><span>Expected Cash:</span> <span class="qty-val" style="color:var(--text-main);">${expected.toFixed(2)}</span></p>
<p><span>Received Cash:</span> <span class="qty-val" style="font-weight:800; color:var(--text-main);">${received.toFixed(2)}</span></p>
<p><span>Discrepancy:</span> <span class="${discClass}">${discText}</span></p>
`;
if (isHistory) {
html += `
<div style="padding: 8px; border-radius: 6px; text-align: center; margin-top: 8px; font-size: 10px;" class="${displayStatusClass}">${displayStatusText}</div>`;
if (!isMerged) {
html += `<button class="tbl-action-btn danger u-w-full u-mt-8" onclick="deleteSalesEntry('${id}')">Delete</button>`;
}
}
html += `</div>`;
return html;
}
function calculateTotalSoldForRepresentative(seller) {
if (!seller || seller === 'COMBINED') return 0;
let totalSold = 0;
customerSales.forEach(sale => {
if (sale.salesRep === seller &&
sale.paymentType === 'CREDIT' &&
!sale.creditReceived &&
sale.isRepModeEntry !== true) {
totalSold += (sale.quantity || 0);
}
});
return totalSold;
}
function autoFillTotalSoldQuantity() {
const seller = document.getElementById('sellerSelect').value;
const date = document.getElementById('sale-date').value;
const totalSoldField = document.getElementById('totalSold');
const creditSalesField = document.getElementById('creditSales');
const recoveredField = document.getElementById('prevCreditReceived');
if (!totalSoldField) return;
if (seller === 'COMBINED') {
totalSoldField.value = '';
totalSoldField.readOnly = true;
return;
}
const totalSold = calculateTotalSoldForRepresentative(seller);
totalSoldField.value = safeNumber(totalSold, 0).toFixed(2);
totalSoldField.readOnly = true;
totalSoldField.style.background = 'rgba(37, 99, 235, 0.1)';
totalSoldField.style.color = 'var(--accent)';
totalSoldField.style.fontWeight = 'bold';
totalSoldField.style.border = '1px solid var(--accent)';
const usedRepSaleIds = new Set();
repSales.forEach(sale => {
if (sale.usedInCalcId) {
usedRepSaleIds.add(sale.id);
}
});
if (Array.isArray(salesHistory)) {
salesHistory.forEach(calcEntry => {
if (calcEntry.linkedRepSalesIds && Array.isArray(calcEntry.linkedRepSalesIds)) {
calcEntry.linkedRepSalesIds.forEach(id => usedRepSaleIds.add(id));
}
});
}
let creditSalesKg = 0;
let recoveredCash = 0;
repSales.forEach(sale => {
if (sale.salesRep === seller && sale.date === date && !usedRepSaleIds.has(sale.id)) {
if (sale.paymentType === 'CREDIT') {
creditSalesKg += (sale.quantity || 0);
}
if (sale.paymentType === 'COLLECTION') {
recoveredCash += (sale.totalValue || 0);
}
}
});
if(creditSalesField) {
creditSalesField.value = safeNumber(creditSalesKg, 0).toFixed(2);
styleAutoFilledField(creditSalesField);
}
if(recoveredField) {
recoveredField.value = safeNumber(recoveredCash, 0).toFixed(2);
styleAutoFilledField(recoveredField);
}
calculateSales();
}
function styleAutoFilledField(field) {
field.style.background = 'rgba(5, 150, 105, 0.1)';
field.style.color = 'var(--accent-emerald)';
field.style.fontWeight = 'bold';
field.style.border = '1px solid var(--accent-emerald)';
}
async function loadSalesData(compMode = 'all') {
currentCompMode = compMode;
['week', 'month', 'year', 'all'].forEach(m => {
const btn = document.getElementById(`comp-${m}-btn`);
if(btn) btn.className = `toggle-opt ${m === compMode ? 'active' : ''}`;
});
const seller = document.getElementById('sellerSelect').value;
const searchDate = document.getElementById('sale-date').value;
autoFillTotalSoldQuantity();
const isCombined = seller === "COMBINED";
const label = isCombined ? "Combined" : seller;
const _setSel = (id, val) => { const el = document.getElementById(id); if (el) el.innerText = val; };
_setSel('reportSellerName', label);
_setSel('debtSellerName', label);
_setSel('selectedSellerName', label);
const entrySection = document.getElementById('entrySection'); if (entrySection) entrySection.className = isCombined ? "hidden" : "";
const combinedSection = document.getElementById('combinedSection'); if (combinedSection) combinedSection.className = isCombined ? "" : "hidden";
const indChart = document.getElementById('individualChartSection'); if (indChart) indChart.className = isCombined ? "hidden" : "";
let history = await idb.get('noman_history', []);
if (!Array.isArray(history)) history = [];
let displayList = isCombined ? history : history.filter(h => h.seller === seller);
displayList.sort((a,b) => {
if (a.date === searchDate && b.date !== searchDate) return -1;
if (a.date !== searchDate && b.date === searchDate) return 1;
return b.timestamp - a.timestamp;
});
const ranges = {
d: { sold:0, ret:0, cash:0, cred:0, creditVal:0, collected:0, profit:0, revenue:0, expected:0, received:0 },
w: { sold:0, ret:0, cash:0, cred:0, creditVal:0, collected:0, profit:0, revenue:0, expected:0, received:0 },
m: { sold:0, ret:0, cash:0, cred:0, creditVal:0, collected:0, profit:0, revenue:0, expected:0, received:0 },
y: { sold:0, ret:0, cash:0, cred:0, creditVal:0, collected:0, profit:0, revenue:0, expected:0, received:0 },
a: { sold:0, ret:0, cash:0, cred:0, creditVal:0, collected:0, profit:0, revenue:0, expected:0, received:0 }
};
const list = document.getElementById('historyList');
list.innerHTML = '';
displayList.forEach(h => {
const isHighlight = h.date === searchDate;
const dateTitle = isHighlight ? `${formatDisplayDate(h.date)} (Selected)` : formatDisplayDate(h.date);

list.innerHTML += createReportHTML(
dateTitle,
{
sold: h.totalSold,
ret: h.returned,
cash: h.cashQty,
cred: h.creditQty,
revenue: h.revenue,
profit: h.profit,
creditVal: h.creditValue,
collected: h.prevColl,
expected: h.totalExpected,
received: h.received,
statusClass: h.statusClass,
statusText: h.statusText,
_rawDate: h.date
},
true, h.id, isCombined ? h.seller : null, isHighlight, h.isMerged
);
});
const validSearchDate = searchDate || new Date().toISOString().split('T')[0];
const now = new Date(validSearchDate);
if (isNaN(now.getTime())) {
now.setTime(Date.now());
}
const weekStart = new Date(now);
weekStart.setDate(now.getDate() - 6);
let ltCr = 0, ltCl = 0;
const debtFilterList = isCombined ? history : history.filter(h => h.seller === seller);
debtFilterList.forEach(h => {
if (!h.date) return;

const hDate = new Date(h.date);
if (isNaN(hDate.getTime())) {
return;
}
ltCr += (h.creditValue || 0);
ltCl += (h.prevColl || 0);
if(h.date === searchDate) addToRange(ranges.d, h);
if(hDate >= weekStart && hDate <= now) addToRange(ranges.w, h);
if(hDate.getMonth() === now.getMonth() && hDate.getFullYear() === now.getFullYear()) addToRange(ranges.m, h);
if(hDate.getFullYear() === now.getFullYear()) addToRange(ranges.y, h);
addToRange(ranges.a, h);
});
document.getElementById('dailyReport').innerHTML = createReportHTML("Daily View", ranges.d);
document.getElementById('weeklyReport').innerHTML = createReportHTML("Weekly View", ranges.w);
document.getElementById('monthlyReport').innerHTML = createReportHTML("Monthly View", ranges.m);
document.getElementById('yearlyReport').innerHTML = createReportHTML("Yearly View", ranges.y);
document.getElementById('allTimeReport').innerHTML = createReportHTML("All Time Summary", ranges.a);
if (typeof setPerfOverviewMode === 'function') setPerfOverviewMode(currentPerfOverviewMode || 'day');
const _saleDate = (document.getElementById('sale-date') || {}).value || new Date().toISOString().split('T')[0];
_filterHistoryByPeriod('#historyList', _saleDate, currentPerfOverviewMode || 'day');
const _setLt = (id, val) => { const el = document.getElementById(id); if (el) el.innerText = val; };
_setLt('ltCredit', "" + safeValue(ltCr).toFixed(2));
_setLt('ltCollected', "" + safeValue(ltCl).toFixed(2));
_setLt('ltBalance', "" + safeValue(ltCr - ltCl).toFixed(2));
if(isCombined) {
const comp = await calculateComparisonData();
updateSalesCharts(comp);
const repNames = salesRepsList;
const bestProfit = Math.max(...repNames.map(r => (comp[r]||{prof:0}).prof));
const compHead = document.getElementById('comparisonHead');
if (compHead) {
compHead.innerHTML = '<tr><th>Metric</th>' +
repNames.map(r => {
const isWinner = (comp[r]||{prof:0}).prof >= bestProfit && bestProfit > 0;
const firstName = r.split(' ')[0].charAt(0) + r.split(' ')[0].slice(1).toLowerCase();
return `<th id="th-rep-${r.replace(/\s+/g,'-')}">${firstName}</th>`;
}).join('') +
'</tr>';
}
const metrics = [
{ label: 'Qty Sold', key: 'sold', cls: null },
{ label: 'Returns', key: 'ret', cls: null },
{ label: 'Total Cost', key: 'cost', cls: 'cost-val' },
{ label: 'Gross Revenue', key: 'rev', cls: 'rev-val' },
{ label: 'Net Profit', key: 'prof', cls: 'profit-val', winner: true },
{ label: 'Credit Issued', key: 'giv', cls: null },
{ label: 'Credit Recovered', key: 'coll', cls: null },
];
document.getElementById('comparisonBody').innerHTML = metrics.map(m => {
const cells = repNames.map(r => {
const val = safeValue((comp[r]||{})[m.key]).toFixed(2);
const style = m.key === 'cost' ? ' style="color:var(--danger)"' : m.key === 'coll' ? ' style="color:var(--accent)"' : '';
const cls = m.cls ? ` class="${m.cls}"` : '';
return `<td${cls}${style}>${val}</td>`;
}).join('');
const rowCls = m.winner ? ' class="winner-cell"' : '';
return `<tr${rowCls}><td>${m.label}</td>${cells}</tr>`;
}).join('');
} else {
await updateIndChart();
}
}
function addToRange(range, h) {
range.sold += h.totalSold;
range.ret += h.returned;
range.cash += h.cashQty;
range.cred += h.creditQty;
range.creditVal += h.creditValue;
range.collected += h.prevColl;
range.profit += h.profit;
range.revenue += h.revenue;
range.expected += (h.totalExpected || 0);
range.received += (h.received || 0);
}
function updateSalesCharts(comp) {
if (typeof Chart === 'undefined') return;
if(!comp) return;
const selectedMetric = document.getElementById('metricSelector').value;
const metricLabel = document.getElementById('metricSelector').options[document.getElementById('metricSelector').selectedIndex].text;
const colors = {
text: '#1e3a8a',
grid: 'rgba(37, 99, 235, 0.1)'
};
const perfChartElement = document.getElementById('performanceChart');
if (!perfChartElement) {
return;
}
const perfCtx = perfChartElement.getContext('2d');
if (!perfCtx) {
return;
}
const repChartColors = ['#2563eb', '#059669', '#d97706', '#7c3aed', '#dc2626', '#0891b2'];
const repNames = salesRepsList;
const chartLabels = repNames.map(r => r.split(' ').map(w => w[0]+w.slice(1).toLowerCase()).join(' '));
const chartData = repNames.map(r => (comp[r] || {})[selectedMetric] || 0);
const chartColors = repNames.map((_, i) => repChartColors[i % repChartColors.length]);
if(salesPerfChart) salesPerfChart.destroy();
salesPerfChart = new Chart(perfCtx, {
type: 'bar',
data: {
labels: chartLabels,
datasets: [{
label: metricLabel,
data: chartData,
backgroundColor: chartColors,
borderRadius: 6
}]
},
options: {
responsive: true,
maintainAspectRatio: false,
plugins: { legend: { display: false } },
scales: {
y: { beginAtZero: true, grid: { color: colors.grid }, ticks: { color: colors.text } },
x: { ticks: { color: colors.text } }
}
}
});
const totalCashValue = repNames.reduce((s, r) => s + ((comp[r]||{}).rev||0) - ((comp[r]||{}).giv||0), 0);
const totalCreditValue = repNames.reduce((s, r) => s + ((comp[r]||{}).giv||0), 0);
const totalSold = repNames.reduce((s, r) => s + ((comp[r]||{}).sold||0), 0);
const totalReturned = repNames.reduce((s, r) => s + ((comp[r]||{}).ret||0), 0);
const totalRevenue = repNames.reduce((s, r) => s + ((comp[r]||{}).rev||0), 0);
const avgPrice = totalSold > 0 ? totalRevenue / totalSold : 0;
const totalReturnValue = totalReturned * avgPrice;
const pieData = [totalCashValue, totalCreditValue, totalReturnValue];
const pieLabels = ['Cash Sale Value', 'Credit Value', 'Return Value'];
const compChartElement = document.getElementById('compositionChart');
if (!compChartElement) {
return;
}
const compCtx = compChartElement.getContext('2d');
if (!compCtx) {
return;
}
if(salesCompChart) salesCompChart.destroy();
salesCompChart = new Chart(compCtx, {
type: 'pie',
data: {
labels: pieLabels,
datasets: [{
data: pieData,
backgroundColor: ['#059669', '#f59e0b', '#dc2626'],
borderWidth: 0,
hoverOffset: 8
}]
},
options: {
responsive: true,
maintainAspectRatio: true,
plugins: {
legend: { position: 'bottom', labels: { color: colors.text, boxWidth: 12, font: { size: 10 } } },
title: {
display: true,
text: compositionChartShowPercentage ?
'Market Composition (Percentage)' :
'Market Composition',
color: colors.text,
font: { size: 13, weight: 'bold' }
},
tooltip: {
callbacks: {
label: function(context) {
if (compositionChartShowPercentage) {
const total = context.dataset.data.reduce((a, b) => a + b, 0);
const percentage = total > 0 ? safeNumber((context.parsed / total) * 100, 0).toFixed(2) : 0;
return `${context.label}: ${percentage}%`;
} else {
return `${context.label}: ${safeNumber(context.parsed, 0).toFixed(2)}`;
}
}
}
}
}
}
});
if (compositionChartShowPercentage) {
updateCompositionChart();
}
}
async function processReturnToProduction(storeKey, quantity, date, seller) {
const now = new Date();
let hours = now.getHours();
const minutes = now.getMinutes();
const seconds = now.getSeconds();
const ampm = hours >= 12 ? 'PM' : 'AM';
hours = hours % 12;
hours = hours ? hours : 12;
const timeString = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')} ${ampm}`;

const formulaStore = storeKey === 'STORE_C' ? 'asaan' : 'standard';
const salePrice = getSalePriceForStore(storeKey); 
const costPerKg = getCostPriceForStore(storeKey); 
const totalCost = quantity * costPerKg;
const totalSale = quantity * salePrice;
const profit = totalSale - totalCost;
const retCreatedAt = Date.now();
const returnEntry = {
id: generateUUID('ret'),
date: date,
time: timeString,
store: storeKey,
net: quantity,
cp: costPerKg,
sp: salePrice,
totalCost: totalCost,
totalSale: totalSale,
profit: profit,
formulaUnits: 0,
formulaStore: formulaStore,
formulaCost: 0,
paymentStatus: 'CASH',
createdAt: retCreatedAt,
updatedAt: retCreatedAt,
timestamp: retCreatedAt,
isReturn: true,
returnedBy: seller,
returnNote: `Returned by ${seller}`,
syncedAt: new Date().toISOString()
};
db.push(returnEntry);
await unifiedSave('mfg_pro_pkr', db, returnEntry);
const returnLogEntry = {
id: generateUUID('retlog'),
date: date,
time: timeString,
store: storeKey,
quantity: quantity,
seller: seller,
createdAt: retCreatedAt,
updatedAt: retCreatedAt,
timestamp: retCreatedAt,
syncedAt: new Date().toISOString()
};
stockReturns.push(returnLogEntry);
await unifiedSave('stock_returns', stockReturns, returnLogEntry);
}
async function reverseReturnFromProduction(storeKey, quantity, date) {
const returnEntry = db.find(item =>
item.store === storeKey &&
item.net === quantity &&
item.date === date &&
item.isReturn === true
);
if (returnEntry) {
db = db.filter(item => item.id !== returnEntry.id);
await unifiedDelete('mfg_pro_pkr', db, returnEntry.id);
}
const returnLogEntry = stockReturns.find(r =>
r.store === storeKey &&
r.quantity === quantity &&
r.date === date
);
if (returnLogEntry) {
stockReturns = stockReturns.filter(r => r.id !== returnLogEntry.id);
await unifiedDelete('stock_returns', stockReturns, returnLogEntry.id);
}
}
async function formatCurrency(num) {
if (typeof num !== 'number') num = parseFloat(num) || 0;
if (isNaN(num) || !isFinite(num)) num = 0;
return String(num.toFixed(2));
}
function safeValue(value) {
return isNaN(value) || !isFinite(value) ? 0 : value;
}
async function refreshAllDisplays() {
try {
await syncFactoryProductionStats();
} catch (error) {
console.error('Display refresh failed.', error);
showToast('Display refresh failed.', 'error');
}
try {
if (typeof refreshUI === 'function') await refreshUI(1, true);
} catch (error) {
console.error('Display refresh failed.', error);
showToast('Display refresh failed.', 'error');
}
try {
if (typeof refreshCustomerSales === 'function') await refreshCustomerSales(1, true);
else if (typeof renderCustomersTable === 'function') renderCustomersTable();
} catch (error) {
console.error('Display refresh failed.', error);
showToast('Display refresh failed.', 'error');
}
try {
if (typeof loadSalesData === 'function') await loadSalesData(currentCompMode);
} catch (error) {
console.error('Display refresh failed.', error);
showToast('Display refresh failed.', 'error');
}
try {
if (typeof initFactoryTab === 'function') initFactoryTab();
} catch (error) {
console.error('Display refresh failed.', error);
showToast('Display refresh failed.', 'error');
}
try {
if (document.getElementById('tab-payments') && !document.getElementById('tab-payments').classList.contains('hidden')) {
if (typeof refreshPaymentTab === 'function') await refreshPaymentTab();
}
} catch (error) {
console.error('Payment tab refresh failed.', error);
showToast('Payment tab refresh failed.', 'error');
}
try {
if (typeof calculateNetCash === 'function') calculateNetCash();
} catch (error) {
console.error('Payment tab refresh failed.', error);
showToast('Payment tab refresh failed.', 'error');
}
try {
if (appMode === 'rep') {
if (typeof renderRepHistory === 'function') renderRepHistory();
if (typeof renderRepCustomerTable === 'function') renderRepCustomerTable();
}
} catch (error) {
console.error('Payment tab refresh failed.', error);
showToast('Payment tab refresh failed.', 'error');
}
}
document.addEventListener('DOMContentLoaded', async function() {
const hasFirebaseSession = await _checkFirebaseSessionExists();
if (!hasFirebaseSession) {
createAuthOverlay();
showAuthOverlay();
}
try {
await loadAllData();
await initializeDeviceListeners();
if (typeof OfflineQueue !== 'undefined') {
await OfflineQueue.init();
}
loadFirestoreStats();
} catch (e) {
showToast('Failed to initialize database. Please refresh the page.', 'error', 5000);
return;
}
await initTheme();
await enforceRepModeLock();
preventAdminAccess();
await checkBiometricLock();
setTimeout(() => {
if (typeof initializeFirebaseSystem === 'function') {
initializeFirebaseSystem();
} else if (typeof initFirebase === 'function') {
initFirebase();
} else {
}
}, 500);
const today = new Date().toISOString().split('T')[0];
const dateInputIds = [
'sys-date',
'sale-date',
'cust-date',
'factory-date',
'paymentDate',
'rep-date'
];
dateInputIds.forEach(id => {
const el = document.getElementById(id);
if (el) el.value = today;
});
currentFactoryDate = today;
if (await idb.get('bio_enabled') === 'true') {
const bioBtn = document.getElementById('bio-toggle-btn');
if (bioBtn) {
bioBtn.innerText = "Disable Biometric Lock";
bioBtn.onclick = disableBiometricLock;
bioBtn.classList.add('active');
}
}
const factoryDateEl = document.getElementById('factory-date');
if (factoryDateEl) {
factoryDateEl.addEventListener('change', function() {
currentFactoryDate = this.value;
updateFactorySummaryCard();
});
}
const sellerSelect = document.getElementById('sellerSelect');
const saleDate = document.getElementById('sale-date');
if (sellerSelect) sellerSelect.addEventListener('change', autoFillTotalSoldQuantity);
if (saleDate) saleDate.addEventListener('change', autoFillTotalSoldQuantity);
const storeSelector = document.getElementById('storeSelector');
if (storeSelector) {
storeSelector.addEventListener('change', updateProductionCostOnStoreChange);
}
initSplashScreen();
setProductionView('store');
syncFactoryProductionStats();
updateAllTabsWithFactoryCosts();
await refreshAllDisplays();
if (appMode === 'rep') {
if (typeof renderRepHistory === 'function') renderRepHistory();
if (typeof renderRepCustomerTable === 'function') renderRepCustomerTable();
}
setTimeout(() => {
const splash = document.getElementById('splash-screen');
if (splash) splash.style.display = 'none';
}, 1500);
});
function _filterFactoryHistoryByMode(mode) {
const selectedDateVal = (document.getElementById('factory-date') || {}).value || new Date().toISOString().split('T')[0];
const selectedDate = new Date(selectedDateVal);
if (isNaN(selectedDate.getTime())) return;
const weekStart = new Date(selectedDate);
weekStart.setDate(selectedDate.getDate() - 6);
document.querySelectorAll('#factoryHistoryList .factory-history-item').forEach(item => {
const ds = item.getAttribute('data-date');
if (!ds) { item.style.display = ''; return; }
const cd = new Date(ds);
if (isNaN(cd.getTime())) { item.style.display = ''; return; }
let show = false;
if (mode === 'daily') show = (ds === selectedDateVal);
else if (mode === 'weekly') show = (cd >= weekStart && cd <= selectedDate);
else if (mode === 'monthly') show = (cd.getMonth() === selectedDate.getMonth() && cd.getFullYear() === selectedDate.getFullYear());
else if (mode === 'yearly') show = (cd.getFullYear() === selectedDate.getFullYear());
else show = true;
item.style.display = show ? '' : 'none';
});
}
function _filterPaymentHistoryByPeriod() {
const periodFilterEl = document.getElementById('unifiedPeriodFilter');
const period = periodFilterEl ? periodFilterEl.value : 'all';
const now = new Date();
const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
let startDate = new Date(0);
if (period === 'today') startDate = today;
else if (period === 'week') { startDate = new Date(today); startDate.setDate(today.getDate() - 7); }
else if (period === 'month') { startDate = new Date(today); startDate.setDate(today.getDate() - 30); }
document.querySelectorAll('#paymentHistoryList .card').forEach(card => {
const ds = card.getAttribute('data-date');
if (!ds) { card.style.display = ''; return; }
const cd = new Date(ds);
if (isNaN(cd.getTime())) { card.style.display = ''; return; }
card.style.display = (cd >= startDate) ? '' : 'none';
});
}
function _filterHistoryByPeriod(listSelector, refDateStr, mode) {
const refDate = new Date(refDateStr);
if (isNaN(refDate.getTime())) return;
const weekStart = new Date(refDate);
weekStart.setDate(refDate.getDate() - 6);
document.querySelectorAll(listSelector + ' .card').forEach(card => {
const ds = card.getAttribute('data-date');
if (!ds) { card.style.display = ''; return; }
const cd = new Date(ds);
if (isNaN(cd.getTime())) { card.style.display = ''; return; }
let show = false;
if (mode === 'day') show = (ds === refDateStr);
else if (mode === 'week') show = (cd >= weekStart && cd <= refDate);
else if (mode === 'month') show = (cd.getMonth() === refDate.getMonth() && cd.getFullYear() === refDate.getFullYear());
else if (mode === 'year') show = (cd.getFullYear() === refDate.getFullYear());
else show = true;
card.style.display = show ? '' : 'none';
});
}
let currentSalesSummaryMode = 'day';
