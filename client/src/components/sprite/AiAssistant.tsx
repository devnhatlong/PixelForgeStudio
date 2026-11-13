"use client";

import { useEffect, useRef, useState } from "react";
import { Bot, ImagePlus, Send, X, Plus, CornerDownLeft, Copy, Image as ImageIcon, Square } from "lucide-react";
import { Spinner } from "@/components/ui/Loading";
import { blobToDataUrl, chatWithAi, splitPromptBlocks, type ChatMessage } from "@/lib/sprite/ai-client";
import { shrinkToPng } from "@/lib/sprite/assets";
import { useAppStore } from "@/store/app-store";

const STORAGE_KEY = "pf:forge-chat";
const MAX_ATTACH = 3;

const SUGGESTIONS = [
  { label: "Ảnh này → prompt", text: "Hãy xem ảnh mình gửi và viết prompt mô tả nhân vật để tạo master." },
  { label: "Gợi ý 3 outfit", text: "Gợi ý 3 bộ trang phục cổ phong khác nhau cho nhân vật này (mỗi bộ một prompt), giữ nguyên mặt và tóc." },
  { label: "Nhận xét sprite", text: "Nhận xét sprite này khi nhìn ở kích thước nhỏ trong game: silhouette, độ dễ đọc, màu sắc. Nên sửa gì?" },
  { label: "So master vs variant", text: "So sánh 2 ảnh: ảnh đầu là master, ảnh sau là variant. Mặt, tóc, tỉ lệ có giữ nguyên không? Chỗ nào lệch?" },
];

export function AiAssistant({
  open,
  onClose,
  onInsertPrompt,
  context,
  getSelectedImage,
  visionLabel,
}: {
  open: boolean;
  onClose: () => void;
  onInsertPrompt: (text: string) => void;
  context: { mode: string; characterName: string; prompt: string };
  /** currently selected candidate in Sprite Forge (to attach with one click) */
  getSelectedImage?: () => Blob | null;
  visionLabel: string;
}) {
  const notify = useAppStore((s) => s.notify);
  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    if (typeof window === "undefined") return [];
    try {
      return JSON.parse(sessionStorage.getItem(STORAGE_KEY) ?? "[]");
    } catch {
      return [];
    }
  });
  const [draft, setDraft] = useState("");
  const [attach, setAttach] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(messages));
    } catch {
      /* quota: images too large to keep — fine, chat still works */
    }
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, busy]);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 50);
  }, [open]);

  const addBlobs = async (blobs: Blob[]) => {
    const room = MAX_ATTACH - attach.length;
    if (room <= 0) return notify(`Tối đa ${MAX_ATTACH} ảnh mỗi tin nhắn`, "error");
    const urls: string[] = [];
    for (const b of blobs.slice(0, room)) {
      if (!/^image\/(png|jpeg|webp)$/.test(b.type)) continue;
      try {
        urls.push(await blobToDataUrl((await shrinkToPng(b, 1024)).blob));
      } catch {
        notify("Không đọc được ảnh", "error");
      }
    }
    setAttach((a) => [...a, ...urls]);
  };

  const send = async (text = draft) => {
    if (busy || (!text.trim() && !attach.length)) return;
    const next: ChatMessage[] = [...messages, { role: "user", text: text.trim(), images: attach }];
    setMessages(next);
    setDraft("");
    setAttach([]);
    setBusy(true);
    setError(null);
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    try {
      const r = await chatWithAi(next, context, ctrl.signal);
      setMessages((m) => [...m, { role: "assistant", text: r.text }]);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
      abortRef.current = null;
    }
  };

  if (!open) return null;
  const imageCount = messages.reduce((n, m) => n + (m.images?.length ?? 0), 0) + attach.length;

  return (
    <aside
      className="assistant"
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        e.stopPropagation();
        addBlobs(Array.from(e.dataTransfer.files));
      }}
    >
      <header className="assistant-head">
        <span className="mode-icon"><Bot size={16} /></span>
        <div className="assistant-titles">
          <strong>Trợ lý AI</strong>
          <span>{visionLabel}</span>
        </div>
        <button className="icon-btn sm" title="Cuộc trò chuyện mới" onClick={() => { setMessages([]); setError(null); }}><Plus size={14} /></button>
        <button className="icon-btn sm" title="Đóng" onClick={onClose}><X size={14} /></button>
      </header>

      <div className="assistant-list" ref={listRef}>
        {!messages.length && (
          <div className="assistant-empty">
            <p>Gửi hình (kéo thả, dán Ctrl+V, hoặc nút ảnh) và hỏi như ChatGPT. Prompt AI đề xuất có nút <b>Chèn vào mô tả</b>.</p>
            <div className="assistant-suggest">
              {SUGGESTIONS.map((s) => (
                <button key={s.label} onClick={() => { setDraft(s.text); inputRef.current?.focus(); }}>{s.label}</button>
              ))}
            </div>
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`msg ${m.role}`}>
            {!!m.images?.length && (
              <div className="msg-images">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {m.images.map((u, k) => <img key={k} src={u} alt="" className="checker" />)}
              </div>
            )}
            {m.role === "user" ? (
              m.text && <div className="msg-bubble">{m.text}</div>
            ) : (
              <div className="msg-bubble">
                {splitPromptBlocks(m.text).map((part, k) =>
                  part.type === "text" ? (
                    <p key={k} className="msg-text">{part.value.trim()}</p>
                  ) : (
                    <div key={k} className="prompt-card">
                      <code>{part.value}</code>
                      <div className="prompt-actions">
                        <button className="btn-primary sm" onClick={() => { onInsertPrompt(part.value); notify("Đã chèn vào ô mô tả", "success"); }}><CornerDownLeft size={12} /> Chèn vào mô tả</button>
                        <button className="icon-btn sm" title="Sao chép" onClick={() => navigator.clipboard?.writeText(part.value).then(() => notify("Đã sao chép"))}><Copy size={12} /></button>
                      </div>
                    </div>
                  ),
                )}
              </div>
            )}
          </div>
        ))}
        {busy && (
          <div className="msg assistant">
            <div className="msg-bubble typing"><Spinner size={13} /> Đang xem & trả lời…</div>
          </div>
        )}
        {error && <div className="note error">{error}</div>}
      </div>

      <div className="assistant-compose">
        {!!attach.length && (
          <div className="attach-row">
            {attach.map((u, i) => (
              <div key={i} className="attach-thumb checker">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={u} alt="" />
                <button onClick={() => setAttach((a) => a.filter((_, k) => k !== i))} title="Bỏ ảnh"><X size={10} /></button>
              </div>
            ))}
          </div>
        )}
        <textarea
          ref={inputRef}
          rows={2}
          value={draft}
          placeholder="Hỏi gì cũng được… (Enter gửi, Shift+Enter xuống dòng)"
          onChange={(e) => setDraft(e.target.value)}
          onPaste={(e) => {
            const imgs = Array.from(e.clipboardData.items).filter((it) => it.type.startsWith("image/")).map((it) => it.getAsFile()).filter((f): f is File => !!f);
            if (imgs.length) {
              e.preventDefault();
              addBlobs(imgs);
            }
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              send();
            }
          }}
        />
        <div className="compose-actions">
          <label className="icon-btn" title="Đính kèm ảnh">
            <ImagePlus size={15} />
            <input type="file" accept="image/png,image/jpeg,image/webp" multiple hidden onChange={(e) => { addBlobs(Array.from(e.target.files ?? [])); e.target.value = ""; }} />
          </label>
          {getSelectedImage && (
            <button
              className="icon-btn"
              title="Đính kèm phương án đang chọn trong Sprite Forge"
              onClick={() => {
                const b = getSelectedImage();
                if (b) addBlobs([b]);
                else notify("Chưa chọn phương án nào", "error");
              }}
            >
              <ImageIcon size={15} />
            </button>
          )}
          <span className="muted small">{imageCount ? `${imageCount}/6 ảnh` : ""}</span>
          <div className="spacer" />
          {busy ? (
            <button className="btn-ghost sm" onClick={() => abortRef.current?.abort()}><Square size={12} /> Dừng</button>
          ) : (
            <button className="btn-primary sm" disabled={!draft.trim() && !attach.length} onClick={() => send()}><Send size={13} /> Gửi</button>
          )}
        </div>
      </div>
    </aside>
  );
}
