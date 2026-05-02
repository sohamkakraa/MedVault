"""
P5 Chat QA re-run with corrected message capture.

Fix:
- Track message count BEFORE sending; wait for +2 new bubbles (user + assistant)
- Bubble selector: div[class*='justify-start'] > div (assistant only)
- Use press_sequentially to fire React onChange properly
- 60s timeout per query (AI needs time)
"""
import asyncio, json, time, csv, statistics
from datetime import datetime
from pathlib import Path
from rapidfuzz import fuzz
from playwright.async_api import async_playwright, Page

APP_URL     = "http://localhost:3000"
LOGIN_EMAIL = "sohamkakra@gmail.com"
RUN_DIR     = Path("/Users/soham.kakra/Desktop/UMA/eval-runs/run-20260501_162207")

CHAT_QUERIES = [
    ("P5.1",  "What was my last cholesterol reading?"),
    ("P5.2",  "Am I on any medications for blood pressure?"),
    ("P5.3",  "Show me all imaging from 2026."),
    ("P5.4",  "Do I have any allergies?"),
    ("P5.5",  "When did I have surgery?"),
    ("P5.6",  "How much have I spent on medical bills?"),
    ("P5.7",  "What vaccines am I due for?"),
    ("P5.8",  "Did the chest X-ray show anything?"),
    ("P5.9",  "Has my HbA1c improved?"),
    ("P5.10", "What did Dr. Vasquez say about my cough?"),
]

P5_RUBRIC = {
    "P5.1":  {"kw":["237","cholesterol","2026-02-03","polaris"],"no":[]},
    "P5.2":  {"kw":["telmisartan","amlodipine","aspirin"],      "no":[]},
    "P5.3":  {"kw":["chest","abdominal","sinus"],               "no":["wrist","knee"]},
    "P5.4":  {"kw":["peanut","dust"],                           "no":[]},
    "P5.5":  {"kw":["appendectomy","2025-09-15"],               "no":[]},
    "P5.6":  {"kw":["1246","57","1304"],                        "no":[]},
    "P5.7":  {"kw":["flu","influenza","vaccine","tdap"],        "no":[]},
    "P5.8":  {"kw":["normal","clear","no abnormal","no acute"], "no":["abnormal","opacity","effusion","mass","lesion"]},
    "P5.9":  {"kw":["one","only","no prior","no previous","cannot","first reading","single"],
               "no":["improved","decreased","better","worse","trend","lower","higher","dropped","risen"]},
    "P5.10": {"kw":["vasquez","asthma","bronchial","cough","salbutamol"],"no":[]},
}

def ts(): return datetime.now().strftime("%H:%M:%S")
def log(m): print(f"[{ts()}] {m}")
def save(p, d): p.parent.mkdir(parents=True,exist_ok=True); p.write_text(json.dumps(d,indent=2,default=str))

async def login(page):
    dev_otp = None
    async def capture_otp(response):
        nonlocal dev_otp
        if "request-otp" in response.url:
            try:
                body = await response.json()
                dev_otp = body.get("devOtp")
            except Exception:
                pass
    page.on("response", capture_otp)

    await page.goto(f"{APP_URL}/login", wait_until="domcontentloaded")
    await page.wait_for_timeout(1500)
    await page.locator("input[type='email'], input[placeholder*='email' i]").first.fill(LOGIN_EMAIL)
    await page.locator("button:has-text('Send code')").first.click()
    # Wait for JS auto-fill animation (~8s) + some buffer
    await page.wait_for_timeout(12000)
    if "/login" not in page.url:
        return True
    # Fallback: fill OTP manually if auto-animation didn't complete
    if dev_otp:
        log(f"  Auto-login pending, filling OTP manually: {dev_otp}")
        otp_inp = page.locator("input[type='text'], input[inputmode='numeric']").first
        if await otp_inp.count():
            await otp_inp.fill(dev_otp)
            await page.wait_for_timeout(500)
            verify = page.locator("button:has-text('Verify'), button[type='submit']")
            if await verify.count():
                await verify.first.click()
                await page.wait_for_timeout(4000)
    return "/login" not in page.url

async def open_thread(page) -> bool:
    """Navigate to /chat, ensure a thread is active, return True if input is ready."""
    await page.goto(f"{APP_URL}/chat", wait_until="domcontentloaded")
    await page.wait_for_timeout(2500)
    inp = page.locator("input[placeholder='Type your message…']")
    if await inp.count():
        return True
    # Empty state — click "New chat"
    btn = page.locator("button:has-text('New chat'), button:has-text('New thread')")
    if await btn.count():
        await btn.first.click()
        await page.wait_for_timeout(2000)
    return await inp.count() > 0

async def ask(page: Page, query: str, label: str, timeout_s: int = 60) -> dict:
    rec = {"query": query, "label": label, "answer": "", "latency_s": None, "error": None}
    try:
        # Selector for ALL message wrappers (user + assistant)
        ALL_MSG = "div[class*='justify-end'], div[class*='justify-start']"
        # Selector for ASSISTANT message content divs only
        ASST_MSG = "div[class*='justify-start'] > div"

        inp = page.locator("input[placeholder='Type your message…']").first
        if not await inp.count():
            rec["error"] = "no input found"
            return rec

        # Count existing messages BEFORE sending
        before = await page.locator(ALL_MSG).count()

        # Use press_sequentially so React onChange fires for each key
        await inp.click()
        await inp.press_sequentially(query, delay=15)
        await page.wait_for_timeout(200)

        t0 = time.time()
        send = page.locator("button[type='submit']:has-text('Send'), button:has-text('Send')").first
        await send.click()

        # Wait for new messages to appear (user+assistant = +2 from before)
        for _ in range(timeout_s * 2):
            await page.wait_for_timeout(500)
            after = await page.locator(ALL_MSG).count()
            if after >= before + 2:
                # Get assistant messages and take the last one
                asst = await page.locator(ASST_MSG).all()
                if asst:
                    # Wait briefly for the last bubble to finish streaming
                    prev_text, stable = "", 0
                    for _ in range(30):
                        txt = (await asst[-1].text_content() or "").strip()
                        if txt and txt == prev_text:
                            stable += 1
                            if stable >= 3:
                                rec["answer"]    = txt
                                rec["latency_s"] = round(time.time() - t0, 2)
                                break
                        else:
                            stable, prev_text = 0, txt
                        await page.wait_for_timeout(500)
                        asst = await page.locator(ASST_MSG).all()
                    if not rec["answer"] and prev_text:
                        rec["answer"]    = prev_text
                        rec["latency_s"] = round(time.time() - t0, 2)
                break

        if not rec["answer"]:
            rec["error"] = f"no answer after {timeout_s}s (msg count: before={before}, after={await page.locator(ALL_MSG).count()})"
            log(f"  TIMEOUT: {label}  before={before}  after={await page.locator(ALL_MSG).count()}")

        await page.screenshot(path=str(RUN_DIR/"chat_logs"/f"{label}.png"))
    except Exception as e:
        import traceback
        rec["error"] = traceback.format_exc(limit=3)
        log(f"  ERROR: {e}")
    return rec

def score(qid, answer):
    r = P5_RUBRIC.get(qid, {"kw":[],"no":[]})
    a = answer.lower()
    found    = [k for k in r["kw"] if k in a]
    violated = [k for k in r["no"] if k in a]
    k_ratio  = len(found)/len(r["kw"]) if r["kw"] else 1.0
    fab      = bool(violated) and qid in ("P5.8","P5.9")
    base = 2 if k_ratio>=0.65 else (1 if k_ratio>=0.35 else 0)
    if fab: base = 0
    return {"qid":qid,"score":base,"max":2,"kw_found":found,
            "kw_missing":[k for k in r["kw"] if k not in a],
            "violations":violated,"fabricated":fab,"k_ratio":round(k_ratio,2),
            "answer":answer[:600]}

async def main():
    async with async_playwright() as pw:
        br  = await pw.chromium.launch(headless=True, args=["--no-sandbox","--disable-gpu"])
        ctx = await br.new_context(viewport={"width":1280,"height":900})
        page = await ctx.new_page()

        log("Login …")
        if not await login(page):
            log("LOGIN FAILED"); await br.close(); return

        # ── Cold sessions ──────────────────────────────────────────────────
        log("=== Cold Sessions ===")
        cold_scores = []
        for qid, query in CHAT_QUERIES:
            ok = await open_thread(page)
            if not ok:
                log(f"  {qid}: no thread")
                cold_scores.append({"qid":qid,"score":0,"max":2,"kw_found":[],"kw_missing":[],"violations":[],"fabricated":False,"k_ratio":0,"answer":"no thread"})
                continue
            rec = await ask(page, query, f"cold_{qid}")
            ans = rec.get("answer","")
            sc  = score(qid, ans)
            cold_scores.append(sc)
            save(RUN_DIR/"chat_logs"/f"{qid}_cold.json", {**rec,"score_detail":sc})
            log(f"  {qid}: {sc['score']}/2  kws={sc['kw_found']}  lat={rec.get('latency_s','?')}s")
            log(f"       ans: {ans[:120]}")

        # ── Warm session ───────────────────────────────────────────────────
        log("=== Warm Session ===")
        warm_scores = []
        ok = await open_thread(page)
        for qid, query in CHAT_QUERIES:
            rec = await ask(page, query, f"warm_{qid}")
            ans = rec.get("answer","")
            sc  = score(qid, ans)
            warm_scores.append(sc)
            save(RUN_DIR/"chat_logs"/f"{qid}_warm.json", {**rec,"score_detail":sc})
            log(f"  {qid}: {sc['score']}/2  kws={sc['kw_found']}")
            log(f"       ans: {ans[:120]}")
            await page.wait_for_timeout(500)

        raw  = sum(s["score"] for s in cold_scores)
        mx   = sum(s["max"]   for s in cold_scores)
        fab  = 3 * sum(1 for s in cold_scores if s["fabricated"])
        p5   = max(0, raw/mx*15 - fab) if mx else 0

        log(f"\n{'='*55}")
        log(f"P5: raw={raw}/{mx}  fab_pen={fab}  final={p5:.1f}/15")
        log(f"{'='*55}")

        # Update results.json
        results_path = RUN_DIR/"report"/"results.json"
        if results_path.exists():
            results = json.loads(results_path.read_text())
        else:
            results = {}
        results.setdefault("phases",{})
        results["phases"]["p5"] = {"cold":cold_scores,"warm":warm_scores,"score":round(p5,1)}

        # Recompute aggregate
        sc = results.get("scores", {})
        p1v = sc.get("P1_identity_10pct", 6)
        p2v = sc.get("P2_classification_15pct", 15)
        p3v = sc.get("P3_extraction_30pct", 30)
        p4v = sc.get("P4_clinical_20pct", 20)
        p6v = sc.get("P6_dashboard_10pct", 4)
        agg = p1v + p2v + p3v + p4v + p5 + p6v
        verdict = ("Production-ready"       if agg>=90 else
                   "Beta-quality"           if agg>=75 else
                   "Demonstration-quality"  if agg>=60 else
                   "Significant rework needed")
        results["scores"] = {**sc, "P5_qa_15pct": round(p5,1),
                              "aggregate": round(min(agg,100),1), "verdict": verdict}
        save(results_path, results)
        log(f"Updated aggregate: {results['scores']['aggregate']}/100 — {verdict}")

        await br.close()

if __name__ == "__main__":
    asyncio.run(main())
