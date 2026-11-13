import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  DEFAULT_SCRIPT_URL,
  STORAGE_KEYS,
  usePersistentState,
  rpcCall,
  UserAccount,
  SectionLock,
  ReagentLotBM16,
  HistoryPoint,
  TestConfig,
  BM09LogEntry,
  AuditLogEntry,
  formatDateVN,
  formatShortDM,
  getVnIsoDateString,
  getVnFirstDayOfMonthString,
  getVnTimeString,
  computeMuAndSigma,
  hasPermission,
  INITIAL_USERS,
  MobileDraftIndexItem,
  formatSDPositionBadge,
} from "./KieuDuLieu";

import BangDieuKhien from "./BangDieuKhien";
import NhapKetQuaQC from "./NhapKetQuaQC";
import QuanLyDanhMuc from "./QuanLyDanhMuc";
import TroLyRangeMU from "./TroLyRangeMU";
import HoSoInAnISO from "./HoSoInAnISO";
import QuanTriHeThong from "./QuanTriHeThong";
import Luminous3DLJChart, { mergeArchivedAndActivePoints } from "./BieuDoLJ";

// ============================================================================
// FILE 3: src/UngDungChinh.tsx (V7.1 ENTERPRISE BACKBONE — FULL CONNECTION)
// - Khớp nối hoàn chỉnh 7 xương sườn độc lập (Plug-and-Play).
// - Khôi phục Thanh lọc Biểu đồ L-J (Theo Ngày / Theo Lô / So sánh Mean Hãng / Ẩn lỗi).
// - Đồng bộ 100% Modal Audit Trail (Sửa điểm update_qc_values & Xóa điểm admin_void_point)
//   giữa Biểu đồ L-J, Sổ BM.09 và Google Sheets.
// - Khôi phục Modal QR Động kết nối nhanh Điện thoại <-> Máy chủ Google Sheets.
// - Quản lý Hàng đợi Đồng bộ Offline (pendingSyncQueue) tự động đẩy khi có mạng.
// ✦ An intellectual product by Handsome Long ✦
// ============================================================================

const OrioBrandLogo = ({ size = 48 }: { size?: number }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 120 120"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className="shrink-0 select-none"
  >
    <defs>
      <linearGradient
        id="orioBg"
        x1="0"
        y1="0"
        x2="120"
        y2="120"
        gradientUnits="userSpaceOnUse"
      >
        <stop offset="0%" stopColor="#0ea5e9" />
        <stop offset="50%" stopColor="#2563eb" />
        <stop offset="100%" stopColor="#4f46e5" />
      </linearGradient>
      <linearGradient
        id="orioRim"
        x1="0"
        y1="0"
        x2="120"
        y2="120"
        gradientUnits="userSpaceOnUse"
      >
        <stop offset="0%" stopColor="#bae6fd" />
        <stop offset="50%" stopColor="#ffffff" />
        <stop offset="100%" stopColor="#818cf8" />
      </linearGradient>
      <linearGradient
        id="goldSign"
        x1="0"
        y1="0"
        x2="120"
        y2="0"
        gradientUnits="userSpaceOnUse"
      >
        <stop offset="0%" stopColor="#fde047" />
        <stop offset="50%" stopColor="#fef08a" />
        <stop offset="100%" stopColor="#f59e0b" />
      </linearGradient>
    </defs>
    <rect
      x="4"
      y="4"
      width="112"
      height="112"
      rx="28"
      fill="url(#orioBg)"
      stroke="url(#orioRim)"
      strokeWidth="3.5"
    />
    <path
      d="M16 14C35 8 85 8 104 14C108 26 95 36 60 36C25 36 12 26 16 14Z"
      fill="white"
      fillOpacity="0.16"
    />
    <circle cx="31" cy="54" r="14" stroke="#e0f2fe" strokeWidth="4.2" />
    <path
      d="M52 68V40H63C68 40 71 43 71 48C71 53 68 56 63 56H52M61 56L71 68"
      stroke="#e0f2fe"
      strokeWidth="4.2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <line
      x1="79"
      y1="40"
      x2="79"
      y2="68"
      stroke="#e0f2fe"
      strokeWidth="4.2"
      strokeLinecap="round"
    />
    <circle cx="97" cy="54" r="12" stroke="#e0f2fe" strokeWidth="4.2" />
    <path
      d="M9 54H21L25 43L31 65L36 48L40 54H58"
      stroke="#67e8f9"
      strokeWidth="3.2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <text
      x="60"
      y="95"
      textAnchor="middle"
      fill="url(#goldSign)"
      fontSize="13.5"
      fontWeight="800"
      fontStyle="italic"
      fontFamily="Georgia, serif"
      letterSpacing="0.4"
    >
      Handsome Long
    </text>
  </svg>
);

const Ic = {
  Lock: () => (
    <svg
      width="15"
      height="15"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      viewBox="0 0 24 24"
    >
      <rect x="3" y="11" width="18" height="11" rx="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  ),
  User: () => (
    <svg
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      viewBox="0 0 24 24"
    >
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  ),
  Logout: () => (
    <svg
      width="17"
      height="17"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      viewBox="0 0 24 24"
    >
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" y1="12" x2="9" y2="12" />
    </svg>
  ),
  Clock: () => (
    <svg
      width="15"
      height="15"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      viewBox="0 0 24 24"
    >
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  ),
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
};

const LiveClockBadge = React.memo(function LiveClockBadge() {
  const [nowStr, setNowStr] = useState<string>(() =>
    new Date().toLocaleTimeString("vi-VN", { hour12: false })
  );
  useEffect(() => {
    const timer = window.setInterval(() => {
      setNowStr(new Date().toLocaleTimeString("vi-VN", { hour12: false }));
    }, 1000);
    return () => window.clearInterval(timer);
  }, []);
  return (
    <div className="flex items-center gap-1 text-emerald-700 font-mono font-extrabold bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200">
      <Ic.Clock />
      <span>{nowStr}</span>
    </div>
  );
});

type NavTab =
  | "DASHBOARD"
  | "KIOSK"
  | "CHARTS_LJ"
  | "CATALOG_SETUP"
  | "ASSISTANT_ISO"
  | "ISO_REPORTS"
  | "ACCOUNTS";

interface SelectedPointModalState {
  levelKey: "L1" | "L2" | "L3";
  levelLabel: string;
  point: HistoryPoint;
  testId: string;
  testName: string;
  unit: string;
  editValDraft: string;
  editNoteDraft: string;
}

export default function UngDungChinh() {
  const [apiUrl, setApiUrl] = usePersistentState<string>(
    STORAGE_KEYS.API_URL,
    DEFAULT_SCRIPT_URL
  );
  const [authToken, setAuthToken] = usePersistentState<string>(
    STORAGE_KEYS.TOKEN,
    ""
  );
  const [users, setUsers] = usePersistentState<UserAccount[]>(
    STORAGE_KEYS.USERS,
    INITIAL_USERS
  );
  const [currentUser, setCurrentUser] = usePersistentState<UserAccount | null>(
    STORAGE_KEYS.AUTH,
    null
  );

  useEffect(() => {
    if (!currentUser) return;
    const safeUsers = Array.isArray(users) ? users : INITIAL_USERS;
    const latest = safeUsers.find(
      (u) => u.id.toLowerCase() === currentUser.id.toLowerCase()
    );
    if (
      latest &&
      (latest.role !== currentUser.role ||
        JSON.stringify(latest.permissions) !==
          JSON.stringify(currentUser.permissions))
    ) {
      setCurrentUser(latest);
    }
  }, [users, currentUser, setCurrentUser]);

  const [loginUser, setLoginUser] = useState("");
  const [loginPass, setLoginPass] = useState("");
  const [loginErr, setLoginErr] = useState("");
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [syncBadge, setSyncBadge] = useState<string>("Đã lưu bền vững");
  const [pendingForceUser, setPendingForceUser] = useState<UserAccount | null>(
    null
  );
  const [newPasswordInput, setNewPasswordInput] = useState("");
  const [confirmPasswordInput, setConfirmPasswordInput] = useState("");
  const [pwChangeErr, setPwChangeErr] = useState("");
  const [isChangingPw, setIsChangingPw] = useState(false);

  const todayIso = getVnIsoDateString();
  const [runDate, setRunDate] = useState<string>(() => getVnIsoDateString());

  const [sections, setSections] = usePersistentState<string[]>(
    STORAGE_KEYS.SECTIONS,
    ["Sinh Hóa", "Huyết học", "Miễn dịch"]
  );
  const [labMachines, setLabMachines] = usePersistentState<
    { section: string; machine: string }[]
  >(STORAGE_KEYS.MACHINES, [
    { section: "Sinh Hóa", machine: "DXC 1" },
    { section: "Huyết học", machine: "Compact Max" },
  ]);
  const [reagents, setReagents] = usePersistentState<ReagentLotBM16[]>(
    STORAGE_KEYS.REAGENTS,
    []
  );
  const [configs, setConfigs] = usePersistentState<TestConfig[]>(
    STORAGE_KEYS.CONFIGS,
    []
  );
  const [bm09Logs, setBm09Logs] = usePersistentState<BM09LogEntry[]>(
    STORAGE_KEYS.BM09,
    []
  );
  const [sectionLocks, setSectionLocks] = usePersistentState<SectionLock[]>(
    STORAGE_KEYS.LOCKS,
    []
  );

  const [pendingSyncQueue, setPendingSyncQueue] = usePersistentState<
    Record<string, any>[]
  >(STORAGE_KEYS.SYNC_QUEUE, []);
  const [pendingMobileDrafts, setPendingMobileDrafts] = useState<
    MobileDraftIndexItem[]
  >([]);
  const [showMobileQrModal, setShowMobileQrModal] = useState<boolean>(false);

  const [activeTab, setActiveTab] = useState<NavTab>("DASHBOARD");

  const [chartSection, setChartSection] = useState<string>("Sinh Hóa");
  const [chartMachine, setChartMachine] = useState<string>("DXC 1");
  const [chartTestId, setChartTestId] = useState<string>("");
  const [chartIsoOnlyFilter, setChartIsoOnlyFilter] = useState<boolean>(false);
  const [chartLevelMode, setChartLevelMode] = useState<
    "L1" | "L2" | "L3" | "COMBINED"
  >("COMBINED");
  const [compareOldLot, setCompareOldLot] = useState<boolean>(false);
  const [hideFailsOnChart, setHideFailsOnChart] = useState<boolean>(false);
  const [chartFilterMode, setChartFilterMode] = useState<
    "DATE_RANGE" | "BY_LOT"
  >("DATE_RANGE");
  const [chartLotFilter, setChartLotFilter] = useState<string>("ALL");
  const [chartFromDate, setChartFromDate] = useState<string>(() =>
    getVnFirstDayOfMonthString()
  );
  const [chartToDate, setChartToDate] = useState<string>(() =>
    getVnIsoDateString()
  );
  const [chartArchivedMap, setChartArchivedMap] = useState<
    Record<
      string,
      { L1: HistoryPoint[]; L2: HistoryPoint[]; L3: HistoryPoint[] }
    >
  >({});
  const [selectedPointInfo, setSelectedPointInfo] =
    useState<SelectedPointModalState | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const qrApi = params.get("api");
    if (qrApi && qrApi.startsWith("https://script.google.com/macros/s/")) {
      setApiUrl(qrApi.trim());
      const cleanUrl = window.location.origin + window.location.pathname;
      window.history.replaceState({}, document.title, cleanUrl);
    }
  }, [setApiUrl]);

  const flushPendingOfflineQueue = useCallback(async (): Promise<boolean> => {
    if (pendingSyncQueue.length === 0) return true;
    const remaining: Record<string, any>[] = [];
    for (let i = 0; i < pendingSyncQueue.length; i++) {
      const item = pendingSyncQueue[i];
      const res = await rpcCall(apiUrl, "save_batch", item, authToken);
      if (!res.net || res.body?.status !== "success") {
        remaining.push(...pendingSyncQueue.slice(i));
        break;
      }
    }
    setPendingSyncQueue(remaining);
    return remaining.length === 0;
  }, [pendingSyncQueue, apiUrl, authToken, setPendingSyncQueue]);

  const handleEnqueueOfflineBatch = useCallback(
    (batchPayload: Record<string, any>) => {
      setPendingSyncQueue((prev) => [...prev, batchPayload]);
      setSyncBadge(`Còn ${pendingSyncQueue.length + 1} gói chờ mạng`);
    },
    [pendingSyncQueue.length, setPendingSyncQueue]
  );

  const syncFromCloud = useCallback(async () => {
    setSyncBadge("Đang đồng bộ...");
    if (pendingSyncQueue.length > 0) {
      const okFlush = await flushPendingOfflineQueue();
      if (!okFlush) {
        setSyncBadge(`Còn ${pendingSyncQueue.length} gói chờ mạng`);
        return;
      }
    }

    const res = await rpcCall(apiUrl, "get_bootstrap", {}, authToken);
    if (res.net && res.body?.status === "success" && res.body?.data) {
      const d = res.body.data;
      if (Array.isArray(d.sections) && d.sections.length > 0)
        setSections(d.sections);
      if (Array.isArray(d.lab_machines) && d.lab_machines.length > 0)
        setLabMachines(d.lab_machines);
      if (Array.isArray(d.reagents)) setReagents(d.reagents);
      if (Array.isArray(d.configs)) setConfigs(d.configs);
      if (Array.isArray(d.bm09_logs)) setBm09Logs(d.bm09_logs);
      if (Array.isArray(d.section_locks)) setSectionLocks(d.section_locks);
      if (Array.isArray(d.mobile_drafts))
        setPendingMobileDrafts(d.mobile_drafts);

      if (Array.isArray(d.users) && d.users.length > 0) {
        setUsers((prev) => {
          const safePrev = Array.isArray(prev) ? prev : INITIAL_USERS;
          const remoteMap = new Map<string, UserAccount>();
          d.users.forEach((ru: any) => {
            if (ru && ru.id) {
              remoteMap.set(String(ru.id).toLowerCase(), {
                id: String(ru.id),
                name: String(ru.name || ru.id),
                password: String(ru.password || "Longdeptrai"),
                role: ru.role || "USER",
                mustChange: Boolean(ru.mustChange),
                permissions: Array.isArray(ru.permissions)
                  ? ru.permissions
                  : [],
              });
            }
          });
          safePrev.forEach((localU) => {
            const k = localU.id.toLowerCase();
            if (!remoteMap.has(k)) remoteMap.set(k, localU);
          });
          return Array.from(remoteMap.values());
        });
      }
      setSyncBadge("Đã đồng bộ G.Sheets");
    } else {
      setSyncBadge(
        pendingSyncQueue.length > 0
          ? `Còn ${pendingSyncQueue.length} gói chờ mạng`
          : "Đã lưu bền vững (Local)"
      );
    }
  }, [
    apiUrl,
    authToken,
    pendingSyncQueue.length,
    flushPendingOfflineQueue,
    setSections,
    setLabMachines,
    setReagents,
    setConfigs,
    setBm09Logs,
    setSectionLocks,
    setUsers,
  ]);

  useEffect(() => {
    syncFromCloud();
  }, [syncFromCloud]);

  useEffect(() => {
    const handleOnline: EventListener = () => {
      if (pendingSyncQueue.length > 0) {
        syncFromCloud();
      }
    };
    window.addEventListener("online", handleOnline);
    return () => window.removeEventListener("online", handleOnline);
  }, [pendingSyncQueue.length, syncFromCloud]);

  useEffect(() => {
    if (activeTab !== "CHARTS_LJ" || !chartTestId) return;
    const targetCfg = configs.find((c) => c.test_id === chartTestId);
    if (!targetCfg) return;
    const earliestHot = targetCfg.history_L1?.[0]?.isoDate || "9999-12-31";
    if (chartFromDate < earliestHot) {
      const archKey = `${chartTestId}__${chartFromDate.slice(
        0,
        7
      )}__${chartToDate.slice(0, 7)}`;
      if (chartArchivedMap[archKey]) return;
      rpcCall(
        apiUrl,
        "get_historical_data",
        {
          test_id: chartTestId,
          from_month: chartFromDate.slice(0, 7),
          to_month: chartToDate.slice(0, 7),
        },
        authToken
      ).then((res) => {
        if (
          res.net &&
          res.body?.status === "success" &&
          res.body.data?.lj_archive
        ) {
          setChartArchivedMap((prev) => ({
            ...prev,
            [archKey]: res.body.data.lj_archive,
          }));
        }
      });
    }
  }, [
    activeTab,
    chartTestId,
    chartFromDate,
    chartToDate,
    configs,
    apiUrl,
    authToken,
    chartArchivedMap,
  ]);

  const handleRunDateChange = (nextDate: string) => {
    if (nextDate < todayIso && !hasPermission(currentUser, "EDIT_PAST_DATE")) {
      window.alert(
        "Tài khoản của bạn chưa được cấp quyền quay lại ngày trước để xem/sửa kết quả QC!"
      );
      return;
    }
    setRunDate(nextDate);
  };

  const validatePasswordRules = (pw: string): string => {
    if (pw.length < 8) return "Mật khẩu phải có ít nhất 8 ký tự.";
    if (!/[A-Z]/.test(pw))
      return "Mật khẩu bắt buộc phải có ít nhất 1 chữ IN HOA.";
    if (!/[^A-Za-z0-9]/.test(pw))
      return "Mật khẩu bắt buộc phải có ít nhất 1 ký tự đặc biệt (VD: @, #, !, *, $...).";
    for (const seq of ["1234", "2468", "3579"]) {
      if (pw.indexOf(seq) !== -1)
        return `Mật khẩu không được chứa chuỗi số theo thứ tự cấm (${seq}).`;
    }
    if (pw.toLowerCase() === "longdeptrai")
      return "Không được sử dụng lại mật khẩu mặc định Longdeptrai.";
    return "";
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    const uid = loginUser.trim().toLowerCase();
    if (!uid || !loginPass) return;
    setIsLoggingIn(true);
    setLoginErr("");

    const serverRes = await rpcCall(
      apiUrl,
      "login",
      { id: uid, password: loginPass },
      undefined,
      10000
    );
    setIsLoggingIn(false);

    if (
      serverRes.net &&
      serverRes.body?.status === "success" &&
      serverRes.body?.data?.user
    ) {
      const remoteUser: UserAccount = serverRes.body.data.user;
      const token = String(serverRes.body.data.token || "");
      if (token) setAuthToken(token);

      setUsers((prev) => {
        const safePrev = Array.isArray(prev) ? prev : INITIAL_USERS;
        const exists = safePrev.some(
          (u) => u.id.toLowerCase() === remoteUser.id.toLowerCase()
        );
        if (exists)
          return safePrev.map((u) =>
            u.id.toLowerCase() === remoteUser.id.toLowerCase() ? remoteUser : u
          );
        return [...safePrev, remoteUser];
      });

      if (loginPass === "Longdeptrai" || remoteUser.mustChange) {
        setPendingForceUser(remoteUser);
        setNewPasswordInput("");
        setConfirmPasswordInput("");
        setPwChangeErr("");
        return;
      }
      setCurrentUser(remoteUser);
      setActiveTab("DASHBOARD");
      syncFromCloud();
      return;
    }

    const safeUsers =
      Array.isArray(users) && users.length > 0 ? users : INITIAL_USERS;
    const foundLocal = safeUsers.find(
      (u) =>
        (u.id.toLowerCase() === uid || u.name.toLowerCase() === uid) &&
        u.password === loginPass
    );
    if (!foundLocal) {
      setLoginErr(
        serverRes.net
          ? serverRes.body?.message || "Sai Tài khoản đăng nhập hoặc Mật khẩu!"
          : "Không thể kết nối máy chủ và sai mật khẩu lưu tạm!"
      );
      return;
    }
    if (loginPass === "Longdeptrai" || foundLocal.mustChange) {
      setPendingForceUser(foundLocal);
      setNewPasswordInput("");
      setConfirmPasswordInput("");
      setPwChangeErr("");
      return;
    }
    setCurrentUser(foundLocal);
    setActiveTab("DASHBOARD");
  };

  const handleCompleteForcePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pendingForceUser) return;
    const ruleErr = validatePasswordRules(newPasswordInput);
    if (ruleErr) {
      setPwChangeErr(ruleErr);
      return;
    }
    if (newPasswordInput !== confirmPasswordInput) {
      setPwChangeErr("Mật khẩu xác nhận không khớp với mật khẩu mới!");
      return;
    }

    setIsChangingPw(true);
    setPwChangeErr("");
    const res = await rpcCall(
      apiUrl,
      "change_password",
      {
        id: pendingForceUser.id,
        oldPassword: pendingForceUser.password,
        newPassword: newPasswordInput,
      },
      authToken,
      14000
    );
    setIsChangingPw(false);

    if (res.net && res.body?.status === "error") {
      setPwChangeErr(
        res.body.message ||
          "Không thể đổi mật khẩu! Tài khoản này đã được đổi mật khẩu trước đó."
      );
      return;
    }

    const updatedUser: UserAccount = {
      ...pendingForceUser,
      password: newPasswordInput,
      mustChange: false,
    };
    setUsers((prev) => {
      const safePrev = Array.isArray(prev) ? prev : INITIAL_USERS;
      return safePrev.map((u) =>
        u.id.toLowerCase() === updatedUser.id.toLowerCase() ? updatedUser : u
      );
    });
    if (res.net && res.body?.data?.token) {
      setAuthToken(res.body.data.token);
      setSyncBadge("Đã lưu mật khẩu lên G.Sheets");
    }
    setPendingForceUser(null);
    setCurrentUser(updatedUser);
    setActiveTab("DASHBOARD");
  };

  const jumpToAssistantWithFilter = useCallback(
    (payload: {
      section: string;
      machine?: string;
      test_id?: string;
      viewMode?: "RANGE" | "QUALITY";
    }) => {
      sessionStorage.setItem("DEEP_LINK_TEST", JSON.stringify(payload));
      setActiveTab("ASSISTANT_ISO");
    },
    []
  );

  const jumpToLJChart = useCallback(
    (testId: string, isoOnly = false) => {
      const target = configs.find((c) => c.test_id === testId);
      if (!target) return;
      setChartSection(target.section);
      setChartMachine(target.machine_name);
      setChartTestId(target.test_id);
      setChartIsoOnlyFilter(isoOnly);
      setSelectedPointInfo(null);
      setActiveTab("CHARTS_LJ");
    },
    [configs]
  );

  // --- HÀM SỬA ĐIỂM L-J CÓ GHI DẤU VẾT KIỂM TOÁN (AUDIT TRAIL ISO 15189) & ĐỒNG BỘ BM.09 ---
  const handleSaveEditedPointOnLJ = async () => {
    if (!selectedPointInfo || !currentUser) return;
    const { levelKey, point, testId, editValDraft, editNoteDraft } =
      selectedPointInfo;
    const rawNum = parseFloat(editValDraft.trim().replace(/,/g, "."));
    if (isNaN(rawNum)) {
      window.alert("Vui lòng nhập giá trị số hợp lệ!");
      return;
    }

    const targetCfg = configs.find((c) => c.test_id === testId);
    const meanRef =
      levelKey === "L1"
        ? targetCfg?.mean_L1 || 0
        : levelKey === "L2"
        ? targetCfg?.mean_L2 || 0
        : targetCfg?.mean_L3 || 0;
    const sdRef =
      levelKey === "L1"
        ? targetCfg?.sd_L1 || 0
        : levelKey === "L2"
        ? targetCfg?.sd_L2 || 0
        : targetCfg?.sd_L3 || 0;
    const newZ =
      sdRef > 0 ? Number(((rawNum - meanRef) / sdRef).toFixed(2)) : 0;
    const absZ = Math.abs(newZ);
    const newStatus: "PASS" | "WARN" | "FAIL" =
      absZ >= 3 ? "FAIL" : absZ >= 2 ? "WARN" : "PASS";
    const newRule =
      absZ >= 3
        ? `1-3s (${levelKey})`
        : absZ >= 2
        ? `1-2s (${levelKey})`
        : "Đạt chuẩn (Trong ±2SD)";

    const nowStamp = `${formatShortDM(
      getVnIsoDateString()
    )} ${getVnTimeString()}`;

    const auditEntry: AuditLogEntry = {
      edited_at: nowStamp,
      edited_by: currentUser.name,
      old_val: point.val,
      new_val: rawNum,
      old_z: point.z,
      new_z: newZ,
      note: editNoteDraft.trim() || "Hiệu chỉnh điểm trên biểu đồ L-J",
    };

    const histField =
      levelKey === "L1"
        ? "history_L1"
        : levelKey === "L2"
        ? "history_L2"
        : "history_L3";

    let updatedCfgForCloud: TestConfig | null = null;
    setConfigs((prev) =>
      prev.map((c) => {
        if (c.test_id !== testId) return c;
        const nextArr = (c[histField] || []).map((pt) => {
          if (
            pt.isoDate === point.isoDate &&
            pt.lot_number === point.lot_number &&
            Boolean(pt.is_rerun) === Boolean(point.is_rerun)
          ) {
            return {
              ...pt,
              val: rawNum,
              z: newZ,
              status: newStatus,
              single_level_status: newStatus,
              single_level_rule: newRule,
              rule: newRule,
              edit_log: [...(pt.edit_log || []), auditEntry],
            };
          }
          return pt;
        });
        const nextObj = { ...c, [histField]: nextArr };
        updatedCfgForCloud = nextObj;
        return nextObj;
      })
    );

    if (!point.is_rerun) {
      setBm09Logs((prev) =>
        prev.map((log) => {
          if (log.test_id === testId && log.run_date === point.isoDate) {
            const updatedLog = {
              ...log,
              edit_log: [...(log.edit_log || []), auditEntry],
            };
            if (levelKey === "L1") {
              updatedLog.val_L1 = rawNum;
              updatedLog.z_L1 = newZ;
              updatedLog.lvl1_status = newStatus;
            } else if (levelKey === "L2") {
              updatedLog.val_L2 = rawNum;
              updatedLog.z_L2 = newZ;
              updatedLog.lvl2_status = newStatus;
            } else {
              updatedLog.val_L3 = rawNum;
              updatedLog.z_L3 = newZ;
              updatedLog.lvl3_status = newStatus;
            }

            const z1Abs = Math.abs(updatedLog.z_L1 ?? 0);
            const z2Abs = Math.abs(updatedLog.z_L2 ?? 0);
            const z3Abs = Math.abs(updatedLog.z_L3 ?? 0);
            if (
              z1Abs < 3 &&
              z2Abs < 3 &&
              z3Abs < 3 &&
              updatedLog.status === "FAIL"
            ) {
              updatedLog.status =
                z1Abs >= 2 || z2Abs >= 2 || z3Abs >= 2 ? "WARN" : "PASS";
              updatedLog.resolved = true;
              updatedLog.rules_single = "";
              updatedLog.rules_cross = "";
              updatedLog.post_fix_result = `Đã hiệu chỉnh số liệu (${nowStamp})`;
            }
            return updatedLog;
          }
          return log;
        })
      );
    }

    setSelectedPointInfo(null);

    const updatePayload: Record<string, any> = {
      test_id: testId,
      run_date: point.isoDate,
      editor_name: currentUser.name,
      edit_note: editNoteDraft.trim() || "Hiệu chỉnh điểm trên biểu đồ L-J",
    };
    updatePayload[`val_${levelKey}`] = rawNum;

    await rpcCall(apiUrl, "update_qc_values", updatePayload, authToken);
    if (updatedCfgForCloud) {
      await rpcCall(apiUrl, "save_config", updatedCfgForCloud, authToken);
    }
  };

  // --- HÀM XÓA ĐIỂM L-J BỊ NHẬP NHẦM (DÀNH CHO QUYỀN VOID_LJ_POINT) & GỠ CẢNH BÁO BM.09 ---
  const handleVoidPointOnLJ = async () => {
    if (!selectedPointInfo || !currentUser) return;
    if (!hasPermission(currentUser, "VOID_LJ_POINT")) {
      window.alert("Tài khoản của bạn chưa được cấp quyền Xóa điểm L-J!");
      return;
    }
    const { levelKey, point, testId, testName } = selectedPointInfo;
    if (
      !window.confirm(
        `Xác nhận XÓA điểm QC ngày ${formatDateVN(point.isoDate)} (${
          point.val
        }) của xét nghiệm ${testName} (${levelKey})?`
      )
    )
      return;

    const histField =
      levelKey === "L1"
        ? "history_L1"
        : levelKey === "L2"
        ? "history_L2"
        : "history_L3";

    let updatedCfgForCloud: TestConfig | null = null;
    setConfigs((prev) =>
      prev.map((c) => {
        if (c.test_id !== testId) return c;
        const nextArr = (c[histField] || []).filter(
          (pt) =>
            !(
              pt.isoDate === point.isoDate &&
              pt.lot_number === point.lot_number &&
              Boolean(pt.is_rerun) === Boolean(point.is_rerun)
            )
        );
        const nextObj = {
          ...c,
          [histField]: nextArr,
          accumulated_points: !point.is_rerun
            ? Math.max(0, c.accumulated_points - 1)
            : c.accumulated_points,
        };
        updatedCfgForCloud = nextObj;
        return nextObj;
      })
    );

    if (!point.is_rerun) {
      setBm09Logs((prev) =>
        prev
          .map((l) => {
            if (l.test_id !== testId || l.run_date !== point.isoDate) return l;
            const nextLog = { ...l };
            if (levelKey === "L1") {
              nextLog.val_L1 = null;
              nextLog.z_L1 = null;
              nextLog.lvl1_status = undefined;
            } else if (levelKey === "L2") {
              nextLog.val_L2 = null;
              nextLog.z_L2 = null;
              nextLog.lvl2_status = undefined;
            } else {
              nextLog.val_L3 = null;
              nextLog.z_L3 = null;
              nextLog.lvl3_status = undefined;
            }

            const hasAnyRemainingVal =
              nextLog.val_L1 !== null ||
              nextLog.val_L2 !== null ||
              (nextLog.val_L3 !== null && nextLog.val_L3 !== undefined);
            if (!hasAnyRemainingVal) return null;

            const remZ1 = Math.abs(nextLog.z_L1 ?? 0);
            const remZ2 = Math.abs(nextLog.z_L2 ?? 0);
            const remZ3 = Math.abs(nextLog.z_L3 ?? 0);
            if (remZ1 < 3 && remZ2 < 3 && remZ3 < 3) {
              nextLog.status =
                remZ1 >= 2 || remZ2 >= 2 || remZ3 >= 2 ? "WARN" : "PASS";
              nextLog.resolved = true;
              nextLog.rules_single = "";
              nextLog.rules_cross = "";
            }
            return nextLog;
          })
          .filter((item): item is BM09LogEntry => item !== null)
      );
    } else {
      setBm09Logs((prev) =>
        prev.map((l) => {
          if (l.test_id === testId && l.run_date === point.isoDate) {
            const copy = { ...l };
            delete copy.rerun_val;
            delete copy.rerun_level;
            return copy;
          }
          return l;
        })
      );
    }

    setSelectedPointInfo(null);
    await rpcCall(
      apiUrl,
      "admin_void_point",
      {
        test_id: testId,
        date: point.isoDate,
        val: point.val,
        is_rerun: Boolean(point.is_rerun),
        level: levelKey,
      },
      authToken
    );
    if (updatedCfgForCloud) {
      await rpcCall(apiUrl, "save_config", updatedCfgForCloud, authToken);
    }
  };

  const qrShareLink = useMemo(() => {
    if (typeof window === "undefined") return apiUrl;
    const base = `${window.location.origin}${window.location.pathname}`;
    return `${base}?api=${encodeURIComponent(apiUrl)}`;
  }, [apiUrl]);

  if (!currentUser) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-sky-100 via-white to-indigo-100 text-slate-800 flex items-center justify-center p-4 relative overflow-hidden font-sans">
        <style>{`
          @keyframes goldShimmer { 0% { background-position: -200% center; } 100% { background-position: 200% center; } }
          .gold-shimmer-text { background: linear-gradient(90deg, #b45309 0%, #d97706 25%, #f59e0b 50%, #d97706 75%, #b45309 100%); background-size: 200% auto; color: transparent; -webkit-background-clip: text; background-clip: text; animation: goldShimmer 4.5s linear infinite; }
        `}</style>
        <div className="w-full max-w-md bg-white/95 backdrop-blur-xl border border-sky-200/80 rounded-3xl p-8 shadow-[0_24px_60px_rgba(37,99,235,0.16)] relative z-10">
          <div className="flex items-center gap-4 mb-6">
            <OrioBrandLogo size={64} />
            <div>
              <h1 className="text-xl font-black tracking-tight text-slate-900">
                MEDLAB <span className="text-blue-600">IQC- ORIO</span>
              </h1>
              <p className="text-xs font-extrabold italic gold-shimmer-text tracking-wide mt-0.5">
                ✦ An intellectual product by Handsome Long ✦
              </p>
              <p className="text-[11px] text-slate-500 mt-0.5 font-medium">
                Hệ thống Quản trị Nội kiểm ISO 15189:2022 & QĐ 2429
              </p>
            </div>
          </div>

          {pendingForceUser ? (
            <form
              onSubmit={handleCompleteForcePasswordChange}
              className="space-y-4"
            >
              <div className="bg-amber-50 border border-amber-300 rounded-2xl p-3.5 text-xs text-amber-950">
                <div className="font-black uppercase text-amber-800 mb-1">
                  Đổi Mật Khẩu Mặc Định Lần Đầu
                </div>
                Xin chào <b>{pendingForceUser.name}</b> ({pendingForceUser.role}
                ). Mật khẩu mới sẽ được xác thực và khóa chặt trên máy chủ
                Google Sheets.
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Mật khẩu mới *
                </label>
                <input
                  type="password"
                  required
                  autoFocus
                  value={newPasswordInput}
                  onChange={(e) => setNewPasswordInput(e.target.value)}
                  placeholder="Ít nhất 8 ký tự, 1 chữ HOA, 1 ký tự đặc biệt..."
                  className="w-full bg-slate-50 border border-slate-300 focus:border-blue-600 focus:bg-white rounded-xl px-3.5 py-2.5 text-xs font-semibold outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Xác nhận mật khẩu mới *
                </label>
                <input
                  type="password"
                  required
                  value={confirmPasswordInput}
                  onChange={(e) => setConfirmPasswordInput(e.target.value)}
                  placeholder="Nhập lại mật khẩu mới..."
                  className="w-full bg-slate-50 border border-slate-300 focus:border-blue-600 focus:bg-white rounded-xl px-3.5 py-2.5 text-xs font-semibold outline-none"
                />
              </div>
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-[11px] text-slate-600 space-y-1">
                <div className="font-bold text-slate-800">
                  Quy tắc mật khẩu bắt buộc:
                </div>
                <div>
                  • Tối thiểu <b>8 ký tự</b>, ít nhất <b>1 chữ IN HOA</b> và{" "}
                  <b>1 ký tự đặc biệt</b>.
                </div>
                <div>
                  • Không chứa các chuỗi số thứ tự: <b>1234</b>, <b>2468</b>,{" "}
                  <b>3579</b>.
                </div>
              </div>
              {pwChangeErr && (
                <div className="text-xs font-bold text-rose-600 bg-rose-50 border border-rose-200 rounded-xl px-3.5 py-2.5">
                  {pwChangeErr}
                </div>
              )}
              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setPendingForceUser(null)}
                  className="w-1/3 py-2.5 rounded-xl font-bold text-xs bg-slate-100 hover:bg-slate-200 text-slate-700"
                >
                  Quay lại
                </button>
                <button
                  type="submit"
                  disabled={isChangingPw}
                  className="w-2/3 py-2.5 rounded-xl font-black text-xs uppercase bg-gradient-to-r from-emerald-500 to-teal-600 text-white shadow-md hover:brightness-105 disabled:opacity-50"
                >
                  {isChangingPw ? "⏳ Đang xác thực..." : "Lưu Vĩnh Viễn"}
                </button>
              </div>
            </form>
          ) : (
            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  Tài khoản đăng nhập
                </label>
                <div className="relative">
                  <span className="absolute left-3.5 top-3 text-slate-400">
                    <Ic.User />
                  </span>
                  <input
                    type="text"
                    required
                    value={loginUser}
                    onChange={(e) => setLoginUser(e.target.value)}
                    placeholder="Nhập ID (VD: thlong, hqsang...)"
                    className="w-full bg-slate-50 border border-slate-300 focus:border-blue-600 focus:bg-white rounded-xl pl-10 pr-3.5 py-2.5 text-xs text-slate-900 font-semibold outline-none transition"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  Mật khẩu
                </label>
                <div className="relative">
                  <span className="absolute left-3.5 top-3 text-slate-400">
                    <Ic.Lock />
                  </span>
                  <input
                    type="password"
                    required
                    value={loginPass}
                    onChange={(e) => setLoginPass(e.target.value)}
                    placeholder="Nhập mật khẩu..."
                    className="w-full bg-slate-50 border border-slate-300 focus:border-blue-600 focus:bg-white rounded-xl pl-10 pr-3.5 py-2.5 text-xs text-slate-900 font-semibold outline-none transition"
                  />
                </div>
              </div>
              {loginErr && (
                <div className="text-xs font-bold text-rose-600 bg-rose-50 border border-rose-200 rounded-xl px-3.5 py-2.5">
                  {loginErr}
                </div>
              )}
              <button
                type="submit"
                disabled={isLoggingIn}
                className="w-full py-3 rounded-xl font-black text-xs uppercase tracking-wider bg-gradient-to-r from-sky-500 via-blue-600 to-indigo-600 text-white shadow-[0_8px_20px_rgba(37,99,235,0.3)] hover:brightness-105 active:translate-y-0.5 transition disabled:opacity-50"
              >
                {isLoggingIn
                  ? "⏳ Đang kiểm tra bảo mật..."
                  : "Đăng Nhập Hệ Thống"}
              </button>
            </form>
          )}
        </div>
      </div>
    );
  }

  const canAccessCatalog =
    currentUser.role === "ADMIN" ||
    currentUser.role === "QLCM" ||
    hasPermission(currentUser, "MANAGE_CATALOG");
  const canAccessAssistant =
    currentUser.role === "ADMIN" ||
    currentUser.role === "QLCM" ||
    hasPermission(currentUser, "APPROVE_RANGE_MU") ||
    hasPermission(currentUser, "MANAGE_CATALOG");
  const canAccessAdminPanel =
    currentUser.role === "ADMIN" ||
    hasPermission(currentUser, "MANAGE_ACCOUNTS");

  return (
    <div className="min-h-screen bg-[#f4f7fb] text-slate-800 font-sans text-[12.5px]">
      <style>{`
        @keyframes goldShimmer { 0% { background-position: -200% center; } 100% { background-position: 200% center; } }
        .gold-shimmer { background: linear-gradient(90deg, #b45309 0%, #d97706 25%, #f59e0b 50%, #d97706 75%, #b45309 100%); background-size: 200% auto; color: transparent; -webkit-background-clip: text; background-clip: text; animation: goldShimmer 4s linear infinite; }
        .neon-lime-range { background: linear-gradient(135deg, #ecfccb 0%, #bef264 100%); color: #1a2e05; border: 1.5px solid #65a30d; box-shadow: 0 0 10px rgba(132, 204, 22, 0.4); }
        .neon-purple-range { background: linear-gradient(135deg, #f3e8ff 0%, #d8b4fe 50%, #c084fc 100%); color: #3b0764; border: 1.5px solid #9333ea; box-shadow: 0 0 12px rgba(168, 85, 247, 0.45); }
        @keyframes policeSiren { 0%, 100% { background: linear-gradient(135deg, #ef4444, #dc2626); box-shadow: 0 0 16px rgba(239,68,68,0.75), inset 0 1px 2px rgba(255,255,255,0.6); transform: scale(1.02); } 50% { background: linear-gradient(135deg, #991b1b, #e11d48); box-shadow: 0 0 6px rgba(225,29,72,0.4); transform: scale(1); } }
        .police-flash { animation: policeSiren 0.85s ease-in-out infinite; color: #ffffff !important; border-color: #fecdd3 !important; }
        .crystal-pass { background: linear-gradient(135deg, #10b981 0%, #059669 55%, #047857 100%); box-shadow: 0 4px 12px rgba(16,185,129,0.3), inset 0 1px 2px rgba(255,255,255,0.65); color: #ffffff; border-color: #6ee7b7; }
        .matte-warn { background: linear-gradient(135deg, #fef3c7 0%, #fde68a 100%); color: #92400e; border-color: #f59e0b; }
      `}</style>

      <header className="no-print bg-white/95 backdrop-blur-md border-b border-slate-200/90 px-4 py-2.5 flex flex-wrap items-center justify-between gap-2.5 sticky top-0 z-30 shadow-sm">
        <div className="flex items-center space-x-3">
          <OrioBrandLogo size={42} />
          <div>
            <div className="flex items-center gap-2">
              <span className="text-slate-900 font-black text-base tracking-tight">
                MEDLAB <span className="text-blue-600">IQC- ORIO</span>
              </span>
              <span className="rounded-full px-2.5 py-0.5 text-[10px] font-black uppercase whitespace-nowrap bg-blue-600 text-white inline-flex items-center justify-center tracking-wider shadow-sm">
                ISO 15189:2022 · QĐ 2429
              </span>
              {pendingMobileDrafts.length > 0 && (
                <button
                  type="button"
                  onClick={() => setActiveTab("KIOSK")}
                  className="rounded-full px-2.5 py-0.5 text-[10px] font-black bg-amber-400 hover:bg-amber-500 text-slate-950 animate-pulse shadow-xs transition"
                >
                  📲 {pendingMobileDrafts.length} ảnh/nháp ĐT
                </button>
              )}
            </div>
            <div className="text-[10.5px] font-bold italic gold-shimmer">
              ✦ An intellectual product by Handsome Long ✦
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 bg-slate-50 px-3 py-1.5 rounded-xl border border-slate-200 text-xs">
          <div className="flex items-center gap-1.5">
            <span className="text-slate-500 font-semibold">Ngày TH:</span>
            <input
              type="date"
              value={runDate}
              min={
                hasPermission(currentUser, "EDIT_PAST_DATE")
                  ? undefined
                  : todayIso
              }
              onChange={(e) => handleRunDateChange(e.target.value)}
              className="bg-white border border-slate-200 rounded-md px-2 py-0.5 text-blue-700 font-mono font-bold outline-none"
            />
          </div>
          <LiveClockBadge />
          <span className="text-slate-300">|</span>
          <div className="text-slate-600">
            <b className="text-slate-900">{currentUser.name}</b>{" "}
            <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-indigo-50 text-indigo-700 border border-indigo-200 uppercase">
              {currentUser.role}
            </span>
          </div>
          <button
            type="button"
            onClick={() => setShowMobileQrModal(true)}
            className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-300 text-[10.5px] font-black transition"
            title="Mở mã QR kết nối Điện thoại"
          >
            📱 QR ĐT
          </button>
          <button
            type="button"
            onClick={syncFromCloud}
            className={`flex items-center gap-1 px-2 py-0.5 rounded-md border text-[10.5px] font-bold transition ${
              pendingSyncQueue.length > 0
                ? "bg-rose-50 hover:bg-rose-100 text-rose-700 border-rose-300 animate-pulse"
                : "bg-sky-50 hover:bg-sky-100 text-sky-700 border-sky-200"
            }`}
          >
            <Ic.Sync /> {syncBadge}
          </button>
        </div>

        <div className="flex items-center gap-1.5">
          <nav className="flex flex-wrap items-center gap-1 bg-slate-100/90 p-1 rounded-xl border border-slate-200">
            {[
              { id: "DASHBOARD", label: "Dashboard", show: true },
              { id: "KIOSK", label: "Nhập Kết quả QC", show: true },
              { id: "CHARTS_LJ", label: "Biểu đồ L-J", show: true },
              {
                id: "CATALOG_SETUP",
                label: "Danh mục & Vật tư",
                show: canAccessCatalog,
              },
              {
                id: "ASSISTANT_ISO",
                label: "Trợ lý Range & MU",
                show: canAccessAssistant,
              },
              { id: "ISO_REPORTS", label: "Hồ sơ & In ISO", show: true },
              {
                id: "ACCOUNTS",
                label: "Quản lý Admin",
                show: canAccessAdminPanel,
              },
            ]
              .filter((t) => t.show)
              .map((t) => (
                <button
                  key={t.id}
                  onClick={() => setActiveTab(t.id as NavTab)}
                  className={`px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all duration-150 whitespace-nowrap ${
                    activeTab === t.id
                      ? "bg-gradient-to-r from-sky-500 to-blue-600 text-white shadow-[0_4px_12px_rgba(37,99,235,0.28)] scale-[1.02]"
                      : "text-slate-600 hover:text-slate-900 hover:bg-white"
                  }`}
                >
                  {t.label}
                </button>
              ))}
          </nav>
          <button
            onClick={() => {
              if (currentUser) {
                setSectionLocks((prev) =>
                  prev.filter(
                    (l) =>
                      l.user_id.toLowerCase() !== currentUser.id.toLowerCase()
                  )
                );
                rpcCall(
                  apiUrl,
                  "release_section_lock",
                  { user_id: currentUser.id },
                  authToken
                );
              }
              setCurrentUser(null);
            }}
            title="Đăng xuất"
            className="p-2 rounded-xl bg-rose-50 hover:bg-rose-600 text-rose-600 hover:text-white border border-rose-200 transition-all shadow-sm"
          >
            <Ic.Logout />
          </button>
        </div>
      </header>

      <main className="max-w-7xl mx-auto p-5">
        {/* ================================================================= */}
        {/* 1. TAB DASHBOARD TỔNG QUAN & KHẮC PHỤC SỰ CỐ (GẮN MODULE RIÊNG)    */}
        {/* ================================================================= */}
        {activeTab === "DASHBOARD" && (
          <BangDieuKhien
            apiUrl={apiUrl}
            authToken={authToken}
            currentUser={currentUser}
            runDate={runDate}
            configs={configs}
            setConfigs={setConfigs}
            reagents={reagents}
            bm09Logs={bm09Logs}
            setBm09Logs={setBm09Logs}
            sections={sections}
            labMachines={labMachines}
            onNavigateToAssistant={jumpToAssistantWithFilter}
            onNavigateToLJChart={jumpToLJChart}
            onNavigateToKiosk={() => setActiveTab("KIOSK")}
          />
        )}

        {/* ================================================================= */}
        {/* 2. TAB KIOSK NHẬP KẾT QUẢ QC                                        */}
        {/* ================================================================= */}
        {activeTab === "KIOSK" && (
          <NhapKetQuaQC
            apiUrl={apiUrl}
            authToken={authToken}
            currentUser={currentUser}
            runDate={runDate}
            sections={sections}
            labMachines={labMachines}
            configs={configs}
            setConfigs={setConfigs}
            reagents={reagents}
            setReagents={setReagents}
            bm09Logs={bm09Logs}
            setBm09Logs={setBm09Logs}
            sectionLocks={sectionLocks}
            setSectionLocks={setSectionLocks}
            pendingMobileDrafts={pendingMobileDrafts}
            setPendingMobileDrafts={setPendingMobileDrafts}
            onEnqueueOfflineBatch={handleEnqueueOfflineBatch}
          />
        )}

        {/* ================================================================= */}
        {/* 3. TAB BIỂU ĐỒ L-J TRỰC TIẾP & KIỂM TOÁN ĐIỂM (AUDIT TRAIL)        */}
        {/* ================================================================= */}
        {activeTab === "CHARTS_LJ" && (
          <div className="space-y-4">
            <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-extrabold text-slate-500 uppercase">
                    1. Lab:
                  </span>
                  {sections.map((sec) => (
                    <button
                      key={sec}
                      onClick={() => {
                        setChartSection(sec);
                        setChartIsoOnlyFilter(false);
                        const firstM =
                          labMachines.find((m) => m.section === sec)?.machine ||
                          "";
                        setChartMachine(firstM);
                        const firstT = configs.find(
                          (c) =>
                            c.section === sec &&
                            c.machine_name === firstM &&
                            c.test_type !== "QUALITATIVE"
                        );
                        if (firstT) setChartTestId(firstT.test_id);
                      }}
                      className={`px-3 py-1.5 rounded-xl text-xs font-extrabold transition ${
                        chartSection === sec
                          ? "bg-blue-600 text-white shadow-sm"
                          : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                      }`}
                    >
                      {sec}
                    </button>
                  ))}
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-extrabold text-slate-500 uppercase">
                    2. Thiết bị:
                  </span>
                  {labMachines
                    .filter((m) => m.section === chartSection)
                    .map((m) => (
                      <button
                        key={m.machine}
                        onClick={() => {
                          setChartMachine(m.machine);
                          const firstT = configs.find(
                            (c) =>
                              c.machine_name === m.machine &&
                              c.test_type !== "QUALITATIVE"
                          );
                          if (firstT) setChartTestId(firstT.test_id);
                        }}
                        className={`px-3 py-1.5 rounded-xl text-xs font-extrabold transition ${
                          chartMachine === m.machine
                            ? "bg-indigo-600 text-white shadow-sm"
                            : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                        }`}
                      >
                        {m.machine}
                      </button>
                    ))}
                </div>

                {(() => {
                  const currentTest =
                    configs.find(
                      (c) =>
                        c.test_id === chartTestId &&
                        c.test_type !== "QUALITATIVE"
                    ) || configs.find((c) => c.test_type !== "QUALITATIVE");
                  return (
                    <div className="flex flex-wrap items-center gap-2">
                      {chartIsoOnlyFilter && (
                        <button
                          onClick={() => setChartIsoOnlyFilter(false)}
                          className="px-3 py-1.5 rounded-xl text-xs font-black bg-blue-100 text-blue-800 border border-blue-300"
                        >
                          Đang lọc Test ISO (Nhấp bỏ)
                        </button>
                      )}
                      <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200 text-xs font-extrabold">
                        <button
                          type="button"
                          onClick={() => setChartLevelMode("L1")}
                          className={`px-3 py-1 rounded-lg transition ${
                            chartLevelMode === "L1"
                              ? "bg-sky-600 text-white shadow-sm"
                              : "text-slate-600 hover:text-slate-900"
                          }`}
                        >
                          Xem L1
                        </button>
                        {currentTest && currentTest.levels_count >= 2 && (
                          <button
                            type="button"
                            onClick={() => setChartLevelMode("L2")}
                            className={`px-3 py-1 rounded-lg transition ${
                              chartLevelMode === "L2"
                                ? "bg-purple-600 text-white shadow-sm"
                                : "text-slate-600 hover:text-slate-900"
                            }`}
                          >
                            Xem L2
                          </button>
                        )}
                        {currentTest && currentTest.levels_count === 3 && (
                          <button
                            type="button"
                            onClick={() => setChartLevelMode("L3")}
                            className={`px-3 py-1 rounded-lg transition ${
                              chartLevelMode === "L3"
                                ? "bg-amber-600 text-white shadow-sm"
                                : "text-slate-600 hover:text-slate-900"
                            }`}
                          >
                            Xem L3
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => setChartLevelMode("COMBINED")}
                          className={`px-3 py-1 rounded-lg transition ${
                            chartLevelMode === "COMBINED"
                              ? "bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow-sm"
                              : "text-slate-600 hover:text-slate-900"
                          }`}
                        >
                          Xem Phối Hợp
                        </button>
                      </div>
                    </div>
                  );
                })()}
              </div>

              <div className="flex flex-wrap items-center gap-2.5 pt-1">
                <span className="text-xs font-extrabold text-slate-500 uppercase mr-1">
                  3. Xét nghiệm:
                </span>
                {configs
                  .filter(
                    (c) =>
                      c.test_type !== "QUALITATIVE" &&
                      c.section === chartSection &&
                      (chartIsoOnlyFilter
                        ? c.standard_label === "ISO"
                        : c.machine_name === chartMachine)
                  )
                  .sort((a, b) => a.order - b.order)
                  .map((c) => {
                    const last1 = c.history_L1[c.history_L1.length - 1];
                    const last2 = c.history_L2[c.history_L2.length - 1];
                    const last3 = c.history_L3?.[c.history_L3.length - 1];
                    const st =
                      last1?.status === "FAIL" ||
                      last2?.status === "FAIL" ||
                      last3?.status === "FAIL"
                        ? "FAIL"
                        : last1?.status === "WARN" ||
                          last2?.status === "WARN" ||
                          last3?.status === "WARN"
                        ? "WARN"
                        : "PASS";
                    const isSelected = chartTestId === c.test_id;
                    const effectClass =
                      st === "FAIL"
                        ? "police-flash"
                        : st === "WARN"
                        ? "matte-warn"
                        : "crystal-pass";
                    return (
                      <button
                        key={c.test_id}
                        onClick={() => {
                          setChartTestId(c.test_id);
                          setChartMachine(c.machine_name);
                          setSelectedPointInfo(null);
                          if (chartLevelMode === "L3" && c.levels_count < 3) {
                            setChartLevelMode("COMBINED");
                          }
                          if (chartLevelMode === "L2" && c.levels_count < 2) {
                            setChartLevelMode("L1");
                          }
                        }}
                        className={`px-3.5 py-2 rounded-xl text-xs font-black border-2 transition-all ${effectClass} ${
                          isSelected
                            ? "ring-4 ring-blue-400/60 scale-105"
                            : "opacity-90 hover:opacity-100"
                        }`}
                      >
                        {c.test_name}{" "}
                        {c.standard_label === "ISO" ? "· ISO" : ""}
                      </button>
                    );
                  })}
              </div>

              {/* THANH LỌC THỜI GIAN / SỐ LÔ / ĐỐI CHIẾU MEAN HÃNG / ẨN LỖI */}
              {(() => {
                const numericConfigs = configs.filter(
                  (c) => c.test_type !== "QUALITATIVE"
                );
                const activeTestForFilter =
                  numericConfigs.find((c) => c.test_id === chartTestId) ||
                  numericConfigs[0];
                if (!activeTestForFilter) return null;

                const availableLots = Array.from(
                  new Set([
                    activeTestForFilter.lot_number,
                    activeTestForFilter.lot_number_L1 || "",
                    activeTestForFilter.lot_number_L2 || "",
                    activeTestForFilter.lot_number_L3 || "",
                    ...(activeTestForFilter.lot_history || []).map(
                      (lh) => lh.lot_number
                    ),
                    ...(activeTestForFilter.history_L1 || []).map(
                      (p) => p.lot_number
                    ),
                    ...(activeTestForFilter.history_L2 || []).map(
                      (p) => p.lot_number
                    ),
                    ...(activeTestForFilter.history_L3 || []).map(
                      (p) => p.lot_number
                    ),
                  ])
                ).filter(Boolean);

                return (
                  <div className="pt-2 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2.5 text-xs">
                    <div className="flex flex-wrap items-center gap-2.5">
                      <select
                        value={chartFilterMode}
                        onChange={(e) =>
                          setChartFilterMode(
                            e.target.value as "DATE_RANGE" | "BY_LOT"
                          )
                        }
                        className="bg-slate-100 border border-slate-300 rounded-xl px-2.5 py-1.5 font-extrabold text-slate-800"
                      >
                        <option value="DATE_RANGE">Lọc theo Khoảng ngày</option>
                        <option value="BY_LOT">Lọc theo Số Lô (Lot)</option>
                      </select>

                      {chartFilterMode === "BY_LOT" && (
                        <select
                          value={chartLotFilter}
                          onChange={(e) => setChartLotFilter(e.target.value)}
                          className="bg-indigo-50 border border-indigo-200 rounded-xl px-3 py-1.5 font-mono font-black text-indigo-900"
                        >
                          <option value="ALL">Tất cả các Lô</option>
                          {availableLots.map((lot) => (
                            <option key={lot} value={lot}>
                              Lô: {lot}
                            </option>
                          ))}
                        </select>
                      )}

                      <div className="flex items-center gap-1.5">
                        <span className="font-bold text-slate-600">Từ:</span>
                        <input
                          type="date"
                          value={chartFromDate}
                          onChange={(e) => setChartFromDate(e.target.value)}
                          className="bg-slate-50 border border-slate-300 rounded-xl px-2.5 py-1 font-mono font-bold"
                        />
                        <span className="font-bold text-slate-600">Đến:</span>
                        <input
                          type="date"
                          value={chartToDate}
                          onChange={(e) => setChartToDate(e.target.value)}
                          className="bg-slate-50 border border-slate-300 rounded-xl px-2.5 py-1 font-mono font-bold"
                        />
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2.5">
                      <label className="inline-flex items-center gap-1.5 bg-amber-50 border border-amber-300 text-amber-950 px-3 py-1.5 rounded-xl font-extrabold cursor-pointer">
                        <input
                          type="checkbox"
                          checked={compareOldLot}
                          onChange={(e) => setCompareOldLot(e.target.checked)}
                          className="accent-amber-600 w-3.5 h-3.5"
                        />
                        <span>Hiện đường tham chiếu Mean Hãng L1</span>
                      </label>

                      <label className="inline-flex items-center gap-1.5 bg-emerald-50 border border-emerald-300 text-emerald-950 px-3 py-1.5 rounded-xl font-extrabold cursor-pointer">
                        <input
                          type="checkbox"
                          checked={hideFailsOnChart}
                          onChange={(e) =>
                            setHideFailsOnChart(e.target.checked)
                          }
                          className="accent-emerald-600 w-3.5 h-3.5"
                        />
                        <span>Ẩn điểm Vi phạm (Chỉ xem điểm Đạt & KT lại)</span>
                      </label>
                    </div>
                  </div>
                );
              })()}
            </div>

            {(() => {
              const numericConfigs = configs.filter(
                (c) => c.test_type !== "QUALITATIVE"
              );
              const rawSelectedTest =
                numericConfigs.find((c) => c.test_id === chartTestId) ||
                numericConfigs[0];
              if (!rawSelectedTest) return null;

              const archKey = `${
                rawSelectedTest.test_id
              }__${chartFromDate.slice(0, 7)}__${chartToDate.slice(0, 7)}`;
              const archObj = chartArchivedMap[archKey];
              const selectedChartTest: TestConfig = archObj
                ? {
                    ...rawSelectedTest,
                    history_L1: mergeArchivedAndActivePoints(
                      archObj.L1,
                      rawSelectedTest.history_L1
                    ),
                    history_L2: mergeArchivedAndActivePoints(
                      archObj.L2,
                      rawSelectedTest.history_L2
                    ),
                    history_L3: mergeArchivedAndActivePoints(
                      archObj.L3,
                      rawSelectedTest.history_L3
                    ),
                  }
                : rawSelectedTest;

              const isLabRange =
                selectedChartTest.range_source !== "MANUFACTURER";
              const statL1 = computeMuAndSigma(selectedChartTest, "L1");
              const statL2 =
                selectedChartTest.levels_count >= 2
                  ? computeMuAndSigma(selectedChartTest, "L2")
                  : null;
              const statL3 =
                selectedChartTest.levels_count === 3
                  ? computeMuAndSigma(selectedChartTest, "L3")
                  : null;

              return (
                <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-md space-y-4">
                  <div className="flex items-center justify-between gap-2.5 flex-wrap">
                    <div className="flex items-center gap-2.5 flex-wrap">
                      <h2 className="text-lg font-black text-slate-900">
                        Biểu Đồ Levey-Jennings — {selectedChartTest.test_name} (
                        {selectedChartTest.machine_name})
                      </h2>
                      {selectedChartTest.standard_label === "ISO" && (
                        <span className="rounded-full px-2.5 py-0.5 text-[10px] font-black uppercase whitespace-nowrap bg-blue-600 text-white inline-flex items-center justify-center tracking-wider shadow-sm">
                          ISO 15189
                        </span>
                      )}
                      <span
                        className={`px-3 py-1 rounded-xl text-xs font-black ${
                          isLabRange ? "neon-purple-range" : "neon-lime-range"
                        }`}
                      >
                        {isLabRange
                          ? `● Range Phòng (${selectedChartTest.range_active_days} ngày)`
                          : "● Range Hãng"}
                      </span>
                      <span className="text-xs font-mono font-bold text-slate-600 bg-slate-100 px-2.5 py-1 rounded-xl border border-slate-200">
                        Lô: {selectedChartTest.lot_number} (HSD:{" "}
                        {formatDateVN(selectedChartTest.expiry_date)})
                      </span>
                    </div>

                    <div className="text-xs font-bold text-indigo-700 bg-indigo-50 px-3 py-1 rounded-xl border border-indigo-200">
                      💡 Nhấp trực tiếp vào bất kỳ điểm nào trên biểu đồ để xem
                      chi tiết / hiệu chỉnh (Audit Trail)
                    </div>
                  </div>

                  {/* THANH THỐNG KÊ NHANH MEAN ± SD, CV%, SIGMA CỦA TỪNG MỨC */}
                  <div
                    className={`grid grid-cols-1 ${
                      selectedChartTest.levels_count === 3
                        ? "md:grid-cols-3"
                        : selectedChartTest.levels_count === 2
                        ? "md:grid-cols-2"
                        : "md:grid-cols-1"
                    } gap-3 text-xs`}
                  >
                    <div className="bg-sky-50/70 border border-sky-200 rounded-2xl p-3 flex items-center justify-between">
                      <div>
                        <span className="font-black text-sky-900 uppercase">
                          Mức 1 (L1)
                        </span>
                        <div className="font-mono font-bold text-slate-700 mt-0.5">
                          Đích: <b>{selectedChartTest.mean_L1}</b> ±{" "}
                          {selectedChartTest.sd_L1} {selectedChartTest.unit}
                        </div>
                      </div>
                      <div className="text-right font-mono">
                        <div className="font-black text-emerald-700">
                          CV: {statL1.cvPct}% · N={statL1.validPointsCount}
                        </div>
                        <div className="text-[11px] font-bold text-indigo-800">
                          Sigma:{" "}
                          {statL1.sigma !== null
                            ? `${statL1.sigma.toFixed(2)}σ`
                            : "N/A"}
                        </div>
                      </div>
                    </div>

                    {selectedChartTest.levels_count >= 2 && statL2 && (
                      <div className="bg-purple-50/70 border border-purple-200 rounded-2xl p-3 flex items-center justify-between">
                        <div>
                          <span className="font-black text-purple-900 uppercase">
                            Mức 2 (L2)
                          </span>
                          <div className="font-mono font-bold text-slate-700 mt-0.5">
                            Đích: <b>{selectedChartTest.mean_L2}</b> ±{" "}
                            {selectedChartTest.sd_L2} {selectedChartTest.unit}
                          </div>
                        </div>
                        <div className="text-right font-mono">
                          <div className="font-black text-emerald-700">
                            CV: {statL2.cvPct}% · N={statL2.validPointsCount}
                          </div>
                          <div className="text-[11px] font-bold text-indigo-800">
                            Sigma:{" "}
                            {statL2.sigma !== null
                              ? `${statL2.sigma.toFixed(2)}σ`
                              : "N/A"}
                          </div>
                        </div>
                      </div>
                    )}

                    {selectedChartTest.levels_count === 3 && statL3 && (
                      <div className="bg-amber-50/70 border border-amber-200 rounded-2xl p-3 flex items-center justify-between">
                        <div>
                          <span className="font-black text-amber-900 uppercase">
                            Mức 3 (L3)
                          </span>
                          <div className="font-mono font-bold text-slate-700 mt-0.5">
                            Đích: <b>{selectedChartTest.mean_L3}</b> ±{" "}
                            {selectedChartTest.sd_L3} {selectedChartTest.unit}
                          </div>
                        </div>
                        <div className="text-right font-mono">
                          <div className="font-black text-emerald-700">
                            CV: {statL3.cvPct}% · N={statL3.validPointsCount}
                          </div>
                          <div className="text-[11px] font-bold text-indigo-800">
                            Sigma:{" "}
                            {statL3.sigma !== null
                              ? `${statL3.sigma.toFixed(2)}σ`
                              : "N/A"}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  <Luminous3DLJChart
                    test={selectedChartTest}
                    showL1={
                      chartLevelMode === "COMBINED" || chartLevelMode === "L1"
                    }
                    showL2={
                      (chartLevelMode === "COMBINED" ||
                        chartLevelMode === "L2") &&
                      selectedChartTest.levels_count >= 2
                    }
                    showL3={
                      (chartLevelMode === "COMBINED" ||
                        chartLevelMode === "L3") &&
                      selectedChartTest.levels_count === 3
                    }
                    compareOldLot={compareOldLot}
                    hideResolvedFails={hideFailsOnChart}
                    filterMode={chartFilterMode}
                    lotFilter={chartLotFilter}
                    fromDate={chartFromDate}
                    toDate={chartToDate}
                    reagents={reagents}
                    onSelectPoint={(levelKey, levelLabel, point) =>
                      setSelectedPointInfo({
                        levelKey,
                        levelLabel,
                        point,
                        testId: selectedChartTest.test_id,
                        testName: selectedChartTest.test_name,
                        unit: selectedChartTest.unit,
                        editValDraft: String(point.val),
                        editNoteDraft: "",
                      })
                    }
                  />
                </div>
              );
            })()}
          </div>
        )}

        {/* ================================================================= */}
        {/* 4. TAB DANH MỤC & VẬT TƯ                                          */}
        {/* ================================================================= */}
        {activeTab === "CATALOG_SETUP" && canAccessCatalog && (
          <QuanLyDanhMuc
            apiUrl={apiUrl}
            authToken={authToken}
            currentUser={currentUser}
            users={users}
            sections={sections}
            labMachines={labMachines}
            configs={configs}
            setConfigs={setConfigs}
            reagents={reagents}
            setReagents={setReagents}
            onNavigateToAssistant={(testId) => {
              const t = configs.find((c) => c.test_id === testId);
              jumpToAssistantWithFilter({
                section: t?.section || sections[0],
                machine: t?.machine_name,
                test_id: testId,
                viewMode: "RANGE",
              });
            }}
          />
        )}

        {/* ================================================================= */}
        {/* 5. TAB TRỢ LÝ RANGE & MU                                          */}
        {/* ================================================================= */}
        {activeTab === "ASSISTANT_ISO" && canAccessAssistant && (
          <TroLyRangeMU
            apiUrl={apiUrl}
            authToken={authToken}
            currentUser={currentUser}
            configs={configs}
            setConfigs={setConfigs}
            sections={sections}
            labMachines={labMachines}
          />
        )}

        {/* ================================================================= */}
        {/* 6. TAB HỒ SƠ & IN ẤN ISO 15189 (L-J, BM.01, BM.09, BM.16)          */}
        {/* ================================================================= */}
        {activeTab === "ISO_REPORTS" && (
          <HoSoInAnISO
            apiUrl={apiUrl}
            authToken={authToken}
            currentUser={currentUser}
            runDate={runDate}
            labMachines={labMachines}
            configs={configs}
            setConfigs={setConfigs}
            bm09Logs={bm09Logs}
            setBm09Logs={setBm09Logs}
            reagents={reagents}
          />
        )}

        {/* ================================================================= */}
        {/* 7. TAB QUẢN LÝ ADMIN                                              */}
        {/* ================================================================= */}
        {activeTab === "ACCOUNTS" && canAccessAdminPanel && (
          <QuanTriHeThong
            apiUrl={apiUrl}
            setApiUrl={setApiUrl}
            authToken={authToken}
            users={users}
            setUsers={setUsers}
            sections={sections}
            setSections={setSections}
            labMachines={labMachines}
            setLabMachines={setLabMachines}
            syncFromCloud={syncFromCloud}
            configs={configs}
            setConfigs={setConfigs}
            reagents={reagents}
            setReagents={setReagents}
            bm09Logs={bm09Logs}
            setBm09Logs={setBm09Logs}
            currentUser={currentUser}
          />
        )}
      </main>

      {/* =================================================================== */}
      {/* MODAL CHI TIẾT ĐIỂM L-J & CHỈNH SỬA / XÓA CÓ AUDIT TRAIL ISO 15189  */}
      {/* =================================================================== */}
      {selectedPointInfo &&
        (() => {
          const targetCfg = configs.find(
            (c) => c.test_id === selectedPointInfo.testId
          );
          const meanRef =
            selectedPointInfo.levelKey === "L1"
              ? targetCfg?.mean_L1 || 0
              : selectedPointInfo.levelKey === "L2"
              ? targetCfg?.mean_L2 || 0
              : targetCfg?.mean_L3 || 0;
          const sdRef =
            selectedPointInfo.levelKey === "L1"
              ? targetCfg?.sd_L1 || 0
              : selectedPointInfo.levelKey === "L2"
              ? targetCfg?.sd_L2 || 0
              : targetCfg?.sd_L3 || 0;

          const draftNum = parseFloat(
            selectedPointInfo.editValDraft.trim().replace(/,/g, ".")
          );
          const draftZ =
            !isNaN(draftNum) && sdRef > 0
              ? (draftNum - meanRef) / sdRef
              : selectedPointInfo.point.z;
          const badge = formatSDPositionBadge(draftZ);
          const canVoidPoint = hasPermission(currentUser, "VOID_LJ_POINT");

          return (
            <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
              <div className="bg-white border-2 border-indigo-300 rounded-3xl w-full max-w-lg p-6 shadow-2xl space-y-4">
                <div className="flex items-start justify-between border-b border-slate-100 pb-3">
                  <div>
                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase bg-indigo-600 text-white">
                      Chi tiết điểm QC & Audit Trail (ISO 15189)
                    </span>
                    <h3 className="text-base font-black text-slate-900 mt-1">
                      {selectedPointInfo.testName} —{" "}
                      {selectedPointInfo.levelLabel}
                    </h3>
                    <div className="text-xs font-semibold text-slate-500">
                      Ngày:{" "}
                      <b>{formatDateVN(selectedPointInfo.point.isoDate)}</b> ·
                      Giờ: {selectedPointInfo.point.time || "—"} · Lô:{" "}
                      <span className="font-mono font-bold text-blue-700">
                        {selectedPointInfo.point.lot_number}
                      </span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSelectedPointInfo(null)}
                    className="px-2.5 py-1 rounded-xl bg-slate-100 hover:bg-slate-200 font-bold text-slate-600 text-xs"
                  >
                    ✕ Đóng
                  </button>
                </div>

                <div className="bg-slate-50 border border-slate-200 rounded-2xl p-3.5 text-xs space-y-1.5">
                  <div className="flex justify-between">
                    <span className="text-slate-500 font-bold">
                      Người thực hiện:
                    </span>
                    <b className="text-slate-900">
                      {selectedPointInfo.point.operator}
                    </b>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500 font-bold">
                      Kết quả hiện tại:
                    </span>
                    <b className="font-mono text-blue-800">
                      {selectedPointInfo.point.val} {selectedPointInfo.unit} (
                      {selectedPointInfo.point.z >= 0 ? "+" : ""}
                      {selectedPointInfo.point.z}SD)
                    </b>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500 font-bold">
                      Đánh giá quy tắc:
                    </span>
                    <b className="text-slate-800">
                      {selectedPointInfo.point.rule}
                    </b>
                  </div>
                </div>

                {/* LỊCH SỬ CHỈNH SỬA AUDIT TRAIL NẾU CÓ */}
                {selectedPointInfo.point.edit_log &&
                  selectedPointInfo.point.edit_log.length > 0 && (
                    <div className="bg-indigo-50/70 border border-indigo-200 rounded-2xl p-3 text-xs space-y-1">
                      <div className="font-black text-indigo-950 uppercase text-[10.5px]">
                        🖋️ Lịch sử chỉnh sửa (Audit Trail):
                      </div>
                      {selectedPointInfo.point.edit_log.map((el, idx) => (
                        <div
                          key={idx}
                          className="text-[11px] font-mono text-indigo-900 border-t border-indigo-100 pt-1"
                        >
                          [{el.edited_at}] <b>{el.edited_by}</b>: {el.old_val} ➔{" "}
                          <b>{el.new_val}</b> {el.note ? `(${el.note})` : ""}
                        </div>
                      ))}
                    </div>
                  )}

                {/* FORM HIỆU CHỈNH KẾT QUẢ */}
                <div className="space-y-2.5 text-xs pt-1">
                  <div className="flex items-center justify-between">
                    <label className="font-black text-slate-700">
                      Hiệu chỉnh giá trị đo ({selectedPointInfo.unit}):
                    </label>
                    <span className="font-mono text-[11px] font-bold text-slate-500">
                      Đích: {meanRef} ± {sdRef}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      inputMode="decimal"
                      value={selectedPointInfo.editValDraft}
                      onChange={(e) =>
                        setSelectedPointInfo({
                          ...selectedPointInfo,
                          editValDraft: e.target.value.replace(/,/g, "."),
                        })
                      }
                      className="w-36 border-2 border-indigo-300 focus:border-blue-600 rounded-xl px-3 py-2 font-mono font-black text-sm text-right outline-none"
                    />
                    <span
                      className={`flex-1 px-3 py-2 rounded-xl border font-mono font-black text-center ${badge.cls}`}
                    >
                      {badge.shortRule}
                    </span>
                  </div>
                  <div>
                    <label className="font-bold text-slate-600 block mb-1">
                      Lý do hiệu chỉnh (Ghi vào Audit Trail):
                    </label>
                    <input
                      type="text"
                      value={selectedPointInfo.editNoteDraft}
                      onChange={(e) =>
                        setSelectedPointInfo({
                          ...selectedPointInfo,
                          editNoteDraft: e.target.value,
                        })
                      }
                      placeholder="VD: Nhập nhầm dấu thập phân từ phiếu in..."
                      className="w-full border border-slate-300 rounded-xl px-3 py-2 font-semibold outline-none focus:border-blue-500"
                    />
                  </div>
                </div>

                <div className="flex items-center justify-between pt-3 border-t border-slate-100">
                  {canVoidPoint ? (
                    <button
                      type="button"
                      onClick={handleVoidPointOnLJ}
                      className="px-3.5 py-2 rounded-xl bg-rose-50 hover:bg-rose-600 text-rose-700 hover:text-white border border-rose-200 font-black text-xs transition"
                    >
                      🗑️ Xóa điểm này
                    </button>
                  ) : (
                    <div />
                  )}
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setSelectedPointInfo(null)}
                      className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs"
                    >
                      Hủy
                    </button>
                    <button
                      type="button"
                      onClick={handleSaveEditedPointOnLJ}
                      className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-black text-xs shadow-md transition"
                    >
                      ✓ Lưu Hiệu Chỉnh (Audit)
                    </button>
                  </div>
                </div>
              </div>
            </div>
          );
        })()}

      {/* =================================================================== */}
      {/* MODAL QR ĐỘNG KẾT NỐI NHANH ĐIỆN THOẠI <-> MÁY TÍNH                 */}
      {/* =================================================================== */}
      {showMobileQrModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white border-2 border-amber-300 rounded-3xl w-full max-w-md p-6 shadow-2xl space-y-4 text-center">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="text-left">
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase bg-amber-500 text-white">
                  Liên thông Điện thoại ➔ PC
                </span>
                <h3 className="text-base font-black text-slate-900 mt-1">
                  Quét Mã QR Mở Nhanh Trên Điện Thoại
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowMobileQrModal(false)}
                className="px-3 py-1 rounded-xl bg-slate-100 hover:bg-slate-200 font-bold text-slate-600 text-xs"
              >
                ✕ Đóng
              </button>
            </div>

            <div className="bg-amber-50/70 border border-amber-200 rounded-2xl p-4 flex flex-col items-center justify-center space-y-3">
              <img
                src={`https://api.qrserver.com/v1/create-qr-code/?size=220x220&margin=8&data=${encodeURIComponent(
                  qrShareLink
                )}`}
                alt="QR Code Kết Nối"
                className="w-48 h-48 rounded-2xl border-2 border-white shadow-md bg-white"
              />
              <p className="text-xs text-slate-600 font-medium">
                Dùng Camera hoặc Zalo trên điện thoại quét mã này để mở ứng dụng
                đã gắn sẵn đường dẫn máy chủ Google Sheets của khoa.
              </p>
            </div>

            <div className="text-left space-y-1.5 text-xs">
              <label className="font-bold text-slate-700 block">
                Hoặc sao chép liên kết tự động cấu hình:
              </label>
              <div className="flex gap-2">
                <input
                  readOnly
                  value={qrShareLink}
                  className="flex-1 bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 font-mono text-[11px] text-slate-700 outline-none"
                />
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard?.writeText(qrShareLink);
                    window.alert("Đã sao chép liên kết kết nối nhanh!");
                  }}
                  className="px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-black text-xs shrink-0"
                >
                  Copy
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
