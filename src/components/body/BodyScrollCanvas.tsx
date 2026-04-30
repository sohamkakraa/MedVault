"use client";

import type { CSSProperties } from "react";
import Link from "next/link";
import { ChevronDown } from "lucide-react";
import type { ExtractedLab } from "@/lib/types";
import type { BodyScrollSection, OrganGroupId } from "@/lib/bodyScrollRegistry";
import { assetUrlForSection, organGroupAssetUrl } from "@/lib/bodyScrollRegistry";
import { AnatomyImageWithMagnifier } from "@/components/body/AnatomyImageWithMagnifier";

type BodyScrollCanvasProps = {
  activeIndex: number;
  activeSection: BodyScrollSection;
  sectionLabs: ExtractedLab[];
  isLight: boolean;
  organGroup: OrganGroupId;
};

export function BodyScrollCanvas({
  activeIndex,
  activeSection,
  sectionLabs,
  isLight,
  organGroup,
}: BodyScrollCanvasProps) {
  const themeAttr = isLight ? "light" : "dark";
  const mainSrc = assetUrlForSection(activeSection);
  const underlaySrc = organGroupAssetUrl(organGroup);
  const showSilhouetteUnderlay = activeSection.mode === "organ" && activeSection.id !== "intro";
  const isOrganSlide = activeSection.mode === "organ";

  return (
    <>
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          flexDirection: "column",
          minHeight: 0,
        }}
      >
        <header
          style={{
            flexShrink: 0,
            paddingTop: 8,
            paddingLeft: 16,
            paddingRight: 16,
            paddingBottom: 4,
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
              color: activeSection.color,
              opacity: 0.8,
              transition: "color 0.5s ease",
            }}
          >
            {activeSection.subtitle}
          </p>
          <h1
            style={{
              margin: "4px 0 0",
              fontSize: 22,
              fontWeight: 600,
              color: isLight ? "var(--fg)" : "#ffffff",
              letterSpacing: "-0.01em",
              transition: "color 0.5s ease",
            }}
          >
            {activeSection.title}
          </h1>
        </header>

        <div
          style={{
            flex: 1,
            minHeight: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            paddingLeft: 8,
            paddingRight: 8,
            paddingTop: 4,
            paddingBottom: 8,
          }}
        >
          <AnatomyImageWithMagnifier
            mainSrc={mainSrc}
            underlaySrc={showSilhouetteUnderlay ? underlaySrc : null}
            themeAttr={themeAttr}
            isOrgan={isOrganSlide}
          />
        </div>

        {activeIndex === 0 ? (
          <div
            style={{
              flexShrink: 0,
              width: "100%",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 4,
              paddingBottom: 12,
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
                color: activeSection.color,
                textAlign: "center",
              }}
            >
              Scroll to explore
            </span>
            <ChevronDown size={16} color={activeSection.color} aria-hidden />
          </div>
        ) : (
          <div style={{ flexShrink: 0, height: 8 }} aria-hidden />
        )}
      </div>

      {activeSection.id === "intro" ? (
        <IntroCard section={activeSection} isLight={isLight} showScrollCue={activeIndex === 0} />
      ) : (
        <AnnotationCard key={activeSection.id} section={activeSection} labs={sectionLabs} isLight={isLight} />
      )}
    </>
  );
}

function AnnotationCard({
  section,
  labs,
  isLight,
}: {
  section: BodyScrollSection;
  labs: ExtractedLab[];
  isLight: boolean;
}) {
  const isLeft = section.cardSide === "left";

  const cardStyle: CSSProperties = {
    position: "absolute",
    top: "50%",
    [isLeft ? "left" : "right"]: "2%",
    transform: "translateY(-50%)",
    width: "min(280px, 28%)",
    background: isLight ? "rgba(255,255,255,0.94)" : "rgba(3,18,30,0.92)",
    border: `1px solid ${section.color}40`,
    borderLeft: isLeft ? `3px solid ${section.color}` : `1px solid ${section.color}40`,
    borderRight: isLeft ? `1px solid ${section.color}40` : `3px solid ${section.color}`,
    borderRadius: 16,
    boxShadow: isLight ? "var(--shadow)" : undefined,
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
          color: isLight ? "var(--fg)" : "#ffffff",
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
          color: isLight ? "var(--muted)" : "rgba(255,255,255,0.65)",
          lineHeight: 1.6,
        }}
      >
        {section.description}
      </p>

      <div
        style={{
          borderTop: `1px solid ${isLight ? `${section.color}35` : `${section.color}20`}`,
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
          Your values
        </p>

        {labs.length === 0 ? (
          <p
            style={{
              fontSize: 12,
              color: isLight ? "var(--muted)" : "rgba(255,255,255,0.35)",
              fontStyle: "italic",
              lineHeight: 1.5,
              margin: 0,
              opacity: isLight ? 0.9 : 1,
            }}
          >
            Upload a lab report to see your values here, or open{" "}
            <Link href="/upload" className="underline underline-offset-2 text-[var(--accent)]">
              Upload
            </Link>
            .
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
                    color: isLight ? "var(--muted)" : "rgba(255,255,255,0.7)",
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
                    color: isLight ? "var(--fg)" : "#ffffff",
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
                  color: isLight ? "var(--muted)" : "rgba(255,255,255,0.3)",
                  textAlign: "right",
                  opacity: isLight ? 0.85 : 1,
                }}
              >
                Latest: {labs[0].date}
              </p>
            )}
          </div>
        )}
      </div>

      <p
        style={{
          margin: "14px 0 0",
          fontSize: 9,
          color: isLight ? "var(--muted)" : "rgba(255,255,255,0.25)",
          lineHeight: 1.5,
          textAlign: "center",
          letterSpacing: "0.03em",
          opacity: isLight ? 0.85 : 1,
        }}
      >
        Speak to your doctor about your results.
      </p>
    </div>
  );
}

function IntroCard({
  section,
  isLight,
  showScrollCue,
}: {
  section: BodyScrollSection;
  isLight: boolean;
  showScrollCue: boolean;
}) {
  return (
    <div
      style={{
        position: "absolute",
        bottom: showScrollCue ? "max(6.5rem, calc(4.25rem + env(safe-area-inset-bottom, 0px)))" : "max(5rem, calc(3.25rem + env(safe-area-inset-bottom, 0px)))",
        left: "50%",
        transform: "translateX(-50%)",
        width: "min(480px, 88%)",
        background: isLight ? "rgba(255,255,255,0.94)" : "rgba(3,18,30,0.88)",
        border: isLight ? `1px solid ${section.color}45` : "1px solid rgba(0,229,255,0.18)",
        borderRadius: 20,
        boxShadow: isLight ? "var(--shadow)" : undefined,
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
          color: isLight ? "var(--fg)" : "#ffffff",
          letterSpacing: "-0.01em",
        }}
      >
        {section.title}
      </h2>
      <p
        style={{
          margin: 0,
          fontSize: 14,
          color: isLight ? "var(--muted)" : "rgba(255,255,255,0.6)",
          lineHeight: 1.65,
        }}
      >
        {section.description}
      </p>
    </div>
  );
}
