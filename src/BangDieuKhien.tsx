import React, { useState, useMemo, useCallback } from "react";
import {
  TestConfig,
  ReagentLotBM16,
  BM09LogEntry,
  UserAccount,
  HistoryPoint,
  SectionLock,
  getReagentThreshold75,
  isReagentReached75,
  formatDateVN,
  getVnIsoDateString,
  getVnTimeString,
  formatShortDM,
  computeMuAndSigma,
  rpcCall,
  hasPermission,
  sortHistoryChronologically,
  QUALITATIVE_OPTIONS,
  SUGGESTED_CAUSES,
  SUGGESTED_ACTIONS,
  formatSDPositionBadge,
  roundSmartDecimal,
} from "./KieuDuLieu";

// ============================================================================
// FILE 2: src/BangDieuKhien.tsx — FULL MODULE (HYBRID MASTER: CŨ + MỚI HỢP NHẤT)
// - Bảo tồn 100% 4 Thẻ Metric Gradient, 4 Khung mở rộng (Tím Neon) & Sơ đồ
//   Trạng thái Thiết bị Xét nghiệm (Hình 1 - Bảng điều khiển cũ).
// - Bảo tồn 100% Bảng Giám sát BM.09 hiển thị đầy đủ các lọ Hóa chất QC đa mức
//   (L1, L2, L3) bằng huy hiệu màu Pastel sắc nét (Hình 2 - Bảng điều khiển mới).
// - Bảo tồn 100% Modal Khắc phục sự cố & Nhập kết quả chạy lại đa mức L1·L2·L3
//   (gắn đúng Số Lô độc lập từng mức khi đẩy điểm chạy lại lên Biểu đồ L-J).
// ✦ An intellectual product by Handsome Long ✦
// ============================================================================

const Ic = {
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
  Pin: () => (
    <span className="text-rose-500 mr-1.5 inline-block -rotate-45">📌</span>
  ),
  Siren: () => <span className="text-rose-500 mr-1.5 inline-block">🚨</span>,
  Calendar: () => <span className="text-blue-500 mr-1.5 inline-block">📅</span>,
  Folder: () => <span className="text-amber-400 mr-1.5 inline-block">📁</span>,
  Wrench: () => (
    <svg
      width="12"
      height="12"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      viewBox="0 0 24 24"
      className="mr-1.5"
    >
      <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
    </svg>
  ),
  BarChart: () => (
    <svg
      width="12"
      height="12"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      viewBox="0 0 24 24"
    >
      <line x1="18" y1="20" x2="18" y2="10" />
      <line x1="12" y1="20" x2="12" y2="4" />
      <line x1="6" y1="20" x2="6" y2="14" />
    </svg>
  ),
};

export interface BangDieuKhienProps {
  apiUrl: string;
  authToken: string;
  currentUser: UserAccount;
  runDate?: string;
  configs: TestConfig[];
  setConfigs?: React.Dispatch<React.SetStateAction<TestConfig[]>>;
  reagents: ReagentLotBM16[];
  setReagents?: React.Dispatch<React.SetStateAction<ReagentLotBM16[]>>;
  bm09Logs: BM09LogEntry[];
  setBm09Logs: React.Dispatch<React.SetStateAction<BM09LogEntry[]>>;
  sections?: string[];
  labMachines?: { section: string; machine: string }[];
  sectionLocks?: SectionLock[];
  onNavigateToAssistant?: (payload?: any) => void;
  onNavigateToLJChart?: (testId: string, isoOnly?: boolean) => void;
  onNavigateToLjChart?: (testId?: string) => void;
  onNavigateToKiosk?: () => void;
  onNavigateToCatalog?: () => void;
  onNavigateToIsoPrint?: (subTab?: any) => void;
  onSelectTab?: (tab: any) => void;
}

export type Bm09FilterMode =
  | "TODAY_AND_PENDING"
  | "UNRESOLVED_ONLY"
  | "TODAY_ALL"
  | "ALL_HISTORY";

export interface ControlLotBadgeItem {
  levelTag?: "L1" | "L2" | "L3";
  controlName: string;
  lotNumber: string;
}

interface CorrectiveModalState {
  logIndex: number;
  log: BM09LogEntry;
  testConfig?: TestConfig;
  runId: string;
  testId: string;
  testName: string;
  machineName: string;
  controlName: string;
  lotNumber: string;
  runDate: string;
  runTime: string;
  rulesText: string;
  cause: string;
  action: string;
  violatedLevels: ("L1" | "L2" | "L3")[];
  allAvailableLevels: ("L1" | "L2" | "L3")[];
  reRunInputs: Record<"L1" | "L2" | "L3", string>;
  postFixResultText: string;
  checkerNameDraft: string;
  adminStatusOverride: "PASS" | "WARN" | "FAIL";
  adminResolvedOverride: boolean;
}

/**
 * Tự động giải mã đầy đủ danh sách Hóa chất QC & Số Lô thực tế đã chạy của 1 dòng BM.09.
 * Hỗ trợ:
 * 1. Xét nghiệm đã gắn control_name_L1 / L2 / L3 riêng biệt.
 * 2. Bản ghi BM.09 có chuỗi control_name gộp (ngăn cách bởi " · ").
 * 3. Các máy có bộ hóa chất nhiều lọ độc lập trong Danh mục (VD: SYSMEX CS-2500 có
 *    Dade Citrol 1, Dade Citrol 2, Control Plasma P) giúp ưu tiên ghép đúng Citrol 2
 *    cho Mức 2 (L2) và Control Plasma P cho Mức 3 (L3).
 */
export function resolveControlLotsForBm09Entry(
  log: BM09LogEntry,
  configs: TestConfig[],
  reagents: ReagentLotBM16[]
): ControlLotBadgeItem[] {
  const hasL1 =
    (log.val_L1 !== null && log.val_L1 !== undefined) || Boolean(log.qual_L1);
  const hasL2 =
    (log.val_L2 !== null && log.val_L2 !== undefined) || Boolean(log.qual_L2);
  const hasL3 =
    (log.val_L3 !== null && log.val_L3 !== undefined) || Boolean(log.qual_L3);

  const activeLvKeys: ("L1" | "L2" | "L3")[] = [];
  if (hasL1) activeLvKeys.push("L1");
  if (hasL2) activeLvKeys.push("L2");
  if (hasL3) activeLvKeys.push("L3");
  if (activeLvKeys.length === 0) activeLvKeys.push("L1");

  // 1. Nếu chuỗi log.control_name đã chứa nhiều lọ ngăn cách bởi " · "
  if (log.control_name && log.control_name.indexOf(" · ") !== -1) {
    const parts = log.control_name
      .split(" · ")
      .map((s) => s.trim())
      .filter(Boolean);
    const parsed: ControlLotBadgeItem[] = parts
      .slice(0, activeLvKeys.length)
      .map((p, idx) => {
        const m = p.match(/^(.*?)\s*\(\s*Lô:\s*([^)]+)\)$/i);
        const lvTag: "L1" | "L2" | "L3" =
          activeLvKeys[idx] || (idx === 0 ? "L1" : idx === 1 ? "L2" : "L3");
        if (m) {
          return {
            levelTag: lvTag,
            controlName: m[1].trim(),
            lotNumber: m[2].trim(),
          };
        }
        return {
          levelTag: lvTag,
          controlName: p,
          lotNumber: log.lot_number || "",
        };
      });
    if (parsed.length > 0) return parsed;
  }

  const matchedCfg = configs.find(
    (c) =>
      c.test_id === log.test_id ||
      (c.machine_name === log.machine_name && c.test_name === log.test_name)
  );

  // Lấy danh sách các lọ hóa chất đang khai báo trên thiết bị này
  const machineReagentsMap = new Map<string, ReagentLotBM16>();
  reagents
    .filter((r) => r.machine_name === log.machine_name)
    .forEach((r) => {
      machineReagentsMap.set(r.control_name.trim().toUpperCase(), r);
    });
  const distinctMachineReagents = Array.from(machineReagentsMap.values());

  const findLotForControlName = (
    ctrlName: string,
    fallbackLot: string
  ): string => {
    const found = machineReagentsMap.get(ctrlName.trim().toUpperCase());
    return found?.lot_number || fallbackLot;
  };

  // 2. Kiểm tra nếu cấu hình xét nghiệm đã có control_name_L1 / L2 / L3 riêng
  const cfgCtrlL1 =
    matchedCfg?.control_name_L1 || matchedCfg?.control_name || log.control_name;
  const cfgLotL1 =
    matchedCfg?.lot_number_L1 ||
    findLotForControlName(cfgCtrlL1, matchedCfg?.lot_number || log.lot_number);

  let cfgCtrlL2 = matchedCfg?.control_name_L2 || "";
  let cfgLotL2 = matchedCfg?.lot_number_L2 || "";

  let cfgCtrlL3 = matchedCfg?.control_name_L3 || "";
  let cfgLotL3 = matchedCfg?.lot_number_L3 || "";

  // 3. Nếu chưa gán tường minh control_name_L2/L3 nhưng thiết bị có các lọ QC riêng theo từng mức
  if (!cfgCtrlL2 && distinctMachineReagents.length >= 2) {
    const otherReagents = distinctMachineReagents.filter(
      (r) =>
        r.control_name.trim().toUpperCase() !==
        String(cfgCtrlL1 || "")
          .trim()
          .toUpperCase()
    );
    const preferredL2 =
      otherReagents.find((r) =>
        /(?:\b2\b|L2|LEVEL\s*2|CITROL\s*2|MULTI\s*2)/i.test(r.control_name)
      ) || otherReagents[0];

    if (preferredL2) {
      const hasDistinctTestsForSecond = configs.some(
        (c) =>
          c.machine_name === log.machine_name &&
          c.control_name === preferredL2.control_name &&
          c.test_name !== log.test_name
      );
      if (!hasDistinctTestsForSecond) {
        cfgCtrlL2 = preferredL2.control_name;
        cfgLotL2 = preferredL2.lot_number;
      }
    }

    const remainingForL3 = otherReagents.filter(
      (r) => r.control_name !== preferredL2?.control_name
    );
    const preferredL3 =
      remainingForL3.find((r) =>
        /(?:\b3\b|L3|LEVEL\s*3|PLASMA\s*P|CONTROL\s*P)/i.test(r.control_name)
      ) || remainingForL3[0];

    if (!cfgCtrlL3 && preferredL3) {
      const hasDistinctTestsForThird = configs.some(
        (c) =>
          c.machine_name === log.machine_name &&
          c.control_name === preferredL3.control_name &&
          c.test_name !== log.test_name
      );
      if (!hasDistinctTestsForThird) {
        cfgCtrlL3 = preferredL3.control_name;
        cfgLotL3 = preferredL3.lot_number;
      }
    }
  }

  const finalCtrlL2 = cfgCtrlL2 || cfgCtrlL1;
  const finalLotL2 = cfgLotL2 || findLotForControlName(finalCtrlL2, cfgLotL1);

  const finalCtrlL3 = cfgCtrlL3 || cfgCtrlL1;
  const finalLotL3 = cfgLotL3 || findLotForControlName(finalCtrlL3, cfgLotL1);

  const rawItems: ControlLotBadgeItem[] = [];
  activeLvKeys.forEach((lv) => {
    if (lv === "L1") {
      rawItems.push({
        levelTag: "L1",
        controlName: cfgCtrlL1,
        lotNumber: cfgLotL1,
      });
    } else if (lv === "L2") {
      rawItems.push({
        levelTag: "L2",
        controlName: finalCtrlL2,
        lotNumber: finalLotL2,
      });
    } else if (lv === "L3") {
      rawItems.push({
        levelTag: "L3",
        controlName: finalCtrlL3,
        lotNumber: finalLotL3,
      });
    }
  });

  const uniqueKeys = new Set(
    rawItems.map(
      (x) =>
        `${x.controlName.trim().toUpperCase()}__${x.lotNumber
          .trim()
          .toUpperCase()}`
    )
  );

  if (uniqueKeys.size === 1) {
    return [
      {
        controlName: rawItems[0].controlName,
        lotNumber: rawItems[0].lotNumber,
      },
    ];
  }

  return rawItems;
}

function detectViolatedLevelsForLog(
  log: BM09LogEntry,
  cfg?: TestConfig
): ("L1" | "L2" | "L3")[] {
  const maxLv = cfg?.levels_count || 2;
  const candidateLevels: ("L1" | "L2" | "L3")[] =
    maxLv === 3 ? ["L1", "L2", "L3"] : maxLv === 2 ? ["L1", "L2"] : ["L1"];

  if (cfg?.test_type === "QUALITATIVE") {
    const failedQuals = candidateLevels.filter((lv) => {
      const actual =
        lv === "L1" ? log.qual_L1 : lv === "L2" ? log.qual_L2 : log.qual_L3;
      const expected =
        lv === "L1"
          ? cfg.expected_qual_L1 || "ÂM TÍNH"
          : lv === "L2"
          ? cfg.expected_qual_L2 || "DƯƠNG TÍNH"
          : cfg.expected_qual_L3 || "DƯƠNG TÍNH";
      return Boolean(actual) && actual !== expected;
    });
    return failedQuals.length > 0 ? failedQuals : candidateLevels;
  }

  const singleStr = String(log.rules_single || "");
  const crossStr = String(log.rules_cross || "");
  const combinedRules = `${singleStr} ${crossStr}`;

  const matched = candidateLevels.filter((lv) => {
    const numIdx = lv === "L1" ? "1" : lv === "L2" ? "2" : "3";
    const lvStatus =
      lv === "L1"
        ? log.lvl1_status
        : lv === "L2"
        ? log.lvl2_status
        : log.lvl3_status;
    const zVal = lv === "L1" ? log.z_L1 : lv === "L2" ? log.z_L2 : log.z_L3;

    if (lvStatus === "FAIL" || lvStatus === "WARN") return true;
    if (zVal !== null && zVal !== undefined && Math.abs(Number(zVal)) >= 2)
      return true;
    if (
      combinedRules.indexOf(lv) !== -1 ||
      combinedRules.indexOf(`Mức ${numIdx}`) !== -1 ||
      combinedRules.indexOf("Cả 3 mức") !== -1
    )
      return true;
    return false;
  });

  return matched.length > 0 ? matched : candidateLevels;
}

export default function BangDieuKhien({
  apiUrl,
  authToken,
  currentUser,
  runDate = getVnIsoDateString(),
  configs = [],
  setConfigs,
  reagents = [],
  bm09Logs = [],
  setBm09Logs,
  sections = [],
  labMachines = [],
  onNavigateToAssistant,
  onNavigateToLJChart,
  onNavigateToLjChart,
  onNavigateToKiosk,
  onSelectTab,
}: BangDieuKhienProps) {
  const safeSections = useMemo(() => {
    if (Array.isArray(sections) && sections.length > 0) return sections;
    const fromMachines = (labMachines || []).map((m) => m.section);
    const fromConfigs = (configs || []).map((c) => c.section);
    const merged = Array.from(
      new Set([...fromMachines, ...fromConfigs])
    ).filter(Boolean);
    return merged.length > 0 ? merged : ["Huyết học"];
  }, [sections, labMachines, configs]);

  // Mặc định mở Thẻ 2 (LAB - RANGE - TEST) như Hình 1 hoặc đóng mở tùy ý
  const [expandedMetric, setExpandedMetric] = useState<1 | 2 | 3 | 4 | null>(2);
  const [m2Section, setM2Section] = useState<string>(
    safeSections[0] || "Huyết học"
  );
  const [m2Machine, setM2Machine] = useState<string>("Tất cả");

  const [logLabFilter, setLogLabFilter] = useState<string>("Tất cả");
  const [logMachineFilter, setLogMachineFilter] = useState<string>("Tất cả");
  const [logStatusFilter, setLogStatusFilter] =
    useState<Bm09FilterMode>("TODAY_AND_PENDING");
  const [logSearchText, setLogSearchText] = useState<string>("");

  const [correctiveModal, setCorrectiveModal] =
    useState<CorrectiveModalState | null>(null);

  const isoConfigs = useMemo(
    () => (configs || []).filter((c) => c.standard_label === "ISO"),
    [configs]
  );
  const sectionsWithIso = useMemo(
    () =>
      safeSections.filter((sec) =>
        isoConfigs.some(
          (c) => c.section === sec && c.test_type !== "QUALITATIVE"
        )
      ),
    [safeSections, isoConfigs]
  );
  const labRangeConfigs = useMemo(
    () =>
      (configs || []).filter(
        (c) => c.range_source && c.range_source !== "MANUFACTURER"
      ),
    [configs]
  );
  const expiringManualReagents = useMemo(
    () =>
      (reagents || []).filter((r) => r.is_manual_prep && isReagentReached75(r)),
    [reagents]
  );
  const accumulated15Configs = useMemo(
    () =>
      (configs || []).filter(
        (c) =>
          c.test_type !== "QUALITATIVE" &&
          (!c.range_source || c.range_source === "MANUFACTURER") &&
          (computeMuAndSigma(c, "L1").validPointsCount >= 15 ||
            c.accumulated_points >= 15)
      ),
    [configs]
  );

  const getMachines = useCallback(
    (sec: string) => {
      const fromMac = (labMachines || [])
        .filter((m) => sec === "Tất cả" || m.section === sec)
        .map((m) => m.machine);
      const fromCfg = (configs || [])
        .filter((c) => sec === "Tất cả" || c.section === sec)
        .map((c) => c.machine_name);
      return Array.from(new Set([...fromMac, ...fromCfg])).filter(Boolean);
    },
    [labMachines, configs]
  );

  const unresolvedCount = useMemo(
    () =>
      (bm09Logs || []).filter((l) => l.status === "FAIL" && !l.resolved).length,
    [bm09Logs]
  );

  const filteredBm09Logs = useMemo(() => {
    const q = logSearchText.trim().toLowerCase();
    return (bm09Logs || [])
      .map((log, originalIndex) => ({ log, originalIndex }))
      .filter(({ log }) => {
        if (logLabFilter !== "Tất cả" && log.section !== logLabFilter)
          return false;
        if (
          logMachineFilter !== "Tất cả" &&
          log.machine_name !== logMachineFilter
        )
          return false;

        if (logStatusFilter === "TODAY_AND_PENDING") {
          const isToday = log.run_date === runDate;
          const isPending = !log.resolved && log.status === "FAIL";
          if (!isToday && !isPending) return false;
        } else if (logStatusFilter === "UNRESOLVED_ONLY") {
          if (log.resolved || log.status !== "FAIL") return false;
        } else if (logStatusFilter === "TODAY_ALL") {
          if (log.run_date !== runDate) return false;
        }

        if (q) {
          const badges = resolveControlLotsForBm09Entry(log, configs, reagents);
          const badgeStr = badges
            .map((b) => `${b.controlName} ${b.lotNumber}`)
            .join(" ");
          const hay = `${log.test_name} ${log.machine_name} ${
            log.control_name
          } ${log.lot_number} ${badgeStr} ${log.rules_single || ""} ${
            log.rules_cross || ""
          } ${log.cause || ""} ${log.action_taken || ""} ${
            log.operator_name || ""
          }`.toLowerCase();
          if (hay.indexOf(q) === -1) return false;
        }
        return true;
      })
      .slice(0, 300);
  }, [
    bm09Logs,
    logLabFilter,
    logMachineFilter,
    logStatusFilter,
    logSearchText,
    runDate,
    configs,
    reagents,
  ]);

  const triggerJumpToAssistant = (payload: {
    section: string;
    machine?: string;
    test_id?: string;
    viewMode?: "RANGE" | "QUALITY";
  }) => {
    try {
      sessionStorage.setItem("DEEP_LINK_TEST", JSON.stringify(payload));
    } catch {}
    if (onNavigateToAssistant) {
      onNavigateToAssistant(payload);
      return;
    }
    if (onSelectTab) {
      onSelectTab("RANGE_MU");
    }
  };

  const triggerJumpToLJChart = (testId: string, isoOnly = false) => {
    if (onNavigateToLJChart) {
      onNavigateToLJChart(testId, isoOnly);
      return;
    }
    if (onNavigateToLjChart) {
      onNavigateToLjChart(testId);
    }
  };

  const triggerJumpToKiosk = () => {
    if (onNavigateToKiosk) {
      onNavigateToKiosk();
      return;
    }
    if (onSelectTab) {
      onSelectTab("KIOSK");
    }
  };

  const handleOpenCorrectiveModal = (
    log: BM09LogEntry,
    originalIndex: number
  ) => {
    const targetCfg = configs.find((c) => c.test_id === log.test_id);
    const vLevels = detectViolatedLevelsForLog(log, targetCfg);
    const maxLv = targetCfg?.levels_count || 3;
    const allLevels: ("L1" | "L2" | "L3")[] =
      maxLv === 3 ? ["L1", "L2", "L3"] : maxLv === 2 ? ["L1", "L2"] : ["L1"];

    const findExistingRerun = (arr?: HistoryPoint[]): string => {
      if (!Array.isArray(arr)) return "";
      for (let i = arr.length - 1; i >= 0; i--) {
        if (arr[i].isoDate === log.run_date && arr[i].is_rerun)
          return String(arr[i].val);
      }
      return "";
    };

    const existingR1 =
      findExistingRerun(targetCfg?.history_L1) ||
      (log.rerun_level === "L1" && log.rerun_val !== undefined
        ? String(log.rerun_val)
        : "");
    const existingR2 =
      findExistingRerun(targetCfg?.history_L2) ||
      (log.rerun_level === "L2" && log.rerun_val !== undefined
        ? String(log.rerun_val)
        : "");
    const existingR3 =
      findExistingRerun(targetCfg?.history_L3) ||
      (log.rerun_level === "L3" && log.rerun_val !== undefined
        ? String(log.rerun_val)
        : "");

    const initialInputs: Record<"L1" | "L2" | "L3", string> = {
      L1:
        targetCfg?.test_type === "QUALITATIVE"
          ? targetCfg.expected_qual_L1 || "ÂM TÍNH"
          : existingR1,
      L2:
        targetCfg?.test_type === "QUALITATIVE"
          ? targetCfg.expected_qual_L2 || "DƯƠNG TÍNH"
          : existingR2,
      L3:
        targetCfg?.test_type === "QUALITATIVE"
          ? targetCfg.expected_qual_L3 || "DƯƠNG TÍNH"
          : existingR3,
    };

    const canSign = hasPermission(currentUser, "SIGN_BM09_CHECKER");

    setCorrectiveModal({
      logIndex: originalIndex,
      log,
      testConfig: targetCfg,
      runId: log.run_id,
      testId: log.test_id,
      testName: log.test_name,
      machineName: log.machine_name,
      controlName: log.control_name,
      lotNumber: log.lot_number || targetCfg?.lot_number || "",
      runDate: log.run_date,
      runTime: log.run_time || "08h00",
      rulesText:
        [log.rules_single, log.rules_cross].filter(Boolean).join(" · ") ||
        "Cảnh báo / Vi phạm QC",
      cause: log.cause || "",
      action: log.action_taken || "",
      violatedLevels: vLevels,
      allAvailableLevels: allLevels,
      reRunInputs: initialInputs,
      postFixResultText: log.post_fix_result || "",
      checkerNameDraft: log.checker_name || (canSign ? currentUser.name : ""),
      adminStatusOverride: log.status,
      adminResolvedOverride: Boolean(log.resolved),
    });
  };

  const handleSaveCorrectiveAction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!correctiveModal) return;
    const {
      logIndex,
      runId,
      testId,
      cause,
      action,
      allAvailableLevels,
      reRunInputs,
      postFixResultText,
      checkerNameDraft,
      adminStatusOverride,
      adminResolvedOverride,
    } = correctiveModal;

    const targetCfg =
      correctiveModal.testConfig || configs.find((c) => c.test_id === testId);
    const currentLog = bm09Logs[logIndex] || correctiveModal.log;
    const canOverride = hasPermission(currentUser, "OVERRIDE_RESOLUTION");
    const canSign = hasPermission(currentUser, "SIGN_BM09_CHECKER");

    let finalPostFix = postFixResultText || currentLog?.post_fix_result || "";
    let finalResolved = canOverride
      ? adminResolvedOverride
      : currentLog?.resolved || false;
    let finalStatus = canOverride
      ? adminStatusOverride
      : currentLog?.status || "FAIL";
    const finalChecker = canSign
      ? checkerNameDraft.trim() || currentLog?.checker_name || ""
      : currentLog?.checker_name || "";

    let firstRerunVal = currentLog?.rerun_val;
    let firstRerunLvl = currentLog?.rerun_level;
    let updatedCfgForCloud: TestConfig | null = null;

    if (targetCfg && targetCfg.test_type === "QUALITATIVE") {
      const qualSummary: string[] = [];
      let allQualPass = true;
      let anyQualEntered = false;
      allAvailableLevels.forEach((lv) => {
        const chosenQual = (reRunInputs[lv] || "").trim();
        if (!chosenQual) return;
        anyQualEntered = true;
        const expQual =
          lv === "L1"
            ? targetCfg.expected_qual_L1 || "ÂM TÍNH"
            : lv === "L2"
            ? targetCfg.expected_qual_L2 || "DƯƠNG TÍNH"
            : targetCfg.expected_qual_L3 || "DƯƠNG TÍNH";
        const isMatch = chosenQual === expQual;
        if (!isMatch) allQualPass = false;
        qualSummary.push(
          `${lv}: ${chosenQual} - ${isMatch ? "Đạt" : "Chưa đạt"}`
        );
      });
      if (anyQualEntered) {
        finalPostFix = qualSummary.join(" · ");
        if (allQualPass) finalResolved = true;
      }
    } else if (targetCfg && targetCfg.test_type !== "QUALITATIVE") {
      const summaryParts: string[] = [];
      let allEnteredPass = true;
      let anyEntered = false;
      const newPtsByLevel: Partial<Record<"L1" | "L2" | "L3", HistoryPoint>> =
        {};
      const logDate = currentLog?.run_date || runDate;
      const shortDate = formatShortDM(logDate);
      const rerunTimeStr = getVnTimeString();

      allAvailableLevels.forEach((lv) => {
        const rawStr = (reRunInputs[lv] || "").trim().replace(/,/g, ".");
        if (rawStr === "") return;
        const num = parseFloat(rawStr);
        const meanRef =
          lv === "L1"
            ? targetCfg.mean_L1
            : lv === "L2"
            ? targetCfg.mean_L2
            : targetCfg.mean_L3;
        const sdRef =
          lv === "L1"
            ? targetCfg.sd_L1
            : lv === "L2"
            ? targetCfg.sd_L2
            : targetCfg.sd_L3;
        const lotRef =
          lv === "L1"
            ? targetCfg.lot_number_L1 || targetCfg.lot_number
            : lv === "L2"
            ? targetCfg.lot_number_L2 || targetCfg.lot_number
            : targetCfg.lot_number_L3 || targetCfg.lot_number;

        if (!isNaN(num) && sdRef > 0) {
          anyEntered = true;
          const zNew = (num - meanRef) / sdRef;
          const isPass = Math.abs(zNew) < 2;
          if (!isPass) allEnteredPass = false;
          summaryParts.push(
            `${lv}: ${num} (${zNew >= 0 ? "+" : ""}${zNew.toFixed(2)}SD) - ${
              isPass ? "Đạt" : "Chưa đạt"
            }`
          );
          if (firstRerunVal === undefined) {
            firstRerunVal = num;
            firstRerunLvl = lv;
          }
          const stNew: "PASS" | "WARN" | "FAIL" = isPass
            ? "PASS"
            : Math.abs(zNew) >= 3
            ? "FAIL"
            : "WARN";
          newPtsByLevel[lv] = {
            isoDate: logDate,
            date: shortDate,
            time: rerunTimeStr,
            lot_number: lotRef,
            val: num,
            z: Number(zNew.toFixed(2)),
            operator: currentUser.name,
            rule: isPass
              ? "Đạt sau kiểm tra lại"
              : `Kiểm tra lại chưa đạt (${zNew >= 0 ? "+" : ""}${zNew.toFixed(
                  2
                )}SD)`,
            status: stNew,
            single_level_status: stNew,
            single_level_rule: isPass
              ? `KT lại Đạt (${lv})`
              : `KT lại ${zNew.toFixed(2)}SD (${lv})`,
            is_rerun: true,
          };
        }
      });

      if (anyEntered) {
        finalPostFix = summaryParts.join(" · ");
        if (allEnteredPass) finalResolved = true;

        const upsertRerunInSeries = (
          arr: HistoryPoint[] | undefined,
          pt?: HistoryPoint
        ): HistoryPoint[] => {
          const list = Array.isArray(arr) ? [...arr] : [];
          if (!pt) return list;
          const idx = list.findIndex(
            (old) =>
              old.isoDate === pt.isoDate && Boolean(old.is_rerun) === true
          );
          if (idx >= 0) list[idx] = pt;
          else list.push(pt);
          return sortHistoryChronologically(list);
        };

        if (setConfigs) {
          setConfigs((prev) =>
            prev.map((c) => {
              if (c.test_id !== testId) return c;
              const nextObj: TestConfig = {
                ...c,
                accumulated_points: c.accumulated_points + 1,
                history_L1: upsertRerunInSeries(c.history_L1, newPtsByLevel.L1),
                history_L2: upsertRerunInSeries(c.history_L2, newPtsByLevel.L2),
                history_L3: upsertRerunInSeries(
                  c.history_L3 || [],
                  newPtsByLevel.L3
                ),
              };
              updatedCfgForCloud = nextObj;
              return nextObj;
            })
          );
        }
      }
    }

    setBm09Logs((prev) =>
      prev.map((item, idx) =>
        idx === logIndex ||
        (runId && item.run_id === runId && item.test_id === testId)
          ? {
              ...item,
              cause: cause.trim(),
              action_taken: action.trim(),
              post_fix_result: finalPostFix,
              status: finalStatus,
              resolved: finalResolved,
              checker_name: finalChecker,
              rerun_val: firstRerunVal,
              rerun_level: firstRerunLvl,
            }
          : item
      )
    );

    setCorrectiveModal(null);
    if (currentLog) {
      await rpcCall(
        apiUrl,
        "update_corrective_action",
        {
          run_id: currentLog.run_id,
          test_id: currentLog.test_id,
          cause: cause.trim(),
          action_taken: action.trim(),
          post_fix_result: finalPostFix,
          status: finalStatus,
          resolved: finalResolved,
          checker_name: finalChecker,
          rerun_val: firstRerunVal,
          rerun_level: firstRerunLvl,
        },
        authToken
      );
    }
    if (updatedCfgForCloud) {
      await rpcCall(apiUrl, "save_config", updatedCfgForCloud, authToken);
    }
  };

  const handleQuickSignChecker = useCallback(
    async (log: BM09LogEntry, originalIndex: number) => {
      if (!hasPermission(currentUser, "SIGN_BM09_CHECKER")) {
        window.alert(
          "⚠️ Tài khoản của bạn chưa được cấp quyền Ký duyệt Người kiểm tra BM.09!"
        );
        return;
      }
      setBm09Logs((prev) =>
        prev.map((item, idx) =>
          idx === originalIndex ||
          (item.run_id === log.run_id && item.test_id === log.test_id)
            ? { ...item, checker_name: currentUser.name, resolved: true }
            : item
        )
      );
      await rpcCall(
        apiUrl,
        "update_corrective_action",
        {
          run_id: log.run_id,
          test_id: log.test_id,
          checker_name: currentUser.name,
        },
        authToken
      );
    },
    [apiUrl, authToken, currentUser, setBm09Logs]
  );

  const renderResultLine = (
    levelLabel: "L1" | "L2" | "L3",
    val: number | null | undefined,
    z: number | null | undefined,
    qualVal?: string
  ) => {
    if (qualVal) {
      return (
        <div className="flex items-center justify-between gap-2 font-mono text-xs leading-snug">
          <span className="text-slate-500 font-semibold">{levelLabel}:</span>
          <span className="font-black text-slate-900">{qualVal}</span>
        </div>
      );
    }
    if (val === null || val === undefined) return null;

    const numZ = typeof z === "number" && !isNaN(z) ? z : 0;
    const absZ = Math.abs(numZ);
    const zColor =
      absZ >= 3
        ? "text-rose-600 font-black"
        : absZ >= 2
        ? "text-amber-600 font-bold"
        : "text-sky-600 font-bold";
    const signStr = numZ >= 0 ? "+" : "";

    return (
      <div className="grid grid-cols-12 items-center gap-1 font-mono text-xs leading-snug">
        <span className="col-span-3 text-slate-500 font-sans text-[11px]">
          {levelLabel}:
        </span>
        <span className="col-span-4 font-black text-slate-900 text-right">
          {val}
        </span>
        <span className={`col-span-5 text-right text-[11px] ${zColor}`}>
          ({signStr}
          {roundSmartDecimal(numZ, 0.1)}SD)
        </span>
      </div>
    );
  };

  return (
    <div className="space-y-5 text-sm">
      {/* =================================================================== */}
      {/* HÀNG 1: 4 THẺ METRIC TỔNG QUAN (GIỮ NGUYÊN 100% HÌNH 1 BẢN CŨ)      */}
      {/* =================================================================== */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <button
          type="button"
          onClick={() => setExpandedMetric(expandedMetric === 1 ? null : 1)}
          className={`text-left rounded-2xl p-4 border-2 transition-all ${
            expandedMetric === 1
              ? "bg-gradient-to-br from-blue-600 to-indigo-700 text-white border-blue-800 shadow-lg scale-[1.01]"
              : "bg-white text-slate-800 border-blue-200 hover:border-blue-400 shadow-sm"
          }`}
        >
          <div className="flex items-center justify-between">
            <span
              className={`text-[11px] font-black uppercase tracking-wider px-2.5 py-0.5 rounded-full ${
                expandedMetric === 1
                  ? "bg-white/20 text-white"
                  : "bg-blue-50 text-blue-700"
              }`}
            >
              IQC - ISO TEST
            </span>
            <Ic.Cpu />
          </div>
          <div className="text-2xl font-black mt-2">
            {isoConfigs.length} Chỉ số ISO
          </div>
          <div
            className={`text-[11px] mt-1 font-semibold ${
              expandedMetric === 1 ? "text-blue-100" : "text-slate-500"
            }`}
          >
            Có tại: {sectionsWithIso.join(", ") || "Chưa có"}
          </div>
        </button>

        <button
          type="button"
          onClick={() => setExpandedMetric(expandedMetric === 2 ? null : 2)}
          className={`text-left rounded-2xl p-4 border-2 transition-all ${
            expandedMetric === 2
              ? "bg-gradient-to-br from-purple-600 to-fuchsia-700 text-white border-purple-800 shadow-lg scale-[1.01]"
              : "bg-white text-slate-800 border-purple-200 hover:border-purple-400 shadow-sm"
          }`}
        >
          <div className="flex items-center justify-between">
            <span
              className={`text-[11px] font-black uppercase tracking-wider px-2.5 py-0.5 rounded-full ${
                expandedMetric === 2
                  ? "bg-white/20 text-white"
                  : "bg-purple-50 text-purple-700"
              }`}
            >
              LAB - RANGE - TEST
            </span>
            <Ic.Check />
          </div>
          <div className="text-2xl font-black mt-2">
            {labRangeConfigs.length} Range Phòng
          </div>
          <div
            className={`text-[11px] mt-1 font-semibold ${
              expandedMetric === 2 ? "text-purple-100" : "text-slate-500"
            }`}
          >
            Đang chạy Range Phòng (Tím Neon)
          </div>
        </button>

        <button
          type="button"
          onClick={() => setExpandedMetric(expandedMetric === 3 ? null : 3)}
          className={`text-left rounded-2xl p-4 border-2 transition-all ${
            expandedMetric === 3
              ? "bg-gradient-to-br from-amber-500 to-orange-600 text-white border-amber-700 shadow-lg scale-[1.01]"
              : "bg-white text-slate-800 border-amber-200 hover:border-amber-400 shadow-sm"
          }`}
        >
          <div className="flex items-center justify-between">
            <span
              className={`text-[11px] font-black uppercase tracking-wider px-2.5 py-0.5 rounded-full ${
                expandedMetric === 3
                  ? "bg-white/20 text-white"
                  : "bg-amber-50 text-amber-800"
              }`}
            >
              HÓA CHẤT QC SẮP HẾT
            </span>
            <Ic.Flask />
          </div>
          <div className="text-2xl font-black mt-2">
            {expiringManualReagents.length} Lô ≥ 75%
          </div>
          <div
            className={`text-[11px] mt-1 font-semibold ${
              expandedMetric === 3 ? "text-amber-50" : "text-slate-500"
            }`}
          >
            Chỉ tính Hóa chất tự pha (BM.16)
          </div>
        </button>

        <button
          type="button"
          onClick={() => setExpandedMetric(expandedMetric === 4 ? null : 4)}
          className={`text-left rounded-2xl p-4 border-2 transition-all ${
            expandedMetric === 4
              ? "bg-gradient-to-br from-emerald-600 to-teal-700 text-white border-emerald-800 shadow-lg scale-[1.01]"
              : "bg-white text-slate-800 border-emerald-200 hover:border-emerald-400 shadow-sm"
          }`}
        >
          <div className="flex items-center justify-between">
            <span
              className={`text-[11px] font-black uppercase tracking-wider px-2.5 py-0.5 rounded-full ${
                expandedMetric === 4
                  ? "bg-white/20 text-white"
                  : "bg-emerald-50 text-emerald-700"
              }`}
            >
              IQC TÍCH LŨY (≥ 15 ĐIỂM)
            </span>
            <Ic.Clock />
          </div>
          <div className="text-2xl font-black mt-2">
            {accumulated15Configs.length} Xét nghiệm
          </div>
          <div
            className={`text-[11px] mt-1 font-semibold ${
              expandedMetric === 4 ? "text-emerald-50" : "text-slate-500"
            }`}
          >
            Đủ điểm xét Chốt Range & MU
          </div>
        </button>
      </div>

      {/* KHUNG MỞ RỘNG THẺ 1 */}
      {expandedMetric === 1 && (
        <div className="bg-white border-2 border-blue-200 rounded-2xl p-4 shadow-sm space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-xs font-black text-blue-950 uppercase">
              IQC - ISO TEST · CÁC XÉT NGHIỆM ĐẠT CHUẨN ISO 15189:2022
            </h3>
            <div className="flex flex-wrap gap-2">
              {sectionsWithIso.map((sec) => (
                <button
                  key={sec}
                  type="button"
                  onClick={() => {
                    const first = isoConfigs.find(
                      (c) => c.section === sec && c.test_type !== "QUALITATIVE"
                    );
                    if (first) triggerJumpToLJChart(first.test_id, true);
                  }}
                  className="px-3.5 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-black text-xs shadow-sm transition"
                >
                  Mở L-J: {sec} →
                </button>
              ))}
            </div>
          </div>
          <div className="flex flex-wrap gap-2 pt-1">
            {isoConfigs.map((c) => (
              <button
                key={c.test_id}
                type="button"
                onClick={() => triggerJumpToLJChart(c.test_id, true)}
                className="px-3 py-1.5 rounded-xl bg-blue-50 hover:bg-blue-100 text-blue-900 border border-blue-200 text-xs font-bold transition flex items-center gap-1.5"
              >
                <span className="bg-blue-600 text-white px-2 py-0.5 rounded-full text-[9.5px] font-black uppercase">
                  ISO 15189
                </span>
                <span>{c.test_name}</span>
                <span className="text-slate-500 font-normal">
                  ({c.section} · {c.machine_name})
                </span>
              </button>
            ))}
            {isoConfigs.length === 0 && (
              <div className="text-xs text-slate-400 italic">
                Chưa có xét nghiệm nào gắn nhãn ISO 15189.
              </div>
            )}
          </div>
        </div>
      )}

      {/* KHUNG MỞ RỘNG THẺ 2 (TÍM NEON NHƯ HÌNH 1) */}
      {expandedMetric === 2 && (
        <div className="bg-white border-2 border-purple-200 rounded-2xl p-4 shadow-sm space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="text-xs font-black text-purple-950 uppercase">
              LAB - RANGE - TEST · XÉT NGHIỆM ĐANG ÁP DỤNG RANGE PHÒNG (TÍM
              NEON)
            </h3>
            <div className="flex flex-wrap gap-2 text-xs">
              <select
                value={m2Section}
                onChange={(e) => {
                  setM2Section(e.target.value);
                  setM2Machine("Tất cả");
                }}
                className="bg-purple-50 border border-purple-200 rounded-xl px-3 py-1.5 font-bold text-purple-950"
              >
                {safeSections.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
              <select
                value={m2Machine}
                onChange={(e) => setM2Machine(e.target.value)}
                className="bg-purple-50 border border-purple-200 rounded-xl px-3 py-1.5 font-bold text-purple-950"
              >
                <option value="Tất cả">Tất cả máy</option>
                {getMachines(m2Section).map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() =>
                  triggerJumpToAssistant({
                    section: m2Section,
                    machine: m2Machine,
                    viewMode: "RANGE",
                  })
                }
                className="px-4 py-1.5 bg-purple-600 hover:bg-purple-700 text-white font-black rounded-xl shadow-sm transition"
              >
                Đến Trợ Lý Range & MU →
              </button>
            </div>
          </div>
          <div className="flex flex-wrap gap-2.5 pt-1">
            {labRangeConfigs
              .filter(
                (c) =>
                  c.section === m2Section &&
                  (m2Machine === "Tất cả" || c.machine_name === m2Machine)
              )
              .map((c) => (
                <button
                  key={c.test_id}
                  type="button"
                  onClick={() =>
                    triggerJumpToAssistant({
                      section: c.section,
                      machine: c.machine_name,
                      test_id: c.test_id,
                      viewMode: "RANGE",
                    })
                  }
                  className="px-3.5 py-2 rounded-xl text-xs font-bold hover:underline neon-purple-range bg-gradient-to-r from-purple-200/80 via-fuchsia-200/80 to-purple-300/80 text-purple-950 border border-purple-400 shadow-xs transition"
                >
                  {c.test_name} ({c.machine_name}) · Đã áp dụng{" "}
                  {c.range_active_days || 1} ngày →
                </button>
              ))}
            {labRangeConfigs.filter(
              (c) =>
                c.section === m2Section &&
                (m2Machine === "Tất cả" || c.machine_name === m2Machine)
            ).length === 0 && (
              <div className="text-xs text-slate-400 italic">
                Chưa có xét nghiệm nào đang áp dụng Range Phòng tại nhánh lọc
                này.
              </div>
            )}
          </div>
        </div>
      )}

      {/* KHUNG MỞ RỘNG THẺ 3 */}
      {expandedMetric === 3 && (
        <div className="bg-white border-2 border-amber-200 rounded-2xl p-4 shadow-sm space-y-2">
          <h3 className="text-xs font-black text-amber-950 uppercase">
            HÓA CHẤT QC TỰ PHA CHẾ ĐÃ SỬ DỤNG ≥ 75% SỐ LƯỢNG PHA (BM.16)
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-1">
            {expiringManualReagents.map((r) => (
              <div
                key={r.control_id}
                className="bg-amber-50/80 border border-amber-300 rounded-xl p-3 flex items-center justify-between gap-2"
              >
                <div>
                  <div className="font-black text-slate-900 text-xs">
                    {r.control_name} ({r.machine_name})
                  </div>
                  <div className="text-[11px] text-slate-600 font-mono">
                    Lô: {r.lot_number} · Ngày pha: {formatDateVN(r.prep_date)}
                  </div>
                  <div className="text-[11px] font-extrabold text-rose-700 mt-0.5">
                    Đã dùng: {r.usage_count}/{r.quantity_prepared} lần (Ngưỡng
                    75%: {getReagentThreshold75(r.quantity_prepared)} lần)
                  </div>
                </div>
              </div>
            ))}
            {expiringManualReagents.length === 0 && (
              <div className="text-xs text-slate-500 italic col-span-3">
                Chưa có lô hóa chất tự pha chế nào chạm ngưỡng ≥ 75%.
              </div>
            )}
          </div>
        </div>
      )}

      {/* KHUNG MỞ RỘNG THẺ 4 */}
      {expandedMetric === 4 && (
        <div className="bg-white border-2 border-emerald-200 rounded-2xl p-4 shadow-sm space-y-2">
          <h3 className="text-xs font-black text-emerald-950 uppercase">
            IQC TÍCH LŨY (≥ 15 ĐIỂM ĐO) · ĐỦ ĐIỀU KIỆN CHỐT RANGE & MU
          </h3>
          <div className="flex flex-wrap gap-2.5 pt-1">
            {accumulated15Configs.map((c) => {
              const mu1 = computeMuAndSigma(c, "L1");
              const pts = Math.max(
                mu1.validPointsCount,
                Number(c.accumulated_points || 0)
              );
              return (
                <button
                  key={c.test_id}
                  type="button"
                  onClick={() =>
                    triggerJumpToAssistant({
                      section: c.section,
                      machine: c.machine_name,
                      test_id: c.test_id,
                      viewMode: "RANGE",
                    })
                  }
                  className="px-3.5 py-2 rounded-xl bg-emerald-50 hover:bg-emerald-100 border border-emerald-300 text-emerald-950 text-xs font-bold transition flex items-center gap-2 shadow-sm"
                >
                  <span>
                    {c.test_name} ({c.machine_name})
                  </span>
                  <span className="px-2 py-0.5 rounded-full bg-emerald-600 text-white font-mono text-[10.5px]">
                    {pts} điểm hợp lệ →
                  </span>
                </button>
              );
            })}
            {accumulated15Configs.length === 0 && (
              <div className="text-xs text-slate-500 italic">
                Chưa có xét nghiệm nào tích lũy đủ ≥ 15 điểm hợp lệ.
              </div>
            )}
          </div>
        </div>
      )}

      {/* =================================================================== */}
      {/* HÀNG 2: SƠ ĐỒ TRẠNG THÁI THIẾT BỊ XÉT NGHIỆM (GIỮ NGUYÊN HÌNH 1)     */}
      {/* =================================================================== */}
      <div className="bg-white border border-slate-200 rounded-3xl p-5 shadow-sm space-y-3.5">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
          <div>
            <h3 className="text-sm font-black text-slate-900 uppercase flex items-center gap-2">
              <Ic.Cpu />
              TRẠNG THÁI THIẾT BỊ XÉT NGHIỆM NGÀY {formatDateVN(runDate)}
            </h3>
            <p className="text-[13px] text-slate-500 mt-0.5 font-medium">
              Nhấp vào thẻ thiết bị để lọc nhanh Sổ sự cố BM.09 bên dưới.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-1.5 text-sm font-bold">
            <button
              type="button"
              onClick={() => {
                setLogLabFilter("Tất cả");
                setLogMachineFilter("Tất cả");
              }}
              className={`px-4 py-2 rounded-xl transition ${
                logLabFilter === "Tất cả"
                  ? "bg-[#0f172a] text-white shadow-sm"
                  : "bg-[#f1f5f9] text-[#475569] hover:bg-[#e2e8f0]"
              }`}
            >
              Tất cả Lab
            </button>
            {safeSections.map((sec) => (
              <button
                key={sec}
                type="button"
                onClick={() => {
                  setLogLabFilter(sec);
                  setLogMachineFilter("Tất cả");
                }}
                className={`px-4 py-2 rounded-xl transition ${
                  logLabFilter === sec
                    ? "bg-[#0f172a] text-white shadow-sm"
                    : "bg-[#f1f5f9] text-[#475569] hover:bg-[#e2e8f0]"
                }`}
              >
                {sec}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {(labMachines || [])
            .filter(
              (m) => logLabFilter === "Tất cả" || m.section === logLabFilter
            )
            .map((mc) => {
              const testsOnMachine = configs.filter(
                (c) => c.machine_name === mc.machine
              );
              const total = testsOnMachine.length;
              let doneToday = 0;
              testsOnMachine.forEach((c) => {
                const ran =
                  (c.history_L1 || []).some((p) => p.isoDate === runDate) ||
                  (c.history_L2 || []).some((p) => p.isoDate === runDate) ||
                  (c.history_L3 || []).some((p) => p.isoDate === runDate) ||
                  bm09Logs.some(
                    (l) => l.test_id === c.test_id && l.run_date === runDate
                  );
                if (ran) doneToday++;
              });

              const unresolvedOnMac = bm09Logs.filter(
                (l) =>
                  l.machine_name === mc.machine &&
                  l.status === "FAIL" &&
                  !l.resolved
              ).length;

              const isSelected = logMachineFilter === mc.machine;

              return (
                <div
                  key={`${mc.section}-${mc.machine}`}
                  onClick={() =>
                    setLogMachineFilter(isSelected ? "Tất cả" : mc.machine)
                  }
                  className={`cursor-pointer rounded-[20px] p-5 border-2 transition-all ${
                    isSelected
                      ? "border-blue-400 bg-blue-50/40 ring-4 ring-blue-100"
                      : "border-[#e2e8f0] bg-white hover:border-blue-300 hover:shadow-md"
                  }`}
                >
                  <div className="flex items-center justify-between gap-1 mb-4">
                    <span className="text-[11px] font-extrabold uppercase px-3 py-1 rounded-[10px] bg-white border border-[#e2e8f0] text-[#334155] shadow-xs">
                      {mc.section}
                    </span>
                    {unresolvedOnMac > 0 ? (
                      <span className="px-3 py-1 rounded-full text-[10.5px] font-black bg-rose-600 text-white animate-pulse">
                        🚨 {unresolvedOnMac} lỗi chờ xử lý
                      </span>
                    ) : doneToday > 0 ? (
                      <span className="px-3 py-1 rounded-full text-[10.5px] font-black bg-emerald-100 text-emerald-800 border border-emerald-300">
                        ✓ Đã chạy ({doneToday}/{total})
                      </span>
                    ) : (
                      <span className="px-3 py-1 rounded-full text-[10.5px] font-black bg-[#f1f5f9] text-[#475569]">
                        Chưa chạy hôm nay
                      </span>
                    )}
                  </div>

                  <div className="font-black text-[#0f172a] text-lg uppercase truncate tracking-wide">
                    {mc.machine}
                  </div>

                  <div className="text-[13px] text-[#475569] mt-3 pt-3 border-t border-[#e2e8f0] font-mono">
                    Tiến độ:{" "}
                    <b className="text-[#0f172a]">
                      {doneToday}/{total} test
                    </b>
                  </div>
                </div>
              );
            })}
        </div>
      </div>

      {/* =================================================================== */}
      {/* HÀNG 3: TRUNG TÂM GIÁM SÁT SỰ CỐ & BẢNG BM.09 ĐA LỌ QC (HÌNH 2)     */}
      {/* =================================================================== */}
      <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-xs space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="inline-block px-3.5 py-1 rounded-full text-[11px] font-black uppercase bg-indigo-600 text-white shadow-xs">
                BM.09.XN.QTQL.22 · ISO 15189:2022
              </span>
              {logMachineFilter !== "Tất cả" && (
                <button
                  type="button"
                  onClick={() => setLogMachineFilter("Tất cả")}
                  className="px-3 py-1 rounded-full text-[11px] font-black bg-blue-100 text-blue-800 border border-blue-300"
                >
                  Đang lọc máy: {logMachineFilter} (✕ Bỏ lọc)
                </button>
              )}
            </div>
            <h2 className="text-xl font-black uppercase text-slate-900 tracking-tight mt-2">
              TRUNG TÂM GIÁM SÁT SỰ CỐ & HÀNH ĐỘNG KHẮC PHỤC NỘI KIỂM
            </h2>
          </div>

          <button
            type="button"
            onClick={triggerJumpToKiosk}
            className="px-5 py-2.5 rounded-full bg-blue-600 hover:bg-blue-700 text-white font-black text-xs shadow-md transition"
          >
            + Vào Nhập Kết Quả QC
          </button>
        </div>

        {/* THANH TAB LỌC BẢN GHI & Ô TÌM KIẾM */}
        <div className="bg-slate-50/70 border border-slate-200 rounded-2xl p-2.5 flex flex-wrap items-center justify-between gap-2.5">
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={() => setLogStatusFilter("TODAY_AND_PENDING")}
              className={`px-4 py-2 rounded-xl text-xs font-black transition flex items-center ${
                logStatusFilter === "TODAY_AND_PENDING"
                  ? "bg-slate-900 text-white shadow-xs"
                  : "text-slate-600 hover:bg-slate-200/70"
              }`}
            >
              <Ic.Pin /> Hôm nay & Tồn đọng
            </button>

            <button
              type="button"
              onClick={() => setLogStatusFilter("UNRESOLVED_ONLY")}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold transition flex items-center ${
                logStatusFilter === "UNRESOLVED_ONLY"
                  ? "bg-rose-600 text-white font-black shadow-xs"
                  : "text-slate-600 hover:bg-slate-200/70"
              }`}
            >
              <Ic.Siren /> Chỉ Chưa xử lý ({unresolvedCount})
            </button>

            <button
              type="button"
              onClick={() => setLogStatusFilter("TODAY_ALL")}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold transition flex items-center ${
                logStatusFilter === "TODAY_ALL"
                  ? "bg-slate-900 text-white font-black shadow-xs"
                  : "text-slate-600 hover:bg-slate-200/70"
              }`}
            >
              <Ic.Calendar /> Tất cả Hôm nay
            </button>

            <button
              type="button"
              onClick={() => setLogStatusFilter("ALL_HISTORY")}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold transition flex items-center ${
                logStatusFilter === "ALL_HISTORY"
                  ? "bg-slate-900 text-white font-black shadow-xs"
                  : "text-slate-600 hover:bg-slate-200/70"
              }`}
            >
              <Ic.Folder /> Toàn bộ Lịch sử Sự cố
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {safeSections.length > 1 && (
              <select
                value={logLabFilter}
                onChange={(e) => {
                  setLogLabFilter(e.target.value);
                  setLogMachineFilter("Tất cả");
                }}
                className="bg-white border border-slate-200 rounded-full px-3 py-1.5 text-xs font-bold text-slate-700 outline-none"
              >
                <option value="Tất cả">Tất cả Lab</option>
                {safeSections.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            )}

            <select
              value={logMachineFilter}
              onChange={(e) => setLogMachineFilter(e.target.value)}
              className="bg-white border border-slate-200 rounded-full px-3.5 py-1.5 text-xs font-bold text-blue-800 outline-none"
            >
              <option value="Tất cả">Tất cả Máy</option>
              {getMachines(logLabFilter).map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>

            <div className="relative">
              <input
                type="text"
                value={logSearchText}
                onChange={(e) => setLogSearchText(e.target.value)}
                placeholder="🔍 Tìm tên xét nghiệm, quy tắc, nguyên nhân..."
                className="w-64 sm:w-72 bg-white border border-slate-200 focus:border-indigo-500 rounded-full px-4 py-1.5 text-xs font-semibold text-slate-800 outline-none"
              />
            </div>
          </div>
        </div>

        {/* BẢNG GIÁM SÁT BM.09 — CỘT THIẾT BỊ HIỂN THỊ ĐỦ CÁC LỌ HÓA CHẤT ĐA MỨC SẮC NÉT */}
        <div className="overflow-x-auto border border-slate-200 rounded-2xl">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-950 text-white uppercase text-[10.5px] font-black">
                <th className="py-3.5 px-3.5 w-24">NGÀY / GIỜ</th>
                <th className="py-3.5 px-3.5 min-w-[210px]">
                  THIẾT BỊ · XÉT NGHIỆM
                </th>
                <th className="py-3.5 px-3.5 text-center w-44">
                  KẾT QUẢ ĐO
                  <br />
                  (L1/L2/L3)
                </th>
                <th className="py-3.5 px-3.5 text-center w-44">
                  TRẠNG THÁI XỬ LÝ & QUY
                  <br />
                  TẮC GỐC (ISO 15189)
                </th>
                <th className="py-3.5 px-3.5 min-w-[190px]">
                  NGUYÊN NHÂN &<br />
                  HÀNH ĐỘNG KHẮC PHỤC
                </th>
                <th className="py-3.5 px-3.5 min-w-[160px]">
                  KẾT QUẢ SAU
                  <br />
                  KHẮC PHỤC / CHẠY LẠI
                </th>
                <th className="py-3.5 px-3.5 w-36">KTV / NGƯỜI KT</th>
                <th className="py-3.5 px-3.5 text-right w-36" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {filteredBm09Logs.length === 0 ? (
                <tr>
                  <td
                    colSpan={8}
                    className="py-12 text-center text-slate-400 italic text-xs"
                  >
                    🎉 Không có bản ghi nội kiểm nào trong chế độ lọc này. Hệ
                    thống vận hành ổn định!
                  </td>
                </tr>
              ) : (
                filteredBm09Logs.map(({ log, originalIndex }) => {
                  const controlBadges = resolveControlLotsForBm09Entry(
                    log,
                    configs,
                    reagents
                  );
                  const rulesText = [log.rules_single, log.rules_cross]
                    .filter(Boolean)
                    .join(" · ");
                  const isUnresolvedFail =
                    log.status === "FAIL" && !log.resolved;
                  const hadViolationOrRule =
                    log.status === "FAIL" ||
                    Boolean(log.rules_single) ||
                    Boolean(log.rules_cross) ||
                    Boolean(log.post_fix_result);
                  const isFixedIncident = log.resolved && hadViolationOrRule;

                  return (
                    <tr
                      key={`${log.run_id}-${log.test_id}-${originalIndex}`}
                      className={`transition ${
                        isUnresolvedFail
                          ? "bg-rose-50/40 hover:bg-rose-50/70"
                          : "bg-white hover:bg-slate-50/80"
                      }`}
                    >
                      {/* CỘT 1: NGÀY / GIỜ */}
                      <td className="py-3.5 px-3.5 align-middle whitespace-nowrap">
                        <div className="font-black text-slate-900 text-xs">
                          {formatDateVN(log.run_date)}
                        </div>
                        <div className="text-[11px] font-medium text-slate-500 mt-0.5">
                          {String(log.run_time || "08h00").replace(":", "h")}
                        </div>
                      </td>

                      {/* CỘT 2: THIẾT BỊ · XÉT NGHIỆM & ĐẦY ĐỦ CÁC LỌ HÓA CHẤT QC SẮC NÉT */}
                      <td className="py-3.5 px-3.5 align-middle">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <button
                            type="button"
                            onClick={() =>
                              triggerJumpToLJChart(log.test_id, false)
                            }
                            className="font-black text-slate-900 hover:text-blue-700 hover:underline text-[13.5px] leading-snug text-left"
                          >
                            {log.test_name}
                          </button>
                          {log.edit_log && log.edit_log.length > 0 && (
                            <span
                              className="text-[9.5px] bg-indigo-100 text-indigo-800 px-1.5 py-0.5 rounded font-bold inline-block"
                              title={log.edit_log
                                .map(
                                  (el) =>
                                    `[${el.edited_at}] ${el.edited_by}: ${el.old_val} ➔ ${el.new_val}`
                                )
                                .join("\n")}
                            >
                              🖋️ Sửa ({log.edit_log.length})
                            </span>
                          )}
                        </div>

                        <div className="text-[11px] font-black uppercase text-blue-600 mt-0.5">
                          {log.machine_name} ·
                        </div>

                        <div className="mt-1 flex flex-col gap-1">
                          {controlBadges.map((b, bIdx) => {
                            const badgeStyle =
                              b.levelTag === "L1"
                                ? "bg-sky-50 text-sky-900 border-sky-300"
                                : b.levelTag === "L2"
                                ? "bg-purple-50 text-purple-900 border-purple-300"
                                : b.levelTag === "L3"
                                ? "bg-amber-50 text-amber-900 border-amber-300"
                                : "bg-indigo-50 text-indigo-900 border-indigo-200";

                            return (
                              <div
                                key={`${b.controlName}-${b.lotNumber}-${bIdx}`}
                                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md border text-[10px] leading-tight w-fit ${badgeStyle}`}
                              >
                                {b.levelTag && (
                                  <span className="font-black uppercase">
                                    {b.levelTag}:
                                  </span>
                                )}
                                <span className="font-extrabold uppercase">
                                  {b.controlName}
                                </span>
                                {b.lotNumber && (
                                  <span className="font-mono font-bold opacity-90">
                                    · Lô: {b.lotNumber}
                                  </span>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </td>

                      {/* CỘT 3: KẾT QUẢ ĐO (L1 / L2 / L3) */}
                      <td className="py-3.5 px-3.5 align-middle">
                        <div className="space-y-1 max-w-[165px] mx-auto">
                          {renderResultLine(
                            "L1",
                            log.val_L1,
                            log.z_L1,
                            log.qual_L1
                          )}
                          {renderResultLine(
                            "L2",
                            log.val_L2,
                            log.z_L2,
                            log.qual_L2
                          )}
                          {renderResultLine(
                            "L3",
                            log.val_L3,
                            log.z_L3,
                            log.qual_L3
                          )}
                        </div>
                      </td>

                      {/* CỘT 4: TRẠNG THÁI XỬ LÝ & QUY TẮC GỐC */}
                      <td className="py-3.5 px-3.5 align-middle text-center">
                        {isFixedIncident ? (
                          <div className="space-y-1">
                            <span className="inline-block px-3 py-1 rounded-full text-[10.5px] font-black uppercase bg-emerald-100 text-emerald-800 border border-emerald-300">
                              ✓ ĐÃ KHẮC PHỤC
                            </span>
                            {rulesText && (
                              <div className="text-[10.5px] font-mono font-bold text-slate-600">
                                Rule gốc: {rulesText}
                              </div>
                            )}
                          </div>
                        ) : log.status === "FAIL" ? (
                          <div className="space-y-1">
                            <span className="inline-block px-3 py-1 rounded-full text-[10.5px] font-black uppercase bg-rose-600 text-white border border-rose-700 shadow-xs animate-pulse">
                              🚨 VI PHẠM (FAIL)
                            </span>
                            {rulesText && (
                              <div className="text-[10.5px] font-mono font-black text-rose-700">
                                {rulesText}
                              </div>
                            )}
                          </div>
                        ) : log.status === "WARN" ? (
                          <div className="space-y-1">
                            <span className="inline-block px-3 py-1 rounded-full text-[10.5px] font-black uppercase bg-amber-100 text-amber-900 border border-amber-300">
                              ⚠️ CẢNH BÁO 1-2S
                            </span>
                            {rulesText && (
                              <div className="text-[10px] font-mono font-bold text-amber-800">
                                {rulesText}
                              </div>
                            )}
                          </div>
                        ) : (
                          <span className="inline-block px-3 py-1 rounded-full text-[10.5px] font-black uppercase bg-emerald-100 text-emerald-800 border border-emerald-300">
                            ✓ ĐẠT CHUẨN
                          </span>
                        )}
                      </td>

                      {/* CỘT 5: NGUYÊN NHÂN & HÀNH ĐỘNG KHẮC PHỤC */}
                      <td className="py-3.5 px-3.5 align-middle">
                        {log.cause || log.action_taken ? (
                          <div className="space-y-1 text-xs">
                            {log.cause && (
                              <div>
                                <span className="font-bold text-slate-500">
                                  NN:{" "}
                                </span>
                                <b className="text-slate-900">{log.cause}</b>
                              </div>
                            )}
                            {log.action_taken && (
                              <div>
                                <span className="font-bold text-slate-500">
                                  KP:{" "}
                                </span>
                                <span className="font-semibold text-indigo-950">
                                  {log.action_taken}
                                </span>
                              </div>
                            )}
                          </div>
                        ) : (
                          <div className="text-rose-600 italic font-bold text-xs leading-snug">
                            Chưa ghi nhận nguyên
                            <br />
                            nhân & khắc phục
                          </div>
                        )}
                      </td>

                      {/* CỘT 6: KẾT QUẢ SAU KHẮC PHỤC / CHẠY LẠI */}
                      <td className="py-3.5 px-3.5 align-middle">
                        {log.post_fix_result &&
                        log.post_fix_result !== "Đang chờ kiểm tra lại" ? (
                          <div className="font-bold text-emerald-700 text-xs">
                            ✓ {log.post_fix_result}
                          </div>
                        ) : log.status === "FAIL" && !log.resolved ? (
                          <div className="font-bold text-amber-700 text-xs">
                            ⏳ Đang chờ kiểm tra lại
                          </div>
                        ) : (
                          <div className="font-bold text-emerald-700 text-xs">
                            ✓ Đạt sau khắc phục
                          </div>
                        )}
                      </td>

                      {/* CỘT 7: KTV / NGƯỜI KIỂM TRA */}
                      <td className="py-3.5 px-3.5 align-middle whitespace-nowrap">
                        <div className="font-bold text-slate-800 text-xs">
                          TH: {log.operator_name || "—"}
                        </div>
                        {log.checker_name ? (
                          <div className="text-[11px] font-black text-emerald-800 mt-0.5">
                            ✓ KT: {log.checker_name}
                          </div>
                        ) : (
                          hasPermission(currentUser, "SIGN_BM09_CHECKER") && (
                            <button
                              type="button"
                              onClick={() =>
                                handleQuickSignChecker(log, originalIndex)
                              }
                              className="mt-1 px-2.5 py-0.5 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300 font-black text-[10px] transition"
                            >
                              ✍️ Ký duyệt KT
                            </button>
                          )
                        )}
                      </td>

                      {/* CỘT 8: NÚT CẬP NHẬT KHẮC PHỤC & MỞ BIỂU ĐỒ L-J */}
                      <td className="py-3.5 px-3.5 align-middle text-right whitespace-nowrap">
                        <div className="inline-flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() =>
                              handleOpenCorrectiveModal(log, originalIndex)
                            }
                            className={`px-3.5 py-2 rounded-xl font-black text-xs inline-flex items-center gap-1 transition border ${
                              isUnresolvedFail
                                ? "bg-rose-600 hover:bg-rose-700 text-white border-rose-700 shadow-xs"
                                : "bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border-indigo-200"
                            }`}
                          >
                            <span>🔧 Cập nhật</span>
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              triggerJumpToLJChart(log.test_id, false)
                            }
                            title="Mở Biểu đồ Levey-Jennings của xét nghiệm này"
                            className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 hover:text-slate-900 transition"
                          >
                            <Ic.BarChart />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* =================================================================== */}
      {/* MODAL KHẮC PHỤC SỰ CỐ WESTGARD & NHẬP KQ CHẠY LẠI ĐA MỨC (L1·L2·L3)  */}
      {/* =================================================================== */}
      {correctiveModal &&
        (() => {
          const targetCfg =
            correctiveModal.testConfig ||
            configs.find((c) => c.test_id === correctiveModal.testId);
          const isQual = targetCfg?.test_type === "QUALITATIVE";
          const canOverride = hasPermission(currentUser, "OVERRIDE_RESOLUTION");
          const canSign = hasPermission(currentUser, "SIGN_BM09_CHECKER");

          return (
            <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
              <div className="bg-white border-2 border-rose-400 rounded-3xl w-full max-w-2xl p-6 shadow-2xl space-y-4 max-h-[92vh] overflow-y-auto">
                <div className="bg-rose-50 border border-rose-200 p-4 rounded-2xl flex justify-between items-start gap-2">
                  <div>
                    <span className="bg-rose-600 text-white px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase">
                      Khắc phục sự cố Westgard (BM.09)
                    </span>
                    <h3 className="text-base font-black text-slate-900 mt-1.5">
                      Xử Lý Lỗi: {correctiveModal.testName} (
                      {correctiveModal.machineName})
                    </h3>
                    <div className="text-xs font-semibold text-slate-600 mt-0.5">
                      Ngày phát sinh:{" "}
                      <b>{formatDateVN(correctiveModal.runDate)}</b> (
                      {correctiveModal.runTime}) · Hóa chất:{" "}
                      <b>{correctiveModal.controlName}</b> · Lô:{" "}
                      <b className="font-mono text-indigo-800">
                        {correctiveModal.lotNumber}
                      </b>
                    </div>
                    <div className="text-xs font-bold text-rose-700 mt-0.5">
                      Rule gốc:{" "}
                      <span className="font-mono">
                        {correctiveModal.rulesText}
                      </span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setCorrectiveModal(null)}
                    className="px-3 py-1 rounded-xl bg-white hover:bg-slate-100 border border-slate-200 font-bold text-slate-700 text-xs"
                  >
                    ✕ Đóng
                  </button>
                </div>

                <form
                  onSubmit={handleSaveCorrectiveAction}
                  className="space-y-4 text-xs"
                >
                  {/* KHỐI 1: NGUYÊN NHÂN SAI SỐ */}
                  <div>
                    <label className="font-black text-slate-800 block mb-1">
                      1. Nguyên nhân gây sai số / vi phạm quy tắc Westgard *
                    </label>
                    <input
                      type="text"
                      required
                      value={correctiveModal.cause}
                      onChange={(e) =>
                        setCorrectiveModal({
                          ...correctiveModal,
                          cause: e.target.value,
                        })
                      }
                      placeholder="Nhập nguyên nhân gốc rễ..."
                      className="w-full bg-slate-50 border border-slate-300 focus:border-blue-600 rounded-xl px-3.5 py-2 font-bold text-slate-900 outline-none"
                    />
                    <div className="flex flex-wrap gap-1.5 mt-1.5">
                      {SUGGESTED_CAUSES.map((c) => (
                        <button
                          key={c}
                          type="button"
                          onClick={() =>
                            setCorrectiveModal((p) =>
                              p
                                ? {
                                    ...p,
                                    cause: p.cause ? `${p.cause}; ${c}` : c,
                                  }
                                : null
                            )
                          }
                          className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-blue-50 text-slate-700 hover:text-blue-800 border border-slate-200 font-semibold text-[11px] transition"
                        >
                          + {c}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* KHỐI 2: HÀNH ĐỘNG KHẮC PHỤC */}
                  <div>
                    <label className="font-black text-slate-800 block mb-1">
                      2. Hành động khắc phục đã thực hiện *
                    </label>
                    <input
                      type="text"
                      required
                      value={correctiveModal.action}
                      onChange={(e) =>
                        setCorrectiveModal({
                          ...correctiveModal,
                          action: e.target.value,
                        })
                      }
                      placeholder="Nhập hành động khắc phục đã thực hiện..."
                      className="w-full bg-slate-50 border border-slate-300 focus:border-blue-600 rounded-xl px-3.5 py-2 font-bold text-slate-900 outline-none"
                    />
                    <div className="flex flex-wrap gap-1.5 mt-1.5">
                      {SUGGESTED_ACTIONS.map((a) => (
                        <button
                          key={a}
                          type="button"
                          onClick={() =>
                            setCorrectiveModal((p) =>
                              p
                                ? {
                                    ...p,
                                    action: p.action ? `${p.action}; ${a}` : a,
                                  }
                                : null
                            )
                          }
                          className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-indigo-50 text-slate-700 hover:text-indigo-800 border border-slate-200 font-semibold text-[11px] transition"
                        >
                          + {a}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* KHỐI 3: NHẬP KẾT QUẢ CHẠY KIỂM TRA LẠI ĐA MỨC (L1, L2, L3) */}
                  {targetCfg && (
                    <div className="bg-sky-50/70 border-2 border-sky-200 rounded-2xl p-4 space-y-3">
                      <div className="flex items-center justify-between flex-wrap gap-2">
                        <span className="font-black text-sky-950 uppercase text-[11px]">
                          3. Nhập Kết Quả Chạy Kiểm Tra Lại Đa Mức (L1 · L2 ·
                          L3)
                        </span>
                        <span className="text-[10.5px] font-semibold text-rose-800 bg-white px-2.5 py-0.5 rounded-full border border-rose-200">
                          Mức phát hiện lỗi:{" "}
                          {correctiveModal.violatedLevels.join(", ")}
                        </span>
                      </div>
                      <div
                        className={`grid grid-cols-1 ${
                          correctiveModal.allAvailableLevels.length === 3
                            ? "sm:grid-cols-3"
                            : correctiveModal.allAvailableLevels.length === 2
                            ? "sm:grid-cols-2"
                            : "sm:grid-cols-1"
                        } gap-3`}
                      >
                        {correctiveModal.allAvailableLevels.map((lv) => {
                          const meanRef =
                            lv === "L1"
                              ? targetCfg.mean_L1
                              : lv === "L2"
                              ? targetCfg.mean_L2
                              : targetCfg.mean_L3;
                          const sdRef =
                            lv === "L1"
                              ? targetCfg.sd_L1
                              : lv === "L2"
                              ? targetCfg.sd_L2
                              : targetCfg.sd_L3;
                          const expQual =
                            lv === "L1"
                              ? targetCfg.expected_qual_L1 || "ÂM TÍNH"
                              : lv === "L2"
                              ? targetCfg.expected_qual_L2 || "DƯƠNG TÍNH"
                              : targetCfg.expected_qual_L3 || "DƯƠNG TÍNH";

                          const isViolatedLv =
                            correctiveModal.violatedLevels.indexOf(lv) !== -1;
                          const draftVal =
                            correctiveModal.reRunInputs[lv] || "";
                          const parsedNum =
                            !isQual && draftVal.trim() !== ""
                              ? parseFloat(draftVal.trim().replace(/,/g, "."))
                              : null;
                          const previewZ =
                            parsedNum !== null && !isNaN(parsedNum) && sdRef > 0
                              ? (parsedNum - meanRef) / sdRef
                              : null;
                          const previewBadge =
                            previewZ !== null
                              ? formatSDPositionBadge(previewZ)
                              : null;

                          return (
                            <div
                              key={lv}
                              className={`bg-white border-2 rounded-xl p-3 space-y-1.5 shadow-xs ${
                                isViolatedLv
                                  ? "border-rose-300 ring-2 ring-rose-100"
                                  : "border-sky-200"
                              }`}
                            >
                              <div className="flex items-center justify-between gap-1">
                                <div className="flex items-center gap-1.5">
                                  <span className="font-black text-slate-900">
                                    Mức {lv}
                                  </span>
                                  <span
                                    className={`text-[9.5px] font-black px-1.5 py-0.5 rounded uppercase ${
                                      isViolatedLv
                                        ? "bg-rose-100 text-rose-800"
                                        : "bg-slate-100 text-slate-600"
                                    }`}
                                  >
                                    {isViolatedLv ? "Mức lỗi" : "Chạy kèm"}
                                  </span>
                                </div>
                                {!isQual ? (
                                  <span className="font-mono text-[10px] text-slate-500">
                                    Đích: {meanRef} ± {sdRef}
                                  </span>
                                ) : (
                                  <span className="text-[10px] font-bold text-emerald-700">
                                    Chứng: {expQual}
                                  </span>
                                )}
                              </div>

                              {!isQual ? (
                                <>
                                  <input
                                    type="text"
                                    inputMode="decimal"
                                    value={draftVal}
                                    onChange={(e) =>
                                      setCorrectiveModal({
                                        ...correctiveModal,
                                        reRunInputs: {
                                          ...correctiveModal.reRunInputs,
                                          [lv]: e.target.value.replace(
                                            /,/g,
                                            "."
                                          ),
                                        },
                                      })
                                    }
                                    placeholder={`Nhập KQ chạy lại ${lv}...`}
                                    className="w-full border-2 border-sky-300 focus:border-blue-600 rounded-lg px-2.5 py-1.5 font-mono font-black text-right text-slate-900 outline-none"
                                  />
                                  {previewBadge && (
                                    <div
                                      className={`text-[10px] font-mono font-black px-2 py-0.5 rounded border text-center ${previewBadge.cls}`}
                                    >
                                      {previewBadge.shortRule}
                                    </div>
                                  )}
                                </>
                              ) : (
                                <select
                                  value={draftVal || expQual}
                                  onChange={(e) =>
                                    setCorrectiveModal({
                                      ...correctiveModal,
                                      reRunInputs: {
                                        ...correctiveModal.reRunInputs,
                                        [lv]: e.target.value,
                                      },
                                    })
                                  }
                                  className="w-full border-2 border-sky-300 p-2 rounded-xl font-black text-xs outline-none"
                                >
                                  {QUALITATIVE_OPTIONS.map((opt) => (
                                    <option key={opt} value={opt}>
                                      {opt}
                                    </option>
                                  ))}
                                </select>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* KHỐI 4: GHI CHÚ KẾT QUẢ SAU KHẮC PHỤC & NGƯỜI KIỂM TRA */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                    <div>
                      <label className="font-black text-slate-800 block mb-1">
                        4. Ghi chú kết quả sau khắc phục:
                      </label>
                      <input
                        type="text"
                        value={correctiveModal.postFixResultText}
                        onChange={(e) =>
                          setCorrectiveModal({
                            ...correctiveModal,
                            postFixResultText: e.target.value,
                          })
                        }
                        placeholder="Tự động tổng hợp từ KQ chạy lại nếu để trống..."
                        className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 font-semibold text-slate-800 outline-none"
                      />
                    </div>

                    <div>
                      <label className="font-black text-slate-800 block mb-1">
                        5. Người kiểm tra / Ký duyệt BM.09:
                      </label>
                      <input
                        type="text"
                        disabled={!canSign}
                        value={correctiveModal.checkerNameDraft}
                        onChange={(e) =>
                          setCorrectiveModal({
                            ...correctiveModal,
                            checkerNameDraft: e.target.value,
                          })
                        }
                        placeholder={
                          canSign
                            ? "Nhập tên người kiểm tra..."
                            : "Cần quyền Ký kiểm tra BM.09"
                        }
                        className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 font-bold text-emerald-900 outline-none disabled:opacity-60"
                      />
                    </div>
                  </div>

                  {/* QUYỀN CAN THIỆP TRẠNG THÁI (OVERRIDE_RESOLUTION) */}
                  {canOverride && (
                    <div className="bg-indigo-50/80 border border-indigo-200 p-3.5 rounded-2xl flex flex-wrap items-center justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <span className="font-black text-indigo-950">
                          Quyền Quản trị (Override):
                        </span>
                        <select
                          value={correctiveModal.adminStatusOverride}
                          onChange={(e) =>
                            setCorrectiveModal({
                              ...correctiveModal,
                              adminStatusOverride: e.target.value as
                                | "PASS"
                                | "WARN"
                                | "FAIL",
                            })
                          }
                          className="bg-white border border-indigo-300 rounded-lg px-2.5 py-1 font-bold text-indigo-900"
                        >
                          <option value="FAIL">Vi phạm (FAIL)</option>
                          <option value="WARN">Cảnh báo (WARN)</option>
                          <option value="PASS">Đạt (PASS)</option>
                        </select>
                      </div>
                      <label className="flex items-center gap-2 font-bold text-indigo-950 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={correctiveModal.adminResolvedOverride}
                          onChange={(e) =>
                            setCorrectiveModal({
                              ...correctiveModal,
                              adminResolvedOverride: e.target.checked,
                            })
                          }
                          className="w-4 h-4 accent-emerald-600 rounded"
                        />
                        <span>Đánh dấu Đã khắc phục xong (Resolved)</span>
                      </label>
                    </div>
                  )}

                  <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                    <button
                      type="button"
                      onClick={() => setCorrectiveModal(null)}
                      className="px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs"
                    >
                      Hủy
                    </button>
                    <button
                      type="submit"
                      className="px-6 py-2.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:brightness-105 text-white font-black rounded-xl text-xs shadow-md transition"
                    >
                      ✓ Lưu Khắc Phục & Cập Nhật Biểu Đồ L-J
                    </button>
                  </div>
                </form>
              </div>
            </div>
          );
        })()}
    </div>
  );
}
// ================= KẾT THÚC TOÀN BỘ FILE BangDieuKhien.tsx =================
