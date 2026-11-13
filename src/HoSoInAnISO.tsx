import React, { useState, useEffect, useMemo, useCallback } from "react";
import {
  TestConfig,
  HistoryPoint,
  BM09LogEntry,
  ReagentLotBM16,
  UserAccount,
  ReportSubTab,
  formatDateVN,
  formatShortDM,
  getVnIsoDateString,
  getVnFirstDayOfMonthString,
  getVnTimeString,
  computeMuAndSigma,
  getUsageCountForMonthDay,
  hasPermission,
  rpcCall,
  formatSmartDecimal,
  usePersistentState,
} from "./KieuDuLieu";
import Luminous3DLJChart, {
  mergeArchivedAndActivePoints,
  filterHistorySeries,
} from "./BieuDoLJ";

// ============================================================================
// FILE: src/HoSoInAnISO.tsx — PHẦN 1/2 (CORE STATE, SYNC DELETE & TABLE ENGINE)
// - Bảo tồn 100% giao diện & bố cục in ấn gốc của HoSoInAnISOdang dung.tsx.
// - Hàm getShortName rút gọn chuẩn: "Tô Hoàng Long" -> "H.Long", "Thị Hiền" -> "T.Hiền".
// - Bổ sung thuật toán paginateBm09LogsByVisualHeight: Đo chiều cao thực tế của
//   từng dòng BM.09 (theo độ dài Quy tắc vi phạm, Nguyên nhân, Khắc phục, KQ KT lại)
//   và chỉ bù số dòng trống vừa khít diện tích còn lại của trang A4 Landscape,
//   chấm dứt 100% hiện tượng rớt 1-2 dòng sang trang phụ.
// ✦ An intellectual product by Handsome Long ✦
// ============================================================================

export const LJ_DAILY_NOTES_STORAGE_KEY = "ORIO_LJ_DAILY_NOTES_V7";

/**
 * Rút gọn tên Người thực hiện:
 * "Tô Hoàng Long" -> "H.Long", "Nguyễn Thị Hiền" -> "T.Hiền", "Huỳnh Quang Sang" -> "Q.Sang"
 */
export function getShortName(fullName?: string): string {
  const clean = String(fullName || "").trim();
  if (!clean) return "";
  const parts = clean.split(/\s+/);
  if (parts.length === 1) return parts[0];
  const last = parts[parts.length - 1];
  const prevInitial = parts[parts.length - 2].charAt(0).toUpperCase();
  return `${prevInitial}.${last}`;
}

export interface Bm09PageChunk {
  items: BM09LogEntry[];
  fillerCount: number;
}

/**
 * Ước lượng chiều cao hiển thị (quy đổi ra đơn vị dòng chuẩn h-7) của 1 bản ghi BM.09
 * để trang A4 ngang không bao giờ bị tràn khi có nhiều quy tắc vi phạm dài.
 */
export function estimateBm09RowVisualUnits(
  l: BM09LogEntry,
  showMachineSubLine: boolean
): number {
  const rulesCombined = [l.rules_single, l.rules_cross]
    .filter(Boolean)
    .join(", ");

  const testLines = showMachineSubLine
    ? String(l.machine_name || "").length > 14
      ? 2.4
      : 1.8
    : 1;
  const ruleLines = rulesCombined ? Math.ceil(rulesCombined.length / 13) : 1;
  const causeLines = l.cause ? Math.ceil(l.cause.length / 24) : 1;
  const actionLines = l.action_taken
    ? Math.ceil(l.action_taken.length / 24)
    : 1;
  const postFixLines =
    (l.post_fix_result ? Math.ceil(l.post_fix_result.length / 15) : 1) +
    (Array.isArray(l.edit_log) ? l.edit_log.length : 0);

  const maxTextLines = Math.max(
    1,
    testLines,
    ruleLines,
    causeLines,
    actionLines,
    postFixLines
  );

  if (maxTextLines <= 1.5) return 1.0;
  if (maxTextLines <= 2.5) return 1.25;
  return Number((1.25 + (maxTextLines - 2.5) * 0.42).toFixed(2));
}

/**
 * Chia danh sách bản ghi BM.09 thành các trang A4 Landscape dựa trên tổng chiều cao thực tế
 * (Tối đa 11.5 đơn vị dòng chuẩn h-7 trên 1 trang A4 ngang).
 */
export function paginateBm09LogsByVisualHeight(
  logs: BM09LogEntry[],
  showMachineSubLine: boolean,
  maxUnitsPerPage = 11.5
): Bm09PageChunk[] {
  if (!Array.isArray(logs) || logs.length === 0) {
    return [{ items: [], fillerCount: 11 }];
  }

  const pages: Bm09PageChunk[] = [];
  let currentItems: BM09LogEntry[] = [];
  let currentUnits = 0;

  logs.forEach((log) => {
    const rowUnits = estimateBm09RowVisualUnits(log, showMachineSubLine);
    if (currentItems.length > 0 && currentUnits + rowUnits > maxUnitsPerPage) {
      const rem = Math.max(0, Math.floor(maxUnitsPerPage - currentUnits));
      pages.push({ items: currentItems, fillerCount: rem });
      currentItems = [log];
      currentUnits = rowUnits;
    } else {
      currentItems.push(log);
      currentUnits += rowUnits;
    }
  });

  if (currentItems.length > 0) {
    const rem = Math.max(0, Math.floor(maxUnitsPerPage - currentUnits));
    pages.push({ items: currentItems, fillerCount: rem });
  }

  return pages;
}

export default function HoSoInAnISO({
  apiUrl,
  authToken,
  currentUser,
  runDate,
  labMachines,
  configs,
  setConfigs,
  bm09Logs,
  setBm09Logs,
  reagents,
}: {
  apiUrl: string;
  authToken: string;
  currentUser: UserAccount;
  runDate: string;
  labMachines: { section: string; machine: string }[];
  configs: TestConfig[];
  setConfigs: React.Dispatch<React.SetStateAction<TestConfig[]>>;
  bm09Logs: BM09LogEntry[];
  setBm09Logs: React.Dispatch<React.SetStateAction<BM09LogEntry[]>>;
  reagents: ReagentLotBM16[];
}) {
  const [subTab, setSubTab] = useState<
    "LJ_PRINT" | "BM01_RANGE" | "BM09_LOG" | "BM16_REAGENT"
  >("LJ_PRINT");

  // Lập trình phòng thủ chống lỗi undefined khi đọc danh sách Lab
  const allSections = useMemo(
    () =>
      Array.from(
        new Set([
          ...(labMachines || []).map((m) => m.section),
          ...(configs || []).map((c) => c.section),
        ])
      ).filter(Boolean),
    [labMachines, configs]
  );

  const [selSection, setSelSection] = useState<string>(
    allSections[0] || "Sinh Hóa"
  );
  const [selMachine, setSelMachine] = useState<string>("Tất cả máy");
  const [selTestId, setSelTestId] = useState<string>(configs[0]?.test_id || "");
  const [levelViewMode, setLevelViewMode] = useState<
    "L1" | "L2" | "L3" | "COMBINED"
  >("COMBINED");

  const [hideFailsInPrint, setHideFailsInPrint] = useState<boolean>(true);
  const [bm09OnlyWarnFail, setBm09OnlyWarnFail] = useState<boolean>(false);

  const [reportMonth, setReportMonth] = useState<string>(() =>
    runDate.slice(0, 7)
  );
  const [fromDate, setFromDate] = useState<string>(() =>
    getVnFirstDayOfMonthString()
  );
  const [toDate, setToDate] = useState<string>(() => runDate);

  const [archivedLjMap, setArchivedLjMap] = useState<
    Record<
      string,
      { L1: HistoryPoint[]; L2: HistoryPoint[]; L3: HistoryPoint[] }
    >
  >({});
  const [archivedBm09, setArchivedBm09] = useState<BM09LogEntry[]>([]);

  // Lưu trữ Ghi chú từng ngày trên Bảng L-J Phần II
  const [dailyNotesMap, setDailyNotesMap] = usePersistentState<
    Record<string, string>
  >(LJ_DAILY_NOTES_STORAGE_KEY, {});

  // State Modal Kiểm toán Điểm L-J (Sửa / Xóa đồng bộ BM.09)
  const [selectedPointModal, setSelectedPointModal] = useState<{
    levelKey: "L1" | "L2" | "L3";
    levelLabel: string;
    point: HistoryPoint;
  } | null>(null);
  const [editPointVal, setEditPointVal] = useState<string>("");
  const [editPointNote, setEditPointNote] = useState<string>("");
  const [deleteAllLevelsSameDay, setDeleteAllLevelsSameDay] =
    useState<boolean>(true);
  const [isUpdatingPoint, setIsUpdatingPoint] = useState<boolean>(false);

  const machinesInSection = useMemo(
    () =>
      (labMachines || [])
        .filter((m) => selSection === "Tất cả" || m.section === selSection)
        .map((m) => m.machine),
    [labMachines, selSection]
  );

  const filteredTests = useMemo(
    () =>
      (configs || [])
        .filter(
          (c) =>
            (selSection === "Tất cả" || c.section === selSection) &&
            (selMachine === "Tất cả máy" || c.machine_name === selMachine)
        )
        .sort((a, b) => a.order - b.order),
    [configs, selSection, selMachine]
  );

  const rawActiveTest =
    filteredTests.find((t) => t.test_id === selTestId) ||
    filteredTests[0] ||
    configs[0];

  useEffect(() => {
    if (subTab !== "LJ_PRINT" || !rawActiveTest) return;
    const earliestHot = rawActiveTest.history_L1?.[0]?.isoDate || "9999-12-31";
    if (fromDate < earliestHot) {
      const archKey = `${rawActiveTest.test_id}__${fromDate.slice(
        0,
        7
      )}__${toDate.slice(0, 7)}`;
      if (archivedLjMap[archKey]) return;
      rpcCall(
        apiUrl,
        "get_historical_data",
        {
          test_id: rawActiveTest.test_id,
          from_month: fromDate.slice(0, 7),
          to_month: toDate.slice(0, 7),
        },
        authToken
      ).then((res) => {
        if (
          res.net &&
          res.body?.status === "success" &&
          res.body.data?.lj_archive
        )
          setArchivedLjMap((prev) => ({
            ...prev,
            [archKey]: res.body.data.lj_archive,
          }));
      });
    }
  }, [
    subTab,
    rawActiveTest,
    fromDate,
    toDate,
    apiUrl,
    authToken,
    archivedLjMap,
  ]);

  useEffect(() => {
    if (subTab !== "BM09_LOG" || !reportMonth) return;
    rpcCall(
      apiUrl,
      "get_historical_data",
      { bm09_month: reportMonth },
      authToken
    ).then((res) => {
      if (
        res.net &&
        res.body?.status === "success" &&
        Array.isArray(res.body.data?.bm09_archive)
      )
        setArchivedBm09(res.body.data.bm09_archive);
    });
  }, [subTab, reportMonth, apiUrl, authToken]);

  const activeTest = useMemo(() => {
    if (!rawActiveTest) return undefined;
    const archKey = `${rawActiveTest.test_id}__${fromDate.slice(
      0,
      7
    )}__${toDate.slice(0, 7)}`;
    const arch = archivedLjMap[archKey];
    if (!arch) return rawActiveTest;
    return {
      ...rawActiveTest,
      history_L1: mergeArchivedAndActivePoints(
        arch.L1,
        rawActiveTest.history_L1
      ),
      history_L2: mergeArchivedAndActivePoints(
        arch.L2,
        rawActiveTest.history_L2
      ),
      history_L3: mergeArchivedAndActivePoints(
        arch.L3,
        rawActiveTest.history_L3
      ),
    };
  }, [rawActiveTest, fromDate, toDate, archivedLjMap]);

  // Khóa lưu ghi chú cho từng dòng ngày trên Bảng L-J Phần II
  const makeDailyNoteKey = useCallback(
    (testId: string, isoDate: string, isRerun: boolean) =>
      `${testId}__${isoDate}__${isRerun ? "R" : "M"}`,
    []
  );

  const handleUpdateDailyNote = useCallback(
    (testId: string, isoDate: string, isRerun: boolean, text: string) => {
      const k = makeDailyNoteKey(testId, isoDate, isRerun);
      setDailyNotesMap((prev) => ({ ...prev, [k]: text }));
    },
    [makeDailyNoteKey, setDailyNotesMap]
  );

  // Mở Modal khi nhấp vào điểm trên Biểu đồ L-J hoặc dòng trên Bảng II
  const handleSelectPointOnChart = useCallback(
    (levelKey: "L1" | "L2" | "L3", levelLabel: string, point: HistoryPoint) => {
      if (!activeTest) return;
      setSelectedPointModal({ levelKey, levelLabel, point });
      setEditPointVal(String(point.val));
      const existingNote =
        dailyNotesMap[
          makeDailyNoteKey(
            activeTest.test_id,
            point.isoDate,
            Boolean(point.is_rerun)
          )
        ] || "";
      setEditPointNote(existingNote);
      setDeleteAllLevelsSameDay(true);
    },
    [activeTest, dailyNotesMap, makeDailyNoteKey]
  );

  // --- SỬA ĐIỂM L-J CÓ LƯU VẾT AUDIT TRAIL & ĐỒNG BỘ BM.09 ---
  const handleSavePointEdit = async () => {
    if (!selectedPointModal || !activeTest) return;
    const cleanNum = parseFloat(editPointVal.trim().replace(/,/g, "."));
    if (isNaN(cleanNum)) {
      window.alert("⚠️ Giá trị kết quả chỉnh sửa không hợp lệ!");
      return;
    }

    setIsUpdatingPoint(true);
    const { levelKey, point } = selectedPointModal;
    const mean =
      levelKey === "L1"
        ? activeTest.mean_L1
        : levelKey === "L2"
        ? activeTest.mean_L2
        : activeTest.mean_L3;
    const sd =
      levelKey === "L1"
        ? activeTest.sd_L1
        : levelKey === "L2"
        ? activeTest.sd_L2
        : activeTest.sd_L3;
    const newZ = sd > 0 ? Number(((cleanNum - mean) / sd).toFixed(2)) : 0;
    const newSingleStatus: "PASS" | "WARN" | "FAIL" =
      Math.abs(newZ) >= 3 ? "FAIL" : Math.abs(newZ) >= 2 ? "WARN" : "PASS";
    const nowStamp = `${formatShortDM(
      getVnIsoDateString()
    )} ${getVnTimeString()}`;

    if (editPointNote.trim() !== "") {
      handleUpdateDailyNote(
        activeTest.test_id,
        point.isoDate,
        Boolean(point.is_rerun),
        editPointNote.trim()
      );
    }

    let updatedCfgForCloud: TestConfig | null = null;
    setConfigs((prev) =>
      prev.map((c) => {
        if (c.test_id !== activeTest.test_id) return c;
        const field =
          levelKey === "L1"
            ? "history_L1"
            : levelKey === "L2"
            ? "history_L2"
            : "history_L3";
        const arr = Array.isArray(c[field]) ? [...(c[field] || [])] : [];
        const updatedArr = arr.map((pt) => {
          if (
            pt.isoDate === point.isoDate &&
            pt.lot_number === point.lot_number &&
            Boolean(pt.is_rerun) === Boolean(point.is_rerun)
          ) {
            const logs = Array.isArray(pt.edit_log) ? [...pt.edit_log] : [];
            if (Number(pt.val) !== cleanNum) {
              logs.push({
                edited_at: nowStamp,
                edited_by: currentUser.name,
                old_val: Number(pt.val),
                new_val: cleanNum,
                old_z: Number(pt.z),
                new_z: newZ,
                note:
                  editPointNote.trim() || "Hiệu chỉnh trên Biểu đồ L-J (Audit)",
              });
            }
            return {
              ...pt,
              val: cleanNum,
              z: newZ,
              status: newSingleStatus,
              single_level_status: newSingleStatus,
              single_level_rule:
                newSingleStatus === "FAIL"
                  ? `1-3s (${levelKey})`
                  : newSingleStatus === "WARN"
                  ? `1-2s (${levelKey})`
                  : `Đạt (${levelKey})`,
              edit_log: logs.length > 0 ? logs : undefined,
            };
          }
          return pt;
        });
        const nextObj = { ...c, [field]: updatedArr };
        updatedCfgForCloud = nextObj;
        return nextObj;
      })
    );

    if (!point.is_rerun) {
      setBm09Logs((prev) =>
        prev.map((log) => {
          if (
            log.test_id !== activeTest.test_id ||
            log.run_date !== point.isoDate
          )
            return log;
          const updatedLog = { ...log };
          if (levelKey === "L1") {
            updatedLog.val_L1 = cleanNum;
            updatedLog.z_L1 = newZ;
            updatedLog.lvl1_status = newSingleStatus;
          } else if (levelKey === "L2") {
            updatedLog.val_L2 = cleanNum;
            updatedLog.z_L2 = newZ;
            updatedLog.lvl2_status = newSingleStatus;
          } else if (levelKey === "L3") {
            updatedLog.val_L3 = cleanNum;
            updatedLog.z_L3 = newZ;
            updatedLog.lvl3_status = newSingleStatus;
          }

          const z1Abs = Math.abs(updatedLog.z_L1 ?? 0);
          const z2Abs = Math.abs(updatedLog.z_L2 ?? 0);
          const z3Abs = Math.abs(updatedLog.z_L3 ?? 0);
          const stillHas3s = z1Abs >= 3 || z2Abs >= 3 || z3Abs >= 3;
          if (!stillHas3s && updatedLog.status === "FAIL") {
            updatedLog.status =
              z1Abs >= 2 || z2Abs >= 2 || z3Abs >= 2 ? "WARN" : "PASS";
            updatedLog.resolved = true;
            updatedLog.rules_single = "";
            updatedLog.rules_cross = "";
            updatedLog.post_fix_result = `Đã hiệu chỉnh số liệu (${nowStamp})`;
          }
          return updatedLog;
        })
      );
    }

    const updatePayload: Record<string, any> = {
      test_id: activeTest.test_id,
      run_date: point.isoDate,
      editor_name: currentUser.name,
      edit_note: editPointNote.trim() || "Chỉnh sửa trên Biểu đồ L-J",
    };
    updatePayload[`val_${levelKey}`] = cleanNum;

    await rpcCall(apiUrl, "update_qc_values", updatePayload, authToken);
    if (updatedCfgForCloud) {
      await rpcCall(apiUrl, "save_config", updatedCfgForCloud, authToken);
    }

    setIsUpdatingPoint(false);
    setSelectedPointModal(null);
  };

  // --- XÓA ĐIỂM L-J (VOID_LJ_POINT) & GỠ ĐỒNG BỘ CẢNH BÁO TRÊN BM.09 ---
  const handleVoidDeletePoint = async () => {
    if (!selectedPointModal || !activeTest) return;
    if (!hasPermission(currentUser, "VOID_LJ_POINT")) {
      window.alert("⚠️ Bạn chưa được cấp quyền Xóa điểm QC trên biểu đồ L-J!");
      return;
    }

    const { levelKey, point } = selectedPointModal;
    const confirmMsg = deleteAllLevelsSameDay
      ? `🗑️ XÁC NHẬN XÓA TOÀN BỘ LƯỢT CHẠY NGÀY ${formatDateVN(
          point.isoDate
        )} của xét nghiệm [${
          activeTest.test_name
        }]?\n\nĐiểm trên Biểu đồ L-J và Cảnh báo tương ứng trong Sổ BM.09 sẽ được xóa đồng bộ 100%!`
      : `🗑️ Xác nhận xóa điểm ${levelKey} (${point.val}) ngày ${formatDateVN(
          point.isoDate
        )}?`;

    if (!window.confirm(confirmMsg)) return;
    setIsUpdatingPoint(true);

    setConfigs((prev) =>
      prev.map((c) => {
        if (c.test_id !== activeTest.test_id) return c;
        const matchPredicate = (pt: HistoryPoint) =>
          pt.isoDate === point.isoDate &&
          Boolean(pt.is_rerun) === Boolean(point.is_rerun);

        const nextH1 =
          deleteAllLevelsSameDay || levelKey === "L1"
            ? (c.history_L1 || []).filter((pt) => !matchPredicate(pt))
            : c.history_L1;
        const nextH2 =
          deleteAllLevelsSameDay || levelKey === "L2"
            ? (c.history_L2 || []).filter((pt) => !matchPredicate(pt))
            : c.history_L2;
        const nextH3 =
          deleteAllLevelsSameDay || levelKey === "L3"
            ? (c.history_L3 || []).filter((pt) => !matchPredicate(pt))
            : c.history_L3 || [];

        return {
          ...c,
          accumulated_points:
            !point.is_rerun && c.accumulated_points > 0
              ? c.accumulated_points - 1
              : c.accumulated_points,
          history_L1: nextH1,
          history_L2: nextH2,
          history_L3: nextH3,
        };
      })
    );

    if (!point.is_rerun) {
      setBm09Logs((prev) => {
        if (deleteAllLevelsSameDay) {
          return prev.filter(
            (l) =>
              !(
                l.test_id === activeTest.test_id && l.run_date === point.isoDate
              )
          );
        }
        return prev
          .map((l) => {
            if (
              l.test_id !== activeTest.test_id ||
              l.run_date !== point.isoDate
            )
              return l;
            const nextLog = { ...l };
            if (levelKey === "L1") {
              nextLog.val_L1 = null;
              nextLog.z_L1 = null;
              nextLog.lvl1_status = undefined;
            } else if (levelKey === "L2") {
              nextLog.val_L2 = null;
              nextLog.z_L2 = null;
              nextLog.lvl2_status = undefined;
            } else if (levelKey === "L3") {
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
          .filter((item): item is BM09LogEntry => item !== null);
      });
    } else {
      setBm09Logs((prev) =>
        prev.map((l) => {
          if (
            l.test_id === activeTest.test_id &&
            l.run_date === point.isoDate
          ) {
            const copy = { ...l };
            delete copy.rerun_val;
            delete copy.rerun_level;
            return copy;
          }
          return l;
        })
      );
    }

    await rpcCall(
      apiUrl,
      "admin_void_point",
      {
        test_id: activeTest.test_id,
        date: point.isoDate,
        val: deleteAllLevelsSameDay ? null : point.val,
        is_rerun: Boolean(point.is_rerun),
        level: deleteAllLevelsSameDay ? null : levelKey,
      },
      authToken
    );

    setIsUpdatingPoint(false);
    setSelectedPointModal(null);
  };

  // Xây dựng dữ liệu Bảng số liệu hàng ngày (Phần II)
  const dailyCombinedRows = useMemo(() => {
    if (!activeTest) return [];
    const filterOpts = {
      fromDate,
      toDate,
      hideResolvedFails: hideFailsInPrint,
    };
    const l1Pts = filterHistorySeries(activeTest.history_L1, filterOpts);
    const l2Pts =
      activeTest.levels_count >= 2
        ? filterHistorySeries(activeTest.history_L2, filterOpts)
        : [];
    const l3Pts =
      activeTest.levels_count === 3
        ? filterHistorySeries(activeTest.history_L3, filterOpts)
        : [];

    // Map ngày khui/pha lọ từ BM.16 để điền gợi ý mặc định vào cột Ghi chú
    const prepMap = new Map<string, ReagentLotBM16>();
    (reagents || []).forEach((r) => {
      if (
        r.machine_name === activeTest.machine_name &&
        r.control_name === activeTest.control_name &&
        r.prep_date
      ) {
        prepMap.set(r.prep_date, r);
      }
    });

    const rowMap = new Map<string, any>();
    const ensureRow = (pt: HistoryPoint) => {
      const key = `${pt.isoDate}__${pt.is_rerun ? "R" : "M"}`;
      let row = rowMap.get(key);
      if (!row) {
        const vial = !pt.is_rerun ? prepMap.get(pt.isoDate) : undefined;
        const autoNoteParts: string[] = [];
        if (pt.is_rerun) autoNoteParts.push("*KT lại");
        if (vial) {
          autoNoteParts.push(vial.is_manual_prep ? "Pha lọ" : "Khui lọ");
        }
        row = {
          dateLabel:
            (pt.date || formatShortDM(pt.isoDate)) + (pt.is_rerun ? "*" : ""),
          isoDate: pt.isoDate,
          isRerun: Boolean(pt.is_rerun),
          hasAudit: false,
          operator: pt.operator || "KTV",
          valL1: "",
          valL2: "",
          valL3: "",
          autoNote: autoNoteParts.join("; "),
        };
        rowMap.set(key, row);
      }
      if (Array.isArray(pt.edit_log) && pt.edit_log.length > 0)
        row.hasAudit = true;
      return row;
    };

    l1Pts.forEach((pt) => {
      const r = ensureRow(pt);
      r.valL1 = String(pt.val);
      r.st1 = pt.status;
      r.ptL1 = pt;
    });
    l2Pts.forEach((pt) => {
      const r = ensureRow(pt);
      r.valL2 = String(pt.val);
      r.st2 = pt.status;
      r.ptL2 = pt;
    });
    l3Pts.forEach((pt) => {
      const r = ensureRow(pt);
      r.valL3 = String(pt.val);
      r.st3 = pt.status;
      r.ptL3 = pt;
    });

    return Array.from(rowMap.values()).sort((a, b) => {
      if (a.isoDate !== b.isoDate) return a.isoDate < b.isoDate ? -1 : 1;
      return (a.isRerun ? 1 : 0) - (b.isRerun ? 1 : 0);
    });
  }, [activeTest, fromDate, toDate, hideFailsInPrint, reagents]);

  const mergedMonthLogs = useMemo(() => {
    const map = new Map<string, BM09LogEntry>();
    [...archivedBm09, ...bm09Logs].forEach((l) => {
      if (
        (selSection === "Tất cả" || l.section === selSection) &&
        (selMachine === "Tất cả máy" || l.machine_name === selMachine) &&
        String(l.run_date || "").startsWith(reportMonth)
      ) {
        map.set(`${l.run_id}__${l.test_id}`, l);
      }
    });
    return Array.from(map.values()).sort((a, b) =>
      a.run_date < b.run_date ? 1 : -1
    );
  }, [archivedBm09, bm09Logs, selSection, selMachine, reportMonth]);

  // Render nửa bảng số liệu hàng ngày (1..16 và 17..32):
  // Đảm bảo cả 32 dòng dùng chung cellPad để chữ STT 10..31 đều tăm tắp, thêm cột Ghi chú
  const renderHalfDailyTable = (
    startIndex: number,
    endIndex: number,
    lvCount: 1 | 2 | 3
  ) => {
    const slotsCount = endIndex - startIndex + 1;
    const cellPad =
      lvCount === 3
        ? "py-[1.5px] px-0.5 text-[8.5px] leading-tight"
        : "py-[2px] px-1 text-[9px] leading-tight";
    const resultColor = (st?: "PASS" | "WARN" | "FAIL") =>
      st === "FAIL"
        ? "text-rose-600 font-black"
        : st === "WARN"
        ? "text-amber-600 font-bold"
        : "text-slate-900 font-bold";

    return (
      <table className="w-full border-collapse border border-slate-400 font-mono">
        <thead>
          <tr className="bg-slate-800 text-white text-[8.5px] uppercase font-sans">
            <th
              rowSpan={2}
              className="border border-slate-600 py-1 px-0.5 text-center w-5"
            >
              STT
            </th>
            <th
              rowSpan={2}
              className="border border-slate-600 py-1 px-0.5 text-center w-9"
            >
              Ngày
            </th>
            <th
              colSpan={lvCount}
              className="border border-slate-600 py-0.5 px-1 text-center bg-sky-900"
            >
              Kết quả đo
            </th>
            <th
              rowSpan={2}
              className="border border-slate-600 py-1 px-0.5 text-center bg-slate-800 w-12"
            >
              Người TH
            </th>
            <th
              rowSpan={2}
              className="border border-slate-600 py-1 px-1 text-left bg-slate-800 w-16"
            >
              Ghi chú
            </th>
          </tr>
          <tr className="bg-slate-700 text-white text-[8px] uppercase font-sans">
            <th className="border border-slate-600 py-0.5 px-0.5 text-right text-sky-200 w-10">
              Mức 1
            </th>
            {lvCount >= 2 && (
              <th className="border border-slate-600 py-0.5 px-0.5 text-right text-purple-200 w-10">
                Mức 2
              </th>
            )}
            {lvCount === 3 && (
              <th className="border border-slate-600 py-0.5 px-0.5 text-right text-amber-200 w-10">
                Mức 3
              </th>
            )}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: slotsCount }).map((_, idx) => {
            const stt = startIndex + idx;
            const rowData = dailyCombinedRows[stt - 1];
            const noteKey =
              rowData && activeTest
                ? makeDailyNoteKey(
                    activeTest.test_id,
                    rowData.isoDate,
                    rowData.isRerun
                  )
                : "";
            const savedNote = noteKey ? dailyNotesMap[noteKey] : undefined;
            const displayNote =
              savedNote !== undefined ? savedNote : rowData?.autoNote || "";

            return (
              <tr
                key={stt}
                className={stt % 2 === 0 ? "bg-slate-50/60" : "bg-white"}
              >
                <td
                  className={`border border-slate-300 text-center text-slate-500 font-bold ${cellPad}`}
                >
                  {stt <= 31 ? stt : ""}
                </td>
                <td
                  onClick={() => {
                    if (!rowData) return;
                    const targetPt =
                      rowData.ptL1 || rowData.ptL2 || rowData.ptL3;
                    const targetLv = rowData.ptL1
                      ? "L1"
                      : rowData.ptL2
                      ? "L2"
                      : "L3";
                    if (targetPt) {
                      handleSelectPointOnChart(
                        targetLv,
                        `Mức ${targetLv.slice(1)}`,
                        targetPt
                      );
                    }
                  }}
                  className={`border border-slate-300 text-center font-bold text-slate-800 whitespace-nowrap ${
                    rowData ? "cursor-pointer hover:bg-indigo-50" : ""
                  } ${cellPad}`}
                  title={
                    rowData ? "Nhấp để sửa hoặc xóa điểm của ngày này" : ""
                  }
                >
                  {rowData ? (
                    <>
                      {rowData.dateLabel}
                      {rowData.hasAudit && (
                        <span className="text-indigo-700 ml-0.5 text-[7px]">
                          ✎
                        </span>
                      )}
                    </>
                  ) : (
                    "\u00A0"
                  )}
                </td>
                <td
                  onClick={() => {
                    if (rowData?.ptL1)
                      handleSelectPointOnChart("L1", "Mức 1", rowData.ptL1);
                  }}
                  className={`border border-slate-300 text-right ${
                    rowData?.ptL1 ? "cursor-pointer" : ""
                  } ${resultColor(rowData?.st1)} ${cellPad}`}
                >
                  {rowData?.valL1 || ""}
                </td>
                {lvCount >= 2 && (
                  <td
                    onClick={() => {
                      if (rowData?.ptL2)
                        handleSelectPointOnChart("L2", "Mức 2", rowData.ptL2);
                    }}
                    className={`border border-slate-300 text-right ${
                      rowData?.ptL2 ? "cursor-pointer" : ""
                    } ${resultColor(rowData?.st2)} ${cellPad}`}
                  >
                    {rowData?.valL2 || ""}
                  </td>
                )}
                {lvCount === 3 && (
                  <td
                    onClick={() => {
                      if (rowData?.ptL3)
                        handleSelectPointOnChart("L3", "Mức 3", rowData.ptL3);
                    }}
                    className={`border border-slate-300 text-right ${
                      rowData?.ptL3 ? "cursor-pointer" : ""
                    } ${resultColor(rowData?.st3)} ${cellPad}`}
                  >
                    {rowData?.valL3 || ""}
                  </td>
                )}
                <td
                  className={`border border-slate-300 text-center font-sans font-semibold text-slate-700 whitespace-nowrap ${cellPad}`}
                  title={rowData?.operator}
                >
                  {getShortName(rowData?.operator || "")}
                </td>
                <td className={`border border-slate-300 font-sans ${cellPad}`}>
                  {rowData && activeTest ? (
                    <input
                      type="text"
                      value={displayNote}
                      onChange={(e) =>
                        handleUpdateDailyNote(
                          activeTest.test_id,
                          rowData.isoDate,
                          rowData.isRerun,
                          e.target.value
                        )
                      }
                      placeholder="..."
                      className="no-print-placeholder w-full bg-transparent text-[8px] leading-none font-medium text-slate-800 outline-none border-0 p-0 m-0 block h-[11px] focus:bg-amber-50/80"
                    />
                  ) : (
                    ""
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    );
  };
  // ================= KẾT THÚC PHẦN 1/2 (DÁN TIẾP PHẦN 2/2 NGAY DƯỚI DÒNG NÀY) =================
  // ================= BẮT ĐẦU PHẦN 2/2 (DÁN NỐI TIẾP NGAY DƯỚI PHẦN 1/2) =================
  return (
    <div className="space-y-4">
      <style>{`
        @media print {
          @page { size: ${
            subTab === "BM01_RANGE" ? "A4 portrait" : "A4 landscape"
          }; margin: 5mm 6mm; }
          html, body { background: #ffffff !important; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; margin: 0 !important; padding: 0 !important; }
          .no-print { display: none !important; }
          .print-flex-container { display: flex !important; flex-direction: row !important; width: 100% !important; align-items: flex-start !important; page-break-inside: avoid !important; }
          .print-col-left { width: 32% !important; padding-right: 6px !important; box-sizing: border-box !important; }
          .print-col-right { width: 68% !important; padding-left: 6px !important; box-sizing: border-box !important; }
          .a4-print-sheet { border: none !important; box-shadow: none !important; padding: 0 !important; margin: 0 !important; width: 100% !important; max-width: none !important; page-break-inside: avoid !important; }
          .lj-print-chart-wrap svg { max-height: 202px !important; }
          .auto-page-table { width: 100%; border-collapse: collapse; }
          .auto-page-table thead { display: table-header-group; }
          .auto-page-table tfoot { display: table-footer-group; }
          .auto-page-table tr { page-break-inside: avoid; break-inside: avoid; }
          .print-page-chunk { page-break-after: always; break-after: page; page-break-inside: avoid; break-inside: avoid; }
          .print-page-chunk:last-child { page-break-after: auto; break-after: auto; }
        }
      `}</style>

      <div className="no-print bg-white border border-slate-200 rounded-2xl p-4 shadow-sm space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2.5">
          <div className="flex flex-wrap items-center gap-2">
            {[
              { id: "LJ_PRINT", label: "1. In Màu L-J (1 Trang A4 Ngang)" },
              { id: "BM01_RANGE", label: "2. Phiếu ĐKBĐĐ Đa Mức (BM.01)" },
              { id: "BM09_LOG", label: "3. Sổ Nội Kiểm Hàng Ngày (BM.09)" },
              {
                id: "BM16_REAGENT",
                label: "4. Sổ Hóa Chất Tự Pha Chế (BM.16)",
              },
            ].map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setSubTab(t.id as ReportSubTab)}
                className={`px-3.5 py-2 rounded-xl text-xs font-black transition ${
                  subTab === t.id
                    ? "bg-emerald-600 text-white shadow-sm"
                    : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => window.print()}
            className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-black text-xs shadow-md flex items-center gap-1.5 transition"
          >
            <span>🖨️ IN BIỂU MẪU (EPSON L1110)</span>
          </button>
        </div>

        <div className="pt-2 border-t border-slate-100 flex flex-wrap items-center gap-2.5 text-xs">
          <div className="flex items-center gap-1.5">
            <span className="font-bold text-slate-600">Lab:</span>
            <select
              value={selSection}
              onChange={(e) => {
                const sec = e.target.value;
                setSelSection(sec);
                setSelMachine("Tất cả máy");
                const firstT = configs.find(
                  (c) => sec === "Tất cả" || c.section === sec
                );
                if (firstT) setSelTestId(firstT.test_id);
              }}
              className="bg-slate-50 border border-slate-300 rounded-xl px-2.5 py-1.5 font-bold text-slate-900"
            >
              <option value="Tất cả">Tất cả Lab</option>
              {allSections.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="font-bold text-slate-600">Máy:</span>
            <select
              value={selMachine}
              onChange={(e) => {
                const mac = e.target.value;
                setSelMachine(mac);
                const firstT = configs.find(
                  (c) =>
                    (selSection === "Tất cả" || c.section === selSection) &&
                    (mac === "Tất cả máy" || c.machine_name === mac)
                );
                if (firstT) setSelTestId(firstT.test_id);
              }}
              className="bg-slate-50 border border-slate-300 rounded-xl px-2.5 py-1.5 font-bold text-slate-900"
            >
              <option value="Tất cả máy">Tất cả máy</option>
              {machinesInSection.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </div>

          {(subTab === "LJ_PRINT" || subTab === "BM01_RANGE") && activeTest && (
            <>
              <div className="flex items-center gap-1.5">
                <span className="font-bold text-slate-600">Xét nghiệm:</span>
                <select
                  value={activeTest.test_id}
                  onChange={(e) => setSelTestId(e.target.value)}
                  className="bg-slate-50 border border-slate-300 rounded-xl px-3 py-1.5 font-black text-slate-900"
                >
                  {filteredTests
                    .filter((t) => t.test_type !== "QUALITATIVE")
                    .map((t) => (
                      <option key={t.test_id} value={t.test_id}>
                        {t.test_name} ({t.machine_name})
                      </option>
                    ))}
                </select>
              </div>

              {subTab === "LJ_PRINT" && (
                <>
                  <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200 font-extrabold">
                    <button
                      type="button"
                      onClick={() => setLevelViewMode("L1")}
                      className={`px-2.5 py-1 rounded-lg transition ${
                        levelViewMode === "L1"
                          ? "bg-sky-600 text-white shadow-xs"
                          : "text-slate-600 hover:text-slate-900"
                      }`}
                    >
                      Xem L1
                    </button>
                    {activeTest.levels_count >= 2 && (
                      <button
                        type="button"
                        onClick={() => setLevelViewMode("L2")}
                        className={`px-2.5 py-1 rounded-lg transition ${
                          levelViewMode === "L2"
                            ? "bg-purple-600 text-white shadow-xs"
                            : "text-slate-600 hover:text-slate-900"
                        }`}
                      >
                        Xem L2
                      </button>
                    )}
                    {activeTest.levels_count === 3 && (
                      <button
                        type="button"
                        onClick={() => setLevelViewMode("L3")}
                        className={`px-2.5 py-1 rounded-lg transition ${
                          levelViewMode === "L3"
                            ? "bg-amber-600 text-white shadow-xs"
                            : "text-slate-600 hover:text-slate-900"
                        }`}
                      >
                        Xem L3
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setLevelViewMode("COMBINED")}
                      className={`px-2.5 py-1 rounded-lg transition ${
                        levelViewMode === "COMBINED"
                          ? "bg-emerald-600 text-white shadow-xs"
                          : "text-slate-600 hover:text-slate-900"
                      }`}
                    >
                      Xem Phối Hợp
                    </button>
                  </div>
                  <label className="inline-flex items-center gap-1.5 bg-emerald-50 border border-emerald-300 text-emerald-900 px-2.5 py-1.5 rounded-xl font-extrabold cursor-pointer">
                    <input
                      type="checkbox"
                      checked={hideFailsInPrint}
                      onChange={(e) => setHideFailsInPrint(e.target.checked)}
                      className="accent-emerald-600 w-3.5 h-3.5"
                    />
                    <span>Ẩn điểm Vi phạm (Chỉ in điểm Đạt & đã KT lại)</span>
                  </label>
                  <div className="flex items-center gap-1.5">
                    <span className="font-bold text-slate-600">Từ:</span>
                    <input
                      type="date"
                      value={fromDate}
                      onChange={(e) => setFromDate(e.target.value)}
                      className="bg-slate-50 border border-slate-300 rounded-xl px-2.5 py-1 font-mono font-bold"
                    />
                    <span className="font-bold text-slate-600">Đến:</span>
                    <input
                      type="date"
                      value={toDate}
                      onChange={(e) => setToDate(e.target.value)}
                      className="bg-slate-50 border border-slate-300 rounded-xl px-2.5 py-1 font-mono font-bold"
                    />
                  </div>
                </>
              )}
            </>
          )}

          {subTab === "BM09_LOG" && (
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1.5">
                <span className="font-bold text-slate-600">Tháng báo cáo:</span>
                <input
                  type="month"
                  value={reportMonth}
                  onChange={(e) => setReportMonth(e.target.value)}
                  className="bg-slate-50 border border-slate-300 rounded-xl px-3 py-1.5 font-mono font-bold text-blue-800"
                />
              </div>
              <label className="flex items-center gap-1.5 bg-rose-50 border border-rose-200 text-rose-900 px-3 py-1.5 rounded-xl font-black cursor-pointer">
                <input
                  type="checkbox"
                  checked={bm09OnlyWarnFail}
                  onChange={(e) => setBm09OnlyWarnFail(e.target.checked)}
                  className="accent-rose-600 rounded w-4 h-4"
                />
                <span>Chỉ in dòng Cảnh báo / Vi phạm (Lọc gọn Sổ BM.09)</span>
              </label>
            </div>
          )}

          {subTab === "BM16_REAGENT" && (
            <div className="flex items-center gap-1.5">
              <span className="font-bold text-slate-600">Tháng báo cáo:</span>
              <input
                type="month"
                value={reportMonth}
                onChange={(e) => setReportMonth(e.target.value)}
                className="bg-slate-50 border border-slate-300 rounded-xl px-3 py-1.5 font-mono font-bold text-blue-800"
              />
            </div>
          )}
        </div>
      </div>

      {/* ===================================================================== */}
      {/* 1. BẢN IN MÀU BIỂU ĐỒ L-J EPSON L1110 (VỪA KHÍT 1 TRANG A4 NGANG)       */}
      {/* ===================================================================== */}
      {subTab === "LJ_PRINT" && activeTest && (
        <div
          className="a4-print-sheet bg-white text-slate-900 rounded-2xl p-4 border-2 border-indigo-200 shadow-lg"
          style={{ fontFamily: "'Times New Roman', Times, serif" }}
        >
          <div className="flex justify-between items-center border-b-[1.5px] border-indigo-900 pb-1.5 mb-1.5 bg-gradient-to-r from-sky-50 via-white to-indigo-50 px-2 py-1 rounded-t-xl">
            <div>
              <div className="text-[12.5px] font-bold uppercase text-indigo-950 tracking-wide">
                BỆNH VIỆN ĐA KHOA CÀ MAU
              </div>
              <div className="text-[12.5px] font-black uppercase text-blue-800">
                KHOA XÉT NGHIỆM — LAB {activeTest.section.toUpperCase()}
              </div>
            </div>
            <div className="text-center">
              <div className="text-[15.5px] font-black uppercase text-indigo-950 tracking-wide">
                BIỂU ĐỒ LEVEY-JENNINGS KẾT QUẢ NỘI KIỂM CHẤT LƯỢNG
              </div>
              <div className="text-[11px] font-bold text-slate-700">
                Giai đoạn theo dõi: Từ ngày <b>{formatDateVN(fromDate)}</b> đến
                ngày <b>{formatDateVN(toDate)}</b>
              </div>
            </div>
            <div className="text-right">
              {activeTest.standard_label === "ISO" && (
                <span className="rounded-full px-3 py-0.5 text-[9.5px] font-black uppercase whitespace-nowrap bg-blue-700 text-white inline-block shadow-sm">
                  ISO 15189:2022
                </span>
              )}
              <div className="text-[10.5px] font-bold text-indigo-900 mt-0.5">
                {activeTest.range_source !== "MANUFACTURER"
                  ? "Dải chuẩn: Range Phòng XN"
                  : "Dải chuẩn: Range Hãng SX"}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-4 gap-2 bg-sky-50/70 border border-sky-200 rounded-lg px-2.5 py-1 text-[11.5px] mb-1.5">
            <div>
              <span className="font-bold text-slate-600">Tên xét nghiệm: </span>
              <b className="text-indigo-950">
                {activeTest.test_name} ({activeTest.unit})
              </b>
            </div>
            <div>
              <span className="font-bold text-slate-600">
                Thiết bị phân tích:{" "}
              </span>
              <b className="text-blue-800">{activeTest.machine_name}</b>
            </div>
            <div>
              <span className="font-bold text-slate-600">
                Tên hóa chất QC:{" "}
              </span>
              <b className="text-purple-900">{activeTest.control_name}</b>
            </div>
            <div>
              <span className="font-bold text-slate-600">
                Số Lô (Lot) / HSD:{" "}
              </span>
              <b className="font-mono text-emerald-800">
                {activeTest.lot_number} ({formatDateVN(activeTest.expiry_date)})
              </b>
            </div>
          </div>

          <div className="lj-print-chart-wrap mb-1.5">
            <Luminous3DLJChart
              test={activeTest}
              showL1={levelViewMode === "COMBINED" || levelViewMode === "L1"}
              showL2={
                (levelViewMode === "COMBINED" || levelViewMode === "L2") &&
                activeTest.levels_count >= 2
              }
              showL3={
                (levelViewMode === "COMBINED" || levelViewMode === "L3") &&
                activeTest.levels_count === 3
              }
              compareOldLot={false}
              hideResolvedFails={hideFailsInPrint}
              filterMode="DATE_RANGE"
              lotFilter="ALL"
              fromDate={fromDate}
              toDate={toDate}
              compactForA4Print={true}
              reagents={reagents}
              onSelectPoint={handleSelectPointOnChart}
            />
          </div>

          <div className="print-flex-container grid grid-cols-1 lg:grid-cols-12 gap-2.5 pt-0.5">
            <div className="print-col-left col-span-12 lg:col-span-4 flex flex-col justify-between">
              <div>
                <div className="text-[10.5px] font-black uppercase text-indigo-950 mb-1">
                  I. Thống Kê Dải Chuẩn & Six Sigma
                </div>
                <table className="w-full border-collapse border border-indigo-900 text-[10.5px] text-center">
                  <thead>
                    <tr className="bg-indigo-900 text-white font-bold">
                      <th className="border border-indigo-900 py-[2px] px-1 text-left w-20">
                        Thông số
                      </th>
                      <th className="border border-indigo-900 py-[2px] px-1 bg-sky-800">
                        Mức 1 (L1)
                      </th>
                      {activeTest.levels_count >= 2 && (
                        <th className="border border-indigo-900 py-[2px] px-1 bg-purple-800">
                          Mức 2 (L2)
                        </th>
                      )}
                      {activeTest.levels_count === 3 && (
                        <th className="border border-indigo-900 py-[2px] px-1 bg-amber-700">
                          Mức 3 (L3)
                        </th>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {(() => {
                      const s1 = computeMuAndSigma(activeTest, "L1");
                      const s2 =
                        activeTest.levels_count >= 2
                          ? computeMuAndSigma(activeTest, "L2")
                          : null;
                      const s3 =
                        activeTest.levels_count === 3
                          ? computeMuAndSigma(activeTest, "L3")
                          : null;
                      return (
                        <>
                          <tr className="bg-white">
                            <td className="border border-slate-400 py-[1.5px] px-1 font-bold text-left">
                              Điểm hợp lệ (N)
                            </td>
                            <td className="border border-slate-400 py-[1.5px] font-mono font-bold">
                              {s1.validPointsCount}
                            </td>
                            {activeTest.levels_count >= 2 && (
                              <td className="border border-slate-400 py-[1.5px] font-mono font-bold">
                                {s2?.validPointsCount ?? 0}
                              </td>
                            )}
                            {activeTest.levels_count === 3 && (
                              <td className="border border-slate-400 py-[1.5px] font-mono font-bold">
                                {s3?.validPointsCount ?? 0}
                              </td>
                            )}
                          </tr>
                          <tr className="bg-sky-50/40">
                            <td className="border border-slate-400 py-[1.5px] px-1 font-bold text-left">
                              Mean áp dụng
                            </td>
                            <td className="border border-slate-400 py-[1.5px] font-mono font-bold text-blue-800">
                              {activeTest.mean_L1}
                            </td>
                            {activeTest.levels_count >= 2 && (
                              <td className="border border-slate-400 py-[1.5px] font-mono font-bold text-purple-800">
                                {activeTest.mean_L2}
                              </td>
                            )}
                            {activeTest.levels_count === 3 && (
                              <td className="border border-slate-400 py-[1.5px] font-mono font-bold text-amber-800">
                                {activeTest.mean_L3}
                              </td>
                            )}
                          </tr>
                          <tr className="bg-white">
                            <td className="border border-slate-400 py-[1.5px] px-1 font-bold text-left">
                              SD áp dụng
                            </td>
                            <td className="border border-slate-400 py-[1.5px] font-mono">
                              ±{activeTest.sd_L1}
                            </td>
                            {activeTest.levels_count >= 2 && (
                              <td className="border border-slate-400 py-[1.5px] font-mono">
                                ±{activeTest.sd_L2}
                              </td>
                            )}
                            {activeTest.levels_count === 3 && (
                              <td className="border border-slate-400 py-[1.5px] font-mono">
                                ±{activeTest.sd_L3}
                              </td>
                            )}
                          </tr>
                          <tr className="bg-sky-50/40">
                            <td className="border border-slate-400 py-[1.5px] px-1 font-bold text-left">
                              CV (%)
                            </td>
                            <td className="border border-slate-400 py-[1.5px] font-mono font-bold text-emerald-700">
                              {s1.cvPct}%
                            </td>
                            {activeTest.levels_count >= 2 && (
                              <td className="border border-slate-400 py-[1.5px] font-mono font-bold text-emerald-700">
                                {s2?.cvPct}%
                              </td>
                            )}
                            {activeTest.levels_count === 3 && (
                              <td className="border border-slate-400 py-[1.5px] font-mono font-bold text-emerald-700">
                                {s3?.cvPct}%
                              </td>
                            )}
                          </tr>
                          <tr className="bg-white">
                            <td className="border border-slate-400 py-[1.5px] px-1 font-bold text-left">
                              Bias (%)
                            </td>
                            <td className="border border-slate-400 py-[1.5px] font-mono font-bold text-indigo-700">
                              {s1.biasPct}%
                            </td>
                            {activeTest.levels_count >= 2 && (
                              <td className="border border-slate-400 py-[1.5px] font-mono font-bold text-indigo-700">
                                {s2?.biasPct}%
                              </td>
                            )}
                            {activeTest.levels_count === 3 && (
                              <td className="border border-slate-400 py-[1.5px] font-mono font-bold text-indigo-700">
                                {s3?.biasPct}%
                              </td>
                            )}
                          </tr>
                          <tr className="bg-emerald-50/60">
                            <td className="border border-slate-400 py-[1.5px] px-1 font-bold text-left">
                              Six Sigma (σ)
                            </td>
                            <td className="border border-slate-400 py-[1.5px] font-mono font-black text-emerald-900">
                              {s1.sigma !== null && s1.sigma !== undefined
                                ? `${s1.sigma.toFixed(2)}σ`
                                : "N/A"}
                            </td>
                            {activeTest.levels_count >= 2 && (
                              <td className="border border-slate-400 py-[1.5px] font-mono font-black text-emerald-900">
                                {s2?.sigma !== null && s2?.sigma !== undefined
                                  ? `${s2.sigma.toFixed(2)}σ`
                                  : "N/A"}
                              </td>
                            )}
                            {activeTest.levels_count === 3 && (
                              <td className="border border-slate-400 py-[1.5px] font-mono font-black text-emerald-900">
                                {s3?.sigma !== null && s3?.sigma !== undefined
                                  ? `${s3.sigma.toFixed(2)}σ`
                                  : "N/A"}
                              </td>
                            )}
                          </tr>
                        </>
                      );
                    })()}
                  </tbody>
                </table>
              </div>
              <div className="grid grid-cols-2 gap-2 mt-2 pt-2 border-t border-indigo-200 text-center">
                <div className="bg-slate-50/70 border border-slate-200 rounded-lg p-1.5">
                  <div className="font-bold text-[9.5px] uppercase text-indigo-950">
                    QUẢN LÝ CHUYÊN MÔN
                  </div>
                  <div className="italic text-[8.5px] text-slate-500 mb-7">
                    (Ký và ghi rõ họ tên)
                  </div>
                  <div className="text-[10px] font-bold text-slate-800 h-3" />
                </div>
                <div className="bg-slate-50/70 border border-slate-200 rounded-lg p-1.5">
                  <div className="font-bold text-[9.5px] uppercase text-indigo-950">
                    NGƯỜI LẬP BIỂU ĐỒ
                  </div>
                  <div className="italic text-[8.5px] text-slate-500 mb-7">
                    (Ký và ghi rõ họ tên)
                  </div>
                  <div className="text-[10px] font-bold text-indigo-900">
                    {currentUser.name}
                  </div>
                </div>
              </div>
            </div>

            <div className="print-col-right col-span-12 lg:col-span-8">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10.5px] font-black uppercase text-indigo-950">
                  II. Bảng Số Liệu Nội Kiểm Hàng Ngày (
                  {levelViewMode === "L1"
                    ? "Mức 1 - L1"
                    : levelViewMode === "L2"
                    ? "Mức 2 - L2"
                    : levelViewMode === "L3"
                    ? "Mức 3 - L3"
                    : `Hiển thị phối hợp`}
                  )
                </span>
                <span className="text-[9.5px] font-bold text-slate-500">
                  Chia 2 cột tối ưu trên 1 trang A4 Landscape
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  {renderHalfDailyTable(1, 16, activeTest.levels_count)}
                </div>
                <div>
                  {renderHalfDailyTable(17, 32, activeTest.levels_count)}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* 2. BẢN IN PHIẾU XÁC ĐỊNH ĐỘ KHÔNG ĐẢM BẢO ĐO (BM.01.XN.QTQL.30)        */}
      {/* ===================================================================== */}
      {subTab === "BM01_RANGE" && activeTest && (
        <div
          className="print-paper bg-white text-black rounded-2xl p-8 border border-slate-300 shadow-lg max-w-3xl mx-auto"
          style={{ fontFamily: "'Times New Roman', Times, serif" }}
        >
          <div className="flex justify-between items-end border-b-[1.5px] border-black pb-1.5 mb-5 text-[14px] font-bold">
            <div>Phiếu xác định độ không đảm bảo đo</div>
            <div>BM.01.XN.QTQL.30</div>
          </div>
          <div className="space-y-1.5 text-[14px] mb-4">
            <div className="flex justify-between">
              <div>
                <b>1. Tên xét nghiệm:</b> {activeTest.test_name}
              </div>
              <div className="w-52">
                <b>Đơn vị:</b> {activeTest.unit}
              </div>
            </div>
            <div className="flex justify-between">
              <div>
                <b>2. Thiết bị:</b> {activeTest.machine_name}
              </div>
              <div className="w-52">
                <b>Seri No.:</b> {"24835"}
              </div>
            </div>
            <div>
              <b>3. Phương pháp:</b> {"Đo quang hấp thụ / Đo trở kháng"}
            </div>
          </div>
          <table className="w-full border-collapse border border-black text-[13.5px] mb-4">
            <thead>
              <tr className="font-bold text-center bg-slate-100">
                <th className="border border-black py-1.5 px-2 w-14">STT</th>
                <th className="border border-black py-1.5 px-3">Nội dung</th>
                <th className="border border-black py-1.5 px-3 w-48">
                  Kết quả
                </th>
              </tr>
            </thead>
            <tbody>
              {(activeTest.levels_count === 3
                ? (["L1", "L2", "L3"] as const)
                : activeTest.levels_count === 2
                ? (["L1", "L2"] as const)
                : (["L1"] as const)
              ).map((lvKey) => {
                const muRes = computeMuAndSigma(activeTest, lvKey);
                const curMean =
                  lvKey === "L1"
                    ? activeTest.mean_L1
                    : lvKey === "L2"
                    ? activeTest.mean_L2
                    : activeTest.mean_L3;
                const curSd =
                  lvKey === "L1"
                    ? activeTest.sd_L1
                    : lvKey === "L2"
                    ? activeTest.sd_L2
                    : activeTest.sd_L3;
                const muCfg =
                  lvKey === "L1"
                    ? activeTest.mu_L1
                    : lvKey === "L2"
                    ? activeTest.mu_L2
                    : activeTest.mu_L3;
                const isPeriodic = muCfg?.mu_mode === "PERIODIC_IQC";
                const kFactor = isPeriodic ? "k=2" : "k=1.96";
                const isAbsTea = activeTest.tea_unit === "ABSOLUTE";
                const urVal = isPeriodic
                  ? Number(muCfg?.urw_pooled || muRes.cvPct || 0).toFixed(2)
                  : Number(muCfg?.verif_cvr || muRes.cvPct || 0).toFixed(2);
                const ubVal = isPeriodic
                  ? Number(
                      Math.sqrt(
                        Math.pow(Number(muRes.biasPct || 0), 2) +
                          Math.pow(Number(muCfg?.uc_cal || 0), 2)
                      )
                    ).toFixed(2)
                  : Number(muRes.biasPct || 0).toFixed(2);
                const ucDisplay =
                  muRes.ucPct !== null
                    ? isAbsTea && muRes.ucAbs !== null
                      ? `${muRes.ucPct.toFixed(2)}% (${formatSmartDecimal(
                          muRes.ucAbs,
                          curSd
                        )} ${activeTest.unit})`
                      : `${muRes.ucPct.toFixed(2)}%`
                    : "Chưa thiết lập";
                const ueDisplay =
                  muRes.uePct !== null
                    ? isAbsTea && muRes.ueAbs !== null
                      ? `${muRes.uePct.toFixed(2)}% (${formatSmartDecimal(
                          muRes.ueAbs,
                          curSd
                        )} ${activeTest.unit})`
                      : `${muRes.uePct.toFixed(2)}%`
                    : "Chưa thiết lập";
                const limitDisplay =
                  muRes.targetLimitPct !== null
                    ? isAbsTea && muRes.targetLimitAbs !== null
                      ? `${muRes.targetLimitPct.toFixed(
                          2
                        )}% (${formatSmartDecimal(
                          muRes.targetLimitAbs,
                          curSd
                        )} ${activeTest.unit})`
                      : `${muRes.targetLimitPct.toFixed(2)}%`
                    : "Chưa có TEa";
                const evalText =
                  muRes.isPassMu === true
                    ? "Đạt"
                    : muRes.isPassMu === false
                    ? "Không đạt"
                    : "—";
                return (
                  <React.Fragment key={lvKey}>
                    <tr className="bg-slate-50 font-bold">
                      <td
                        colSpan={3}
                        className="border border-black py-1.5 px-3 text-left"
                      >
                        Mức nồng độ: {curMean} ({lvKey} ·{" "}
                        {isPeriodic
                          ? "Ước lượng định kỳ IQC, hệ số phủ k=2"
                          : "Thẩm định ban đầu, hệ số phủ k=1.96"}
                        )
                      </td>
                    </tr>
                    <tr>
                      <td className="border border-black py-1 px-2 text-center">
                        1
                      </td>
                      <td className="border border-black py-1 px-3">
                        Độ không đảm bảo đo của độ tái lặp (
                        {isPeriodic ? (
                          <>
                            u<sub>Rw</sub>
                          </>
                        ) : (
                          <>
                            u<sub>R</sub>
                          </>
                        )}
                        )
                      </td>
                      <td className="border border-black py-1 px-3 text-center">
                        {urVal}%
                      </td>
                    </tr>
                    <tr>
                      <td className="border border-black py-1 px-2 text-center">
                        2
                      </td>
                      <td className="border border-black py-1 px-3">
                        Độ không đảm bảo đo của độ chệch (u<sub>B</sub>
                        {isPeriodic && muCfg?.uc_cal ? " + uCal" : ""})
                      </td>
                      <td className="border border-black py-1 px-3 text-center">
                        {ubVal}%
                      </td>
                    </tr>
                    <tr>
                      <td className="border border-black py-1 px-2 text-center">
                        3
                      </td>
                      <td className="border border-black py-1 px-3">
                        <div>
                          Độ không đảm bảo đo tổng hợp (u<sub>c</sub>)
                        </div>
                        <div className="text-[11px] italic text-slate-600">
                          Công thức: {muRes.formulaNote}
                        </div>
                      </td>
                      <td className="border border-black py-1 px-3 text-center">
                        {ucDisplay}
                      </td>
                    </tr>
                    <tr>
                      <td className="border border-black py-1 px-2 text-center">
                        4
                      </td>
                      <td className="border border-black py-1 px-3">
                        Độ không đảm bảo đo mở rộng (U<sub>e</sub> = {kFactor} ×
                        u<sub>c</sub>), {kFactor}
                      </td>
                      <td className="border border-black py-1 px-3 text-center">
                        {ueDisplay}
                      </td>
                    </tr>
                    <tr>
                      <td className="border border-black py-1 px-2 text-center">
                        5
                      </td>
                      <td className="border border-black py-1 px-3">
                        Tiêu chuẩn (0.75TEa)
                      </td>
                      <td className="border border-black py-1 px-3 text-center">
                        {limitDisplay}
                      </td>
                    </tr>
                    <tr>
                      <td className="border border-black py-1 px-2 text-center">
                        6
                      </td>
                      <td className="border border-black py-1 px-3">
                        Đánh giá (U<sub>e</sub> &lt; 0.75TEa)
                      </td>
                      <td className="border border-black py-1 px-3 text-center font-bold">
                        {evalText}
                      </td>
                    </tr>
                    <tr>
                      <td className="border border-black py-1 px-2 text-center">
                        7
                      </td>
                      <td className="border border-black py-1 px-3">
                        Kết quả ước tính
                      </td>
                      <td className="border border-black py-1 px-3 text-center font-bold">
                        {muRes.uePct !== null
                          ? `${curMean} ± ${muRes.uePct.toFixed(2)}%`
                          : "—"}
                      </td>
                    </tr>
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
          <div className="text-[13.5px] mb-5">
            <b>Ghi chú:</b>{" "}
            <span className="w-4/5 border-b border-dotted border-black inline-block">
              &nbsp;
            </span>
          </div>
          <div className="text-right italic text-[13.5px] mb-2 pr-6">
            Cà Mau, ngày {runDate.slice(8, 10)} tháng {runDate.slice(5, 7)} năm{" "}
            {runDate.slice(0, 4)}
          </div>
          <div className="grid grid-cols-2 gap-6 text-center text-[13.5px] mb-8">
            <div>
              <div className="font-bold">Người phê duyệt</div>
              <div className="italic text-[12.5px] mb-14">
                (Ký, ghi rõ họ tên)
              </div>
              <div className="font-bold text-indigo-950">
                CKI.XN. Lê Hữu Thịnh
              </div>
            </div>
            <div>
              <div className="font-bold">Người lập</div>
              <div className="italic text-[12.5px] mb-14">
                (Ký, ghi rõ họ tên)
              </div>
              <div className="font-bold text-indigo-950">
                {currentUser.name}
              </div>
            </div>
          </div>
          <div className="flex justify-between items-center border-t-[1.5px] border-black pt-2 text-[12.5px] italic">
            <div>Ngày ban hành: 21/09/2026</div>
            <div>Lần ban hành: 04</div>
            <div>Trang 1</div>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* 3. BẢN IN BM.09 (PHÂN TRANG THEO CHIỀU CAO DÒNG THỰC TẾ — VỪA KHÍT A4)  */}
      {/* ===================================================================== */}
      {subTab === "BM09_LOG" && (
        <div
          className="print-paper bg-white text-black rounded-2xl p-6 border border-slate-300 shadow-lg space-y-6 print:space-y-0"
          style={{ fontFamily: "'Times New Roman', Times, serif" }}
        >
          {(() => {
            const filteredLogs = mergedMonthLogs.filter((l) => {
              if (selMachine !== "Tất cả máy" && l.machine_name !== selMachine)
                return false;
              if (
                bm09OnlyWarnFail &&
                l.status === "PASS" &&
                !l.cause &&
                (!l.edit_log || l.edit_log.length === 0)
              )
                return false;
              return true;
            });

            const showMachineSubLine = selMachine === "Tất cả máy";
            const pageChunks = paginateBm09LogsByVisualHeight(
              filteredLogs,
              showMachineSubLine,
              11.5
            );
            const totalPages = pageChunks.length;

            return pageChunks.map((chunk, pageIdx) => {
              return (
                <div key={`bm09-page-${pageIdx}`} className="print-page-chunk">
                  <table className="auto-page-table text-[11.5px] w-full">
                    <thead>
                      <tr>
                        <td colSpan={10} className="border-none pb-2.5">
                          <div className="flex justify-between items-end border-b-[1.5px] border-black pb-1 mb-2.5 text-[13.5px] font-bold">
                            <div>Phiếu theo dõi kết quả nội kiểm hàng ngày</div>
                            <div>BM.09.XN.QTQL.31</div>
                          </div>
                          <div className="text-center space-y-0.5">
                            <div className="text-[16px] font-black uppercase">
                              PHIẾU THEO DÕI KẾT QUẢ NỘI KIỂM HÀNG NGÀY
                            </div>
                            <div className="text-[13.5px] font-bold">
                              Thiết bị:{" "}
                              <span className="underline decoration-dotted px-2">
                                {selMachine === "Tất cả máy"
                                  ? "Tất cả thiết bị"
                                  : selMachine}
                              </span>
                              &nbsp;&nbsp;|&nbsp;&nbsp; Tháng:{" "}
                              <span className="underline decoration-dotted px-2">
                                {reportMonth.slice(5, 7)}
                              </span>{" "}
                              Năm:{" "}
                              <span className="underline decoration-dotted px-2">
                                {reportMonth.slice(0, 4)}
                              </span>
                            </div>
                          </div>
                        </td>
                      </tr>
                      <tr className="text-center font-bold bg-slate-100">
                        <th className="border border-black py-1.5 px-1 w-14">
                          Ngày
                          <br />
                          thực hiện
                        </th>
                        <th className="border border-black py-1.5 px-1 w-10">
                          Giờ
                          <br />
                          TH
                        </th>
                        <th className="border border-black py-1.5 px-1 w-28">
                          Xét nghiệm
                        </th>
                        <th className="border border-black py-1.5 px-1 w-12">
                          Đánh
                          <br />
                          giá
                        </th>
                        <th className="border border-black py-1.5 px-1 w-28">
                          Quy tắc
                          <br />
                          vi phạm
                        </th>
                        <th className="border border-black py-1.5 px-1">
                          Nguyên nhân
                        </th>
                        <th className="border border-black py-1.5 px-1">
                          Hành động khắc phục
                        </th>
                        <th className="border border-black py-1.5 px-1 w-28">
                          Kết quả
                          <br />
                          kiểm tra lại
                        </th>
                        <th className="border border-black py-1.5 px-1 w-20">
                          Người
                          <br />
                          thực hiện
                        </th>
                        <th className="border border-black py-1.5 px-1 w-20">
                          Người
                          <br />
                          kiểm tra
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {chunk.items.map((l, rowIdx) => {
                        const rulesCombined = [l.rules_single, l.rules_cross]
                          .filter(Boolean)
                          .join(", ");
                        return (
                          <tr
                            key={`${l.run_id}-${l.test_id}-${pageIdx}-${rowIdx}`}
                            className="text-center h-7 page-break-inside-avoid leading-tight"
                          >
                            <td className="border border-black py-1 px-1">
                              {formatShortDM(l.run_date)}
                            </td>
                            <td className="border border-black py-1 px-1">
                              {l.run_time}
                            </td>
                            <td className="border border-black py-1 px-1 font-bold">
                              <div>{l.test_name}</div>
                              {showMachineSubLine && (
                                <div className="text-[9.5px] font-normal text-slate-600">
                                  ({l.machine_name})
                                </div>
                              )}
                            </td>
                            <td
                              className={`border border-black py-1 px-1 font-bold ${
                                l.status === "FAIL"
                                  ? "text-rose-700"
                                  : l.status === "WARN"
                                  ? "text-amber-700"
                                  : "text-emerald-800"
                              }`}
                            >
                              {l.status === "FAIL" ? "KĐ" : "Đạt"}
                            </td>
                            <td className="border border-black py-1 px-1 text-rose-700 font-semibold text-[10.5px]">
                              {rulesCombined}
                            </td>
                            <td className="border border-black py-1 px-1.5 text-left text-[11px]">
                              {l.cause}
                            </td>
                            <td className="border border-black py-1 px-1.5 text-left text-[11px]">
                              {l.action_taken}
                            </td>
                            <td className="border border-black py-1 px-1 font-semibold text-left text-[10.5px]">
                              {l.post_fix_result}
                              {l.edit_log && l.edit_log.length > 0 && (
                                <div className="text-[8.5px] text-indigo-700 mt-0.5 font-sans font-bold leading-tight">
                                  {l.edit_log.map((el, ei) => (
                                    <div key={ei}>
                                      ✎ Sửa KQ L-J ({getShortName(el.edited_by)}
                                      )
                                    </div>
                                  ))}
                                </div>
                              )}
                            </td>
                            <td className="border border-black py-1 px-1">
                              {getShortName(l.operator_name)}
                            </td>
                            <td className="border border-black py-1 px-1">
                              {l.checker_name ? (
                                <span className="font-bold text-indigo-900">
                                  {getShortName(l.checker_name)}
                                </span>
                              ) : hasPermission(
                                  currentUser,
                                  "SIGN_BM09_CHECKER"
                                ) ? (
                                <button
                                  type="button"
                                  onClick={async () => {
                                    setBm09Logs((prev) =>
                                      prev.map((item) =>
                                        item.run_id === l.run_id &&
                                        item.test_id === l.test_id
                                          ? {
                                              ...item,
                                              checker_name: currentUser.name,
                                              resolved: true,
                                            }
                                          : item
                                      )
                                    );
                                    await rpcCall(
                                      apiUrl,
                                      "update_corrective_action",
                                      {
                                        run_id: l.run_id,
                                        test_id: l.test_id,
                                        checker_name: currentUser.name,
                                      },
                                      authToken
                                    );
                                  }}
                                  className="no-print px-2 py-0.5 rounded bg-blue-600 hover:bg-blue-700 text-white text-[10px] font-bold shadow-sm"
                                >
                                  Ký duyệt
                                </button>
                              ) : (
                                ""
                              )}
                            </td>
                          </tr>
                        );
                      })}

                      {Array.from({ length: chunk.fillerCount }, (__, fIdx) => (
                        <tr
                          key={`empty-bm09-${pageIdx}-${fIdx}`}
                          className="h-7 page-break-inside-avoid"
                        >
                          <td className="border border-black" />
                          <td className="border border-black" />
                          <td className="border border-black" />
                          <td className="border border-black" />
                          <td className="border border-black" />
                          <td className="border border-black" />
                          <td className="border border-black" />
                          <td className="border border-black" />
                          <td className="border border-black" />
                          <td className="border border-black" />
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr>
                        <td colSpan={10} className="border-none pt-3">
                          <div className="flex justify-between items-center border-t-[1.5px] border-black pt-1.5 text-[12px] italic">
                            <div>Ngày ban hành: 01/04/2026</div>
                            <div>Lần ban hành: 02</div>
                            <div>
                              Trang {pageIdx + 1} / {totalPages}
                            </div>
                          </div>
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              );
            });
          })()}
        </div>
      )}

      {/* ===================================================================== */}
      {/* 4. BẢN IN BM.16 (CHỈ IN HÓA CHẤT TỰ PHA CHẾ & NHẢY SỐ TRANG CHUẨN)      */}
      {/* ===================================================================== */}
      {subTab === "BM16_REAGENT" && (
        <div
          className="print-paper bg-white text-black rounded-2xl p-5 border border-slate-300 shadow-lg space-y-6 print:space-y-0"
          style={{ fontFamily: "'Times New Roman', Times, serif" }}
        >
          {(() => {
            const filteredReagents = (reagents || []).filter((r) => {
              if (!r.is_manual_prep) return false;
              if (selSection !== "Tất cả" && r.section_name !== selSection)
                return false;
              if (selMachine !== "Tất cả máy" && r.machine_name !== selMachine)
                return false;
              if (reportMonth) {
                const prepInMonth = String(r.prep_date || "").startsWith(
                  reportMonth
                );
                const usedInMonth = Object.keys(r.used_days_map || {}).some(
                  (k) =>
                    k.startsWith(reportMonth) &&
                    Number(r.used_days_map?.[k] || 0) > 0
                );
                if (!prepInMonth && !usedInMonth) return false;
              }
              return true;
            });

            const rowsPerPage = 16;
            const totalPages = Math.max(
              1,
              Math.ceil(filteredReagents.length / rowsPerPage)
            );

            return Array.from({ length: totalPages }, (_, pageIdx) => {
              const pageSlice = filteredReagents.slice(
                pageIdx * rowsPerPage,
                (pageIdx + 1) * rowsPerPage
              );

              return (
                <div key={`bm16-page-${pageIdx}`} className="print-page-chunk">
                  <table className="auto-page-table w-full text-[10px]">
                    <thead>
                      <tr>
                        <td colSpan={40} className="border-none pb-2">
                          <div className="flex justify-between items-end border-b-[1.5px] border-black pb-1 mb-2 text-[12.5px] font-bold">
                            <div>
                              Phiếu theo dõi hóa chất, sinh phẩm/ môi trường tự
                              pha chế
                            </div>
                            <div>BM.16.XN.QTQL.23</div>
                          </div>
                          <div className="text-center text-[15px] font-black uppercase mb-1">
                            PHIẾU THEO DÕI HÓA CHẤT, SINH PHẨM/ MÔI TRƯỜNG TỰ
                            PHA CHẾ
                          </div>
                          <div className="flex flex-wrap items-center justify-between text-[12.5px] font-bold mb-1 px-1">
                            <div>
                              Lab chuyên môn:{" "}
                              <span className="underline decoration-dotted px-2">
                                {selSection === "Tất cả"
                                  ? "Tất cả Lab chuyên môn"
                                  : selSection}
                              </span>
                            </div>
                            <div>
                              Tháng:{" "}
                              <span className="underline decoration-dotted px-1">
                                {reportMonth.slice(5, 7)}
                              </span>{" "}
                              / Năm:{" "}
                              <span className="underline decoration-dotted px-1">
                                {reportMonth.slice(0, 4)}
                              </span>
                            </div>
                          </div>
                        </td>
                      </tr>
                      <tr className="text-center font-bold bg-slate-100">
                        <th
                          rowSpan={2}
                          className="border border-black px-1 w-5"
                        >
                          Stt
                        </th>
                        <th
                          rowSpan={2}
                          className="border border-black px-1 w-24"
                        >
                          Tên hóa chất
                        </th>
                        <th
                          rowSpan={2}
                          className="border border-black px-1 w-14"
                        >
                          Lô (Lot)
                        </th>
                        <th
                          rowSpan={2}
                          className="border border-black px-1 w-14"
                        >
                          Date
                          <br />
                          (HSD Lô)
                        </th>
                        <th
                          rowSpan={2}
                          className="border border-black px-1 w-12"
                        >
                          Ngày
                          <br />
                          pha
                        </th>
                        <th
                          rowSpan={2}
                          className="border border-black px-1 w-12"
                        >
                          Hạn
                          <br />
                          dùng
                        </th>
                        <th
                          rowSpan={2}
                          className="border border-black px-1 w-14"
                        >
                          Người
                          <br />
                          pha
                        </th>
                        <th
                          rowSpan={2}
                          className="border border-black px-1 w-10"
                        >
                          Số lượng
                          <br />
                          đã pha
                        </th>
                        <th colSpan={31} className="border border-black py-0.5">
                          Ngày sử dụng trong tháng {reportMonth.slice(5, 7)}/
                          {reportMonth.slice(0, 4)}
                        </th>
                        <th
                          rowSpan={2}
                          className="border border-black px-1 w-14"
                        >
                          Ghi chú
                        </th>
                      </tr>
                      <tr className="text-center font-bold text-[8.5px] bg-slate-50">
                        {Array.from({ length: 31 }, (__, i) => i + 1).map(
                          (d) => (
                            <th
                              key={d}
                              className="border border-black w-4 py-0.5"
                            >
                              {d}
                            </th>
                          )
                        )}
                      </tr>
                    </thead>
                    <tbody>
                      {Array.from({ length: rowsPerPage }, (__, rowIdx) => {
                        const globalIndex = pageIdx * rowsPerPage + rowIdx;
                        const r = pageSlice[rowIdx] || null;
                        return (
                          <tr
                            key={
                              r
                                ? r.control_id
                                : `empty-bm16-${pageIdx}-${rowIdx}`
                            }
                            className="text-center h-6 page-break-inside-avoid"
                          >
                            <td className="border border-black px-1 font-bold">
                              {globalIndex + 1}
                            </td>
                            <td className="border border-black px-1 text-left font-semibold">
                              {r ? r.control_name : ""}
                            </td>
                            <td className="border border-black px-1 font-mono">
                              {r ? r.lot_number : ""}
                            </td>
                            <td className="border border-black px-1">
                              {r ? formatShortDM(r.expiry_date) : ""}
                            </td>
                            <td className="border border-black px-1">
                              {r ? formatShortDM(r.prep_date) : ""}
                            </td>
                            <td className="border border-black px-1">
                              {r
                                ? formatShortDM(
                                    r.use_expiry_date || r.expiry_date
                                  )
                                : ""}
                            </td>
                            <td className="border border-black px-1">
                              {getShortName(r ? r.prep_by_name : "")}
                            </td>
                            <td className="border border-black px-1 font-bold">
                              {r ? r.quantity_prepared : ""}
                            </td>
                            {Array.from({ length: 31 }, (___, i) => i + 1).map(
                              (d) => {
                                const count = r
                                  ? getUsageCountForMonthDay(
                                      r.used_days_map,
                                      reportMonth,
                                      d
                                    )
                                  : 0;
                                const tickText =
                                  count <= 0
                                    ? ""
                                    : count <= 3
                                    ? Array(count).fill("✓").join("")
                                    : `✓×${count}`;
                                return (
                                  <td
                                    key={d}
                                    className="border border-black font-bold text-[8px] text-emerald-800 leading-none"
                                  >
                                    {tickText}
                                  </td>
                                );
                              }
                            )}
                            <td className="border border-black px-1 text-left text-[9px]">
                              {r ? r.note : ""}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot>
                      <tr>
                        <td colSpan={40} className="border-none pt-3">
                          <div className="flex justify-between items-center border-t-[1.5px] border-black pt-2 text-[12px] italic">
                            <div>Ngày ban hành: 23/06/2025</div>
                            <div>Lần ban hành: 01</div>
                            <div>
                              Trang {pageIdx + 1} / {totalPages}
                            </div>
                          </div>
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              );
            });
          })()}
        </div>
      )}

      {/* ===================================================================== */}
      {/* MODAL CHI TIẾT ĐIỂM QC, LỊCH SỬ AUDIT TRAIL & XÓA ĐỒNG BỘ BM.09       */}
      {/* ===================================================================== */}
      {selectedPointModal && activeTest && (
        <div className="no-print fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white border-2 border-indigo-200 rounded-3xl w-full max-w-lg p-6 shadow-2xl space-y-4">
            <div className="flex items-start justify-between border-b border-slate-200 pb-3">
              <div>
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase bg-indigo-600 text-white">
                  Kiểm Toán Điểm Nội Kiểm (ISO 15189 Audit Trail)
                </span>
                <h3 className="text-base font-black text-slate-900 mt-1">
                  {activeTest.test_name} — {selectedPointModal.levelLabel}
                </h3>
                <div className="text-xs text-slate-500 mt-0.5">
                  Ngày chạy:{" "}
                  <b>{formatDateVN(selectedPointModal.point.isoDate)}</b> · Lô:{" "}
                  <b>{selectedPointModal.point.lot_number}</b> · Người TH:{" "}
                  <b>{selectedPointModal.point.operator}</b>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedPointModal(null)}
                className="px-3 py-1 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs"
              >
                ✕ Đóng
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="font-black text-slate-800 block mb-1">
                  Giá trị kết quả ({activeTest.unit}):
                </label>
                <input
                  type="text"
                  inputMode="decimal"
                  value={editPointVal}
                  onChange={(e) =>
                    setEditPointVal(e.target.value.replace(/,/g, "."))
                  }
                  className="w-full bg-slate-50 border-2 border-slate-300 focus:border-indigo-600 rounded-xl px-3.5 py-2 font-mono font-black text-base text-slate-900 outline-none"
                />
              </div>

              <div>
                <label className="font-black text-slate-800 block mb-1">
                  Ghi chú cột GHI CHÚ trên Bảng L-J / Lý do hiệu chỉnh:
                </label>
                <input
                  type="text"
                  value={editPointNote}
                  onChange={(e) => setEditPointNote(e.target.value)}
                  placeholder="VD: Khui lọ mới, Bảo trì, Hiệu chỉnh số gõ nhầm..."
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2 font-semibold text-slate-900 outline-none"
                />
              </div>

              {Array.isArray(selectedPointModal.point.edit_log) &&
                selectedPointModal.point.edit_log.length > 0 && (
                  <div className="bg-indigo-50/70 border border-indigo-200 rounded-2xl p-3 space-y-1">
                    <div className="font-black text-indigo-950 text-[11px]">
                      🖋️ Lịch sử chỉnh sửa (Audit Trail):
                    </div>
                    {selectedPointModal.point.edit_log.map((el, i) => (
                      <div
                        key={i}
                        className="text-[11px] font-mono text-indigo-900"
                      >
                        • [{el.edited_at}] <b>{el.edited_by}</b>: {el.old_val} ➔{" "}
                        <b>{el.new_val}</b> ({el.note})
                      </div>
                    ))}
                  </div>
                )}

              {hasPermission(currentUser, "VOID_LJ_POINT") && (
                <div className="bg-rose-50 border border-rose-200 rounded-2xl p-3 space-y-2">
                  <label className="flex items-center gap-2 cursor-pointer font-bold text-rose-950">
                    <input
                      type="checkbox"
                      checked={deleteAllLevelsSameDay}
                      onChange={(e) =>
                        setDeleteAllLevelsSameDay(e.target.checked)
                      }
                      className="rounded accent-rose-600"
                    />
                    <span>
                      Khi bấm Xóa: Xóa đồng bộ tất cả các mức trong ngày{" "}
                      {formatShortDM(selectedPointModal.point.isoDate)} và gỡ bỏ
                      luôn Cảnh báo trên Dashboard (BM.09)
                    </span>
                  </label>
                </div>
              )}
            </div>

            <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-200">
              {hasPermission(currentUser, "VOID_LJ_POINT") ? (
                <button
                  type="button"
                  disabled={isUpdatingPoint}
                  onClick={handleVoidDeletePoint}
                  className="px-4 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-black text-xs shadow-xs disabled:opacity-50"
                >
                  🗑️ Xóa Điểm & Gỡ Cảnh Báo
                </button>
              ) : (
                <div />
              )}

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setSelectedPointModal(null)}
                  className="px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs"
                >
                  Hủy
                </button>
                <button
                  type="button"
                  disabled={isUpdatingPoint}
                  onClick={handleSavePointEdit}
                  className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-black text-xs shadow-md disabled:opacity-50"
                >
                  ✓ Lưu Hiệu Chỉnh & Ghi Chú
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
// ================= KẾT THÚC TOÀN BỘ FILE HoSoInAnISO.tsx =================
