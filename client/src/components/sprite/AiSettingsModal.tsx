"use client";

import { useEffect, useState } from "react";
import { Bot, Eye, EyeOff, FlaskConical, KeyRound, Save, ShieldCheck, Trash2, Wand2, CheckCircle2, XCircle, ExternalLink } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Select } from "@/components/ui/Select";
import { Spinner } from "@/components/ui/Loading";
import { api, ApiError } from "@/lib/api";
import { useAuthStore } from "@/store/auth-store";
import { useAppStore } from "@/store/app-store";

interface AiSettings {
  provider: "mock" | "openai";
  openai: { keySet: boolean; keyHint: string | null; model: string; visionModel?: string; quality: string; background: string };
  limits: { dailyLimit: number; maxCandidates: number; costPerImageUsd: number };
  models: { id: string; hint: string }[];
  visionModels?: { id: string; hint: string }[];
  envFile: string;
}

const CUSTOM = "__custom__";

/** Notify open screens (Sprite Forge) that the provider changed. */
export const AI_CHANGED_EVENT = "pf:ai-changed";

export function AiSettingsModal({ onClose }: { onClose: () => void }) {
  const user = useAuthStore((s) => s.user);
  const openModal = useAppStore((s) => s.openModal);
  const notify = useAppStore((s) => s.notify);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [s, setS] = useState<AiSettings | null>(null);

  const [provider, setProvider] = useState<"mock" | "openai">("mock");
  const [apiKey, setApiKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [model, setModel] = useState("");
  const [customModel, setCustomModel] = useState("");
  const [visionModel, setVisionModel] = useState("gpt-6.1-terra");
  const [quality, setQuality] = useState("medium");
  const [background, setBackground] = useState("");
  const [dailyLimit, setDailyLimit] = useState(40);
  const [maxCandidates, setMaxCandidates] = useState(4);
  const [cost, setCost] = useState(0.05);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [test, setTest] = useState<{ ok: boolean; message: string } | null>(null);

  const apply = (d: AiSettings) => {
    setS(d);
    setProvider(d.provider);
    const known = d.models.some((m) => m.id === d.openai.model);
    setModel(known ? d.openai.model : CUSTOM);
    setCustomModel(known ? "" : d.openai.model);
    if (d.openai.visionModel) setVisionModel(d.openai.visionModel);
    setQuality(d.openai.quality);
    setBackground(d.openai.background);
    setDailyLimit(d.limits.dailyLimit);
    setMaxCandidates(d.limits.maxCandidates);
    setCost(d.limits.costPerImageUsd);
  };

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }
    api
      .get<AiSettings>("/ai/settings")
      .then(apply)
      .catch((e: ApiError) => setError(e.status === 403 ? "Chỉ đổi được cấu hình AI từ chính máy đang chạy server (vì lý do bảo mật)." : e.message))
      .finally(() => setLoading(false));
  }, [user]);

  const effectiveModel = model === CUSTOM ? customModel.trim() : model;

  const runTest = async () => {
    setTesting(true);
    setTest(null);
    try {
      setTest(await api.post<{ ok: boolean; message: string }>("/ai/settings/test", { apiKey: apiKey.trim() || undefined, model: effectiveModel, visionModel }));
    } catch (e) {
      setTest({ ok: false, message: (e as Error).message });
    } finally {
      setTesting(false);
    }
  };

  const save = async (extra?: { clearKey?: boolean }) => {
    if (provider === "openai" && !effectiveModel) return notify("Nhập tên model", "error");
    setSaving(true);
    try {
      const d = await api.put<AiSettings>("/ai/settings", {
        provider,
        apiKey: apiKey.trim() || undefined,
        clearKey: extra?.clearKey,
        model: effectiveModel || undefined,
        visionModel: provider === "openai" ? visionModel : undefined,
        quality,
        background,
        dailyLimit,
        maxCandidates,
        costPerImageUsd: cost,
      });
      apply(d);
      setApiKey("");
      setShowKey(false);
      window.dispatchEvent(new Event(AI_CHANGED_EVENT));
      notify(extra?.clearKey ? "Đã xóa API key khỏi server" : "Đã lưu cấu hình AI - áp dụng ngay", "success");
    } catch (e) {
      notify((e as Error).message, "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal title="Cài đặt AI" subtitle="Provider tạo ảnh cho Sprite Forge - key chỉ lưu trên server, không lưu trong trình duyệt" icon={Bot} onClose={onClose} width={620}>
      {loading ? (
        <div className="center" style={{ padding: 40 }}><Spinner size={20} /></div>
      ) : !user ? (
        <div className="note warn">
          Cần đăng nhập để xem / đổi cấu hình AI.
          <button className="link-btn" onClick={() => openModal("auth")}>Đăng nhập</button>
        </div>
      ) : error ? (
        <div className="note error">{error}</div>
      ) : s ? (
        <div className="forge settings-form">
          <label className="field-label" style={{ marginTop: 0 }}>Provider</label>
          <div className="mode-cards">
            <button className={`mode-card ${provider === "mock" ? "active" : ""}`} onClick={() => setProvider("mock")}>
              <span className="mode-icon"><FlaskConical size={16} /></span>
              <span className="mode-texts"><strong>Mock</strong><span>Miễn phí, không phải AI - để thử quy trình</span></span>
            </button>
            <button className={`mode-card ${provider === "openai" ? "active" : ""}`} onClick={() => setProvider("openai")}>
              <span className="mode-icon"><Wand2 size={16} /></span>
              <span className="mode-texts"><strong>OpenAI</strong><span>Ảnh AI thật - tính phí theo ảnh</span></span>
            </button>
          </div>

          {provider === "openai" && (
            <>
              <label className="field-label">
                API key {s.openai.keySet ? <span className="key-badge ok"><ShieldCheck size={11} /> đã lưu {s.openai.keyHint}</span> : <span className="key-badge">chưa có</span>}
              </label>
              <div className="key-field">
                <KeyRound size={15} className="muted" />
                <input
                  type={showKey ? "text" : "password"}
                  value={apiKey}
                  autoComplete="off"
                  spellCheck={false}
                  placeholder={s.openai.keySet ? "Để trống = giữ key hiện tại" : "sk-..."}
                  onChange={(e) => { setApiKey(e.target.value); setTest(null); }}
                />
                <button className="icon-btn sm" title={showKey ? "Ẩn" : "Hiện"} onClick={() => setShowKey(!showKey)}>{showKey ? <EyeOff size={13} /> : <Eye size={13} />}</button>
              </div>
              <p className="muted small">
                Lấy key tại{" "}
                <a className="link-btn" href="https://platform.openai.com/api-keys" target="_blank" rel="noreferrer">platform.openai.com/api-keys <ExternalLink size={10} /></a>{" "}
                (cần nạp billing; gói ChatGPT Plus không bao gồm API).
              </p>

              <div className="grid2">
                <div>
                  <label className="field-label">Model</label>
                  <Select
                    value={model}
                    onChange={setModel}
                    options={[...s.models.map((m) => ({ value: m.id, label: m.id, hint: m.hint })), { value: CUSTOM, label: "Khác…", hint: "Nhập tên model" }]}
                  />
                  {model === CUSTOM && <input className="text-input" style={{ marginTop: 6 }} placeholder="tên model" value={customModel} onChange={(e) => setCustomModel(e.target.value)} />}
                </div>
                <div>
                  <label className="field-label">Chất lượng</label>
                  <Select
                    value={quality}
                    onChange={setQuality}
                    options={[
                      { value: "low", label: "Low", hint: "Rẻ nhất, để nháp" },
                      { value: "medium", label: "Medium", hint: "Cân bằng (khuyên dùng)" },
                      { value: "high", label: "High", hint: "Đẹp nhất, đắt hơn" },
                      { value: "auto", label: "Auto" },
                    ]}
                  />
                </div>
              </div>
              <label className="field-label">Model đọc ảnh & trò chuyện <span className="label-opt">cho nút Đọc ảnh / Trợ lý AI</span></label>
              <Select
                value={visionModel}
                onChange={setVisionModel}
                options={(s.visionModels ?? [{ id: visionModel, hint: "" }]).map((m) => ({ value: m.id, label: m.id, hint: m.hint }))}
              />
              <label className="field-label">Nền ảnh trả về</label>
              <Select
                value={background}
                onChange={setBackground}
                options={[
                  { value: "transparent", label: "Trong suốt", hint: "Khuyên dùng - bỏ qua bước xóa nền" },
                  { value: "opaque", label: "Đặc", hint: "Nền trắng theo prompt, tool sẽ xóa nền" },
                  { value: "", label: "Mặc định của provider" },
                ]}
              />
            </>
          )}

          <div className="grid3">
            <div>
              <label className="field-label">Ảnh / ngày</label>
              <input className="text-input" type="number" min={1} max={1000} value={dailyLimit} onChange={(e) => setDailyLimit(Number(e.target.value))} />
            </div>
            <div>
              <label className="field-label">Phương án tối đa</label>
              <div className="seg wide count-seg">
                {[1, 2, 3, 4].map((n) => <button key={n} className={maxCandidates === n ? "active" : ""} onClick={() => setMaxCandidates(n)}>{n}</button>)}
              </div>
            </div>
            <div>
              <label className="field-label">USD / ảnh (ước tính)</label>
              <input className="text-input" type="number" min={0} max={10} step={0.01} value={cost} disabled={provider === "mock"} onChange={(e) => setCost(Number(e.target.value))} />
            </div>
          </div>

          {test && (
            <div className={`q-item ${test.ok ? "ok" : "error"}`} style={{ marginTop: 14 }}>
              {test.ok ? <CheckCircle2 size={14} /> : <XCircle size={14} />} <span>{test.message}</span>
            </div>
          )}

          <div className="settings-actions">
            {provider === "openai" && (
              <>
                <button className="btn-ghost" disabled={testing || (!apiKey.trim() && !s.openai.keySet)} onClick={runTest} title="Gọi thử OpenAI (không tạo ảnh, không tốn tiền)">
                  {testing ? <Spinner size={14} /> : <FlaskConical size={14} />} Kiểm tra key
                </button>
                {s.openai.keySet && (
                  <button className="btn-ghost danger" disabled={saving} onClick={() => confirm("Xóa API key khỏi server?") && save({ clearKey: true })}>
                    <Trash2 size={14} /> Xóa key
                  </button>
                )}
              </>
            )}
            <div className="spacer" />
            <button className="btn-primary" disabled={saving} onClick={() => save()}>
              {saving ? <Spinner size={14} /> : <Save size={14} />} Lưu & áp dụng
            </button>
          </div>
          <p className="muted small" style={{ marginTop: 10 }}>
            Lưu vào <code>{s.envFile}</code> trên máy chủ. Chỉ đổi được khi đã đăng nhập và mở app trên chính máy chạy server.
          </p>
        </div>
      ) : null}
    </Modal>
  );
}
