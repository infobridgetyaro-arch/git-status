/**
 * GiftPopup — TikTok-style gift notification overlay for the control room.
 *
 * Receives `gift_received` WebSocket events. Renders a browser-side animated
 * popup with tier-specific colors, particle effects, and Web Audio sounds.
 * Auto-dismisses after the gift's display duration.
 *
 * Does NOT touch the Paystack integration, webhooks, or server-side overlay.
 */

import { useEffect, useRef, useState } from "react";

export type GiftTier        = "silver" | "gold" | "university";
export type GiftDisplayMode = "minimal" | "standard" | "hype";
export type SoundKey        = "chime" | "pop" | "whoosh" | "boom";

export interface GiftDef {
  id:            string;
  name:          string;
  icon:          string;
  tier:          GiftTier;
  displayMode:   GiftDisplayMode;
  primaryColor:  string;
  glowColor:     string;
  accentColor:   string;
  durationMs:    number;
  soundKey:      SoundKey;
}

export interface GiftEvent {
  id:         string;
  donorName:  string;
  amount:     string;
  amountKes:  number;
  message:    string;
  gift:       GiftDef;
  ts:         number;
  comboCount: number;
}

function playGiftSound(soundKey: SoundKey, volume = 0.35) {
  try {
    const AudioContextCls =
      (window as any).AudioContext ?? (window as any).webkitAudioContext;
    if (!AudioContextCls) return;
    const actx  = new AudioContextCls() as AudioContext;
    const gain  = actx.createGain();
    gain.gain.setValueAtTime(volume, actx.currentTime);
    gain.connect(actx.destination);

    switch (soundKey) {
      case "chime": {
        [880, 1100, 1320].forEach((freq, i) => {
          const osc = actx.createOscillator();
          const g   = actx.createGain();
          osc.type = "sine";
          osc.frequency.setValueAtTime(freq, actx.currentTime + i * 0.08);
          g.gain.setValueAtTime(0, actx.currentTime + i * 0.08);
          g.gain.linearRampToValueAtTime(volume * 0.9, actx.currentTime + i * 0.08 + 0.02);
          g.gain.exponentialRampToValueAtTime(0.001, actx.currentTime + i * 0.08 + 0.6);
          osc.connect(g); g.connect(actx.destination);
          osc.start(actx.currentTime + i * 0.08);
          osc.stop(actx.currentTime + i * 0.08 + 0.65);
        });
        break;
      }
      case "pop": {
        const osc = actx.createOscillator();
        const g   = actx.createGain();
        osc.type = "triangle";
        osc.frequency.setValueAtTime(600, actx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(220, actx.currentTime + 0.12);
        g.gain.setValueAtTime(volume, actx.currentTime);
        g.gain.exponentialRampToValueAtTime(0.001, actx.currentTime + 0.35);
        osc.connect(g); g.connect(actx.destination);
        osc.start(); osc.stop(actx.currentTime + 0.38);
        // Sparkle overtone
        const osc2 = actx.createOscillator();
        const g2   = actx.createGain();
        osc2.type = "sine";
        osc2.frequency.setValueAtTime(1200, actx.currentTime + 0.05);
        osc2.frequency.exponentialRampToValueAtTime(880, actx.currentTime + 0.25);
        g2.gain.setValueAtTime(volume * 0.5, actx.currentTime + 0.05);
        g2.gain.exponentialRampToValueAtTime(0.001, actx.currentTime + 0.4);
        osc2.connect(g2); g2.connect(actx.destination);
        osc2.start(actx.currentTime + 0.05); osc2.stop(actx.currentTime + 0.45);
        break;
      }
      case "whoosh": {
        const bufSize = actx.sampleRate * 0.5;
        const buf     = actx.createBuffer(1, bufSize, actx.sampleRate);
        const data    = buf.getChannelData(0);
        for (let i = 0; i < bufSize; i++) data[i] = Math.random() * 2 - 1;
        const src  = actx.createBufferSource();
        src.buffer = buf;
        const filter = actx.createBiquadFilter();
        filter.type = "bandpass";
        filter.frequency.setValueAtTime(200, actx.currentTime);
        filter.frequency.exponentialRampToValueAtTime(3000, actx.currentTime + 0.4);
        filter.Q.value = 0.5;
        const g = actx.createGain();
        g.gain.setValueAtTime(volume * 0.8, actx.currentTime);
        g.gain.exponentialRampToValueAtTime(0.001, actx.currentTime + 0.55);
        src.connect(filter); filter.connect(g); g.connect(actx.destination);
        src.start(); src.stop(actx.currentTime + 0.6);
        // Rising tone
        const osc = actx.createOscillator();
        const g2  = actx.createGain();
        osc.type = "sawtooth";
        osc.frequency.setValueAtTime(80, actx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(400, actx.currentTime + 0.45);
        g2.gain.setValueAtTime(volume * 0.3, actx.currentTime);
        g2.gain.exponentialRampToValueAtTime(0.001, actx.currentTime + 0.5);
        osc.connect(g2); g2.connect(actx.destination);
        osc.start(); osc.stop(actx.currentTime + 0.55);
        break;
      }
      case "boom": {
        // Sub boom
        const osc = actx.createOscillator();
        const g   = actx.createGain();
        osc.type = "sine";
        osc.frequency.setValueAtTime(90, actx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(35, actx.currentTime + 0.35);
        g.gain.setValueAtTime(volume * 1.2, actx.currentTime);
        g.gain.exponentialRampToValueAtTime(0.001, actx.currentTime + 0.6);
        osc.connect(g); g.connect(actx.destination);
        osc.start(); osc.stop(actx.currentTime + 0.65);
        // Noise burst
        const bufSize = actx.sampleRate * 0.3;
        const buf     = actx.createBuffer(1, bufSize, actx.sampleRate);
        const data    = buf.getChannelData(0);
        for (let i = 0; i < bufSize; i++) data[i] = Math.random() * 2 - 1;
        const src  = actx.createBufferSource();
        src.buffer = buf;
        const g2   = actx.createGain();
        g2.gain.setValueAtTime(volume * 0.5, actx.currentTime);
        g2.gain.exponentialRampToValueAtTime(0.001, actx.currentTime + 0.3);
        src.connect(g2); g2.connect(actx.destination);
        src.start(); src.stop(actx.currentTime + 0.35);
        // Sparkle bells (university tier)
        [1320, 1760, 2200].forEach((freq, i) => {
          const o = actx.createOscillator();
          const gv = actx.createGain();
          o.type = "sine";
          o.frequency.value = freq;
          gv.gain.setValueAtTime(0, actx.currentTime + 0.18 + i * 0.07);
          gv.gain.linearRampToValueAtTime(volume * 0.4, actx.currentTime + 0.2 + i * 0.07);
          gv.gain.exponentialRampToValueAtTime(0.001, actx.currentTime + 0.7 + i * 0.07);
          o.connect(gv); gv.connect(actx.destination);
          o.start(actx.currentTime + 0.18 + i * 0.07);
          o.stop(actx.currentTime + 0.75 + i * 0.07);
        });
        break;
      }
    }
    gain.disconnect();
    setTimeout(() => { try { actx.close(); } catch {} }, 3000);
  } catch { /* AudioContext unavailable — silent fallback */ }
}

// ── Particle canvas overlay ─────────────────────────────────────────────────

function ParticleCanvas({
  gift, show, mode,
}: { gift: GiftDef; show: boolean; mode: GiftDisplayMode }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef    = useRef<number>(0);
  const startRef  = useRef<number>(0);

  useEffect(() => {
    if (!show || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx    = canvas.getContext("2d");
    if (!ctx) return;

    const count  = mode === "hype" ? 36 : mode === "standard" ? 16 : 8;
    const maxR   = mode === "hype" ? Math.min(canvas.width, canvas.height) * 0.42
                 : mode === "standard" ? 80 : 40;
    const dur    = gift.durationMs;
    const cx     = canvas.width  / 2;
    const cy     = canvas.height / 2;

    startRef.current = performance.now();

    function frame(now: number) {
      if (!ctx || !canvas) return;
      const ageMs    = now - startRef.current;
      const progress = Math.min(1, ageMs / dur);
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const FADE_START = 0.52;
      for (let i = 0; i < count; i++) {
        const phase  = i / count;
        const orbit  = ageMs * 0.0015 * (i % 2 === 0 ? 1 : -1.3);
        const angle  = phase * Math.PI * 2 + orbit;
        const spread = maxR * Math.pow(Math.min(1, progress * 1.7), 0.52);
        const wobble = Math.sin(ageMs * 0.004 + i * 2.3) * spread * 0.11;
        const px     = cx + Math.cos(angle) * (spread + wobble);
        const py     = cy + Math.sin(angle) * (spread + wobble) * 0.72;
        const fade   = progress > FADE_START
          ? Math.max(0, 1 - (progress - FADE_START) / (1 - FADE_START)) : 1;
        const size   = Math.max(1.5, (3 + Math.sin(i * 1.7 + ageMs * 0.006) * 2) * fade);
        const color  = i % 3 === 0 ? gift.primaryColor : (i % 3 === 1 ? gift.accentColor : gift.glowColor);
        ctx.globalAlpha = fade * 0.85;
        ctx.fillStyle   = color;
        ctx.beginPath();
        ctx.arc(px, py, size, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      if (ageMs < dur) rafRef.current = requestAnimationFrame(frame);
    }

    rafRef.current = requestAnimationFrame(frame);
    return () => { cancelAnimationFrame(rafRef.current); };
  }, [show, gift, mode]);

  return (
    <canvas
      ref={canvasRef}
      width={mode === "hype" ? 600 : mode === "standard" ? 400 : 200}
      height={mode === "hype" ? 400 : mode === "standard" ? 200 : 120}
      className="absolute inset-0 w-full h-full pointer-events-none"
    />
  );
}

// ── Glow ring animation (hype mode) ────────────────────────────────────────

function GlowRings({ gift }: { gift: GiftDef }) {
  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden rounded-inherit">
      {[0, 1, 2].map(i => (
        <div
          key={i}
          className="absolute inset-0 rounded-full border-2"
          style={{
            borderColor: gift.primaryColor,
            animation: `giftRing 1.8s ${i * 0.6}s infinite ease-out`,
            opacity: 0,
          }}
        />
      ))}
    </div>
  );
}

// ── Main GiftPopup component ────────────────────────────────────────────────

interface GiftPopupProps {
  event: GiftEvent | null;
  onDismiss: () => void;
}

export function GiftPopup({ event, onDismiss }: GiftPopupProps) {
  const [visible, setVisible] = useState(false);
  const [animOut, setAnimOut] = useState(false);
  const soundPlayed  = useRef<string>("");

  useEffect(() => {
    if (!event) { setVisible(false); setAnimOut(false); return; }

    setAnimOut(false);
    setVisible(true);

    // Play sound once per event id
    if (soundPlayed.current !== event.id) {
      soundPlayed.current = event.id;
      playGiftSound(event.gift.soundKey, event.gift.tier === "university" ? 0.45 : 0.3);
    }

    const fadeAt = Math.max(event.gift.durationMs - 700, event.gift.durationMs * 0.8);
    const total  = event.gift.durationMs;

    const t1 = setTimeout(() => setAnimOut(true), fadeAt);
    const t2 = setTimeout(() => { setVisible(false); onDismiss(); }, total);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [event]);

  if (!visible || !event) return null;

  const { gift } = event;
  const mode     = gift.displayMode;

  const baseStyles = {
    "--gift-primary": gift.primaryColor,
    "--gift-glow":    gift.glowColor,
    "--gift-accent":  gift.accentColor,
  } as React.CSSProperties;

  if (mode === "minimal") {
    return (
      <>
        <style>{GIFT_KEYFRAMES}</style>
        <div
          className="fixed z-[9999] pointer-events-none"
          style={{ top: 16, right: 16, ...baseStyles }}
        >
          <div
            className="relative flex items-center gap-2 rounded-xl overflow-hidden"
            style={{
              background: "rgba(4, 6, 24, 0.95)",
              border: `2px solid ${gift.primaryColor}`,
              boxShadow: `0 0 20px ${gift.glowColor}66`,
              padding: "10px 14px",
              minWidth: 220,
              animation: animOut ? "giftFadeOut 0.5s ease-in forwards" : "giftSlideIn 0.4s cubic-bezier(0.34, 1.56, 0.64, 1) forwards",
            }}
          >
            <div className="absolute left-0 top-0 bottom-0 w-1 rounded-l-xl" style={{ background: gift.primaryColor }} />
            <span className="text-3xl pl-1">{gift.icon}</span>
            <div className="flex flex-col min-w-0">
              <span className="text-xs font-bold" style={{ color: gift.accentColor }}>{gift.name}</span>
              <span className="text-sm font-bold text-white truncate">{event.donorName.split(" ")[0]}</span>
            </div>
            <div className="ml-auto text-right shrink-0">
              <span className="text-sm font-bold" style={{ color: gift.primaryColor }}>{event.amount}</span>
              {event.comboCount > 1 && (
                <div className="text-xs font-black text-orange-500">🔥{event.comboCount}x</div>
              )}
            </div>
            <ParticleCanvas gift={gift} show={visible} mode="minimal" />
          </div>
        </div>
      </>
    );
  }

  if (mode === "standard") {
    return (
      <>
        <style>{GIFT_KEYFRAMES}</style>
        <div
          className="fixed z-[9999] inset-x-0 bottom-32 flex justify-center pointer-events-none"
          style={baseStyles}
        >
          <div
            className="relative rounded-2xl overflow-hidden"
            style={{
              background: "rgba(3, 5, 20, 0.95)",
              border: `2.5px solid ${gift.primaryColor}`,
              boxShadow: `0 0 40px ${gift.glowColor}66, 0 0 80px ${gift.glowColor}33`,
              padding: "0",
              width: "min(520px, 90vw)",
              animation: animOut
                ? "giftFadeOut 0.6s ease-in forwards"
                : "giftPopIn 0.45s cubic-bezier(0.34, 1.56, 0.64, 1) forwards",
            }}
          >
            {/* Top accent strip with tier badge */}
            <div
              className="flex items-center justify-end px-3 py-1"
              style={{ background: gift.primaryColor, height: 28 }}
            >
              <span className="text-xs font-bold text-white opacity-90">
                {gift.tier === "university" ? "🎓 UNIVERSITY" : gift.tier === "gold" ? "🥇 GOLD" : "🥈 SILVER"}
              </span>
            </div>

            {/* Body */}
            <div className="flex items-center gap-4 px-4 py-3">
              {/* Icon with glow */}
              <div
                className="shrink-0 text-5xl"
                style={{
                  filter: `drop-shadow(0 0 14px ${gift.glowColor})`,
                  animation: "giftIconPulse 2s ease-in-out infinite",
                }}
              >
                {gift.icon}
              </div>

              {/* Text */}
              <div className="flex flex-col min-w-0 flex-1">
                <span
                  className="text-base font-black"
                  style={{ color: gift.primaryColor, textShadow: `0 0 8px ${gift.glowColor}` }}
                >
                  {gift.name}
                </span>
                <span className="text-xl font-bold text-white truncate">{event.donorName}</span>
                <span className="text-sm font-bold" style={{ color: gift.accentColor }}>{event.amount}</span>
              </div>

              {/* Combo badge */}
              {event.comboCount > 1 && (
                <div
                  className="shrink-0 text-center"
                  style={{ animation: "giftComboSpin 0.4s ease-out" }}
                >
                  <div className="text-xl font-black text-orange-500" style={{ textShadow: "0 0 12px #ff6b35" }}>
                    🔥 {event.comboCount}x
                  </div>
                  <div className="text-xs text-orange-400 font-bold">COMBO</div>
                </div>
              )}
            </div>

            {/* Message */}
            {event.message && (
              <div className="px-4 pb-2">
                <span className="text-xs text-white/60 italic">"{event.message}"</span>
              </div>
            )}

            <ParticleCanvas gift={gift} show={visible} mode="standard" />
          </div>
        </div>
      </>
    );
  }

  // Hype mode (university tier)
  return (
    <>
      <style>{GIFT_KEYFRAMES}</style>
      <div
        className="fixed inset-0 z-[9999] flex flex-col items-center justify-center pointer-events-none"
        style={{
          ...baseStyles,
          background: "radial-gradient(ellipse at center, rgba(0,0,0,0.0) 0%, rgba(0,0,0,0.65) 60%, rgba(0,0,0,0.92) 100%)",
          animation: animOut ? "giftFadeOut 0.7s ease-in forwards" : "giftHypeIn 0.3s ease-out forwards",
        }}
      >
        {/* Glow rings */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          {[0, 1, 2].map(i => (
            <div
              key={i}
              className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border-2"
              style={{
                width: "60vmin", height: "60vmin",
                borderColor: gift.primaryColor,
                animation: `giftRing 1.8s ${i * 0.6}s ease-out infinite`,
                opacity: 0,
              }}
            />
          ))}
        </div>

        {/* Large icon */}
        <div
          className="text-[12vmin] mb-4"
          style={{
            filter: `drop-shadow(0 0 30px ${gift.glowColor}) drop-shadow(0 0 60px ${gift.glowColor})`,
            animation: "giftHypeIcon 0.5s cubic-bezier(0.34, 1.56, 0.64, 1) forwards",
          }}
        >
          {gift.icon}
        </div>

        {/* Category label */}
        <div
          className="text-lg font-black mb-2 text-center"
          style={{
            color: gift.primaryColor,
            textShadow: `0 0 20px ${gift.glowColor}`,
            animation: "giftTextIn 0.4s 0.25s ease-out both",
          }}
        >
          {gift.icon} {gift.name.toUpperCase()} {gift.icon}
        </div>

        {/* Donor name */}
        <div
          className="text-4xl font-black text-white mb-3 text-center"
          style={{
            textShadow: "0 2px 12px rgba(0,0,0,0.9)",
            animation: "giftTextIn 0.4s 0.3s ease-out both",
          }}
        >
          {event.donorName}
        </div>

        {/* Amount pill */}
        <div
          className="px-8 py-2 rounded-full font-black text-xl text-white mb-4"
          style={{
            background: gift.primaryColor,
            boxShadow: `0 0 20px ${gift.glowColor}, 0 0 40px ${gift.glowColor}66`,
            animation: "giftTextIn 0.4s 0.35s ease-out both",
          }}
        >
          {event.amount}
        </div>

        {/* Combo */}
        {event.comboCount > 1 && (
          <div
            className="text-3xl font-black text-orange-500 text-center"
            style={{
              textShadow: "0 0 20px #ff6b35",
              animation: "giftTextIn 0.4s 0.4s ease-out both, giftComboSpin 0.4s ease-out",
            }}
          >
            🔥 {event.comboCount}x COMBO!
          </div>
        )}

        {/* Message */}
        {event.message && (
          <div
            className="mt-3 px-6 py-2 rounded-lg max-w-sm text-center"
            style={{
              background: "rgba(0,0,0,0.5)",
              animation: "giftTextIn 0.4s 0.45s ease-out both",
            }}
          >
            <span className="text-sm text-white/75 italic">"{event.message}"</span>
          </div>
        )}

        <ParticleCanvas gift={gift} show={visible} mode="hype" />
      </div>
    </>
  );
}

// ── CSS keyframes (injected via <style> tag) ────────────────────────────────

const GIFT_KEYFRAMES = `
@keyframes giftSlideIn {
  from { transform: translateX(110%); opacity: 0; }
  to   { transform: translateX(0);   opacity: 1; }
}
@keyframes giftFadeOut {
  from { opacity: 1; transform: scale(1); }
  to   { opacity: 0; transform: scale(0.92); }
}
@keyframes giftPopIn {
  from { transform: scale(0.75); opacity: 0; }
  to   { transform: scale(1);    opacity: 1; }
}
@keyframes giftHypeIn {
  from { opacity: 0; }
  to   { opacity: 1; }
}
@keyframes giftHypeIcon {
  from { transform: scale(0.4) rotate(-8deg); opacity: 0; }
  to   { transform: scale(1)   rotate(0deg);  opacity: 1; }
}
@keyframes giftTextIn {
  from { transform: translateY(16px); opacity: 0; }
  to   { transform: translateY(0);    opacity: 1; }
}
@keyframes giftIconPulse {
  0%, 100% { transform: scale(1); }
  50%       { transform: scale(1.08); }
}
@keyframes giftComboSpin {
  from { transform: scale(0.5) rotate(-15deg); }
  to   { transform: scale(1)   rotate(0deg); }
}
@keyframes giftRing {
  0%   { transform: translate(-50%, -50%) scale(0.2); opacity: 0.6; }
  100% { transform: translate(-50%, -50%) scale(1.8); opacity: 0;   }
}
`;
