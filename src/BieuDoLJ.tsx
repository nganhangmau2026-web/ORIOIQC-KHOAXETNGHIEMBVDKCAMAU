import React, { useMemo, useRef, useCallback } from "react";
import {
  TestConfig,
  HistoryPoint,
  ReagentLotBM16,
  STORAGE_KEYS,
  sortHistoryChronologically,
  formatDateVN,
  formatShortDM,
  formatSmartDecimal,
} from "./KieuDuLieu";

// ============================================================================
// FILE 3: src/BieuDoLJ.tsx — FULL MODULE (SERIES HELPERS & COORDINATE ENGINE)
// - Khử giật lag 60FPS: Không dùng React State khi rê chuột trên đồ thị.
// - Tách biệt trạng thái Phối hợp đa mức (COMBINED) và Đơn mức (Single-level).
// - Dịch nhẹ tọa độ X (+10px) cho điểm chạy lại (is_rerun = true, dấu *) để
//   không đè nhòe lên điểm gốc cùng ngày.
// - Vẽ vạch dọc màu xanh ngọc "Khui/Pha: DD/MM" từ Sổ BM.16 khi đổi lọ hóa chất
//   mới có CÙNG số Lot (Hỗ trợ cả các lọ độc lập từng mức L1, L2, L3).
// ✦ An intellectual product by Handsome Long ✦
// ============================================================================

export interface LJFilterOptions {
  filterMode?: "DATE_RANGE" | "BY_LOT";
  lotFilter?: string;
  fromDate?: string;
  toDate?: string;
  hideResolvedFails?: boolean;
}

export interface Luminous3DLJChartProps {
  test: TestConfig;
  showL1: boolean;
  showL2: boolean;
  showL3?: boolean;
  compareOldLot?: boolean;
  hideResolvedFails?: boolean;
  filterMode?: "DATE_RANGE" | "BY_LOT";
  lotFilter?: string;
  fromDate?: string;
  toDate?: string;
  compactForA4Print?: boolean;
  reagents?: ReagentLotBM16[];
  onSelectPoint?: (
    levelKey: "L1" | "L2" | "L3",
    levelLabel: string,
    point: HistoryPoint
  ) => void;
}

/**
 * Gộp chuỗi điểm lưu trữ (Archive > 90 ngày) và chuỗi điểm nóng (Active <= 90 ngày)
 * đồng thời khử trùng lặp theo (isoDate, lot_number, is_rerun).
 */
export function mergeArchivedAndActivePoints(
  archived?: HistoryPoint[],
  active?: HistoryPoint[]
): HistoryPoint[] {
  const archList = Array.isArray(archived) ? archived : [];
  const actList = Array.isArray(active) ? active : [];
  if (archList.length === 0) return sortHistoryChronologically(actList);
  if (actList.length === 0) return sortHistoryChronologically(archList);

  const map = new Map<string, HistoryPoint>();
  archList.forEach((pt) => {
    if (!pt || !pt.isoDate) return;
    const key = `${pt.isoDate}__${pt.lot_number || ""}__${
      pt.is_rerun ? "R" : "M"
    }`;
    map.set(key, pt);
  });
  actList.forEach((pt) => {
    if (!pt || !pt.isoDate) return;
    const key = `${pt.isoDate}__${pt.lot_number || ""}__${
      pt.is_rerun ? "R" : "M"
    }`;
    map.set(key, pt);
  });

  return sortHistoryChronologically(Array.from(map.values()));
}

/**
 * Lọc chuỗi điểm lịch sử theo Khoảng ngày, theo Số Lô (Lot), và tùy chọn ẩn điểm lỗi
 */
export function filterHistorySeries(
  series: HistoryPoint[] | undefined,
  opts: LJFilterOptions
): HistoryPoint[] {
  const sorted = sortHistoryChronologically(series);
  if (sorted.length === 0) return [];

  const {
    filterMode = "DATE_RANGE",
    lotFilter = "ALL",
    fromDate = "",
    toDate = "",
    hideResolvedFails = false,
  } = opts;

  return sorted.filter((pt) => {
    if (!pt || !pt.isoDate) return false;

    if (
      filterMode === "BY_LOT" &&
      lotFilter &&
      lotFilter !== "ALL" &&
      String(pt.lot_number || "")
        .trim()
        .toLowerCase() !== lotFilter.trim().toLowerCase()
    ) {
      return false;
    }

    if (fromDate && pt.isoDate < fromDate) return false;
    if (toDate && pt.isoDate > toDate) return false;

    if (hideResolvedFails && pt.status === "FAIL" && !pt.is_rerun) {
      return false;
    }

    return true;
  });
}

function clampZForPlot(z: number): number {
  if (isNaN(z)) return 0;
  return Math.max(-3.72, Math.min(3.72, z));
}

interface PlottedPoint {
  levelKey: "L1" | "L2" | "L3";
  levelLabel: string;
  point: HistoryPoint;
  cx: number;
  cy: number;
  clampedZ: number;
  effectiveStatus: "PASS" | "WARN" | "FAIL";
  effectiveRule: string;
  isOutlierPinned: boolean;
  hasAuditTrail: boolean;
}

interface VerticalEventMarker {
  id: string;
  x: number;
  type: "VIAL_PREP" | "LOT_CHANGE";
  label: string;
}

export default function Luminous3DLJChart({
  test,
  showL1,
  showL2,
  showL3 = false,
  compareOldLot = false,
  hideResolvedFails = false,
  filterMode = "DATE_RANGE",
  lotFilter = "ALL",
  fromDate = "",
  toDate = "",
  compactForA4Print = false,
  reagents,
  onSelectPoint,
}: Luminous3DLJChartProps) {
  // Tự động đọc danh sách hóa chất từ localStorage nếu màn hình cha không truyền prop reagents
  const effectiveReagents = useMemo<ReagentLotBM16[]>(() => {
    if (Array.isArray(reagents) && reagents.length > 0) return reagents;
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.REAGENTS);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }, [reagents]);

  // Kiểm tra chế độ xem Đơn mức hay Phối hợp đa mức
  const activeLevelCount =
    (showL1 ? 1 : 0) +
    (showL2 && test.levels_count >= 2 ? 1 : 0) +
    (showL3 && test.levels_count === 3 ? 1 : 0);
  const isSingleLevelView = activeLevelCount === 1;

  // Refs điều khiển trực tiếp DOM cho thanh Tooltip & vạch dóng (0 Re-renders)
  const hoverLineRef = useRef<SVGLineElement | null>(null);
  const tooltipIdleRef = useRef<HTMLDivElement | null>(null);
  const tooltipActiveRef = useRef<HTMLDivElement | null>(null);
  const ttBadgeRef = useRef<HTMLSpanElement | null>(null);
  const ttDateRef = useRef<HTMLSpanElement | null>(null);
  const ttValRef = useRef<HTMLSpanElement | null>(null);
  const ttRuleRef = useRef<HTMLSpanElement | null>(null);
  const ttMetaRef = useRef<HTMLSpanElement | null>(null);

  // Kích thước khung SVG (Tối ưu gọn cho in A4 Landscape khi compactForA4Print = true)
  const svgWidth = 1060;
  const svgHeight = compactForA4Print ? 204 : 326;
  const padLeft = 62;
  const padRight = 52;
  const padTop = compactForA4Print ? 18 : 28;
  const padBottom = compactForA4Print ? 24 : 38;
  const plotW = svgWidth - padLeft - padRight;
  const plotH = svgHeight - padTop - padBottom;

  const zToY = useCallback(
    (z: number): number => {
      const maxAbsZ = 3.8;
      const ratio = (maxAbsZ - z) / (maxAbsZ * 2);
      return Number((padTop + ratio * plotH).toFixed(1));
    },
    [padTop, plotH]
  );

  const chartModel = useMemo(() => {
    const filterOpts: LJFilterOptions = {
      filterMode,
      lotFilter,
      fromDate,
      toDate,
      hideResolvedFails,
    };

    const s1 = showL1 ? filterHistorySeries(test.history_L1, filterOpts) : [];
    const s2 =
      showL2 && test.levels_count >= 2
        ? filterHistorySeries(test.history_L2, filterOpts)
        : [];
    const s3 =
      showL3 && test.levels_count === 3
        ? filterHistorySeries(test.history_L3, filterOpts)
        : [];

    const dateSet = new Set<string>();
    s1.forEach((p) => dateSet.add(p.isoDate));
    s2.forEach((p) => dateSet.add(p.isoDate));
    s3.forEach((p) => dateSet.add(p.isoDate));

    const sortedDates = Array.from(dateSet).sort((a, b) =>
      a < b ? -1 : a > b ? 1 : 0
    );

    const totalCols = Math.max(sortedDates.length, 1);
    const dateToXMap = new Map<string, number>();

    sortedDates.forEach((iso, idx) => {
      const x =
        totalCols === 1
          ? padLeft + plotW / 2
          : padLeft + (idx / (totalCols - 1)) * plotW;
      dateToXMap.set(iso, Number(x.toFixed(1)));
    });

    // Dịch ngang (+10px) cho điểm chạy kiểm tra lại (*) để không đè lên điểm gốc cùng ngày
    const rerunOffsetPx = totalCols > 25 ? 7.5 : 10.0;

    const buildPlottedSeries = (
      rawSeries: HistoryPoint[],
      lvKey: "L1" | "L2" | "L3",
      lvLabel: string
    ): PlottedPoint[] => {
      return rawSeries.map((pt) => {
        const baseX = dateToXMap.get(pt.isoDate) ?? padLeft;
        const cx = pt.is_rerun
          ? Math.min(
              svgWidth - padRight + 14,
              Number((baseX + rerunOffsetPx).toFixed(1))
            )
          : baseX;
        const rawZ = Number(pt.z || 0);
        const clampedZ = clampZForPlot(rawZ);
        const cy = zToY(clampedZ);

        const effStatus: "PASS" | "WARN" | "FAIL" =
          isSingleLevelView && pt.single_level_status
            ? pt.single_level_status
            : pt.status;

        const effRule =
          isSingleLevelView && pt.single_level_rule
            ? pt.single_level_rule
            : pt.rule || "Đạt chuẩn (Trong ±2SD)";

        return {
          levelKey: lvKey,
          levelLabel: lvLabel,
          point: pt,
          cx,
          cy,
          clampedZ,
          effectiveStatus: effStatus,
          effectiveRule: effRule,
          isOutlierPinned: Math.abs(rawZ) > 3.7,
          hasAuditTrail: Array.isArray(pt.edit_log) && pt.edit_log.length > 0,
        };
      });
    };

    const plottedL1 = buildPlottedSeries(s1, "L1", "Mức 1 (L1)");
    const plottedL2 = buildPlottedSeries(s2, "L2", "Mức 2 (L2)");
    const plottedL3 = buildPlottedSeries(s3, "L3", "Mức 3 (L3)");

    const dateLotMap = new Map<string, string>();
    [...s1, ...s2, ...s3].forEach((p) => {
      if (p.isoDate && p.lot_number && !dateLotMap.has(p.isoDate)) {
        dateLotMap.set(p.isoDate, p.lot_number);
      }
    });

    const eventMarkers: VerticalEventMarker[] = [];

    // 1. Vạch cam Đổi Số Lô (Lot Change) giữa 2 ngày liên tiếp
    for (let i = 1; i < sortedDates.length; i++) {
      const prevDate = sortedDates[i - 1];
      const curDate = sortedDates[i];
      const prevLot = dateLotMap.get(prevDate);
      const curLot = dateLotMap.get(curDate);
      if (
        prevLot &&
        curLot &&
        prevLot.trim().toLowerCase() !== curLot.trim().toLowerCase()
      ) {
        const xPrev = dateToXMap.get(prevDate) ?? padLeft;
        const xCur = dateToXMap.get(curDate) ?? padLeft;
        eventMarkers.push({
          id: `LOT-${curDate}-${curLot}`,
          x: Number(((xPrev + xCur) / 2).toFixed(1)),
          type: "LOT_CHANGE",
          label: `Đổi Lô: ${curLot}`,
        });
      }
    }

    // 2. Vạch dọc xanh ngọc "Khui/Pha: DD/MM" từ Sổ BM.16 khi đổi lọ mới CÙNG số Lot
    if (effectiveReagents.length > 0 && sortedDates.length > 0) {
      const minDate = sortedDates[0];
      const maxDate = sortedDates[sortedDates.length - 1];

      const activeCtrlNames = new Set<string>();
      if (test.control_name)
        activeCtrlNames.add(test.control_name.trim().toUpperCase());
      if (showL1 && test.control_name_L1)
        activeCtrlNames.add(test.control_name_L1.trim().toUpperCase());
      if (showL2 && test.levels_count >= 2 && test.control_name_L2)
        activeCtrlNames.add(test.control_name_L2.trim().toUpperCase());
      if (showL3 && test.levels_count === 3 && test.control_name_L3)
        activeCtrlNames.add(test.control_name_L3.trim().toUpperCase());

      const matchedVials = effectiveReagents.filter(
        (r) =>
          r.machine_name === test.machine_name &&
          activeCtrlNames.has(
            String(r.control_name || "")
              .trim()
              .toUpperCase()
          ) &&
          Boolean(r.prep_date) &&
          r.prep_date >= minDate &&
          r.prep_date <= maxDate
      );

      const seenPrepDates = new Set<string>();
      matchedVials.forEach((vial) => {
        const pDate = String(vial.prep_date || "").trim();
        if (!pDate || seenPrepDates.has(pDate)) return;
        seenPrepDates.add(pDate);

        let markerX = dateToXMap.get(pDate);
        if (markerX === undefined) {
          const nextIdx = sortedDates.findIndex((d) => d > pDate);
          if (nextIdx > 0) {
            const x1 = dateToXMap.get(sortedDates[nextIdx - 1]) ?? padLeft;
            const x2 = dateToXMap.get(sortedDates[nextIdx]) ?? padLeft;
            markerX = Number(((x1 + x2) / 2).toFixed(1));
          }
        }

        if (markerX !== undefined) {
          eventMarkers.push({
            id: `VIAL-${pDate}-${vial.lot_number}`,
            x: Number((markerX - 4).toFixed(1)),
            type: "VIAL_PREP",
            label: `Khui/Pha: ${formatShortDM(pDate)}`,
          });
        }
      });
    }

    let mfgRefZ: number | null = null;
    if (
      compareOldLot &&
      test.mfg_mean_L1 > 0 &&
      test.sd_L1 > 0 &&
      test.mfg_mean_L1 !== test.mean_L1
    ) {
      const zDiff = (test.mfg_mean_L1 - test.mean_L1) / test.sd_L1;
      if (Math.abs(zDiff) <= 3.6) {
        mfgRefZ = Number(zDiff.toFixed(2));
      }
    }

    return {
      sortedDates,
      dateToXMap,
      plottedL1,
      plottedL2,
      plottedL3,
      eventMarkers,
      mfgRefZ,
      hasAnyPoints:
        plottedL1.length > 0 || plottedL2.length > 0 || plottedL3.length > 0,
    };
  }, [
    test,
    showL1,
    showL2,
    showL3,
    filterMode,
    lotFilter,
    fromDate,
    toDate,
    hideResolvedFails,
    isSingleLevelView,
    effectiveReagents,
    compareOldLot,
    padLeft,
    padRight,
    plotW,
    svgWidth,
    zToY,
  ]);

  // --- CẬP NHẬT TRỰC TIẾP DOM KHI RÊ CHUỘT VÀO ĐIỂM (0 RE-RENDER, 60FPS) ---
  const handlePointMouseEnter = useCallback(
    (item: PlottedPoint) => {
      if (hoverLineRef.current) {
        hoverLineRef.current.setAttribute("x1", String(item.cx));
        hoverLineRef.current.setAttribute("x2", String(item.cx));
        hoverLineRef.current.setAttribute("opacity", "1");
      }

      if (tooltipIdleRef.current && tooltipActiveRef.current) {
        tooltipIdleRef.current.style.display = "none";
        tooltipActiveRef.current.style.display = "flex";
      }

      if (ttBadgeRef.current) {
        ttBadgeRef.current.textContent = `${item.levelLabel}${
          item.point.is_rerun ? " · *Chạy KT lại" : ""
        }`;
        ttBadgeRef.current.className =
          item.levelKey === "L1"
            ? "px-2 py-0.5 rounded-md text-[10.5px] font-black bg-sky-600 text-white shrink-0"
            : item.levelKey === "L2"
            ? "px-2 py-0.5 rounded-md text-[10.5px] font-black bg-purple-600 text-white shrink-0"
            : "px-2 py-0.5 rounded-md text-[10.5px] font-black bg-amber-600 text-white shrink-0";
      }

      if (ttDateRef.current) {
        ttDateRef.current.textContent = `${formatDateVN(item.point.isoDate)} (${
          item.point.time || "08h00"
        }) · Lô: ${item.point.lot_number}`;
      }

      if (ttValRef.current) {
        const zSign = item.point.z >= 0 ? "+" : "";
        ttValRef.current.textContent = `KQ: ${item.point.val} ${test.unit} (${zSign}${item.point.z}SD)`;
      }

      if (ttRuleRef.current) {
        ttRuleRef.current.textContent =
          item.effectiveStatus === "FAIL"
            ? `🚨 ${item.effectiveRule}`
            : item.effectiveStatus === "WARN"
            ? `⚠️ ${item.effectiveRule}`
            : `✓ ${item.effectiveRule}`;
        ttRuleRef.current.className =
          item.effectiveStatus === "FAIL"
            ? "px-2 py-0.5 rounded-md text-[10.5px] font-black bg-rose-600 text-white shrink-0"
            : item.effectiveStatus === "WARN"
            ? "px-2 py-0.5 rounded-md text-[10.5px] font-black bg-amber-100 text-amber-900 border border-amber-300 shrink-0"
            : "px-2 py-0.5 rounded-md text-[10.5px] font-black bg-emerald-100 text-emerald-900 border border-emerald-300 shrink-0";
      }

      if (ttMetaRef.current) {
        const auditText =
          item.hasAuditTrail && item.point.edit_log
            ? ` · ✎ Đã sửa (${
                item.point.edit_log[item.point.edit_log.length - 1]?.old_val
              } ➔ ${item.point.val})`
            : "";
        ttMetaRef.current.textContent = `KTV: ${
          item.point.operator || "—"
        }${auditText} (Nhấp để sửa/xóa)`;
      }
    },
    [test.unit]
  );

  const handlePointMouseLeave = useCallback(() => {
    if (hoverLineRef.current) {
      hoverLineRef.current.setAttribute("opacity", "0");
    }
    if (tooltipIdleRef.current && tooltipActiveRef.current) {
      tooltipActiveRef.current.style.display = "none";
      tooltipIdleRef.current.style.display = "flex";
    }
  }, []);

  const sdBands = [
    {
      z: 3,
      label: "+3SD",
      stroke: "#e11d48",
      dash: "5 4",
      width: 1.5,
      textCls: "fill-rose-600 font-black",
      valL1: formatSmartDecimal(test.mean_L1 + 3 * test.sd_L1, test.sd_L1),
    },
    {
      z: 2,
      label: "+2SD",
      stroke: "#d97706",
      dash: "4 3",
      width: 1.3,
      textCls: "fill-amber-600 font-bold",
      valL1: formatSmartDecimal(test.mean_L1 + 2 * test.sd_L1, test.sd_L1),
    },
    {
      z: 1,
      label: "+1SD",
      stroke: "#10b981",
      dash: "3 3",
      width: 1.1,
      textCls: "fill-emerald-600 font-semibold",
      valL1: formatSmartDecimal(test.mean_L1 + 1 * test.sd_L1, test.sd_L1),
    },
    {
      z: 0,
      label: "MEAN",
      stroke: "#0f172a",
      dash: "",
      width: 2.0,
      textCls: "fill-slate-900 font-black",
      valL1: formatSmartDecimal(test.mean_L1, test.sd_L1),
    },
    {
      z: -1,
      label: "-1SD",
      stroke: "#10b981",
      dash: "3 3",
      width: 1.1,
      textCls: "fill-emerald-600 font-semibold",
      valL1: formatSmartDecimal(test.mean_L1 - 1 * test.sd_L1, test.sd_L1),
    },
    {
      z: -2,
      label: "-2SD",
      stroke: "#d97706",
      dash: "4 3",
      width: 1.3,
      textCls: "fill-amber-600 font-bold",
      valL1: formatSmartDecimal(test.mean_L1 - 2 * test.sd_L1, test.sd_L1),
    },
    {
      z: -3,
      label: "-3SD",
      stroke: "#e11d48",
      dash: "5 4",
      width: 1.5,
      textCls: "fill-rose-600 font-black",
      valL1: formatSmartDecimal(test.mean_L1 - 3 * test.sd_L1, test.sd_L1),
    },
  ];

  const renderLevelSeriesSVG = (
    points: PlottedPoint[],
    strokeColor: string,
    nodeFillColor: string
  ) => {
    if (points.length === 0) return null;
    const polylinePoints = points.map((p) => `${p.cx},${p.cy}`).join(" ");

    return (
      <g>
        {points.length > 1 && (
          <polyline
            fill="none"
            stroke={strokeColor}
            strokeWidth={compactForA4Print ? 1.9 : 2.5}
            strokeLinecap="round"
            strokeLinejoin="round"
            points={polylinePoints}
          />
        )}

        {points.map((item, idx) => {
          const isFail = item.effectiveStatus === "FAIL";
          const isWarn = item.effectiveStatus === "WARN";
          const isRerun = Boolean(item.point.is_rerun);

          const dotFill = isFail
            ? "#e11d48"
            : isWarn
            ? "#f59e0b"
            : isRerun
            ? "#0d9488"
            : nodeFillColor;

          const dotRadius = compactForA4Print
            ? isFail
              ? 4.4
              : 3.6
            : isFail
            ? 5.8
            : 4.8;

          return (
            <g
              key={`${item.levelKey}-${item.point.isoDate}-${
                isRerun ? "R" : "M"
              }-${idx}`}
              className="cursor-pointer"
              onMouseEnter={() => handlePointMouseEnter(item)}
              onMouseLeave={handlePointMouseLeave}
              onClick={() =>
                onSelectPoint?.(item.levelKey, item.levelLabel, item.point)
              }
            >
              {/* VÒNG HÀO QUANG TĨNH CHO ĐIỂM VI PHẠM / CẢNH BÁO */}
              {isFail && (
                <circle
                  cx={item.cx}
                  cy={item.cy}
                  r={dotRadius + 4.2}
                  fill="#f43f5e"
                  fillOpacity="0.24"
                  stroke="#e11d48"
                  strokeWidth="1.2"
                />
              )}
              {isWarn && !isFail && (
                <circle
                  cx={item.cx}
                  cy={item.cy}
                  r={dotRadius + 3.4}
                  fill="#fbbf24"
                  fillOpacity="0.22"
                />
              )}

              {/* VÒNG VIỀN ĐỨT NÉT ĐÁNH DẤU ĐIỂM CHẠY LẠI (*) */}
              {isRerun && (
                <circle
                  cx={item.cx}
                  cy={item.cy}
                  r={dotRadius + 3.0}
                  fill="none"
                  stroke="#0d9488"
                  strokeWidth="1.3"
                  strokeDasharray="2 2"
                />
              )}

              <circle
                cx={item.cx}
                cy={item.cy}
                r={dotRadius}
                fill={dotFill}
                stroke="#ffffff"
                strokeWidth="1.7"
              />

              {/* VÙNG BẮT CHUỘT RỘNG 11PX CHỐNG NHẤP NHÁY */}
              <circle
                cx={item.cx}
                cy={item.cy}
                r={11}
                fill="transparent"
                stroke="none"
              />

              {(isRerun || item.hasAuditTrail || item.isOutlierPinned) && (
                <text
                  x={item.cx}
                  y={item.cy - dotRadius - 2.5}
                  textAnchor="middle"
                  className="text-[8.5px] font-black fill-slate-900 select-none pointer-events-none"
                >
                  {isRerun ? "*" : ""}
                  {item.hasAuditTrail ? "✎" : ""}
                  {item.isOutlierPinned ? `(${item.point.z}SD)` : ""}
                </text>
              )}
            </g>
          );
        })}
      </g>
    );
  };

  return (
    <div className="space-y-1.5 select-none">
      {/* THANH THÔNG TIN ĐIỂM KHÓA CỨNG CHIỀU CAO H-11 (0 RE-RENDER, 60FPS) */}
      {!compactForA4Print && (
        <div className="no-print h-11 min-h-[44px] max-h-[44px] bg-slate-900 text-white rounded-2xl px-4 flex items-center justify-between border border-slate-700 shadow-xs overflow-hidden">
          <div
            ref={tooltipIdleRef}
            className="w-full flex items-center justify-between text-xs text-slate-300"
          >
            <div className="flex items-center gap-3 flex-wrap">
              <span className="font-black text-sky-400 uppercase text-[11px]">
                🎯 Trạng thái Đồ thị L-J (60FPS):
              </span>
              <span>
                Rê chuột lên điểm để xem thông số tức thì · Nhấp vào điểm để mở{" "}
                <b className="text-white">Audit Trail (Sửa / Xóa điểm)</b>
              </span>
            </div>
            <div className="hidden md:flex items-center gap-3 text-[11px] font-bold">
              {showL1 && (
                <span className="flex items-center gap-1 text-sky-300">
                  <span className="w-2.5 h-2.5 rounded-full bg-sky-500 inline-block" />
                  L1 ({chartModel.plottedL1.length}đ)
                </span>
              )}
              {showL2 && test.levels_count >= 2 && (
                <span className="flex items-center gap-1 text-purple-300">
                  <span className="w-2.5 h-2.5 rounded-full bg-purple-500 inline-block" />
                  L2 ({chartModel.plottedL2.length}đ)
                </span>
              )}
              {showL3 && test.levels_count === 3 && (
                <span className="flex items-center gap-1 text-amber-300">
                  <span className="w-2.5 h-2.5 rounded-full bg-amber-500 inline-block" />
                  L3 ({chartModel.plottedL3.length}đ)
                </span>
              )}
              <span className="text-teal-300">* Điểm KT lại</span>
            </div>
          </div>

          <div
            ref={tooltipActiveRef}
            style={{ display: "none" }}
            className="w-full items-center justify-between gap-2 text-xs"
          >
            <div className="flex items-center gap-2.5 truncate">
              <span ref={ttBadgeRef} />
              <span
                ref={ttDateRef}
                className="font-mono font-bold text-slate-200 whitespace-nowrap"
              />
              <span className="text-slate-600">|</span>
              <span
                ref={ttValRef}
                className="font-mono font-black text-amber-300 whitespace-nowrap"
              />
              <span ref={ttRuleRef} />
            </div>
            <span
              ref={ttMetaRef}
              className="text-[11px] font-semibold text-sky-200 whitespace-nowrap shrink-0"
            />
          </div>
        </div>
      )}

      {/* KHUNG VẼ ĐỒ THỊ SVG LEVEY-JENNINGS */}
      <div className="relative bg-white border border-slate-300 rounded-2xl overflow-hidden shadow-2xs">
        <svg
          viewBox={`0 0 ${svgWidth} ${svgHeight}`}
          className="w-full h-auto block"
        >
          <defs>
            <linearGradient id="ljSafeZone" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#10b981" stopOpacity="0.06" />
              <stop offset="50%" stopColor="#10b981" stopOpacity="0.13" />
              <stop offset="100%" stopColor="#10b981" stopOpacity="0.06" />
            </linearGradient>
            <linearGradient id="ljWarnZoneTop" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#f59e0b" stopOpacity="0.12" />
              <stop offset="100%" stopColor="#f59e0b" stopOpacity="0.04" />
            </linearGradient>
            <linearGradient id="ljWarnZoneBot" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#f59e0b" stopOpacity="0.04" />
              <stop offset="100%" stopColor="#f59e0b" stopOpacity="0.12" />
            </linearGradient>
          </defs>

          <rect
            x={padLeft}
            y={zToY(3)}
            width={plotW}
            height={zToY(2) - zToY(3)}
            fill="url(#ljWarnZoneTop)"
          />
          <rect
            x={padLeft}
            y={zToY(2)}
            width={plotW}
            height={zToY(-2) - zToY(2)}
            fill="url(#ljSafeZone)"
          />
          <rect
            x={padLeft}
            y={zToY(-2)}
            width={plotW}
            height={zToY(-3) - zToY(-2)}
            fill="url(#ljWarnZoneBot)"
          />

          <rect
            x={padLeft}
            y={padTop}
            width={plotW}
            height={plotH}
            fill="none"
            stroke="#cbd5e1"
            strokeWidth="1"
          />

          {/* LƯỚI DỌC THEO NGÀY & NHÃN TRỤC X */}
          {chartModel.sortedDates.map((iso, idx) => {
            const x = chartModel.dateToXMap.get(iso) ?? padLeft;
            const total = chartModel.sortedDates.length;
            const showLabel =
              total <= 32 || idx === 0 || idx === total - 1 || idx % 2 === 0;

            return (
              <g key={`col-${iso}`}>
                <line
                  x1={x}
                  y1={padTop}
                  x2={x}
                  y2={padTop + plotH}
                  stroke="#e2e8f0"
                  strokeWidth="0.9"
                />
                {showLabel && (
                  <text
                    x={x}
                    y={padTop + plotH + (compactForA4Print ? 12 : 16)}
                    textAnchor="middle"
                    className={`${
                      compactForA4Print ? "text-[8.5px]" : "text-[9.5px]"
                    } font-mono font-bold fill-slate-700`}
                  >
                    {formatShortDM(iso)}
                  </text>
                )}
              </g>
            );
          })}

          {/* ĐƯỜNG NGANG MEAN, ±1SD, ±2SD, ±3SD */}
          {sdBands.map((b) => {
            const y = zToY(b.z);
            return (
              <g key={b.label}>
                <line
                  x1={padLeft}
                  y1={y}
                  x2={padLeft + plotW}
                  y2={y}
                  stroke={b.stroke}
                  strokeWidth={b.width}
                  strokeDasharray={b.dash || undefined}
                />
                <text
                  x={padLeft - 7}
                  y={y + 3.5}
                  textAnchor="end"
                  className={`text-[9.5px] font-mono ${b.textCls}`}
                >
                  {b.label}
                </text>
                <text
                  x={padLeft + plotW + 6}
                  y={y + 3.5}
                  textAnchor="start"
                  className="text-[9px] font-mono font-semibold fill-slate-500"
                >
                  {b.valL1}
                </text>
              </g>
            );
          })}

          {/* ĐƯỜNG THAM CHIẾU MEAN HÃNG L1 */}
          {chartModel.mfgRefZ !== null && (
            <g>
              <line
                x1={padLeft}
                y1={zToY(chartModel.mfgRefZ)}
                x2={padLeft + plotW}
                y2={zToY(chartModel.mfgRefZ)}
                stroke="#ea580c"
                strokeWidth="1.6"
                strokeDasharray="7 4"
              />
              <rect
                x={padLeft + 8}
                y={zToY(chartModel.mfgRefZ) - 14}
                width={136}
                height={14}
                rx={4}
                fill="#fff7ed"
                stroke="#fdba74"
                strokeWidth="1"
              />
              <text
                x={padLeft + 14}
                y={zToY(chartModel.mfgRefZ) - 4}
                className="text-[9px] font-mono font-black fill-orange-800"
              >
                Mean Hãng L1: {test.mfg_mean_L1}
              </text>
            </g>
          )}

          {/* VẠCH DỌC MỐC BM.16 "KHUI/PHA: DD/MM" (XANH NGỌC) & "ĐỔI LÔ" (CAM) */}
          {chartModel.eventMarkers.map((mk, mIdx) => {
            const isVial = mk.type === "VIAL_PREP";
            const strokeColor = isVial ? "#0d9488" : "#d97706";
            const badgeBg = isVial ? "#ccfbf1" : "#fef3c7";
            const badgeBorder = isVial ? "#14b8a6" : "#f59e0b";
            const textColor = isVial ? "#115e59" : "#92400e";
            const yOffset = padTop + 3 + (mIdx % 2) * 15;

            return (
              <g key={mk.id}>
                <line
                  x1={mk.x}
                  y1={padTop}
                  x2={mk.x}
                  y2={padTop + plotH}
                  stroke={strokeColor}
                  strokeWidth="1.6"
                  strokeDasharray="4 3"
                />
                <rect
                  x={mk.x - 42}
                  y={yOffset}
                  width={84}
                  height={13}
                  rx={4}
                  fill={badgeBg}
                  stroke={badgeBorder}
                  strokeWidth="1"
                />
                <text
                  x={mk.x}
                  y={yOffset + 9.5}
                  textAnchor="middle"
                  fill={textColor}
                  className="text-[8.5px] font-black"
                >
                  {mk.label}
                </text>
              </g>
            );
          })}

          {/* VẠCH DÓNG ĐỨNG KHI RÊ CHUỘT (ĐIỀU KHIỂN QUA REF) */}
          <line
            ref={hoverLineRef}
            x1={padLeft}
            y1={padTop}
            x2={padLeft}
            y2={padTop + plotH}
            stroke="#6366f1"
            strokeWidth="1.4"
            strokeDasharray="3 3"
            opacity="0"
            className="pointer-events-none"
          />

          {/* CHUỖI ĐƯỜNG & ĐIỂM L1, L2, L3 */}
          {showL1 &&
            renderLevelSeriesSVG(chartModel.plottedL1, "#0284c7", "#0284c7")}
          {showL2 &&
            test.levels_count >= 2 &&
            renderLevelSeriesSVG(chartModel.plottedL2, "#7c3aed", "#7c3aed")}
          {showL3 &&
            test.levels_count === 3 &&
            renderLevelSeriesSVG(chartModel.plottedL3, "#d97706", "#d97706")}

          {!chartModel.hasAnyPoints && (
            <g>
              <rect
                x={padLeft + plotW / 2 - 190}
                y={padTop + plotH / 2 - 20}
                width={380}
                height={40}
                rx={10}
                fill="#f8fafc"
                stroke="#cbd5e1"
                strokeWidth="1.2"
              />
              <text
                x={padLeft + plotW / 2}
                y={padTop + plotH / 2 + 4}
                textAnchor="middle"
                className="text-xs font-bold fill-slate-500"
              >
                Chưa có điểm dữ liệu nội kiểm trong khoảng lọc hiện tại.
              </text>
            </g>
          )}
        </svg>

        {/* CHÚ GIẢI CHÂN ĐỒ THỊ (LEGEND) */}
        <div className="bg-slate-50 border-t border-slate-200 px-3 py-1 flex flex-wrap items-center justify-between gap-2 text-[9.5px] font-bold text-slate-600">
          <div className="flex flex-wrap items-center gap-3">
            {showL1 && (
              <span className="inline-flex items-center gap-1 text-sky-800">
                <span className="w-2.5 h-2.5 rounded-full bg-sky-600 inline-block" />
                Mức 1 (L1): {test.mean_L1} ± {test.sd_L1} {test.unit}
              </span>
            )}
            {showL2 && test.levels_count >= 2 && (
              <span className="inline-flex items-center gap-1 text-purple-800">
                <span className="w-2.5 h-2.5 rounded-full bg-purple-600 inline-block" />
                Mức 2 (L2): {test.mean_L2} ± {test.sd_L2} {test.unit}
              </span>
            )}
            {showL3 && test.levels_count === 3 && (
              <span className="inline-flex items-center gap-1 text-amber-800">
                <span className="w-2.5 h-2.5 rounded-full bg-amber-600 inline-block" />
                Mức 3 (L3): {test.mean_L3} ± {test.sd_L3} {test.unit}
              </span>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <span className="inline-flex items-center gap-1 text-rose-700">
              <span className="w-2.5 h-2.5 rounded-full bg-rose-600 ring-2 ring-rose-300 inline-block" />
              Vi phạm (FAIL)
            </span>
            <span className="inline-flex items-center gap-1 text-amber-700">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-500 inline-block" />
              Cảnh báo 1-2s
            </span>
            <span className="inline-flex items-center gap-1 text-teal-800">
              <span className="w-2.5 h-2.5 rounded-full bg-teal-600 inline-block" />
              * Điểm chạy lại (+10px)
            </span>
            <span className="inline-flex items-center gap-1 text-teal-900">
              <span className="w-3 border-b-2 border-dashed border-teal-600 inline-block" />
              Vạch Khui/Pha lọ (BM.16)
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
// ================= KẾT THÚC TOÀN BỘ FILE BieuDoLJ.tsx =================
