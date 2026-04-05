"use client";

import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import { getStore } from "@/lib/store";
import type { ExtractedLab } from "@/lib/types";
import { ArrowLeft, ChevronDown } from "lucide-react";

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
      "An interactive map of your health data, drawn directly from your uploaded records. Scroll to explore each system.",
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
  { key: "brain", cx: 250, cy: 52, r: 20, label: "Brain" },
  { key: "thyroid", cx: 250, cy: 112, r: 9, label: "Thyroid" },
  { key: "heart", cx: 222, cy: 196, r: 13, label: "Heart" },
  { key: "liver", cx: 278, cy: 210, r: 14, label: "Liver" },
  { key: "pancreas", cx: 248, cy: 250, r: 11, label: "Pancreas" },
  { key: "leftKidney", cx: 216, cy: 276, r: 10, label: "Kidney" },
  { key: "rightKidney", cx: 284, cy: 276, r: 10, label: "Kidney" },
  { key: "blood", cx: 250, cy: 340, r: 16, label: "Blood" },
];

// ---------------------------------------------------------------------------
// Vein definitions
// ---------------------------------------------------------------------------

interface VeinDef {
  key: string;
  d: string;
  delay: number;
  activeSections: SectionId[];
}

const VEINS: VeinDef[] = [
  {
    key: "aorta",
    d: "M 250,120 L 250,344",
    delay: 0,
    activeSections: ["heart", "intro", "blood"],
  },
  {
    key: "carotid",
    d: "M 250,120 L 250,104",
    delay: 0.3,
    activeSections: ["heart", "intro", "blood"],
  },
  {
    key: "lsub",
    d: "M 250,152 C 218,152 192,147 178,142 L 164,140",
    delay: 0.5,
    activeSections: ["heart", "intro", "blood"],
  },
  {
    key: "rsub",
    d: "M 250,152 C 282,152 308,147 322,142 L 336,140",
    delay: 0.5,
    activeSections: ["heart", "intro", "blood"],
  },
  {
    key: "larm",
    d: "M 164,140 L 159,196 L 155,282",
    delay: 0.8,
    activeSections: ["heart", "intro", "blood"],
  },
  {
    key: "rarm",
    d: "M 336,140 L 341,196 L 345,282",
    delay: 0.8,
    activeSections: ["heart", "intro", "blood"],
  },
  {
    key: "liliac",
    d: "M 241,344 L 233,358 L 218,364 L 213,378",
    delay: 1.1,
    activeSections: ["blood", "intro"],
  },
  {
    key: "riliac",
    d: "M 259,344 L 267,358 L 282,364 L 287,378",
    delay: 1.1,
    activeSections: ["blood", "intro"],
  },
  {
    key: "lleg",
    d: "M 213,378 L 219,560",
    delay: 1.4,
    activeSections: ["blood", "intro"],
  },
  {
    key: "rleg",
    d: "M 287,378 L 281,560",
    delay: 1.4,
    activeSections: ["blood", "intro"],
  },
  {
    key: "hepatic",
    d: "M 250,224 C 260,219 268,213 278,210",
    delay: 0.4,
    activeSections: ["liver", "glucose", "intro", "blood"],
  },
  {
    key: "portal",
    d: "M 250,252 C 256,247 265,240 278,210",
    delay: 0.6,
    activeSections: ["liver", "glucose", "intro", "blood"],
  },
  {
    key: "lrenal",
    d: "M 241,268 C 233,271 225,273 216,276",
    delay: 0.7,
    activeSections: ["kidneys", "intro", "blood"],
  },
  {
    key: "rrenal",
    d: "M 259,268 C 267,271 275,273 284,276",
    delay: 0.7,
    activeSections: ["kidneys", "intro", "blood"],
  },
  {
    key: "thyvein",
    d: "M 250,120 L 250,112",
    delay: 0.15,
    activeSections: ["thyroid", "intro"],
  },
  {
    key: "heartloop",
    d: "M 250,185 C 240,188 224,193 220,203 C 216,212 226,220 234,215 C 242,210 250,203 250,195",
    delay: 0.2,
    activeSections: ["heart", "intro", "blood"],
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
  const [mounted, setMounted] = useState(false);
  const [scrollY, setScrollY] = useState(0);
  const [windowHeight, setWindowHeight] = useState(800);
  const [store, setStore] = useState<ReturnType<typeof getStore> | null>(null);

  useEffect(() => {
    setMounted(true);
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

  if (!mounted) {
    return (
      <div
        style={{
          background: "#030d14",
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      />
    );
  }

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
        {/* Fixed Header */}
        <header
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            height: 56,
            zIndex: 50,
            backdropFilter: "blur(16px)",
            WebkitBackdropFilter: "blur(16px)",
            background: "rgba(3,13,20,0.85)",
            borderBottom: "1px solid rgba(0,229,255,0.12)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "0 24px",
          }}
        >
          <Link
            href="/dashboard"
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              color: "#00e5ff",
              textDecoration: "none",
              fontSize: 14,
              fontWeight: 500,
              letterSpacing: "0.02em",
            }}
          >
            <ArrowLeft size={16} />
            Dashboard
          </Link>

          {/* Progress dots */}
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

          <div style={{ width: 80 }} />
        </header>

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
  const bodyFill = "#0e2a3d";
  const bodyStroke = "rgba(0,229,255,0.08)";

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
        </defs>

        {/* Body outline */}
        {/* Head */}
        <ellipse
          cx={250}
          cy={60}
          rx={36}
          ry={44}
          fill={bodyFill}
          stroke={bodyStroke}
          strokeWidth={1}
          style={{ transition: "fill 0.5s ease" }}
        />
        {/* Neck */}
        <rect
          x={234}
          y={102}
          width={32}
          height={24}
          rx={8}
          fill={bodyFill}
          stroke={bodyStroke}
          strokeWidth={1}
          style={{ transition: "fill 0.5s ease" }}
        />
        {/* Torso */}
        <rect
          x={183}
          y={122}
          width={134}
          height={228}
          rx={18}
          fill={bodyFill}
          stroke={bodyStroke}
          strokeWidth={1}
          style={{ transition: "fill 0.5s ease" }}
        />
        {/* Female hip */}
        {isFemale && (
          <rect
            x={177}
            y={292}
            width={146}
            height={60}
            rx={18}
            fill={bodyFill}
            stroke={bodyStroke}
            strokeWidth={1}
            style={{ transition: "fill 0.5s ease" }}
          />
        )}
        {/* Left arm */}
        <rect
          x={152}
          y={128}
          width={32}
          height={162}
          rx={12}
          fill={bodyFill}
          stroke={bodyStroke}
          strokeWidth={1}
          style={{
            transformOrigin: "168px 128px",
            transform: "rotate(-5deg)",
            transition: "fill 0.5s ease",
          }}
        />
        {/* Right arm */}
        <rect
          x={316}
          y={128}
          width={32}
          height={162}
          rx={12}
          fill={bodyFill}
          stroke={bodyStroke}
          strokeWidth={1}
          style={{
            transformOrigin: "332px 128px",
            transform: "rotate(5deg)",
            transition: "fill 0.5s ease",
          }}
        />
        {/* Left leg */}
        <rect
          x={191}
          y={344}
          width={55}
          height={250}
          rx={16}
          fill={bodyFill}
          stroke={bodyStroke}
          strokeWidth={1}
          style={{ transition: "fill 0.5s ease" }}
        />
        {/* Right leg */}
        <rect
          x={254}
          y={344}
          width={55}
          height={250}
          rx={16}
          fill={bodyFill}
          stroke={bodyStroke}
          strokeWidth={1}
          style={{ transition: "fill 0.5s ease" }}
        />

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
              color={section.color}
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
  color: string;
}

function VeinPath({ vein, isActive, color }: VeinPathProps) {
  const slowDuration = isActive ? 2.2 : 5;
  const strokeColor = isActive ? color : "#0a2535";
  const strokeOpacity = isActive ? 0.7 : 1;

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
        strokeWidth={isActive ? 1.5 : 1}
        strokeLinecap="round"
        strokeDasharray={isActive ? "6 44" : "none"}
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
          stroke={color}
          strokeOpacity={0.45}
          strokeWidth={1}
          strokeLinecap="round"
          strokeDasharray="3 22"
          style={{
            animation: `electricFlowFast 1.3s linear ${vein.delay + offset * 0.5}s infinite`,
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
}

function OrganDot({ organ, isActive, color }: OrganDotProps) {
  const r = isActive ? organ.r + 2 : organ.r;
  const fill = isActive ? color : "#0a2535";
  const labelY = organ.cy - r - 9;

  // Deterministic delay for pulse variation
  const pulseDelay = (hashStr(organ.key) % 12) / 10;

  return (
    <g style={{ willChange: "transform" }}>
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

      {/* Main organ dot */}
      <circle
        cx={organ.cx}
        cy={organ.cy}
        r={r}
        fill={fill}
        filter={isActive ? "url(#organGlow)" : undefined}
        style={{
          transition: "fill 0.5s ease, r 0.5s ease",
          animation: isActive
            ? `organPulse 2s ease-in-out ${pulseDelay}s infinite`
            : undefined,
        }}
      />

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
