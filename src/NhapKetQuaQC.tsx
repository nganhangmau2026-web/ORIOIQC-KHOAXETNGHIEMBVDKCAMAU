import React, {
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo,
} from "react";
import {
  TestConfig,
  HistoryPoint,
  BM09LogEntry,
  ReagentLotBM16,
  UserAccount,
  SectionLock,
  EvalRow,
  MobileDraftIndexItem,
  MobileDraftPayload,
  formatDateVN,
  formatShortDM,
  getVnIsoDateString,
  getVnTimeString,
  formatSDPositionBadge,
  computeMuAndSigma,
  getRecommendedWestgardRules,
  QUALITATIVE_OPTIONS,
  SUGGESTED_CAUSES,
  SUGGESTED_ACTIONS,
  hasPermission,
  rpcCall,
  STORAGE_KEYS,
  usePersistentState,
  compressImageDual,
  sortHistoryChronologically,
  isReagentReached75,
} from "./KieuDuLieu";

// ============================================================================
// FILE: src/NhapKetQuaQC.tsx — PHẦN 1/4 (IMPORTS, OCR ENGINE & HISTORY CORE)
// - Đồng bộ bảng màu giữa Dòng xét nghiệm trên Bảng và Kính ngắm trên Ảnh.
// - Tích hợp từ điển nhận diện mã xét nghiệm máy DXC 700 AU, Sysmex XR-1000 & CS-2500.
// - Lõi nhận diện số quang học cục bộ (Client-side Tesseract.js — Zero API Key).
// - Hỗ trợ truy xuất chuỗi Z-score theo Lô độc lập của từng mức (L1, L2, L3).
// ✦ An intellectual product by Handsome Long ✦
// ============================================================================

export const LOCAL_MOBILE_DRAFT_CACHE_KEY = "ORIO_MOBILE_DRAFT_CACHE_V7";
export const LENS_SIZE_BY_MACHINE_KEY = "ORIO_LENS_SIZE_BY_MACHINE_V7";

export const Ic = {
  Cpu: () => (
    <svg
      width="18"
      height="18"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      viewBox="0 0 24 24"
    >
      <rect x="4" y="4" width="16" height="16" rx="2" />
      <rect x="9" y="9" width="6" height="6" />
      <path d="M9 1v3M15 1v3M9 20v3M15 20v3M20 9h3M20 14h3M1 9h3M1 14h3" />
    </svg>
  ),
  Flask: () => (
    <svg
      width="17"
      height="17"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      viewBox="0 0 24 24"
    >
      <path d="M9 3h6M10 3v5.5L4.7 17a2 2 0 0 0 1.8 3h11a2 2 0 0 0 1.8-3L14 8.5V3M7 14h10" />
    </svg>
  ),
  Check: () => (
    <svg
      width="15"
      height="15"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.6"
      viewBox="0 0 24 24"
    >
      <polyline points="20 6 9 17 4 12" />
    </svg>
  ),
  Back: () => (
    <svg
      width="15"
      height="15"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      viewBox="0 0 24 24"
    >
      <line x1="19" y1="12" x2="5" y2="12" />
      <polyline points="12 19 5 12 12 5" />
    </svg>
  ),
  Grid: () => (
    <svg
      width="15"
      height="15"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      viewBox="0 0 24 24"
    >
      <rect x="3" y="3" width="7" height="7" />
      <rect x="14" y="3" width="7" height="7" />
      <rect x="14" y="14" width="7" height="7" />
      <rect x="3" y="14" width="7" height="7" />
    </svg>
  ),
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
  Unlock: () => (
    <svg
      width="14"
      height="14"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      viewBox="0 0 24 24"
    >
      <rect x="3" y="11" width="18" height="11" rx="2" />
      <path d="M7 11V7a5 5 0 0 1 9.9-1" />
    </svg>
  ),
  Camera: () => (
    <svg
      width="15"
      height="15"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      viewBox="0 0 24 24"
    >
      <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
      <circle cx="12" cy="13" r="4" />
    </svg>
  ),
  Target: () => (
    <svg
      width="14"
      height="14"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      viewBox="0 0 24 24"
    >
      <circle cx="12" cy="12" r="10" />
      <circle cx="12" cy="12" r="6" />
      <circle cx="12" cy="12" r="2" />
    </svg>
  ),
};

// Bảng màu đồng bộ giữa Dòng xét nghiệm trên Bảng và Kính ngắm trên Ảnh
export interface SyncColorTheme {
  name: string;
  hex: string;
  badgeBg: string;
  badgeText: string;
  rowRing: string;
}

export const TEST_SYNC_PALETTE: SyncColorTheme[] = [
  {
    name: "Sky",
    hex: "#0284c7",
    badgeBg: "bg-sky-600",
    badgeText: "text-white",
    rowRing: "ring-2 ring-sky-400 bg-sky-50/70",
  },
  {
    name: "Emerald",
    hex: "#059669",
    badgeBg: "bg-emerald-600",
    badgeText: "text-white",
    rowRing: "ring-2 ring-emerald-400 bg-emerald-50/70",
  },
  {
    name: "Violet",
    hex: "#7c3aed",
    badgeBg: "bg-violet-600",
    badgeText: "text-white",
    rowRing: "ring-2 ring-violet-400 bg-violet-50/70",
  },
  {
    name: "Amber",
    hex: "#d97706",
    badgeBg: "bg-amber-600",
    badgeText: "text-white",
    rowRing: "ring-2 ring-amber-400 bg-amber-50/70",
  },
  {
    name: "Rose",
    hex: "#e11d48",
    badgeBg: "bg-rose-600",
    badgeText: "text-white",
    rowRing: "ring-2 ring-rose-400 bg-rose-50/70",
  },
  {
    name: "Cyan",
    hex: "#0891b2",
    badgeBg: "bg-cyan-600",
    badgeText: "text-white",
    rowRing: "ring-2 ring-cyan-400 bg-cyan-50/70",
  },
  {
    name: "Fuchsia",
    hex: "#c026d3",
    badgeBg: "bg-fuchsia-600",
    badgeText: "text-white",
    rowRing: "ring-2 ring-fuchsia-400 bg-fuchsia-50/70",
  },
  {
    name: "Indigo",
    hex: "#4f46e5",
    badgeBg: "bg-indigo-600",
    badgeText: "text-white",
    rowRing: "ring-2 ring-indigo-400 bg-indigo-50/70",
  },
];

// Từ điển đối chiếu mã viết tắt trên màn hình máy DXC 700 AU, Sysmex XR-1000 & CS-2500
const MACHINE_CODE_ALIASES: Record<string, string[]> = {
  GLU: ["GLU", "GLUCOSE"],
  UREA: ["UREA", "URE", "BUN"],
  CRE: ["CRE", "CREA", "CREATININE", "CREATININ"],
  UA: ["UA", "URIC", "URIC ACID", "ACID URIC"],
  ALT: ["ALT", "GPT", "ALT (GPT)", "ALT (SGPT)"],
  AST: ["AST", "GOT", "AST (GOT)", "AST (SGOT)"],
  GGT: ["GGT", "GGTP"],
  "BIL-TP": [
    "BIL-TP",
    "TBIL",
    "BILIRUBIN TOAN PHAN",
    "BILIRUBIN TOTAL",
    "BILIRUBIN TP",
  ],
  "BIL-TT": [
    "BIL-TT",
    "DBIL",
    "BILIRUBIN TRUC TIEP",
    "BILIRUBIN DIRECT",
    "BILIRUBIN TT",
  ],
  CHO: ["CHO", "CHOL", "CHOLESTEROL"],
  TRIG: ["TRIG", "TG", "TRIGLYCERIDE"],
  HDL: ["HDL", "HDL-C", "HDL-CHOLESTEROL"],
  LDL: ["LDL", "LDL-C", "LDL-CHOLESTEROL"],
  TP: ["TP", "PROTEIN TOAN PHAN", "PROTEIN TP", "TOTAL PROTEIN"],
  ALB: ["ALB", "ALBUMIN"],
  FE: ["FE", "IRON", "SAT"],
  LAC: ["LAC", "LACTATE"],
  AMY: ["AMY", "AMYLASE"],
  LIP: ["LIP", "LIPASE"],
  ALP: ["ALP", "ALKP"],
  LDH: ["LDH", "LD"],
  CRP: ["CRP", "CRP DINH LUONG", "HS-CRP"],
  WBC: ["WBC"],
  RBC: ["RBC"],
  HGB: ["HGB", "HB"],
  HCT: ["HCT"],
  PLT: ["PLT"],
  MCV: ["MCV"],
  MCH: ["MCH"],
  MCHC: ["MCHC"],
  "RDW-CV": ["RDW-CV", "RDWCV", "RDW"],
  "NEUT%": ["NEUT%", "NEU%", "NEUT"],
  "LYMPH%": ["LYMPH%", "LYM%", "LYMPH"],
  "MONO%": ["MONO%", "MON%"],
  "EO%": ["EO%", "EOS%"],
  "BASO%": ["BASO%", "BAS%"],
  PT: ["PT", "DONG MAU PT", "PROTHROMBIN", "TQ"],
  APTT: ["APTT", "DONG MAU APTT", "TCK", "PTT"],
  FIB: ["FIB", "FIBRINOGEN"],
  DDIMER: ["D-DIMER", "DDIMER"],
};

function stripVnAccents(str: string): string {
  return str
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toUpperCase()
    .trim();
}

export function matchScannedTestAlias(
  rawOcrText: string,
  testsList: TestConfig[]
): TestConfig | null {
  const cleaned = stripVnAccents(rawOcrText).replace(/[^A-Z0-9%-]/g, " ");
  const tokens = cleaned.split(/\s+/).filter((t) => t.length >= 2);
  if (tokens.length === 0) return null;

  for (const token of tokens) {
    const direct = testsList.find((t) => {
      const normName = stripVnAccents(t.test_name);
      return (
        normName === token ||
        normName.startsWith(`${token} `) ||
        normName.includes(`(${token})`)
      );
    });
    if (direct) return direct;

    for (const [codeKey, aliasArr] of Object.entries(MACHINE_CODE_ALIASES)) {
      if (
        codeKey === token ||
        aliasArr.some((a) => a === token || token.includes(a))
      ) {
        const matched = testsList.find((t) => {
          const normName = stripVnAccents(t.test_name);
          return aliasArr.some(
            (a) =>
              normName === a ||
              normName.startsWith(`${a} `) ||
              normName.includes(a)
          );
        });
        if (matched) return matched;
      }
    }
  }
  return null;
}

// ============================================================================
// BỘ NHẬN DIỆN SỐ QUANG HỌC CỤC BỘ (CLIENT-SIDE TESSERACT.JS — ZERO API KEY)
// ============================================================================
let tesseractWorkerPromise: Promise<any> | null = null;

export function ensureLocalOcrWorker(): Promise<any> {
  if (tesseractWorkerPromise) return tesseractWorkerPromise;
  tesseractWorkerPromise = new Promise((resolve, reject) => {
    const win = window as any;
    const initWorker = async () => {
      try {
        const worker = await win.Tesseract.createWorker("eng");
        resolve(worker);
      } catch (err) {
        tesseractWorkerPromise = null;
        reject(err);
      }
    };

    if (win.Tesseract) {
      initWorker();
      return;
    }

    const script = document.createElement("script");
    script.src =
      "https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js";
    script.async = true;
    script.onload = () => initWorker();
    script.onerror = () => {
      tesseractWorkerPromise = null;
      reject(new Error("Không thể tải thư viện OCR nội bộ."));
    };
    document.head.appendChild(script);
  });
  return tesseractWorkerPromise;
}

export async function recognizeCroppedCanvasOcr(
  imgEl: HTMLImageElement,
  cropX: number,
  cropY: number,
  cropW: number,
  cropH: number,
  mode: "AUTO_STEP" | "DUAL_MATRIX"
): Promise<{ parsedNumber: string | null; parsedCodeText: string }> {
  const scale = 2.6;
  const buildProcessedDataUrl = (
    sx: number,
    sy: number,
    sw: number,
    sh: number
  ): string => {
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(24, Math.round(sw * scale));
    canvas.height = Math.max(24, Math.round(sh * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) return "";
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(
      imgEl,
      Math.max(0, sx),
      Math.max(0, sy),
      Math.max(8, sw),
      Math.max(8, sh),
      0,
      0,
      canvas.width,
      canvas.height
    );

    const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const d = imgData.data;
    for (let i = 0; i < d.length; i += 4) {
      const gray = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
      const enhanced = gray < 145 ? Math.max(0, gray * 0.55) : 255;
      d[i] = enhanced;
      d[i + 1] = enhanced;
      d[i + 2] = enhanced;
    }
    ctx.putImageData(imgData, 0, 0);
    return canvas.toDataURL("image/png");
  };

  const extractBestNumber = (raw: string): string | null => {
    const normalized = String(raw || "")
      .replace(/,/g, ".")
      .replace(/[oO]/g, "0")
      .replace(/[lI]/g, "1")
      .replace(/S/g, "5");
    const matches = normalized.match(/-?\d+(\.\d+)?/g);
    if (!matches || matches.length === 0) return null;
    return matches.reduce((best, cur) =>
      cur.length >= best.length ? cur : best
    );
  };

  const worker = await ensureLocalOcrWorker();

  if (mode === "DUAL_MATRIX") {
    const leftW = cropW * 0.44;
    const rightW = cropW * 0.56;
    const leftUrl = buildProcessedDataUrl(cropX, cropY, leftW, cropH);
    const rightUrl = buildProcessedDataUrl(cropX + leftW, cropY, rightW, cropH);
    const [resLeft, resRight] = await Promise.all([
      worker.recognize(leftUrl),
      worker.recognize(rightUrl),
    ]);
    const codeText = String(resLeft.data.text || "").trim();
    const numStr =
      extractBestNumber(String(resRight.data.text || "")) ||
      extractBestNumber(String(resLeft.data.text || ""));
    return { parsedNumber: numStr, parsedCodeText: codeText };
  }

  const singleUrl = buildProcessedDataUrl(cropX, cropY, cropW, cropH);
  const res = await worker.recognize(singleUrl);
  const rawText = String(res.data.text || "");
  return {
    parsedNumber: extractBestNumber(rawText),
    parsedCodeText: rawText,
  };
}

// ============================================================================
// CÁC HÀM LỊCH SỬ CHUỖI ĐIỂM NỘI KIỂM (HỖ TRỢ LÔ ĐỘC LẬP TỪNG MỨC)
// ============================================================================
export function getEffectiveLevelControlAndLot(
  t: TestConfig,
  lvl: "L1" | "L2" | "L3"
): { controlName: string; lotNumber: string; expiryDate: string } {
  if (lvl === "L1") {
    return {
      controlName: t.control_name_L1 || t.control_name,
      lotNumber: t.lot_number_L1 || t.lot_number,
      expiryDate: t.expiry_date_L1 || t.expiry_date,
    };
  }
  if (lvl === "L2") {
    return {
      controlName: t.control_name_L2 || t.control_name,
      lotNumber: t.lot_number_L2 || t.lot_number,
      expiryDate: t.expiry_date_L2 || t.expiry_date,
    };
  }
  return {
    controlName: t.control_name_L3 || t.control_name,
    lotNumber: t.lot_number_L3 || t.lot_number,
    expiryDate: t.expiry_date_L3 || t.expiry_date,
  };
}

export function upsertPointInHistoryArray(
  arr: HistoryPoint[] | undefined,
  newPt: HistoryPoint,
  editorName?: string,
  editNote?: string
): { list: HistoryPoint[]; isNewDayPoint: boolean } {
  const copy = Array.isArray(arr) ? [...arr] : [];
  if (!newPt.is_rerun) {
    for (let i = copy.length - 1; i >= 0; i--) {
      if (copy[i].isoDate === newPt.isoDate && !copy[i].is_rerun) {
        const oldPt = copy[i];
        const prevLogs = Array.isArray(oldPt.edit_log)
          ? [...oldPt.edit_log]
          : [];
        if (Number(oldPt.val) !== Number(newPt.val)) {
          prevLogs.push({
            edited_at: `${formatShortDM(
              getVnIsoDateString()
            )} ${getVnTimeString()}`,
            edited_by: editorName || newPt.operator || "KTV",
            old_val: Number(oldPt.val),
            new_val: Number(newPt.val),
            old_z: Number(oldPt.z),
            new_z: Number(newPt.z),
            note: editNote || "Phân tích cập nhật lại kết quả trong ngày",
          });
        }
        copy[i] = {
          ...newPt,
          edit_log: prevLogs.length > 0 ? prevLogs : undefined,
        };
        return { list: sortHistoryChronologically(copy), isNewDayPoint: false };
      }
    }
  }
  copy.push(newPt);
  return { list: sortHistoryChronologically(copy), isNewDayPoint: true };
}

export function buildCleanWestgardZSeries(
  historyArr: HistoryPoint[] | undefined,
  currentLot: string,
  currentRunDate?: string,
  fallbackBaseLot?: string
): number[] {
  const sorted = sortHistoryChronologically(historyArr).filter(
    (p) =>
      (!p.lot_number ||
        p.lot_number === currentLot ||
        (fallbackBaseLot && p.lot_number === fallbackBaseLot)) &&
      (!currentRunDate || p.isoDate < currentRunDate)
  );
  const effectivePts: HistoryPoint[] = [];
  for (let i = 0; i < sorted.length; i++) {
    const pt = sorted[i];
    if (
      pt.is_rerun &&
      effectivePts.length > 0 &&
      effectivePts[effectivePts.length - 1].isoDate === pt.isoDate &&
      effectivePts[effectivePts.length - 1].status === "FAIL"
    ) {
      effectivePts[effectivePts.length - 1] = pt;
    } else {
      effectivePts.push(pt);
    }
  }
  const cleanZs: number[] = [];
  for (let i = 0; i < effectivePts.length; i++) {
    const pt = effectivePts[i];
    if (pt.status === "FAIL") cleanZs.length = 0;
    else if (typeof pt.z === "number" && !isNaN(pt.z)) cleanZs.push(pt.z);
  }
  return cleanZs;
}
// ================= KẾT THÚC PHẦN 1/4 (DÁN TIẾP PHẦN 2/4 NGAY DƯỚI DÒNG NÀY) =================
// ================= BẮT ĐẦU PHẦN 2/4 (DÁN NỐI TIẾP NGAY DƯỚI PHẦN 1/4) =================

/**
 * Đánh giá chuỗi đơn mức (Dùng cho xét nghiệm 1-2 mức, hoặc dùng để ghi nhận
 * trạng thái riêng từng mức khi xem đơn lẻ trên biểu đồ L-J của xét nghiệm 3 mức).
 */
function checkSingleLevelSequentialPatterns(
  currentZ: number,
  prevCleanZs: number[],
  levelLabel: string,
  isExemptLongRules: boolean,
  allow22s: boolean,
  allow41sAnd10x: boolean
): {
  failRules: string[];
  warnRules: string[];
  singleStatus: "PASS" | "WARN" | "FAIL";
} {
  const failRules: string[] = [];
  const warnRules: string[] = [];
  const seq = [...prevCleanZs, currentZ];
  const prevZ =
    prevCleanZs.length > 0 ? prevCleanZs[prevCleanZs.length - 1] : 0;

  if (Math.abs(currentZ) >= 3) {
    failRules.push(`1-3s (${levelLabel})`);
  } else if (Math.abs(currentZ) >= 2) {
    warnRules.push(`1-2s (${levelLabel})`);
  }

  // 2-2s Tình huống 2: 2 thời điểm liên tiếp cùng 1 mức nằm cùng phía ngoài ±2SD
  if (
    allow22s &&
    ((currentZ >= 2 && prevZ >= 2) || (currentZ <= -2 && prevZ <= -2))
  ) {
    failRules.push(`2-2s Liên tiếp (${levelLabel})`);
  }

  if (allow41sAnd10x) {
    // 3-1s Tình huống 1: 3 lần liên tiếp cùng 1 mức nằm cùng phía ngoài ±1SD
    if (seq.length >= 3) {
      const last3 = seq.slice(-3);
      if (last3.every((z) => z > 1) || last3.every((z) => z < -1)) {
        warnRules.push(`3-1s (${levelLabel})`);
      }
    }
    // 4-1s Tình huống 1: 4 lần liên tiếp cùng 1 mức nằm cùng phía ngoài ±1SD
    if (seq.length >= 4) {
      const last4 = seq.slice(-4);
      if (last4.every((z) => z > 1) || last4.every((z) => z < -1)) {
        failRules.push(`4-1s (${levelLabel})`);
      }
    }
    // 10x Tình huống 1: 10 lần liên tiếp cùng 1 mức nằm cùng phía so với Mean
    if (!isExemptLongRules && seq.length >= 10) {
      const last10 = seq.slice(-10);
      if (last10.every((z) => z > 0) || last10.every((z) => z < 0)) {
        failRules.push(`10x (${levelLabel})`);
      }
    }
  }

  const singleStatus: "PASS" | "WARN" | "FAIL" =
    failRules.length > 0 ? "FAIL" : warnRules.length > 0 ? "WARN" : "PASS";
  return { failRules, warnRules, singleStatus };
}

/**
 * Bộ máy đánh giá Westgard toàn diện cho 1 xét nghiệm theo đúng tài liệu Word,
 * BM.08.XN.QTQL.31 và nguyên tắc Phối hợp 3 mức cho Huyết học.
 */
export function evaluateTestWestgardRules(
  t: TestConfig,
  v1: number | null,
  v2: number | null,
  v3: number | null,
  mode: "NORMAL" | "SIGMA",
  runDate?: string
): EvalRow {
  const z1 = v1 !== null && t.sd_L1 > 0 ? (v1 - t.mean_L1) / t.sd_L1 : null;
  const z2 = v2 !== null && t.sd_L2 > 0 ? (v2 - t.mean_L2) / t.sd_L2 : null;
  const z3 = v3 !== null && t.sd_L3 > 0 ? (v3 - t.mean_L3) / t.sd_L3 : null;

  const sigmaL1 = computeMuAndSigma(t, "L1").sigma;
  const sigmaL2 = t.levels_count >= 2 ? computeMuAndSigma(t, "L2").sigma : null;
  const sigmaL3 =
    t.levels_count === 3 ? computeMuAndSigma(t, "L3").sigma : null;

  const activeSigmas: number[] = [];
  if (z1 !== null && sigmaL1 !== null) activeSigmas.push(sigmaL1);
  if (z2 !== null && sigmaL2 !== null) activeSigmas.push(sigmaL2);
  if (z3 !== null && sigmaL3 !== null) activeSigmas.push(sigmaL3);
  const minActiveSigma =
    activeSigmas.length > 0 ? Math.min(...activeSigmas) : null;

  const recRulesObj = getRecommendedWestgardRules(
    t,
    mode === "SIGMA" ? minActiveSigma : null
  );
  const appliedRuleSetLabel =
    mode === "SIGMA"
      ? `${recRulesObj.bm08Text} (${
          minActiveSigma !== null
            ? `${minActiveSigma.toFixed(2)}σ`
            : "Chưa có σ"
        })`
      : "Đa quy tắc Westgard chuẩn";

  const allow22sAndR4s =
    mode === "NORMAL" || minActiveSigma === null || minActiveSigma < 6.0;
  const allowLongAnd1s =
    mode === "NORMAL" || minActiveSigma === null || minActiveSigma < 5.0;
  const isExemptLong = Boolean(t.is_exempt_long_rules);

  const lot1 = getEffectiveLevelControlAndLot(t, "L1").lotNumber;
  const lot2 = getEffectiveLevelControlAndLot(t, "L2").lotNumber;
  const lot3 = getEffectiveLevelControlAndLot(t, "L3").lotNumber;

  const cleanZ1 = buildCleanWestgardZSeries(
    t.history_L1,
    lot1,
    runDate,
    t.lot_number
  );
  const cleanZ2 = buildCleanWestgardZSeries(
    t.history_L2,
    lot2,
    runDate,
    t.lot_number
  );
  const cleanZ3 = buildCleanWestgardZSeries(
    t.history_L3,
    lot3,
    runDate,
    t.lot_number
  );

  // Kiểm tra đơn lẻ từng mức (để lưu vào single_level_status / single_level_rule)
  const sEval1 =
    z1 !== null
      ? checkSingleLevelSequentialPatterns(
          z1,
          cleanZ1,
          "Mức 1",
          isExemptLong,
          allow22sAndR4s,
          allowLongAnd1s
        )
      : null;
  const sEval2 =
    z2 !== null
      ? checkSingleLevelSequentialPatterns(
          z2,
          cleanZ2,
          "Mức 2",
          isExemptLong,
          allow22sAndR4s,
          allowLongAnd1s
        )
      : null;
  const sEval3 =
    z3 !== null
      ? checkSingleLevelSequentialPatterns(
          z3,
          cleanZ3,
          "Mức 3",
          isExemptLong,
          allow22sAndR4s,
          allowLongAnd1s
        )
      : null;

  const singleRules: string[] = [];
  const crossRules: string[] = [];
  const advisoryNotes: string[] = [];

  // ==========================================================================
  // TRƯỜNG HỢP A: XÉT NGHIỆM 3 MỨC NỒNG ĐỘ (ĐẶC THÙ HUYẾT HỌC - PHỐI HỢP 3 MỨC)
  // ==========================================================================
  if (t.levels_count === 3) {
    let lvl1CoordStatus: "PASS" | "WARN" | "FAIL" | "SKIP" =
      v1 !== null ? "PASS" : "SKIP";
    let lvl2CoordStatus: "PASS" | "WARN" | "FAIL" | "SKIP" =
      v2 !== null ? "PASS" : "SKIP";
    let lvl3CoordStatus: "PASS" | "WARN" | "FAIL" | "SKIP" =
      v3 !== null ? "PASS" : "SKIP";
    let overallStatus: "PASS" | "WARN" | "FAIL" = "PASS";
    let hasRandomErr = false;
    let hasSystemicErr = false;

    // 1. Quy tắc 1-3s (Vượt ±3SD ở bất kỳ mức nào - Sai số ngẫu nhiên lớn, bác bỏ ngay)
    if (z1 !== null && Math.abs(z1) >= 3) {
      singleRules.push("1-3s (Mức 1)");
      lvl1CoordStatus = "FAIL";
      overallStatus = "FAIL";
      hasRandomErr = true;
    }
    if (z2 !== null && Math.abs(z2) >= 3) {
      singleRules.push("1-3s (Mức 2)");
      lvl2CoordStatus = "FAIL";
      overallStatus = "FAIL";
      hasRandomErr = true;
    }
    if (z3 !== null && Math.abs(z3) >= 3) {
      singleRules.push("1-3s (Mức 3)");
      lvl3CoordStatus = "FAIL";
      overallStatus = "FAIL";
      hasRandomErr = true;
    }

    const activeThree = [
      { key: "L1" as const, z: z1 },
      { key: "L2" as const, z: z2 },
      { key: "L3" as const, z: z3 },
    ].filter(
      (item): item is { key: "L1" | "L2" | "L3"; z: number } => item.z !== null
    );

    if (allow22sAndR4s && activeThree.length >= 2) {
      // 2. Quy tắc 2/3-2s Tình huống 2 (2 trên 3 mức trong cùng thời điểm cùng phía ngoài ±2SD)
      const pos2s = activeThree.filter((x) => x.z >= 2);
      const neg2s = activeThree.filter((x) => x.z <= -2);
      if (pos2s.length >= 2 || neg2s.length >= 2) {
        const violated = pos2s.length >= 2 ? pos2s : neg2s;
        const label =
          violated.length === 3
            ? "2/3-2s (Cả 3 mức)"
            : `2/3-2s (${violated.map((v) => v.key).join(" & ")})`;
        crossRules.push(label);
        violated.forEach((v) => {
          if (v.key === "L1") lvl1CoordStatus = "FAIL";
          if (v.key === "L2") lvl2CoordStatus = "FAIL";
          if (v.key === "L3") lvl3CoordStatus = "FAIL";
        });
        overallStatus = "FAIL";
        hasSystemicErr = true;
      }

      // 3. Quy tắc R-4s (Trong cùng thời điểm, 1 mức >= +2SD và 1 mức <= -2SD)
      for (let i = 0; i < activeThree.length; i++) {
        for (let j = i + 1; j < activeThree.length; j++) {
          const a = activeThree[i];
          const b = activeThree[j];
          if (
            Math.abs(a.z - b.z) >= 4 &&
            ((a.z >= 2 && b.z <= -2) || (a.z <= -2 && b.z >= 2))
          ) {
            crossRules.push(`R-4s (${a.key} và ${b.key})`);
            if (a.key === "L1" || b.key === "L1") lvl1CoordStatus = "FAIL";
            if (a.key === "L2" || b.key === "L2") lvl2CoordStatus = "FAIL";
            if (a.key === "L3" || b.key === "L3") lvl3CoordStatus = "FAIL";
            overallStatus = "FAIL";
            hasRandomErr = true;
          }
        }
      }
    }

    if (allowLongAnd1s && z1 !== null && z2 !== null && z3 !== null) {
      // 4. Quy tắc 3-1s Tình huống 2 (Cả 3 mức nồng độ trong cùng thời điểm cùng phía ngoài ±1SD)
      if ((z1 > 1 && z2 > 1 && z3 > 1) || (z1 < -1 && z2 < -1 && z3 < -1)) {
        crossRules.push("3-1s (Phối hợp cả 3 mức)");
        lvl1CoordStatus = "FAIL";
        lvl2CoordStatus = "FAIL";
        lvl3CoordStatus = "FAIL";
        overallStatus = "FAIL";
        hasSystemicErr = true;
      }

      // 5. Quy tắc 9x & 12x Phối hợp 3 mức (3 mức trong 3 hoặc 4 lần liên tiếp cùng phía Mean)
      if (!isExemptLong) {
        const s1 = [...cleanZ1, z1];
        const s2 = [...cleanZ2, z2];
        const s3 = [...cleanZ3, z3];
        if (s1.length >= 4 && s2.length >= 4 && s3.length >= 4) {
          const all12 = [...s1.slice(-4), ...s2.slice(-4), ...s3.slice(-4)];
          if (all12.every((z) => z > 0) || all12.every((z) => z < 0)) {
            crossRules.push("12x (3 mức × 4 ngày liên tiếp)");
            lvl1CoordStatus = "FAIL";
            lvl2CoordStatus = "FAIL";
            lvl3CoordStatus = "FAIL";
            overallStatus = "FAIL";
            hasSystemicErr = true;
          }
        } else if (s1.length >= 3 && s2.length >= 3 && s3.length >= 3) {
          const all9 = [...s1.slice(-3), ...s2.slice(-3), ...s3.slice(-3)];
          if (all9.every((z) => z > 0) || all9.every((z) => z < 0)) {
            crossRules.push("9x (3 mức × 3 ngày liên tiếp)");
            lvl1CoordStatus = "FAIL";
            lvl2CoordStatus = "FAIL";
            lvl3CoordStatus = "FAIL";
            overallStatus = "FAIL";
            hasSystemicErr = true;
          }
        }
      }
    }

    // Ghi nhận lưu ý đơn mức (không làm FAIL mẻ chạy 3 mức phối hợp)
    const singleLevelNotices: string[] = [];
    if (
      sEval1 &&
      (sEval1.failRules.length > 0 || sEval1.warnRules.length > 0)
    ) {
      singleLevelNotices.push(
        ...sEval1.failRules.filter((r) => !r.startsWith("1-3s")),
        ...sEval1.warnRules
      );
    }
    if (
      sEval2 &&
      (sEval2.failRules.length > 0 || sEval2.warnRules.length > 0)
    ) {
      singleLevelNotices.push(
        ...sEval2.failRules.filter((r) => !r.startsWith("1-3s")),
        ...sEval2.warnRules
      );
    }
    if (
      sEval3 &&
      (sEval3.failRules.length > 0 || sEval3.warnRules.length > 0)
    ) {
      singleLevelNotices.push(
        ...sEval3.failRules.filter((r) => !r.startsWith("1-3s")),
        ...sEval3.warnRules
      );
    }

    if (overallStatus === "PASS" && singleLevelNotices.length > 0) {
      advisoryNotes.push(
        `Phối hợp 3 mức Đạt chuẩn · Lưu ý riêng từng mức: ${singleLevelNotices.join(
          ", "
        )} (Có thể chạy kiểm tra lại nếu cần, chỉ hiển thị khi bấm xem riêng từng mức trên biểu đồ L-J)`
      );
    }

    const errType =
      overallStatus === "FAIL"
        ? hasRandomErr && hasSystemicErr
          ? "Sai số Hỗn hợp (RE & SE)"
          : hasSystemicErr
          ? "Sai số Hệ thống (SE)"
          : "Sai số Ngẫu nhiên (RE)"
        : singleLevelNotices.length > 0
        ? "Đạt phối hợp 3 mức (Có lưu ý đơn mức)"
        : "Đạt chuẩn phối hợp 3 mức";

    const suggestion =
      overallStatus === "FAIL"
        ? hasSystemicErr
          ? "Kiểm tra hóa chất/thuốc thử, bảo quản mẫu QC, tình trạng thiết bị và hiệu chuẩn lại."
          : "Kiểm tra kim hút, bọt khí, lắc đều mẫu QC và chạy kiểm tra lại mức vi phạm."
        : singleLevelNotices.length > 0
        ? "Chấp nhận kết quả bệnh nhân. Có thể theo dõi hoặc chạy kiểm tra lại mức lệch nhẹ nếu cần."
        : "Hệ thống phân tích 3 mức ổn định. Chấp nhận kết quả bệnh nhân.";

    return {
      test: t,
      valL1: v1,
      zL1: z1,
      lvl1Status: lvl1CoordStatus,
      lvl1SingleRule: sEval1
        ? [...sEval1.failRules, ...sEval1.warnRules].join(", ")
        : undefined,
      valL2: v2,
      zL2: z2,
      lvl2Status: lvl2CoordStatus,
      lvl2SingleRule: sEval2
        ? [...sEval2.failRules, ...sEval2.warnRules].join(", ")
        : undefined,
      valL3: v3,
      zL3: z3,
      lvl3Status: lvl3CoordStatus,
      lvl3SingleRule: sEval3
        ? [...sEval3.failRules, ...sEval3.warnRules].join(", ")
        : undefined,
      status: overallStatus,
      singleLevelRules: singleRules,
      crossLevelRules: crossRules,
      advisoryNotes,
      appliedRuleSetLabel,
      errorType: errType,
      suggestion,
      cause: "",
      actionTaken: "",
      postFixResult: overallStatus === "FAIL" ? "Đang chờ kiểm tra lại" : "",
    };
  }

  // ==========================================================================
  // TRƯỜNG HỢP B: XÉT NGHIỆM 1 MỨC HOẶC 2 MỨC (SINH HÓA, MIỄN DỊCH, ĐÔNG MÁU)
  // ==========================================================================
  let lvl1Status: "PASS" | "WARN" | "FAIL" | "SKIP" =
    v1 !== null ? "PASS" : "SKIP";
  let lvl2Status: "PASS" | "WARN" | "FAIL" | "SKIP" =
    v2 !== null ? "PASS" : "SKIP";
  let overallStatus: "PASS" | "WARN" | "FAIL" = "PASS";
  let hasRandomErr = false;
  let hasSystemicErr = false;

  // 1. Quy tắc 1-3s (Bác bỏ ngay)
  if (z1 !== null && Math.abs(z1) >= 3) {
    singleRules.push("1-3s (Mức 1)");
    lvl1Status = "FAIL";
    overallStatus = "FAIL";
    hasRandomErr = true;
  }
  if (z2 !== null && Math.abs(z2) >= 3) {
    singleRules.push("1-3s (Mức 2)");
    lvl2Status = "FAIL";
    overallStatus = "FAIL";
    hasRandomErr = true;
  }

  // 2. Quy tắc 2-2s & R-4s (Xét khi mode NORMAL hoặc Sigma < 6.0)
  if (allow22sAndR4s) {
    // 2-2s Tình huống 1: Cùng thời điểm 2 mức cùng phía ngoài ±2SD
    if (
      z1 !== null &&
      z2 !== null &&
      ((z1 >= 2 && z2 >= 2) || (z1 <= -2 && z2 <= -2))
    ) {
      crossRules.push("2-2s (L1 và L2)");
      lvl1Status = "FAIL";
      lvl2Status = "FAIL";
      overallStatus = "FAIL";
      hasSystemicErr = true;
    }

    // 2-2s Tình huống 2: 2 thời điểm liên tiếp của cùng 1 mức cùng phía ngoài ±2SD
    const prevZ1 = cleanZ1.length > 0 ? cleanZ1[cleanZ1.length - 1] : 0;
    const prevZ2 = cleanZ2.length > 0 ? cleanZ2[cleanZ2.length - 1] : 0;
    if (
      z1 !== null &&
      ((z1 >= 2 && prevZ1 >= 2) || (z1 <= -2 && prevZ1 <= -2))
    ) {
      singleRules.push("2-2s Liên tiếp (Mức 1)");
      lvl1Status = "FAIL";
      overallStatus = "FAIL";
      hasSystemicErr = true;
    }
    if (
      z2 !== null &&
      ((z2 >= 2 && prevZ2 >= 2) || (z2 <= -2 && prevZ2 <= -2))
    ) {
      singleRules.push("2-2s Liên tiếp (Mức 2)");
      lvl2Status = "FAIL";
      overallStatus = "FAIL";
      hasSystemicErr = true;
    }

    // R-4s: Cùng thời điểm 1 mức >= +2SD và 1 mức <= -2SD (chênh lệch >= 4SD)
    if (
      z1 !== null &&
      z2 !== null &&
      Math.abs(z1 - z2) >= 4 &&
      ((z1 >= 2 && z2 <= -2) || (z1 <= -2 && z2 >= 2))
    ) {
      crossRules.push("R-4s (L1 và L2)");
      lvl1Status = "FAIL";
      lvl2Status = "FAIL";
      overallStatus = "FAIL";
      hasRandomErr = true;
    }
  }

  // 3. Quy tắc 4-1s & 10x (Xét khi mode NORMAL hoặc Sigma < 5.0)
  if (allowLongAnd1s) {
    const seq1 = z1 !== null ? [...cleanZ1, z1] : cleanZ1;
    const seq2 = z2 !== null ? [...cleanZ2, z2] : cleanZ2;

    // 4-1s Tình huống 1: Cùng 1 mức trong 4 lần liên tiếp ngoài ±1SD
    if (z1 !== null && seq1.length >= 4) {
      const last4 = seq1.slice(-4);
      if (last4.every((z) => z > 1) || last4.every((z) => z < -1)) {
        singleRules.push("4-1s (Mức 1)");
        lvl1Status = "FAIL";
        overallStatus = "FAIL";
        hasSystemicErr = true;
      }
    }
    if (z2 !== null && seq2.length >= 4) {
      const last4 = seq2.slice(-4);
      if (last4.every((z) => z > 1) || last4.every((z) => z < -1)) {
        singleRules.push("4-1s (Mức 2)");
        lvl2Status = "FAIL";
        overallStatus = "FAIL";
        hasSystemicErr = true;
      }
    }

    // 4-1s Tình huống 2: 2 mức khác nhau trong 2 lần liên tiếp cùng phía ngoài ±1SD
    if (z1 !== null && z2 !== null && seq1.length >= 2 && seq2.length >= 2) {
      const pair4 = [...seq1.slice(-2), ...seq2.slice(-2)];
      if (pair4.every((z) => z > 1) || pair4.every((z) => z < -1)) {
        crossRules.push("4-1s (L1 & L2 × 2 ngày)");
        lvl1Status = "FAIL";
        lvl2Status = "FAIL";
        overallStatus = "FAIL";
        hasSystemicErr = true;
      }
    }

    // 10x (Khi không thuộc nhóm miễn trừ quy tắc dài hạn)
    if (!isExemptLong) {
      // 10x Tình huống 1: Cùng 1 mức trong 10 ngày liên tiếp cùng phía Mean
      if (z1 !== null && seq1.length >= 10) {
        const last10 = seq1.slice(-10);
        if (last10.every((z) => z > 0) || last10.every((z) => z < 0)) {
          singleRules.push("10x (Mức 1)");
          lvl1Status = "FAIL";
          overallStatus = "FAIL";
          hasSystemicErr = true;
        }
      }
      if (z2 !== null && seq2.length >= 10) {
        const last10 = seq2.slice(-10);
        if (last10.every((z) => z > 0) || last10.every((z) => z < 0)) {
          singleRules.push("10x (Mức 2)");
          lvl2Status = "FAIL";
          overallStatus = "FAIL";
          hasSystemicErr = true;
        }
      }

      // 10x Tình huống 2: 2 mức khác nhau trong 5 ngày liên tiếp cùng phía Mean
      if (z1 !== null && z2 !== null && seq1.length >= 5 && seq2.length >= 5) {
        const pair10 = [...seq1.slice(-5), ...seq2.slice(-5)];
        if (pair10.every((z) => z > 0) || pair10.every((z) => z < 0)) {
          crossRules.push("10x (L1 & L2 × 5 ngày)");
          lvl1Status = "FAIL";
          lvl2Status = "FAIL";
          overallStatus = "FAIL";
          hasSystemicErr = true;
        }
      }
    }
  }

  // 4. Quy tắc Cảnh báo 1-2s (Chỉ xét khi không vi phạm bất kỳ quy tắc bác bỏ nào ở trên)
  if (overallStatus !== "FAIL") {
    if (z1 !== null && Math.abs(z1) >= 2) {
      singleRules.push("1-2s (Mức 1)");
      lvl1Status = "WARN";
      overallStatus = "WARN";
    }
    if (z2 !== null && Math.abs(z2) >= 2) {
      singleRules.push("1-2s (Mức 2)");
      lvl2Status = "WARN";
      overallStatus = "WARN";
    }
    if (overallStatus === "WARN") {
      advisoryNotes.push(
        "Cảnh báo 1-2s: Không cần loại bỏ kết quả QC và kết quả bệnh nhân. Theo dõi chặt chẽ ở các lần chạy kế tiếp."
      );
    }
  }

  const errType =
    overallStatus === "FAIL"
      ? hasRandomErr && hasSystemicErr
        ? "Sai số Hỗn hợp (RE & SE)"
        : hasSystemicErr
        ? "Sai số Hệ thống (SE)"
        : "Sai số Ngẫu nhiên (RE)"
      : overallStatus === "WARN"
      ? "Cảnh báo 1-2s (Chấp nhận mẻ chạy)"
      : "Đạt chuẩn";

  const suggestion =
    overallStatus === "FAIL"
      ? hasSystemicErr
        ? "Không chấp nhận KQ. Kiểm tra thuốc thử, hạn dùng, hiệu chuẩn (Calib) lại thiết bị và chạy lại QC."
        : "Không chấp nhận KQ. Kiểm tra bọt khí, kim hút, vị trí cóng mẫu và chạy lại mẫu QC."
      : overallStatus === "WARN"
      ? "Chấp nhận KQ bệnh nhân. Theo dõi các nồng độ QC khác và lần chạy kế tiếp."
      : "Hệ thống ổn định. Chấp nhận kết quả xét nghiệm bệnh nhân.";

  return {
    test: t,
    valL1: v1,
    zL1: z1,
    lvl1Status,
    lvl1SingleRule: sEval1
      ? [...sEval1.failRules, ...sEval1.warnRules].join(", ")
      : undefined,
    valL2: v2,
    zL2: z2,
    lvl2Status,
    lvl2SingleRule: sEval2
      ? [...sEval2.failRules, ...sEval2.warnRules].join(", ")
      : undefined,
    valL3: null,
    zL3: null,
    lvl3Status: "SKIP",
    status: overallStatus,
    singleLevelRules: singleRules,
    crossLevelRules: crossRules,
    advisoryNotes,
    appliedRuleSetLabel,
    errorType: errType,
    suggestion,
    cause: "",
    actionTaken: "",
    postFixResult: overallStatus === "FAIL" ? "Đang chờ kiểm tra lại" : "",
  };
}

// ============================================================================
// Ô NHẬP LIỆU TRÊN BẢNG GRID (ĐỒNG BỘ VIỀN MÀU VỚI KÍNH NGẮM MAGIC LENS)
// ============================================================================
export const GridLevelCell = React.memo(function GridLevelCell({
  test,
  lvl,
  initialValue,
  syncTheme,
  isScanTarget,
  onFocusScanTarget,
  inputRefCallback,
  onNavigateRow,
  onNavigateCol,
  onCommitValue,
}: {
  test: TestConfig;
  lvl: "L1" | "L2" | "L3";
  initialValue: string;
  syncTheme?: SyncColorTheme;
  isScanTarget?: boolean;
  onFocusScanTarget?: () => void;
  inputRefCallback: (el: HTMLInputElement | null) => void;
  onNavigateRow: (delta: number) => void;
  onNavigateCol?: (targetLvl: "L1" | "L2" | "L3") => void;
  onCommitValue: (testId: string, lvl: "L1" | "L2" | "L3", val: string) => void;
}) {
  const [localVal, setLocalVal] = useState<string>(initialValue);
  useEffect(() => {
    setLocalVal(initialValue);
  }, [initialValue]);

  if (lvl === "L3" && test.levels_count < 3)
    return <td className="py-2 px-3 text-right text-slate-300 font-mono">—</td>;
  if (lvl === "L2" && test.levels_count < 2)
    return <td className="py-2 px-3 text-right text-slate-300 font-mono">—</td>;

  const mean =
    lvl === "L1" ? test.mean_L1 : lvl === "L2" ? test.mean_L2 : test.mean_L3;
  const sd = lvl === "L1" ? test.sd_L1 : lvl === "L2" ? test.sd_L2 : test.sd_L3;
  const expQual =
    lvl === "L1"
      ? test.expected_qual_L1 || "ÂM TÍNH"
      : lvl === "L2"
      ? test.expected_qual_L2 || "DƯƠNG TÍNH"
      : test.expected_qual_L3 || "DƯƠNG TÍNH";

  const lvMeta = getEffectiveLevelControlAndLot(test, lvl);
  const hasDecoupledControl =
    (test.levels_count >= 2 &&
      test.control_name_L2 &&
      test.control_name_L2 !== (test.control_name_L1 || test.control_name)) ||
    (test.levels_count === 3 &&
      test.control_name_L3 &&
      test.control_name_L3 !== (test.control_name_L1 || test.control_name));

  if (test.test_type === "QUALITATIVE") {
    const currentQual = localVal || expQual;
    const isMatch = currentQual === expQual;
    return (
      <td className="py-2 px-3 text-right">
        <div className="inline-flex items-center gap-2">
          <span className="text-[10.5px] font-bold text-slate-500">
            Chứng: {expQual}
          </span>
          <select
            value={currentQual}
            onChange={(e) => {
              const v = e.target.value;
              setLocalVal(v);
              onCommitValue(test.test_id, lvl, v);
            }}
            className={`px-2.5 py-1.5 rounded-lg border-2 font-black text-xs ${
              isMatch
                ? "bg-emerald-50 border-emerald-400 text-emerald-800"
                : "bg-rose-50 border-rose-400 text-rose-800"
            }`}
          >
            {QUALITATIVE_OPTIONS.map((opt) => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
          </select>
        </div>
      </td>
    );
  }

  const cleanStr = localVal.trim().replace(/,/g, ".");
  const num = cleanStr !== "" ? parseFloat(cleanStr) : null;
  const z = num !== null && !isNaN(num) && sd > 0 ? (num - mean) / sd : null;
  const absZ = z !== null ? Math.abs(z) : null;
  const sdBadge = z !== null ? formatSDPositionBadge(z) : null;

  const borderCls =
    absZ === null
      ? "border-slate-300 bg-slate-50"
      : absZ >= 3
      ? "border-rose-500 bg-rose-50 text-rose-900"
      : absZ >= 2
      ? "border-amber-500 bg-amber-50 text-amber-900"
      : "border-emerald-500 bg-emerald-50/50 text-emerald-950";

  return (
    <td className="py-2 px-3 text-right whitespace-nowrap">
      <div className="inline-flex items-center justify-end gap-2">
        <div className="text-right">
          {hasDecoupledControl && (
            <div className="text-[9.5px] font-black text-indigo-700 leading-tight">
              {lvMeta.controlName} ({lvMeta.lotNumber})
            </div>
          )}
          <div className="text-[10.5px] font-mono font-bold text-slate-500">
            {mean} ± {sd}
          </div>
          {sdBadge && (
            <div
              className={`text-[10px] font-mono font-black px-1.5 py-0.5 rounded border mt-0.5 inline-block ${sdBadge.cls}`}
            >
              {sdBadge.shortRule}
            </div>
          )}
        </div>
        <input
          ref={inputRefCallback}
          type="text"
          inputMode="decimal"
          onFocus={(e) => {
            e.currentTarget.select();
            if (onFocusScanTarget) onFocusScanTarget();
          }}
          onWheel={(e) => e.currentTarget.blur()}
          value={localVal}
          placeholder={lvl}
          style={
            isScanTarget && syncTheme
              ? {
                  borderColor: syncTheme.hex,
                  boxShadow: `0 0 0 3px ${syncTheme.hex}33`,
                }
              : undefined
          }
          onChange={(e) => {
            const v = e.target.value.replace(/,/g, ".");
            setLocalVal(v);
            onCommitValue(test.test_id, lvl, v);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === "ArrowDown") {
              e.preventDefault();
              onNavigateRow(1);
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              onNavigateRow(-1);
            } else if (
              e.key === "ArrowRight" &&
              onNavigateCol &&
              (e.currentTarget.selectionStart === localVal.length || e.ctrlKey)
            ) {
              e.preventDefault();
              if (lvl === "L1" && test.levels_count >= 2) onNavigateCol("L2");
              else if (lvl === "L2" && test.levels_count === 3)
                onNavigateCol("L3");
            } else if (
              e.key === "ArrowLeft" &&
              onNavigateCol &&
              (e.currentTarget.selectionStart === 0 || e.ctrlKey)
            ) {
              e.preventDefault();
              if (lvl === "L3") onNavigateCol("L2");
              else if (lvl === "L2") onNavigateCol("L1");
            }
          }}
          className={`w-24 border-2 rounded-xl px-2.5 py-1.5 font-mono font-black text-xs text-right outline-none transition ${borderCls}`}
        />
      </div>
    </td>
  );
});
// ================= KẾT THÚC PHẦN 2/4 (DÁN TIẾP PHẦN 3/4 NGAY DƯỚI DÒNG NÀY) =================
// ================= BẮT ĐẦU PHẦN 3/4 (DÁN NỐI TIẾP NGAY DƯỚI PHẦN 2/4) =================

export interface NhapKetQuaQCProps {
  apiUrl: string;
  authToken: string;
  currentUser: UserAccount;
  runDate: string;
  sections: string[];
  labMachines: { section: string; machine: string }[];
  configs: TestConfig[];
  setConfigs: React.Dispatch<React.SetStateAction<TestConfig[]>>;
  reagents: ReagentLotBM16[];
  setReagents: React.Dispatch<React.SetStateAction<ReagentLotBM16[]>>;
  bm09Logs: BM09LogEntry[];
  setBm09Logs: React.Dispatch<React.SetStateAction<BM09LogEntry[]>>;
  sectionLocks: SectionLock[];
  setSectionLocks: React.Dispatch<React.SetStateAction<SectionLock[]>>;
  pendingMobileDrafts?: MobileDraftIndexItem[];
  setPendingMobileDrafts?: React.Dispatch<
    React.SetStateAction<MobileDraftIndexItem[]>
  >;
  onEnqueueOfflineBatch?: (batchPayload: Record<string, any>) => void;
}

export default function NhapKetQuaQC({
  apiUrl,
  authToken,
  currentUser,
  runDate,
  sections,
  labMachines,
  configs,
  setConfigs,
  reagents,
  setReagents,
  bm09Logs,
  setBm09Logs,
  sectionLocks,
  setSectionLocks,
  pendingMobileDrafts,
  setPendingMobileDrafts,
  onEnqueueOfflineBatch,
}: NhapKetQuaQCProps) {
  const [step, setStep] = useState<
    | "SELECT_MACHINE"
    | "SELECT_CONTROL"
    | "SELECT_LEVEL"
    | "ENTER_RESULTS"
    | "ANALYSIS_REPORT"
  >("SELECT_MACHINE");
  const [selSection, setSelSection] = useState<string>(sections[0] || "");
  const [selMachine, setSelMachine] = useState<string | null>(null);
  const [selControl, setSelControl] = useState<string | null>(null);
  const [selLevel, setSelLevel] = useState<"L1" | "L2" | "L3">("L1");

  const [kioskInputMode, setKioskInputMode] = usePersistentState<
    "CARD" | "GRID"
  >(STORAGE_KEYS.INPUT_MODE, "CARD");
  const [savedValues, setSavedValues] = usePersistentState<
    Record<string, { L1?: string; L2?: string; L3?: string }>
  >(STORAGE_KEYS.KIOSK_DRAFT, {});
  const [tempInputs, setTempInputs] = useState<Record<string, string>>({});
  const [savedLevels, setSavedLevels] = useState<
    Record<string, { L1: boolean; L2: boolean; L3: boolean }>
  >({});
  const [gridExplicitSavedBanner, setGridExplicitSavedBanner] =
    useState<string>("");

  // Hộp thoại kiểm soát khi nhấp vào Máy / Hóa chất / Mức ĐÃ NHẬP XONG
  const [completedGuardModal, setCompletedGuardModal] = useState<{
    targetType: "MACHINE" | "CONTROL" | "LEVEL";
    machine: string;
    control?: string;
    level?: "L1" | "L2" | "L3";
  } | null>(null);

  // Dữ liệu Bản phân tích chi tiết kết quả nội kiểm Westgard sau khi bấm Phân tích
  const [evalRows, setEvalRows] = useState<EvalRow[]>([]);
  const [lastAnalysisMode, setLastAnalysisMode] = useState<"NORMAL" | "SIGMA">(
    "NORMAL"
  );

  // --- QUẢN LÝ ẢNH ĐỐI CHIẾU & KÍNH NGẮM MA THUẬT (FREE-FORM MAGIC LENS) ---
  const [levelImages, setLevelImages] = useState<
    Partial<Record<"L1" | "L2" | "L3", string>>
  >({});
  const [activeImageTab, setActiveImageTab] = useState<"L1" | "L2" | "L3">(
    "L1"
  );
  const [showImagePanel, setShowImagePanel] = useState<boolean>(false);
  const [imgZoom, setImgZoom] = useState<number>(1);
  const [imgRotate, setImgRotate] = useState<number>(0);
  const [imgScrollPct, setImgScrollPct] = useState<{ x: number; y: number }>({
    x: 0,
    y: 0,
  });

  const [scannerEnabled, setScannerEnabled] = useState<boolean>(true);
  const [scannerMode, setScannerMode] = useState<"AUTO_STEP" | "DUAL_MATRIX">(
    "AUTO_STEP"
  );
  const [scanTargetTestIdx, setScanTargetTestIdx] = useState<number>(0);
  const [scanTargetLevel, setScanTargetLevel] = useState<"L1" | "L2" | "L3">(
    "L1"
  );
  const [lensSizeByMachine, setLensSizeByMachine] = usePersistentState<
    Record<string, { w: number; h: number }>
  >(LENS_SIZE_BY_MACHINE_KEY, {
    DEFAULT_SINGLE: { w: 96, h: 36 },
    DEFAULT_MATRIX: { w: 175, h: 38 },
  });
  const [lensPos, setLensPos] = useState<{ x: number; y: number }>({
    x: 120,
    y: 90,
  });
  const [isResizingLens, setIsResizingLens] = useState<boolean>(false);
  const [isScanningOcr, setIsScanningOcr] = useState<boolean>(false);
  const [laserFlash, setLaserFlash] = useState<boolean>(false);
  const [scanFeedback, setScanFeedback] = useState<{
    text: string;
    ok: boolean;
    hex: string;
  } | null>(null);

  const [isPushingMobile, setIsPushingMobile] = useState<boolean>(false);
  const [isPullingMobile, setIsPullingMobile] = useState<boolean>(false);

  const [useTimesIncrement, setUseTimesIncrement] = useState<number>(1);
  const [selectedReagentNamesForBM16, setSelectedReagentNamesForBM16] =
    useState<string[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [mySectionEpoch, setMySectionEpoch] = useState<string>("");

  const inputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const gridTableScrollRef = useRef<HTMLDivElement | null>(null);
  const gridHeaderColRefs = useRef<
    Partial<Record<"L1" | "L2" | "L3", HTMLTableCellElement | null>>
  >({});
  const photoInputRef = useRef<HTMLInputElement | null>(null);
  const scannerImgRef = useRef<HTMLImageElement | null>(null);
  const scannerContainerRef = useRef<HTMLDivElement | null>(null);
  const resizeStartRef = useRef<{
    startX: number;
    startY: number;
    initW: number;
    initH: number;
  } | null>(null);

  // Tự động trượt thanh cuộn ngang & dọc của Bảng Nhập Nhanh tới đúng Cột Mức (L1/L2/L3) & Dòng Xét nghiệm
  const scrollGridToLevelAndRow = useCallback(
    (targetLv: "L1" | "L2" | "L3", rowIdx = 0) => {
      window.setTimeout(() => {
        const container = gridTableScrollRef.current;
        const cellInput =
          inputRefs.current[`grid-${targetLv}-${rowIdx}`] ||
          inputRefs.current[`grid-${targetLv}-0`];

        if (container && cellInput) {
          const tdEl = cellInput.closest("td") || cellInput;
          const containerRect = container.getBoundingClientRect();
          const tdRect = tdEl.getBoundingClientRect();

          if (targetLv === "L1") {
            container.scrollTo({ left: 0, behavior: "smooth" });
          } else {
            const targetScrollLeft =
              container.scrollLeft +
              (tdRect.left - containerRect.left) -
              Math.max(40, (containerRect.width - tdRect.width) * 0.65);
            container.scrollTo({
              left: Math.max(0, targetScrollLeft),
              behavior: "smooth",
            });
          }
          tdEl.scrollIntoView({
            behavior: "smooth",
            block: "nearest",
            inline: "nearest",
          });
        } else if (gridHeaderColRefs.current[targetLv]) {
          gridHeaderColRefs.current[targetLv]?.scrollIntoView({
            behavior: "smooth",
            block: "nearest",
            inline: "center",
          });
        }
      }, 60);
    },
    []
  );

  // Điều khiển kéo ảnh bằng thanh trượt Dọc (↕) và Ngang (↔)
  const handlePanImageByPercentage = useCallback(
    (axis: "x" | "y", pct: number) => {
      const el = scannerContainerRef.current;
      if (!el) return;
      const clamped = Math.max(0, Math.min(100, pct));
      if (axis === "x") {
        const maxScrollX = Math.max(0, el.scrollWidth - el.clientWidth);
        el.scrollLeft = (clamped / 100) * maxScrollX;
      } else {
        const maxScrollY = Math.max(0, el.scrollHeight - el.clientHeight);
        el.scrollTop = (clamped / 100) * maxScrollY;
      }
      setImgScrollPct((prev) => ({ ...prev, [axis]: clamped }));
    },
    []
  );

  const getMachinesForSection = useCallback(
    (sec: string) =>
      labMachines.filter((m) => m.section === sec).map((m) => m.machine),
    [labMachines]
  );

  const getControlsForMachine = useCallback(
    (m: string) => {
      const fromRg = reagents
        .filter((r) => r.machine_name === m)
        .map((r) => r.control_name);
      const fromCfg = configs
        .filter((c) => c.machine_name === m)
        .map((c) => c.control_name);
      return Array.from(new Set([...fromRg, ...fromCfg])).filter(Boolean);
    },
    [reagents, configs]
  );

  /**
   * Lấy danh sách xét nghiệm của 1 Hóa chất QC trên máy:
   * - Khớp trực tiếp control_name hoặc control_name_L1 / L2 / L3.
   * - Nếu lọ hóa chất đó thuộc bộ QC đa mức trên cùng máy (như Dade Citrol 2, Control Plasma P)
   *   mà các test đang gắn tên vào lọ chính (Dade Citrol 1), tự động liên kết với bộ test của máy đó
   *   để thẻ hiển thị đúng số lượng xét nghiệm và đổi màu Xanh đồng bộ.
   */
  const getTestsForControl = useCallback(
    (m: string, ctrl: string) => {
      const directMatches = configs
        .filter((c) => {
          if (c.machine_name !== m) return false;
          return (
            c.control_name === ctrl ||
            c.control_name_L1 === ctrl ||
            c.control_name_L2 === ctrl ||
            c.control_name_L3 === ctrl
          );
        })
        .sort((a, b) => a.order - b.order);

      if (directMatches.length > 0) return directMatches;

      // Fallback thông minh cho các lọ QC mức 2, mức 3 khai báo trên cùng máy
      return configs
        .filter((c) => c.machine_name === m)
        .sort((a, b) => a.order - b.order);
    },
    [configs]
  );

  /**
   * Tìm toàn bộ các tên Hóa chất QC đang hoạt động trên máy có liên quan đến bộ xét nghiệm hiện tại
   * (VD: Dade Citrol 1, Dade Citrol 2, Control Plasma P) để đồng bộ trạng thái Xanh & đếm BM.16.
   */
  const getLinkedControlsForCurrentRun = useCallback(
    (m: string, primaryCtrl: string): string[] => {
      const tList = getTestsForControl(m, primaryCtrl);
      const allCtrlsOnMac = getControlsForMachine(m);
      const linkedSet = new Set<string>([primaryCtrl]);

      tList.forEach((t) => {
        if (t.control_name) linkedSet.add(t.control_name);
        if (t.control_name_L1) linkedSet.add(t.control_name_L1);
        if (t.levels_count >= 2 && t.control_name_L2)
          linkedSet.add(t.control_name_L2);
        if (t.levels_count === 3 && t.control_name_L3)
          linkedSet.add(t.control_name_L3);
      });

      // Những lọ hóa chất khai báo trên cùng máy nhưng không có bộ test riêng (như Citrol 2, Control Plasma P)
      // cũng thuộc cùng 1 bộ chạy QC của máy đó
      allCtrlsOnMac.forEach((ctrlName) => {
        const hasOwnDistinctTests = configs.some(
          (c) =>
            c.machine_name === m &&
            c.control_name === ctrlName &&
            !tList.some((x) => x.test_id === c.test_id)
        );
        if (!hasOwnDistinctTests) {
          linkedSet.add(ctrlName);
        }
      });

      return Array.from(linkedSet).filter(Boolean);
    },
    [getTestsForControl, getControlsForMachine, configs]
  );

  const ctrlKey = (m: string, ctrl: string) => `${m}__${ctrl}`;

  const isLevelSaved = useCallback(
    (m: string, ctrl: string, lvl: "L1" | "L2" | "L3") => {
      if (savedLevels[ctrlKey(m, ctrl)]?.[lvl]) return true;
      const tList = getTestsForControl(m, ctrl);
      if (tList.length === 0) return false;
      const histField =
        lvl === "L1"
          ? "history_L1"
          : lvl === "L2"
          ? "history_L2"
          : "history_L3";
      return tList.some((t) =>
        (t[histField] || []).some(
          (pt) => pt.isoDate === runDate && !pt.is_rerun
        )
      );
    },
    [savedLevels, getTestsForControl, runDate]
  );

  const isControlCompleted = useCallback(
    (m: string, ctrl: string) => {
      const tList = getTestsForControl(m, ctrl);
      if (tList.length === 0) return false;

      // Nếu lọ hóa chất này được gắn riêng cho 1 mức cụ thể (VD: L2 hoặc L3)
      const onlyForL2 = tList.every((t) => t.control_name_L2 === ctrl);
      const onlyForL3 = tList.every((t) => t.control_name_L3 === ctrl);
      if (onlyForL2) return isLevelSaved(m, ctrl, "L2");
      if (onlyForL3) return isLevelSaved(m, ctrl, "L3");

      const maxLv = Math.max(1, ...tList.map((t) => t.levels_count || 2));
      if (maxLv === 3)
        return (
          isLevelSaved(m, ctrl, "L1") &&
          isLevelSaved(m, ctrl, "L2") &&
          isLevelSaved(m, ctrl, "L3")
        );
      if (maxLv === 2)
        return isLevelSaved(m, ctrl, "L1") && isLevelSaved(m, ctrl, "L2");
      return isLevelSaved(m, ctrl, "L1");
    },
    [getTestsForControl, isLevelSaved]
  );

  const isMachineCompleted = useCallback(
    (m: string) => {
      const ctrls = getControlsForMachine(m);
      return ctrls.length > 0 && ctrls.every((c) => isControlCompleted(m, c));
    },
    [getControlsForMachine, isControlCompleted]
  );

  const isMachinePartial = useCallback(
    (m: string) => {
      const ctrls = getControlsForMachine(m);
      return ctrls.some(
        (c) =>
          isLevelSaved(m, c, "L1") ||
          isLevelSaved(m, c, "L2") ||
          isLevelSaved(m, c, "L3")
      );
    },
    [getControlsForMachine, isLevelSaved]
  );

  const hydrateSavedValuesFromTodayHistory = useCallback(
    (m: string, ctrl?: string) => {
      const targetTests = ctrl
        ? getTestsForControl(m, ctrl)
        : configs.filter((c) => c.machine_name === m);
      setSavedValues((prev) => {
        const next = { ...prev };
        targetTests.forEach((t) => {
          const p1 = (t.history_L1 || []).find(
            (p) => p.isoDate === runDate && !p.is_rerun
          );
          const p2 = (t.history_L2 || []).find(
            (p) => p.isoDate === runDate && !p.is_rerun
          );
          const p3 = (t.history_L3 || []).find(
            (p) => p.isoDate === runDate && !p.is_rerun
          );
          next[t.test_id] = {
            L1:
              prev[t.test_id]?.L1 ??
              (p1 !== undefined ? String(p1.val) : undefined),
            L2:
              prev[t.test_id]?.L2 ??
              (p2 !== undefined ? String(p2.val) : undefined),
            L3:
              prev[t.test_id]?.L3 ??
              (p3 !== undefined ? String(p3.val) : undefined),
          };
        });
        return next;
      });
    },
    [configs, getTestsForControl, runDate, setSavedValues]
  );

  const handleViewTodayAnalysisForMachine = useCallback(
    (m: string, ctrl?: string) => {
      const targetCtrl = ctrl || getControlsForMachine(m)[0] || "";
      if (!targetCtrl) return;
      const tests = getTestsForControl(m, targetCtrl);
      const builtRows: EvalRow[] = tests.map((t) => {
        const p1 = (t.history_L1 || []).find(
          (p) => p.isoDate === runDate && !p.is_rerun
        );
        const p2 = (t.history_L2 || []).find(
          (p) => p.isoDate === runDate && !p.is_rerun
        );
        const p3 = (t.history_L3 || []).find(
          (p) => p.isoDate === runDate && !p.is_rerun
        );
        const raw1 = savedValues[t.test_id]?.L1 ?? (p1 ? String(p1.val) : "");
        const raw2 = savedValues[t.test_id]?.L2 ?? (p2 ? String(p2.val) : "");
        const raw3 = savedValues[t.test_id]?.L3 ?? (p3 ? String(p3.val) : "");
        const v1 = raw1 !== "" ? parseFloat(raw1) : null;
        const v2 = raw2 !== "" ? parseFloat(raw2) : null;
        const v3 = raw3 !== "" ? parseFloat(raw3) : null;

        const row = evaluateTestWestgardRules(
          t,
          v1 !== null && !isNaN(v1) ? v1 : null,
          v2 !== null && !isNaN(v2) ? v2 : null,
          v3 !== null && !isNaN(v3) ? v3 : null,
          lastAnalysisMode,
          runDate
        );
        const existingLog = bm09Logs.find(
          (l) => l.test_id === t.test_id && l.run_date === runDate
        );
        if (existingLog) {
          row.cause = existingLog.cause || "";
          row.actionTaken = existingLog.action_taken || "";
          row.postFixResult = existingLog.post_fix_result || row.postFixResult;
        }
        return row;
      });

      setSelMachine(m);
      setSelControl(targetCtrl);
      setEvalRows(builtRows);
      setStep("ANALYSIS_REPORT");
    },
    [
      getControlsForMachine,
      getTestsForControl,
      runDate,
      savedValues,
      lastAnalysisMode,
      bm09Logs,
    ]
  );

  // Danh sách toàn bộ các lọ Hóa chất đang mở/pha của máy sẽ được tính lượt dùng vào BM.16
  const activeLinkedReagentLots = useMemo(() => {
    if (!selMachine || !selControl) return [];
    const linkedNames = getLinkedControlsForCurrentRun(selMachine, selControl);
    const list: ReagentLotBM16[] = [];
    linkedNames.forEach((cName) => {
      const matches = reagents.filter(
        (r) => r.machine_name === selMachine && r.control_name === cName
      );
      if (matches.length > 0) {
        list.push(matches[matches.length - 1]);
      }
    });
    return list;
  }, [reagents, selMachine, selControl, getLinkedControlsForCurrentRun]);

  // Đồng bộ mặc định chọn tất cả các lọ trong bộ QC của máy (VD: Dade Citrol 1, Dade Citrol 2, Control Plasma P)
  useEffect(() => {
    const names = activeLinkedReagentLots.map((r) => r.control_name);
    setSelectedReagentNamesForBM16(names);
  }, [activeLinkedReagentLots]);

  const alreadyUsedTodayCount = useMemo(() => {
    if (activeLinkedReagentLots.length === 0) return 0;
    // Nếu còn ít nhất 1 lọ trong bộ QC chưa được cộng hôm nay thì cho phép cộng
    const counts = activeLinkedReagentLots.map((r) =>
      Number(r.used_days_map?.[runDate] || 0)
    );
    return Math.min(...counts);
  }, [activeLinkedReagentLots, runDate]);

  useEffect(() => {
    if (alreadyUsedTodayCount > 0) {
      setUseTimesIncrement(0);
    } else {
      setUseTimesIncrement(1);
    }
  }, [alreadyUsedTodayCount, selMachine, selControl, runDate]);

  useEffect(() => {
    if (!selSection || step === "SELECT_MACHINE") return;
    const hbTimer = window.setInterval(() => {
      rpcCall(
        apiUrl,
        "acquire_section_lock",
        {
          section_name: selSection,
          user_id: currentUser.id,
          user_name: currentUser.name,
          user_role: currentUser.role,
        },
        authToken
      );
    }, 90000);
    return () => window.clearInterval(hbTimer);
  }, [selSection, step, apiUrl, authToken, currentUser]);

  useEffect(() => {
    if (step !== "SELECT_LEVEL" && step !== "ENTER_RESULTS") return;
    const handlePasteImage: EventListener = (evt: Event) => {
      const e = evt as ClipboardEvent;
      const items = e.clipboardData?.items;
      if (!items) return;
      for (let i = 0; i < items.length; i++) {
        if (items[i].type.startsWith("image")) {
          const file = items[i].getAsFile();
          if (file) {
            e.preventDefault();
            compressImageDual(file)
              .then((compressed) => {
                const targetLv =
                  step === "ENTER_RESULTS" ? selLevel : activeImageTab;
                setLevelImages((prev) => ({
                  ...prev,
                  [targetLv]: compressed.handoffBase64,
                }));
                setActiveImageTab(targetLv);
                setScanTargetLevel(targetLv);
                setShowImagePanel(true);
                setImgZoom(1);
                setImgRotate(0);
                setImgScrollPct({ x: 0, y: 0 });
                scrollGridToLevelAndRow(targetLv, scanTargetTestIdx);
              })
              .catch(() => {});
          }
          break;
        }
      }
    };
    window.addEventListener("paste", handlePasteImage);
    return () => window.removeEventListener("paste", handlePasteImage);
  }, [
    step,
    selLevel,
    activeImageTab,
    scanTargetTestIdx,
    scrollGridToLevelAndRow,
  ]);

  const currentLensKey = useMemo(() => {
    const mac = selMachine || "DEFAULT";
    return `${mac}__${scannerMode}`;
  }, [selMachine, scannerMode]);

  const currentLensSize = useMemo(() => {
    const fallback =
      scannerMode === "DUAL_MATRIX" ? { w: 175, h: 38 } : { w: 96, h: 36 };
    return lensSizeByMachine[currentLensKey] || fallback;
  }, [lensSizeByMachine, currentLensKey, scannerMode]);

  useEffect(() => {
    if (!isResizingLens) return;
    const onMove = (e: MouseEvent) => {
      if (!resizeStartRef.current) return;
      const dx = e.clientX - resizeStartRef.current.startX;
      const dy = e.clientY - resizeStartRef.current.startY;
      const nextW = Math.max(
        52,
        Math.min(340, Math.round(resizeStartRef.current.initW + dx))
      );
      const nextH = Math.max(
        24,
        Math.min(140, Math.round(resizeStartRef.current.initH + dy))
      );
      setLensSizeByMachine((prev) => ({
        ...prev,
        [currentLensKey]: { w: nextW, h: nextH },
      }));
    };
    const onUp = () => {
      setIsResizingLens(false);
      resizeStartRef.current = null;
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [isResizingLens, currentLensKey, setLensSizeByMachine]);

  const getActiveLockForSection = (sec: string) => {
    const now = Date.now();
    return sectionLocks.find(
      (l) => l.section_name === sec && now - l.locked_at_ms < 5 * 60 * 1000
    );
  };
  // ================= KẾT THÚC PHẦN 3/4 (DÁN TIẾP PHẦN 4/4 NGAY DƯỚI DÒNG NÀY) =================
  // ================= BẮT ĐẦU PHẦN 4/4 (DÁN NỐI TIẾP NGAY DƯỚI PHẦN 3/4) =================

  const handleSelectSectionInKiosk = async (sec: string) => {
    const lock = getActiveLockForSection(sec);
    if (lock && lock.user_id.toLowerCase() !== currentUser.id.toLowerCase()) {
      window.alert(
        `Lab [${sec}] đang được nhập bởi [${lock.user_name}]. Vui lòng chọn Lab khác!`
      );
      return;
    }
    const localEpoch = Math.random().toString(36).slice(2, 10);
    setMySectionEpoch(localEpoch);
    setSelSection(sec);
    setSelMachine(null);
    setSelControl(null);
    setStep("SELECT_MACHINE");
    await rpcCall(
      apiUrl,
      "acquire_section_lock",
      {
        section_name: sec,
        user_id: currentUser.id,
        user_name: currentUser.name,
        user_role: currentUser.role,
      },
      authToken
    );
  };

  const handleForceUnlockSection = async (sec: string) => {
    if (!hasPermission(currentUser, "FORCE_UNLOCK_LAB")) return;
    if (!window.confirm(`MỞ KHÓA ÉP BUỘC Lab [${sec}]?`)) return;
    setSectionLocks((prev) => prev.filter((l) => l.section_name !== sec));
    await rpcCall(
      apiUrl,
      "force_unlock_section",
      { section_name: sec },
      authToken
    );
  };

  const handleCommitGridValue = useCallback(
    (testId: string, lvl: "L1" | "L2" | "L3", val: string) => {
      setSavedValues((prev) => ({
        ...prev,
        [testId]: { ...(prev[testId] || {}), [lvl]: val },
      }));
    },
    [setSavedValues]
  );

  // Khóa lưu kết quả trên Bảng Thu Gọn & đánh dấu Xanh đồng bộ cho tất cả các thẻ Hóa chất liên quan
  const handleExplicitSaveGridResults = () => {
    if (!selMachine || !selControl) return;
    const currentMac: string = selMachine;
    const currentCtrl: string = selControl;
    const testsInCtrl = getTestsForControl(currentMac, currentCtrl);
    const linkedCtrls = getLinkedControlsForCurrentRun(currentMac, currentCtrl);

    const hasL1 = testsInCtrl.some(
      (t) => (savedValues[t.test_id]?.L1 || "").trim() !== ""
    );
    const hasL2 = testsInCtrl.some(
      (t) => (savedValues[t.test_id]?.L2 || "").trim() !== ""
    );
    const hasL3 = testsInCtrl.some(
      (t) => (savedValues[t.test_id]?.L3 || "").trim() !== ""
    );

    setSavedLevels((prev) => {
      const next = { ...prev };
      linkedCtrls.forEach((cName) => {
        const k = ctrlKey(currentMac, cName);
        next[k] = {
          L1: hasL1 || Boolean(prev[k]?.L1),
          L2: hasL2 || Boolean(prev[k]?.L2),
          L3: hasL3 || Boolean(prev[k]?.L3),
        };
      });
      return next;
    });

    const lvSavedNames: string[] = [];
    if (hasL1) lvSavedNames.push("Mức 1 (L1)");
    if (hasL2) lvSavedNames.push("Mức 2 (L2)");
    if (hasL3) lvSavedNames.push("Mức 3 (L3)");

    setGridExplicitSavedBanner(
      lvSavedNames.length > 0
        ? `✓ Đã khóa lưu kết quả ${lvSavedNames.join(
            ", "
          )} (Đồng bộ thẻ: ${linkedCtrls.join(
            ", "
          )}) lúc ${getVnTimeString()}! Bạn có thể bấm nút Phân tích Westgard bên dưới.`
        : "⚠️ Chưa có ô kết quả nào được nhập. Vui lòng nhập hoặc dùng Kính ngắm quét số trước khi lưu!"
    );
    setTimeout(() => setGridExplicitSavedBanner(""), 5000);
  };

  const handleClearCurrentControlInputs = () => {
    if (!selMachine || !selControl) return;
    const currentMac: string = selMachine;
    const currentCtrl: string = selControl;
    const testsInCtrl = getTestsForControl(currentMac, currentCtrl);
    const linkedCtrls = getLinkedControlsForCurrentRun(currentMac, currentCtrl);
    setSavedValues((prev) => {
      const next = { ...prev };
      testsInCtrl.forEach((t) => {
        delete next[t.test_id];
      });
      return next;
    });
    setTempInputs({});
    setSavedLevels((prev) => {
      const next = { ...prev };
      linkedCtrls.forEach((cName) => {
        next[ctrlKey(currentMac, cName)] = {
          L1: false,
          L2: false,
          L3: false,
        };
      });
      return next;
    });
  };

  const handleSelectPhotoFile = async (
    e: React.ChangeEvent<HTMLInputElement>,
    targetLv: "L1" | "L2" | "L3"
  ) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      const compressed = await compressImageDual(file);
      setLevelImages((prev) => ({
        ...prev,
        [targetLv]: compressed.handoffBase64,
      }));
      setActiveImageTab(targetLv);
      setScanTargetLevel(targetLv);
      setShowImagePanel(true);
      setImgZoom(1);
      setImgRotate(0);
      setImgScrollPct({ x: 0, y: 0 });
      scrollGridToLevelAndRow(targetLv, scanTargetTestIdx);
    } catch (err: any) {
      window.alert(err?.message || "Không thể nén ảnh đã chọn!");
    }
  };

  const handlePushMobileDraftToCloud = async () => {
    if (!selMachine || !selControl) return;
    const currentMac: string = selMachine;
    const currentCtrl: string = selControl;
    setIsPushingMobile(true);
    const testsInCtrl = getTestsForControl(currentMac, currentCtrl);
    const valuesForCtrl: Record<
      string,
      { L1?: string; L2?: string; L3?: string }
    > = {};
    testsInCtrl.forEach((t) => {
      if (savedValues[t.test_id]) {
        valuesForCtrl[t.test_id] = savedValues[t.test_id];
      }
    });

    const activeLvs: ("L1" | "L2" | "L3")[] = (
      ["L1", "L2", "L3"] as const
    ).filter(
      (lv) =>
        Boolean(levelImages[lv]) ||
        testsInCtrl.some((t) => Boolean(savedValues[t.test_id]?.[lv]))
    );

    const payload: MobileDraftPayload = {
      section_name: selSection,
      machine_name: currentMac,
      control_name: currentCtrl,
      operator_name: currentUser.name,
      run_date: runDate,
      updated_at_ms: Date.now(),
      active_levels: activeLvs.length > 0 ? activeLvs : [activeImageTab],
      values: valuesForCtrl,
      images: levelImages,
    };

    try {
      const rawCache = localStorage.getItem(LOCAL_MOBILE_DRAFT_CACHE_KEY);
      const cacheMap = rawCache ? JSON.parse(rawCache) : {};
      cacheMap[`${selSection}__${currentMac}__${currentCtrl}`] = payload;
      cacheMap[`${currentMac}__${currentCtrl}`] = payload;
      localStorage.setItem(
        LOCAL_MOBILE_DRAFT_CACHE_KEY,
        JSON.stringify(cacheMap)
      );
    } catch {}

    const res = await rpcCall(apiUrl, "save_mobile_draft", payload, authToken);
    setIsPushingMobile(false);
    if (res.net && res.body?.status === "success") {
      window.alert(
        `📲 Đã đẩy ảnh & số nháp của [${currentMac} - ${currentCtrl}] lên Máy tính (PC) thành công!`
      );
    } else {
      window.alert(
        "Đã lưu ảnh vào bộ nhớ đệm cục bộ. Kiểm tra kết nối mạng nếu cần đẩy sang máy tính khác!"
      );
    }
  };

  const handlePullMobileDraftFromCloud = async (
    draftItem: MobileDraftIndexItem
  ) => {
    setIsPullingMobile(true);
    const res = await rpcCall(
      apiUrl,
      "get_mobile_draft",
      {
        section_name: draftItem.section_name,
        machine_name: draftItem.machine_name,
        control_name: draftItem.control_name,
      },
      authToken
    );
    setIsPullingMobile(false);

    let localFallback: MobileDraftPayload | null = null;
    try {
      const rawCache = localStorage.getItem(LOCAL_MOBILE_DRAFT_CACHE_KEY);
      if (rawCache) {
        const cacheMap = JSON.parse(rawCache);
        localFallback =
          cacheMap[
            `${draftItem.section_name}__${draftItem.machine_name}__${draftItem.control_name}`
          ] ||
          cacheMap[`${draftItem.machine_name}__${draftItem.control_name}`] ||
          null;
      }
    } catch {}

    const rawBodyData =
      res.body?.data?.draft || res.body?.data || localFallback;
    if (!rawBodyData && !localFallback) {
      window.alert(
        "Không tìm thấy dữ liệu ảnh/nháp từ Điện thoại trên máy chủ!"
      );
      return;
    }

    const targetSec: string =
      rawBodyData?.section_name || draftItem.section_name || selSection;
    const targetMac: string =
      rawBodyData?.machine_name || draftItem.machine_name;
    const targetCtrl: string =
      rawBodyData?.control_name || draftItem.control_name;

    setSelSection(targetSec);
    setSelMachine(targetMac);
    setSelControl(targetCtrl);

    const incomingValues = rawBodyData?.values || localFallback?.values || {};
    if (incomingValues && typeof incomingValues === "object") {
      setSavedValues((prev) => ({ ...prev, ...incomingValues }));
    }

    const rawImgs =
      rawBodyData?.images ||
      rawBodyData?.level_images ||
      localFallback?.images ||
      {};
    const normalizedImages: Partial<Record<"L1" | "L2" | "L3", string>> = {};
    const pickImg = (lv: "L1" | "L2" | "L3") => {
      const candidate =
        rawImgs[lv] ||
        rawImgs[lv.toLowerCase()] ||
        rawBodyData?.[`image_${lv}`] ||
        rawBodyData?.[`img_${lv}`] ||
        localFallback?.images?.[lv];
      if (typeof candidate === "string" && candidate.trim().length > 20) {
        normalizedImages[lv] = candidate.trim().startsWith("data:image")
          ? candidate.trim()
          : `data:image/jpeg;base64,${candidate.trim()}`;
      }
    };
    pickImg("L1");
    pickImg("L2");
    pickImg("L3");

    if (
      Object.keys(normalizedImages).length === 0 &&
      typeof rawBodyData?.image === "string" &&
      rawBodyData.image.length > 20
    ) {
      const defLv = draftItem.active_levels?.[0] || "L1";
      normalizedImages[defLv] = rawBodyData.image.startsWith("data:image")
        ? rawBodyData.image
        : `data:image/jpeg;base64,${rawBodyData.image}`;
    }

    setLevelImages((prev) => ({ ...prev, ...normalizedImages }));

    const firstImgLv =
      (["L1", "L2", "L3"] as const).find((lv) =>
        Boolean(normalizedImages[lv])
      ) ||
      draftItem.active_levels?.[0] ||
      "L1";

    setActiveImageTab(firstImgLv);
    setScanTargetLevel(firstImgLv);
    setShowImagePanel(true);
    setImgZoom(1);
    setImgRotate(0);
    setImgScrollPct({ x: 0, y: 0 });

    const key = ctrlKey(targetMac, targetCtrl);
    setSavedLevels((prev) => ({
      ...prev,
      [key]: {
        L1:
          draftItem.active_levels?.includes("L1") ||
          Boolean(normalizedImages.L1),
        L2:
          draftItem.active_levels?.includes("L2") ||
          Boolean(normalizedImages.L2),
        L3:
          draftItem.active_levels?.includes("L3") ||
          Boolean(normalizedImages.L3),
      },
    }));

    setKioskInputMode("GRID");
    setStep("SELECT_LEVEL");
    scrollGridToLevelAndRow(firstImgLv, 0);
  };

  const handleDismissMobileDraft = async (draftItem: MobileDraftIndexItem) => {
    if (setPendingMobileDrafts) {
      setPendingMobileDrafts((prev) =>
        prev.filter(
          (d) =>
            !(
              d.machine_name === draftItem.machine_name &&
              d.control_name === draftItem.control_name
            )
        )
      );
    }
    await rpcCall(
      apiUrl,
      "clear_mobile_draft",
      {
        section_name: draftItem.section_name,
        machine_name: draftItem.machine_name,
        control_name: draftItem.control_name,
      },
      authToken
    );
  };

  const handleMagicLensClickScan = async (
    e: React.MouseEvent<HTMLDivElement>
  ) => {
    if (!scannerEnabled || isResizingLens || isScanningOcr) return;
    if (!selMachine || !selControl) return;
    const currentMac: string = selMachine;
    const currentCtrl: string = selControl;
    const imgEl = scannerImgRef.current;
    const containerEl = scannerContainerRef.current;
    if (!imgEl || !containerEl) return;

    const testsInCtrl = getTestsForControl(currentMac, currentCtrl).filter(
      (t) => t.test_type !== "QUALITATIVE"
    );
    if (testsInCtrl.length === 0) return;

    const imgRect = imgEl.getBoundingClientRect();
    if (imgRect.width <= 10 || imgRect.height <= 10) return;

    const clickClientX = e.clientX;
    const clickClientY = e.clientY;
    const lensLeftClient = clickClientX - currentLensSize.w / 2;
    const lensTopClient = clickClientY - currentLensSize.h / 2;

    const scaleX = imgEl.naturalWidth / imgRect.width;
    const scaleY = imgEl.naturalHeight / imgRect.height;

    const cropX = (lensLeftClient - imgRect.left) * scaleX;
    const cropY = (lensTopClient - imgRect.top) * scaleY;
    const cropW = currentLensSize.w * scaleX;
    const cropH = currentLensSize.h * scaleY;

    const safeIdx = Math.min(scanTargetTestIdx, testsInCtrl.length - 1);
    const activeTargetTest = testsInCtrl[safeIdx];
    const theme = TEST_SYNC_PALETTE[safeIdx % TEST_SYNC_PALETTE.length];

    setIsScanningOcr(true);
    setLaserFlash(true);
    window.setTimeout(() => setLaserFlash(false), 320);

    try {
      const ocrRes = await recognizeCroppedCanvasOcr(
        imgEl,
        cropX,
        cropY,
        cropW,
        cropH,
        scannerMode
      );

      let targetTestToFill: TestConfig | null = activeTargetTest;
      if (scannerMode === "DUAL_MATRIX" && ocrRes.parsedCodeText) {
        const matchedByAlias = matchScannedTestAlias(
          ocrRes.parsedCodeText,
          testsInCtrl
        );
        if (matchedByAlias) {
          targetTestToFill = matchedByAlias;
        }
      }

      if (ocrRes.parsedNumber !== null && targetTestToFill) {
        const targetLv = step === "ENTER_RESULTS" ? selLevel : scanTargetLevel;
        const filledTest: TestConfig = targetTestToFill;
        const numStr: string = ocrRes.parsedNumber;

        handleCommitGridValue(filledTest.test_id, targetLv, numStr);
        setTempInputs((prev) => ({
          ...prev,
          [filledTest.test_id]: numStr,
        }));

        const matchedIdx = testsInCtrl.findIndex(
          (t) => t.test_id === filledTest.test_id
        );
        const usedTheme =
          matchedIdx >= 0
            ? TEST_SYNC_PALETTE[matchedIdx % TEST_SYNC_PALETTE.length]
            : theme;

        setScanFeedback({
          text: `✓ ${filledTest.test_name} (${targetLv}): ${numStr}`,
          ok: true,
          hex: usedTheme.hex,
        });

        let nextRowIdx = safeIdx;
        if (scannerMode === "AUTO_STEP") {
          nextRowIdx = safeIdx + 1 < testsInCtrl.length ? safeIdx + 1 : 0;
          setScanTargetTestIdx(nextRowIdx);
        } else if (matchedIdx >= 0) {
          nextRowIdx =
            matchedIdx + 1 < testsInCtrl.length ? matchedIdx + 1 : matchedIdx;
          setScanTargetTestIdx(nextRowIdx);
        }
        scrollGridToLevelAndRow(targetLv, nextRowIdx);
      } else {
        setScanFeedback({
          text: "⚠️ Chưa đọc rõ số — Hãy rọi khung ngắm bọc sát con số rồi nhấp lại!",
          ok: false,
          hex: "#e11d48",
        });
      }
    } catch {
      setScanFeedback({
        text: "⚠️ Lỗi đọc ảnh OCR — Vui lòng nhấp lại!",
        ok: false,
        hex: "#e11d48",
      });
    } finally {
      setIsScanningOcr(false);
      window.setTimeout(() => setScanFeedback(null), 2600);
    }
  };

  const handleExecuteWestgardAnalysis = (mode: "NORMAL" | "SIGMA") => {
    if (!selMachine || !selControl) return;
    const currentMac: string = selMachine;
    const currentCtrl: string = selControl;
    const tests = getTestsForControl(currentMac, currentCtrl);
    const nonPositiveNames: string[] = [];
    const extremeOutliers: string[] = [];

    tests.forEach((t) => {
      if (t.test_type === "QUALITATIVE") return;
      const r1 = (savedValues[t.test_id]?.L1 || "").trim().replace(/,/g, ".");
      const r2 = (savedValues[t.test_id]?.L2 || "").trim().replace(/,/g, ".");
      const r3 = (savedValues[t.test_id]?.L3 || "").trim().replace(/,/g, ".");
      const v1 = r1 !== "" ? parseFloat(r1) : null;
      const v2 = r2 !== "" ? parseFloat(r2) : null;
      const v3 = r3 !== "" ? parseFloat(r3) : null;
      const isAllowNegative = t.test_name.toUpperCase().includes("BE");

      if (
        !isAllowNegative &&
        ((v1 !== null && !isNaN(v1) && v1 <= 0) ||
          (v2 !== null && !isNaN(v2) && v2 <= 0) ||
          (v3 !== null && !isNaN(v3) && v3 <= 0))
      ) {
        nonPositiveNames.push(t.test_name);
      }
      if (v1 !== null && !isNaN(v1) && t.sd_L1 > 0) {
        const z1 = (v1 - t.mean_L1) / t.sd_L1;
        if (Math.abs(z1) >= 10)
          extremeOutliers.push(
            `${t.test_name} (L1: ${v1} -> ${z1.toFixed(1)}SD)`
          );
      }
      if (v2 !== null && !isNaN(v2) && t.sd_L2 > 0) {
        const z2 = (v2 - t.mean_L2) / t.sd_L2;
        if (Math.abs(z2) >= 10)
          extremeOutliers.push(
            `${t.test_name} (L2: ${v2} -> ${z2.toFixed(1)}SD)`
          );
      }
      if (v3 !== null && !isNaN(v3) && t.sd_L3 > 0) {
        const z3 = (v3 - t.mean_L3) / t.sd_L3;
        if (Math.abs(z3) >= 10)
          extremeOutliers.push(
            `${t.test_name} (L3: ${v3} -> ${z3.toFixed(1)}SD)`
          );
      }
    });

    if (nonPositiveNames.length > 0) {
      window.alert(
        `⚠️ Giá trị QC không thể ≤ 0 tại: ${nonPositiveNames.join(", ")}`
      );
      return;
    }
    if (extremeOutliers.length > 0) {
      if (
        !window.confirm(
          `🚨 CẢNH BÁO SAI SỐ THÔ (|Z| ≥ 10 SD):\n\n` +
            extremeOutliers.map((x) => `• ${x}`).join("\n") +
            `\n\nBạn có chắc chắn muốn tiếp tục phân tích và lưu?`
        )
      )
        return;
    }

    setIsAnalyzing(true);
    setLastAnalysisMode(mode);

    setTimeout(async () => {
      const rows: EvalRow[] = [];
      const newBM09Entries: BM09LogEntry[] = [];
      const shortDate = runDate.slice(8, 10) + "/" + runDate.slice(5, 7);
      const formattedTime = getVnTimeString();

      // Xây dựng chuỗi tên Hóa chất & Số Lô tổng hợp (nếu máy dùng nhiều lọ như Dade Citrol 1 / Dade Citrol 2)
      const linkedReagentSummary =
        activeLinkedReagentLots.length > 1
          ? activeLinkedReagentLots
              .map((r) => `${r.control_name} (Lô: ${r.lot_number})`)
              .join(" · ")
          : undefined;

      tests.forEach((t) => {
        const r1 = (savedValues[t.test_id]?.L1 || "").trim().replace(/,/g, ".");
        const r2 = (savedValues[t.test_id]?.L2 || "").trim().replace(/,/g, ".");
        const r3 = (savedValues[t.test_id]?.L3 || "").trim().replace(/,/g, ".");

        const lv1Meta = getEffectiveLevelControlAndLot(t, "L1");
        const lv2Meta = getEffectiveLevelControlAndLot(t, "L2");
        const lv3Meta = getEffectiveLevelControlAndLot(t, "L3");

        const multiCtrlDisplayName =
          linkedReagentSummary ||
          (t.levels_count >= 2 && lv2Meta.controlName !== lv1Meta.controlName
            ? [
                `${lv1Meta.controlName} (Lô: ${lv1Meta.lotNumber})`,
                `${lv2Meta.controlName} (Lô: ${lv2Meta.lotNumber})`,
                t.levels_count === 3 &&
                lv3Meta.controlName !== lv1Meta.controlName &&
                lv3Meta.controlName !== lv2Meta.controlName
                  ? `${lv3Meta.controlName} (Lô: ${lv3Meta.lotNumber})`
                  : "",
              ]
                .filter(Boolean)
                .join(" · ")
            : t.control_name);

        if (t.test_type === "QUALITATIVE") {
          const q1 = r1 || t.expected_qual_L1 || "ÂM TÍNH";
          const q2 =
            t.levels_count >= 2
              ? r2 || t.expected_qual_L2 || "DƯƠNG TÍNH"
              : undefined;
          const q3 =
            t.levels_count === 3
              ? r3 || t.expected_qual_L3 || "DƯƠNG TÍNH"
              : undefined;
          const pass1 = q1 === (t.expected_qual_L1 || "ÂM TÍNH");
          const pass2 =
            t.levels_count >= 2
              ? q2 === (t.expected_qual_L2 || "DƯƠNG TÍNH")
              : true;
          const pass3 =
            t.levels_count === 3
              ? q3 === (t.expected_qual_L3 || "DƯƠNG TÍNH")
              : true;
          const allPass = pass1 && pass2 && pass3;
          const failedLvls: string[] = [];
          if (!pass1) failedLvls.push("Mức 1");
          if (!pass2) failedLvls.push("Mức 2");
          if (!pass3) failedLvls.push("Mức 3");

          rows.push({
            test: t,
            valL1: null,
            qualL1: q1,
            zL1: null,
            lvl1Status: pass1 ? "PASS" : "FAIL",
            valL2: null,
            qualL2: q2,
            zL2: null,
            lvl2Status:
              t.levels_count >= 2 ? (pass2 ? "PASS" : "FAIL") : "SKIP",
            valL3: null,
            qualL3: q3,
            zL3: null,
            lvl3Status:
              t.levels_count === 3 ? (pass3 ? "PASS" : "FAIL") : "SKIP",
            status: allPass ? "PASS" : "FAIL",
            singleLevelRules: allPass
              ? []
              : [`Sai lệch Định tính (${failedLvls.join(", ")})`],
            crossLevelRules: [],
            appliedRuleSetLabel: "Đối chiếu Chứng Định tính",
            errorType: allPass ? "Đạt chuẩn" : "Không khớp chứng chuẩn",
            suggestion: allPass
              ? "Đạt chuẩn."
              : "Kiểm tra lại thuốc thử/thanh thử và chạy lại QC.",
            cause: "",
            actionTaken: "",
            postFixResult: allPass ? "" : "Đang chờ kiểm tra lại",
          });

          newBM09Entries.push({
            run_id: `RUN-${runDate.replace(/-/g, "")}`,
            test_id: t.test_id,
            run_date: runDate,
            run_time: formattedTime,
            section: t.section,
            machine_name: t.machine_name,
            control_name: multiCtrlDisplayName,
            lot_number: t.lot_number,
            test_name: t.test_name,
            westgard_mode: mode,
            val_L1: null,
            z_L1: null,
            val_L2: null,
            z_L2: null,
            val_L3: null,
            z_L3: null,
            qual_L1: q1,
            qual_L2: q2,
            qual_L3: q3,
            status: allPass ? "PASS" : "FAIL",
            lvl1_status: pass1 ? "PASS" : "FAIL",
            lvl2_status:
              t.levels_count >= 2 ? (pass2 ? "PASS" : "FAIL") : undefined,
            lvl3_status:
              t.levels_count === 3 ? (pass3 ? "PASS" : "FAIL") : undefined,
            rules_single: allPass
              ? ""
              : `Sai lệch Định tính (${failedLvls.join(", ")})`,
            rules_cross: "",
            cause: "",
            action_taken: "",
            post_fix_result: allPass ? "" : "Đang chờ kiểm tra lại",
            operator_name: currentUser.name,
            checker_name: "",
            resolved: allPass,
          });
          return;
        }

        const v1 = r1 !== "" ? parseFloat(r1) : null;
        const v2 = r2 !== "" ? parseFloat(r2) : null;
        const v3 = r3 !== "" ? parseFloat(r3) : null;
        if (v1 === null && v2 === null && v3 === null) {
          rows.push({
            test: t,
            valL1: null,
            zL1: null,
            lvl1Status: "SKIP",
            valL2: null,
            zL2: null,
            lvl2Status: "SKIP",
            valL3: null,
            zL3: null,
            lvl3Status: "SKIP",
            status: "SKIP",
            singleLevelRules: [],
            crossLevelRules: [],
            appliedRuleSetLabel: "Chưa nhập số liệu",
            errorType: "Bỏ trống",
            suggestion: "Chưa nhập kết quả.",
            cause: "",
            actionTaken: "",
            postFixResult: "",
          });
          return;
        }

        const evalRow = evaluateTestWestgardRules(
          t,
          v1 !== null && !isNaN(v1) ? v1 : null,
          v2 !== null && !isNaN(v2) ? v2 : null,
          v3 !== null && !isNaN(v3) ? v3 : null,
          mode,
          runDate
        );
        rows.push(evalRow);

        newBM09Entries.push({
          run_id: `RUN-${runDate.replace(/-/g, "")}`,
          test_id: t.test_id,
          run_date: runDate,
          run_time: formattedTime,
          section: t.section,
          machine_name: t.machine_name,
          control_name: multiCtrlDisplayName,
          lot_number: t.lot_number,
          test_name: t.test_name,
          westgard_mode: mode,
          val_L1: evalRow.valL1,
          z_L1: evalRow.zL1 !== null ? Number(evalRow.zL1.toFixed(2)) : null,
          val_L2: evalRow.valL2,
          z_L2: evalRow.zL2 !== null ? Number(evalRow.zL2.toFixed(2)) : null,
          val_L3: evalRow.valL3,
          z_L3: evalRow.zL3 !== null ? Number(evalRow.zL3.toFixed(2)) : null,
          status: evalRow.status === "SKIP" ? "PASS" : evalRow.status,
          lvl1_status:
            evalRow.lvl1Status === "SKIP" ? undefined : evalRow.lvl1Status,
          lvl2_status:
            evalRow.lvl2Status === "SKIP" ? undefined : evalRow.lvl2Status,
          lvl3_status:
            evalRow.lvl3Status === "SKIP" ? undefined : evalRow.lvl3Status,
          rules_single: evalRow.singleLevelRules.join(", "),
          rules_cross: evalRow.crossLevelRules.join(", "),
          cause: "",
          action_taken: "",
          post_fix_result:
            evalRow.status === "FAIL" ? "Đang chờ kiểm tra lại" : "",
          operator_name: currentUser.name,
          checker_name: "",
          resolved: evalRow.status !== "FAIL",
        });
      });

      setConfigs((prev) =>
        prev.map((c) => {
          if (c.test_type === "QUALITATIVE") return c;
          const found = rows.find((r) => r.test.test_id === c.test_id);
          if (!found || found.status === "SKIP") return c;
          const coordRuleText =
            [...found.singleLevelRules, ...found.crossLevelRules].join(" · ") ||
            (c.levels_count === 3
              ? "Đạt chuẩn phối hợp 3 mức"
              : "Đạt chuẩn (Trong ±2SD)");

          const calcSingleStatus = (
            z: number | null,
            sRule?: string
          ): "PASS" | "WARN" | "FAIL" => {
            if (z === null) return "PASS";
            if (
              Math.abs(z) >= 3 ||
              (sRule &&
                (sRule.includes("2-2s") ||
                  sRule.includes("4-1s") ||
                  sRule.includes("10x")))
            )
              return "FAIL";
            if (Math.abs(z) >= 2 || (sRule && sRule.includes("3-1s")))
              return "WARN";
            return "PASS";
          };

          const lot1 = getEffectiveLevelControlAndLot(c, "L1").lotNumber;
          const lot2 = getEffectiveLevelControlAndLot(c, "L2").lotNumber;
          const lot3 = getEffectiveLevelControlAndLot(c, "L3").lotNumber;

          const up1 =
            found.valL1 !== null && found.zL1 !== null
              ? upsertPointInHistoryArray(
                  c.history_L1,
                  {
                    isoDate: runDate,
                    date: shortDate,
                    time: formattedTime,
                    lot_number: lot1,
                    val: found.valL1,
                    z: Number(found.zL1.toFixed(2)),
                    operator: currentUser.name,
                    rule: coordRuleText,
                    status:
                      found.lvl1Status === "SKIP" ? "PASS" : found.lvl1Status,
                    single_level_status: calcSingleStatus(
                      found.zL1,
                      found.lvl1SingleRule
                    ),
                    single_level_rule: found.lvl1SingleRule,
                  },
                  currentUser.name,
                  "Phân tích tại Kiosk"
                )
              : { list: c.history_L1, isNewDayPoint: false };

          const up2 =
            found.valL2 !== null && found.zL2 !== null
              ? upsertPointInHistoryArray(
                  c.history_L2,
                  {
                    isoDate: runDate,
                    date: shortDate,
                    time: formattedTime,
                    lot_number: lot2,
                    val: found.valL2,
                    z: Number(found.zL2.toFixed(2)),
                    operator: currentUser.name,
                    rule: coordRuleText,
                    status:
                      found.lvl2Status === "SKIP" ? "PASS" : found.lvl2Status,
                    single_level_status: calcSingleStatus(
                      found.zL2,
                      found.lvl2SingleRule
                    ),
                    single_level_rule: found.lvl2SingleRule,
                  },
                  currentUser.name,
                  "Phân tích tại Kiosk"
                )
              : { list: c.history_L2, isNewDayPoint: false };

          const up3 =
            found.valL3 !== null && found.zL3 !== null
              ? upsertPointInHistoryArray(
                  c.history_L3 || [],
                  {
                    isoDate: runDate,
                    date: shortDate,
                    time: formattedTime,
                    lot_number: lot3,
                    val: found.valL3,
                    z: Number(found.zL3.toFixed(2)),
                    operator: currentUser.name,
                    rule: coordRuleText,
                    status:
                      found.lvl3Status === "SKIP" ? "PASS" : found.lvl3Status,
                    single_level_status: calcSingleStatus(
                      found.zL3,
                      found.lvl3SingleRule
                    ),
                    single_level_rule: found.lvl3SingleRule,
                  },
                  currentUser.name,
                  "Phân tích tại Kiosk"
                )
              : { list: c.history_L3 || [], isNewDayPoint: false };

          const isNewDay =
            up1.isNewDayPoint || up2.isNewDayPoint || up3.isNewDayPoint;
          return {
            ...c,
            accumulated_points: isNewDay
              ? c.accumulated_points + 1
              : c.accumulated_points,
            range_active_days:
              c.range_source !== "MANUFACTURER" && isNewDay
                ? c.range_active_days + 1
                : c.range_active_days,
            history_L1: up1.list,
            history_L2: up2.list,
            history_L3: up3.list,
          };
        })
      );

      // CẬP NHẬT SỐ LẦN DÙNG CHO TOÀN BỘ CÁC LỌ HÓA CHẤT ĐƯỢC CHỌN TRONG BỘ QC (BM.16)
      const targetCtrlNamesToIncrement: string[] =
        selectedReagentNamesForBM16.length > 0
          ? selectedReagentNamesForBM16
          : [currentCtrl];

      if (useTimesIncrement > 0) {
        setReagents((prev) => {
          const copy = [...prev];
          targetCtrlNamesToIncrement.forEach((ctrlName) => {
            for (let i = copy.length - 1; i >= 0; i--) {
              if (
                copy[i].machine_name === currentMac &&
                copy[i].control_name === ctrlName
              ) {
                const curMap = { ...(copy[i].used_days_map || {}) };
                curMap[runDate] =
                  (Number(curMap[runDate]) || 0) + useTimesIncrement;
                const updatedVial: ReagentLotBM16 = {
                  ...copy[i],
                  usage_count:
                    Number(copy[i].usage_count || 0) + useTimesIncrement,
                  used_days_map: curMap,
                };
                copy[i] = updatedVial;
                break;
              }
            }
          });
          return copy;
        });
      }

      setBm09Logs((prev) => {
        const incomingKeys = new Set(
          newBM09Entries.map((e) => `${e.run_date}__${e.test_id}`)
        );
        const filteredOld = prev.filter(
          (old) => !incomingKeys.has(`${old.run_date}__${old.test_id}`)
        );
        return [...newBM09Entries, ...filteredOld];
      });

      // Đánh dấu hoàn tất (màu Xanh) cho tất cả các thẻ Hóa chất liên quan trong bộ QC
      const linkedCtrls = getLinkedControlsForCurrentRun(
        currentMac,
        currentCtrl
      );
      setSavedLevels((prev) => {
        const next = { ...prev };
        linkedCtrls.forEach((cName) => {
          next[ctrlKey(currentMac, cName)] = {
            L1: true,
            L2: true,
            L3: true,
          };
        });
        return next;
      });

      const batchPayload = {
        section: selSection,
        section_epoch: mySectionEpoch,
        run_date: runDate,
        run_time: formattedTime,
        machine_name: currentMac,
        control_name: currentCtrl,
        selected_control_names: targetCtrlNamesToIncrement,
        westgard_mode: mode,
        operator_name: currentUser.name,
        use_times_increment: useTimesIncrement,
        items: newBM09Entries,
      };

      const res = await rpcCall(apiUrl, "save_batch", batchPayload, authToken);
      if (!res.net || res.body?.status !== "success") {
        if (onEnqueueOfflineBatch) {
          onEnqueueOfflineBatch(batchPayload);
        }
      }

      setSectionLocks((prev) =>
        prev.filter(
          (l) => l.user_id.toLowerCase() !== currentUser.id.toLowerCase()
        )
      );
      rpcCall(
        apiUrl,
        "release_section_lock",
        { user_id: currentUser.id },
        authToken
      );

      setEvalRows(rows);
      setIsAnalyzing(false);
      setStep("ANALYSIS_REPORT");
    }, 220);
  };

  const renderSplitImageViewer = () => {
    const currentImg = levelImages[activeImageTab];
    const numericTests =
      selMachine && selControl
        ? getTestsForControl(selMachine, selControl).filter(
            (t) => t.test_type !== "QUALITATIVE"
          )
        : [];
    const safeIdx =
      numericTests.length > 0
        ? Math.min(scanTargetTestIdx, numericTests.length - 1)
        : 0;
    const activeTargetTest = numericTests[safeIdx];
    const activeTheme = TEST_SYNC_PALETTE[safeIdx % TEST_SYNC_PALETTE.length];
    const targetLv = step === "ENTER_RESULTS" ? selLevel : scanTargetLevel;

    return (
      <div className="bg-slate-900 text-white rounded-2xl p-3.5 shadow-xl flex flex-col justify-between space-y-2.5 border-2 border-indigo-500/40">
        <style>{`
          .qc-zoom-viewport::-webkit-scrollbar { width: 11px; height: 11px; }
          .qc-zoom-viewport::-webkit-scrollbar-track { background: #0f172a; border-radius: 8px; }
          .qc-zoom-viewport::-webkit-scrollbar-thumb { background: #38bdf8; border-radius: 8px; border: 2px solid #0f172a; }
          .qc-zoom-viewport::-webkit-scrollbar-thumb:hover { background: #7dd3fc; }
          .qc-zoom-viewport::-webkit-scrollbar-corner { background: #0f172a; }
        `}</style>

        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-700 pb-2.5">
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] font-black uppercase text-amber-400 mr-1">
              📷 Ảnh Mức:
            </span>
            {(["L1", "L2", "L3"] as const).map((lv) => (
              <button
                key={lv}
                type="button"
                onClick={() => {
                  setActiveImageTab(lv);
                  setScanTargetLevel(lv);
                  setImgZoom(1);
                  setImgRotate(0);
                  setImgScrollPct({ x: 0, y: 0 });
                  scrollGridToLevelAndRow(lv, safeIdx);
                }}
                className={`px-2.5 py-1 rounded-lg text-xs font-black transition flex items-center gap-1 ${
                  activeImageTab === lv
                    ? "bg-blue-600 text-white shadow-sm ring-2 ring-sky-400"
                    : "bg-slate-800 text-slate-300 hover:bg-slate-700"
                }`}
              >
                <span>{lv}</span>
                {levelImages[lv] && (
                  <span className="w-2 h-2 rounded-full bg-emerald-400" />
                )}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-1.5 text-xs">
            <button
              type="button"
              onClick={() => photoInputRef.current?.click()}
              className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-black flex items-center gap-1 shadow-xs"
            >
              <Ic.Camera /> Chọn / Chụp {activeImageTab}
            </button>
            {currentImg && (
              <>
                <button
                  type="button"
                  onClick={() =>
                    setImgZoom((z) =>
                      Number(Math.max(0.6, z - 0.25).toFixed(2))
                    )
                  }
                  className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 font-mono font-bold"
                  title="Thu nhỏ ảnh"
                >
                  −
                </button>
                <span className="text-[10.5px] font-mono font-black text-sky-300 px-1">
                  {Math.round(imgZoom * 100)}%
                </span>
                <button
                  type="button"
                  onClick={() =>
                    setImgZoom((z) =>
                      Number(Math.min(3.0, z + 0.25).toFixed(2))
                    )
                  }
                  className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 font-mono font-bold"
                  title="Phóng to ảnh"
                >
                  +
                </button>
                <button
                  type="button"
                  onClick={() => setImgRotate((r) => (r + 90) % 360)}
                  className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 font-bold"
                  title="Xoay ảnh 90 độ"
                >
                  ↻
                </button>
              </>
            )}
            <button
              type="button"
              onClick={() => setShowImagePanel(false)}
              className="px-2 py-1 rounded bg-rose-600/80 hover:bg-rose-600 text-white font-bold"
              title="Đóng khung ảnh"
            >
              ✕
            </button>
          </div>
        </div>

        <div className="bg-slate-800/90 border border-slate-700 rounded-xl p-2.5 space-y-2 text-xs">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => setScannerEnabled((p) => !p)}
              className={`px-3 py-1 rounded-lg font-black flex items-center gap-1.5 transition ${
                scannerEnabled
                  ? "bg-gradient-to-r from-amber-400 to-orange-500 text-slate-950 shadow-sm"
                  : "bg-slate-700 text-slate-300"
              }`}
            >
              <Ic.Target />
              <span>
                {scannerEnabled
                  ? "🎯 Kính Ngắm Quét Số: ĐANG BẬT"
                  : "Kính Ngắm Quét Số: Đang Tắt"}
              </span>
            </button>

            {scannerEnabled && (
              <div className="flex items-center bg-slate-900 p-0.5 rounded-lg border border-slate-700 text-[11px] font-bold">
                <button
                  type="button"
                  onClick={() => setScannerMode("AUTO_STEP")}
                  className={`px-2 py-1 rounded-md transition ${
                    scannerMode === "AUTO_STEP"
                      ? "bg-sky-600 text-white font-black"
                      : "text-slate-400 hover:text-white"
                  }`}
                  title="Quét 1 ô số & tự động nhảy xuống dòng xét nghiệm tiếp theo (Tối ưu cho Huyết học XR-1000)"
                >
                  1. Quét Liên Thanh (Dọc)
                </button>
                <button
                  type="button"
                  onClick={() => setScannerMode("DUAL_MATRIX")}
                  className={`px-2 py-1 rounded-md transition ${
                    scannerMode === "DUAL_MATRIX"
                      ? "bg-purple-600 text-white font-black"
                      : "text-slate-400 hover:text-white"
                  }`}
                  title="Kính ngắm 2 ngăn bọc cả Tên Test + Số, tự dò tên điền vào bảng (Tối ưu cho DXC 700 AU)"
                >
                  2. Quét Ma Trận (Tên + Số)
                </button>
              </div>
            )}
          </div>

          {scannerEnabled && activeTargetTest && (
            <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-slate-700/80 text-[11px]">
              <div className="flex items-center gap-1.5">
                <span className="text-slate-400">Đang ngắm:</span>
                <span
                  style={{ backgroundColor: activeTheme.hex }}
                  className="px-2 py-0.5 rounded-md text-white font-black shadow-xs"
                >
                  {safeIdx + 1}. {activeTargetTest.test_name} ({targetLv})
                </span>
              </div>
              <div className="text-slate-400 font-mono text-[10px]">
                Khung ({selMachine}): {currentLensSize.w}×{currentLensSize.h}px
                (Kéo góc ↘ để chỉnh cỡ)
              </div>
            </div>
          )}
        </div>

        {/* KHUNG CHỨA ẢNH HỖ TRỢ CẢ 2 THANH CUỘN DỌC & NGANG CHUẨN XÁC KHI ZOOM */}
        <div
          ref={scannerContainerRef}
          onScroll={(e) => {
            const el = e.currentTarget;
            const maxX = Math.max(1, el.scrollWidth - el.clientWidth);
            const maxY = Math.max(1, el.scrollHeight - el.clientHeight);
            setImgScrollPct({
              x: Math.round((el.scrollLeft / maxX) * 100),
              y: Math.round((el.scrollTop / maxY) * 100),
            });
          }}
          onDragOver={(e) => e.preventDefault()}
          onDrop={async (e) => {
            e.preventDefault();
            const file = e.dataTransfer.files?.[0];
            if (file && file.type.startsWith("image")) {
              try {
                const compressed = await compressImageDual(file);
                setLevelImages((prev) => ({
                  ...prev,
                  [activeImageTab]: compressed.handoffBase64,
                }));
              } catch {}
            }
          }}
          onMouseMove={(e) => {
            if (
              !scannerEnabled ||
              isResizingLens ||
              !scannerContainerRef.current
            )
              return;
            const containerEl = scannerContainerRef.current;
            const rect = containerEl.getBoundingClientRect();
            const rawX = e.clientX - rect.left + containerEl.scrollLeft;
            const rawY = e.clientY - rect.top + containerEl.scrollTop;
            const maxW = Math.max(rect.width, containerEl.scrollWidth);
            const maxH = Math.max(rect.height, containerEl.scrollHeight);
            const x = Math.max(
              currentLensSize.w / 2 + 4,
              Math.min(maxW - currentLensSize.w / 2 - 4, rawX)
            );
            const y = Math.max(
              currentLensSize.h / 2 + 4,
              Math.min(maxH - currentLensSize.h / 2 - 4, rawY)
            );
            setLensPos({ x, y });
          }}
          onClick={handleMagicLensClickScan}
          className={`qc-zoom-viewport relative bg-slate-950 rounded-xl overflow-scroll h-[430px] border border-slate-800 ${
            currentImg && imgZoom <= 1
              ? "flex items-center justify-center"
              : "block p-2"
          } ${scannerEnabled && currentImg ? "cursor-crosshair" : ""}`}
        >
          {currentImg ? (
            <>
              <img
                ref={scannerImgRef}
                src={currentImg}
                alt={`Phiếu QC ${activeImageTab}`}
                style={{
                  width: `${Math.round(imgZoom * 100)}%`,
                  maxWidth: "none",
                  height: "auto",
                  transform: imgRotate ? `rotate(${imgRotate}deg)` : undefined,
                  transformOrigin: "top left",
                }}
                className="block select-none pointer-events-none mx-auto"
              />

              {scanFeedback && (
                <div
                  style={{
                    backgroundColor: scanFeedback.hex,
                  }}
                  className="sticky top-3 left-1/2 -translate-x-1/2 z-30 px-3.5 py-1.5 rounded-full text-white font-black text-xs shadow-lg animate-bounce whitespace-nowrap w-max mx-auto"
                >
                  {scanFeedback.text}
                </div>
              )}

              {scannerEnabled && (
                <div
                  style={{
                    width: `${currentLensSize.w}px`,
                    height: `${currentLensSize.h}px`,
                    left: `${lensPos.x - currentLensSize.w / 2}px`,
                    top: `${lensPos.y - currentLensSize.h / 2}px`,
                    borderColor: isScanningOcr ? "#ef4444" : activeTheme.hex,
                    boxShadow: `0 0 16px ${
                      isScanningOcr ? "#ef444499" : `${activeTheme.hex}88`
                    }, inset 0 0 8px rgba(255,255,255,0.35)`,
                  }}
                  className="absolute z-20 border-2 rounded-lg pointer-events-none transition-[border-color,box-shadow] duration-100 backdrop-contrast-125 backdrop-brightness-110"
                >
                  <div
                    style={{
                      backgroundColor: isScanningOcr
                        ? "#ef4444"
                        : activeTheme.hex,
                    }}
                    className="absolute -top-5 left-0 px-2 py-0.5 rounded-t-md text-[9.5px] font-black text-white whitespace-nowrap shadow-xs"
                  >
                    {isScanningOcr
                      ? "⚡ ĐANG QUÉT..."
                      : scannerMode === "DUAL_MATRIX"
                      ? `QUÉT MA TRẬN (${targetLv}): TÊN | SỐ`
                      : `${activeTargetTest?.test_name || "QC"} (${targetLv})`}
                  </div>

                  {scannerMode === "DUAL_MATRIX" && (
                    <div className="absolute top-0 bottom-0 left-[44%] border-l-2 border-dashed border-amber-300/90 flex items-center">
                      <span className="text-[8px] font-black bg-slate-900/80 text-amber-300 px-1 rounded ml-0.5">
                        SỐ
                      </span>
                    </div>
                  )}

                  {laserFlash && (
                    <div className="absolute inset-x-0 top-1/2 h-0.5 bg-gradient-to-r from-transparent via-rose-400 to-transparent shadow-[0_0_10px_#f43f5e] animate-ping" />
                  )}

                  <div
                    onMouseDown={(e) => {
                      e.stopPropagation();
                      setIsResizingLens(true);
                      resizeStartRef.current = {
                        startX: e.clientX,
                        startY: e.clientY,
                        initW: currentLensSize.w,
                        initH: currentLensSize.h,
                      };
                    }}
                    title="Kéo góc này để chỉnh kích thước Kính ngắm (Tự động lưu theo máy)"
                    className="absolute -right-2.5 -bottom-2.5 w-5 h-5 rounded-full bg-amber-400 text-slate-950 font-black text-[10px] flex items-center justify-center shadow-md cursor-nwse-resize pointer-events-auto hover:scale-110 transition"
                  >
                    ↘
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="text-center text-slate-400 p-6 space-y-2.5 text-xs">
              <div className="text-base font-black text-slate-200">
                Chưa có ảnh màn hình máy cho mức {activeImageTab}
              </div>
              <p className="leading-relaxed">
                • Cách 1: Bấm <b>"Chọn / Chụp {activeImageTab}"</b> ở góc trên.
                <br />• Cách 2: Bấm tổ hợp phím <b>Ctrl + V</b> để dán thẳng ảnh
                vừa copy từ Zalo PC.
                <br />• Cách 3: Nhấp vào thanh màu vàng phía trên nếu vừa chụp
                gửi từ Điện thoại sang.
              </p>
            </div>
          )}
        </div>

        {/* 2 THANH TRƯỢT ĐIỀU KHIỂN KÉO DỌC (↕) & KÉO NGANG (↔) TRỰC QUAN KHI ZOOM */}
        {currentImg && (
          <div className="grid grid-cols-2 gap-2.5 bg-slate-800/85 border border-slate-700 rounded-xl px-3 py-1.5 text-[10.5px]">
            <div className="flex items-center gap-2">
              <span className="font-black text-sky-300 whitespace-nowrap">
                ↕ Kéo dọc:
              </span>
              <input
                type="range"
                min={0}
                max={100}
                value={imgScrollPct.y}
                onChange={(e) =>
                  handlePanImageByPercentage("y", Number(e.target.value))
                }
                className="w-full accent-sky-400 cursor-pointer"
              />
            </div>
            <div className="flex items-center gap-2">
              <span className="font-black text-amber-300 whitespace-nowrap">
                ↔ Kéo ngang:
              </span>
              <input
                type="range"
                min={0}
                max={100}
                value={imgScrollPct.x}
                onChange={(e) =>
                  handlePanImageByPercentage("x", Number(e.target.value))
                }
                className="w-full accent-amber-400 cursor-pointer"
              />
            </div>
          </div>
        )}

        <div className="flex items-center justify-between text-[11px] text-slate-300 pt-0.5">
          <span>
            💡 Rọi Kính ngắm vào số trên ảnh rồi <b>Click chuột</b> để tự động
            đọc số nhảy vào bảng!
          </span>
          <button
            type="button"
            disabled={isPushingMobile}
            onClick={handlePushMobileDraftToCloud}
            className="px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black shadow-sm transition disabled:opacity-50 shrink-0"
          >
            {isPushingMobile ? "⏳ Đang đẩy..." : "📲 Đẩy Ảnh & Nháp sang PC"}
          </button>
        </div>
      </div>
    );
  };

  const handleSaveInlineCorrectiveInReport = async (
    rowIndex: number,
    testId: string,
    causeText: string,
    actionText: string
  ) => {
    const runId = `RUN-${runDate.replace(/-/g, "")}`;
    setEvalRows((prev) =>
      prev.map((r, idx) =>
        idx === rowIndex
          ? { ...r, cause: causeText, actionTaken: actionText }
          : r
      )
    );
    setBm09Logs((prev) =>
      prev.map((item) =>
        item.run_date === runDate && item.test_id === testId
          ? {
              ...item,
              cause: causeText,
              action_taken: actionText,
            }
          : item
      )
    );
    await rpcCall(
      apiUrl,
      "update_corrective_action",
      {
        run_id: runId,
        test_id: testId,
        cause: causeText,
        action_taken: actionText,
      },
      authToken
    );
    window.alert(
      "✓ Đã lưu nguyên nhân & hành động khắc phục vào Sổ nhật ký BM.09!"
    );
  };

  return (
    <div className="space-y-4">
      <input
        ref={photoInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={(e) => handleSelectPhotoFile(e, activeImageTab)}
        className="hidden"
      />

      {pendingMobileDrafts && pendingMobileDrafts.length > 0 && (
        <div className="bg-gradient-to-r from-amber-50 via-yellow-50 to-orange-50 border-2 border-amber-300 rounded-2xl p-3.5 shadow-sm flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <span className="px-2.5 py-1 rounded-xl bg-amber-500 text-slate-950 font-black text-xs animate-bounce">
              📲 Điện thoại vừa gửi sang ({pendingMobileDrafts.length})
            </span>
            <span className="text-xs font-bold text-amber-950">
              Nhấp để nạp thẳng ảnh chụp phiếu in & số nháp vào màn hình PC:
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {pendingMobileDrafts.map((item, idx) => (
              <div
                key={`${item.machine_name}-${item.control_name}-${idx}`}
                className="inline-flex items-center gap-1 bg-white border border-amber-400 rounded-xl px-3 py-1.5 shadow-xs text-xs"
              >
                <button
                  type="button"
                  disabled={isPullingMobile}
                  onClick={() => handlePullMobileDraftFromCloud(item)}
                  className="font-black text-indigo-900 hover:underline flex items-center gap-1.5"
                >
                  <span>
                    📷 {item.machine_name} · {item.control_name}
                  </span>
                  <span className="text-[10.5px] font-mono bg-amber-100 text-amber-900 px-1.5 py-0.5 rounded">
                    {item.active_levels?.join("+")}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => handleDismissMobileDraft(item)}
                  className="ml-1.5 text-slate-400 hover:text-rose-600 font-bold"
                  title="Xóa bản nháp này"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-extrabold uppercase text-slate-500 mr-1">
            Lab chuyên môn:
          </span>
          {sections.map((sec) => {
            const lock = getActiveLockForSection(sec);
            const isLockedByOther =
              Boolean(lock) &&
              lock!.user_id.toLowerCase() !== currentUser.id.toLowerCase();
            const isLockedByMe =
              Boolean(lock) &&
              lock!.user_id.toLowerCase() === currentUser.id.toLowerCase();
            return (
              <div key={sec} className="inline-flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => handleSelectSectionInKiosk(sec)}
                  className={`px-3.5 py-2 rounded-xl text-xs font-extrabold transition-all flex items-center gap-1.5 ${
                    isLockedByOther
                      ? "bg-rose-50 text-rose-700 border border-rose-300 cursor-not-allowed opacity-85"
                      : selSection === sec
                      ? "bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-md"
                      : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                  }`}
                >
                  {isLockedByOther && <Ic.Lock />}
                  <span>{sec}</span>
                  {isLockedByOther && (
                    <span className="text-[10px] bg-rose-600 text-white px-1.5 py-0.5 rounded-md font-bold">
                      Đang nhập: {lock!.user_name}
                    </span>
                  )}
                  {isLockedByMe && (
                    <span className="text-[10px] bg-emerald-400/30 text-white px-1.5 py-0.5 rounded-md font-bold">
                      Bạn đang giữ
                    </span>
                  )}
                </button>
                {isLockedByOther &&
                  hasPermission(currentUser, "FORCE_UNLOCK_LAB") && (
                    <button
                      type="button"
                      onClick={() => handleForceUnlockSection(sec)}
                      className="px-2.5 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-[10.5px] font-black shadow-sm flex items-center gap-1 transition"
                    >
                      <Ic.Unlock /> Mở khóa
                    </button>
                  )}
              </div>
            );
          })}
        </div>

        <div className="flex items-center gap-2">
          {selMachine && isMachineCompleted(selMachine) && (
            <button
              type="button"
              onClick={() =>
                handleViewTodayAnalysisForMachine(
                  selMachine,
                  selControl || undefined
                )
              }
              className="px-3 py-1.5 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300 text-xs font-black transition"
            >
              📊 Xem Bản Phân Tích ({selMachine})
            </button>
          )}
          <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200 text-xs font-bold">
            <button
              type="button"
              onClick={() => setKioskInputMode("CARD")}
              className={`px-3 py-1.5 rounded-lg transition ${
                kioskInputMode === "CARD"
                  ? "bg-white text-blue-700 shadow-sm font-black"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              Thẻ chi tiết
            </button>
            <button
              type="button"
              onClick={() => setKioskInputMode("GRID")}
              className={`px-3 py-1.5 rounded-lg flex items-center gap-1 transition ${
                kioskInputMode === "GRID"
                  ? "bg-white text-indigo-700 shadow-sm font-black"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <Ic.Grid /> Bảng thu gọn
            </button>
          </div>
        </div>
      </div>

      {step === "SELECT_MACHINE" && (
        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h2 className="text-base font-black text-slate-900">
                Chọn Thiết Bị Xét Nghiệm — Lab {selSection}
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Nhấp chọn thiết bị để hiển thị các Hóa chất QC tương ứng (Các
                máy đã nhập xong trong ngày sẽ được khóa bảo vệ chống ghi đè
                nhầm).
              </p>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
            {getMachinesForSection(selSection).map((m) => {
              const completed = isMachineCompleted(m);
              const partial = isMachinePartial(m);
              return (
                <button
                  key={m}
                  type="button"
                  onClick={() => {
                    setSelMachine(m);
                    if (completed) {
                      setCompletedGuardModal({
                        targetType: "MACHINE",
                        machine: m,
                      });
                    } else {
                      setStep("SELECT_CONTROL");
                    }
                  }}
                  className={`rounded-2xl p-5 text-left border-2 border-b-4 transition-all hover:-translate-y-0.5 ${
                    completed
                      ? "bg-amber-50/90 border-amber-400 border-b-amber-600"
                      : partial
                      ? "bg-indigo-50/90 border-indigo-300 border-b-indigo-600"
                      : "bg-sky-50/70 border-sky-200 border-b-sky-500 hover:bg-sky-50"
                  }`}
                >
                  <div className="flex items-center justify-between mb-3">
                    <span className="p-2.5 rounded-xl bg-white text-blue-600 shadow-sm border border-slate-100">
                      <Ic.Cpu />
                    </span>
                    <div className="flex items-center gap-1.5">
                      <span
                        className={`text-[10px] font-extrabold uppercase px-2.5 py-0.5 rounded-full ${
                          completed
                            ? "bg-amber-500 text-white"
                            : partial
                            ? "bg-indigo-600 text-white"
                            : "bg-sky-600 text-white"
                        }`}
                      >
                        {completed
                          ? "ĐÃ NHẬP XONG"
                          : partial
                          ? "Đang nhập"
                          : "Sẵn sàng"}
                      </span>
                    </div>
                  </div>
                  <div className="text-lg font-black text-slate-900">{m}</div>
                  <div className="text-xs text-slate-600 mt-1">
                    Hóa chất QC:{" "}
                    <b>
                      {getControlsForMachine(m).join(" · ") || "Chưa khai báo"}
                    </b>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {step === "SELECT_CONTROL" && selMachine && (
        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h2 className="text-base font-black text-slate-900">
                Chọn Hóa Chất QC — Thiết Bị {selMachine}
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Cảnh báo tự động khi Hóa chất tự pha đạt{" "}
                <b>≥ 75% Số lượng đã pha</b>.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setStep("SELECT_MACHINE")}
              className="flex items-center gap-1.5 text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 px-3.5 py-2 rounded-xl"
            >
              <Ic.Back /> Đổi Thiết Bị
            </button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {getControlsForMachine(selMachine).map((ctrl) => {
              const currentMac: string = selMachine;
              const done = isControlCompleted(currentMac, ctrl);
              const tList = getTestsForControl(currentMac, ctrl);
              const rgList = reagents.filter(
                (r) => r.machine_name === currentMac && r.control_name === ctrl
              );
              const rg = rgList[rgList.length - 1];
              const reached75 = rg ? isReagentReached75(rg) : false;

              return (
                <button
                  key={ctrl}
                  type="button"
                  onClick={() => {
                    setSelControl(ctrl);
                    if (done) {
                      setCompletedGuardModal({
                        targetType: "CONTROL",
                        machine: currentMac,
                        control: ctrl,
                      });
                    } else {
                      setStep("SELECT_LEVEL");
                    }
                  }}
                  className={`rounded-2xl p-5 text-left border-2 border-b-[5px] transition-all hover:-translate-y-0.5 ${
                    done
                      ? "bg-gradient-to-b from-emerald-500 to-emerald-600 border-emerald-700 text-white shadow-lg"
                      : "bg-sky-50/70 border-sky-200 border-b-sky-600 text-slate-900"
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span
                      className={`p-2 rounded-xl shadow-sm border ${
                        done
                          ? "bg-white/20 text-white border-white/30"
                          : "bg-white text-indigo-600 border-slate-100"
                      }`}
                    >
                      <Ic.Flask />
                    </span>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {done && (
                        <span className="text-[10px] font-black px-2.5 py-0.5 rounded-full bg-black/25 text-white flex items-center gap-1">
                          <Ic.Check /> ĐÃ LƯU XONG
                        </span>
                      )}
                      {reached75 && (
                        <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-rose-600 text-white animate-pulse">
                          ⚠️ Đạt ≥ 75% ({rg?.usage_count}/
                          {rg?.quantity_prepared})
                        </span>
                      )}
                      {rg && (
                        <span
                          className={`text-[11px] font-mono font-bold px-2.5 py-1 rounded-lg border ${
                            done
                              ? "bg-black/20 text-white border-white/25"
                              : "bg-white text-slate-700 border-slate-200"
                          }`}
                        >
                          Lô: {rg.lot_number} (HSD:{" "}
                          {formatDateVN(rg.expiry_date)})
                        </span>
                      )}
                    </div>
                  </div>
                  <div
                    className={`text-lg font-black ${
                      done ? "text-white" : "text-slate-900"
                    }`}
                  >
                    {ctrl}
                  </div>
                  <div
                    className={`text-xs mt-1 font-semibold ${
                      done ? "text-emerald-50" : "text-slate-600"
                    }`}
                  >
                    {tList.length} xét nghiệm cấu hình
                  </div>
                </button>
              );
            })}
            {getControlsForMachine(selMachine).length === 0 && (
              <div className="col-span-2 text-center py-8 text-slate-400 italic text-xs">
                Thiết bị này chưa có lô hóa chất QC nào được khai báo trong Danh
                mục.
              </div>
            )}
          </div>
        </div>
      )}

      {step === "SELECT_LEVEL" && selMachine && selControl && (
        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm relative space-y-5">
          {isAnalyzing && (
            <div className="absolute inset-0 bg-white/80 backdrop-blur-sm z-20 flex flex-col items-center justify-center rounded-2xl">
              <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mb-2" />
              <div className="text-xs font-black text-blue-900 uppercase">
                Đang phân tích quy tắc Westgard & lập Bản báo cáo chi tiết...
              </div>
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-black text-slate-900">
                {kioskInputMode === "GRID"
                  ? `Bảng Nhập Nhanh (Grid Mode) — ${selMachine} (${selControl})`
                  : `Chọn Mức Nồng Độ QC — ${selMachine} (${selControl})`}
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                {kioskInputMode === "GRID"
                  ? "Nhấn Enter / Mũi tên để di chuyển ô · Bật Kính ngắm bên trái để rọi số trên ảnh tự động điền vào bảng."
                  : "Chưa nhập: Xanh Dương · Đã lưu: Xanh Lá (Có khóa bảo vệ khi đã lưu xong)."}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setShowImagePanel((prev) => !prev)}
                className={`px-3.5 py-2 rounded-xl text-xs font-black border flex items-center gap-1.5 transition ${
                  showImagePanel
                    ? "bg-indigo-600 text-white border-indigo-700 shadow-sm"
                    : "bg-indigo-50 hover:bg-indigo-100 text-indigo-900 border-indigo-200"
                }`}
              >
                <Ic.Camera />
                <span>
                  {showImagePanel
                    ? "Đang mở Khung Ảnh & Kính Ngắm"
                    : "📷 Mở Ảnh & Kính Ngắm Quét Số"}
                </span>
              </button>
              <button
                type="button"
                onClick={handleClearCurrentControlInputs}
                className="px-3 py-2 rounded-xl text-xs font-bold bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200"
              >
                🧹 Xóa trắng ô nhập
              </button>
              <button
                type="button"
                onClick={() => setStep("SELECT_CONTROL")}
                className="flex items-center gap-1.5 text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 px-3.5 py-2 rounded-xl"
              >
                <Ic.Back /> Đổi hóa chất QC
              </button>
            </div>
          </div>

          <div
            className={`grid grid-cols-1 ${
              showImagePanel ? "lg:grid-cols-12 gap-4 items-start" : ""
            }`}
          >
            {showImagePanel && (
              <div className="lg:col-span-5">{renderSplitImageViewer()}</div>
            )}

            <div
              className={showImagePanel ? "lg:col-span-7" : "lg:col-span-12"}
            >
              {kioskInputMode === "GRID" ? (
                <div className="space-y-3">
                  <div
                    ref={gridTableScrollRef}
                    className="overflow-x-auto border border-slate-200 rounded-2xl scroll-smooth"
                  >
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="bg-slate-900 text-white uppercase text-[11px]">
                          <th className="py-2.5 px-3 w-12 text-center">Màu</th>
                          <th className="py-2.5 px-3">Xét nghiệm</th>
                          <th
                            ref={(el) => {
                              gridHeaderColRefs.current.L1 = el;
                            }}
                            className={`py-2.5 px-3 text-right transition ${
                              showImagePanel && scanTargetLevel === "L1"
                                ? "bg-sky-900 text-sky-200"
                                : ""
                            }`}
                          >
                            Mức 1 (L1)
                          </th>
                          <th
                            ref={(el) => {
                              gridHeaderColRefs.current.L2 = el;
                            }}
                            className={`py-2.5 px-3 text-right transition ${
                              showImagePanel && scanTargetLevel === "L2"
                                ? "bg-purple-900 text-purple-200"
                                : ""
                            }`}
                          >
                            Mức 2 (L2)
                          </th>
                          <th
                            ref={(el) => {
                              gridHeaderColRefs.current.L3 = el;
                            }}
                            className={`py-2.5 px-3 text-right transition ${
                              showImagePanel && scanTargetLevel === "L3"
                                ? "bg-amber-900 text-amber-200"
                                : ""
                            }`}
                          >
                            Mức 3 (L3)
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200 bg-white">
                        {getTestsForControl(selMachine, selControl).map(
                          (t, idx) => {
                            const v1 = savedValues[t.test_id]?.L1 || "";
                            const v2 = savedValues[t.test_id]?.L2 || "";
                            const v3 = savedValues[t.test_id]?.L3 || "";
                            const theme =
                              TEST_SYNC_PALETTE[idx % TEST_SYNC_PALETTE.length];
                            const isRowActiveForScanner =
                              showImagePanel &&
                              scannerEnabled &&
                              scanTargetTestIdx === idx;

                            return (
                              <tr
                                key={t.test_id}
                                className={`transition ${
                                  isRowActiveForScanner
                                    ? theme.rowRing
                                    : "hover:bg-sky-50/40"
                                }`}
                              >
                                <td className="py-2 px-3 text-center">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setScanTargetTestIdx(idx);
                                      if (!showImagePanel)
                                        setShowImagePanel(true);
                                    }}
                                    style={{ backgroundColor: theme.hex }}
                                    title="Nhấp để khóa Kính ngắm vào xét nghiệm này"
                                    className="w-6 h-6 rounded-lg text-white font-mono font-black text-[11px] inline-flex items-center justify-center shadow-xs hover:scale-110 transition"
                                  >
                                    {idx + 1}
                                  </button>
                                </td>
                                <td className="py-2 px-3 font-black text-slate-900">
                                  <div className="flex items-center gap-1.5">
                                    <span>{t.test_name}</span>
                                    {isRowActiveForScanner && (
                                      <span
                                        style={{ backgroundColor: theme.hex }}
                                        className="text-[9.5px] text-white px-1.5 py-0.5 rounded font-black"
                                      >
                                        🎯 Đang ngắm ({scanTargetLevel})
                                      </span>
                                    )}
                                  </div>
                                  <div className="text-[10px] font-normal text-slate-400">
                                    {t.unit}
                                  </div>
                                </td>
                                <GridLevelCell
                                  test={t}
                                  lvl="L1"
                                  initialValue={v1}
                                  syncTheme={theme}
                                  isScanTarget={
                                    isRowActiveForScanner &&
                                    scanTargetLevel === "L1"
                                  }
                                  onFocusScanTarget={() => {
                                    setScanTargetTestIdx(idx);
                                    setScanTargetLevel("L1");
                                  }}
                                  inputRefCallback={(el) => {
                                    inputRefs.current[`grid-L1-${idx}`] = el;
                                  }}
                                  onNavigateRow={(delta) => {
                                    const nextEl =
                                      inputRefs.current[
                                        `grid-L1-${idx + delta}`
                                      ];
                                    if (nextEl) {
                                      nextEl.focus();
                                      nextEl.select();
                                    }
                                  }}
                                  onNavigateCol={(targetLv) => {
                                    const nextEl =
                                      inputRefs.current[
                                        `grid-${targetLv}-${idx}`
                                      ];
                                    if (nextEl) {
                                      nextEl.focus();
                                      nextEl.select();
                                      scrollGridToLevelAndRow(targetLv, idx);
                                    }
                                  }}
                                  onCommitValue={handleCommitGridValue}
                                />
                                <GridLevelCell
                                  test={t}
                                  lvl="L2"
                                  initialValue={v2}
                                  syncTheme={theme}
                                  isScanTarget={
                                    isRowActiveForScanner &&
                                    scanTargetLevel === "L2"
                                  }
                                  onFocusScanTarget={() => {
                                    setScanTargetTestIdx(idx);
                                    setScanTargetLevel("L2");
                                  }}
                                  inputRefCallback={(el) => {
                                    inputRefs.current[`grid-L2-${idx}`] = el;
                                  }}
                                  onNavigateRow={(delta) => {
                                    const nextEl =
                                      inputRefs.current[
                                        `grid-L2-${idx + delta}`
                                      ];
                                    if (nextEl) {
                                      nextEl.focus();
                                      nextEl.select();
                                    }
                                  }}
                                  onNavigateCol={(targetLv) => {
                                    const nextEl =
                                      inputRefs.current[
                                        `grid-${targetLv}-${idx}`
                                      ];
                                    if (nextEl) {
                                      nextEl.focus();
                                      nextEl.select();
                                      scrollGridToLevelAndRow(targetLv, idx);
                                    }
                                  }}
                                  onCommitValue={handleCommitGridValue}
                                />
                                <GridLevelCell
                                  test={t}
                                  lvl="L3"
                                  initialValue={v3}
                                  syncTheme={theme}
                                  isScanTarget={
                                    isRowActiveForScanner &&
                                    scanTargetLevel === "L3"
                                  }
                                  onFocusScanTarget={() => {
                                    setScanTargetTestIdx(idx);
                                    setScanTargetLevel("L3");
                                  }}
                                  inputRefCallback={(el) => {
                                    inputRefs.current[`grid-L3-${idx}`] = el;
                                  }}
                                  onNavigateRow={(delta) => {
                                    const nextEl =
                                      inputRefs.current[
                                        `grid-L3-${idx + delta}`
                                      ];
                                    if (nextEl) {
                                      nextEl.focus();
                                      nextEl.select();
                                    }
                                  }}
                                  onNavigateCol={(targetLv) => {
                                    const nextEl =
                                      inputRefs.current[
                                        `grid-${targetLv}-${idx}`
                                      ];
                                    if (nextEl) {
                                      nextEl.focus();
                                      nextEl.select();
                                      scrollGridToLevelAndRow(targetLv, idx);
                                    }
                                  }}
                                  onCommitValue={handleCommitGridValue}
                                />
                              </tr>
                            );
                          }
                        )}
                      </tbody>
                    </table>
                  </div>

                  <div className="bg-emerald-50/90 border-2 border-emerald-300 rounded-2xl p-3.5 flex flex-wrap items-center justify-between gap-3">
                    <div className="text-xs">
                      <div className="font-black text-emerald-950">
                        Chốt Lưu Dữ Liệu Bảng Thu Gọn ({selMachine} ·{" "}
                        {selControl})
                      </div>
                      <div className="text-[11px] font-semibold text-emerald-800 mt-0.5">
                        {gridExplicitSavedBanner ||
                          "Nhấn nút Lưu Kết Quả bên phải để khóa trạng thái các mức đã nhập trước khi bấm Phân tích Westgard."}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={handleExplicitSaveGridResults}
                      className="px-6 py-2.5 rounded-xl font-black text-xs uppercase bg-gradient-to-r from-emerald-500 to-teal-600 text-white border-b-4 border-emerald-800 shadow-md hover:brightness-105 flex items-center gap-2 transition shrink-0"
                    >
                      <Ic.Check /> LƯU KẾT QUẢ ĐÃ NHẬP (MỨC 1, 2, 3)
                    </button>
                  </div>
                </div>
              ) : (
                (() => {
                  const currentMac: string = selMachine;
                  const currentCtrl: string = selControl;
                  const testsInCtrl = getTestsForControl(
                    currentMac,
                    currentCtrl
                  );
                  const maxLv = Math.max(
                    1,
                    ...testsInCtrl.map((t) => t.levels_count || 2)
                  ) as 1 | 2 | 3;
                  const levelList: ("L1" | "L2" | "L3")[] =
                    maxLv === 3
                      ? ["L1", "L2", "L3"]
                      : maxLv === 2
                      ? ["L1", "L2"]
                      : ["L1"];
                  return (
                    <div
                      className={`grid grid-cols-1 ${
                        maxLv === 3
                          ? "md:grid-cols-3"
                          : maxLv === 2
                          ? "md:grid-cols-2"
                          : "md:grid-cols-1"
                      } gap-4 max-w-4xl mx-auto`}
                    >
                      {levelList.map((lvl) => {
                        const saved = isLevelSaved(
                          currentMac,
                          currentCtrl,
                          lvl
                        );
                        return (
                          <button
                            key={lvl}
                            type="button"
                            onClick={() => {
                              if (saved) {
                                setCompletedGuardModal({
                                  targetType: "LEVEL",
                                  machine: currentMac,
                                  control: currentCtrl,
                                  level: lvl,
                                });
                                return;
                              }
                              setSelLevel(lvl);
                              setActiveImageTab(lvl);
                              setScanTargetLevel(lvl);
                              const initTemp: Record<string, string> = {};
                              testsInCtrl.forEach((t) => {
                                initTemp[t.test_id] =
                                  savedValues[t.test_id]?.[lvl] ??
                                  (t.test_type === "QUALITATIVE"
                                    ? lvl === "L1"
                                      ? t.expected_qual_L1 || "ÂM TÍNH"
                                      : lvl === "L2"
                                      ? t.expected_qual_L2 || "DƯƠNG TÍNH"
                                      : t.expected_qual_L3 || "DƯƠNG TÍNH"
                                    : "");
                              });
                              setTempInputs(initTemp);
                              setStep("ENTER_RESULTS");
                            }}
                            className={`rounded-2xl p-5 text-left border-2 border-b-[5px] transition-all hover:-translate-y-0.5 ${
                              saved
                                ? "bg-gradient-to-b from-emerald-500 to-emerald-600 border-emerald-700 text-white shadow-lg"
                                : "bg-gradient-to-b from-sky-500 to-blue-600 border-blue-800 text-white shadow-lg"
                            }`}
                          >
                            <div className="flex items-center justify-between mb-2">
                              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase bg-black/20">
                                {saved
                                  ? `✓ ĐÃ NHẬP XONG ${lvl}`
                                  : lvl === "L1"
                                  ? "Mức 1"
                                  : lvl === "L2"
                                  ? "Mức 2"
                                  : "Mức 3"}
                              </span>
                              {saved && <Ic.Check />}
                            </div>
                            <div className="text-xl font-black">
                              {lvl === "L1"
                                ? "MỨC 1 (LEVEL 1)"
                                : lvl === "L2"
                                ? "MỨC 2 (LEVEL 2)"
                                : "MỨC 3 (LEVEL 3)"}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  );
                })()
              )}
            </div>
          </div>

          <div className="pt-4 border-t border-slate-200 flex flex-col items-center space-y-3">
            {activeLinkedReagentLots.length > 0 && (
              <div className="flex flex-col items-center gap-2 bg-slate-50 border border-slate-200 rounded-2xl px-4 py-2.5 text-xs max-w-4xl w-full">
                <div className="flex flex-wrap items-center justify-center gap-2.5">
                  <span className="font-black text-slate-700">
                    Theo dõi sử dụng Hóa chất (Sổ BM.16):
                  </span>
                  <select
                    value={useTimesIncrement}
                    onChange={(e) =>
                      setUseTimesIncrement(Number(e.target.value))
                    }
                    className="bg-white border border-indigo-300 rounded-lg px-2.5 py-1 font-black text-indigo-900"
                  >
                    <option value={1}>
                      +1 lần sử dụng trong ngày {formatShortDM(runDate)}
                    </option>
                    <option value={0}>
                      0 (Chỉ phân tích / sửa lại số liệu, không trừ thêm hóa
                      chất)
                    </option>
                    <option value={2}>+2 lần sử dụng (Chạy 2 ca)</option>
                  </select>
                  {alreadyUsedTodayCount > 0 && (
                    <span className="text-[11px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                      ✓ Hôm nay đã tính {alreadyUsedTodayCount} lần dùng (Đã tự
                      chuyển về 0 để tránh cộng trùng)
                    </span>
                  )}
                </div>

                {activeLinkedReagentLots.length > 1 && (
                  <div className="flex flex-wrap items-center justify-center gap-2 pt-1 border-t border-slate-200/80 w-full">
                    <span className="text-[11px] font-bold text-indigo-900">
                      Cộng đồng loạt cho các lọ QC trên máy {selMachine}:
                    </span>
                    {activeLinkedReagentLots.map((rgLot) => {
                      const isChecked = selectedReagentNamesForBM16.includes(
                        rgLot.control_name
                      );
                      return (
                        <label
                          key={rgLot.control_id}
                          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[11px] font-black cursor-pointer transition ${
                            isChecked
                              ? "bg-emerald-100 border-emerald-400 text-emerald-950"
                              : "bg-white border-slate-300 text-slate-500"
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={(e) => {
                              const checked = e.target.checked;
                              setSelectedReagentNamesForBM16((prev) =>
                                checked
                                  ? Array.from(
                                      new Set([...prev, rgLot.control_name])
                                    )
                                  : prev.filter((x) => x !== rgLot.control_name)
                              );
                            }}
                            className="accent-emerald-600 rounded"
                          />
                          <span>
                            {rgLot.control_name} (Lô {rgLot.lot_number})
                          </span>
                        </label>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            <div className="text-xs font-bold text-slate-600">
              Chọn Chế Độ Xét Quy Tắc Westgard & Mở Bản Phân Tích Chi Tiết:
            </div>
            <div className="flex flex-wrap items-center justify-center gap-4">
              <button
                type="button"
                onClick={() => handleExecuteWestgardAnalysis("NORMAL")}
                className="px-6 py-3 rounded-xl font-black text-xs uppercase bg-gradient-to-r from-blue-600 to-indigo-600 text-white border-b-4 border-indigo-900 shadow-md hover:brightness-105 transition"
              >
                1. Phân Tích Westgard Thông Thường
              </button>
              <button
                type="button"
                onClick={() => handleExecuteWestgardAnalysis("SIGMA")}
                className="px-6 py-3 rounded-xl font-black text-xs uppercase bg-gradient-to-r from-purple-600 to-fuchsia-600 text-white border-b-4 border-purple-900 shadow-md hover:brightness-105 transition"
              >
                2. Phân Tích Westgard Sigma (SOP 31 / BM.08)
              </button>
            </div>
          </div>
        </div>
      )}

      {step === "ENTER_RESULTS" && selMachine && selControl && (
        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-5 pb-3 border-b border-slate-200">
            <div>
              <span className="px-3 py-1 rounded-full text-xs font-extrabold bg-blue-600 text-white">
                Đang nhập{" "}
                {selLevel === "L1"
                  ? "Mức 1"
                  : selLevel === "L2"
                  ? "Mức 2"
                  : "Mức 3"}
              </span>
              <h2 className="text-lg font-black text-slate-900 mt-1.5">
                {selMachine} — {selControl}
              </h2>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setActiveImageTab(selLevel);
                  setScanTargetLevel(selLevel);
                  setShowImagePanel((p) => !p);
                }}
                className={`px-3.5 py-2 rounded-xl text-xs font-black border flex items-center gap-1.5 transition ${
                  showImagePanel
                    ? "bg-indigo-600 text-white border-indigo-700"
                    : "bg-indigo-50 text-indigo-900 border-indigo-200"
                }`}
              >
                <Ic.Camera />
                <span>
                  {showImagePanel
                    ? "Ẩn Khung Ảnh"
                    : `📷 Mở Ảnh & Kính Ngắm ${selLevel}`}
                </span>
              </button>
              <button
                type="button"
                onClick={() => setStep("SELECT_LEVEL")}
                className="flex items-center gap-1.5 text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 px-4 py-2 rounded-xl"
              >
                <Ic.Back /> Quay lại chọn Mức
              </button>
            </div>
          </div>

          <div
            className={`grid grid-cols-1 ${
              showImagePanel
                ? "lg:grid-cols-12 gap-4 items-start"
                : "max-w-4xl mx-auto"
            }`}
          >
            {showImagePanel && (
              <div className="lg:col-span-5">{renderSplitImageViewer()}</div>
            )}

            <div
              className={`space-y-3 ${
                showImagePanel ? "lg:col-span-7" : "w-full"
              }`}
            >
              {getTestsForControl(selMachine, selControl).map((t, idx) => {
                if (selLevel === "L2" && t.levels_count < 2) return null;
                if (selLevel === "L3" && t.levels_count < 3) return null;
                const mean =
                  selLevel === "L1"
                    ? t.mean_L1
                    : selLevel === "L2"
                    ? t.mean_L2
                    : t.mean_L3;
                const sd =
                  selLevel === "L1"
                    ? t.sd_L1
                    : selLevel === "L2"
                    ? t.sd_L2
                    : t.sd_L3;
                const expectedQual =
                  selLevel === "L1"
                    ? t.expected_qual_L1 || "ÂM TÍNH"
                    : selLevel === "L2"
                    ? t.expected_qual_L2 || "DƯƠNG TÍNH"
                    : t.expected_qual_L3 || "DƯƠNG TÍNH";
                const val =
                  tempInputs[t.test_id] ??
                  savedValues[t.test_id]?.[selLevel] ??
                  "";
                const cleanVal = val.trim().replace(/,/g, ".");
                const num = cleanVal !== "" ? parseFloat(cleanVal) : null;
                const z =
                  t.test_type !== "QUALITATIVE" &&
                  num !== null &&
                  !isNaN(num) &&
                  sd > 0
                    ? (num - mean) / sd
                    : null;
                const sdBadge = z !== null ? formatSDPositionBadge(z) : null;
                const theme = TEST_SYNC_PALETTE[idx % TEST_SYNC_PALETTE.length];
                const isCardTargeted =
                  showImagePanel && scannerEnabled && scanTargetTestIdx === idx;

                return (
                  <div
                    key={t.test_id}
                    className={`flex flex-col md:flex-row md:items-center justify-between gap-3 p-3.5 rounded-2xl border transition ${
                      isCardTargeted
                        ? theme.rowRing
                        : "bg-slate-50/90 border-slate-200 hover:border-blue-300"
                    }`}
                  >
                    <div className="flex items-center gap-3.5">
                      <button
                        type="button"
                        onClick={() => {
                          setScanTargetTestIdx(idx);
                          setScanTargetLevel(selLevel);
                          if (!showImagePanel) setShowImagePanel(true);
                        }}
                        style={{ backgroundColor: theme.hex }}
                        title="Nhấp để khóa Kính ngắm vào xét nghiệm này"
                        className="w-8 h-8 rounded-xl text-white font-mono font-black text-sm flex items-center justify-center shadow-sm hover:scale-105 transition"
                      >
                        {idx + 1}
                      </button>
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-base font-black text-slate-900">
                            {t.test_name}
                          </span>
                          <span className="text-xs font-semibold text-slate-500">
                            ({t.unit})
                          </span>
                          {t.standard_label === "ISO" && (
                            <span className="rounded-full px-2.5 py-0.5 text-[10px] font-black uppercase whitespace-nowrap bg-blue-600 text-white inline-flex items-center justify-center tracking-wider shadow-sm">
                              ISO 15189
                            </span>
                          )}
                        </div>
                        {t.test_type !== "QUALITATIVE" ? (
                          <div className="flex items-center gap-2 mt-1">
                            <span className="px-2.5 py-0.5 rounded-md bg-blue-100 text-blue-950 font-mono font-black text-xs border border-blue-300">
                              MEAN: {mean}
                            </span>
                            <span className="px-2 py-0.5 rounded-md bg-slate-200 text-slate-800 font-mono font-bold text-xs">
                              SD: ±{sd}
                            </span>
                          </div>
                        ) : (
                          <div className="mt-1">
                            <span className="px-2.5 py-0.5 rounded-md bg-emerald-100 text-emerald-900 font-bold text-xs border border-emerald-300">
                              Chứng chuẩn mong đợi: {expectedQual}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-3 justify-end">
                      {t.test_type !== "QUALITATIVE" ? (
                        <>
                          {sdBadge && (
                            <span
                              className={`text-xs font-extrabold px-3 py-1.5 rounded-xl border ${sdBadge.cls}`}
                            >
                              {sdBadge.text}
                            </span>
                          )}
                          <input
                            ref={(el) => {
                              inputRefs.current[`entry-${idx}`] = el;
                            }}
                            type="text"
                            inputMode="decimal"
                            onFocus={(e) => {
                              e.currentTarget.select();
                              setScanTargetTestIdx(idx);
                              setScanTargetLevel(selLevel);
                            }}
                            onWheel={(e) => e.currentTarget.blur()}
                            value={val}
                            placeholder="Nhập số..."
                            style={
                              isCardTargeted
                                ? {
                                    borderColor: theme.hex,
                                    boxShadow: `0 0 0 3px ${theme.hex}33`,
                                  }
                                : undefined
                            }
                            onChange={(e) => {
                              const nextVal = e.target.value.replace(/,/g, ".");
                              setTempInputs((prev) => ({
                                ...prev,
                                [t.test_id]: nextVal,
                              }));
                              handleCommitGridValue(
                                t.test_id,
                                selLevel,
                                nextVal
                              );
                            }}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" || e.key === "ArrowDown") {
                                e.preventDefault();
                                const nextEl =
                                  inputRefs.current[`entry-${idx + 1}`];
                                if (nextEl) {
                                  nextEl.focus();
                                  nextEl.select();
                                }
                              } else if (e.key === "ArrowUp") {
                                e.preventDefault();
                                const prevEl =
                                  inputRefs.current[`entry-${idx - 1}`];
                                if (prevEl) {
                                  prevEl.focus();
                                  prevEl.select();
                                }
                              }
                            }}
                            className="w-36 bg-white border-2 border-slate-300 focus:border-blue-600 text-slate-900 font-mono font-black text-base text-right px-3.5 py-2 rounded-xl shadow-inner outline-none"
                          />
                        </>
                      ) : (
                        <select
                          value={val || expectedQual}
                          onChange={(e) => {
                            const nextVal = e.target.value;
                            setTempInputs((prev) => ({
                              ...prev,
                              [t.test_id]: nextVal,
                            }));
                            handleCommitGridValue(t.test_id, selLevel, nextVal);
                          }}
                          className="bg-white border-2 border-slate-300 rounded-xl px-3.5 py-2 font-black text-xs text-slate-900"
                        >
                          {QUALITATIVE_OPTIONS.map((opt) => (
                            <option key={opt} value={opt}>
                              {opt}
                            </option>
                          ))}
                        </select>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="mt-6 flex justify-end max-w-4xl mx-auto">
            <button
              type="button"
              onClick={() => {
                const currentMac: string = selMachine;
                const currentCtrl: string = selControl;
                const tests = getTestsForControl(currentMac, currentCtrl);
                const linkedCtrls = getLinkedControlsForCurrentRun(
                  currentMac,
                  currentCtrl
                );
                setSavedValues((prev) => {
                  const next = { ...prev };
                  tests.forEach((t) => {
                    const raw = (
                      tempInputs[t.test_id] ??
                      prev[t.test_id]?.[selLevel] ??
                      (t.test_type === "QUALITATIVE"
                        ? selLevel === "L1"
                          ? t.expected_qual_L1 || "ÂM TÍNH"
                          : selLevel === "L2"
                          ? t.expected_qual_L2 || "DƯƠNG TÍNH"
                          : t.expected_qual_L3 || "DƯƠNG TÍNH"
                        : "")
                    )
                      .trim()
                      .replace(/,/g, ".");
                    next[t.test_id] = {
                      ...(next[t.test_id] || {}),
                      [selLevel]: raw,
                    };
                  });
                  return next;
                });
                setSavedLevels((prev) => {
                  const next = { ...prev };
                  linkedCtrls.forEach((cName) => {
                    const k = ctrlKey(currentMac, cName);
                    next[k] = {
                      ...(prev[k] || { L1: false, L2: false, L3: false }),
                      [selLevel]: true,
                    };
                  });
                  return next;
                });
                setStep("SELECT_LEVEL");
              }}
              className="px-8 py-3.5 rounded-xl font-black text-sm uppercase bg-gradient-to-r from-emerald-500 to-teal-600 text-white border-b-4 border-emerald-800 shadow-lg hover:brightness-105 flex items-center gap-2"
            >
              <Ic.Check /> LƯU KẾT QUẢ{" "}
              {selLevel === "L1"
                ? "MỨC 1"
                : selLevel === "L2"
                ? "MỨC 2"
                : "MỨC 3"}
            </button>
          </div>
        </div>
      )}

      {step === "ANALYSIS_REPORT" && selMachine && selControl && (
        <div className="bg-white border-2 border-indigo-200 rounded-3xl p-6 shadow-lg space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-4">
            <div>
              <span className="px-3 py-0.5 rounded-full text-[10px] font-black uppercase bg-indigo-600 text-white">
                Bản Phân Tích Chi Tiết Nội Kiểm ·{" "}
                {lastAnalysisMode === "SIGMA"
                  ? "Chế độ Westgard Sigma (SOP 31 / BM.08)"
                  : "Chế độ Đa quy tắc Westgard Chuẩn"}
              </span>
              <h2 className="text-lg font-black text-slate-900 mt-1">
                Kết Quả Đánh Giá Nội Kiểm — {selMachine} ({selControl})
              </h2>
              <div className="text-xs font-semibold text-slate-500 mt-0.5">
                Ngày thực hiện: <b>{formatDateVN(runDate)}</b> · Người thực
                hiện: <b>{currentUser.name}</b>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setStep("SELECT_LEVEL")}
                className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-xs flex items-center gap-1.5"
              >
                ✏️ Quay lại Sửa số liệu
              </button>
              <button
                type="button"
                onClick={() => setStep("SELECT_MACHINE")}
                className="px-5 py-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:brightness-105 text-white font-black text-xs shadow-md"
              >
                ✓ Hoàn tất & Chọn Máy khác
              </button>
            </div>
          </div>

          {(() => {
            const activeRows = evalRows.filter((r) => r.status !== "SKIP");
            const passCount = activeRows.filter(
              (r) => r.status === "PASS"
            ).length;
            const warnCount = activeRows.filter(
              (r) => r.status === "WARN"
            ).length;
            const failCount = activeRows.filter(
              (r) => r.status === "FAIL"
            ).length;

            return (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
                <div className="bg-slate-50 border border-slate-200 rounded-2xl p-3.5">
                  <div className="text-[10.5px] font-black uppercase text-slate-500">
                    Tổng số xét nghiệm đã chạy
                  </div>
                  <div className="text-2xl font-black text-slate-900 mt-1">
                    {activeRows.length} / {evalRows.length} Test
                  </div>
                </div>
                <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-3.5">
                  <div className="text-[10.5px] font-black uppercase text-emerald-700">
                    ✓ Đạt chuẩn (Chấp nhận ngay)
                  </div>
                  <div className="text-2xl font-black text-emerald-800 mt-1">
                    {passCount} Test
                  </div>
                </div>
                <div className="bg-amber-50 border border-amber-200 rounded-2xl p-3.5">
                  <div className="text-[10.5px] font-black uppercase text-amber-800">
                    ⚠️ Cảnh báo 1-2s (Không loại bỏ KQ)
                  </div>
                  <div className="text-2xl font-black text-amber-900 mt-1">
                    {warnCount} Test
                  </div>
                </div>
                <div className="bg-rose-50 border border-rose-300 rounded-2xl p-3.5">
                  <div className="text-[10.5px] font-black uppercase text-rose-700">
                    🚨 Vi phạm bác bỏ (Cần khắc phục)
                  </div>
                  <div className="text-2xl font-black text-rose-800 mt-1">
                    {failCount} Test
                  </div>
                </div>
              </div>
            );
          })()}

          <div className="overflow-x-auto border border-slate-200 rounded-2xl">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-900 text-white uppercase text-[10.5px]">
                  <th className="py-3 px-3 w-10 text-center">STT</th>
                  <th className="py-3 px-3">Xét nghiệm</th>
                  <th className="py-3 px-3 text-right">Mức 1 (L1)</th>
                  <th className="py-3 px-3 text-right">Mức 2 (L2)</th>
                  <th className="py-3 px-3 text-right">Mức 3 (L3)</th>
                  <th className="py-3 px-3 text-center">Kết luận</th>
                  <th className="py-3 px-3">
                    Luật áp dụng (BM.08) & Quy tắc phát hiện
                  </th>
                  <th className="py-3 px-3">
                    Loại sai số & Hướng dẫn xử lý / Khắc phục
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {evalRows.map((row, idx) => {
                  const isQual = row.test.test_type === "QUALITATIVE";
                  const allRules = [
                    ...row.singleLevelRules,
                    ...row.crossLevelRules,
                  ];
                  return (
                    <tr
                      key={row.test.test_id}
                      className={
                        row.status === "FAIL"
                          ? "bg-rose-50/60"
                          : row.status === "WARN"
                          ? "bg-amber-50/40"
                          : "bg-white hover:bg-slate-50/70"
                      }
                    >
                      <td className="py-3 px-3 text-center font-mono font-bold text-slate-500">
                        {idx + 1}
                      </td>
                      <td className="py-3 px-3 font-black text-slate-900">
                        <div>
                          {row.test.test_name}{" "}
                          <span className="text-[10.5px] font-normal text-slate-500">
                            ({row.test.unit})
                          </span>
                        </div>
                        <div className="text-[10px] font-mono text-indigo-700 mt-0.5">
                          {row.test.levels_count === 3
                            ? "Xét phối hợp 3 mức"
                            : `${row.test.levels_count} mức nồng độ`}
                        </div>
                      </td>

                      <td className="py-3 px-3 text-right font-mono whitespace-nowrap">
                        {isQual ? (
                          <b>{row.qualL1 || "—"}</b>
                        ) : row.valL1 !== null ? (
                          <div>
                            <b className="text-slate-900">{row.valL1}</b>
                            <span
                              className={`block text-[10.5px] font-bold ${
                                Math.abs(row.zL1 || 0) >= 3
                                  ? "text-rose-600"
                                  : Math.abs(row.zL1 || 0) >= 2
                                  ? "text-amber-700"
                                  : "text-emerald-700"
                              }`}
                            >
                              {(row.zL1 || 0) >= 0 ? "+" : ""}
                              {row.zL1?.toFixed(2)}SD
                            </span>
                          </div>
                        ) : (
                          "—"
                        )}
                      </td>

                      <td className="py-3 px-3 text-right font-mono whitespace-nowrap">
                        {row.test.levels_count < 2 ? (
                          <span className="text-slate-300">—</span>
                        ) : isQual ? (
                          <b>{row.qualL2 || "—"}</b>
                        ) : row.valL2 !== null ? (
                          <div>
                            <b className="text-slate-900">{row.valL2}</b>
                            <span
                              className={`block text-[10.5px] font-bold ${
                                Math.abs(row.zL2 || 0) >= 3
                                  ? "text-rose-600"
                                  : Math.abs(row.zL2 || 0) >= 2
                                  ? "text-amber-700"
                                  : "text-emerald-700"
                              }`}
                            >
                              {(row.zL2 || 0) >= 0 ? "+" : ""}
                              {row.zL2?.toFixed(2)}SD
                            </span>
                          </div>
                        ) : (
                          "—"
                        )}
                      </td>

                      <td className="py-3 px-3 text-right font-mono whitespace-nowrap">
                        {row.test.levels_count < 3 ? (
                          <span className="text-slate-300">—</span>
                        ) : isQual ? (
                          <b>{row.qualL3 || "—"}</b>
                        ) : row.valL3 !== null ? (
                          <div>
                            <b className="text-slate-900">{row.valL3}</b>
                            <span
                              className={`block text-[10.5px] font-bold ${
                                Math.abs(row.zL3 || 0) >= 3
                                  ? "text-rose-600"
                                  : Math.abs(row.zL3 || 0) >= 2
                                  ? "text-amber-700"
                                  : "text-emerald-700"
                              }`}
                            >
                              {(row.zL3 || 0) >= 0 ? "+" : ""}
                              {row.zL3?.toFixed(2)}SD
                            </span>
                          </div>
                        ) : (
                          "—"
                        )}
                      </td>

                      <td className="py-3 px-3 text-center whitespace-nowrap">
                        <span
                          className={`px-2.5 py-1 rounded-full text-[10px] font-black uppercase border ${
                            row.status === "FAIL"
                              ? "bg-rose-600 text-white border-rose-700"
                              : row.status === "WARN"
                              ? "bg-amber-100 text-amber-900 border-amber-300"
                              : row.status === "PASS"
                              ? "bg-emerald-100 text-emerald-800 border-emerald-300"
                              : "bg-slate-100 text-slate-500 border-slate-200"
                          }`}
                        >
                          {row.status === "FAIL"
                            ? "Bác bỏ (FAIL)"
                            : row.status === "WARN"
                            ? "Cảnh báo 1-2s"
                            : row.status === "PASS"
                            ? "Đạt chuẩn"
                            : "Chưa nhập"}
                        </span>
                      </td>

                      <td className="py-3 px-3">
                        <div className="text-[10.5px] font-bold text-indigo-900 bg-indigo-50 border border-indigo-200 rounded px-2 py-0.5 inline-block mb-1">
                          Luật: {row.appliedRuleSetLabel || "Westgard"}
                        </div>
                        {allRules.length > 0 ? (
                          <div className="font-mono font-black text-rose-700">
                            {allRules.join(" · ")}
                          </div>
                        ) : (
                          <div className="text-emerald-700 font-bold">
                            ✓ Không vi phạm quy tắc bác bỏ
                          </div>
                        )}
                        {row.advisoryNotes && row.advisoryNotes.length > 0 && (
                          <div className="text-[10.5px] text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-1.5 mt-1 font-medium leading-snug">
                            💡 {row.advisoryNotes.join(" ")}
                          </div>
                        )}
                      </td>

                      <td className="py-3 px-3 min-w-[260px]">
                        <div className="font-black text-slate-800">
                          {row.errorType}
                        </div>
                        <div className="text-[11px] text-slate-600 mt-0.5">
                          {row.suggestion}
                        </div>

                        {row.status === "FAIL" && (
                          <div className="mt-2 pt-2 border-t border-rose-200 space-y-1.5">
                            <input
                              type="text"
                              value={row.cause}
                              onChange={(e) => {
                                const val = e.target.value;
                                setEvalRows((prev) =>
                                  prev.map((r, i) =>
                                    i === idx ? { ...r, cause: val } : r
                                  )
                                );
                              }}
                              placeholder="Nhập nguyên nhân vi phạm..."
                              className="w-full bg-white border border-rose-300 rounded-lg px-2 py-1 text-[11px] font-bold"
                            />
                            <div className="flex flex-wrap gap-1">
                              {SUGGESTED_CAUSES.slice(0, 3).map((c) => (
                                <button
                                  key={c}
                                  type="button"
                                  onClick={() =>
                                    setEvalRows((prev) =>
                                      prev.map((r, i) =>
                                        i === idx
                                          ? {
                                              ...r,
                                              cause: r.cause
                                                ? `${r.cause}; ${c}`
                                                : c,
                                            }
                                          : r
                                      )
                                    )
                                  }
                                  className="px-1.5 py-0.5 bg-white hover:bg-rose-100 border border-rose-200 rounded text-[9.5px] font-semibold text-rose-900"
                                >
                                  + {c}
                                </button>
                              ))}
                            </div>
                            <input
                              type="text"
                              value={row.actionTaken}
                              onChange={(e) => {
                                const val = e.target.value;
                                setEvalRows((prev) =>
                                  prev.map((r, i) =>
                                    i === idx ? { ...r, actionTaken: val } : r
                                  )
                                );
                              }}
                              placeholder="Nhập hành động khắc phục..."
                              className="w-full bg-white border border-rose-300 rounded-lg px-2 py-1 text-[11px] font-bold"
                            />
                            <div className="flex flex-wrap gap-1">
                              {SUGGESTED_ACTIONS.slice(0, 3).map((a) => (
                                <button
                                  key={a}
                                  type="button"
                                  onClick={() =>
                                    setEvalRows((prev) =>
                                      prev.map((r, i) =>
                                        i === idx
                                          ? {
                                              ...r,
                                              actionTaken: r.actionTaken
                                                ? `${r.actionTaken}; ${a}`
                                                : a,
                                            }
                                          : r
                                      )
                                    )
                                  }
                                  className="px-1.5 py-0.5 bg-white hover:bg-rose-100 border border-rose-200 rounded text-[9.5px] font-semibold text-rose-900"
                                >
                                  + {a}
                                </button>
                              ))}
                            </div>
                            <button
                              type="button"
                              onClick={() =>
                                handleSaveInlineCorrectiveInReport(
                                  idx,
                                  row.test.test_id,
                                  row.cause,
                                  row.actionTaken
                                )
                              }
                              className="px-3 py-1 rounded-lg bg-rose-600 hover:bg-rose-700 text-white font-black text-[10.5px] shadow-xs"
                            >
                              ✓ Lưu nguyên nhân vào Sổ BM.09
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {completedGuardModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white border-2 border-amber-400 rounded-3xl w-full max-w-lg p-6 shadow-2xl space-y-4">
            <div className="flex items-start justify-between border-b border-slate-100 pb-3">
              <div>
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase bg-amber-500 text-white">
                  Kiểm soát Phiên Đã Hoàn Tất Trong Ngày
                </span>
                <h3 className="text-base font-black text-slate-900 mt-1">
                  {completedGuardModal.targetType === "MACHINE"
                    ? `Thiết bị [${completedGuardModal.machine}] đã nhập xong QC!`
                    : completedGuardModal.targetType === "CONTROL"
                    ? `Hóa chất [${completedGuardModal.control}] đã nhập xong QC!`
                    : `Mức nồng độ [${completedGuardModal.level}] đã được lưu xong!`}
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Ngày thực hiện: <b>{formatDateVN(runDate)}</b>. Vui lòng chọn
                  thao tác bạn muốn thực hiện để tránh ghi đè nhầm dữ liệu:
                </p>
              </div>
              <button
                type="button"
                onClick={() => setCompletedGuardModal(null)}
                className="px-2.5 py-1 rounded-xl bg-slate-100 hover:bg-slate-200 font-bold text-slate-600 text-xs"
              >
                ✕ Đóng
              </button>
            </div>

            <div className="space-y-2.5 text-xs">
              <button
                type="button"
                onClick={() => {
                  const mac = completedGuardModal.machine;
                  const ctrl = completedGuardModal.control;
                  setCompletedGuardModal(null);
                  handleViewTodayAnalysisForMachine(mac, ctrl);
                }}
                className="w-full p-3.5 rounded-2xl bg-indigo-50 hover:bg-indigo-100 border-2 border-indigo-200 text-left transition flex items-center justify-between"
              >
                <div>
                  <div className="font-black text-indigo-950 text-sm">
                    1. 📊 Xem lại Bản Phân Tích Chi Tiết Kết Quả Hôm Nay
                  </div>
                  <div className="text-slate-600 mt-0.5">
                    Mở ngay bảng đánh giá quy tắc Westgard & Six Sigma của các
                    số liệu đã lưu.
                  </div>
                </div>
                <span className="font-black text-indigo-700 text-base">➔</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  const { targetType, machine, control, level } =
                    completedGuardModal;
                  hydrateSavedValuesFromTodayHistory(machine, control);
                  setCompletedGuardModal(null);

                  if (targetType === "MACHINE") {
                    setSelMachine(machine);
                    setStep("SELECT_CONTROL");
                  } else if (targetType === "CONTROL" && control) {
                    setSelMachine(machine);
                    setSelControl(control);
                    setStep("SELECT_LEVEL");
                  } else if (targetType === "LEVEL" && control && level) {
                    const testsInCtrl = getTestsForControl(machine, control);
                    setSelLevel(level);
                    setActiveImageTab(level);
                    setScanTargetLevel(level);
                    const initTemp: Record<string, string> = {};
                    testsInCtrl.forEach((t) => {
                      const pHist = (
                        level === "L1"
                          ? t.history_L1
                          : level === "L2"
                          ? t.history_L2
                          : t.history_L3 || []
                      ).find((p) => p.isoDate === runDate && !p.is_rerun);
                      initTemp[t.test_id] =
                        savedValues[t.test_id]?.[level] ??
                        (pHist !== undefined ? String(pHist.val) : "");
                    });
                    setTempInputs(initTemp);
                    setStep("ENTER_RESULTS");
                  }
                }}
                className="w-full p-3.5 rounded-2xl bg-amber-50 hover:bg-amber-100 border-2 border-amber-300 text-left transition flex items-center justify-between"
              >
                <div>
                  <div className="font-black text-amber-950 text-sm">
                    2. ✏️ Mở khóa Chỉnh sửa lại kết quả đã nhập (Audit Trail)
                  </div>
                  <div className="text-slate-600 mt-0.5">
                    Nạp lại đúng các con số đã lưu hôm nay để sửa lỗi gõ nhầm
                    (Tự động lưu vết kiểm toán ISO 15189).
                  </div>
                </div>
                <span className="font-black text-amber-800 text-base">➔</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  const { targetType, machine, control } = completedGuardModal;
                  setCompletedGuardModal(null);
                  setSelMachine(machine);
                  if (targetType === "MACHINE") {
                    setStep("SELECT_CONTROL");
                  } else if (control) {
                    setSelControl(control);
                    handleClearCurrentControlInputs();
                    setStep("SELECT_LEVEL");
                  }
                }}
                className="w-full p-3.5 rounded-2xl bg-sky-50 hover:bg-sky-100 border-2 border-sky-200 text-left transition flex items-center justify-between"
              >
                <div>
                  <div className="font-black text-sky-950 text-sm">
                    3. 🔄 Nhập mẻ chạy mới / Chạy bổ sung từ đầu
                  </div>
                  <div className="text-slate-600 mt-0.5">
                    Làm trống các ô nhập để thực hiện một lần chạy nội kiểm mới.
                  </div>
                </div>
                <span className="font-black text-sky-700 text-base">➔</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
// ================= KẾT THÚC TOÀN BỘ FILE NhapKetQuaQC.tsx =================
