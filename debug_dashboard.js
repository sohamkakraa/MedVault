const { chromium } = require('./node_modules/playwright');
(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  page.on('pageerror', e => console.log('ERR:', e.message.substring(0,80)));
  await context.addCookies([{ name: 'mv_session', value: 'eyJ2IjoyLCJleHAiOjE3Nzg3NjM1OTksInN1YiI6ImRldi1wcmV2aWV3LXVzZXIiLCJlbWFpbCI6ImRldkB1bWEubG9jYWwifQ.RHF0b15-uEOuMlg0bmx7ojnLAQOm9z5liatLSH9Eopc', domain: 'localhost', path: '/' }]);
  await page.goto('http://localhost:3000/dashboard', { waitUntil: 'networkidle' });
  await page.evaluate(() => {
    const store = { docs: [], meds: [{ id: '1', name: 'Metformin', dose: '500mg', frequency: 'Twice daily', startDate: '2024-01-01', active: true }], labs: [{ name: 'HbA1c', value: '6.8', unit: '%', dateISO: '2026-03-15' }], profile: { name: 'Test User', dob: '1985-06-15', sex: 'Male', email: 'test@uma.local', primaryCareProvider: 'Dr. Smith', nextVisitDate: '2026-06-15', trends: ['HbA1c'], allergies: ['Penicillin'], conditions: ['Type 2 Diabetes'], bodyMetrics: { heightCm: 178, weightKg: 82 } }, preferences: { theme: 'dark' }, healthLogs: { bloodPressure: [{ id: '1', dateISO: '2026-03-15', systolic: 120, diastolic: 80, pulse: 70, notes: '' }], sideEffects: [{ id: '1', dateISO: '2026-03-15', symptom: 'Nausea', severity: 'mild', notes: '' }] }, updatedAtISO: new Date().toISOString() };
    localStorage.setItem('mv_patient_store_v1', JSON.stringify(store));
  });
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);
  
  // Check bento grid layout
  const info = await page.evaluate(() => {
    const grid = document.querySelector('.bento-grid');
    if (!grid) return { error: 'no grid' };
    const gridRect = grid.getBoundingClientRect();
    const gridStyle = window.getComputedStyle(grid);
    const cells = Array.from(grid.children).map((el, i) => {
      const rect = el.getBoundingClientRect();
      const style = window.getComputedStyle(el);
      const firstH = el.querySelector('h1,h2,h3,span,p')?.textContent?.trim().substring(0,30);
      return { i, top: Math.round(rect.top), left: Math.round(rect.left), w: Math.round(rect.width), h: Math.round(rect.height), gridColumn: style.gridColumn, gridRow: style.gridRow, text: firstH };
    });
    const pageH = document.body.scrollHeight;
    const scrollable = document.querySelector('.bento-page-padding');
    const scrollStyle = scrollable ? window.getComputedStyle(scrollable) : null;
    return { gridW: Math.round(gridRect.width), gridH: Math.round(gridRect.height), gridTemplateColumns: gridStyle.gridTemplateColumns, cells, pageH, scrollOverflow: scrollStyle?.overflow };
  });
  console.log(JSON.stringify(info, null, 2));
  
  const h = await page.evaluate(() => document.body.scrollHeight);
  await page.setViewportSize({ width: 1280, height: h });
  await page.waitForTimeout(300);
  await page.screenshot({ path: '/tmp/dashboard_check.png' });
  await browser.close();
})();
