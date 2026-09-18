"use client";

import { useState } from "react";
import { User, Eye, EyeOff } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Spinner } from "@/components/ui/Loading";
import { useAuthStore } from "@/store/auth-store";
import { useAppStore } from "@/store/app-store";

export function AuthModal({ onClose }: { onClose: () => void }) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [remember, setRemember] = useState(true);
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const login = useAuthStore((s) => s.login);
  const register = useAuthStore((s) => s.register);
  const notify = useAppStore((s) => s.notify);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!/^\S+@\S+\.\S+$/.test(email)) return setError("Email không hợp lệ");
    if (password.length < 6) return setError("Mật khẩu phải có ít nhất 6 ký tự");
    if (mode === "register" && name.trim().length < 2) return setError("Tên hiển thị quá ngắn");
    if (mode === "register" && password !== confirm) return setError("Mật khẩu nhập lại không khớp");
    setBusy(true);
    try {
      if (mode === "login") await login(email.trim(), password, remember);
      else await register(email.trim(), password, name.trim(), remember);
      notify(mode === "login" ? "Đăng nhập thành công" : "Tạo tài khoản thành công", "success");
      onClose();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title="Đăng Nhập" subtitle="Mở rộng thêm tính năng, lưu trữ an toàn trên máy chủ Cloud." icon={User} onClose={onClose} width={460}>
      <div className="seg wide">
        <button className={mode === "login" ? "active" : ""} onClick={() => setMode("login")}>Đăng nhập</button>
        <button className={mode === "register" ? "active" : ""} onClick={() => setMode("register")}>Đăng ký</button>
      </div>
      <form onSubmit={submit} className="auth-form">
        {mode === "register" && (
          <>
            <label className="field-label">Tên hiển thị</label>
            <input className="text-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Tên của bạn" />
          </>
        )}
        <label className="field-label">Địa chỉ Email</label>
        <input className="text-input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="your.email@example.com" autoComplete="email" />
        <div className="field-row">
          <label className="field-label">Mật khẩu</label>
          {mode === "login" && (
            <button type="button" className="link-btn" onClick={() => notify("Hãy liên hệ quản trị viên để đặt lại mật khẩu.")}>Quên mật khẩu?</button>
          )}
        </div>
        <div className="input-icon-wrap">
          <input className="text-input" type={show ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" autoComplete={mode === "login" ? "current-password" : "new-password"} />
          <button type="button" className="input-icon-btn" onClick={() => setShow(!show)} title={show ? "Ẩn mật khẩu" : "Hiện mật khẩu"} tabIndex={-1}>
            {show ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        </div>
        {mode === "register" && (
          <>
            <label className="field-label">Nhập lại mật khẩu</label>
            <div className="input-icon-wrap">
              <input
                className={`text-input ${confirm && confirm !== password ? "invalid" : ""}`}
                type={showConfirm ? "text" : "password"}
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                placeholder="••••••••"
                autoComplete="new-password"
              />
              <button type="button" className="input-icon-btn" onClick={() => setShowConfirm(!showConfirm)} title={showConfirm ? "Ẩn mật khẩu" : "Hiện mật khẩu"} tabIndex={-1}>
                {showConfirm ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
            {confirm && confirm !== password && <div className="hint-text">Mật khẩu nhập lại chưa khớp</div>}
          </>
        )}
        <label className="check-row">
          <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} /> Bạn có muốn lưu thông tin đăng nhập?
        </label>
        {error && <div className="error-text">{error}</div>}
        <button className="btn-primary big" type="submit" disabled={busy} aria-busy={busy}>
          {busy ? <><Spinner size={16} /> Đang xử lý…</> : mode === "login" ? "Đăng Nhập" : "Tạo Tài Khoản"}
        </button>
      </form>
    </Modal>
  );
}
