import React from "react";
import ReactDOM from "react-dom/client";
import "./styles.css";
import UngDungChinh from "./UngDungChinh";

// ============================================================================
// FILE 11: src/index.tsx (V7.0 ENTERPRISE ENTRY POINT & CRASH GUARD)
// - Nạp trực tiếp styles.css phục vụ định dạng in A4 và thanh cuộn mảnh.
// - Tích hợp lớp bảo vệ ErrorBoundary chống màn hình trắng (White Screen of Death).
// ✦ An intellectual product by Handsome Long ✦
// ============================================================================

interface ErrorBoundaryState {
  hasError: boolean;
  errorMsg: string;
}

class OrioErrorBoundary extends React.Component<
  { children: React.ReactNode },
  ErrorBoundaryState
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, errorMsg: "" };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      hasError: true,
      errorMsg: error?.message || "Lỗi khởi tạo giao diện",
    };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6 font-sans">
          <div className="max-w-md w-full bg-white border-2 border-rose-300 rounded-3xl p-6 shadow-xl text-center space-y-4">
            <div className="text-rose-600 font-black text-base uppercase">
              ⚠️ Phát hiện xung đột bộ nhớ đệm trình duyệt
            </div>
            <p className="text-xs text-slate-600 leading-relaxed">
              Hệ thống vừa chặn một lỗi hiển thị ({this.state.errorMsg}). Dữ
              liệu gốc của bạn vẫn an toàn. Hãy nhấn nút bên dưới để làm mới ứng
              dụng.
            </p>
            <div className="flex justify-center gap-3 pt-2">
              <button
                type="button"
                onClick={() => window.location.reload()}
                className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-black text-xs shadow-md"
              >
                🔄 Tải Lại Trang Ngay
              </button>
              <button
                type="button"
                onClick={() => {
                  try {
                    localStorage.removeItem("ORIO_KIOSK_DRAFT_V5");
                  } catch {}
                  window.location.reload();
                }}
                className="px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs"
              >
                🧹 Xóa Nháp & Tải Lại
              </button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

const rootElement = document.getElementById("root")!;
const root = ReactDOM.createRoot(rootElement);

root.render(
  <React.StrictMode>
    <OrioErrorBoundary>
      <UngDungChinh />
    </OrioErrorBoundary>
  </React.StrictMode>
);
