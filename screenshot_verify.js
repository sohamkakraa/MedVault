const { chromium } = require('./node_modules/playwright');
(async () => {
  const browser = await chromium.launch({ headless: true });
  for (const [w, h] of [[1280, 900], [390, 3000]]) {
    const context = await browser.newContext({ viewport: { width: w, height: h } });
    const page = await context.newPage();
    await context.addCookies([{ name: 'mv_session', value: 'eyJ2IjoyLCJleHAiOjE3Nzg3NjM1OTksInN1YiI6ImRldi1wcmV2aWV3LXVzZXIiLCJlbWFpbCI6ImRldkB1bWEubG9jYWwifQ.RHF0b15-uEOuMlg0bmx7ojnLAQOm9z5liatLSH9Eopc', domain: 'localhost', path: '/' }]);
    await page.goto('http://localhost:3000/dashboard', { waitUntil: 'networkidle' });
    await page.evaluate(() => {
      const store = { docs: [], meds: [{ id: '1', name: 'Metformin', dose: '500mg', frequency: 'Twice daily', startDate: '2024-01-01', active: true }], labs: [{ name: 'HbA1c', value: '6.8', unit: '%', dateISO: '2026-03-15' }], profile: { name: 'Test User', dob: '1985-06-15', sex: 'Male', email: 'test@uma.local', primaryCareProvider: 'Dr. Smith', nextVisitDate: '2026-06-15', trends: ['HbA1c'], allergies: ['Penicillin'], conditions: ['Type 2 Diabetes'], bodyMetrics: { heightCm: 178, weightKg: 82 } }, preferences: { theme: 'dark' }, notifications: [{ id: '1', kind: 'med_reminder', title: 'Take Metformin', body: 'Your 8:00 AM dose is due', createdAtISO: new Date(Date.now() - 5*60000).toISOString(), readAtISO: null }, { id: '2', kind: 'next_visit', title: 'Upcoming appointment', body: 'You have a visit with Dr. Smith on 15 June', createdAtISO: new Date(Date.now() - 3600000).toISOString(), readAtISO: new Date().toISOString() }], updatedAtISO: new Date().toISOString() };
      localStorage.setItem('mv_patient_store_v1', JSON.stringify(store));
    });
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);
    const ph = await page.evaluate(() => document.body.scrollHeight);
    await page.setViewportSize({ width: w, height: Math.min(ph, 2500) });
    await page.waitForTimeout(300);
    await page.screenshot({ path: `/tmp/verify_${w}.png` });
    console.log(`${w}px done, pageH=${ph}`);
    await context.close();
  }
  await browser.close();
})();
