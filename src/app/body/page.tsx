"use client";

import { useEffect, useState, useMemo } from "react";
import { getHydrationSafeStore, getStore } from "@/lib/store";
import type { ExtractedLab } from "@/lib/types";
import { ChevronDown } from "lucide-react";
import { AppTopNav } from "@/components/nav/AppTopNav";

// ---------------------------------------------------------------------------
// Section definitions
// ---------------------------------------------------------------------------

type SectionId =
  | "intro"
  | "heart"
  | "glucose"
  | "liver"
  | "kidneys"
  | "thyroid"
  | "blood";

type OrganKey =
  | "brain"
  | "thyroid"
  | "heart"
  | "liver"
  | "pancreas"
  | "leftKidney"
  | "rightKidney"
  | "blood";

interface Section {
  id: SectionId;
  title: string;
  subtitle: string;
  description: string;
  organ: OrganKey | "kidneys" | null;
  color: string;
  side: "left" | "right" | "none";
  labKeys: string[];
  activeOrgans: OrganKey[];
}

const SECTIONS: Section[] = [
  {
    id: "intro",
    title: "Your Body, Illuminated",
    subtitle: "Health Overview",
    description:
      "An interactive map of your health data, drawn directly from your saved records. Scroll to explore each system.",
    organ: null,
    color: "#00e5ff",
    side: "none",
    labKeys: [],
    activeOrgans: [
      "brain",
      "thyroid",
      "heart",
      "liver",
      "pancreas",
      "leftKidney",
      "rightKidney",
      "blood",
    ],
  },
  {
    id: "heart",
    title: "Heart & Circulation",
    subtitle: "Cardiovascular System",
    description:
      "Your heart pumps roughly 2,000 gallons of blood daily. Cholesterol markers like LDL and HDL indicate how freely blood moves through your arteries.",
    organ: "heart",
    color: "#ff6b6b",
    side: "left",
    labKeys: ["LDL", "HDL", "Total Cholesterol", "Triglycerides"],
    activeOrgans: ["heart"],
  },
  {
    id: "glucose",
    title: "Blood Sugar & Energy",
    subtitle: "Metabolic System",
    description:
      "The pancreas regulates blood sugar by producing insulin. HbA1c reflects your average glucose over the past three months — a key window into metabolic health.",
    organ: "pancreas",
    color: "#ffa94d",
    side: "right",
    labKeys: ["HbA1c", "Glucose"],
    activeOrgans: ["pancreas"],
  },
  {
    id: "liver",
    title: "Liver Function",
    subtitle: "Hepatic System",
    description:
      "Your liver performs over 500 functions — filtering toxins, producing bile, and metabolising nutrients. Enzyme levels like AST and ALT signal how hard it is working.",
    organ: "liver",
    color: "#69db7c",
    side: "right",
    labKeys: ["AST", "ALT", "ALP", "GGT"],
    activeOrgans: ["liver"],
  },
  {
    id: "kidneys",
    title: "Kidney Health",
    subtitle: "Renal System",
    description:
      "Your kidneys filter about 200 litres of blood daily, removing waste as urine. Creatinine and BUN levels indicate how efficiently they are clearing metabolic byproducts.",
    organ: "kidneys",
    color: "#74c0fc",
    side: "left",
    labKeys: ["Creatinine", "Urea", "BUN"],
    activeOrgans: ["leftKidney", "rightKidney"],
  },
  {
    id: "thyroid",
    title: "Thyroid",
    subtitle: "Endocrine System",
    description:
      "A small gland with an outsized role — your thyroid controls metabolism, energy, and temperature. TSH is the pituitary's signal to the thyroid; T3 and T4 are the hormones it produces.",
    organ: "thyroid",
    color: "#da77f2",
    side: "right",
    labKeys: ["TSH", "T3", "T4"],
    activeOrgans: ["thyroid"],
  },
  {
    id: "blood",
    title: "Blood & Immunity",
    subtitle: "Haematology",
    description:
      "Your blood carries oxygen, fights infection, and helps repair tissue. A full blood count covers red cells, white cells, and platelets — a snapshot of your body's defence and transport systems.",
    organ: "blood",
    color: "#f03e3e",
    side: "left",
    labKeys: ["Hemoglobin", "WBC", "RBC", "Platelets", "Hematocrit"],
    activeOrgans: [
      "brain",
      "thyroid",
      "heart",
      "liver",
      "pancreas",
      "leftKidney",
      "rightKidney",
      "blood",
    ],
  },
];

const ORGAN_TO_SECTION: Record<OrganKey, SectionId> = {
  brain: "intro",
  thyroid: "thyroid",
  heart: "heart",
  liver: "liver",
  pancreas: "glucose",
  leftKidney: "kidneys",
  rightKidney: "kidneys",
  blood: "blood",
};

// ---------------------------------------------------------------------------
// Organ geometry
// ---------------------------------------------------------------------------

interface OrganDef {
  key: OrganKey;
  cx: number;
  cy: number;
  r: number;
  label: string;
}

const ORGANS: OrganDef[] = [
  { key: "brain", cx: 250, cy: 66, r: 22, label: "Brain" },
  { key: "thyroid", cx: 250, cy: 126, r: 9, label: "Thyroid" },
  { key: "heart", cx: 234, cy: 214, r: 14, label: "Heart" },
  { key: "liver", cx: 278, cy: 240, r: 16, label: "Liver" },
  { key: "pancreas", cx: 254, cy: 270, r: 12, label: "Pancreas" },
  { key: "leftKidney", cx: 224, cy: 296, r: 11, label: "Kidney" },
  { key: "rightKidney", cx: 278, cy: 296, r: 11, label: "Kidney" },
  { key: "blood", cx: 250, cy: 364, r: 17, label: "Blood" },
];

// ---------------------------------------------------------------------------
// Vein definitions
// ---------------------------------------------------------------------------

interface VeinDef {
  key: string;
  d: string;
  type: "artery" | "vein";
  delay: number;
  activeSections: SectionId[];
}

const VEINS: VeinDef[] = [
  {
    key: "aorta-main",
    d: "M 250,138 L 250,372",
    type: "artery",
    delay: 0,
    activeSections: ["heart", "intro", "blood"],
  },
  {
    key: "carotid-left",
    d: "M 250,138 C 248,128 246,112 244,100",
    type: "artery",
    delay: 0.25,
    activeSections: ["heart", "intro", "blood"],
  },
  {
    key: "carotid-right",
    d: "M 250,138 C 252,128 254,112 256,100",
    type: "artery",
    delay: 0.33,
    activeSections: ["heart", "intro", "blood"],
  },
  {
    key: "subclavian-left",
    d: "M 250,162 C 224,164 196,166 168,178",
    type: "artery",
    delay: 0.42,
    activeSections: ["heart", "intro", "blood"],
  },
  {
    key: "subclavian-right",
    d: "M 250,162 C 276,164 304,166 332,178",
    type: "artery",
    delay: 0.45,
    activeSections: ["heart", "intro", "blood"],
  },
  {
    key: "brachial-left",
    d: "M 168,178 C 160,218 154,262 152,310",
    type: "artery",
    delay: 0.65,
    activeSections: ["heart", "intro", "blood"],
  },
  {
    key: "brachial-right",
    d: "M 332,178 C 340,218 346,262 348,310",
    type: "artery",
    delay: 0.7,
    activeSections: ["heart", "intro", "blood"],
  },
  {
    key: "iliac-left",
    d: "M 250,372 C 244,386 234,398 222,414",
    type: "artery",
    delay: 0.95,
    activeSections: ["blood", "intro"],
  },
  {
    key: "iliac-right",
    d: "M 250,372 C 256,386 266,398 278,414",
    type: "artery",
    delay: 0.98,
    activeSections: ["blood", "intro"],
  },
  {
    key: "femoral-left",
    d: "M 222,414 C 216,470 214,530 216,586",
    type: "artery",
    delay: 1.2,
    activeSections: ["blood", "intro"],
  },
  {
    key: "femoral-right",
    d: "M 278,414 C 284,470 286,530 284,586",
    type: "artery",
    delay: 1.24,
    activeSections: ["blood", "intro"],
  },
  {
    key: "hepatic-artery",
    d: "M 250,250 C 260,244 270,240 278,240",
    type: "artery",
    delay: 0.5,
    activeSections: ["liver", "glucose", "intro", "blood"],
  },
  {
    key: "renal-artery-left",
    d: "M 250,286 C 240,290 232,294 224,296",
    type: "artery",
    delay: 0.76,
    activeSections: ["kidneys", "intro", "blood"],
  },
  {
    key: "renal-artery-right",
    d: "M 250,286 C 260,290 268,294 278,296",
    type: "artery",
    delay: 0.79,
    activeSections: ["kidneys", "intro", "blood"],
  },
  {
    key: "jugular-left",
    d: "M 246,98 C 243,112 242,124 242,138",
    type: "vein",
    delay: 0.2,
    activeSections: ["thyroid", "intro", "blood"],
  },
  {
    key: "jugular-right",
    d: "M 254,98 C 257,112 258,124 258,138",
    type: "vein",
    delay: 0.24,
    activeSections: ["thyroid", "intro", "blood"],
  },
  {
    key: "vena-cava",
    d: "M 242,138 C 242,188 244,250 246,372",
    type: "vein",
    delay: 0.58,
    activeSections: ["heart", "blood", "intro"],
  },
  {
    key: "vena-cava-right",
    d: "M 258,138 C 258,188 256,250 254,372",
    type: "vein",
    delay: 0.61,
    activeSections: ["heart", "blood", "intro"],
  },
  {
    key: "portal-vein",
    d: "M 250,270 C 262,264 270,252 278,240",
    type: "vein",
    delay: 0.72,
    activeSections: ["liver", "glucose", "intro", "blood"],
  },
  {
    key: "renal-vein-left",
    d: "M 246,288 C 238,290 230,294 224,296",
    type: "vein",
    delay: 0.84,
    activeSections: ["kidneys", "intro", "blood"],
  },
  {
    key: "renal-vein-right",
    d: "M 254,288 C 262,290 270,294 278,296",
    type: "vein",
    delay: 0.88,
    activeSections: ["kidneys", "intro", "blood"],
  },
  {
    key: "cephalic-left",
    d: "M 162,186 C 170,240 176,278 180,312",
    type: "vein",
    delay: 0.92,
    activeSections: ["blood", "intro", "heart"],
  },
  {
    key: "cephalic-right",
    d: "M 338,186 C 330,240 324,278 320,312",
    type: "vein",
    delay: 0.94,
    activeSections: ["blood", "intro", "heart"],
  },
  {
    key: "saphenous-left",
    d: "M 232,414 C 236,468 238,528 236,586",
    type: "vein",
    delay: 1.28,
    activeSections: ["blood", "intro"],
  },
  {
    key: "saphenous-right",
    d: "M 268,414 C 264,468 262,528 264,586",
    type: "vein",
    delay: 1.32,
    activeSections: ["blood", "intro"],
  },
];

// ---------------------------------------------------------------------------
// Deterministic hash for stable animation offsets
// ---------------------------------------------------------------------------

function hashStr(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function BodyPage() {
  const [scrollY, setScrollY] = useState(0);
  const [windowHeight, setWindowHeight] = useState(800);
  const [store, setStore] = useState(() => getHydrationSafeStore());

  useEffect(() => {
    setStore(getStore());
    setWindowHeight(window.innerHeight);
    const handleScroll = () => setScrollY(window.scrollY);
    const handleResize = () => setWindowHeight(window.innerHeight);

    window.addEventListener("scroll", handleScroll, { passive: true });
    window.addEventListener("resize", handleResize, { passive: true });
    return () => {
      window.removeEventListener("scroll", handleScroll);
      window.removeEventListener("resize", handleResize);
    };
  }, []);

  const activeIndex = useMemo(() => {
    const raw = Math.floor((scrollY + windowHeight * 0.4) / windowHeight);
    return Math.max(0, Math.min(6, raw));
  }, [scrollY, windowHeight]);

  const section = SECTIONS[activeIndex];
  const isFemale = store?.profile?.sex?.toLowerCase().startsWith("f") ?? false;

  // Lab values filtered for the current section
  const sectionLabs = useMemo<ExtractedLab[]>(() => {
    if (!store || section.labKeys.length === 0) return [];
    const allLabs = store.labs ?? [];
    const filtered = allLabs.filter((lab) =>
      section.labKeys.some((key) =>
        lab.name.toLowerCase().includes(key.toLowerCase())
      )
    );
    // Sort by date desc
    filtered.sort((a, b) => {
      if (!a.date && !b.date) return 0;
      if (!a.date) return 1;
      if (!b.date) return -1;
      return b.date.localeCompare(a.date);
    });
    // Dedupe by name (keep latest)
    const seen = new Set<string>();
    const deduped: ExtractedLab[] = [];
    for (const lab of filtered) {
      const key = lab.name.toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        deduped.push(lab);
      }
    }
    return deduped.slice(0, 5);
  }, [store, section]);

  const scrollToSection = (index: number) => {
    window.scrollTo({ top: index * windowHeight, behavior: "smooth" });
  };

  return (
    <>
      {/* Global styles */}
      <style>{`
        @keyframes electricFlow {
          from { stroke-dashoffset: 100; }
          to   { stroke-dashoffset: 0; }
        }
        @keyframes electricFlowFast {
          from { stroke-dashoffset: 50; }
          to   { stroke-dashoffset: 0; }
        }
        @keyframes organPulse {
          0%, 100% { opacity: 0.78; }
          50%       { opacity: 1; }
        }
        @keyframes rippleOut {
          0%   { transform: scale(1); opacity: 0.55; }
          100% { transform: scale(3.2); opacity: 0; }
        }
        @keyframes slideInLeft {
          from { opacity: 0; transform: translateY(-50%) translateX(-24px); }
          to   { opacity: 1; transform: translateY(-50%) translateX(0); }
        }
        @keyframes slideInRight {
          from { opacity: 0; transform: translateY(-50%) translateX(24px); }
          to   { opacity: 1; transform: translateY(-50%) translateX(0); }
        }
        @keyframes fadeUp {
          from { opacity: 0; transform: translateX(-50%) translateY(16px); }
          to   { opacity: 1; transform: translateX(-50%) translateY(0); }
        }
        @keyframes introFadeIn {
          from { opacity: 0; transform: translateY(20px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        * { box-sizing: border-box; }
        html, body { margin: 0; padding: 0; }
      `}</style>

      <div style={{ background: "#030d14", minHeight: "100vh" }}>
        <AppTopNav
          fixed
          rightSlot={
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              {SECTIONS.map((s, i) => (
                <button
                  key={s.id}
                  onClick={() => scrollToSection(i)}
                  title={s.title}
                  style={{
                    border: "none",
                    cursor: "pointer",
                    padding: 0,
                    background: "none",
                    display: "flex",
                    alignItems: "center",
                  }}
                >
                  <span
                    style={{
                      display: "block",
                      height: 6,
                      width: i === activeIndex ? 20 : 6,
                      borderRadius: 3,
                      background:
                        i === activeIndex
                          ? section.color
                          : "rgba(255,255,255,0.2)",
                      transition: "all 0.4s ease",
                    }}
                  />
                </button>
              ))}
            </div>
          }
        />

        {/* Scroll container */}
        <div style={{ height: `${7 * 100}vh` }}>
          {/* Sticky panel */}
          <div
            style={{
              position: "sticky",
              top: 56,
              height: "calc(100vh - 56px)",
              overflow: "hidden",
            }}
          >
            {/* Section label at top */}
            <div
              style={{
                position: "absolute",
                top: 24,
                left: "50%",
                transform: "translateX(-50%)",
                textAlign: "center",
                zIndex: 10,
                pointerEvents: "none",
              }}
            >
              <p
                style={{
                  margin: 0,
                  fontSize: 11,
                  letterSpacing: "0.14em",
                  textTransform: "uppercase",
                  color: section.color,
                  opacity: 0.8,
                  transition: "color 0.5s ease",
                }}
              >
                {section.subtitle}
              </p>
              <h1
                style={{
                  margin: "4px 0 0",
                  fontSize: 22,
                  fontWeight: 600,
                  color: "#ffffff",
                  letterSpacing: "-0.01em",
                  transition: "color 0.5s ease",
                }}
              >
                {section.title}
              </h1>
            </div>

            {/* SVG Body */}
            <BodySVG
              section={section}
              isFemale={isFemale}
              activeIndex={activeIndex}
            />

            {/* Annotation card or intro card */}
            {section.id === "intro" ? (
              <IntroCard section={section} />
            ) : (
              <AnnotationCard
                key={section.id}
                section={section}
                labs={sectionLabs}
              />
            )}

            {/* Scroll hint on intro */}
            {activeIndex === 0 && (
              <div
                style={{
                  position: "absolute",
                  bottom: 32,
                  left: "50%",
                  transform: "translateX(-50%)",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: 4,
                  opacity: 0.5,
                  animation: "introFadeIn 1s ease 1s both",
                  pointerEvents: "none",
                }}
              >
                <span
                  style={{
                    fontSize: 11,
                    letterSpacing: "0.1em",
                    textTransform: "uppercase",
                    color: "#00e5ff",
                  }}
                >
                  Scroll to explore
                </span>
                <ChevronDown size={16} color="#00e5ff" />
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// SVG Body component
// ---------------------------------------------------------------------------

interface BodySVGProps {
  section: Section;
  isFemale: boolean;
  activeIndex: number;
}

function BodySVG({ section, isFemale }: BodySVGProps) {
  const bodyStroke = "rgba(212, 232, 255, 0.24)";

  const onOrganClick = (organ: OrganKey) => {
    const id = ORGAN_TO_SECTION[organ];
    const idx = SECTIONS.findIndex((s) => s.id === id);
    if (idx >= 0) {
      const vh = window.innerHeight;
      window.scrollTo({ top: idx * vh, behavior: "smooth" });
    }
  };

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <svg
        viewBox="0 0 500 620"
        style={{
          width: "100%",
          height: "100%",
          maxWidth: 420,
          maxHeight: "calc(100vh - 56px)",
        }}
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <linearGradient id="bodyTone" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#173246" stopOpacity="0.92" />
            <stop offset="100%" stopColor="#0a1824" stopOpacity="0.96" />
          </linearGradient>
          <radialGradient id="coreGlow" cx="50%" cy="35%" r="60%">
            <stop offset="0%" stopColor="rgba(154,198,238,0.28)" />
            <stop offset="100%" stopColor="rgba(7,22,35,0)" />
          </radialGradient>
          {/* Glow filter for active organs */}
          <filter id="organGlow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="5" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          {/* Subtle glow for active veins */}
          <filter id="veinGlow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="2" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <filter id="bodySoftGlow" x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur stdDeviation="7" result="soft" />
            <feMerge>
              <feMergeNode in="soft" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Body silhouette */}
        <ellipse cx={250} cy={70} rx={28} ry={38} fill="url(#bodyTone)" stroke={bodyStroke} strokeWidth={1.1} />
        <path d="M242 106 C244 116 244 124 243 136 L257 136 C256 124 256 116 258 106 Z" fill="url(#bodyTone)" stroke={bodyStroke} strokeWidth={1} />
        <path
          d={
            isFemale
              ? "M212 142 C199 148 189 158 184 176 C179 194 181 216 186 242 C190 262 193 286 194 314 C195 340 198 365 208 382 C217 397 231 405 250 406 C269 405 283 397 292 382 C302 365 305 340 306 314 C307 286 310 262 314 242 C319 216 321 194 316 176 C311 158 301 148 288 142 C276 136 263 134 250 134 C237 134 224 136 212 142 Z"
              : "M214 142 C201 148 191 156 185 173 C179 191 181 214 186 241 C190 262 193 286 194 314 C195 338 199 360 209 376 C218 390 232 398 250 399 C268 398 282 390 291 376 C301 360 305 338 306 314 C307 286 310 262 314 241 C319 214 321 191 315 173 C309 156 299 148 286 142 C274 136 262 134 250 134 C238 134 226 136 214 142 Z"
          }
          fill="url(#bodyTone)"
          stroke={bodyStroke}
          strokeWidth={1.2}
        />
        <path d="M188 174 C173 188 165 214 162 246 C159 280 160 310 164 334 C166 346 171 352 178 353 C185 354 190 349 192 339 C196 322 195 295 194 267 C193 244 195 220 201 196" fill="url(#bodyTone)" stroke={bodyStroke} strokeWidth={1.05} />
        <path d="M312 174 C327 188 335 214 338 246 C341 280 340 310 336 334 C334 346 329 352 322 353 C315 354 310 349 308 339 C304 322 305 295 306 267 C307 244 305 220 299 196" fill="url(#bodyTone)" stroke={bodyStroke} strokeWidth={1.05} />
        <path d="M224 396 C217 412 213 434 211 463 C209 505 211 542 216 575 C219 592 225 598 233 597 C240 596 244 589 244 578 C245 552 243 525 242 498 C241 468 244 442 248 408" fill="url(#bodyTone)" stroke={bodyStroke} strokeWidth={1.05} />
        <path d="M276 396 C283 412 287 434 289 463 C291 505 289 542 284 575 C281 592 275 598 267 597 C260 596 256 589 256 578 C255 552 257 525 258 498 C259 468 256 442 252 408" fill="url(#bodyTone)" stroke={bodyStroke} strokeWidth={1.05} />
        <ellipse cx={250} cy={258} rx={72} ry={128} fill="url(#coreGlow)" />

        {/* Veins */}
        {VEINS.map((vein) => {
          const isActive =
            section.id === "intro" ||
            section.id === "blood" ||
            vein.activeSections.includes(section.id);
          return (
            <VeinPath
              key={vein.key}
              vein={vein}
              isActive={isActive}
            />
          );
        })}

        {/* Organs */}
        {ORGANS.map((organ) => {
          const isActive = section.activeOrgans.includes(organ.key);
          return (
            <OrganDot
              key={organ.key}
              organ={organ}
              isActive={isActive}
              color={section.color}
              onSelect={onOrganClick}
            />
          );
        })}
      </svg>
    </div>
  );
}

// ---------------------------------------------------------------------------
// VeinPath component
// ---------------------------------------------------------------------------

interface VeinPathProps {
  vein: VeinDef;
  isActive: boolean;
}

function VeinPath({ vein, isActive }: VeinPathProps) {
  const slowDuration = isActive ? 2.2 : 5;
  const baseColor = vein.type === "artery" ? "#ef5c71" : "#8bc3ff";
  const strokeColor = isActive ? baseColor : "rgba(77,110,140,0.45)";
  const strokeOpacity = isActive ? 0.9 : 0.6;

  // Deterministic animation offset based on vein key
  const offset = (hashStr(vein.key) % 40) / 10;

  return (
    <g filter={isActive ? "url(#veinGlow)" : undefined} style={{ willChange: "transform" }}>
      {/* Slow base layer */}
      <path
        d={vein.d}
        fill="none"
        stroke={strokeColor}
        strokeOpacity={strokeOpacity}
        strokeWidth={isActive ? (vein.type === "artery" ? 1.8 : 1.6) : 1}
        strokeLinecap="round"
        strokeDasharray={isActive ? (vein.type === "artery" ? "8 34" : "6 30") : "none"}
        strokeDashoffset={0}
        style={
          isActive
            ? {
                animation: `electricFlow ${slowDuration}s linear ${vein.delay + offset}s infinite`,
                transition: "stroke 0.5s ease",
              }
            : { transition: "stroke 0.5s ease" }
        }
      />
      {/* Fast sparks layer (active only) */}
      {isActive && (
        <path
          d={vein.d}
          fill="none"
          stroke={vein.type === "artery" ? "#ff9aaa" : "#c6e3ff"}
          strokeOpacity={0.58}
          strokeWidth={vein.type === "artery" ? 1.2 : 1}
          strokeLinecap="round"
          strokeDasharray={vein.type === "artery" ? "4 18" : "3 14"}
          style={{
            animation: `electricFlowFast ${vein.type === "artery" ? 1.1 : 1.5}s linear ${
              vein.delay + offset * 0.5
            }s infinite`,
          }}
        />
      )}
    </g>
  );
}

// ---------------------------------------------------------------------------
// OrganDot component
// ---------------------------------------------------------------------------

interface OrganDotProps {
  organ: OrganDef;
  isActive: boolean;
  color: string;
  onSelect: (key: OrganKey) => void;
}

function OrganDot({ organ, isActive, color, onSelect }: OrganDotProps) {
  const r = isActive ? organ.r + 2 : organ.r;
  const fill = isActive ? color : "#2d4158";
  const labelY = organ.cy - r - 9;

  // Deterministic delay for pulse variation
  const pulseDelay = (hashStr(organ.key) % 12) / 10;

  return (
    <g style={{ willChange: "transform", cursor: "pointer" }} onClick={() => onSelect(organ.key)}>
      {/* Ripple ring (active only) */}
      {isActive && (
        <circle
          cx={organ.cx}
          cy={organ.cy}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={1.5}
          strokeOpacity={0.55}
          style={{
            transformOrigin: `${organ.cx}px ${organ.cy}px`,
            animation: `rippleOut 2.5s ease-out ${pulseDelay}s infinite`,
          }}
        />
      )}

      {/* Main organ shape */}
      {organ.key === "brain" ? (
        <ellipse
          cx={organ.cx}
          cy={organ.cy}
          rx={r + 4}
          ry={r - 4}
          fill={fill}
          filter={isActive ? "url(#organGlow)" : undefined}
          style={{
            transition: "fill 0.5s ease",
            animation: isActive ? `organPulse 2s ease-in-out ${pulseDelay}s infinite` : undefined,
          }}
        />
      ) : organ.key === "heart" ? (
        <path
          d={`M ${organ.cx} ${organ.cy + 8} C ${organ.cx - 10} ${organ.cy + 1}, ${organ.cx - 20} ${organ.cy - 10}, ${
            organ.cx - 10
          } ${organ.cy - 20} C ${organ.cx - 2} ${organ.cy - 26}, ${organ.cx + 8} ${organ.cy - 20}, ${organ.cx + 8} ${
            organ.cy - 10
          } C ${organ.cx + 8} ${organ.cy - 2}, ${organ.cx + 2} ${organ.cy + 3}, ${organ.cx} ${organ.cy + 8} Z`}
          fill={fill}
          filter={isActive ? "url(#organGlow)" : undefined}
          style={{
            transition: "fill 0.5s ease",
            animation: isActive ? `organPulse 1.2s ease-in-out ${pulseDelay}s infinite` : undefined,
          }}
        />
      ) : organ.key.includes("Kidney") ? (
        <ellipse
          cx={organ.cx}
          cy={organ.cy}
          rx={r - 2}
          ry={r + 2}
          fill={fill}
          filter={isActive ? "url(#organGlow)" : undefined}
          style={{
            transition: "fill 0.5s ease",
            animation: isActive ? `organPulse 2s ease-in-out ${pulseDelay}s infinite` : undefined,
          }}
        />
      ) : (
        <ellipse
          cx={organ.cx}
          cy={organ.cy}
          rx={r + 2}
          ry={r - 1}
          fill={fill}
          filter={isActive ? "url(#organGlow)" : undefined}
          style={{
            transition: "fill 0.5s ease",
            animation: isActive ? `organPulse 2s ease-in-out ${pulseDelay}s infinite` : undefined,
          }}
        />
      )}

      {/* Label (active only) */}
      {isActive && (
        <text
          x={organ.cx}
          y={labelY}
          textAnchor="middle"
          fontSize={9}
          letterSpacing="0.08em"
          textDecoration="none"
          fill={color}
          fontWeight={600}
          style={{ textTransform: "uppercase", fontFamily: "inherit" }}
        >
          {organ.label.toUpperCase()}
        </text>
      )}
    </g>
  );
}

// ---------------------------------------------------------------------------
// Annotation card
// ---------------------------------------------------------------------------

interface AnnotationCardProps {
  section: Section;
  labs: ExtractedLab[];
}

function AnnotationCard({ section, labs }: AnnotationCardProps) {
  const isLeft = section.side === "left";

  const cardStyle: React.CSSProperties = {
    position: "absolute",
    top: "50%",
    [isLeft ? "left" : "right"]: "2%",
    transform: "translateY(-50%)",
    width: "min(280px, 28%)",
    background: "rgba(3,18,30,0.92)",
    border: `1px solid ${section.color}40`,
    borderLeft: isLeft ? `3px solid ${section.color}` : `1px solid ${section.color}40`,
    borderRight: isLeft ? `1px solid ${section.color}40` : `3px solid ${section.color}`,
    borderRadius: 16,
    backdropFilter: "blur(16px)",
    WebkitBackdropFilter: "blur(16px)",
    padding: "20px 18px",
    zIndex: 20,
    animation: isLeft
      ? "slideInLeft 0.5s cubic-bezier(0.22,1,0.36,1) both"
      : "slideInRight 0.5s cubic-bezier(0.22,1,0.36,1) both",
    maxHeight: "calc(100vh - 120px)",
    overflowY: "auto",
    scrollbarWidth: "none",
  };

  return (
    <div style={cardStyle}>
      <p
        style={{
          margin: "0 0 4px",
          fontSize: 10,
          letterSpacing: "0.12em",
          textTransform: "uppercase",
          color: section.color,
          opacity: 0.8,
        }}
      >
        {section.subtitle}
      </p>
      <h2
        style={{
          margin: "0 0 10px",
          fontSize: 17,
          fontWeight: 600,
          color: "#ffffff",
          lineHeight: 1.3,
          letterSpacing: "-0.01em",
        }}
      >
        {section.title}
      </h2>
      <p
        style={{
          margin: "0 0 16px",
          fontSize: 13,
          color: "rgba(255,255,255,0.65)",
          lineHeight: 1.6,
        }}
      >
        {section.description}
      </p>

      {/* Lab values */}
      <div
        style={{
          borderTop: `1px solid ${section.color}20`,
          paddingTop: 14,
        }}
      >
        <p
          style={{
            margin: "0 0 10px",
            fontSize: 10,
            letterSpacing: "0.1em",
            textTransform: "uppercase",
            color: section.color,
            opacity: 0.7,
          }}
        >
          Your Values
        </p>

        {labs.length === 0 ? (
          <p
            style={{
              fontSize: 12,
              color: "rgba(255,255,255,0.35)",
              fontStyle: "italic",
              lineHeight: 1.5,
              margin: 0,
            }}
          >
            Upload a lab report to see your values here.
          </p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {labs.map((lab, i) => (
              <div
                key={i}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "baseline",
                  gap: 8,
                }}
              >
                <span
                  style={{
                    fontSize: 12,
                    color: "rgba(255,255,255,0.7)",
                    flex: "1 1 auto",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {lab.name}
                </span>
                <span
                  style={{
                    fontSize: 13,
                    fontWeight: 600,
                    color: "#ffffff",
                    fontVariantNumeric: "tabular-nums",
                    flexShrink: 0,
                    letterSpacing: "0.02em",
                  }}
                >
                  {lab.value}
                  {lab.unit && (
                    <span
                      style={{
                        fontSize: 10,
                        fontWeight: 400,
                        color: section.color,
                        marginLeft: 3,
                        opacity: 0.85,
                      }}
                    >
                      {lab.unit}
                    </span>
                  )}
                </span>
              </div>
            ))}
            {labs[0]?.date && (
              <p
                style={{
                  margin: "4px 0 0",
                  fontSize: 10,
                  color: "rgba(255,255,255,0.3)",
                  textAlign: "right",
                }}
              >
                Latest: {labs[0].date}
              </p>
            )}
          </div>
        )}
      </div>

      {/* Disclaimer */}
      <p
        style={{
          margin: "14px 0 0",
          fontSize: 9,
          color: "rgba(255,255,255,0.25)",
          lineHeight: 1.5,
          textAlign: "center",
          letterSpacing: "0.03em",
        }}
      >
        Not medical advice — speak to your doctor about your results.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Intro card
// ---------------------------------------------------------------------------

interface IntroCardProps {
  section: Section;
}

function IntroCard({ section }: IntroCardProps) {
  return (
    <div
      style={{
        position: "absolute",
        bottom: 80,
        left: "50%",
        transform: "translateX(-50%)",
        width: "min(480px, 88%)",
        background: "rgba(3,18,30,0.88)",
        border: "1px solid rgba(0,229,255,0.18)",
        borderRadius: 20,
        backdropFilter: "blur(20px)",
        WebkitBackdropFilter: "blur(20px)",
        padding: "24px 28px",
        zIndex: 20,
        textAlign: "center",
        animation: "fadeUp 0.7s cubic-bezier(0.22,1,0.36,1) 0.2s both",
      }}
    >
      <p
        style={{
          margin: "0 0 6px",
          fontSize: 11,
          letterSpacing: "0.14em",
          textTransform: "uppercase",
          color: section.color,
          opacity: 0.8,
        }}
      >
        {section.subtitle}
      </p>
      <h2
        style={{
          margin: "0 0 12px",
          fontSize: 20,
          fontWeight: 600,
          color: "#ffffff",
          letterSpacing: "-0.01em",
        }}
      >
        {section.title}
      </h2>
      <p
        style={{
          margin: 0,
          fontSize: 14,
          color: "rgba(255,255,255,0.6)",
          lineHeight: 1.65,
        }}
      >
        {section.description}
      </p>
    </div>
  );
}
