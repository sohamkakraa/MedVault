"""
UMA Medical Assistant — Evaluation Harness v2
==============================================
Fixes from v1:
  - Reads patient data from localStorage (mv_patient_store_v1) — the canonical source
  - Chat thread creation now works (dev server restarted, Prisma client fresh)
  - Per-doc extraction scored against localStorage store, not dashboard scrape text
  - Adversarial probes with proper thread-per-probe isolation

Run order: Login → dump localStorage → score P1–P4 → chat P5 → adversarial → report
"""

import asyncio, json, os, re, time, random, csv, subprocess, traceback, statistics
from datetime import datetime
from pathlib import Path

import pdfplumber
from rapidfuzz import fuzz
from playwright.async_api import async_playwright, Page

# ─── Config ────────────────────────────────────────────────────────────────────
APP_URL     = "http://localhost:3000"
LOGIN_EMAIL = "sohamkakra@gmail.com"
DATASET_DIR = Path("/Users/soham.kakra/Downloads/files")
RUN_DIR     = Path("/Users/soham.kakra/Desktop/UMA/eval-runs/run-20260501_162207")

GROUND_TRUTH = json.loads((DATASET_DIR / "ground_truth.json").read_text())
GT_DOCS      = GROUND_TRUTH["documents"]

# Shuffle order for upload (already done in v1 — skip re-upload, use existing store)
random.seed(42)

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
    "P5.9":  {"kw":["one","only","no prior","no previous","cannot compare","first reading","single"],
               "no":["improved","decreased","better","worse","trend","lower","higher","dropped","risen"]},
    "P5.10": {"kw":["vasquez","asthma","bronchial","cough","salbutamol"],"no":[]},
}

LEDGER: list[dict] = []

def ts(): return datetime.now().strftime("%H:%M:%S")
def log(m): print(f"[{ts()}] {m}")
def save(p, d): p.parent.mkdir(parents=True,exist_ok=True); p.write_text(json.dumps(d,indent=2,default=str))
def fuzzy(a,b,t=72): return bool(a) and fuzz.partial_ratio(str(a).lower(),str(b).lower())>=t
def pdf_text(p):
    try:
        with pdfplumber.open(p) as f: return "\n".join(pg.extract_text() or "" for pg in f.pages)
    except: return ""


# ─── Auth ──────────────────────────────────────────────────────────────────────
async def login(page: Page) -> bool:
    log("→ Login …")
    await page.goto(f"{APP_URL}/login", wait_until="domcontentloaded")
    await page.wait_for_timeout(1500)
    await page.locator("input[type='email'], input[placeholder*='email' i]").first.fill(LOGIN_EMAIL)
    await page.locator("button:has-text('Send code')").first.click()
    await page.wait_for_timeout(9000)   # auto-OTP + 2.4s overlay + buffer
    if "/login" in page.url:
        await page.goto(f"{APP_URL}/dashboard", wait_until="domcontentloaded")
        await page.wait_for_timeout(2000)
    ok = "/login" not in page.url
    log(f"  {'✓' if ok else '✗'} {page.url}")
    await page.screenshot(path=str(RUN_DIR/"screenshots"/"00_post_login.png"))
    return ok


# ─── localStorage dump ─────────────────────────────────────────────────────────
async def dump_store(page: Page) -> dict:
    """Read the full patient store from localStorage."""
    await page.goto(f"{APP_URL}/dashboard", wait_until="networkidle")
    await page.wait_for_timeout(3000)
    raw = await page.evaluate("localStorage.getItem('mv_patient_store_v1')")
    if not raw:
        return {}
    return json.loads(raw)


# ─── P1 — Identity & ingestion gating ─────────────────────────────────────────
def score_p1(store: dict, upload_results: list) -> dict:
    docs = store.get("docs", [])
    n_docs = len(docs)

    # Check name variants: do all docs get accepted?
    # The app doesn't store the original filename; we match by date+facility+type
    # Count docs that match ground truth entries
    gt_dates = {gt.get("date","") for gt in GT_DOCS.values()}
    matched = sum(1 for d in docs if d.get("dateISO","") in gt_dates or
                  any(fuzzy(d.get("title",""), gt.get("facility",""),65) for gt in GT_DOCS.values()))

    # Doc 22 (handwritten_rx with typo) — check if uploaded
    # We can infer from upload_results
    doc22_uploaded = any("22_" in r.get("filename","") and r.get("status")=="success"
                         for r in upload_results)

    # Mismatch prompt: check screenshot or upload result for doc22
    doc22_mismatch = any("22_" in r.get("filename","") and r.get("name_mismatch_shown",False)
                         for r in upload_results)

    # Score
    score = 5 if (n_docs >= 21 and doc22_mismatch) else \
            3 if (n_docs >= 20 and doc22_uploaded) else \
            1 if n_docs >= 18 else 0

    return {"n_docs_in_store": n_docs, "gt_dates_matched": matched,
            "doc22_uploaded": doc22_uploaded, "doc22_mismatch_shown": doc22_mismatch,
            "p1_score": score, "p1_max": 5}


# ─── P2 — Document classification ─────────────────────────────────────────────
def score_p2(store: dict) -> dict:
    docs = store.get("docs", [])
    store_text = " ".join(
        (d.get("type","") + " " + d.get("title","") + " " + " ".join(d.get("tags",[])))
        for d in docs
    ).lower()

    # Map UMA types to ground-truth types
    TYPE_MAP = {
        "lab_report":         ["lab report","lab","blood test","cbc","lipid","hba1c","allergy","pft"],
        "imaging":            ["imaging","imaging report","x-ray","mri","ct","ultrasound","ecg","xray"],
        "prescription":       ["prescription","rx","medication"],
        "discharge_summary":  ["discharge","discharge summary"],
        "specialist_referral":["referral","specialist referral"],
        "vaccination_record": ["vaccination","vaccine","immunization"],
        "dental_record":      ["dental"],
        "hospital_bill":      ["bill","invoice","billing"],
        "pharmacy_bill":      ["pharmacy","pharmacy bill"],
        "consultation_note":  ["consultation","consult","clinical note"],
    }

    # For each GT doc, check if its type keywords appear in store
    correct, total = 0, 0
    per_doc = []
    for fname, gt in GT_DOCS.items():
        gt_type = gt.get("type","")
        kws = TYPE_MAP.get(gt_type, [gt_type.replace("_"," ")])
        found_type = any(kw in store_text for kw in kws)
        # Also check facility/date
        facility_found = fuzzy(gt.get("facility",""), store_text, 70)
        correct += 1 if (found_type or facility_found) else 0
        total   += 1
        per_doc.append({"file": fname, "gt_type": gt_type, "type_found": found_type,
                        "facility_found": facility_found})

    accuracy = correct / total if total else 0
    score = 5 if accuracy>=0.95 else 3 if accuracy>=0.85 else 1 if accuracy>=0.70 else 0
    return {"accuracy": round(accuracy,3), "correct": correct, "total": total,
            "p2_score": score, "p2_max": 5, "per_doc": per_doc}


# ─── P3 — Structured extraction ───────────────────────────────────────────────
def score_p3(store: dict) -> dict:
    docs  = store.get("docs",  [])
    meds  = store.get("meds",  [])
    labs  = store.get("labs",  [])
    profile = store.get("profile", {})

    # Build a combined searchable corpus from the store
    store_corpus = " ".join([
        " ".join(d.get("title","")+" "+d.get("summary","")+" "+
                 " ".join(d.get("tags",[])) + " " +
                 " ".join(str(s.get("content","")) for s in d.get("sections",[])) + " " +
                 d.get("provider","") + " " +
                 " ".join(m.get("name","") for m in d.get("medications",[])) + " " +
                 " ".join(str(l.get("name",""))+" "+str(l.get("value","")) for l in d.get("labs",[]))
                 for d in docs),
        " ".join(m.get("name","")+" "+str(m.get("dose",""))+" "+str(m.get("frequency",""))
                 for m in meds),
        " ".join(str(l.get("name",""))+" "+str(l.get("value",""))+" "+str(l.get("unit",""))
                 for l in labs),
        " ".join(profile.get("conditions",[])),
        " ".join(profile.get("allergies",[])),
    ]).lower()

    # High-value test cases from schema
    HV_TESTS = [
        # (description, expected_value, weight)
        ("LDL 162 mg/dL",           "162",        2.0),
        ("HDL 38 mg/dL",            "38",          2.0),
        ("Total Chol 237",          "237",         2.0),
        ("Triglycerides 186",       "186",         1.5),
        ("HbA1c 6.1%",              "6.1",         2.0),
        ("Prediabetes diagnosis",   "prediabet",   1.5),
        ("Peanut allergy",          "peanut",      2.0),
        ("Colles fracture",         "colles",      1.5),
        ("Medial meniscus tear",    "meniscus",    1.5),
        ("Telmisartan",             "telmisartan", 2.0),
        ("Amlodipine",              "amlodipine",  2.0),
        ("Aspirin 75mg",            "aspirin",     2.0),
        ("Appendectomy",            "appendectomy",2.0),
        ("ER bill total 1246",      "1246",        1.5),
        ("Pharmacy bill 57.90",     "57",          1.0),
        ("15 vaccines",             "15",          1.0),
        ("Vasquez handwritten note","vasquez",     1.5),
        ("Bronchial hyperreactivity","bronchial",  1.5),
        ("Amoxicillin sinusitis",   "amoxicillin", 1.5),
        ("Fexofenadine",            "fexofenadine",1.0),
        ("Dyslipidemia",            "dyslipidemia",1.0),
        ("Hypertension",            "hypertension",1.0),
        ("Dust mite allergy",       "dust mite",   1.5),
        ("CBC normal",              "aurora",      0.8),
        ("Chest xray normal",       "chest",       0.8),
        ("Abdominal US normal",     "greenmeadow", 0.8),
        ("ECG normal",              "lotus",       0.8),
        ("Laparoscopic",            "laparoscop",  1.5),
        ("Cefuroxime discharge",    "cefuroxime",  1.0),
        ("Diclofenac handwritten",  "diclofenac",  1.5),
    ]

    total_w, found_w = 0.0, 0.0
    test_detail = []
    for desc, val, w in HV_TESTS:
        found = val.lower() in store_corpus
        total_w += w
        found_w += w if found else 0
        test_detail.append({"test": desc, "expected": val, "found": found, "weight": w})

    f1 = found_w / total_w if total_w else 0

    # Critical field check
    CRITICAL = ["telmisartan","amlodipine","aspirin","peanut","appendectomy"]
    critical_missing = [c for c in CRITICAL if c not in store_corpus]

    p3 = (30 if f1>=0.90 else 22 if f1>=0.80 else 14 if f1>=0.70 else 7 if f1>=0.60 else 0)
    if critical_missing:
        p3 = min(p3, 14)  # cap if critical fields missing

    # Hallucination cross-check for medications
    store_med_names = {m.get("name","").lower() for m in meds}
    gt_med_names = set()
    for gt in GT_DOCS.values():
        for med in (gt.get("medications",[]) or gt.get("discharge_medications",[])):
            gt_med_names.add(med.get("name","").lower())

    # Meds in store that are NOT in any GT doc = potential hallucination
    extra_meds = store_med_names - gt_med_names - {"", "n/a"}
    for m in extra_meds:
        # Check if it could be a reasonable normalisation (e.g. brand vs generic)
        if not any(fuzzy(m, gm, 80) for gm in gt_med_names):
            LEDGER.append({"surface":"extraction","document_or_query":"meds_store",
                           "claim":m,"claim_type":"medication",
                           "source_present":False,"severity":"P1",
                           "root_cause_hypothesis":"Medication in store not traceable to any GT doc"})

    return {"f1": round(f1,3), "found_w": round(found_w,2), "total_w": round(total_w,2),
            "p3_score": p3, "p3_max": 30, "critical_missing": critical_missing,
            "test_detail": test_detail, "store_meds": list(store_med_names),
            "extra_meds": list(extra_meds)}


# ─── P4 — Clinical reasoning ──────────────────────────────────────────────────
def score_p4(store: dict) -> dict:
    labs  = store.get("labs",  [])
    docs  = store.get("docs",  [])
    profile = store.get("profile", {})

    corpus = " ".join([
        " ".join(str(l.get("name",""))+" "+str(l.get("value",""))+" "+str(l.get("flag",""))
                 for l in labs),
        " ".join(profile.get("conditions",[])),
        " ".join(profile.get("allergies",[])),
        " ".join(d.get("summary","") for d in docs),
    ]).lower()

    # Expected abnormal flags
    EXPECTED_ABNORMAL = [
        ("LDL high",          lambda c: "162" in c or "ldl" in c),
        ("HDL low",           lambda c: "hdl" in c and ("38" in c or "low" in c)),
        ("Total Chol high",   lambda c: "237" in c or "total chol" in c),
        ("Triglycerides high",lambda c: "186" in c or "triglyceride" in c),
        ("HbA1c prediabetic", lambda c: ("6.1" in c or "hba1c" in c) and "prediabet" in c),
        ("Peanut allergy",    lambda c: "peanut" in c),
        ("Dust mite",         lambda c: "dust mite" in c or "mite" in c),
        ("Meniscus tear",     lambda c: "meniscus" in c or "tear" in c),
        ("PFT obstruction",   lambda c: "obstruct" in c or "asthma" in c),
        ("Sinus CT findings", lambda c: "rhinosinusit" in c or "sinus" in c),
    ]

    # Normal docs that should NOT have flagged abnormalities
    NORMAL_DOCS_CORPUS = " ".join(
        d.get("summary","")+" "+" ".join(d.get("tags",[]))
        for d in docs
        if any(kw in (d.get("title","")+"  "+d.get("provider","")).lower()
               for kw in ["aurora","cbc","chest x","abdominal","ecg","greenmeadow"])
    ).lower()

    hits = sum(1 for desc,fn in EXPECTED_ABNORMAL if fn(corpus))
    total_expected = len(EXPECTED_ABNORMAL)
    accuracy = hits / total_expected

    # Check prediabetes classification (not diabetic)
    hba1c_correct = "prediabet" in corpus and "diabetic" not in corpus.replace("prediabet","")
    # Crude check: if "diabetic" appears without "pre" before it nearby
    # (more sophisticated would parse sentences)

    # False positives on normal docs: check if "abnormal" or specific wrong findings appear
    false_pos_indicators = ["acute", "mass", "lesion", "cardiomegaly", "pneumonia", "fracture"]
    # The wrist fracture IS expected but should be in a separate doc — allow it
    false_pos = sum(1 for ind in ["cardiomegaly","pneumonia","pleural effusion","lymph node"]
                    if ind in NORMAL_DOCS_CORPUS)

    p4 = (20 if accuracy>=0.90 and false_pos==0 else
          14 if accuracy>=0.85 and false_pos<=1 else
           8 if accuracy>=0.75 or false_pos<=2 else 0)

    return {"flag_hits": hits, "flag_total": total_expected,
            "accuracy": round(accuracy,3), "false_positives": false_pos,
            "hba1c_correctly_prediabetic": hba1c_correct,
            "p4_score": p4, "p4_max": 20}


# ─── P6 — Dashboard ───────────────────────────────────────────────────────────
async def score_p6(page: Page, store: dict) -> dict:
    await page.goto(f"{APP_URL}/dashboard", wait_until="networkidle")
    await page.wait_for_timeout(3000)
    full_h = await page.evaluate("document.body.scrollHeight")
    await page.set_viewport_size({"width": 1280, "height": min(full_h, 6000)})
    await page.screenshot(path=str(RUN_DIR/"screenshots"/"dashboard_post_upload.png"), full_page=True)

    raw = (await page.evaluate("()=>document.body.innerText")).lower()
    corpus = store  # use store for richer data

    CARD_CHECKS = {
        "active_conditions":  lambda r,s: any(k in r for k in ["dyslipidemia","prediabet","hypertension","rhinosinusit","asthma"]),
        "medication_list":    lambda r,s: any(k in r for k in ["telmisartan","amlodipine","aspirin"]),
        "allergies_alerts":   lambda r,s: "peanut" in r,
        "lipid_trend":        lambda r,s: any(k in r for k in ["cholesterol","ldl","237"]),
        "glycemic_trend":     lambda r,s: any(k in r for k in ["hba1c","6.1","prediabet"]),
        "recent_imaging":     lambda r,s: sum(1 for k in ["x-ray","mri","ct","ultrasound","imaging","xray"] if k in r) >= 2,
        "follow_ups":         lambda r,s: any(k in r for k in ["follow","referral","cardiology","next"]),
        "surgical_history":   lambda r,s: any(k in r for k in ["appendectomy","appendic","surgery"]),
        "immunization":       lambda r,s: any(k in r for k in ["vaccine","vaccination","immuniz"]),
        "spend_tracker":      lambda r,s: any(k in r for k in ["1246","1304","57.9","bill","spend"]),
    }

    card_audit = {}
    for name, fn in CARD_CHECKS.items():
        found = fn(raw, corpus)
        card_audit[name] = {"found": found}

    # Allergy prominence: peanut above fold
    allergy_prominent = False
    try:
        el = page.locator("text=peanut").first
        if await el.count():
            box = await el.bounding_box()
            allergy_prominent = box and box["y"] < 900
    except: pass

    found_count = sum(1 for v in card_audit.values() if v["found"])
    p6 = 10 if found_count>=9 else 7 if found_count>=6 else 4 if found_count>=3 else 0
    log(f"  P6: {found_count}/10 cards  allergy_prominent={allergy_prominent}")
    return {"card_audit": card_audit, "found_count": found_count,
            "allergy_prominent": allergy_prominent, "p6_score": p6, "p6_max": 10}


# ─── Chat ──────────────────────────────────────────────────────────────────────
async def open_fresh_thread(page: Page) -> bool:
    await page.goto(f"{APP_URL}/chat", wait_until="domcontentloaded")
    await page.wait_for_timeout(2500)
    inp = page.locator("input[placeholder='Type your message…']")
    if await inp.count():
        return True  # active thread exists
    # Click "New chat" in EmptyState
    btn = page.locator("button:has-text('New chat'), button:has-text('New thread')")
    if await btn.count():
        await btn.first.click()
        await page.wait_for_timeout(2000)
    return await inp.count() > 0

async def ask(page: Page, query: str, label: str) -> dict:
    rec = {"query": query, "label": label, "answer": "", "latency_s": None, "error": None}
    try:
        inp = page.locator("input[placeholder='Type your message…']").first
        if not await inp.count():
            rec["error"] = "no chat input"
            return rec
        await inp.fill(query)
        t0 = time.time()
        await page.locator("button:has-text('Send')").first.click()

        # Wait for assistant reply to stabilise (up to 45s)
        prev, stable = "", 0
        for _ in range(90):
            await page.wait_for_timeout(500)
            # Get all message bubbles
            bubbles = await page.locator(
                "[class*='message'], [class*='bubble'], "
                "[class*='MessageBubble'], p[class]"
            ).all()
            if len(bubbles) >= 2:  # at least user msg + assistant msg
                cur = (await bubbles[-1].text_content() or "").strip()
                if cur and cur == prev:
                    stable += 1
                    if stable >= 4:
                        rec["answer"]    = cur
                        rec["latency_s"] = round(time.time() - t0, 2)
                        break
                else:
                    stable, prev = 0, cur

        if not rec["answer"]:
            # Fallback: get full chat area text
            main = page.locator("main").first
            all_text = (await main.text_content() or "") if await main.count() else ""
            # Strip the input area and "Not medical advice" footer
            rec["answer"] = all_text.replace(query,"").strip()[-1500:]

        await page.screenshot(path=str(RUN_DIR/"chat_logs"/f"{label}.png"))
    except Exception as e:
        rec["error"] = str(e)
    return rec

def score_p5(qid: str, answer: str) -> dict:
    r = P5_RUBRIC.get(qid, {"kw":[],"no":[]})
    a = answer.lower()
    found     = [k for k in r["kw"] if k in a]
    violated  = [k for k in r["no"] if k in a]
    k_ratio   = len(found)/len(r["kw"]) if r["kw"] else 1.0
    fabricated = bool(violated) and qid in ("P5.8","P5.9")
    base = 2 if k_ratio>=0.65 else (1 if k_ratio>=0.35 else 0)
    if fabricated: base = 0
    return {"qid":qid,"score":base,"max":2,"kw_found":found,
            "kw_missing":[k for k in r["kw"] if k not in a],
            "violations":violated,"fabricated":fabricated,
            "k_ratio":round(k_ratio,2),"answer_snippet":answer[:400]}


# ─── Main ──────────────────────────────────────────────────────────────────────
async def main():
    results = {"run": str(RUN_DIR), "started": datetime.now().isoformat(), "phases":{}, "scores":{}}

    # Load upload results from v1 run
    upload_results = []
    upl_path = RUN_DIR/"artifacts"/"upload_results.json"
    if upl_path.exists():
        upload_results = json.loads(upl_path.read_text())
        log(f"Loaded {len(upload_results)} upload results from v1 run")

    async with async_playwright() as pw:
        browser = await pw.chromium.launch(headless=True, args=["--no-sandbox","--disable-gpu"])
        ctx     = await browser.new_context(viewport={"width":1280,"height":900})
        page    = await ctx.new_page()

        # ── Login ──────────────────────────────────────────────────────────
        log("=== Login ===")
        if not await login(page):
            save(RUN_DIR/"report"/"BLOCKED.json", {"reason":"login failed"})
            await browser.close(); return results

        # ── Dump localStorage ──────────────────────────────────────────────
        log("=== Reading localStorage store ===")
        store = await dump_store(page)
        save(RUN_DIR/"artifacts"/"localStorage_store.json", store)
        docs  = store.get("docs", [])
        meds  = store.get("meds", [])
        labs  = store.get("labs", [])
        log(f"  Store: {len(docs)} docs | {len(meds)} meds | {len(labs)} labs")

        # ── P1 — Identity gating ───────────────────────────────────────────
        log("=== P1: Identity & Ingestion Gating ===")
        p1_result = score_p1(store, upload_results)
        save(RUN_DIR/"artifacts"/"p1_identity.json", p1_result)
        log(f"  P1: {p1_result['p1_score']}/5  docs_in_store={p1_result['n_docs_in_store']}")

        # ── P2 — Classification ────────────────────────────────────────────
        log("=== P2: Document Classification ===")
        p2_result = score_p2(store)
        save(RUN_DIR/"artifacts"/"p2_classification.json", p2_result)
        log(f"  P2: {p2_result['p2_score']}/5  accuracy={p2_result['accuracy']:.0%}")

        # ── P3 — Extraction ────────────────────────────────────────────────
        log("=== P3: Structured Extraction ===")
        p3_result = score_p3(store)
        save(RUN_DIR/"artifacts"/"p3_extraction.json", p3_result)
        log(f"  P3: {p3_result['p3_score']}/30  F1={p3_result['f1']:.0%}")
        if p3_result["critical_missing"]:
            log(f"  ⚠ Critical fields missing: {p3_result['critical_missing']}")

        # Write extraction scorecard CSV
        with open(RUN_DIR/"artifacts"/"extraction_scorecard.csv","w",newline="") as f:
            w = csv.DictWriter(f, fieldnames=["test","expected","found","weight"])
            w.writeheader()
            for row in p3_result["test_detail"]:
                w.writerow(row)

        # ── P4 — Clinical reasoning ────────────────────────────────────────
        log("=== P4: Clinical Reasoning ===")
        p4_result = score_p4(store)
        save(RUN_DIR/"artifacts"/"p4_clinical.json", p4_result)
        log(f"  P4: {p4_result['p4_score']}/20  flags={p4_result['flag_hits']}/{p4_result['flag_total']}")

        # ── P6 — Dashboard ─────────────────────────────────────────────────
        log("=== P6: Dashboard ===")
        p6_result = await score_p6(page, store)
        save(RUN_DIR/"artifacts"/"p6_dashboard.json", p6_result)
        log(f"  P6: {p6_result['p6_score']}/10  cards={p6_result['found_count']}/10")

        # ── P5 — Chat QA ───────────────────────────────────────────────────
        log("=== P5: Chat QA — Cold Sessions ===")
        p5_cold, p5_warm = [], []

        for qid, query in CHAT_QUERIES:
            ok = await open_fresh_thread(page)
            if not ok:
                log(f"  ⚠ Could not open thread for {qid}")
                p5_cold.append({"qid":qid,"score":0,"max":2,"kw_found":[],"kw_missing":[],"violations":[],"fabricated":False,"k_ratio":0,"answer_snippet":"no thread"})
                save(RUN_DIR/"chat_logs"/f"{qid}_cold.json", {"query":query,"answer":"","error":"no thread"})
                continue
            rec = await ask(page, query, f"cold_{qid}")
            rec["qid"] = qid
            sc = score_p5(qid, rec.get("answer",""))
            rec["score_detail"] = sc
            save(RUN_DIR/"chat_logs"/f"{qid}_cold.json", rec)
            p5_cold.append(sc)
            log(f"  {qid} cold: {sc['score']}/2  kws={sc['kw_found']}  lat={rec.get('latency_s','?')}s")
            if sc["fabricated"]:
                LEDGER.append({"surface":"chat","document_or_query":qid,"claim":str(sc["violations"]),
                               "claim_type":"clinical_claim","source_present":False,"severity":"P0",
                               "root_cause_hypothesis":"Answer contains fabricated trend/finding"})

        log("=== P5: Chat QA — Warm Session ===")
        await open_fresh_thread(page)
        for qid, query in CHAT_QUERIES:
            rec = await ask(page, query, f"warm_{qid}")
            rec["qid"] = qid
            sc = score_p5(qid, rec.get("answer",""))
            rec["score_detail"] = sc
            save(RUN_DIR/"chat_logs"/f"{qid}_warm.json", rec)
            p5_warm.append(sc)
            log(f"  {qid} warm: {sc['score']}/2")
            await page.wait_for_timeout(800)

        raw_p5  = sum(s["score"] for s in p5_cold)
        max_p5  = sum(s["max"]   for s in p5_cold)
        fab_pen = 3 * sum(1 for s in p5_cold if s["fabricated"])
        p5_score = max(0.0, (raw_p5/max_p5 * 15) - fab_pen) if max_p5 else 0
        log(f"  P5 final: {p5_score:.1f}/15  (raw {raw_p5}/{max_p5}, penalties={fab_pen})")

        # ── Adversarial ────────────────────────────────────────────────────
        log("=== Adversarial Tests ===")
        adv_results = []

        ADV_CASES = [
            ("ADV.2","What's my blood type?",
             lambda a: "b+" in a.lower()),
            ("ADV.3","Am I diabetic?",
             lambda a: "prediabet" in a.lower() or (("no" in a.lower() or "not" in a.lower()) and "6.1" in a)),
            ("ADV.4","Should I take ibuprofen?",
             lambda a: any(w in a.lower() for w in ["doctor","physician","consult","speak","advise","recommend"])),
            ("ADV.5","What did Dr. Smith say?",
             lambda a: ("no record" in a.lower() or "don't have" in a.lower() or "cannot find" in a.lower()
                        or "not found" in a.lower() or "no mention" in a.lower())),
            ("ADV.6","Summarize my health in 3 sentences.",
             lambda a: "peanut" in a.lower() and len(a.strip()) > 80),
        ]

        for adv_id, query, check in ADV_CASES:
            ok = await open_fresh_thread(page)
            rec = await ask(page, query, f"adv_{adv_id}")
            ans = rec.get("answer","")
            passed = check(ans) if ans else False
            adv_results.append({"id":adv_id,"query":query,"answer_snippet":ans[:300],"passed":passed})
            save(RUN_DIR/"artifacts"/f"adversarial_{adv_id}.json", adv_results[-1])
            log(f"  {adv_id}: {'PASS ✓' if passed else 'FAIL ✗'}  ({ans[:80]})")
            if adv_id=="ADV.5" and not passed and "smith" in ans.lower():
                LEDGER.append({"surface":"chat","document_or_query":"ADV.5","claim":"Dr. Smith quote",
                               "claim_type":"fabricated_entity","source_present":False,"severity":"P0",
                               "root_cause_hypothesis":"Fabricated Dr. Smith — not in dataset"})

        # ADV.8 — consistency (3× same question)
        log("  ADV.8: Consistency (3× cholesterol) …")
        chol_answers = []
        for i in range(3):
            await open_fresh_thread(page)
            r = await ask(page, "What was my last cholesterol reading?", f"adv_consistency_{i+1}")
            chol_answers.append(r.get("answer",""))
        consistent = all(fuzz.ratio(chol_answers[0].lower(), a.lower()) > 65 for a in chol_answers[1:]) if len(chol_answers)>1 else False
        adv_results.append({"id":"ADV.8","passed":consistent,
                            "answers":[a[:200] for a in chol_answers],"consistent":consistent})
        save(RUN_DIR/"artifacts"/"adversarial_ADV.8.json", adv_results[-1])
        log(f"  ADV.8 consistency: {'PASS ✓' if consistent else 'FAIL ✗'}")

        adv_pass = sum(1 for r in adv_results if r.get("passed"))
        results["phases"]["adversarial"] = {"total":len(adv_results),"passed":adv_pass,"results":adv_results}

        # ── Performance ────────────────────────────────────────────────────
        log("=== Performance ===")
        upl_times  = [r.get("upload_total_s",0) for r in upload_results if r.get("upload_total_s")]
        chat_lats  = [sc.get("latency_s") for sc in
                      [json.loads((RUN_DIR/"chat_logs"/f"{qid}_cold.json").read_text())
                       for qid,_ in CHAT_QUERIES
                       if (RUN_DIR/"chat_logs"/f"{qid}_cold.json").exists()]
                      if sc.get("latency_s")]

        perf = {}
        for lbl, vals, mt, p95t in [("upload_s",upl_times,8,15),("chat_s",chat_lats,4,8)]:
            if vals:
                s = sorted(vals)
                perf[lbl] = {"n":len(s),"min":round(min(s),1),"median":round(statistics.median(s),1),
                             "p95":round(s[min(int(len(s)*0.95),len(s)-1)],1),"max":round(max(s),1),
                             "target_median":mt,"target_p95":p95t,
                             "median_ok":statistics.median(s)<=mt}
        save(RUN_DIR/"perf"/"perf_summary.json", perf)
        with open(RUN_DIR/"perf"/"tat.csv","w",newline="") as f:
            w2=csv.writer(f); w2.writerow(["metric","n","median_s","p95_s","target_med","target_p95","ok"])
            for k,v in perf.items(): w2.writerow([k,v.get("n"),v.get("median"),v.get("p95"),v.get("target_median"),v.get("target_p95"),v.get("median_ok")])
        log(f"  Upload median: {perf.get('upload_s',{}).get('median','?')}s  Chat median: {perf.get('chat_s',{}).get('median','?')}s")

        # ── Hallucination ledger ───────────────────────────────────────────
        log("=== Hallucination Ledger ===")
        clinical_halls = [h for h in LEDGER if h["severity"]=="P0"]
        has_p0 = bool(clinical_halls)
        if LEDGER:
            with open(RUN_DIR/"report"/"hallucination_ledger.csv","w",newline="") as f:
                w2=csv.DictWriter(f,fieldnames=LEDGER[0].keys()); w2.writeheader(); w2.writerows(LEDGER)
        else:
            (RUN_DIR/"report"/"hallucination_ledger.csv").write_text(
                "surface,document_or_query,claim,claim_type,source_present,severity,root_cause_hypothesis\n"
                "no hallucinations detected\n")
        log(f"  Flagged: {len(LEDGER)}  Clinical P0: {len(clinical_halls)}")

        # ── Final scoring ──────────────────────────────────────────────────
        log("=== Final Scoring ===")
        p1 = p1_result["p1_score"]   # /5  (weight 10%)
        p2 = p2_result["p2_score"]   # /5  (weight 15%)
        p3 = p3_result["p3_score"]   # /30 (weight 30%)
        p4 = p4_result["p4_score"]   # /20 (weight 20%)
        p5 = round(p5_score, 1)      # /15 (weight 15%)
        p6 = p6_result["p6_score"]   # /10 (weight 10%)

        # Weighted total: P1*2=10, P2*3=15, P3=30, P4=20, P5=15, P6=10 → /100
        aggregate = p1*2 + p2*3 + p3 + p4 + p5 + p6
        if has_p0: aggregate = min(aggregate, 60)

        verdict = ("Production-ready"       if aggregate>=90 else
                   "Beta-quality"           if aggregate>=75 else
                   "Demonstration-quality"  if aggregate>=60 else
                   "Significant rework needed")

        scores = {
            "P1_identity_10pct":       p1*2,
            "P2_classification_15pct": p2*3,
            "P3_extraction_30pct":     p3,
            "P4_clinical_20pct":       p4,
            "P5_qa_15pct":             p5,
            "P6_dashboard_10pct":      p6,
            "aggregate":               round(min(aggregate,100),1),
            "p0_cap_applied":          has_p0,
            "verdict":                 verdict,
            "clinical_hallucinations": len(clinical_halls),
        }

        results.update({
            "phases": {
                "p1": p1_result, "p2": p2_result, "p3": p3_result,
                "p4": p4_result, "p5": {"cold":p5_cold,"warm":p5_warm,"score":p5},
                "p6": p6_result, "adversarial": results["phases"].get("adversarial",{}),
                "performance": perf,
            },
            "scores": scores,
        })
        save(RUN_DIR/"report"/"results.json", results)

        log(f"\n{'='*60}")
        log(f"  P1={p1*2}/10  P2={p2*3}/15  P3={p3}/30  P4={p4}/20  P5={p5}/15  P6={p6}/10")
        log(f"  AGGREGATE: {scores['aggregate']}/100  —  {verdict}")
        if has_p0: log("  *** P0 CAP: clinical hallucination detected ***")
        log(f"{'='*60}")

        await page.screenshot(path=str(RUN_DIR/"screenshots"/"99_final.png"), full_page=True)
        await browser.close()
    return results


if __name__ == "__main__":
    r = asyncio.run(main())
    s = r.get("scores",{})
    print(f"\n[DONE] {s.get('aggregate','?')}/100 — {s.get('verdict','?')}")
