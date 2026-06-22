/**
 * donation-panel.tsx
 *
 * Control room panel for the self-generating QR Donation system.
 * Shows live donation feed, total raised, and overlay controls.
 */

import { useState, useEffect, useRef } from "react";
import { Heart, Wifi, WifiOff, RefreshCw, ExternalLink, Copy, CheckCheck } from "lucide-react";

export interface DonationRecord {
  id: string;
  name: string;
  amount: string;
  amountKes: number;
  currency: string;
  message: string;
  channel: string;
  reference: string;
  color: string;
  ts: number;
}

interface GatewayInfo {
  gatewayUrl: string;
  configured: boolean;
  paystackConfigured: boolean;
}

interface HealthInfo {
  status: string;
  totalRaised: number;
  donationCount: number;
  paystackConfigured: boolean;
}

interface DonationPanelProps {
  accent?: string;
  donationTickerActive: boolean;
  donationAlertActive: boolean;
  onToggleTicker: (active: boolean) => void;
  onToggleAlert: (active: boolean) => void;
  // Called when a new donation_alert WS event arrives
  latestDonation?: DonationRecord | null;
}

export function DonationPanel({
  accent = "#22c55e",
  donationTickerActive,
  donationAlertActive,
  onToggleTicker,
  onToggleAlert,
  latestDonation,
}: DonationPanelProps) {
  const [donations, setDonations]     = useState<DonationRecord[]>([]);
  const [gatewayInfo, setGatewayInfo] = useState<GatewayInfo | null>(null);
  const [health, setHealth]           = useState<HealthInfo | null>(null);
  const [loading, setLoading]         = useState(false);
  const [copied, setCopied]           = useState(false);
  const [qrDataUrl, setQrDataUrl]     = useState("");
  const feedRef                       = useRef<HTMLDivElement>(null);

  const fetchAll = async () => {
    setLoading(true);
    try {
      const [urlRes, healthRes, donRes] = await Promise.all([
        fetch("/api/gateway/url", { credentials: "include" }),
        fetch("/api/gateway/health", { credentials: "include" }),
        fetch("/api/gateway/donations", { credentials: "include" }),
      ]);
      if (urlRes.ok)    setGatewayInfo(await urlRes.json() as GatewayInfo);
      if (healthRes.ok) setHealth(await healthRes.json() as HealthInfo);
      if (donRes.ok) {
        const d = await donRes.json() as { donations: DonationRecord[] };
        setDonations(d.donations.slice().reverse());
      }
    } catch {}
    setLoading(false);
  };

  useEffect(() => { void fetchAll(); }, []);

  // Add new donation when WS event arrives
  useEffect(() => {
    if (!latestDonation) return;
    setDonations(prev => {
      if (prev.some(d => d.id === latestDonation.id)) return prev;
      return [latestDonation, ...prev].slice(0, 50);
    });
    // Update health counter
    setHealth(h => h ? { ...h, totalRaised: h.totalRaised + latestDonation.amountKes, donationCount: h.donationCount + 1 } : h);
    // Scroll to top of feed
    setTimeout(() => { feedRef.current?.scrollTo({ top: 0, behavior: "smooth" }); }, 100);
  }, [latestDonation]);

  // Build QR preview URL using qrserver.com
  useEffect(() => {
    if (gatewayInfo?.gatewayUrl) {
      setQrDataUrl(`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(gatewayInfo.gatewayUrl)}&color=000000&bgcolor=ffffff&margin=2`);
    }
  }, [gatewayInfo?.gatewayUrl]);

  const copyUrl = () => {
    if (gatewayInfo?.gatewayUrl) {
      navigator.clipboard.writeText(gatewayInfo.gatewayUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const isHealthy = health?.status === "ok";
  const totalRaised = health?.totalRaised ?? 0;
  const donationCount = health?.donationCount ?? 0;

  const Label = ({ children }: { children: React.ReactNode }) => (
    <div style={{ fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,0.35)", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 6 }}>{children}</div>
  );

  const ToggleBtn = ({ active, onToggle, label, icon }: { active: boolean; onToggle: () => void; label: string; icon: string }) => (
    <button
      onClick={onToggle}
      style={{
        display: "flex", alignItems: "center", gap: 8, padding: "8px 14px",
        borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: "pointer",
        border: `1px solid ${active ? accent : "rgba(255,255,255,0.12)"}`,
        background: active ? `${accent}22` : "rgba(255,255,255,0.04)",
        color: active ? "#86efac" : "rgba(255,255,255,0.45)",
        transition: "all 0.18s ease", flex: 1,
      }}
    >
      <span style={{ fontSize: 14 }}>{icon}</span>
      <span>{active ? `${label} On` : label}</span>
      {active && <div style={{ width: 6, height: 6, borderRadius: "50%", background: accent, marginLeft: "auto", animation: "cr-pulse 1s infinite" }} />}
    </button>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>

      {/* ── Gateway URL & QR ─────────────────────────────────────────────────── */}
      <div style={{ borderRadius: 12, overflow: "hidden", background: "linear-gradient(135deg, rgba(34,197,94,0.08) 0%, rgba(16,185,129,0.04) 100%)", border: "1px solid rgba(34,197,94,0.2)", padding: 16 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Heart size={14} color={accent} />
            <span style={{ fontSize: 12, fontWeight: 700, color: "#86efac" }}>Donation Gateway</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            {health !== null && (
              <div style={{ display: "flex", alignItems: "center", gap: 5, padding: "3px 9px", borderRadius: 99, background: isHealthy ? "rgba(34,197,94,0.12)" : "rgba(239,68,68,0.12)", border: `1px solid ${isHealthy ? "rgba(34,197,94,0.3)" : "rgba(239,68,68,0.3)"}` }}>
                {isHealthy ? <Wifi size={9} color={accent} /> : <WifiOff size={9} color="#f87171" />}
                <span style={{ fontSize: 9, fontWeight: 700, color: isHealthy ? accent : "#f87171" }}>{isHealthy ? "LIVE" : "OFFLINE"}</span>
              </div>
            )}
            <button onClick={fetchAll} disabled={loading} style={{ background: "transparent", border: "none", cursor: "pointer", color: "rgba(255,255,255,0.35)", padding: 2 }}>
              <RefreshCw size={12} style={{ animation: loading ? "spin 1s linear infinite" : "none" }} />
            </button>
          </div>
        </div>

        {gatewayInfo?.gatewayUrl ? (
          <>
            {/* QR code */}
            <div style={{ display: "flex", justifyContent: "center", marginBottom: 12 }}>
              <div style={{ padding: 10, background: "#fff", borderRadius: 12, boxShadow: "0 0 20px rgba(34,197,94,0.2)", border: "2px solid rgba(34,197,94,0.3)" }}>
                <img src={qrDataUrl} alt="Donation QR" width={140} height={140} style={{ display: "block" }} />
              </div>
            </div>

            {/* URL */}
            <div style={{ background: "rgba(0,0,0,0.25)", borderRadius: 8, padding: "9px 12px", display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <span style={{ flex: 1, fontSize: 10, color: "rgba(255,255,255,0.55)", fontFamily: "monospace", wordBreak: "break-all", lineHeight: 1.4 }}>{gatewayInfo.gatewayUrl}</span>
              <button onClick={copyUrl} title="Copy URL" style={{ flexShrink: 0, background: "transparent", border: "none", cursor: "pointer", color: copied ? accent : "rgba(255,255,255,0.4)", padding: 2 }}>
                {copied ? <CheckCheck size={14} /> : <Copy size={14} />}
              </button>
              <a href={gatewayInfo.gatewayUrl} target="_blank" rel="noopener noreferrer" style={{ color: "rgba(255,255,255,0.4)", display: "flex" }}>
                <ExternalLink size={14} />
              </a>
            </div>

            {!gatewayInfo.paystackConfigured && (
              <div style={{ padding: "8px 12px", borderRadius: 8, background: "rgba(251,191,36,0.08)", border: "1px solid rgba(251,191,36,0.2)", fontSize: 10, color: "#fcd34d", lineHeight: 1.5 }}>
                ⚠️ Add <code>PAYSTACK_SECRET_KEY</code> to environment secrets to enable live payments.
              </div>
            )}
          </>
        ) : (
          <div style={{ textAlign: "center", padding: "12px 0", color: "rgba(255,255,255,0.3)", fontSize: 11 }}>
            URL detected automatically when deployed. Run on Replit to see the QR code.
          </div>
        )}
      </div>

      {/* ── Stats row ────────────────────────────────────────────────────────── */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        {[
          { label: "Total Raised", value: `KES ${totalRaised.toLocaleString("en-KE", { minimumFractionDigits: 0 })}`, color: accent },
          { label: "Donations", value: String(donationCount), color: "#818cf8" },
        ].map(s => (
          <div key={s.label} style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 10, padding: "12px 14px" }}>
            <div style={{ fontSize: 10, color: "rgba(255,255,255,0.35)", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.06em" }}>{s.label}</div>
            <div style={{ fontSize: 20, fontWeight: 800, color: s.color, fontFamily: "'Space Grotesk', sans-serif" }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* ── Overlay controls ─────────────────────────────────────────────────── */}
      <div>
        <Label>Stream Overlay</Label>
        <div style={{ display: "flex", gap: 8 }}>
          <ToggleBtn active={donationAlertActive} onToggle={() => onToggleAlert(!donationAlertActive)} label="Pop-up Alert" icon="🎉" />
          <ToggleBtn active={donationTickerActive} onToggle={() => onToggleTicker(!donationTickerActive)} label="Ticker" icon="💚" />
        </div>
        <div style={{ marginTop: 8, fontSize: 10, color: "rgba(255,255,255,0.25)", lineHeight: 1.5 }}>
          Pop-up Alert shows each donation for ~8 s. Ticker scrolls the latest donors at the bottom of the stream.
        </div>
      </div>

      {/* ── Live donation feed ───────────────────────────────────────────────── */}
      <div>
        <Label>Live Donations</Label>
        <div ref={feedRef} style={{ maxHeight: 260, overflowY: "auto", display: "flex", flexDirection: "column", gap: 6 }}>
          {donations.length === 0 && (
            <div style={{ textAlign: "center", padding: "20px 0", color: "rgba(255,255,255,0.2)", fontSize: 11 }}>
              No donations yet. Share the QR code on stream!
            </div>
          )}
          {donations.map(d => (
            <div key={d.id} style={{
              padding: "10px 12px", borderRadius: 10,
              background: "rgba(255,255,255,0.04)",
              border: `1px solid ${d.color}33`,
              borderLeft: `3px solid ${d.color}`,
              display: "flex", alignItems: "center", gap: 10,
              animation: "slideIn 0.3s ease",
            }}>
              <div style={{ width: 32, height: 32, borderRadius: "50%", background: `${d.color}22`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <span style={{ fontSize: 14 }}>💚</span>
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: "#fff", display: "flex", alignItems: "center", gap: 6 }}>
                  <span>{d.name}</span>
                  <span style={{ padding: "1px 7px", borderRadius: 99, background: `${d.color}22`, color: d.color, fontSize: 10, fontWeight: 700 }}>{d.amount}</span>
                </div>
                {d.message && <div style={{ fontSize: 10, color: "rgba(255,255,255,0.45)", marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>"{d.message}"</div>}
                <div style={{ fontSize: 9, color: "rgba(255,255,255,0.25)", marginTop: 2 }}>
                  {new Date(d.ts).toLocaleTimeString()} · {d.channel}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ padding: "8px 12px", borderRadius: 8, background: "rgba(34,197,94,0.05)", border: "1px solid rgba(34,197,94,0.1)", fontSize: 10, color: "rgba(255,255,255,0.3)", lineHeight: 1.6 }}>
        The QR code auto-updates when the container URL changes. No manual configuration needed.
      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes slideIn { from { opacity: 0; transform: translateY(-6px); } to { opacity: 1; transform: translateY(0); } }
      `}</style>
    </div>
  );
}
