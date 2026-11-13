import React, { useState, useEffect } from "react";

// ============================================================================
// FILE 1: src/KieuDuLieu.ts (V7.1 ENTERPRISE CORE — CHUẨN LABCONNECT & ISO 15189)
// - Đã loại bỏ 100% việc tự suy diễn Bias% khi chưa nhập Ngoại kiểm (Mặc định Bias = 0%
//   đúng chuẩn Phiếu thiết lập giới hạn kiểm soát nội kiểm BM.04.XN.QTQL.31).
// - Tích hợp Danh mục TEa chuẩn CLIA từ Phiếu công bố TEa BM.07.XN.QTQL.31.
// - Chuẩn hóa Bảng lựa chọn luật nội kiểm theo Sigma Score đúng chuẩn BM.08.XN.QTQL.31
//   và tài liệu Quy tắc Westgard 2 mức / 3 mức phối hợp (1-3s, 2-2s, 2/3-2s, R-4s, 3-1s, 4-1s, 10x, 12x).
// - Hỗ trợ lưu trạng thái đơn mức (single_level_status / single_level_rule) tách biệt với
//   trạng thái phối hợp 3 mức trên Biểu đồ Levey-Jennings.
// - Hỗ trợ đầy đủ Đa lọ Hóa chất & Số Lô độc lập từng mức (L1, L2, L3) và
//   đồng bộ 100% công thức MU & Six Sigma giữa mọi Tab và Bản in ISO.
// ✦ An intellectual product by Handsome Long ✦
// ============================================================================

export const DEFAULT_SCRIPT_URL =
  "https://script.google.com/macros/s/AKfycbxcshYUkQZOCXtrPGpTggpWgdZ-ObNiBVax9trrXjbkNa2wexNTrgfs2J7HQysGbbXw/exec";

export const STORAGE_KEYS = Object.freeze({
  API_URL: "ORIO_API_URL_V5",
  AUTH: "ORIO_AUTH_V5",
  TOKEN: "ORIO_TOKEN_V5",
  USERS: "ORIO_USERS_V5",
  SECTIONS: "ORIO_SECTIONS_V5",
  MACHINES: "ORIO_MACHINES_V5",
  REAGENTS: "ORIO_REAGENTS_V5",
  CONFIGS: "ORIO_CONFIGS_V5",
  BM09: "ORIO_BM09_V5",
  LOCKS: "ORIO_LOCKS_V5",
  INPUT_MODE: "ORIO_INPUT_MODE_V5",
  KIOSK_DRAFT: "ORIO_KIOSK_DRAFT_V5",
  SYNC_QUEUE: "ORIO_PENDING_SYNC_QUEUE_V5",
});

export type ReportSubTab =
  | "LJ_PRINT"
  | "BM01_RANGE"
  | "BM09_LOG"
  | "BM16_REAGENT";

/**
 * Lưu trữ bền vững vào localStorage kèm cơ chế Sliding Window chống tràn 5MB
 * khi vận hành 20+ thiết bị x 25+ xét nghiệm trong nhiều năm.
 */
export function usePersistentState<T>(
  key: string,
  initialValue: T
): [T, React.Dispatch<React.SetStateAction<T>>] {
  const [state, setState] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return initialValue;
      return JSON.parse(raw) as T;
    } catch {
      return initialValue;
    }
  });

  useEffect(() => {
    try {
      if (key === STORAGE_KEYS.CONFIGS && Array.isArray(state)) {
        const windowedConfigs = (state as any[]).map((c) => ({
          ...c,
          lot_history: Array.isArray(c.lot_history)
            ? c.lot_history.slice(0, 12)
            : [],
          history_L1: Array.isArray(c.history_L1)
            ? c.history_L1.slice(-90)
            : [],
          history_L2: Array.isArray(c.history_L2)
            ? c.history_L2.slice(-90)
            : [],
          history_L3: Array.isArray(c.history_L3)
            ? c.history_L3.slice(-90)
            : [],
        }));
        localStorage.setItem(key, JSON.stringify(windowedConfigs));
        return;
      }
      if (key === STORAGE_KEYS.BM09 && Array.isArray(state)) {
        localStorage.setItem(key, JSON.stringify(state.slice(0, 800)));
        return;
      }
      localStorage.setItem(key, JSON.stringify(state));
    } catch {
      try {
        if (key === STORAGE_KEYS.BM09 && Array.isArray(state)) {
          localStorage.setItem(key, JSON.stringify(state.slice(0, 400)));
        } else if (key === STORAGE_KEYS.CONFIGS && Array.isArray(state)) {
          const trimmed = (state as any[]).map((c) => ({
            ...c,
            lot_history: Array.isArray(c.lot_history)
              ? c.lot_history.slice(0, 6)
              : [],
            history_L1: Array.isArray(c.history_L1)
              ? c.history_L1.slice(-45)
              : [],
            history_L2: Array.isArray(c.history_L2)
              ? c.history_L2.slice(-45)
              : [],
            history_L3: Array.isArray(c.history_L3)
              ? c.history_L3.slice(-45)
              : [],
          }));
          localStorage.setItem(key, JSON.stringify(trimmed));
        }
      } catch {}
    }
  }, [key, state]);

  return [state, setState];
}

/**
 * Gọi RPC xuống Google Apps Script (Tối ưu gói tin, không nhân đôi dữ liệu)
 */
export async function rpcCall(
  apiUrl: string,
  action: string,
  data: Record<string, any> = {},
  token?: string,
  timeoutMs = 20000
): Promise<{ net: boolean; body: Record<string, any> }> {
  const url = String(apiUrl || "").trim();
  if (!url.startsWith("https://script.google.com/macros/s/")) {
    return {
      net: false,
      body: { status: "error", message: "URL máy chủ không hợp lệ" },
    };
  }
  const ctrl = new AbortController();
  const timer = window.setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ action, token, data }),
      signal: ctrl.signal,
      redirect: "follow",
    });
    window.clearTimeout(timer);
    const text = await res.text();
    return { net: true, body: JSON.parse(text) };
  } catch (err: any) {
    window.clearTimeout(timer);
    return {
      net: false,
      body: { status: "error", message: String(err?.message || "Lỗi mạng") },
    };
  }
}

// ============================================================================
// HÀM TIỆN ÍCH THỜI GIAN CHUẨN MÚI GIỜ VIỆT NAM UTC+7 & LÀM TRÒN THÍCH ỨNG
// ============================================================================
export function getVnIsoDateString(): string {
  const d = new Date();
  const vnMs = d.getTime() + 7 * 3600 * 1000;
  return new Date(vnMs).toISOString().slice(0, 10);
}

export function getVnFirstDayOfMonthString(): string {
  return `${getVnIsoDateString().slice(0, 8)}01`;
}

export function getVnTimeString(): string {
  const d = new Date();
  const vnMs = d.getTime() + 7 * 3600 * 1000;
  const iso = new Date(vnMs).toISOString();
  return `${iso.slice(11, 13)}h${iso.slice(14, 16)}`;
}

export function addDaysToIsoDate(
  isoDateStr: string,
  daysToAdd: number
): string {
  try {
    const [y, m, d] = isoDateStr.split("-").map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d + daysToAdd));
    return dt.toISOString().slice(0, 10);
  } catch {
    return isoDateStr;
  }
}

export function roundSmartDecimal(val: number, refSd?: number): number {
  if (val === null || val === undefined || isNaN(Number(val))) return 0;
  const num = Number(val);
  const sd = Math.abs(Number(refSd || 0));
  if (sd > 0 && sd < 0.01) return Number(num.toFixed(4));
  if (sd > 0 && sd < 0.1) return Number(num.toFixed(3));
  return Number(num.toFixed(2));
}

export function formatSmartDecimal(val: number, refSd?: number): string {
  if (val === null || val === undefined || isNaN(Number(val))) return "0";
  const num = Number(val);
  const sd = Math.abs(Number(refSd || 0));
  if (sd > 0 && sd < 0.01) return num.toFixed(4).replace(/\.?0+$/, "");
  if (sd > 0 && sd < 0.1) return num.toFixed(3);
  return num.toFixed(2);
}

// ============================================================================
// DANH MỤC GỢI Ý XÉT NGHIỆM & BẢNG TRA CỨU TEa CHUẨN CLIA (BM.07.XN.QTQL.31)
// ============================================================================
export const CLIA_TEA_REFERENCE_MAP: Record<string, number> = {
  GLUCOSE: 10,
  UREA: 9,
  URE: 9,
  CREATININE: 15,
  CREATININ: 15,
  AST: 20,
  "AST (GOT)": 20,
  "AST (SGOT)": 20,
  ALT: 20,
  "ALT (GPT)": 20,
  "ALT (SGPT)": 20,
  "URIC ACID": 17,
  "ACID URIC": 17,
  ALBUMIN: 10,
  CHOLESTEROL: 10,
  "BILIRUBIN TOÀN PHẦN": 20,
  "BILIRUBIN TOTAL": 20,
  "BILIRUBIN TP": 20,
  "BILIRUBIN TRỰC TIẾP": 20,
  "BILIRUBIN DIRECT": 20,
  "BILIRUBIN TT": 20,
  WBC: 15,
  RBC: 6,
  HGB: 7,
  HCT: 6,
  PLT: 25,
  TRIGLYCERIDE: 25,
  AMYLASE: 30,
  GGT: 17,
  "HDL-CHOLESTEROL": 30,
  "HDL-C": 30,
  "LDL-CHOLESTEROL": 12,
  "LDL-C": 12,
  LDH: 20,
  CRP: 25,
  "CRP ĐỊNH LƯỢNG": 25,
  IRON: 20,
  "PROTEIN TOÀN PHẦN": 10,
  "PROTEIN TP": 10,
  "CK-MB": 30,
};

export function getSuggestedCliaTea(testName: string): number | undefined {
  const clean = String(testName || "")
    .trim()
    .toUpperCase();
  if (!clean) return undefined;
  if (CLIA_TEA_REFERENCE_MAP[clean] !== undefined) {
    return CLIA_TEA_REFERENCE_MAP[clean];
  }
  for (const [k, v] of Object.entries(CLIA_TEA_REFERENCE_MAP)) {
    if (clean.startsWith(`${k} `) || clean.indexOf(`(${k})`) !== -1) {
      return v;
    }
  }
  return undefined;
}

export const COMMON_TEST_NAMES = [
  "Glucose",
  "Urea",
  "Creatinine",
  "AST (GOT)",
  "ALT (GPT)",
  "GGT",
  "Bilirubin Toàn phần",
  "Bilirubin Trực tiếp",
  "Albumin",
  "Protein Toàn phần",
  "Cholesterol",
  "Triglyceride",
  "HDL-Cholesterol",
  "LDL-Cholesterol",
  "Uric Acid",
  "Amylase",
  "Lipase",
  "CK-MB",
  "CRP định lượng",
  "WBC",
  "RBC",
  "HGB",
  "HCT",
  "PLT",
  "MCV",
  "MCH",
  "MCHC",
  "RDW-CV",
  "NEU%",
  "LYM%",
  "MONO%",
  "EOS%",
  "BASO%",
  "Đông máu PT (s)",
  "Đông máu PT (%)",
  "Đông máu INR",
  "Đông máu APTT (s)",
  "Đông máu rAPTT",
  "Fibrinogen",
  "D-Dimer",
  "Na+",
  "K+",
  "Cl-",
  "Ca2+ (Ion hóa)",
  "Ca Toàn phần",
  "Mg2+",
  "pH (Khí máu)",
  "pCO2",
  "pO2",
  "HCO3- (cHCO3)",
  "BE (Base Excess)",
  "SO2%",
  "Lactate",
  "tHb (Khí máu)",
  "Tỷ trọng (SG - Nước tiểu)",
  "pH (Nước tiểu)",
  "Bạch cầu (LEU - Nước tiểu)",
  "Hồng cầu (BLD/ERY - Nước tiểu)",
  "Nitrit (NIT - Nước tiểu)",
  "Protein (PRO - Nước tiểu)",
  "Glucose (GLU - Nước tiểu)",
  "Ketone (KET - Nước tiểu)",
  "Urobilinogen (URO - Nước tiểu)",
  "Bilirubin (BIL - Nước tiểu)",
  "Ascorbic Acid (VTC - Nước tiểu)",
];

export const COMMON_UNITS = [
  "mmol/L",
  "µmol/L",
  "U/L",
  "g/L",
  "g/dL",
  "mg/L",
  "mg/dL",
  "mEq/L",
  "10^9/L",
  "10^12/L",
  "10^3/uL",
  "10^6/uL",
  "%",
  "fL",
  "pg",
  "L/L",
  "Giây",
  "INR",
  "Ratio",
  "mmHg",
  "kPa",
  "mIU/mL",
  "IU/mL",
  "ng/mL",
  "µg/mL",
  "pg/mL",
  "nmol/L",
  "pmol/L",
  "S/Co",
  "COI",
  "Index",
  "Không đơn vị",
];

export const QUALITATIVE_OPTIONS = [
  "ÂM TÍNH",
  "DƯƠNG TÍNH",
  "BÌNH THƯỜNG",
  "VẾT (±)",
  "DƯƠNG TÍNH 1+ (+)",
  "DƯƠNG TÍNH 2+ (++)",
  "DƯƠNG TÍNH 3+ (+++)",
  "DƯƠNG TÍNH 4+ (++++)",
] as const;

export type QualitativeOptionType = string;

export const SUGGESTED_CAUSES = [
  "Bọt khí trong cóng mẫu/kim hút",
  "Hóa chất QC tự pha suy giảm hoạt độ",
  "Thuốc thử cuối lọ bị bay hơi",
  "Trôi đường chuẩn (Calibration drift)",
  "Kim hút mẫu/thuốc thử bám cặn fibrin",
  "Nhiệt độ buồng ủ/phòng máy dao động",
];

export const SUGGESTED_ACTIONS = [
  "Kiểm tra kim hút, đuổi bọt khí",
  "Hiệu chuẩn (Calib) lại xét nghiệm",
  "Thay lọ thuốc thử mới",
  "Hoàn nguyên lọ Hóa chất QC mới",
  "Rửa kim hút (Probe Wash) & chạy lại QC",
];

export type UserRole = "ADMIN" | "QLCM" | "USER";
export type PermissionKey =
  | "VOID_LJ_POINT"
  | "OVERRIDE_RESOLUTION"
  | "EDIT_PAST_DATE"
  | "FORCE_UNLOCK_LAB"
  | "MANAGE_CATALOG"
  | "APPROVE_RANGE_MU"
  | "SIGN_BM09_CHECKER"
  | "MANAGE_ACCOUNTS";

export interface PermissionDef {
  key: PermissionKey;
  label: string;
  desc: string;
  badgeColor: string;
}
export const ALL_PERMISSIONS: PermissionDef[] = [
  {
    key: "VOID_LJ_POINT",
    label: "Xóa điểm QC trên biểu đồ L-J",
    desc: "Xóa điểm L-J bị nhập nhầm",
    badgeColor: "rose",
  },
  {
    key: "OVERRIDE_RESOLUTION",
    label: "Sửa trạng thái xử lý sự cố",
    desc: "Can thiệp Đạt/KĐ nhật ký",
    badgeColor: "rose",
  },
  {
    key: "EDIT_PAST_DATE",
    label: "Sửa kết quả QC ngày hôm trước",
    desc: "Lùi ngày nhập KQ cũ",
    badgeColor: "indigo",
  },
  {
    key: "FORCE_UNLOCK_LAB",
    label: "Khóa / Mở khóa ép buộc Lab",
    desc: "Mở khóa phiên Lab bị treo",
    badgeColor: "amber",
  },
  {
    key: "MANAGE_CATALOG",
    label: "Sửa / Xóa Danh mục Test",
    desc: "Khai báo hóa chất, Test",
    badgeColor: "teal",
  },
  {
    key: "APPROVE_RANGE_MU",
    label: "Chốt Dải chuẩn & Thiết lập MU",
    desc: "Chốt Range và ĐKBĐĐ",
    badgeColor: "purple",
  },
  {
    key: "SIGN_BM09_CHECKER",
    label: "Ký kiểm tra phiếu BM.09",
    desc: "Duyệt phiếu BM.09",
    badgeColor: "sky",
  },
  {
    key: "MANAGE_ACCOUNTS",
    label: "Quản trị Nhân sự & Lab",
    desc: "Cấp tài khoản, phân quyền",
    badgeColor: "emerald",
  },
];
export const DEFAULT_ROLE_PERMISSIONS: Record<UserRole, PermissionKey[]> = {
  ADMIN: [
    "VOID_LJ_POINT",
    "OVERRIDE_RESOLUTION",
    "EDIT_PAST_DATE",
    "FORCE_UNLOCK_LAB",
    "MANAGE_CATALOG",
    "APPROVE_RANGE_MU",
    "SIGN_BM09_CHECKER",
    "MANAGE_ACCOUNTS",
  ],
  QLCM: [
    "EDIT_PAST_DATE",
    "FORCE_UNLOCK_LAB",
    "MANAGE_CATALOG",
    "APPROVE_RANGE_MU",
    "SIGN_BM09_CHECKER",
  ],
  USER: [],
};

export interface UserAccount {
  id: string;
  name: string;
  password: string;
  role: UserRole;
  mustChange: boolean;
  permissions?: PermissionKey[];
}

export function getEffectivePermissions(
  user?: UserAccount | null
): PermissionKey[] {
  if (!user) return [];
  if (user.id.toLowerCase() === "thlong") return DEFAULT_ROLE_PERMISSIONS.ADMIN;
  return Array.isArray(user.permissions)
    ? user.permissions
    : DEFAULT_ROLE_PERMISSIONS[user.role] || [];
}
export function hasPermission(
  user: UserAccount | null | undefined,
  perm: PermissionKey
): boolean {
  if (!user) return false;
  if (user.id.toLowerCase() === "thlong") return true;
  return getEffectivePermissions(user).indexOf(perm) !== -1;
}

// --- KIẾN TRÚC DỮ LIỆU & DẤU VẾT KIỂM TOÁN (AUDIT TRAIL ISO 15189) ---
export interface SectionLock {
  section_name: string;
  user_id: string;
  user_name: string;
  user_role: UserRole;
  locked_at_ms: number;
  epoch?: string;
}

export interface ReagentLotBM16 {
  control_id: string;
  section_name: string;
  machine_name: string;
  control_name: string;
  lot_number: string;
  expiry_date: string;
  is_manual_prep: boolean;
  prep_date: string;
  use_expiry_date?: string;
  prep_by_id: string;
  prep_by_name: string;
  quantity_prepared?: number;
  usage_count: number;
  used_days_map: Record<string, number>;
  note?: string;
}

export interface AuditLogEntry {
  edited_at: string;
  edited_by: string;
  old_val: number;
  new_val: number;
  old_z?: number;
  new_z?: number;
  note?: string;
}

export interface HistoryPoint {
  isoDate: string;
  date: string;
  time: string;
  lot_number: string;
  val: number;
  z: number;
  qualVal?: QualitativeOptionType;
  operator: string;
  rule: string;
  status: "PASS" | "WARN" | "FAIL";
  single_level_status?: "PASS" | "WARN" | "FAIL";
  single_level_rule?: string;
  is_rerun?: boolean;
  edit_log?: AuditLogEntry[];
}

export function sortHistoryChronologically(
  arr: HistoryPoint[] | undefined
): HistoryPoint[] {
  if (!Array.isArray(arr)) return [];
  return [...arr].sort((a, b) => {
    const da = String(a.isoDate || "");
    const db = String(b.isoDate || "");
    if (da !== db) return da < db ? -1 : 1;
    const ta = String(a.time || "").replace("h", ":");
    const tb = String(b.time || "").replace("h", ":");
    if (ta !== tb) return ta < tb ? -1 : 1;
    return (a.is_rerun ? 1 : 0) - (b.is_rerun ? 1 : 0);
  });
}

export interface LotArchiveItem {
  lot_number: string;
  expiry_date: string;
  range_source: RangeSourceType;
  mean_L1: number;
  sd_L1: number;
  cv_L1: number;
  n_L1: number;
  mean_L2: number;
  sd_L2: number;
  cv_L2: number;
  n_L2: number;
  mean_L3: number;
  sd_L3: number;
  cv_L3: number;
  n_L3: number;
  archived_at: string;
}

export type RangeSourceType = "MANUFACTURER" | "LAB_TEMP" | "LAB_OFFICIAL";
export type TestCategoryType =
  | "QUANTITATIVE"
  | "SEMI_QUANTITATIVE"
  | "QUALITATIVE";
export type MuModeType =
  | "NONE"
  | "MANUAL"
  | "INITIAL_VERIFICATION"
  | "PERIODIC_IQC";

export interface LevelMuConfig {
  mu_mode: MuModeType;
  manual_mu?: number;
  verif_cvr?: number;
  verif_bias?: number;
  urw_pooled?: number;
  uc_cal?: number;
  ubias_periodic?: number;
}

export interface TestConfig {
  test_id: string;
  section: string;
  machine_name: string;
  control_name: string;
  lot_number: string;
  expiry_date: string;
  control_name_L1?: string;
  lot_number_L1?: string;
  expiry_date_L1?: string;
  control_name_L2?: string;
  lot_number_L2?: string;
  expiry_date_L2?: string;
  control_name_L3?: string;
  lot_number_L3?: string;
  expiry_date_L3?: string;
  test_name: string;
  unit: string;
  standard_label: "ISO" | "THUONG";
  test_type: TestCategoryType;
  levels_count: 1 | 2 | 3;
  tea?: number;
  tea_percent?: number;
  tea_unit?: "PERCENT" | "ABSOLUTE";
  tea_source?: string;
  eqa_bias_percent?: number;
  bias_source_priority?: string;
  mu_audit_log?: any[];
  is_exempt_long_rules?: boolean;
  order: number;
  mean_L1: number;
  sd_L1: number;
  mean_L2: number;
  sd_L2: number;
  mean_L3: number;
  sd_L3: number;
  mfg_mean_L1: number;
  mfg_sd_L1: number;
  mfg_mean_L2: number;
  mfg_sd_L2: number;
  mfg_mean_L3: number;
  mfg_sd_L3: number;
  expected_qual_L1?: QualitativeOptionType;
  expected_qual_L2?: QualitativeOptionType;
  expected_qual_L3?: QualitativeOptionType;
  mu_L1?: LevelMuConfig;
  mu_L2?: LevelMuConfig;
  mu_L3?: LevelMuConfig;
  range_source: RangeSourceType;
  range_applied_date?: string;
  range_active_days: number;
  accumulated_points: number;
  lot_history?: LotArchiveItem[];
  history_L1: HistoryPoint[];
  history_L2: HistoryPoint[];
  history_L3: HistoryPoint[];
}

export interface EvalRow {
  test: TestConfig;
  valL1: number | null;
  qualL1?: string;
  zL1: number | null;
  lvl1Status: "PASS" | "WARN" | "FAIL" | "SKIP";
  lvl1SingleRule?: string;
  valL2: number | null;
  qualL2?: string;
  zL2: number | null;
  lvl2Status: "PASS" | "WARN" | "FAIL" | "SKIP";
  lvl2SingleRule?: string;
  valL3: number | null;
  qualL3?: string;
  zL3: number | null;
  lvl3Status: "PASS" | "WARN" | "FAIL" | "SKIP";
  lvl3SingleRule?: string;
  status: "PASS" | "WARN" | "FAIL" | "SKIP";
  singleLevelRules: string[];
  crossLevelRules: string[];
  advisoryNotes?: string[];
  appliedRuleSetLabel?: string;
  errorType: string;
  suggestion: string;
  cause: string;
  actionTaken: string;
  postFixResult: string;
}

export interface BM09LogEntry {
  run_id: string;
  test_id: string;
  run_date: string;
  run_time: string;
  section: string;
  machine_name: string;
  control_name: string;
  lot_number: string;
  test_name: string;
  westgard_mode: "NORMAL" | "SIGMA";
  val_L1: number | null;
  z_L1: number | null;
  val_L2: number | null;
  z_L2: number | null;
  val_L3?: number | null;
  z_L3?: number | null;
  qual_L1?: string;
  qual_L2?: string;
  qual_L3?: string;
  lvl1_status?: "PASS" | "WARN" | "FAIL";
  lvl2_status?: "PASS" | "WARN" | "FAIL";
  lvl3_status?: "PASS" | "WARN" | "FAIL";
  status: "PASS" | "WARN" | "FAIL";
  rules_single: string;
  rules_cross: string;
  cause: string;
  action_taken: string;
  post_fix_result: string;
  operator_name: string;
  checker_name: string;
  resolved: boolean;
  rerun_val?: number;
  rerun_level?: string;
  edit_log?: AuditLogEntry[];
}

export function formatDateVN(dateStr?: string): string {
  if (!dateStr) return "";
  const s = String(dateStr).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const [y, m, d] = s.split("-");
    return `${d}/${m}/${y}`;
  }
  return s;
}
export function formatShortDM(dateStr?: string): string {
  if (!dateStr) return "";
  const s = String(dateStr).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const [, m, d] = s.split("-");
    return `${Number(d)}/${Number(m)}`;
  }
  return s;
}
export function getReagentThreshold75(qtyPrepared?: number): number {
  const q = Math.max(1, Number(qtyPrepared) || 1);
  return Math.ceil(q * 0.75);
}
export function isReagentReached75(r: ReagentLotBM16): boolean {
  if (!r.is_manual_prep || !r.quantity_prepared) return false;
  return Number(r.usage_count) >= getReagentThreshold75(r.quantity_prepared);
}
export function getUsageCountForMonthDay(
  usedMap: Record<string, number> | undefined,
  yearMonth: string,
  dayNum: number
): number {
  if (!usedMap) return 0;
  const dd = String(dayNum).padStart(2, "0");
  const fullKey = `${yearMonth}-${dd}`;
  return Number(usedMap[fullKey] || usedMap[String(dayNum)] || 0);
}

// ============================================================================
// HÀM TÍNH POOLED CV% (u_rw) THEO TRỌNG SỐ BẬC TỰ DO (CLSI C24-Ed4)
// ============================================================================
export interface LotHistoryItemForPooled {
  lot_number: string;
  cv_pct: number;
  n_count?: number;
}
export function calculateWeightedPooledCv(lots: LotHistoryItemForPooled[]) {
  const validLots = lots.filter((l) => l.cv_pct > 0);
  if (validLots.length === 0) return { pooledCvPct: 0, totalDf: 0, totalN: 0 };
  let sumSq = 0;
  let totalDf = 0;
  let totalN = 0;
  validLots.forEach((l) => {
    const hasExplicitN = l.n_count !== undefined && l.n_count !== null;
    const n = hasExplicitN ? Number(l.n_count) : 30;
    if (n > 1) {
      const df = n - 1;
      sumSq += df * (l.cv_pct * l.cv_pct);
      totalDf += df;
      totalN += n;
    }
  });
  if (totalDf <= 0) return { pooledCvPct: 0, totalDf: 0, totalN: 0 };
  return {
    pooledCvPct: Number(Math.sqrt(sumSq / totalDf).toFixed(2)),
    totalDf,
    totalN,
  };
}

export function computeThreeLotPooledStats(
  cfg: TestConfig,
  levelKey: "L1" | "L2" | "L3",
  currentMeanLab: number,
  currentCvPct: number,
  currentValidN?: number
): {
  pooledCvPct: number;
  proposedSdByCv: number;
  lotsCountUsed: number;
  totalDegreesOfFreedom: number;
} {
  const refSd =
    levelKey === "L1"
      ? cfg.sd_L1 || cfg.mfg_sd_L1
      : levelKey === "L2"
      ? cfg.sd_L2 || cfg.mfg_sd_L2
      : cfg.sd_L3 || cfg.mfg_sd_L3;

  const effectiveLevelLot =
    levelKey === "L1"
      ? cfg.lot_number_L1 || cfg.lot_number
      : levelKey === "L2"
      ? cfg.lot_number_L2 || cfg.lot_number
      : cfg.lot_number_L3 || cfg.lot_number;

  const historyLots = (cfg.lot_history || [])
    .filter((lot) => {
      const lNum = String(lot.lot_number || "")
        .trim()
        .toLowerCase();
      return (
        lNum !==
          String(cfg.lot_number || "")
            .trim()
            .toLowerCase() &&
        lNum !==
          String(effectiveLevelLot || "")
            .trim()
            .toLowerCase()
      );
    })
    .slice(0, 11);
  const itemsForPooled: LotHistoryItemForPooled[] = [];

  historyLots.forEach((lot) => {
    const lvCv =
      levelKey === "L1"
        ? lot.cv_L1 || (lot.mean_L1 > 0 ? (lot.sd_L1 / lot.mean_L1) * 100 : 0)
        : levelKey === "L2"
        ? lot.cv_L2 || (lot.mean_L2 > 0 ? (lot.sd_L2 / lot.mean_L2) * 100 : 0)
        : lot.cv_L3 || (lot.mean_L3 > 0 ? (lot.sd_L3 / lot.mean_L3) * 100 : 0);
    const lvN =
      levelKey === "L1" ? lot.n_L1 : levelKey === "L2" ? lot.n_L2 : lot.n_L3;
    if (lvCv > 0)
      itemsForPooled.push({
        lot_number: lot.lot_number,
        cv_pct: lvCv,
        n_count: lvN !== undefined && lvN !== null ? lvN : 30,
      });
  });

  if (currentCvPct > 0) {
    if (currentValidN !== undefined && currentValidN >= 2) {
      itemsForPooled.push({
        lot_number: effectiveLevelLot,
        cv_pct: currentCvPct,
        n_count: currentValidN,
      });
    } else if (itemsForPooled.length === 0) {
      itemsForPooled.push({
        lot_number: effectiveLevelLot,
        cv_pct: currentCvPct,
        n_count: 30,
      });
    }
  }

  const weighted = calculateWeightedPooledCv(itemsForPooled);
  if (weighted.totalDf === 0 || weighted.pooledCvPct <= 0) {
    const mfgMean =
      levelKey === "L1"
        ? cfg.mfg_mean_L1 || cfg.mean_L1
        : levelKey === "L2"
        ? cfg.mfg_mean_L2 || cfg.mean_L2
        : cfg.mfg_mean_L3 || cfg.mean_L3;
    const mfgSd =
      levelKey === "L1"
        ? cfg.mfg_sd_L1 || cfg.sd_L1
        : levelKey === "L2"
        ? cfg.mfg_sd_L2 || cfg.sd_L2
        : cfg.mfg_sd_L3 || cfg.sd_L3;
    const fallbackCv = mfgMean > 0 ? (mfgSd / mfgMean) * 100 : 2.5;
    return {
      pooledCvPct: Number(fallbackCv.toFixed(2)),
      proposedSdByCv: roundSmartDecimal(
        (currentMeanLab * fallbackCv) / 100,
        refSd
      ),
      lotsCountUsed: 1,
      totalDegreesOfFreedom: 29,
    };
  }
  return {
    pooledCvPct: weighted.pooledCvPct,
    proposedSdByCv: roundSmartDecimal(
      (currentMeanLab * weighted.pooledCvPct) / 100,
      refSd
    ),
    lotsCountUsed: itemsForPooled.length,
    totalDegreesOfFreedom: weighted.totalDf,
  };
}

// ============================================================================
// LỰA CHỌN LUẬT NỘI KIỂM THEO SIGMA SCORE (CHUẨN BM.08.XN.QTQL.31 & LABCONNECT)
// ============================================================================
export interface RecommendedWestgardRules {
  recommendedRules: string[];
  bm08Text: string;
  explanation: string;
  isExemptLongRules: boolean;
}
export function getRecommendedWestgardRules(
  cfg: TestConfig,
  sigmaScore: number | null
): RecommendedWestgardRules {
  const isExempt = Boolean(cfg.is_exempt_long_rules);
  const isThreeLevels = cfg.levels_count === 3;
  let baseRules: string[] = [];
  let bm08Text = "";
  let explanation = "";

  if (sigmaScore !== null && sigmaScore >= 6.0) {
    baseRules = ["1-3s"];
    bm08Text = "1_3s";
    explanation = `Sigma = ${sigmaScore.toFixed(
      2
    )}σ (≥ 6.0σ): Đạt mức 6-Sigma xuất sắc, chỉ cần áp dụng quy tắc bác bỏ 1-3s (BM.08.XN.QTQL.31).`;
  } else if (sigmaScore !== null && sigmaScore >= 5.0) {
    baseRules = isThreeLevels
      ? ["1-3s", "2/3-2s", "R-4s"]
      : ["1-3s", "2-2s", "R-4s"];
    bm08Text = isThreeLevels ? "1_3s / 2/3_2s / R_4s" : "1_3s / 2_2s / R_4s";
    explanation = `Sigma = ${sigmaScore.toFixed(
      2
    )}σ (5.0–5.99σ): Áp dụng bộ 3 quy tắc ${bm08Text} (BM.08.XN.QTQL.31).`;
  } else {
    baseRules = isThreeLevels
      ? ["1-3s", "2/3-2s", "R-4s", "3-1s", "12x"]
      : ["1-3s", "2-2s", "R-4s", "4-1s", "10x"];
    bm08Text = "Quy trình đa quy tắc Westgard";
    explanation = `Sigma = ${
      sigmaScore !== null ? `${sigmaScore.toFixed(2)}σ` : "Chưa có"
    } (< 5.0σ): Áp dụng Quy trình đa quy tắc Westgard (${
      isThreeLevels
        ? "Phối hợp 3 mức: 1-3s / 2/3-2s / R-4s / 3-1s / 12x"
        : "Phối hợp 2 mức: 1-3s / 2-2s / R-4s / 4-1s / 10x"
    }).`;
  }

  if (isExempt) {
    baseRules = baseRules.filter(
      (r) =>
        r !== "6x" && r !== "8x" && r !== "9x" && r !== "10x" && r !== "12x"
    );
    explanation +=
      " [Ngoại lệ: Miễn trừ quy tắc chuỗi dài hạn 6x/8x/9x/10x/12x].";
  }

  return {
    recommendedRules: baseRules,
    bm08Text,
    explanation,
    isExemptLongRules: isExempt,
  };
}

// ============================================================================
// TÍNH TOÁN THỐNG KÊ, SIX SIGMA & ĐỘ KHÔNG ĐẢM BẢO ĐO (CHUẨN BM.04 & BM.01)
// ============================================================================
export interface EnhancedMuResult {
  meanLab: number;
  sdLab: number;
  cvPct: number;
  biasPct: number;
  biasAbs: number;
  sigma: number | null;
  validPointsCount: number;
  muConfigured: boolean;
  muModeLabel: string;
  ucPct: number | null;
  uePct: number | null;
  ucAbs: number | null;
  ueAbs: number | null;
  targetLimitPct: number | null;
  targetLimitAbs: number | null;
  targetLabel: string;
  isPassMu: boolean | null;
  formulaNote: string;
  biasModeUsed: "PEER_GROUP_EQA" | "INITIAL_VERIF" | "NONE_ZERO" | "MFG_TARGET";
  biasSourceLabel: string;
}

export function computeMuAndSigma(
  cfg: TestConfig,
  levelKey: "L1" | "L2" | "L3" = "L1",
  maxRecentPoints?: number
): EnhancedMuResult {
  const hist =
    levelKey === "L1"
      ? cfg.history_L1
      : levelKey === "L2"
      ? cfg.history_L2
      : cfg.history_L3;
  const cfgMean =
    levelKey === "L1"
      ? cfg.mean_L1
      : levelKey === "L2"
      ? cfg.mean_L2
      : cfg.mean_L3;
  const cfgSd =
    levelKey === "L1" ? cfg.sd_L1 : levelKey === "L2" ? cfg.sd_L2 : cfg.sd_L3;
  let mfgMean =
    levelKey === "L1"
      ? cfg.mfg_mean_L1
      : levelKey === "L2"
      ? cfg.mfg_mean_L2
      : cfg.mfg_mean_L3;
  if (!mfgMean || mfgMean <= 0) mfgMean = cfgMean;

  // Hỗ trợ đối chiếu đúng Số Lô độc lập của từng mức (L1, L2, L3)
  const effectiveLevelLot =
    levelKey === "L1"
      ? cfg.lot_number_L1 || cfg.lot_number
      : levelKey === "L2"
      ? cfg.lot_number_L2 || cfg.lot_number
      : cfg.lot_number_L3 || cfg.lot_number;

  let validPts = (hist || []).filter(
    (p) =>
      (!p.lot_number ||
        p.lot_number === effectiveLevelLot ||
        p.lot_number === cfg.lot_number) &&
      p.status !== "FAIL"
  );
  if (
    maxRecentPoints &&
    maxRecentPoints > 0 &&
    validPts.length > maxRecentPoints
  )
    validPts = validPts.slice(-maxRecentPoints);
  const validPointsCount = validPts.length;

  let meanLab = cfgMean > 0 ? cfgMean : mfgMean;
  let rawSdLab = cfgSd;
  const cfgCvPct =
    meanLab > 0 && cfgSd > 0
      ? Number(Math.max((cfgSd / meanLab) * 100, 0.01).toFixed(2))
      : 0;
  let cvPct = cfgCvPct;

  if (validPointsCount >= 2) {
    const vals = validPts.map((p) => Number(p.val || 0));
    meanLab = vals.reduce((acc, v) => acc + v, 0) / validPointsCount;
    rawSdLab = Math.sqrt(
      vals.reduce((acc, v) => acc + Math.pow(v - meanLab, 2), 0) /
        (validPointsCount - 1)
    );
    const safeMeanForCv = Math.max(Math.abs(meanLab), 0.0001);
    const computedCv = (rawSdLab / safeMeanForCv) * 100;
    cvPct =
      computedCv > 0
        ? Number(Math.max(computedCv, 0.01).toFixed(2))
        : cfgCvPct > 0
        ? cfgCvPct
        : 0.01;
  } else if (validPointsCount === 1) {
    meanLab = Number(validPts[0].val || cfgMean || mfgMean);
    rawSdLab = cfgSd;
    const safeMeanForCv = Math.max(Math.abs(meanLab), 0.0001);
    cvPct =
      cfgSd > 0
        ? Number(Math.max((cfgSd / safeMeanForCv) * 100, 0.01).toFixed(2))
        : 0.01;
  }

  const safeMeanLab = Math.max(Math.abs(meanLab), 0.0001);

  const muCfg: LevelMuConfig =
    levelKey === "L1"
      ? cfg.mu_L1 || { mu_mode: "NONE" }
      : levelKey === "L2"
      ? cfg.mu_L2 || { mu_mode: "NONE" }
      : cfg.mu_L3 || { mu_mode: "NONE" };

  // CHUẨN HÓA BIAS% THEO ĐÚNG BM.04.XN.QTQL.31:
  // Không tự động suy diễn Bias% từ chênh lệch Mean nội kiểm khi chưa nhập EQA / Thẩm định.
  let usedBiasPct = 0;
  let usedBiasAbs = 0;
  let biasModeUsed:
    | "PEER_GROUP_EQA"
    | "INITIAL_VERIF"
    | "NONE_ZERO"
    | "MFG_TARGET" = "NONE_ZERO";
  let biasSourceLabel = "0% (Chưa nhập)";

  if (
    muCfg.ubias_periodic !== undefined &&
    muCfg.ubias_periodic !== null &&
    Number(muCfg.ubias_periodic) > 0
  ) {
    usedBiasPct = Number(muCfg.ubias_periodic);
    usedBiasAbs = (usedBiasPct * safeMeanLab) / 100;
    biasModeUsed = "PEER_GROUP_EQA";
    biasSourceLabel = "EQA";
  } else if (
    muCfg.verif_bias !== undefined &&
    muCfg.verif_bias !== null &&
    Number(muCfg.verif_bias) > 0
  ) {
    usedBiasPct = Number(muCfg.verif_bias);
    usedBiasAbs = (usedBiasPct * safeMeanLab) / 100;
    biasModeUsed = "INITIAL_VERIF";
    biasSourceLabel = "Thẩm định";
  } else {
    usedBiasPct = 0;
    usedBiasAbs = 0;
    biasModeUsed = "NONE_ZERO";
    biasSourceLabel = "0% (Chưa nhập)";
  }

  const hasTea =
    cfg.tea !== undefined && cfg.tea !== null && Number(cfg.tea) > 0;
  const teaVal = hasTea ? Number(cfg.tea) : 0;
  const teaUnit = cfg.tea_unit || "PERCENT";

  // Đồng bộ 100% CV% và SD dùng để tính Six Sigma giữa Biểu đồ L-J, Bản in L-J và Trợ lý Range & MU
  const effectiveCvForSigma =
    validPointsCount >= 2
      ? cvPct
      : muCfg.urw_pooled && muCfg.urw_pooled > 0
      ? muCfg.urw_pooled
      : cfgCvPct > 0
      ? cfgCvPct
      : cvPct;
  const effectiveSdForSigma =
    validPointsCount >= 2
      ? rawSdLab > 0
        ? rawSdLab
        : cfgSd
      : cfgSd > 0
      ? cfgSd
      : rawSdLab;

  let sigma: number | null = null;
  let targetLimitPct: number | null = null;
  let targetLimitAbs: number | null = null;
  let targetLabel = "Chưa có TEa";

  if (hasTea) {
    if (teaUnit === "PERCENT") {
      sigma =
        effectiveCvForSigma > 0
          ? Number(((teaVal - usedBiasPct) / effectiveCvForSigma).toFixed(2))
          : null;
      targetLimitPct = 0.75 * teaVal;
      targetLimitAbs = (targetLimitPct * safeMeanLab) / 100;
      targetLabel = `0.75×TEa (${targetLimitPct.toFixed(2)}%)`;
    } else {
      sigma =
        effectiveSdForSigma > 0
          ? Number(((teaVal - usedBiasAbs) / effectiveSdForSigma).toFixed(2))
          : null;
      targetLimitAbs = 0.75 * teaVal;
      targetLimitPct = (targetLimitAbs / safeMeanLab) * 100;
      targetLabel = `0.75×TEa (${formatSmartDecimal(targetLimitAbs, cfgSd)} ${
        cfg.unit
      })`;
    }
    if (sigma !== null) sigma = Math.max(0, Math.min(16, sigma));
  }

  const mode =
    muCfg.mu_mode === "NONE" &&
    (cfg.bias_source_priority || usedBiasPct > 0 || cvPct > 0)
      ? cfg.bias_source_priority === "VERIFICATION"
        ? "INITIAL_VERIFICATION"
        : "PERIODIC_IQC"
      : muCfg.mu_mode;

  let ucPct: number | null = null;
  let uePct: number | null = null;
  let formulaNote = "Vui lòng cấu hình tham số MU cho mức này";
  let muModeLabel = "Chưa thiết lập";
  if (mode === "MANUAL") {
    const manualVal = Number(muCfg.manual_mu || 0);
    if (manualVal > 0) {
      ucPct = manualVal / 2;
      uePct = manualVal;
      formulaNote = "Ue (%) do Admin nhập trực tiếp";
      muModeLabel = "Nhập tay (Admin)";
    }
  } else if (mode === "INITIAL_VERIFICATION") {
    const ur = Number(muCfg.verif_cvr || cvPct || 0);
    const ub = Number(usedBiasPct || 0);
    if (ur > 0) {
      ucPct = Math.sqrt(Math.pow(ur, 2) + Math.pow(ub, 2));
      uePct = 1.96 * ucPct;
      formulaNote = `uc = √(uR² + uB²) = √(${ur.toFixed(2)}² + ${ub.toFixed(
        2
      )}²)`;
      muModeLabel = "Thẩm định Lần đầu (k=1.96)";
    }
  } else if (mode === "PERIODIC_IQC") {
    const urw = Number(muCfg.urw_pooled || cvPct || 0);
    const ub = Number(usedBiasPct || 0);
    const ucal = Number(muCfg.uc_cal || 0);
    if (urw > 0) {
      ucPct = Math.sqrt(Math.pow(urw, 2) + Math.pow(ub, 2) + Math.pow(ucal, 2));
      uePct = 2.0 * ucPct;
      formulaNote = `uc = √(uRw² + uBias² + uCal²) = √(${urw.toFixed(
        2
      )}² + ${ub.toFixed(2)}² + ${ucal.toFixed(2)}²)`;
      muModeLabel = "Định kỳ IQC (k=2.0)";
    }
  }

  let isPassMu: boolean | null = null;
  if (uePct !== null && targetLimitPct !== null)
    isPassMu = uePct < targetLimitPct;

  const ucAbs = ucPct !== null ? (ucPct * safeMeanLab) / 100 : null;
  const ueAbs = uePct !== null ? (uePct * safeMeanLab) / 100 : null;

  return {
    meanLab: roundSmartDecimal(meanLab, cfgSd),
    sdLab: roundSmartDecimal(rawSdLab, cfgSd),
    cvPct,
    biasPct: Number(usedBiasPct.toFixed(2)),
    biasAbs: roundSmartDecimal(usedBiasAbs, cfgSd),
    sigma,
    validPointsCount,
    muConfigured: uePct !== null,
    muModeLabel,
    ucPct: ucPct !== null ? Number(ucPct.toFixed(2)) : null,
    uePct: uePct !== null ? Number(uePct.toFixed(2)) : null,
    ucAbs: ucAbs !== null ? roundSmartDecimal(ucAbs, cfgSd) : null,
    ueAbs: ueAbs !== null ? roundSmartDecimal(ueAbs, cfgSd) : null,
    targetLimitPct:
      targetLimitPct !== null ? Number(targetLimitPct.toFixed(2)) : null,
    targetLimitAbs:
      targetLimitAbs !== null ? roundSmartDecimal(targetLimitAbs, cfgSd) : null,
    targetLabel,
    isPassMu,
    formulaNote,
    biasModeUsed,
    biasSourceLabel,
  };
}

export function formatSDPositionBadge(z: number) {
  const abs = Math.abs(z);
  const sign = z >= 0 ? "+" : "-";
  const zStr = `${z >= 0 ? "+" : ""}${z.toFixed(2)}SD`;
  if (abs <= 1)
    return {
      text: `✓ Đạt · Trong ±1SD (${zStr})`,
      shortRule: `✓ Đạt (±1SD · ${zStr})`,
      cls: "bg-emerald-50 text-emerald-700 border-emerald-300",
    };
  if (abs < 2)
    return {
      text: `✓ Đạt · ${sign}1SD đến ${sign}2SD (${zStr})`,
      shortRule: `✓ Đạt (${sign}1..2SD · ${zStr})`,
      cls: "bg-teal-50 text-teal-700 border-teal-300",
    };
  if (abs < 3)
    return {
      text: `⚠️ Cảnh báo 1-2s · ${sign}2SD đến ${sign}3SD (${zStr})`,
      shortRule: `⚠️ Cảnh báo 1-2s (${sign}2..3SD · ${zStr})`,
      cls: "bg-amber-50 text-amber-800 border-amber-400",
    };
  return {
    text: `🚨 Vi phạm 1-3s · Vượt ${sign}3SD (${zStr})`,
    shortRule: `🚨 Vi phạm 1-3s (>${sign}3SD · ${zStr})`,
    cls: "bg-rose-50 text-rose-700 border-rose-400 animate-pulse",
  };
}

export const INITIAL_USERS: UserAccount[] = [
  {
    id: "thlong",
    name: "Tô Hoàng Long",
    password: "Longdeptrai",
    role: "ADMIN",
    mustChange: true,
    permissions: [...DEFAULT_ROLE_PERMISSIONS.ADMIN],
  },
  {
    id: "hqsang",
    name: "Huỳnh Quang Sang",
    password: "Longdeptrai",
    role: "QLCM",
    mustChange: true,
    permissions: [...DEFAULT_ROLE_PERMISSIONS.QLCM],
  },
];

export const INITIAL_REAGENTS: ReagentLotBM16[] = [];
export const INITIAL_CONFIGS: TestConfig[] = [];
export const INITIAL_BM09_LOGS: BM09LogEntry[] = [];

// ============================================================================
// BỘ CÔNG CỤ LIÊN THÔNG ĐIỆN THOẠI <-> MÁY TÍNH (CHỤP ĐẨY ẢNH GỐC SIÊU TỐC)
// ============================================================================

export interface MobileDraftIndexItem {
  section_name: string;
  machine_name: string;
  control_name: string;
  operator_name: string;
  updated_at_ms: number;
  active_levels: ("L1" | "L2" | "L3")[];
}

export interface MobileDraftPayload {
  section_name: string;
  machine_name: string;
  control_name: string;
  operator_name: string;
  run_date: string;
  updated_at_ms: number;
  active_levels: ("L1" | "L2" | "L3")[];
  values: Record<string, { L1?: string; L2?: string; L3?: string }>;
  level_notes?: Partial<Record<"L1" | "L2" | "L3", string>>;
  images: Partial<Record<"L1" | "L2" | "L3", string>>;
}

export interface DualCompressedImage {
  handoffBase64: string; // Ảnh cực nhẹ (< 85KB) đẩy thẳng sang màn hình PC đối chiếu
  width: number;
  height: number;
}

export function compressImageDual(file: File): Promise<DualCompressedImage> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Không thể đọc file ảnh đã chọn."));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("Định dạng file ảnh không hợp lệ."));
      img.onload = () => {
        try {
          const renderScaled = (maxDim: number, quality: number): string => {
            let w = img.width;
            let h = img.height;
            if (w > maxDim || h > maxDim) {
              if (w >= h) {
                h = Math.round((h * maxDim) / w);
                w = maxDim;
              } else {
                w = Math.round((w * maxDim) / h);
                h = maxDim;
              }
            }
            const canvas = document.createElement("canvas");
            canvas.width = w;
            canvas.height = h;
            const ctx = canvas.getContext("2d");
            if (!ctx) return "";
            ctx.fillStyle = "#ffffff";
            ctx.fillRect(0, 0, w, h);
            ctx.drawImage(img, 0, 0, w, h);
            return canvas.toDataURL("image/jpeg", quality);
          };

          // Tạo 1 bản siêu nhẹ để đẩy thẳng sang PC
          let handoffBase64 = renderScaled(820, 0.68);
          if (handoffBase64.length > 88000)
            handoffBase64 = renderScaled(680, 0.58);
          if (handoffBase64.length > 88000)
            handoffBase64 = renderScaled(540, 0.48);

          resolve({ handoffBase64, width: img.width, height: img.height });
        } catch (err) {
          reject(err);
        }
      };
      img.src = String(reader.result || "");
    };
    reader.readAsDataURL(file);
  });
}
