import React, { useState, useRef, useMemo } from "react";
import {
  UserAccount,
  UserRole,
  PermissionKey,
  ALL_PERMISSIONS,
  DEFAULT_ROLE_PERMISSIONS,
  getEffectivePermissions,
  TestConfig,
  ReagentLotBM16,
  BM09LogEntry,
  rpcCall,
  STORAGE_KEYS,
} from "./KieuDuLieu";

// ============================================================================
// FILE 8: src/QuanTriHeThong.tsx (V7.1 ENTERPRISE ADMIN & LIFECYCLE MANAGER)
// - Đã GỠ BỎ 100% code AI/OCR (không còn nhập API Key, dò Model).
// - Giám sát dung lượng bộ nhớ trình duyệt (LocalStorage Health Meter) & Backup JSON.
// - Cửa sổ 2 Cột cấu hình Xét nghiệm Ngoại lệ (Miễn 6x, 8x, 10x - SOP 31) có lọc Máy & Tìm kiếm.
// - Quản trị Cây thư mục Lab/Thiết bị: Hỗ trợ Đổi tên Máy đồng bộ xuyên suốt &
//   Dọn sạch triệt để dữ liệu mồ côi (Configs, Reagents, BM.09, Kiosk Draft) khi xóa Máy/Lab.
// - Quản trị Nhân sự & Ma trận 8 Quyền chi tiết (có EDIT_PAST_DATE).
// ✦ An intellectual product by Handsome Long ✦
// ============================================================================

const Ic = {
  Sync: () => (
    <svg
      width="14"
      height="14"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      viewBox="0 0 24 24"
    >
      <polyline points="23 4 23 10 17 10" />
      <polyline points="1 20 1 14 7 14" />
      <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
    </svg>
  ),
  Shield: () => (
    <svg
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      viewBox="0 0 24 24"
    >
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </svg>
  ),
  Database: () => (
    <svg
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      viewBox="0 0 24 24"
    >
      <ellipse cx="12" cy="5" rx="9" ry="3" />
      <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3" />
      <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" />
    </svg>
  ),
  Plus: () => (
    <svg
      width="14"
      height="14"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      viewBox="0 0 24 24"
    >
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  ),
  Trash: () => (
    <svg
      width="14"
      height="14"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      viewBox="0 0 24 24"
    >
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    </svg>
  ),
  Edit: () => (
    <svg
      width="13"
      height="13"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      viewBox="0 0 24 24"
    >
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
    </svg>
  ),
  Search: () => (
    <svg
      width="14"
      height="14"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      viewBox="0 0 24 24"
    >
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  ),
};

export interface QuanTriHeThongProps {
  apiUrl: string;
  setApiUrl: React.Dispatch<React.SetStateAction<string>>;
  authToken: string;
  users: UserAccount[];
  setUsers: React.Dispatch<React.SetStateAction<UserAccount[]>>;
  sections: string[];
  setSections: React.Dispatch<React.SetStateAction<string[]>>;
  labMachines: { section: string; machine: string }[];
  setLabMachines: React.Dispatch<
    React.SetStateAction<{ section: string; machine: string }[]>
  >;
  syncFromCloud: () => Promise<void>;
  configs: TestConfig[];
  setConfigs: React.Dispatch<React.SetStateAction<TestConfig[]>>;
  reagents: ReagentLotBM16[];
  setReagents: React.Dispatch<React.SetStateAction<ReagentLotBM16[]>>;
  bm09Logs: BM09LogEntry[];
  setBm09Logs: React.Dispatch<React.SetStateAction<BM09LogEntry[]>>;
  currentUser: UserAccount;
}

export default function QuanTriHeThong({
  apiUrl,
  setApiUrl,
  authToken,
  users,
  setUsers,
  sections,
  setSections,
  labMachines,
  setLabMachines,
  syncFromCloud,
  configs,
  setConfigs,
  reagents,
  setReagents,
  bm09Logs,
  setBm09Logs,
  currentUser,
}: QuanTriHeThongProps) {
  const [urlDraft, setUrlDraft] = useState(apiUrl);
  const [statusMsg, setStatusMsg] = useState("");
  const [newUserId, setNewUserId] = useState("");
  const [newUserName, setNewUserName] = useState("");
  const [newUserRole, setNewUserRole] = useState<UserRole>("USER");
  const [userSearchText, setUserSearchText] = useState("");

  const [newSecName, setNewSecName] = useState("");
  const [targetSecForMac, setTargetSecForMac] = useState(
    sections[0] || "Sinh Hóa"
  );
  const [newMacName, setNewMacName] = useState("");

  const [exemptFilterSec, setExemptFilterSec] = useState<string>("Tất cả");
  const [exemptFilterMac, setExemptFilterMac] = useState<string>("Tất cả");
  const [exemptSearchText, setExemptSearchText] = useState<string>("");

  const fileRestoreInputRef = useRef<HTMLInputElement | null>(null);

  // --- ĐO LƯỜNG SỨC KHỎE BỘ NHỚ TRÌNH DUYỆT (LOCALSTORAGE METER) ---
  const storageStats = useMemo(() => {
    let totalBytes = 0;
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith("ORIO_")) {
          const val = localStorage.getItem(k) || "";
          totalBytes += (k.length + val.length) * 2;
        }
      }
    } catch {}
    const usedKb = Math.round(totalBytes / 1024);
    const pct = Math.min(100, Math.round((usedKb / 5120) * 100));
    const totalPoints = configs.reduce(
      (acc, c) =>
        acc +
        (c.history_L1?.length || 0) +
        (c.history_L2?.length || 0) +
        (c.history_L3?.length || 0),
      0
    );
    return { usedKb, pct, totalPoints };
  }, [configs, reagents, bm09Logs, users]);

  const handleSaveApiUrl = () => {
    const clean = urlDraft.trim();
    if (!clean.startsWith("https://script.google.com/macros/s/")) {
      window.alert(
        "URL máy chủ phải bắt đầu bằng https://script.google.com/macros/s/..."
      );
      return;
    }
    setApiUrl(clean);
    setStatusMsg("✓ Đã lưu URL máy chủ Google Sheets mới!");
    setTimeout(() => setStatusMsg(""), 3000);
  };

  // --- QUẢN TRỊ VÒNG ĐỜI DỮ LIỆU (BACKUP / RESTORE JSON) ---
  const handleExportBackupJson = () => {
    const payload = {
      exported_at: new Date().toISOString(),
      version: "7.1.0-ENTERPRISE-CORE",
      exported_by: currentUser.name,
      sections,
      lab_machines: labMachines,
      users,
      reagents,
      configs,
      bm09_logs: bm09Logs,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `IQC_ORIO_BACKUP_${new Date()
      .toISOString()
      .slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImportBackupJson = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const data = JSON.parse(String(reader.result || "{}"));
        if (!Array.isArray(data.configs)) {
          window.alert(
            "File .JSON không đúng cấu trúc Backup của MEDLAB IQC-ORIO!"
          );
          return;
        }
        if (
          !window.confirm(
            `Khôi phục dữ liệu từ bản sao lưu ngày ${
              data.exported_at?.slice(0, 10) || "không rõ"
            } (${data.configs.length} xét nghiệm)?`
          )
        )
          return;

        if (Array.isArray(data.sections)) setSections(data.sections);
        if (Array.isArray(data.lab_machines)) setLabMachines(data.lab_machines);
        if (Array.isArray(data.users)) setUsers(data.users);
        if (Array.isArray(data.reagents)) setReagents(data.reagents);
        if (Array.isArray(data.configs)) setConfigs(data.configs);
        if (Array.isArray(data.bm09_logs)) setBm09Logs(data.bm09_logs);

        setStatusMsg("⏳ Đang khôi phục bản sao lưu lên Google Sheets...");
        await rpcCall(
          apiUrl,
          "admin_reset_database",
          {
            mode: "RESTORE_BACKUP",
            sections: data.sections,
            lab_machines: data.lab_machines,
            reagents: data.reagents,
            configs: data.configs,
            bm09_logs: data.bm09_logs,
          },
          authToken
        );
        setStatusMsg("✓ Đã khôi phục toàn bộ hồ sơ từ file Backup (.JSON)!");
        setTimeout(() => setStatusMsg(""), 3000);
      } catch {
        window.alert("Không thể đọc file Backup (.JSON)!");
      }
    };
    reader.readAsText(file);
  };

  const handleClearKioskDraftCache = () => {
    try {
      localStorage.removeItem(STORAGE_KEYS.KIOSK_DRAFT);
      setStatusMsg("✓ Đã dọn sạch bộ nhớ nháp Kiosk (KIOSK_DRAFT)!");
      setTimeout(() => setStatusMsg(""), 3000);
    } catch {}
  };

  // --- CỬA SỔ 2 CỘT: CHUYỂN ĐỔI XÉT NGHIỆM THƯỜNG <-> NGOẠI LỆ (6x, 8x, 10x) ---
  const toggleExemptLongRules = async (test: TestConfig, nextVal: boolean) => {
    const updated: TestConfig = { ...test, is_exempt_long_rules: nextVal };
    setConfigs((prev) =>
      prev.map((c) => (c.test_id === test.test_id ? updated : c))
    );
    await rpcCall(apiUrl, "save_config", updated, authToken);
  };

  const handleAutoExemptStandardHematology = async () => {
    const codes = ["WBC", "RBC", "HGB", "HCT", "PLT"];
    const toUpdate: TestConfig[] = [];
    setConfigs((prev) =>
      prev.map((c) => {
        const up = c.test_name.trim().toUpperCase();
        const isMatched = codes.some(
          (code) =>
            up === code ||
            up.startsWith(`${code} `) ||
            up.indexOf(`(${code})`) !== -1
        );
        if (isMatched && !c.is_exempt_long_rules) {
          const nextObj = { ...c, is_exempt_long_rules: true };
          toUpdate.push(nextObj);
          return nextObj;
        }
        return c;
      })
    );
    if (toUpdate.length > 0) {
      setStatusMsg(
        `✓ Đã chuyển tự động ${toUpdate.length} thông số Huyết học (WBC, RBC, HGB, HCT, PLT) sang Cửa sổ Ngoại lệ!`
      );
      setTimeout(() => setStatusMsg(""), 3500);
      await rpcCall(
        apiUrl,
        "save_configs_bulk",
        { items: toUpdate },
        authToken
      );
    } else {
      window.alert(
        "Tất cả các thông số WBC, RBC, HGB, HCT, PLT hiện đã nằm trong Cửa sổ Ngoại lệ!"
      );
    }
  };

  // --- QUẢN TRỊ ĐỔI TÊN MÁY & XÓA SẠCH DỮ LIỆU MỒ CÔI KHI XÓA MÁY / LAB ---
  const handleRenameMachine = async (sec: string, oldMacName: string) => {
    const nextNameRaw = window.prompt(
      `Nhập tên mới cho thiết bị [${oldMacName}] (Thuộc Lab ${sec}):\n(Hệ thống sẽ tự động cập nhật đồng bộ toàn bộ Xét nghiệm, Hóa chất & Nhật ký BM.09 sang tên máy mới)`,
      oldMacName
    );
    if (!nextNameRaw) return;
    const nextMacName = nextNameRaw.trim();
    if (!nextMacName || nextMacName === oldMacName) return;

    if (
      labMachines.some(
        (m) =>
          m.section === sec &&
          m.machine.toLowerCase() === nextMacName.toLowerCase()
      )
    ) {
      window.alert(
        `Tên thiết bị "${nextMacName}" đã tồn tại trong Lab ${sec}!`
      );
      return;
    }

    setLabMachines((prev) =>
      prev.map((m) =>
        m.section === sec && m.machine === oldMacName
          ? { ...m, machine: nextMacName }
          : m
      )
    );

    const updatedConfigs: TestConfig[] = [];
    setConfigs((prev) =>
      prev.map((c) => {
        if (c.machine_name === oldMacName) {
          const nextC = { ...c, machine_name: nextMacName };
          updatedConfigs.push(nextC);
          return nextC;
        }
        return c;
      })
    );

    setReagents((prev) =>
      prev.map((r) =>
        r.machine_name === oldMacName ? { ...r, machine_name: nextMacName } : r
      )
    );

    setBm09Logs((prev) =>
      prev.map((l) =>
        l.machine_name === oldMacName ? { ...l, machine_name: nextMacName } : l
      )
    );

    setStatusMsg(
      `✓ Đã đổi tên máy "${oldMacName}" ➔ "${nextMacName}" (Đồng bộ ${updatedConfigs.length} xét nghiệm)!`
    );
    setTimeout(() => setStatusMsg(""), 4000);

    await rpcCall(
      apiUrl,
      "admin_rename_lab_machine",
      {
        mode: "MACHINE",
        old_section: sec,
        old_machine: oldMacName,
        new_machine: nextMacName,
      },
      authToken
    );
  };

  const handleDeleteMachineCascade = async (sec: string, macName: string) => {
    const affectedConfigs = configs.filter((c) => c.machine_name === macName);
    const affectedReagents = reagents.filter((r) => r.machine_name === macName);

    const confirmMsg =
      affectedConfigs.length > 0 || affectedReagents.length > 0
        ? `Xác nhận xóa thiết bị [${macName}] khỏi Lab [${sec}]?\n\n⚠️ Hệ thống sẽ dọn sạch ${affectedConfigs.length} xét nghiệm và ${affectedReagents.length} lô hóa chất QC thuộc máy này để không để lại dữ liệu mồ côi trên Dashboard.`
        : `Xác nhận xóa thiết bị [${macName}] khỏi Lab [${sec}]?`;

    if (!window.confirm(confirmMsg)) return;

    setLabMachines((prev) =>
      prev.filter((x) => !(x.section === sec && x.machine === macName))
    );
    setConfigs((prev) => prev.filter((c) => c.machine_name !== macName));
    setReagents((prev) => prev.filter((r) => r.machine_name !== macName));
    setBm09Logs((prev) => prev.filter((l) => l.machine_name !== macName));

    try {
      const draftStr = localStorage.getItem(STORAGE_KEYS.KIOSK_DRAFT);
      if (draftStr && affectedConfigs.length > 0) {
        const drafts = JSON.parse(draftStr);
        affectedConfigs.forEach((t) => {
          delete drafts[t.test_id];
        });
        localStorage.setItem(STORAGE_KEYS.KIOSK_DRAFT, JSON.stringify(drafts));
      }
    } catch {}

    await rpcCall(
      apiUrl,
      "admin_delete_lab_machine",
      { section_name: sec, machine_name: macName },
      authToken
    );
  };

  const handleDeleteSectionCascade = async (sec: string) => {
    const affectedConfigs = configs.filter((c) => c.section === sec);
    const affectedReagents = reagents.filter((r) => r.section_name === sec);

    const confirmMsg =
      affectedConfigs.length > 0 || affectedReagents.length > 0
        ? `Xác nhận xóa toàn bộ nhánh Lab [${sec}]?\n\n⚠️ Hệ thống sẽ dọn sạch các máy cùng ${affectedConfigs.length} xét nghiệm và ${affectedReagents.length} lô hóa chất thuộc nhánh Lab này.`
        : `Xác nhận xóa nhánh Lab [${sec}] khỏi danh mục?`;

    if (!window.confirm(confirmMsg)) return;

    setSections((prev) => prev.filter((x) => x !== sec));
    setLabMachines((prev) => prev.filter((m) => m.section !== sec));
    setConfigs((prev) => prev.filter((c) => c.section !== sec));
    setReagents((prev) => prev.filter((r) => r.section_name !== sec));
    setBm09Logs((prev) => prev.filter((l) => l.section !== sec));

    await rpcCall(
      apiUrl,
      "admin_delete_lab_machine",
      { section_name: sec },
      authToken
    );
  };

  // --- QUẢN TRỊ NHÂN SỰ & MA TRẬN 8 QUYỀN ---
  const handleAddUser = async (e: React.FormEvent) => {
    e.preventDefault();
    const id = newUserId.trim().toLowerCase();
    const name = newUserName.trim();
    if (!id || !name) return;
    if (users.some((u) => u.id.toLowerCase() === id)) {
      window.alert("Mã ID tài khoản này đã tồn tại!");
      return;
    }
    const newUser: UserAccount = {
      id,
      name,
      password: "Longdeptrai",
      role: newUserRole,
      mustChange: true,
      permissions: [...DEFAULT_ROLE_PERMISSIONS[newUserRole]],
    };
    setUsers((prev) => [...prev, newUser]);
    setNewUserId("");
    setNewUserName("");
    await rpcCall(apiUrl, "admin_upsert_user", newUser, authToken);
  };

  const handleToggleUserPermission = async (
    u: UserAccount,
    perm: PermissionKey
  ) => {
    if (u.id.toLowerCase() === "thlong") return;
    const currentPerms = getEffectivePermissions(u);
    const hasIt = currentPerms.indexOf(perm) !== -1;
    const nextPerms = hasIt
      ? currentPerms.filter((p) => p !== perm)
      : [...currentPerms, perm];
    const updated: UserAccount = { ...u, permissions: nextPerms };
    setUsers((prev) => prev.map((item) => (item.id === u.id ? updated : item)));
    await rpcCall(apiUrl, "admin_upsert_user", updated, authToken);
  };

  const handleChangeUserRole = async (u: UserAccount, nextRole: UserRole) => {
    if (u.id.toLowerCase() === "thlong") return;
    const updated: UserAccount = {
      ...u,
      role: nextRole,
      permissions: [...DEFAULT_ROLE_PERMISSIONS[nextRole]],
    };
    setUsers((prev) => prev.map((item) => (item.id === u.id ? updated : item)));
    await rpcCall(apiUrl, "admin_upsert_user", updated, authToken);
  };

  const handleResetPassword = async (u: UserAccount) => {
    if (
      !window.confirm(
        `Reset mật khẩu của [${u.name}] về mặc định 'Longdeptrai'?`
      )
    )
      return;
    setUsers((prev) =>
      prev.map((item) =>
        item.id === u.id
          ? { ...item, password: "Longdeptrai", mustChange: true }
          : item
      )
    );
    await rpcCall(apiUrl, "admin_reset_password", { userId: u.id }, authToken);
  };

  const handleDeleteUser = async (u: UserAccount) => {
    if (u.id.toLowerCase() === "thlong") return;
    if (!window.confirm(`Xóa tài khoản nhân sự [${u.name}]?`)) return;
    setUsers((prev) => prev.filter((item) => item.id !== u.id));
    await rpcCall(apiUrl, "admin_delete_user", { userId: u.id }, authToken);
  };

  const filteredConfigsForExempt = useMemo(() => {
    const q = exemptSearchText.trim().toLowerCase();
    return configs.filter(
      (c) =>
        c.test_type !== "QUALITATIVE" &&
        (exemptFilterSec === "Tất cả" || c.section === exemptFilterSec) &&
        (exemptFilterMac === "Tất cả" || c.machine_name === exemptFilterMac) &&
        (!q ||
          c.test_name.toLowerCase().indexOf(q) !== -1 ||
          c.machine_name.toLowerCase().indexOf(q) !== -1)
    );
  }, [configs, exemptFilterSec, exemptFilterMac, exemptSearchText]);

  const normalTests = filteredConfigsForExempt.filter(
    (c) => !c.is_exempt_long_rules
  );
  const exemptTests = filteredConfigsForExempt.filter((c) =>
    Boolean(c.is_exempt_long_rules)
  );

  const filteredUsers = useMemo(() => {
    const q = userSearchText.trim().toLowerCase();
    if (!q) return users;
    return users.filter(
      (u) =>
        u.id.toLowerCase().indexOf(q) !== -1 ||
        u.name.toLowerCase().indexOf(q) !== -1 ||
        u.role.toLowerCase().indexOf(q) !== -1
    );
  }, [users, userSearchText]);

  return (
    <div className="space-y-6 pb-12">
      {/* 1. CẤU HÌNH KẾT NỐI MÁY CHỦ & SAO LƯU HỒ SƠ ISO (.JSON) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        <div className="lg:col-span-7 bg-white border border-slate-200 rounded-3xl p-5 shadow-sm space-y-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <h3 className="text-sm font-black text-slate-900 uppercase flex items-center gap-2">
              <Ic.Shield />
              🔗 Kết Nối Máy Chủ Google Apps Script (Web App URL)
            </h3>
            <span className="text-[11px] font-mono font-bold px-2.5 py-0.5 rounded-full bg-sky-50 text-sky-800 border border-sky-200">
              {configs.length} Test · {reagents.length} Lô QC ·{" "}
              {storageStats.totalPoints} Điểm L-J
            </span>
          </div>
          <p className="text-xs text-slate-500">
            Dán đường dẫn Web App (`.../exec`) từ `Code.gs` để đồng bộ dữ liệu
            toàn khoa.
          </p>
          <div className="flex gap-2">
            <input
              type="text"
              value={urlDraft}
              onChange={(e) => setUrlDraft(e.target.value)}
              className="flex-1 bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2 text-xs font-mono font-bold text-slate-800 outline-none focus:border-blue-600"
            />
            <button
              type="button"
              onClick={handleSaveApiUrl}
              className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-black text-xs shadow-sm"
            >
              Lưu URL
            </button>
            <button
              type="button"
              onClick={syncFromCloud}
              className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-xs flex items-center gap-1.5"
            >
              <Ic.Sync /> Đồng bộ
            </button>
          </div>
          {statusMsg && (
            <div className="text-xs font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2">
              {statusMsg}
            </div>
          )}
        </div>

        <div className="lg:col-span-5 bg-amber-50/50 border border-amber-200 rounded-3xl p-5 shadow-sm space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-black text-slate-900 uppercase flex items-center gap-2">
              <Ic.Database />
              🗄️ SAO LƯU (.JSON) & DUNG LƯỢNG ĐỆM
            </h3>
            <span className="text-[11px] font-mono font-black text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded-lg">
              {storageStats.usedKb} KB / 5120 KB ({storageStats.pct}%)
            </span>
          </div>
          <p className="text-xs text-slate-600">
            Xuất/Nhập file `.JSON` lưu trữ toàn bộ hồ sơ (Cấu hình, Hóa chất,
            BM.09, Lịch sử L-J).
          </p>
          <input
            ref={fileRestoreInputRef}
            type="file"
            accept=".json,application/json"
            onChange={handleImportBackupJson}
            className="hidden"
          />
          <div className="flex items-center gap-2.5 pt-1">
            <button
              type="button"
              onClick={handleExportBackupJson}
              className="flex-1 py-2.5 px-3 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs shadow-sm transition"
            >
              📦 Xuất Backup (.JSON)
            </button>
            <button
              type="button"
              onClick={() => fileRestoreInputRef.current?.click()}
              className="flex-1 py-2.5 px-3 rounded-2xl bg-white hover:bg-amber-50 text-slate-900 border-2 border-amber-300 font-black text-xs shadow-sm transition"
            >
              📂 Nạp Backup (.JSON)
            </button>
            <button
              type="button"
              onClick={handleClearKioskDraftCache}
              title="Xóa bộ nhớ nháp Kiosk tạm thời"
              className="py-2.5 px-3 rounded-2xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs transition"
            >
              🧹 Dọn nháp
            </button>
          </div>
        </div>
      </div>

      {/* 2. CỬA SỔ 2 CỘT: CẤU HÌNH CÁC XÉT NGHIỆM NGOẠI LỆ (MIỄN QUY TẮC 6x, 8x, 10x) */}
      <div className="bg-white border border-slate-200 rounded-3xl p-5 shadow-sm space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-black text-slate-900 uppercase">
              ⚖️ Cửa Sổ Cấu Hình Xét Nghiệm Ngoại Lệ (Miễn Trừ Quy Tắc Chuỗi Dài
              Hạn 6x, 8x, 10x)
            </h3>
            <p className="text-xs text-slate-500 mt-1">
              Nhấp vào xét nghiệm để chuyển qua lại giữa 2 cột. Các xét nghiệm ở
              cột phải sẽ bỏ qua quy tắc sai số hệ thống dài hạn 6x, 8x, 10x
              (Mặc định cho Huyết học).
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <button
              type="button"
              onClick={handleAutoExemptStandardHematology}
              className="px-3 py-1.5 rounded-xl bg-amber-100 hover:bg-amber-200 text-amber-950 border border-amber-300 font-black transition"
            >
              ⚡ Tự động miễn trừ WBC, RBC, HGB, HCT, PLT
            </button>
            <select
              value={exemptFilterSec}
              onChange={(e) => {
                setExemptFilterSec(e.target.value);
                setExemptFilterMac("Tất cả");
              }}
              className="bg-slate-100 border border-slate-300 rounded-xl px-3 py-1.5 font-bold"
            >
              <option value="Tất cả">Tất cả Lab</option>
              {sections.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
            <select
              value={exemptFilterMac}
              onChange={(e) => setExemptFilterMac(e.target.value)}
              className="bg-slate-100 border border-slate-300 rounded-xl px-3 py-1.5 font-bold text-blue-700"
            >
              <option value="Tất cả">Tất cả Máy</option>
              {labMachines
                .filter(
                  (m) =>
                    exemptFilterSec === "Tất cả" ||
                    m.section === exemptFilterSec
                )
                .map((m) => (
                  <option key={m.machine} value={m.machine}>
                    {m.machine}
                  </option>
                ))}
            </select>
            <div className="relative">
              <span className="absolute left-2.5 top-2 text-slate-400">
                <Ic.Search />
              </span>
              <input
                type="text"
                value={exemptSearchText}
                onChange={(e) => setExemptSearchText(e.target.value)}
                placeholder="Tìm tên test..."
                className="bg-slate-50 border border-slate-300 rounded-xl pl-8 pr-2.5 py-1.5 font-semibold outline-none focus:border-blue-500 w-40"
              />
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="border border-slate-200 rounded-2xl p-4 bg-slate-50/70">
            <div className="text-xs font-black text-slate-800 uppercase mb-3">
              1. Danh Sách Tiêu Chuẩn (Áp dụng đủ 6x, 8x, 10x) —{" "}
              {normalTests.length}
            </div>
            <div className="flex flex-wrap gap-2 max-h-60 overflow-y-auto">
              {normalTests.map((t) => (
                <button
                  key={t.test_id}
                  type="button"
                  onClick={() => toggleExemptLongRules(t, true)}
                  className="px-3 py-1.5 rounded-xl bg-white hover:bg-sky-50 border border-slate-300 text-xs font-bold text-slate-800 transition shadow-sm"
                >
                  {t.test_name} ({t.machine_name}) →
                </button>
              ))}
            </div>
          </div>

          <div className="border-2 border-amber-300 rounded-2xl p-4 bg-amber-50/60">
            <div className="text-xs font-black text-amber-950 uppercase mb-3 flex items-center justify-between">
              <span>
                2. Cửa Sổ Ngoại Lệ (Bỏ qua 6x, 8x, 10x) — {exemptTests.length}
              </span>
            </div>
            <div className="flex flex-wrap gap-2 max-h-60 overflow-y-auto">
              {exemptTests.map((t) => (
                <button
                  key={t.test_id}
                  type="button"
                  onClick={() => toggleExemptLongRules(t, false)}
                  className="px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-xs font-black shadow-sm transition"
                >
                  ← {t.test_name} ({t.machine_name})
                </button>
              ))}
              {exemptTests.length === 0 && (
                <div className="w-full text-center text-amber-800/70 italic text-xs py-8">
                  Chưa có xét nghiệm nào trong Cửa sổ Ngoại lệ.
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* 3. QUẢN TRỊ CÂY THƯ MỤC LAB CHUYÊN MÔN & THIẾT BỊ */}
      <div className="bg-white border border-slate-200 rounded-3xl p-5 shadow-sm space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-black text-slate-900 uppercase">
              🏥 Quản Trị Cây Thư Mục Lab Chuyên Môn & Thiết Bị Xét Nghiệm
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Hỗ trợ đổi tên thiết bị đồng bộ xuyên suốt và tự động dọn sạch cấu
              hình mồ côi khi xóa máy.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
          <div className="flex gap-2">
            <input
              type="text"
              value={newSecName}
              onChange={(e) => setNewSecName(e.target.value)}
              placeholder="Tên Lab mới (VD: Sinh học phân tử)..."
              className="flex-1 bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 font-bold outline-none focus:border-blue-500"
            />
            <button
              type="button"
              onClick={async () => {
                const s = newSecName.trim();
                if (!s || sections.indexOf(s) !== -1) return;
                setSections((prev) => [...prev, s]);
                setNewSecName("");
                await rpcCall(
                  apiUrl,
                  "admin_add_lab_machine",
                  { section_name: s },
                  authToken
                );
              }}
              className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-black flex items-center gap-1 shadow-sm"
            >
              <Ic.Plus /> Thêm Lab
            </button>
          </div>

          <div className="flex gap-2">
            <select
              value={targetSecForMac}
              onChange={(e) => setTargetSecForMac(e.target.value)}
              className="bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 font-bold outline-none"
            >
              {sections.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
            <input
              type="text"
              value={newMacName}
              onChange={(e) => setNewMacName(e.target.value)}
              placeholder="Tên Thiết bị mới..."
              className="flex-1 bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 font-bold outline-none focus:border-indigo-500"
            />
            <button
              type="button"
              onClick={async () => {
                const m = newMacName.trim();
                if (!m) return;
                if (
                  labMachines.some(
                    (x) => x.section === targetSecForMac && x.machine === m
                  )
                )
                  return;
                setLabMachines((prev) => [
                  ...prev,
                  { section: targetSecForMac, machine: m },
                ]);
                setNewMacName("");
                await rpcCall(
                  apiUrl,
                  "admin_add_lab_machine",
                  { section_name: targetSecForMac, machine_name: m },
                  authToken
                );
              }}
              className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-black flex items-center gap-1 shadow-sm"
            >
              <Ic.Plus /> Thêm Máy
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
          {sections.map((sec) => {
            const macsInSec = labMachines.filter((m) => m.section === sec);
            return (
              <div
                key={sec}
                className="border border-slate-200 rounded-2xl p-4 bg-slate-50/70 space-y-3 shadow-sm"
              >
                <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                  <div>
                    <span className="font-black text-slate-900 text-xs uppercase">
                      {sec}
                    </span>
                    <span className="ml-2 text-[10.5px] font-mono text-slate-500">
                      ({macsInSec.length} máy)
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleDeleteSectionCascade(sec)}
                    className="text-[11px] font-bold text-rose-600 hover:underline"
                  >
                    Xóa Lab
                  </button>
                </div>
                <div className="flex flex-col gap-2">
                  {macsInSec.map((m) => {
                    const testCount = configs.filter(
                      (c) => c.machine_name === m.machine
                    ).length;
                    const lotCount = reagents.filter(
                      (r) => r.machine_name === m.machine
                    ).length;
                    return (
                      <div
                        key={m.machine}
                        className="flex items-center justify-between px-3 py-2 rounded-xl bg-white border border-slate-200 text-xs font-bold"
                      >
                        <div>
                          <span className="text-slate-900">{m.machine}</span>
                          <span className="block text-[10px] font-normal text-slate-500">
                            {testCount} test · {lotCount} lô QC
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            title="Đổi tên thiết bị đồng bộ"
                            onClick={() => handleRenameMachine(sec, m.machine)}
                            className="p-1.5 rounded-lg bg-slate-100 hover:bg-blue-50 text-slate-600 hover:text-blue-600 transition"
                          >
                            <Ic.Edit />
                          </button>
                          <button
                            type="button"
                            title="Xóa thiết bị & dọn cấu hình"
                            onClick={() =>
                              handleDeleteMachineCascade(sec, m.machine)
                            }
                            className="p-1.5 rounded-lg bg-slate-100 hover:bg-rose-50 text-slate-400 hover:text-rose-600 transition"
                          >
                            <Ic.Trash />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                  {macsInSec.length === 0 && (
                    <div className="text-xs text-slate-400 italic">
                      Chưa có thiết bị nào.
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 4. QUẢN TRỊ NHÂN SỰ & MA TRẬN 8 QUYỀN CHI TIẾT (CÓ QUYỀN LÙI NGÀY CŨ) */}
      <div className="bg-white border border-slate-200 rounded-3xl p-5 shadow-sm space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-black text-slate-900 uppercase">
              👥 Quản Trị Tài Khoản Nhân Sự & Ma Trận Phân Quyền Chi Tiết
            </h3>
            <p className="text-xs text-slate-500 mt-1">
              Cấp quyền <b>"Sửa kết quả QC ngày hôm trước"</b>{" "}
              (`EDIT_PAST_DATE`) để cho phép nhân sự lùi ngày nhập bổ sung kết
              quả QC cũ.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs">
            <div className="relative">
              <span className="absolute left-2.5 top-2.5 text-slate-400">
                <Ic.Search />
              </span>
              <input
                type="text"
                value={userSearchText}
                onChange={(e) => setUserSearchText(e.target.value)}
                placeholder="Tìm nhân sự..."
                className="bg-slate-50 border border-slate-300 rounded-xl pl-8 pr-2.5 py-2 font-semibold w-36 outline-none focus:border-blue-500"
              />
            </div>

            <form
              onSubmit={handleAddUser}
              className="flex flex-wrap items-center gap-2"
            >
              <input
                type="text"
                required
                value={newUserId}
                onChange={(e) => setNewUserId(e.target.value)}
                placeholder="ID (VD: ktv01)..."
                className="bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 font-mono font-bold w-32 outline-none focus:border-emerald-500"
              />
              <input
                type="text"
                required
                value={newUserName}
                onChange={(e) => setNewUserName(e.target.value)}
                placeholder="Họ và tên nhân sự..."
                className="bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 font-bold w-44 outline-none focus:border-emerald-500"
              />
              <select
                value={newUserRole}
                onChange={(e) => setNewUserRole(e.target.value as UserRole)}
                className="bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 font-black outline-none"
              >
                <option value="USER">USER (Nhân viên)</option>
                <option value="QLCM">QLCM (Quản lý CM)</option>
                <option value="ADMIN">ADMIN (Quản trị)</option>
              </select>
              <button
                type="submit"
                className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-black shadow-sm flex items-center gap-1"
              >
                <Ic.Plus /> Cấp Tài Khoản Mới
              </button>
            </form>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs border border-slate-200 rounded-2xl overflow-hidden">
            <thead>
              <tr className="bg-slate-900 text-white uppercase text-[10.5px]">
                <th className="py-2.5 px-3">ID · Họ tên</th>
                <th className="py-2.5 px-3 text-center">Vai trò</th>
                {ALL_PERMISSIONS.map((p) => (
                  <th
                    key={p.key}
                    className="py-2.5 px-2 text-center"
                    title={p.desc}
                  >
                    {p.label}
                  </th>
                ))}
                <th className="py-2.5 px-3 text-right">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {filteredUsers.map((u) => {
                const isRoot = u.id.toLowerCase() === "thlong";
                const effPerms = getEffectivePermissions(u);
                return (
                  <tr key={u.id} className="hover:bg-slate-50 transition">
                    <td className="py-3 px-3">
                      <div className="font-black text-slate-900">{u.name}</div>
                      <div className="font-mono text-[10.5px] text-slate-500 mt-0.5">
                        ID: {u.id}{" "}
                        {u.mustChange ? "· (Chưa đổi MK mặc định)" : ""}
                      </div>
                    </td>
                    <td className="py-3 px-3 text-center">
                      <select
                        disabled={isRoot}
                        value={u.role}
                        onChange={(e) =>
                          handleChangeUserRole(u, e.target.value as UserRole)
                        }
                        className="bg-slate-100 border border-slate-300 rounded-lg px-2 py-1.5 font-black text-[11px] outline-none"
                      >
                        <option value="USER">USER</option>
                        <option value="QLCM">QLCM</option>
                        <option value="ADMIN">ADMIN</option>
                      </select>
                    </td>
                    {ALL_PERMISSIONS.map((p) => {
                      const checked = effPerms.indexOf(p.key) !== -1;
                      return (
                        <td key={p.key} className="py-3 px-2 text-center">
                          <input
                            type="checkbox"
                            disabled={isRoot}
                            checked={checked}
                            onChange={() =>
                              handleToggleUserPermission(u, p.key)
                            }
                            className="w-4 h-4 accent-blue-600 cursor-pointer rounded"
                          />
                        </td>
                      );
                    })}
                    <td className="py-3 px-3 text-right whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => handleResetPassword(u)}
                        className="px-3 py-1.5 rounded-lg bg-amber-100 hover:bg-amber-200 text-amber-900 font-bold text-[11px] mr-2 shadow-sm transition"
                      >
                        Reset MK
                      </button>
                      {!isRoot && (
                        <button
                          type="button"
                          onClick={() => handleDeleteUser(u)}
                          className="px-3 py-1.5 rounded-lg bg-rose-100 hover:bg-rose-200 text-rose-800 font-bold text-[11px] shadow-sm transition"
                        >
                          Xóa
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
// ================= KẾT THÚC TOÀN BỘ FILE QuanTriHeThong.tsx =================
