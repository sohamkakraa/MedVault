"use client";

import { useEffect, useState } from "react";

/* ─── Types ──────────────────────────────────────────────── */
type Mood = "idle" | "thinking" | "happy";

interface UmaCharacterProps {
  mood?: Mood;
  compact?: boolean;
  className?: string;
}

/* ─── Character → colour mapping ─────────────────────────── *
 * Every character in the ASCII art maps to a colour zone     *
 * based on identity. This keeps the art colourful without    *
 * needing inline markup in the frame strings.                *
 * ────────────────────────────────────────────────────────── */
const JEWELRY = new Set("✦◇♦✧".split(""));
const CLOTH   = new Set("╭╮╰╯│─┬┴├┤▓░▒┐┘┌└".split(""));
const BINDI   = new Set("●".split(""));
const HEART   = new Set("♥".split(""));
const DIM     = new Set("·".split(""));
// ◕ ◐ ◑ ◡ — – and everything else → var(--fg)

function charColor(ch: string): string {
  if (ch === " ") return "transparent";
  if (JEWELRY.has(ch)) return "var(--accent)";
  if (CLOTH.has(ch))   return "var(--accent-2)";
  if (BINDI.has(ch))   return "var(--uma-bindi, #c44)";
  if (HEART.has(ch))   return "var(--uma-heart, #e55)";
  if (DIM.has(ch))     return "var(--muted)";
  return "var(--fg)";
}

/* ─── Animation frames ───────────────────────────────────── *
 * All frames are exactly 15 chars wide × 11 lines tall.      *
 * Consistent dimensions prevent layout shift during anim.    *
 *                                                            *
 * Visual key (inspired by the photograph):                   *
 *  ✦  — maang tikka (teal/green jewel at crown of head)     *
 *  ╭╮╰╯│─ — dupatta frame (orange/gold draping around face) *
 *  ●  — bindi (red mark on forehead)                         *
 *  ◕  — eyes open (dark)                                     *
 *  ◇  — nath / nose ring (teal/green jewel)                  *
 *  ╰───╯ — warm smile (orange, blends with dupatta)          *
 *  ♦♦♦ — choker necklace (teal/green)                        *
 *  ▓  — poshak / traditional outfit body (orange/gold)       *
 * ────────────────────────────────────────────────────────── */

const IDLE_1 = [
  "       ✦       ",
  "    ╭──┴──╮    ",
  "    │  ●  │    ",
  "    │◕   ◕│    ",
  "    │  ◇  │    ",
  "    │╰───╯│    ",
  "    ╰┬♦♦♦┬╯    ",
  "     │▓▓▓│     ",
  "     │▓▓▓│     ",
  "     ╰┬─┬╯     ",
  "      ╰─╯      ",
];

const IDLE_2 = [
  "       ✦       ",
  "    ╭──┴──╮    ",
  "    │  ●  │    ",
  "    │–   –│    ",
  "    │  ◇  │    ",
  "    │╰───╯│    ",
  "    ╰┬♦♦♦┬╯    ",
  "     │▓▓▓│     ",
  "     │▓▓▓│     ",
  "     ╰┬─┬╯     ",
  "      ╰─╯      ",
];

const IDLE_3 = [
  "       ✦       ",
  "    ╭──┴──╮    ",
  "    │  ●  │    ",
  "    │◕   ◕│    ",
  "    │  ◇  │    ",
  "    │╰───╯│    ",
  "    ╰┬♦♦♦┬╯    ",
  "     │▓▓▓│     ",
  "     │▓▓▓│     ",
  "     ╰┬─┬╯     ",
  "      ╰─╯      ",
];

const THINK_1 = [
  "       ✦     · ",
  "    ╭──┴──╮    ",
  "    │  ●  │    ",
  "    │◐   ◐│    ",
  "    │  ◇  │    ",
  "    │ ——— │    ",
  "    ╰┬♦♦♦┬╯    ",
  "     │▓▓▓│     ",
  "     │▓▓▓│     ",
  "     ╰┬─┬╯     ",
  "      ╰─╯      ",
];

const THINK_2 = [
  "       ✦    ·· ",
  "    ╭──┴──╮    ",
  "    │  ●  │    ",
  "    │ ◑  ◑│    ",
  "    │  ◇  │    ",
  "    │ ——— │    ",
  "    ╰┬♦♦♦┬╯    ",
  "     │▓▓▓│     ",
  "     │▓▓▓│     ",
  "     ╰┬─┬╯     ",
  "      ╰─╯      ",
];

const THINK_3 = [
  "       ✦   ··· ",
  "    ╭──┴──╮    ",
  "    │  ●  │    ",
  "    │◕   ◕│    ",
  "    │  ◇  │    ",
  "    │ ——— │    ",
  "    ╰┬♦♦♦┬╯    ",
  "     │▓▓▓│     ",
  "     │▓▓▓│     ",
  "     ╰┬─┬╯     ",
  "      ╰─╯      ",
];

const HAPPY_1 = [
  "       ✦     ✧ ",
  "    ╭──┴──╮    ",
  "    │  ●  │    ",
  "    │◕   ◕│    ",
  "    │  ◇  │    ",
  "    │◡◡◡◡◡│    ",
  "    ╰┬♦♦♦┬╯    ",
  "     │▓▓▓│     ",
  "     │▓▓▓│     ",
  "     ╰┬─┬╯     ",
  "      ╰─╯      ",
];

const HAPPY_2 = [
  "       ✦    ♥  ",
  "    ╭──┴──╮    ",
  "    │  ●  │    ",
  "    │◕   ◕│    ",
  "    │  ◇  │    ",
  "    │◡◡◡◡◡│    ",
  "    ╰┬♦♦♦┬╯    ",
  "     │▓▓▓│     ",
  "     │▓▓▓│     ",
  "     ╰┬─┬╯     ",
  "      ╰─╯      ",
];

/* ─── Frame sequences & timing ───────────────────────────── */
interface Sequence {
  frames: string[][];
  durations: number[];
}

const SEQUENCES: Record<Mood, Sequence> = {
  idle: {
    // Long hold → blink → hold → gentle sway frame
    frames:    [IDLE_1, IDLE_1, IDLE_1, IDLE_1, IDLE_3, IDLE_3, IDLE_3, IDLE_2, IDLE_1],
    durations: [  400,    400,    400,    400,    400,    400,    400,    160,    160  ],
  },
  thinking: {
    frames:    [THINK_1, THINK_2, THINK_3],
    durations: [  480,     480,     480  ],
  },
  happy: {
    frames:    [HAPPY_1, HAPPY_2, HAPPY_1, HAPPY_2],
    durations: [  280,     280,     280,     280  ],
  },
};

/* ─── Component ──────────────────────────────────────────── */
export function UmaCharacter({
  mood = "idle",
  compact = false,
  className = "",
}: UmaCharacterProps) {
  const [frameIdx, setFrameIdx] = useState(0);

  /* Frame cycling — restarts from 0 each time mood changes.
     The synchronous setFrameIdx(0) resets the visible frame immediately
     when mood changes; the timer-based advance() drives subsequent frames. */
  useEffect(() => {
    let idx = 0;
    const seq = SEQUENCES[mood];
    let timer: ReturnType<typeof setTimeout>;

    function advance() {
      idx = (idx + 1) % seq.frames.length;
      setFrameIdx(idx);
      timer = setTimeout(advance, seq.durations[idx]);
    }

    // Reset to frame 0 immediately, then start advancing
    timer = setTimeout(() => {
      setFrameIdx(0);
      timer = setTimeout(advance, seq.durations[0]);
    }, 0);

    return () => clearTimeout(timer);
  }, [mood]);

  /* Resolve current frame */
  const seq = SEQUENCES[mood];
  const frame = seq.frames[frameIdx % seq.frames.length];
  const lines = compact ? frame.slice(0, 7) : frame;

  /* Bounce offset for happy mood */
  const bounceY = mood === "happy" ? (frameIdx % 2 === 1 ? -3 : -1) : 0;

  return (
    <pre
      className={`uma-character ${className}`}
      role="img"
      aria-label={
        mood === "thinking"
          ? "Uma character thinking"
          : mood === "happy"
            ? "Uma character celebrating"
            : "Uma character idle"
      }
      style={{
        fontFamily: "'Courier New', Consolas, 'Liberation Mono', monospace",
        fontSize: compact ? "5.5px" : undefined,
        lineHeight: compact ? 1.2 : 1.18,
        margin: 0,
        padding: 0,
        userSelect: "none",
        transform: `translateY(${bounceY}px)`,
        transition: "transform 160ms ease-out",
        whiteSpace: "pre",
        overflow: "hidden",
      }}
    >
      {lines.map((line, li) => (
        <span key={li}>
          {Array.from(line).map((ch, ci) => (
            <span key={ci} style={{ color: charColor(ch) }}>
              {ch}
            </span>
          ))}
          {li < lines.length - 1 ? "\n" : ""}
        </span>
      ))}
    </pre>
  );
}
