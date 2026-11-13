import React, { useState, useMemo, useCallback, useEffect } from "react";
import {
  TestConfig,
  HistoryPoint,
  UserAccount,
  LevelMuConfig,
  RangeSourceType,
  formatShortDM,
  getVnIsoDateString,
  getVnTimeString,
  roundSmartDecimal,
  formatSmartDecimal,
  computeMuAndSigma,
  computeThreeLotPooledStats,
  getRecommendedWestgardRules,
  getSuggestedCliaTea,
  rpcCall,
} from "./KieuDuLieu";

// ============================================================================
// FILE 4: src/TroLyRangeMU.tsx — FULL MODULE (CALCULATION ENGINE & UI)
// - Giao diện Pastel & Neon hiện đại, tươi sáng, độ tương phản cao, chống mỏi mắt.
// - Hỗ trợ tính toán & lọc điểm theo Số Lô độc lập của từng mức (L1, L2, L3).
// - Chuẩn hóa BM.04 & BM.01: Khi chưa nhập Bias EQA hoặc Thẩm định, hiển thị rõ
//   "0.00% (Chưa nhập)" và tính MU, Sigma khớp 100% với Phiếu in BM.01 & Biểu đồ L-J.
// - Hỗ trợ chọn Nguồn Bias theo thứ tự ưu tiên SOP 5.2.3 (Peer Group -> Method
//   -> All -> NSX -> Thẩm định) & Lưu vết lịch sử cập nhật Bias/TEa định kỳ
//   3 tháng/lần (mu_audit_log).
// - Hỗ trợ 3 phương pháp tính SD khi chốt Range theo SOP 5.2.2 (SD thực tế lô,
//   SD từ CV_TB Pooled, SD từ CV_Max) kèm nhập Số ngày đã dùng Range Phòng.
// ✦ An intellectual product by Handsome Long ✦
// ============================================================================

export interface TroLyRangeMUProps {
  apiUrl: string;
  authToken: string;
  currentUser: UserAccount;
  runDate?: string;
  sections: string[];
  labMachines?: { section: string; machine: string }[];
  configs: TestConfig[];
  setConfigs: React.Dispatch<React.SetStateAction<TestConfig[]>>;
}

export type RangeMuSubView =
  | "ALL_IN_ONE"
  | "RANGE_ESTABLISH"
  | "BM04_07_08_SIGMA";

export type BiasSourcePriorityType =
  | "PEER_GROUP"
  | "METHOD"
  | "ALL_RESULTS"
  | "MFG_REF"
  | "VERIFICATION";

export const BIAS_SOURCE_LABELS: Record<BiasSourcePriorityType, string> = {
  PEER_GROUP: "Peer Group (Cùng máy & HC)",
  METHOD: "Method (Cùng phương pháp)",
  ALL_RESULTS: "All (Tất cả KQ EQA)",
  MFG_REF: "NSX (Tham chiếu hãng)",
  VERIFICATION: "Thẩm định ban đầu",
};

export interface MuBiasAuditEntry {
  updated_at: string;
  period_label: string;
  updated_by: string;
  bias_source: BiasSourcePriorityType;
  old_bias_L1: number | null;
  new_bias_L1: number | null;
  old_bias_L2?: number | null;
  new_bias_L2?: number | null;
  old_bias_L3?: number | null;
  new_bias_L3?: number | null;
  old_tea: number;
  new_tea: number;
}

export interface ComputedLevelStats {
  level: "L1" | "L2" | "L3";
  levelControlName: string;
  levelLotNumber: string;
  rawCount: number;
  cleanCount: number;
  outlierCount: number;
  missingDaysVsMaxLevel: number;
  targetMean: number;
  targetSd: number;
  targetCv: number;
  mfgMean: number;
  mfgSd: number;
  actualMean: number | null;
  actualSd: number | null;
  actualCv: number | null;
  isMeanWithinMfg2SD: boolean;
  isMeanWithinMfg3SD: boolean;
  pooledCvPct: number;
  proposedSdByPooledCv: number;
  maxHistoricalCvPct: number;
  proposedSdByMaxCv: number;
  lotsCountUsed: number;
  biasPercent: number;
  biasSourceLabel: string;
  hasExplicitBias: boolean;
  teaPercent: number;
  teaUnit: "PERCENT" | "ABSOLUTE";
  uRw: number | null;
  uBias: number | null;
  uCombined: number | null;
  uExpanded: number | null;
  uRelExpanded: number | null;
  targetLimitPct: number | null;
  isPassMu: boolean | null;
  sigma: number | null;
  recommendedRuleText: string;
  frequencyText: string;
  sigmaRatingLabel: string;
}

export interface RowInlineDraft {
  biasL1Str: string;
  biasL2Str: string;
  biasL3Str: string;
  teaStr: string;
  biasSource: BiasSourcePriorityType;
  periodLabel: string;
  dirty: boolean;
}

function getCurrentQuarterLabel(isoDate: string): string {
  const year = isoDate.slice(0, 4) || "2026";
  const month = parseInt(isoDate.slice(5, 7), 10) || 1;
  const q = Math.ceil(month / 3);
  return `Quý ${q}/${year}`;
}

/**
 * Lấy Tên Hóa chất QC & Số Lô thực tế của từng mức (L1, L2, L3)
 */
export function getLevelControlAndLotFromConfig(
  t: TestConfig,
  level: "L1" | "L2" | "L3"
): { controlName: string; lotNumber: string } {
  const anyCfg = t as any;
  if (level === "L1") {
    return {
      controlName: anyCfg.control_name_L1 || t.control_name,
      lotNumber: anyCfg.lot_number_L1 || t.lot_number,
    };
  }
  if (level === "L2") {
    return {
      controlName: anyCfg.control_name_L2 || t.control_name,
      lotNumber: anyCfg.lot_number_L2 || t.lot_number,
    };
  }
  return {
    controlName: anyCfg.control_name_L3 || t.control_name,
    lotNumber: anyCfg.lot_number_L3 || t.lot_number,
  };
}

/**
 * Đọc giá trị % Bias Ngoại kiểm (EQA) / Thẩm định của từng mức (L1, L2, L3).
 * Nếu chưa nhập (undefined / null / <= 0), trả về null để hiển thị "0.00% (Chưa nhập)".
 */
export function getExplicitEqaBiasFromConfig(
  t: TestConfig,
  levelKey: "L1" | "L2" | "L3" = "L1"
): number | null {
  const muObj: LevelMuConfig | undefined =
    levelKey === "L1" ? t.mu_L1 : levelKey === "L2" ? t.mu_L2 : t.mu_L3;

  if (
    muObj?.ubias_periodic !== undefined &&
    muObj?.ubias_periodic !== null &&
    Number(muObj.ubias_periodic) > 0
  ) {
    return Number(Number(muObj.ubias_periodic).toFixed(2));
  }
  if (
    muObj?.verif_bias !== undefined &&
    muObj?.verif_bias !== null &&
    Number(muObj.verif_bias) > 0
  ) {
    return Number(Number(muObj.verif_bias).toFixed(2));
  }

  const anyCfg = t as any;
  const legacyVal =
    anyCfg[`eqa_bias_${levelKey}`] ??
    anyCfg.eqa_bias_percent ??
    anyCfg.bias_eqa ??
    anyCfg.bias_percent;
  if (legacyVal !== undefined && legacyVal !== null && legacyVal !== "") {
    const num = Number(legacyVal);
    if (!isNaN(num) && num > 0) {
      return Number(num.toFixed(2));
    }
  }
  return null;
}

export function getBiasSourceFromConfig(t: TestConfig): BiasSourcePriorityType {
  const anyCfg = t as any;
  const raw = String(anyCfg.bias_source_priority || "").trim();
  if (
    raw === "PEER_GROUP" ||
    raw === "METHOD" ||
    raw === "ALL_RESULTS" ||
    raw === "MFG_REF" ||
    raw === "VERIFICATION"
  ) {
    return raw;
  }
  if (
    t.mu_L1?.mu_mode === "INITIAL_VERIFICATION" &&
    t.mu_L1?.verif_bias &&
    t.mu_L1.verif_bias > 0
  ) {
    return "VERIFICATION";
  }
  return "PEER_GROUP";
}

export function getMuAuditLogFromConfig(t: TestConfig): MuBiasAuditEntry[] {
  const anyCfg = t as any;
  return Array.isArray(anyCfg.mu_audit_log) ? anyCfg.mu_audit_log : [];
}

/**
 * Đọc giá trị % TEa hiện hành của xét nghiệm (ưu tiên t.tea, nếu chưa có lấy gợi ý CLIA).
 */
export function getEffectiveTeaFromConfig(t: TestConfig): number {
  if (t.tea !== undefined && t.tea !== null && Number(t.tea) > 0) {
    return Number(Number(t.tea).toFixed(2));
  }
  const anyCfg = t as any;
  const rawTea = anyCfg.tea_percent ?? anyCfg.tea_clia;
  if (rawTea !== undefined && rawTea !== null && rawTea !== "") {
    const num = Number(rawTea);
    if (!isNaN(num) && num > 0) return Number(num.toFixed(2));
  }
  const suggested = getSuggestedCliaTea(t.test_name);
  return suggested !== undefined ? suggested : 10;
}

/**
 * Ghi đồng bộ %Bias EQA của từng mức (L1, L2, L3), Nguồn Bias, %TEa và Lịch sử Audit Trail
 * thẳng vào TestConfig (mu_L1, mu_L2, mu_L3 & tea) để computeMuAndSigma nhận diện 100%.
 */
export function applyLevelBiasesAndTeaToTestConfig(
  t: TestConfig,
  biasL1: number | null,
  biasL2: number | null,
  biasL3: number | null,
  newTeaPercent: number | null,
  biasSource: BiasSourcePriorityType = "PEER_GROUP",
  auditEntry?: MuBiasAuditEntry
): TestConfig {
  const buildUpdatedMu = (
    existingMu: LevelMuConfig | undefined,
    biasVal: number | null
  ): LevelMuConfig => {
    const base: LevelMuConfig = existingMu
      ? { ...existingMu }
      : { mu_mode: "PERIODIC_IQC" };

    if (biasSource === "VERIFICATION") {
      base.mu_mode = "INITIAL_VERIFICATION";
    } else if (base.mu_mode !== "MANUAL") {
      base.mu_mode = "PERIODIC_IQC";
    }

    if (biasVal !== null && !isNaN(biasVal) && biasVal > 0) {
      const cleanB = Number(Math.abs(biasVal).toFixed(2));
      if (biasSource === "VERIFICATION") {
        base.verif_bias = cleanB;
        base.ubias_periodic = cleanB;
      } else {
        base.ubias_periodic = cleanB;
      }
    } else {
      delete base.ubias_periodic;
      delete base.verif_bias;
    }
    return base;
  };

  const prevAudit = getMuAuditLogFromConfig(t);
  const nextAudit = auditEntry
    ? [auditEntry, ...prevAudit].slice(0, 24)
    : prevAudit;

  const updated: any = {
    ...t,
    bias_source_priority: biasSource,
    mu_audit_log: nextAudit,
    mu_L1: buildUpdatedMu(t.mu_L1, biasL1),
    mu_L2:
      t.levels_count >= 2 ? buildUpdatedMu(t.mu_L2, biasL2) : t.mu_L2,
    mu_L3:
      t.levels_count === 3 ? buildUpdatedMu(t.mu_L3, biasL3) : t.mu_L3,
  };

  if (biasL1 !== null && !isNaN(biasL1) && biasL1 > 0) {
    updated.eqa_bias_percent = Number(Math.abs(biasL1).toFixed(2));
  } else {
    delete updated.eqa_bias_percent;
    delete updated.bias_eqa;
    delete updated.bias_percent;
  }

  if (newTeaPercent !== null && !isNaN(newTeaPercent) && newTeaPercent > 0) {
    const cleanTea = Number(Math.abs(newTeaPercent).toFixed(2));
    updated.tea = cleanTea;
    updated.tea_percent = cleanTea;
    if (!updated.tea_unit) updated.tea_unit = "PERCENT";
  }

  return updated as TestConfig;
}

/**
 * Tính toán chi tiết thống kê cho từng mức nồng độ (L1, L2, L3) chuẩn SOP 5.1, 5.2, 5.2.2, 5.2.3 & 5.2.4
 * Hỗ trợ lọc đúng Số Lô riêng của từng mức (lot_number_L1, lot_number_L2, lot_number_L3)
 * và đồng bộ 100% công thức ĐKBĐĐ (BM.01) & Six Sigma với KieuDuLieu.ts và HoSoInAnISO.tsx.
 */
export function computeDetailedLevelMetrics(
  t: TestConfig,
  level: "L1" | "L2" | "L3",
  excludeOutliers3SD: boolean,
  onlyCurrentLot: boolean,
  maxRawCountAcrossLevels = 0
): ComputedLevelStats {
  const rawHistory: HistoryPoint[] =
    level === "L1"
      ? t.history_L1 || []
      : level === "L2"
      ? t.history_L2 || []
      : t.history_L3 || [];

  const { controlName: levelControlName, lotNumber: levelLotNumber } =
    getLevelControlAndLotFromConfig(t, level);

  const targetMean =
    level === "L1" ? t.mean_L1 : level === "L2" ? t.mean_L2 : t.mean_L3;
  const targetSd =
    level === "L1" ? t.sd_L1 : level === "L2" ? t.sd_L2 : t.sd_L3;
  const targetCv =
    targetMean > 0 ? Number(((targetSd / targetMean) * 100).toFixed(2)) : 0;

  const mfgMean =
    level === "L1"
      ? t.mfg_mean_L1 || t.mean_L1
      : level === "L2"
      ? t.mfg_mean_L2 || t.mean_L2
      : t.mfg_mean_L3 || t.mean_L3;
  const mfgSd =
    level === "L1"
      ? t.mfg_sd_L1 || t.sd_L1
      : level === "L2"
      ? t.mfg_sd_L2 || t.sd_L2
      : t.mfg_sd_L3 || t.sd_L3;

  // Lọc điểm theo Lô hiện hành của đúng mức đó (chấp nhận cả lot_number chung hoặc lot_number_L1/L2/L3)
  const lotFiltered = onlyCurrentLot
    ? rawHistory.filter(
        (p) =>
          !p.lot_number ||
          p.lot_number === levelLotNumber ||
          p.lot_number === t.lot_number
      )
    : rawHistory;

  const validNumericPts = lotFiltered.filter(
    (p) => typeof p.val === "number" && !isNaN(p.val) && p.val > 0
  );
  const rawCount = validNumericPts.length;
  const missingDaysVsMaxLevel = Math.max(0, maxRawCountAcrossLevels - rawCount);

  // Lọc bỏ điểm vi phạm quy tắc nội kiểm (status === "FAIL" hoặc |Z| >= 3SD) theo SOP 5.2.3
  const cleanPts = excludeOutliers3SD
    ? validNumericPts.filter((p) => {
        if (p.status === "FAIL") return false;
        if (targetSd > 0) {
          const z = Math.abs((p.val - targetMean) / targetSd);
          return z < 3;
        }
        return true;
      })
    : validNumericPts;

  const cleanCount = cleanPts.length;
  const outlierCount = Math.max(0, rawCount - cleanCount);

  let actualMean: number | null = null;
  let actualSd: number | null = null;
  let actualCv: number | null = null;

  if (cleanCount >= 1) {
    const sum = cleanPts.reduce((acc, p) => acc + Number(p.val), 0);
    const meanVal = sum / cleanCount;
    actualMean = roundSmartDecimal(meanVal, targetSd);

    if (cleanCount >= 2) {
      const variance =
        cleanPts.reduce(
          (acc, p) => acc + Math.pow(Number(p.val) - meanVal, 2),
          0
        ) /
        (cleanCount - 1);
      const sdVal = Math.sqrt(variance);
      actualSd = roundSmartDecimal(sdVal, targetSd);
      actualCv =
        meanVal > 0
          ? Number(Math.max((sdVal / meanVal) * 100, 0.01).toFixed(2))
          : 0;
    } else {
      actualSd = 0;
      actualCv = 0;
    }
  }

  // Kiểm tra Mean mới có nằm trong khoảng chấp nhận của NSX không (SOP 5.2.2)
  const checkMean = actualMean ?? targetMean;
  const isMeanWithinMfg2SD =
    mfgSd > 0 ? Math.abs(checkMean - mfgMean) <= 2 * mfgSd : true;
  const isMeanWithinMfg3SD =
    mfgSd > 0 ? Math.abs(checkMean - mfgMean) <= 3 * mfgSd : true;

  // 1. Tính CV_TB (Weighted Pooled CV%) theo CLSI C24 / BM.03.XN.QTQL.31
  const pooledStats = computeThreeLotPooledStats(
    t,
    level,
    checkMean,
    actualCv ?? targetCv,
    cleanCount
  );

  // 2. Tính CV_Max trong các lô lịch sử (SOP 5.2.2: lựa chọn CV_Max hoặc CV_TB)
  const historicalCvs: number[] = [];
  (t.lot_history || []).slice(0, 12).forEach((lh) => {
    const c = level === "L1" ? lh.cv_L1 : level === "L2" ? lh.cv_L2 : lh.cv_L3;
    if (c && c > 0) historicalCvs.push(Number(c));
  });
  if (actualCv !== null && actualCv > 0) historicalCvs.push(actualCv);
  else if (targetCv > 0) historicalCvs.push(targetCv);

  const maxHistoricalCvPct =
    historicalCvs.length > 0
      ? Number(Math.max(...historicalCvs).toFixed(2))
      : pooledStats.pooledCvPct;
  const proposedSdByMaxCv = roundSmartDecimal(
    (checkMean * maxHistoricalCvPct) / 100,
    targetSd
  );

  // Kiểm tra Bias Ngoại kiểm (EQA) hoặc Thẩm định đã nhập tường minh cho mức này
  const explicitBias = getExplicitEqaBiasFromConfig(t, level);
  const biasSourcePriority = getBiasSourceFromConfig(t);
  const baseMuInfo = computeMuAndSigma(t, level);
  const hasExplicitBias =
    explicitBias !== null || baseMuInfo.biasModeUsed !== "NONE_ZERO";

  const finalBiasPercent =
    explicitBias !== null
      ? explicitBias
      : hasExplicitBias
      ? Number(baseMuInfo.biasPct.toFixed(2))
      : 0;

  const shortSourceMap: Record<BiasSourcePriorityType, string> = {
    PEER_GROUP: "EQA · Peer Group",
    METHOD: "EQA · Method",
    ALL_RESULTS: "EQA · All",
    MFG_REF: "NSX Ref",
    VERIFICATION: "Thẩm định",
  };

  const finalBiasSourceLabel =
    explicitBias !== null
      ? shortSourceMap[biasSourcePriority] || "Ngoại kiểm EQA"
      : hasExplicitBias
      ? baseMuInfo.biasSourceLabel
      : "0.00% (Chưa nhập)";

  const teaPercent = getEffectiveTeaFromConfig(t);
  const teaUnit = t.tea_unit || "PERCENT";

  const effectiveCvForCalc =
    actualCv !== null && actualCv > 0
      ? actualCv
      : baseMuInfo.cvPct > 0
      ? baseMuInfo.cvPct
      : targetCv;

  const effectiveMeanForCalc =
    actualMean !== null && actualMean > 0 ? actualMean : targetMean;
  const effectiveSdForCalc =
    actualSd !== null && actualSd > 0 ? actualSd : targetSd;

  // ĐỒNG BỘ 100% CÔNG THỨC ĐKBĐĐ VỚI BM.01.XN.QTQL.30 (KieuDuLieu.ts & HoSoInAnISO.tsx)
  const muCfg: LevelMuConfig | undefined =
    level === "L1" ? t.mu_L1 : level === "L2" ? t.mu_L2 : t.mu_L3;
  const isInitialVerif =
    muCfg?.mu_mode === "INITIAL_VERIFICATION" ||
    (muCfg?.mu_mode === "NONE" && biasSourcePriority === "VERIFICATION");
  const isManualMode =
    muCfg?.mu_mode === "MANUAL" && Number(muCfg?.manual_mu || 0) > 0;
  const kFactor = isInitialVerif ? 1.96 : 2.0;

  let uRw: number | null = null;
  let uBias: number | null = null;
  let uCombined: number | null = null;
  let uExpanded: number | null = null;
  let uRelExpanded: number | null = null;
  let targetLimitPct: number | null = null;
  let isPassMu: boolean | null = null;

  if (effectiveMeanForCalc > 0 && (effectiveCvForCalc > 0 || isManualMode)) {
    if (isManualMode) {
      const manualVal = Number(muCfg?.manual_mu || 0);
      uRw = Number(effectiveCvForCalc.toFixed(2));
      uBias = Number(finalBiasPercent.toFixed(2));
      uCombined = Number((manualVal / 2).toFixed(2));
      uRelExpanded = Number(manualVal.toFixed(2));
      uExpanded = roundSmartDecimal(
        (uRelExpanded * effectiveMeanForCalc) / 100,
        targetSd
      );
    } else if (isInitialVerif) {
      const urPct = Number(muCfg?.verif_cvr || effectiveCvForCalc || 0);
      const ubPct = Number(finalBiasPercent || 0);
      const ucPct = Math.sqrt(Math.pow(urPct, 2) + Math.pow(ubPct, 2));
      const uePct = kFactor * ucPct;
      uRw = Number(urPct.toFixed(2));
      uBias = Number(ubPct.toFixed(2));
      uCombined = Number(ucPct.toFixed(2));
      uRelExpanded = Number(uePct.toFixed(2));
      uExpanded = roundSmartDecimal(
        (uePct * effectiveMeanForCalc) / 100,
        targetSd
      );
    } else {
      const urwPct = Number(muCfg?.urw_pooled || effectiveCvForCalc || 0);
      const ubPct = Number(finalBiasPercent || 0);
      const ucalPct = Number(muCfg?.uc_cal || 0);
      const ubCombinedPct = Math.sqrt(
        Math.pow(ubPct, 2) + Math.pow(ucalPct, 2)
      );
      const ucPct = Math.sqrt(
        Math.pow(urwPct, 2) + Math.pow(ubPct, 2) + Math.pow(ucalPct, 2)
      );
      const uePct = kFactor * ucPct;
      uRw = Number(urwPct.toFixed(2));
      uBias = Number(ubCombinedPct.toFixed(2));
      uCombined = Number(ucPct.toFixed(2));
      uRelExpanded = Number(uePct.toFixed(2));
      uExpanded = roundSmartDecimal(
        (uePct * effectiveMeanForCalc) / 100,
        targetSd
      );
    }

    if (teaPercent > 0 && uRelExpanded !== null) {
      targetLimitPct =
        teaUnit === "PERCENT"
          ? Number((0.75 * teaPercent).toFixed(2))
          : Number(
              (((0.75 * teaPercent) / effectiveMeanForCalc) * 100).toFixed(2)
            );
      isPassMu = uRelExpanded < targetLimitPct;
    }
  }

  // Tính Six Sigma theo SOP 5.2.3 (Hỗ trợ cả TEa % tương đối và TEa số tuyệt đối)
  let sigma: number | null = null;
  if (teaPercent > 0) {
    if (teaUnit === "PERCENT" && effectiveCvForCalc > 0) {
      const rawSigma =
        (teaPercent - Math.abs(finalBiasPercent)) / effectiveCvForCalc;
      sigma = Number(Math.max(0, Math.min(16, rawSigma)).toFixed(2));
    } else if (teaUnit === "ABSOLUTE" && effectiveSdForCalc > 0) {
      const biasAbs = (Math.abs(finalBiasPercent) * effectiveMeanForCalc) / 100;
      const rawSigma = (teaPercent - biasAbs) / effectiveSdForCalc;
      sigma = Number(Math.max(0, Math.min(16, rawSigma)).toFixed(2));
    }
  }

  const recObj = getRecommendedWestgardRules(t, sigma);
  const recommendedRuleText = recObj.bm08Text;

  // Thiết lập tần suất thực hiện N, R theo SOP 5.2.4
  const lvCount = t.levels_count;
  const frequencyText =
    sigma !== null && sigma >= 5.0
      ? `N=${lvCount}, R=1 (1 lần/ngày)`
      : `CLIA §493.1256: ≥1 lần/24h (N=${lvCount}, R=1)`;

  const sigmaRatingLabel =
    sigma === null
      ? "Chưa đủ dữ liệu"
      : sigma >= 6
      ? "Đẳng cấp Thế giới (≥ 6σ)"
      : sigma >= 5
      ? "Xuất sắc (5σ – <6σ)"
      : sigma >= 4
      ? "Tốt / Khá (4σ – <5σ)"
      : sigma >= 3
      ? "Chấp nhận tối thiểu (3σ – <4σ)"
      : "Kém (< 3σ - Cần cải tiến)";

  return {
    level,
    levelControlName,
    levelLotNumber,
    rawCount,
    cleanCount,
    outlierCount,
    missingDaysVsMaxLevel,
    targetMean,
    targetSd,
    targetCv,
    mfgMean,
    mfgSd,
    actualMean,
    actualSd,
    actualCv,
    isMeanWithinMfg2SD,
    isMeanWithinMfg3SD,
    pooledCvPct: pooledStats.pooledCvPct,
    proposedSdByPooledCv: pooledStats.proposedSdByCv,
    maxHistoricalCvPct,
    proposedSdByMaxCv,
    lotsCountUsed: pooledStats.lotsCountUsed,
    biasPercent: finalBiasPercent,
    biasSourceLabel: finalBiasSourceLabel,
    hasExplicitBias,
    teaPercent,
    teaUnit,
    uRw,
    uBias,
    uCombined,
    uExpanded,
    uRelExpanded,
    targetLimitPct,
    isPassMu,
    sigma,
    recommendedRuleText,
    frequencyText,
    sigmaRatingLabel,
  };
}

export default function TroLyRangeMU({
  apiUrl,
  authToken,
  currentUser,
  runDate = getVnIsoDateString(),
  sections = [],
  labMachines = [],
  configs = [],
  setConfigs,
}: TroLyRangeMUProps) {
  const safeSections = useMemo(() => {
    if (Array.isArray(sections) && sections.length > 0) return sections;
    const fromMacs = (labMachines || []).map((m) => m.section);
    const fromCfgs = (configs || []).map((c) => c.section);
    return Array.from(new Set([...fromMacs, ...fromCfgs])).filter(Boolean);
  }, [sections, labMachines, configs]);

  const [subView, setSubView] = useState<RangeMuSubView>("ALL_IN_ONE");
  const [selSection, setSelSection] = useState<string>("ALL");
  const [selMachine, setSelMachine] = useState<string>("ALL");
  const [searchQuery, setSearchQuery] = useState<string>("");

  const [excludeOutliers3SD, setExcludeOutliers3SD] = useState<boolean>(true);
  const [onlyCurrentLot, setOnlyCurrentLot] = useState<boolean>(true);

  const defaultPeriodLabel = useMemo(
    () => getCurrentQuarterLabel(runDate),
    [runDate]
  );

  // State lưu nháp các ô nhập nhanh %Bias EQA (riêng từng mức L1, L2, L3), Nguồn Bias và %TEa
  const [inlineDrafts, setInlineDrafts] = useState<
    Record<string, RowInlineDraft>
  >({});
  const [savingRowId, setSavingRowId] = useState<string | null>(null);
  const [isSavingAllInline, setIsSavingAllInline] = useState<boolean>(false);
  const [saveSuccessBanner, setSaveSuccessBanner] = useState<string>("");

  // State Modal Xem Lịch Sử Cập Nhật Bias% EQA & TEa% Định Kỳ 3 Tháng
  const [historyModalTestId, setHistoryModalTestId] = useState<string | null>(
    null
  );

  // State Modal Xác nhận Chốt / Khóa Dải QC Nội bộ Lab (Mean ± SD thực tế)
  const [lockingTestModal, setLockingTestModal] = useState<{
    test: TestConfig;
    l1Stats: ComputedLevelStats;
    l2Stats: ComputedLevelStats | null;
    l3Stats: ComputedLevelStats | null;
    lockType: RangeSourceType;
    sdMethod: "ACTUAL_LOT_SD" | "POOLED_CV_SD" | "MAX_CV_SD";
    activeDaysDraft: string;
  } | null>(null);
  const [isLockingRange, setIsLockingRange] = useState<boolean>(false);

  // Hỗ trợ nhận Deep-Link khi bấm từ Dashboard hoặc Danh mục chuyển sang
  useEffect(() => {
    try {
      const rawDeep = sessionStorage.getItem("DEEP_LINK_TEST");
      if (!rawDeep) return;
      sessionStorage.removeItem("DEEP_LINK_TEST");
      const parsed = JSON.parse(rawDeep);
      if (parsed.section) setSelSection(parsed.section);
      if (parsed.machine && parsed.machine !== "Tất cả")
        setSelMachine(parsed.machine);
      if (parsed.test_id) {
        const targetCfg = configs.find((c) => c.test_id === parsed.test_id);
        if (targetCfg) setSearchQuery(targetCfg.test_name);
      }
    } catch {}
  }, [configs]);

  // Đồng bộ giá trị khởi tạo cho các ô nhập nhanh Bias% (L1, L2, L3), Nguồn Bias và TEa%
  useEffect(() => {
    setInlineDrafts((prev) => {
      const next = { ...prev };
      configs.forEach((t) => {
        if (!next[t.test_id] || !next[t.test_id].dirty) {
          const b1 = getExplicitEqaBiasFromConfig(t, "L1");
          const b2 = getExplicitEqaBiasFromConfig(t, "L2");
          const b3 = getExplicitEqaBiasFromConfig(t, "L3");
          const effTea = getEffectiveTeaFromConfig(t);
          const src = getBiasSourceFromConfig(t);
          next[t.test_id] = {
            biasL1Str: b1 !== null ? String(b1) : "",
            biasL2Str: b2 !== null ? String(b2) : "",
            biasL3Str: b3 !== null ? String(b3) : "",
            teaStr: effTea > 0 ? String(effTea) : "",
            biasSource: src,
            periodLabel: defaultPeriodLabel,
            dirty: false,
          };
        }
      });
      return next;
    });
  }, [configs, defaultPeriodLabel]);

  const availableMachines = useMemo(() => {
    const fromLab = (labMachines || [])
      .filter((m) => selSection === "ALL" || m.section === selSection)
      .map((m) => m.machine);
    const fromCfg = (configs || [])
      .filter((c) => selSection === "ALL" || c.section === selSection)
      .map((c) => c.machine_name);
    return Array.from(new Set([...fromLab, ...fromCfg])).filter(Boolean);
  }, [labMachines, configs, selSection]);

  const filteredQuantitativeTests = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return (configs || [])
      .filter((c) => {
        if (c.test_type === "QUALITATIVE") return false;
        if (selSection !== "ALL" && c.section !== selSection) return false;
        if (selMachine !== "ALL" && c.machine_name !== selMachine) return false;
        if (q) {
          const anyC = c as any;
          const hay = `${c.test_name} ${c.machine_name} ${c.control_name} ${
            c.lot_number
          } ${anyC.control_name_L1 || ""} ${anyC.control_name_L2 || ""} ${
            anyC.control_name_L3 || ""
          } ${anyC.lot_number_L1 || ""} ${anyC.lot_number_L2 || ""} ${
            anyC.lot_number_L3 || ""
          }`.toLowerCase();
          if (hay.indexOf(q) === -1) return false;
        }
        return true;
      })
      .sort((a, b) => {
        if (a.machine_name !== b.machine_name)
          return a.machine_name.localeCompare(b.machine_name);
        return a.order - b.order;
      });
  }, [configs, selSection, selMachine, searchQuery]);

  const handleInlineFieldChange = useCallback(
    (
      testId: string,
      field:
        | "biasL1Str"
        | "biasL2Str"
        | "biasL3Str"
        | "teaStr"
        | "biasSource"
        | "periodLabel",
      value: string
    ) => {
      const normalized =
        field === "biasSource" || field === "periodLabel"
          ? value
          : value.replace(/,/g, ".");
      setInlineDrafts((prev) => {
        const cur = prev[testId] || {
          biasL1Str: "",
          biasL2Str: "",
          biasL3Str: "",
          teaStr: "",
          biasSource: "PEER_GROUP" as BiasSourcePriorityType,
          periodLabel: defaultPeriodLabel,
          dirty: false,
        };
        return {
          ...prev,
          [testId]: {
            ...cur,
            [field]: normalized,
            dirty: true,
          },
        };
      });
    },
    [defaultPeriodLabel]
  );

  const parseDraftNum = (str: string): number | null => {
    const clean = String(str || "")
      .trim()
      .replace(/,/g, ".");
    if (clean === "" || parseFloat(clean) === 0) return null;
    const n = parseFloat(clean);
    return isNaN(n) ? null : n;
  };

  // Bản sao cấu hình áp dụng giá trị đang gõ ở inlineDrafts để tính Live Preview tức thì
  const getLivePreviewTestConfig = useCallback(
    (test: TestConfig): TestConfig => {
      const draft = inlineDrafts[test.test_id];
      if (!draft || !draft.dirty) return test;

      const pB1 = parseDraftNum(draft.biasL1Str);
      const pB2 = parseDraftNum(draft.biasL2Str);
      const pB3 = parseDraftNum(draft.biasL3Str);
      const pTea = parseDraftNum(draft.teaStr);

      return applyLevelBiasesAndTeaToTestConfig(
        test,
        pB1,
        pB2,
        pB3,
        pTea !== null && pTea > 0 ? pTea : getEffectiveTeaFromConfig(test),
        draft.biasSource
      );
    },
    [inlineDrafts]
  );

  // Lưu nhanh %Bias Ngoại kiểm (EQA) & %TEa của 1 xét nghiệm kèm ghi sổ Audit Trail 3 tháng/lần
  const handleSaveSingleRowBiasAndTea = async (test: TestConfig) => {
    const draft = inlineDrafts[test.test_id];
    if (!draft) return;

    const pB1 = parseDraftNum(draft.biasL1Str);
    const pB2 = parseDraftNum(draft.biasL2Str);
    const pB3 = parseDraftNum(draft.biasL3Str);
    const pTea = parseDraftNum(draft.teaStr);

    if (
      (pB1 !== null && pB1 < 0) ||
      (pB2 !== null && pB2 < 0) ||
      (pB3 !== null && pB3 < 0)
    ) {
      window.alert("⚠️ Giá trị % Bias Ngoại kiểm không được âm!");
      return;
    }
    if (pTea !== null && pTea <= 0) {
      window.alert("⚠️ Giá trị % TEa (CLIA) phải lớn hơn 0!");
      return;
    }

    const oldB1 = getExplicitEqaBiasFromConfig(test, "L1");
    const oldB2 = getExplicitEqaBiasFromConfig(test, "L2");
    const oldB3 = getExplicitEqaBiasFromConfig(test, "L3");
    const oldTea = getEffectiveTeaFromConfig(test);
    const finalNewTea = pTea !== null ? pTea : oldTea;

    const auditItem: MuBiasAuditEntry = {
      updated_at: `${formatShortDM(
        getVnIsoDateString()
      )}/${getVnIsoDateString().slice(0, 4)} ${getVnTimeString()}`,
      period_label: draft.periodLabel.trim() || defaultPeriodLabel,
      updated_by: currentUser.name,
      bias_source: draft.biasSource,
      old_bias_L1: oldB1,
      new_bias_L1: pB1,
      old_bias_L2: test.levels_count >= 2 ? oldB2 : undefined,
      new_bias_L2: test.levels_count >= 2 ? pB2 : undefined,
      old_bias_L3: test.levels_count === 3 ? oldB3 : undefined,
      new_bias_L3: test.levels_count === 3 ? pB3 : undefined,
      old_tea: oldTea,
      new_tea: finalNewTea,
    };

    setSavingRowId(test.test_id);
    const updatedTest = applyLevelBiasesAndTeaToTestConfig(
      test,
      pB1,
      pB2,
      pB3,
      finalNewTea,
      draft.biasSource,
      auditItem
    );

    setConfigs((prev) =>
      prev.map((c) => (c.test_id === test.test_id ? updatedTest : c))
    );

    setInlineDrafts((prev) => ({
      ...prev,
      [test.test_id]: {
        ...draft,
        biasL1Str: pB1 !== null ? String(pB1) : "",
        biasL2Str: pB2 !== null ? String(pB2) : "",
        biasL3Str: pB3 !== null ? String(pB3) : "",
        teaStr: String(finalNewTea),
        dirty: false,
      },
    }));

    await rpcCall(apiUrl, "save_config", updatedTest, authToken);

    setSavingRowId(null);
    setSaveSuccessBanner(
      `✓ Đã lưu Bias% (${
        BIAS_SOURCE_LABELS[draft.biasSource]
      }) & ghi nhận vào Sổ lịch sử định kỳ (${auditItem.period_label}) cho [${
        test.test_name
      }]!`
    );
    window.setTimeout(() => setSaveSuccessBanner(""), 4500);
  };

  // Lưu đồng loạt tất cả các dòng có chỉnh sửa %Bias EQA hoặc %TEa ("save_configs_bulk")
  const handleSaveAllDirtyInlineRows = async () => {
    const dirtyIds = Object.keys(inlineDrafts).filter(
      (id) => inlineDrafts[id]?.dirty
    );
    if (dirtyIds.length === 0) return;

    setIsSavingAllInline(true);
    const updatedConfigsList: TestConfig[] = [];
    const stamp = `${formatShortDM(
      getVnIsoDateString()
    )}/${getVnIsoDateString().slice(0, 4)} ${getVnTimeString()}`;

    setConfigs((prev) =>
      prev.map((c) => {
        const draft = inlineDrafts[c.test_id];
        if (!draft || !draft.dirty) return c;
        const pB1 = parseDraftNum(draft.biasL1Str);
        const pB2 = parseDraftNum(draft.biasL2Str);
        const pB3 = parseDraftNum(draft.biasL3Str);
        const pTea = parseDraftNum(draft.teaStr);
        const oldTea = getEffectiveTeaFromConfig(c);
        const finalNewTea = pTea !== null ? pTea : oldTea;

        const auditItem: MuBiasAuditEntry = {
          updated_at: stamp,
          period_label: draft.periodLabel.trim() || defaultPeriodLabel,
          updated_by: currentUser.name,
          bias_source: draft.biasSource,
          old_bias_L1: getExplicitEqaBiasFromConfig(c, "L1"),
          new_bias_L1: pB1,
          old_bias_L2:
            c.levels_count >= 2
              ? getExplicitEqaBiasFromConfig(c, "L2")
              : undefined,
          new_bias_L2: c.levels_count >= 2 ? pB2 : undefined,
          old_bias_L3:
            c.levels_count === 3
              ? getExplicitEqaBiasFromConfig(c, "L3")
              : undefined,
          new_bias_L3: c.levels_count === 3 ? pB3 : undefined,
          old_tea: oldTea,
          new_tea: finalNewTea,
        };

        const nextCfg = applyLevelBiasesAndTeaToTestConfig(
          c,
          pB1,
          pB2,
          pB3,
          finalNewTea,
          draft.biasSource,
          auditItem
        );
        updatedConfigsList.push(nextCfg);
        return nextCfg;
      })
    );

    setInlineDrafts((prev) => {
      const next = { ...prev };
      dirtyIds.forEach((id) => {
        if (next[id]) next[id] = { ...next[id], dirty: false };
      });
      return next;
    });

    if (updatedConfigsList.length > 0) {
      await rpcCall(
        apiUrl,
        "save_configs_bulk",
        { items: updatedConfigsList },
        authToken
      );
    }

    setIsSavingAllInline(false);
    setSaveSuccessBanner(
      `✓ Đã lưu đồng bộ Bias% EQA, TEa% & ghi Sổ lịch sử định kỳ cho ${updatedConfigsList.length} xét nghiệm!`
    );
    window.setTimeout(() => setSaveSuccessBanner(""), 4500);
  };

  // Mở Modal xác nhận Chốt / Khóa Range Nội bộ Lab từ dữ liệu thực tế tích lũy
  const handleOpenLockRangeModal = (test: TestConfig) => {
    const previewCfg = getLivePreviewTestConfig(test);
    const maxRaw = Math.max(
      (previewCfg.history_L1 || []).length,
      test.levels_count >= 2 ? (previewCfg.history_L2 || []).length : 0,
      test.levels_count === 3 ? (previewCfg.history_L3 || []).length : 0
    );

    const l1 = computeDetailedLevelMetrics(
      previewCfg,
      "L1",
      excludeOutliers3SD,
      onlyCurrentLot,
      maxRaw
    );
    const l2 =
      test.levels_count >= 2
        ? computeDetailedLevelMetrics(
            previewCfg,
            "L2",
            excludeOutliers3SD,
            onlyCurrentLot,
            maxRaw
          )
        : null;
    const l3 =
      test.levels_count === 3
        ? computeDetailedLevelMetrics(
            previewCfg,
            "L3",
            excludeOutliers3SD,
            onlyCurrentLot,
            maxRaw
          )
        : null;

    if (
      (l1.actualMean === null || l1.actualSd === null || l1.actualSd <= 0) &&
      (!l2 ||
        l2.actualMean === null ||
        l2.actualSd === null ||
        l2.actualSd <= 0)
    ) {
      window.alert(
        "⚠️ Xét nghiệm này chưa có đủ tối thiểu 2 điểm dữ liệu hợp lệ để tính Mean ± SD thực tế! (Nếu chuyển từ phần mềm cũ sang, bạn có thể nhập trực tiếp tại tab Danh mục & Vật tư)."
      );
      return;
    }

    const minCleanPoints = Math.min(
      l1.cleanCount,
      l2 ? l2.cleanCount : l1.cleanCount,
      l3 ? l3.cleanCount : l1.cleanCount
    );

    const defaultActiveDays =
      test.range_source !== "MANUFACTURER" && test.range_active_days > 0
        ? String(test.range_active_days)
        : "1";

    setLockingTestModal({
      test,
      l1Stats: l1,
      l2Stats: l2,
      l3Stats: l3,
      lockType: minCleanPoints >= 20 ? "LAB_OFFICIAL" : "LAB_TEMP",
      sdMethod:
        minCleanPoints >= 20
          ? "ACTUAL_LOT_SD"
          : l1.lotsCountUsed > 1
          ? "POOLED_CV_SD"
          : "ACTUAL_LOT_SD",
      activeDaysDraft: defaultActiveDays,
    });
  };

  // Thực thi Chốt / Khóa Range Nội bộ Lab và đồng bộ xuống Google Sheets ("apply_lab_range" & "save_config")
  const handleConfirmLockLabRange = async () => {
    if (!lockingTestModal) return;
    setIsLockingRange(true);

    const {
      test,
      l1Stats,
      l2Stats,
      l3Stats,
      lockType,
      sdMethod,
      activeDaysDraft,
    } = lockingTestModal;

    const pickSdByMethod = (
      st: ComputedLevelStats | null,
      fallbackSd: number
    ): number => {
      if (!st) return fallbackSd;
      if (sdMethod === "POOLED_CV_SD") {
        return st.proposedSdByPooledCv > 0
          ? st.proposedSdByPooledCv
          : st.actualSd ?? fallbackSd;
      }
      if (sdMethod === "MAX_CV_SD") {
        return st.proposedSdByMaxCv > 0
          ? st.proposedSdByMaxCv
          : st.actualSd ?? fallbackSd;
      }
      return st.actualSd !== null && st.actualSd > 0 ? st.actualSd : fallbackSd;
    };

    const nextMeanL1 =
      l1Stats.actualMean !== null && l1Stats.actualMean > 0
        ? l1Stats.actualMean
        : test.mean_L1;
    const nextSdL1 = pickSdByMethod(l1Stats, test.sd_L1);

    const nextMeanL2 =
      l2Stats && l2Stats.actualMean !== null && l2Stats.actualMean > 0
        ? l2Stats.actualMean
        : test.mean_L2;
    const nextSdL2 =
      l2Stats !== null ? pickSdByMethod(l2Stats, test.sd_L2) : test.sd_L2;

    const nextMeanL3 =
      l3Stats && l3Stats.actualMean !== null && l3Stats.actualMean > 0
        ? l3Stats.actualMean
        : test.mean_L3;
    const nextSdL3 =
      l3Stats !== null ? pickSdByMethod(l3Stats, test.sd_L3) : test.sd_L3;

    const parsedActiveDays = Math.max(1, parseInt(activeDaysDraft, 10) || 1);

    const updatedConfig: TestConfig = {
      ...getLivePreviewTestConfig(test),
      mfg_mean_L1: test.mfg_mean_L1 > 0 ? test.mfg_mean_L1 : test.mean_L1,
      mfg_sd_L1: test.mfg_sd_L1 > 0 ? test.mfg_sd_L1 : test.sd_L1,
      mfg_mean_L2: test.mfg_mean_L2 > 0 ? test.mfg_mean_L2 : test.mean_L2,
      mfg_sd_L2: test.mfg_sd_L2 > 0 ? test.mfg_sd_L2 : test.sd_L2,
      mfg_mean_L3: test.mfg_mean_L3 > 0 ? test.mfg_mean_L3 : test.mean_L3,
      mfg_sd_L3: test.mfg_sd_L3 > 0 ? test.mfg_sd_L3 : test.sd_L3,
      mean_L1: nextMeanL1,
      sd_L1: nextSdL1,
      mean_L2: nextMeanL2,
      sd_L2: nextSdL2,
      mean_L3: nextMeanL3,
      sd_L3: nextSdL3,
      range_source: lockType,
      range_applied_date: runDate,
      range_active_days: parsedActiveDays,
    };

    setConfigs((prev) =>
      prev.map((c) => (c.test_id === test.test_id ? updatedConfig : c))
    );

    await rpcCall(
      apiUrl,
      "apply_lab_range",
      {
        test_id: updatedConfig.test_id,
        mean_L1: updatedConfig.mean_L1,
        sd_L1: updatedConfig.sd_L1,
        mean_L2: updatedConfig.mean_L2,
        sd_L2: updatedConfig.sd_L2,
        mean_L3: updatedConfig.mean_L3,
        sd_L3: updatedConfig.sd_L3,
        range_source: updatedConfig.range_source,
        applied_date: runDate,
        range_active_days: parsedActiveDays,
        lot_history: updatedConfig.lot_history,
      },
      authToken
    );
    await rpcCall(apiUrl, "save_config", updatedConfig, authToken);

    setIsLockingRange(false);
    setLockingTestModal(null);
    setSaveSuccessBanner(
      `✓ Đã chốt dải QC ${
        lockType === "LAB_OFFICIAL"
          ? `Chính thức Phòng XN (Đã dùng ${parsedActiveDays} ngày)`
          : `Tạm thời Phòng XN (Đã dùng ${parsedActiveDays} ngày)`
      } cho xét nghiệm [${test.test_name}]!`
    );
    window.setTimeout(() => setSaveSuccessBanner(""), 4500);
  };

  // Khôi phục lại Range Hãng sản xuất gốc (MANUFACTURER)
  const handleRevertToManufacturerRange = async (test: TestConfig) => {
    if (
      !window.confirm(
        `↺ Khôi phục dải Mean ± SD của xét nghiệm [${test.test_name}] về Range Hãng Sản Xuất gốc?`
      )
    ) {
      return;
    }

    const revertedConfig: TestConfig = {
      ...test,
      mean_L1: test.mfg_mean_L1 > 0 ? test.mfg_mean_L1 : test.mean_L1,
      sd_L1: test.mfg_sd_L1 > 0 ? test.mfg_sd_L1 : test.sd_L1,
      mean_L2: test.mfg_mean_L2 > 0 ? test.mfg_mean_L2 : test.mean_L2,
      sd_L2: test.mfg_sd_L2 > 0 ? test.mfg_sd_L2 : test.sd_L2,
      mean_L3: test.mfg_mean_L3 > 0 ? test.mfg_mean_L3 : test.mean_L3,
      sd_L3: test.mfg_sd_L3 > 0 ? test.mfg_sd_L3 : test.sd_L3,
      range_source: "MANUFACTURER",
      range_active_days: 0,
    };

    setConfigs((prev) =>
      prev.map((c) => (c.test_id === test.test_id ? revertedConfig : c))
    );

    await rpcCall(apiUrl, "save_config", revertedConfig, authToken);

    setSaveSuccessBanner(
      `↺ Đã khôi phục [${test.test_name}] về Range Hãng Sản Xuất gốc!`
    );
    window.setTimeout(() => setSaveSuccessBanner(""), 4000);
  };

  // Thống kê tổng quan trên thanh thẻ đầu trang
  const overviewMetrics = useMemo(() => {
    let ready20Count = 0;
    let lockedLabCount = 0;
    let hasEqaBiasCount = 0;
    let highSigmaCount = 0;
    let dirtyRowsCount = 0;

    filteredQuantitativeTests.forEach((t) => {
      const liveCfg = getLivePreviewTestConfig(t);
      const s1 = computeDetailedLevelMetrics(
        liveCfg,
        "L1",
        excludeOutliers3SD,
        onlyCurrentLot
      );
      const s2 =
        t.levels_count >= 2
          ? computeDetailedLevelMetrics(
              liveCfg,
              "L2",
              excludeOutliers3SD,
              onlyCurrentLot
            )
          : null;
      const s3 =
        t.levels_count === 3
          ? computeDetailedLevelMetrics(
              liveCfg,
              "L3",
              excludeOutliers3SD,
              onlyCurrentLot
            )
          : null;

      if (t.range_source !== "MANUFACTURER") {
        lockedLabCount++;
      } else if (
        s1.cleanCount >= 20 ||
        Number(t.accumulated_points || 0) >= 20
      ) {
        ready20Count++;
      }
      if (
        s1.hasExplicitBias ||
        Boolean(s2?.hasExplicitBias) ||
        Boolean(s3?.hasExplicitBias)
      ) {
        hasEqaBiasCount++;
      }
      if (s1.sigma !== null && s1.sigma >= 4) highSigmaCount++;
      if (inlineDrafts[t.test_id]?.dirty) dirtyRowsCount++;
    });

    return {
      totalTests: filteredQuantitativeTests.length,
      ready20Count,
      lockedLabCount,
      hasEqaBiasCount,
      missingBiasCount: Math.max(
        0,
        filteredQuantitativeTests.length - hasEqaBiasCount
      ),
      highSigmaCount,
      dirtyRowsCount,
    };
  }, [
    filteredQuantitativeTests,
    getLivePreviewTestConfig,
    excludeOutliers3SD,
    onlyCurrentLot,
    inlineDrafts,
  ]);

  const historyModalTest = useMemo(
    () =>
      historyModalTestId
        ? configs.find((c) => c.test_id === historyModalTestId) || null
        : null,
    [configs, historyModalTestId]
  );

  return (
    <div className="space-y-4">
      {/* =================================================================== */}
      {/* HÀNG 1: 4 THẺ KPI TỔNG QUAN PHONG CÁCH PASTEL & NEON TƯƠI SÁNG      */}
      {/* =================================================================== */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
        <div className="bg-gradient-to-br from-cyan-50 via-sky-50 to-indigo-50 border-2 border-cyan-200 rounded-2xl p-4 shadow-xs flex items-center justify-between">
          <div>
            <div className="text-[11px] font-black uppercase text-cyan-800">
              Tổng Xét Nghiệm Định Lượng
            </div>
            <div className="text-2xl font-black text-indigo-950 mt-1">
              {overviewMetrics.totalTests}{" "}
              <span className="text-xs font-bold text-sky-700">xét nghiệm</span>
            </div>
            <div className="text-[11px] text-sky-900 mt-0.5 font-semibold">
              Đã khóa Range Lab:{" "}
              <b className="text-emerald-700">
                {overviewMetrics.lockedLabCount}
              </b>{" "}
              · Chờ chốt (≥20đ):{" "}
              <b className="text-fuchsia-700">{overviewMetrics.ready20Count}</b>
            </div>
          </div>
          <div className="w-11 h-11 rounded-2xl bg-white border-2 border-cyan-300 text-cyan-700 shadow-[0_0_12px_rgba(34,211,238,0.3)] flex items-center justify-center font-black">
            📐
          </div>
        </div>

        <div className="bg-gradient-to-br from-fuchsia-50 via-purple-50 to-indigo-50 border-2 border-fuchsia-200 rounded-2xl p-4 shadow-xs flex items-center justify-between">
          <div>
            <div className="text-[11px] font-black uppercase text-fuchsia-800">
              Độ Chệch Ngoại Kiểm (Bias% EQA)
            </div>
            <div className="text-2xl font-black text-purple-950 mt-1">
              {overviewMetrics.hasEqaBiasCount} / {overviewMetrics.totalTests}{" "}
              <span className="text-xs font-bold text-purple-700">đã nhập</span>
            </div>
            <div className="text-[11px] text-purple-900 mt-0.5 font-semibold">
              Mặc định <b>0.00% (Chưa nhập)</b>:{" "}
              <b className="text-rose-600">
                {overviewMetrics.missingBiasCount}
              </b>{" "}
              test
            </div>
          </div>
          <div className="w-11 h-11 rounded-2xl bg-white border-2 border-fuchsia-300 text-fuchsia-700 shadow-[0_0_12px_rgba(232,121,249,0.3)] flex items-center justify-center font-black">
            🎯
          </div>
        </div>

        <div className="bg-gradient-to-br from-emerald-50 via-teal-50 to-cyan-50 border-2 border-emerald-200 rounded-2xl p-4 shadow-xs flex items-center justify-between">
          <div>
            <div className="text-[11px] font-black uppercase text-emerald-800">
              Đạt Chuẩn Six Sigma (≥ 4.0σ)
            </div>
            <div className="text-2xl font-black text-emerald-950 mt-1">
              {overviewMetrics.highSigmaCount}{" "}
              <span className="text-xs font-bold text-teal-700">
                xét nghiệm
              </span>
            </div>
            <div className="text-[11px] text-teal-900 mt-0.5 font-semibold">
              Tự động gợi ý luật & tần suất N, R (SOP 5.2.4)
            </div>
          </div>
          <div className="w-11 h-11 rounded-2xl bg-white border-2 border-emerald-300 text-emerald-700 shadow-[0_0_12px_rgba(52,211,153,0.35)] flex items-center justify-center font-black">
            6σ
          </div>
        </div>

        <div className="bg-gradient-to-br from-indigo-600 via-violet-600 to-fuchsia-600 text-white rounded-2xl p-4 shadow-md flex flex-col justify-between border-2 border-indigo-300">
          <div className="text-[11px] font-black uppercase text-cyan-200">
            ⚡ Cập Nhật Định Kỳ 3 Tháng (Có Lưu Vết)
          </div>
          <div className="text-[11px] text-white/95 leading-snug mt-1 font-medium">
            Nhập <b>%Bias EQA</b> (chọn nguồn Peer/Method/All) & <b>%TEa</b>{" "}
            ngay trên bảng. Hệ thống tự động lưu vào <b>📖 Sổ lịch sử quý</b>.
          </div>
          {overviewMetrics.dirtyRowsCount > 0 && (
            <button
              type="button"
              disabled={isSavingAllInline}
              onClick={handleSaveAllDirtyInlineRows}
              className="mt-2 w-full py-1.5 rounded-xl bg-amber-300 hover:bg-amber-200 text-indigo-950 font-black text-xs shadow-sm transition"
            >
              {isSavingAllInline
                ? "⏳ Đang lưu đồng bộ..."
                : `💾 Lưu tất cả (${overviewMetrics.dirtyRowsCount} dòng vừa sửa)`}
            </button>
          )}
        </div>
      </div>

      {/* BANNER THÔNG BÁO KHI LƯU THÀNH CÔNG */}
      {saveSuccessBanner && (
        <div className="bg-gradient-to-r from-emerald-50 via-teal-50 to-cyan-50 border-2 border-emerald-400 text-emerald-950 rounded-2xl px-4 py-2.5 text-xs font-black flex items-center justify-between shadow-sm">
          <span>{saveSuccessBanner}</span>
          <button
            type="button"
            onClick={() => setSaveSuccessBanner("")}
            className="text-emerald-700 hover:text-emerald-950 font-bold"
          >
            ✕
          </button>
        </div>
      )}

      {/* =================================================================== */}
      {/* HÀNG 2: THANH BỘ LỌC & CHỌN CHẾ ĐỘ HIỂN THỊ (PASTEL PILLS)          */}
      {/* =================================================================== */}
      <div className="bg-gradient-to-r from-white via-indigo-50/35 to-fuchsia-50/35 border-2 border-indigo-100 rounded-2xl p-4 shadow-xs space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-indigo-100 pb-3">
          <div className="flex flex-wrap items-center gap-1.5">
            {(
              [
                {
                  id: "ALL_IN_ONE",
                  label:
                    "1. 📋 Bảng Tổng Hợp Toàn Diện (Range + MU + Sigma + BM.08)",
                },
                {
                  id: "RANGE_ESTABLISH",
                  label:
                    "2. 📐 Thiết Lập & Khóa Dải Mean ± SD Nội Bộ (≥ 20 điểm)",
                },
                {
                  id: "BM04_07_08_SIGMA",
                  label:
                    "3. 🎯 Chuyên Sâu MU (BM.01/02), Six Sigma (BM.07) & Luật BM.05/06",
                },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setSubView(tab.id)}
                className={`px-3.5 py-2 rounded-xl text-xs font-black transition ${
                  subView === tab.id
                    ? "bg-gradient-to-r from-indigo-600 via-violet-600 to-fuchsia-600 text-white shadow-sm"
                    : "bg-indigo-50/80 text-indigo-900 hover:bg-indigo-100 border border-indigo-200/70"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-3 text-xs">
            <label className="inline-flex items-center gap-1.5 cursor-pointer font-bold text-indigo-950 bg-white px-2.5 py-1 rounded-xl border border-indigo-200">
              <input
                type="checkbox"
                checked={excludeOutliers3SD}
                onChange={(e) => setExcludeOutliers3SD(e.target.checked)}
                className="rounded accent-fuchsia-600"
              />
              <span>Lọc bỏ điểm ngoại lai (|Z| ≥ 3SD & FAIL)</span>
            </label>
            <label className="inline-flex items-center gap-1.5 cursor-pointer font-bold text-teal-950 bg-white px-2.5 py-1 rounded-xl border border-teal-200">
              <input
                type="checkbox"
                checked={onlyCurrentLot}
                onChange={(e) => setOnlyCurrentLot(e.target.checked)}
                className="rounded accent-teal-600"
              />
              <span>Chỉ tính điểm thuộc Lot hiện hành</span>
            </label>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2.5 text-xs">
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={selSection}
              onChange={(e) => {
                setSelSection(e.target.value);
                setSelMachine("ALL");
              }}
              className="bg-white border-2 border-indigo-200 rounded-xl px-3 py-1.5 font-black text-indigo-950 outline-none focus:border-violet-500"
            >
              <option value="ALL">Tất cả Lab chuyên môn</option>
              {safeSections.map((s) => (
                <option key={s} value={s}>
                  Lab: {s}
                </option>
              ))}
            </select>

            <select
              value={selMachine}
              onChange={(e) => setSelMachine(e.target.value)}
              className="bg-white border-2 border-cyan-200 rounded-xl px-3 py-1.5 font-black text-cyan-950 outline-none focus:border-cyan-500"
            >
              <option value="ALL">Tất cả Thiết bị</option>
              {availableMachines.map((m) => (
                <option key={m} value={m}>
                  Máy: {m}
                </option>
              ))}
            </select>

            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="🔍 Tìm tên xét nghiệm, hóa chất, số lô..."
              className="w-64 bg-white border-2 border-fuchsia-200 focus:border-fuchsia-500 rounded-xl px-3 py-1.5 font-bold text-indigo-950 outline-none"
            />
          </div>

          {overviewMetrics.dirtyRowsCount > 0 && (
            <button
              type="button"
              disabled={isSavingAllInline}
              onClick={handleSaveAllDirtyInlineRows}
              className="px-4 py-1.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:brightness-105 text-white font-black text-xs shadow-sm"
            >
              💾 Lưu Tất Cả ({overviewMetrics.dirtyRowsCount} xét nghiệm vừa
              sửa)
            </button>
          )}
        </div>
      </div>

      {/* =================================================================== */}
      {/* HÀNG 3: BẢNG CHÍNH — TÔNG MÀU PASTEL & NEON SÁNG RÕ, DỄ THEO DÕI   */}
      {/* =================================================================== */}
      <div className="bg-white border-2 border-indigo-200 rounded-2xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-gradient-to-r from-indigo-600 via-violet-600 to-purple-600 text-white uppercase text-[10.5px] font-black">
                <th className="py-3.5 px-3 border-r border-indigo-400/40">
                  Xét nghiệm · Thiết bị · Nguồn Range
                </th>
                <th className="py-3.5 px-2.5 text-center border-r border-indigo-400/40">
                  Mức (N)
                </th>
                {subView !== "BM04_07_08_SIGMA" && (
                  <>
                    <th className="py-3.5 px-2.5 text-right border-r border-indigo-400/40 bg-sky-600/35">
                      Range Hãng SX Gốc
                    </th>
                    <th className="py-3.5 px-2.5 text-right border-r border-indigo-400/40 bg-violet-800/50 text-amber-200">
                      Range Đang Áp Dụng
                    </th>
                  </>
                )}
                <th className="py-3.5 px-2.5 text-right border-r border-indigo-400/40 bg-teal-600/35 text-cyan-100">
                  Mean ± SD Thực Tế Lab
                </th>
                <th className="py-3.5 px-3 border-r border-indigo-400/40 bg-fuchsia-700/45 text-amber-100">
                  CV% · Bias% (Nguồn SOP 5.2.3) & Cập Nhật Định Kỳ 3 Tháng
                </th>
                {subView !== "RANGE_ESTABLISH" && (
                  <>
                    <th className="py-3.5 px-2.5 text-right border-r border-indigo-400/40 bg-indigo-700/40">
                      Độ KĐBĐ Mở Rộng Ue (BM.01/02)
                    </th>
                    <th className="py-3.5 px-3 border-r border-indigo-400/40 bg-emerald-700/35 text-emerald-100">
                      Six Sigma (BM.07) · Luật & Tần Suất (SOP 5.2.4)
                    </th>
                  </>
                )}
                <th className="py-3.5 px-3 text-right">Thao tác Chốt Range</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-indigo-100">
              {filteredQuantitativeTests.length === 0 ? (
                <tr>
                  <td
                    colSpan={9}
                    className="py-10 text-center text-indigo-400 font-semibold italic"
                  >
                    Không có xét nghiệm định lượng nào khớp với bộ lọc hiện tại.
                  </td>
                </tr>
              ) : (
                filteredQuantitativeTests.map((test) => {
                  const liveTestCfg = getLivePreviewTestConfig(test);
                  const lvList: ("L1" | "L2" | "L3")[] =
                    test.levels_count === 3
                      ? ["L1", "L2", "L3"]
                      : test.levels_count === 2
                      ? ["L1", "L2"]
                      : ["L1"];

                  const rawCounts = lvList.map((lv) => {
                    const arr =
                      lv === "L1"
                        ? liveTestCfg.history_L1 || []
                        : lv === "L2"
                        ? liveTestCfg.history_L2 || []
                        : liveTestCfg.history_L3 || [];
                    const { lotNumber: lvLot } =
                      getLevelControlAndLotFromConfig(liveTestCfg, lv);
                    return onlyCurrentLot
                      ? arr.filter(
                          (p) =>
                            !p.lot_number ||
                            p.lot_number === lvLot ||
                            p.lot_number === test.lot_number
                        ).length
                      : arr.length;
                  });
                  const maxRawAcrossLv = Math.max(0, ...rawCounts);

                  const draft = inlineDrafts[test.test_id] || {
                    biasL1Str: "",
                    biasL2Str: "",
                    biasL3Str: "",
                    teaStr: String(getEffectiveTeaFromConfig(test)),
                    biasSource: getBiasSourceFromConfig(test),
                    periodLabel: defaultPeriodLabel,
                    dirty: false,
                  };

                  const isRowSaving = savingRowId === test.test_id;
                  const auditHistoryList = getMuAuditLogFromConfig(test);

                  // Kiểm tra xem xét nghiệm có dùng nhiều lọ Hóa chất / Số Lô riêng theo mức không
                  const levelLotMetas = lvList.map((lv) => ({
                    lv,
                    ...getLevelControlAndLotFromConfig(test, lv),
                  }));
                  const uniqueCtrlLots = new Set(
                    levelLotMetas.map(
                      (m) =>
                        `${m.controlName.trim().toUpperCase()}__${m.lotNumber
                          .trim()
                          .toUpperCase()}`
                    )
                  );
                  const isMultiControlLots = uniqueCtrlLots.size > 1;

                  return lvList.map((lv, lvIdx) => {
                    const stats = computeDetailedLevelMetrics(
                      liveTestCfg,
                      lv,
                      excludeOutliers3SD,
                      onlyCurrentLot,
                      maxRawAcrossLv
                    );

                    const biasFieldKey =
                      lv === "L1"
                        ? "biasL1Str"
                        : lv === "L2"
                        ? "biasL2Str"
                        : "biasL3Str";
                    const currentLevelBiasDraft = draft[biasFieldKey];

                    const rangeSourceBadge =
                      test.range_source === "LAB_OFFICIAL" ? (
                        <span className="px-2 py-0.5 rounded-full text-[9.5px] font-black uppercase bg-emerald-100 text-emerald-900 border border-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.3)]">
                          ✓ Range Phòng ({test.range_active_days || 1} ngày)
                        </span>
                      ) : test.range_source === "LAB_TEMP" ? (
                        <span className="px-2 py-0.5 rounded-full text-[9.5px] font-black uppercase bg-violet-100 text-violet-900 border border-violet-400 shadow-[0_0_8px_rgba(167,139,250,0.3)]">
                          ⏳ Range Tạm ({test.range_active_days || 1} ngày)
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded-full text-[9.5px] font-black uppercase bg-amber-100 text-amber-900 border border-amber-400">
                          🏭 Range Hãng SX
                        </span>
                      );

                    return (
                      <tr
                        key={`${test.test_id}-${lv}`}
                        className={`transition ${
                          draft.dirty
                            ? "bg-amber-50/70"
                            : lvIdx === 0
                            ? "bg-white hover:bg-cyan-50/35"
                            : "bg-indigo-50/20 hover:bg-cyan-50/35"
                        }`}
                      >
                        {/* CỘT 1: TÊN XÉT NGHIỆM, THIẾT BỊ, CÁC LỌ QC ĐA MỨC & NGUỒN RANGE */}
                        {lvIdx === 0 && (
                          <td
                            rowSpan={lvList.length}
                            className="py-3 px-3 align-top border-r border-indigo-100 bg-gradient-to-b from-white to-indigo-50/25"
                          >
                            <div className="font-black text-indigo-950 text-sm">
                              {test.test_name}{" "}
                              <span className="text-xs font-bold text-violet-600">
                                ({test.unit})
                              </span>
                            </div>
                            <div className="text-[11px] font-black text-sky-700 mt-0.5">
                              {test.machine_name}
                            </div>

                            {isMultiControlLots ? (
                              <div className="mt-1 flex flex-col gap-1">
                                {levelLotMetas.map((m) => (
                                  <span
                                    key={m.lv}
                                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md border text-[10px] font-bold w-fit ${
                                      m.lv === "L1"
                                        ? "bg-cyan-50 text-cyan-900 border-cyan-300"
                                        : m.lv === "L2"
                                        ? "bg-fuchsia-50 text-fuchsia-900 border-fuchsia-300"
                                        : "bg-amber-50 text-amber-900 border-amber-300"
                                    }`}
                                  >
                                    <b className="uppercase">{m.lv}:</b>{" "}
                                    <span>{m.controlName}</span> ·{" "}
                                    <span className="font-mono">
                                      Lô: {m.lotNumber}
                                    </span>
                                  </span>
                                ))}
                              </div>
                            ) : (
                              <div className="mt-1 inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-indigo-50 border border-indigo-200 text-[10.5px] font-bold text-indigo-900">
                                <span>{test.control_name}</span> ·{" "}
                                <span className="font-mono text-violet-800">
                                  Lô: {test.lot_number}
                                </span>
                              </div>
                            )}

                            <div className="mt-1.5 flex flex-wrap items-center gap-1">
                              {rangeSourceBadge}
                              {test.range_applied_date && (
                                <span className="text-[9.5px] text-indigo-600 font-mono font-bold">
                                  ({formatShortDM(test.range_applied_date)})
                                </span>
                              )}
                            </div>
                          </td>
                        )}

                        {/* CỘT 2: MỨC QC (NEON BADGE) & SỐ ĐIỂM HỢP LỆ N */}
                        <td className="py-2.5 px-2.5 text-center font-mono whitespace-nowrap border-r border-indigo-100">
                          <span
                            className={`px-2.5 py-0.5 rounded-lg font-black text-[11px] border ${
                              lv === "L1"
                                ? "bg-cyan-100 text-cyan-900 border-cyan-400 shadow-[0_0_8px_rgba(34,211,238,0.3)]"
                                : lv === "L2"
                                ? "bg-fuchsia-100 text-fuchsia-900 border-fuchsia-400 shadow-[0_0_8px_rgba(232,121,249,0.3)]"
                                : "bg-amber-100 text-amber-900 border-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.3)]"
                            }`}
                          >
                            {lv}
                          </span>
                          <div
                            className={`text-[10.5px] font-black mt-1 ${
                              stats.cleanCount >= 20
                                ? "text-emerald-700"
                                : "text-indigo-800"
                            }`}
                          >
                            n = {stats.cleanCount}
                            {stats.outlierCount > 0 && (
                              <span
                                className="text-rose-600 ml-0.5"
                                title={`Đã lọc bỏ ${stats.outlierCount} điểm ngoại lai |Z| >= 3SD`}
                              >
                                (-{stats.outlierCount})
                              </span>
                            )}
                          </div>
                          {stats.missingDaysVsMaxLevel > 0 && (
                            <div
                              className="text-[9px] font-sans text-amber-700 font-bold"
                              title={`Mức ${lv} ít hơn mức khác ${stats.missingDaysVsMaxLevel} lượt chạy trong lô này`}
                            >
                              Thiếu {stats.missingDaysVsMaxLevel} lượt
                            </div>
                          )}
                        </td>

                        {/* CỘT 3 & 4: RANGE HÃNG SX GỐC & RANGE ĐANG ÁP DỤNG (PASTEL TINTS) */}
                        {subView !== "BM04_07_08_SIGMA" && (
                          <>
                            <td className="py-2.5 px-2.5 text-right font-mono whitespace-nowrap bg-sky-50/40 border-r border-indigo-100">
                              <div className="font-black text-sky-950">
                                {stats.mfgMean} ± {stats.mfgSd}
                              </div>
                              <div className="text-[10px] font-bold text-sky-700">
                                CV Hãng:{" "}
                                {stats.mfgMean > 0
                                  ? (
                                      (stats.mfgSd / stats.mfgMean) *
                                      100
                                    ).toFixed(2)
                                  : "0.00"}
                                %
                              </div>
                            </td>

                            <td className="py-2.5 px-2.5 text-right font-mono whitespace-nowrap bg-violet-50/55 border-r border-indigo-100">
                              <div className="font-black text-violet-950">
                                {stats.targetMean} ± {stats.targetSd}
                              </div>
                              <div className="text-[10px] font-black text-fuchsia-700">
                                CV Đích: {stats.targetCv.toFixed(2)}%
                              </div>
                            </td>
                          </>
                        )}

                        {/* CỘT 5: MEAN ± SD THỰC TẾ TÍCH LŨY TẠI LAB */}
                        <td className="py-2.5 px-2.5 text-right font-mono whitespace-nowrap bg-cyan-50/40 border-r border-indigo-100">
                          {stats.actualMean !== null &&
                          stats.actualSd !== null ? (
                            <>
                              <div className="font-black text-teal-950">
                                {stats.actualMean} ± {stats.actualSd}
                              </div>
                              <div className="text-[10px] font-black text-emerald-700">
                                CV Thực tế: {stats.actualCv?.toFixed(2)}%
                              </div>
                              {!stats.isMeanWithinMfg2SD && (
                                <div
                                  className={`text-[9px] font-sans font-black ${
                                    stats.isMeanWithinMfg3SD
                                      ? "text-amber-700"
                                      : "text-rose-600"
                                  }`}
                                  title="Kiểm tra Mean thực tế so với khoảng chấp nhận của NSX (SOP 5.2.2)"
                                >
                                  {stats.isMeanWithinMfg3SD
                                    ? "⚠️ Lệch >2SD Hãng"
                                    : "🚨 Vượt >3SD Hãng"}
                                </div>
                              )}
                            </>
                          ) : (
                            <span className="text-indigo-400 font-semibold italic text-[11px]">
                              Chưa đủ điểm
                            </span>
                          )}
                        </td>

                        {/* CỘT 6: CV% · BIAS% (NGUỒN) & Ô NHẬP NHANH BIAS% EQA + TEa% + SỔ LỊCH SỬ */}
                        <td className="py-2.5 px-3 bg-fuchsia-50/35 border-r border-indigo-100">
                          <div className="flex flex-wrap items-center justify-between gap-1 font-mono text-[11px]">
                            <span>
                              <span className="font-bold text-indigo-900">
                                CV:
                              </span>{" "}
                              <b className="text-cyan-800">
                                {stats.actualCv !== null
                                  ? `${stats.actualCv.toFixed(2)}%`
                                  : `${stats.targetCv.toFixed(2)}%`}
                              </b>
                            </span>
                            <span className="text-indigo-300">·</span>
                            <span>
                              <span className="font-bold text-indigo-900">
                                Bias:
                              </span>{" "}
                              <b
                                className={
                                  stats.hasExplicitBias
                                    ? "text-fuchsia-800"
                                    : "text-indigo-800"
                                }
                              >
                                {stats.biasPercent.toFixed(2)}%
                              </b>{" "}
                              <span
                                className={`text-[10px] px-1.5 py-0.5 rounded-md font-sans font-black border ${
                                  stats.hasExplicitBias
                                    ? "bg-fuchsia-100 text-fuchsia-900 border-fuchsia-300"
                                    : "bg-amber-50 text-amber-800 border-amber-300"
                                }`}
                              >
                                ({stats.biasSourceLabel})
                              </span>
                            </span>
                          </div>

                          <div className="mt-1.5 pt-1 border-t border-fuchsia-200/70 flex flex-wrap items-center gap-1.5">
                            <div className="flex items-center gap-1 bg-white border-2 border-fuchsia-300 focus-within:border-fuchsia-500 rounded-lg px-2 py-0.5 shadow-2xs">
                              <span className="text-[10px] font-black text-fuchsia-900 whitespace-nowrap">
                                Bias {lv}%:
                              </span>
                              <input
                                type="text"
                                inputMode="decimal"
                                value={currentLevelBiasDraft}
                                placeholder="0.00% (Chưa nhập)"
                                onChange={(e) =>
                                  handleInlineFieldChange(
                                    test.test_id,
                                    biasFieldKey,
                                    e.target.value
                                  )
                                }
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") {
                                    e.preventDefault();
                                    handleSaveSingleRowBiasAndTea(test);
                                  }
                                }}
                                className="w-24 font-mono font-black text-xs text-right text-indigo-950 outline-none bg-transparent placeholder:text-indigo-300"
                              />
                            </div>

                            {lvIdx === 0 && (
                              <>
                                <select
                                  value={draft.biasSource}
                                  onChange={(e) =>
                                    handleInlineFieldChange(
                                      test.test_id,
                                      "biasSource",
                                      e.target.value
                                    )
                                  }
                                  title="Chọn nguồn Bias theo thứ tự ưu tiên SOP 5.2.3"
                                  className="bg-white border-2 border-indigo-200 rounded-lg px-1.5 py-0.5 text-[10px] font-black text-indigo-900 outline-none"
                                >
                                  <option value="PEER_GROUP">
                                    1. Peer Group
                                  </option>
                                  <option value="METHOD">2. Method</option>
                                  <option value="ALL_RESULTS">
                                    3. All EQA
                                  </option>
                                  <option value="MFG_REF">4. NSX Ref</option>
                                  <option value="VERIFICATION">
                                    Thẩm định
                                  </option>
                                </select>

                                <div className="flex items-center gap-1 bg-white border-2 border-cyan-300 focus-within:border-cyan-500 rounded-lg px-2 py-0.5 shadow-2xs">
                                  <span className="text-[10px] font-black text-cyan-900 whitespace-nowrap">
                                    TEa
                                    {stats.teaUnit === "ABSOLUTE"
                                      ? ` (${test.unit})`
                                      : "%"}
                                    :
                                  </span>
                                  <input
                                    type="text"
                                    inputMode="decimal"
                                    value={draft.teaStr}
                                    placeholder="CLIA%"
                                    onChange={(e) =>
                                      handleInlineFieldChange(
                                        test.test_id,
                                        "teaStr",
                                        e.target.value
                                      )
                                    }
                                    onKeyDown={(e) => {
                                      if (e.key === "Enter") {
                                        e.preventDefault();
                                        handleSaveSingleRowBiasAndTea(test);
                                      }
                                    }}
                                    className="w-11 font-mono font-black text-xs text-right text-cyan-950 outline-none bg-transparent"
                                  />
                                </div>
                              </>
                            )}

                            <button
                              type="button"
                              disabled={isRowSaving}
                              onClick={() =>
                                handleSaveSingleRowBiasAndTea(test)
                              }
                              className={`px-2.5 py-0.5 rounded-lg font-black text-[10px] transition ${
                                draft.dirty
                                  ? "bg-gradient-to-r from-emerald-500 to-teal-500 hover:brightness-105 text-white shadow-xs"
                                  : "bg-indigo-100 hover:bg-indigo-200 text-indigo-900 border border-indigo-200"
                              }`}
                              title="Lưu %Bias Ngoại kiểm và %TEa kèm ghi vào Sổ lịch sử định kỳ 3 tháng"
                            >
                              {isRowSaving ? "..." : "✓ Lưu"}
                            </button>

                            {lvIdx === 0 && (
                              <button
                                type="button"
                                onClick={() =>
                                  setHistoryModalTestId(test.test_id)
                                }
                                className="px-2 py-0.5 rounded-lg bg-violet-100 hover:bg-violet-200 text-violet-900 border border-violet-300 font-black text-[10px] transition"
                                title="Xem Sổ lịch sử cập nhật Bias% & TEa% qua các kỳ 3 tháng"
                              >
                                📖 Lịch sử ({auditHistoryList.length})
                              </button>
                            )}
                          </div>
                        </td>

                        {/* CỘT 7 & 8: ĐỘ KHÔNG ĐẢM BẢO ĐO (BM.01/02) & SIX SIGMA / LUẬT & TẦN SUẤT */}
                        {subView !== "RANGE_ESTABLISH" && (
                          <>
                            <td className="py-2.5 px-2.5 text-right font-mono whitespace-nowrap bg-indigo-50/30 border-r border-indigo-100">
                              {stats.uExpanded !== null &&
                              stats.uRelExpanded !== null ? (
                                <>
                                  <div className="font-black text-indigo-950">
                                    ±
                                    {formatSmartDecimal(
                                      stats.uExpanded,
                                      stats.targetSd
                                    )}{" "}
                                    {test.unit}{" "}
                                    <span className="text-fuchsia-700">
                                      ({stats.uRelExpanded.toFixed(2)}%)
                                    </span>
                                  </div>
                                  <div className="text-[9.5px] font-bold text-indigo-700">
                                    uRw: {stats.uRw}% · uBias: {stats.uBias}%{" "}
                                    {stats.isPassMu !== null && (
                                      <b
                                        className={`px-1 py-0.2 rounded ${
                                          stats.isPassMu
                                            ? "bg-emerald-100 text-emerald-800"
                                            : "bg-rose-100 text-rose-700"
                                        }`}
                                      >
                                        [{stats.isPassMu ? "Đạt" : "KĐ"}]
                                      </b>
                                    )}
                                  </div>
                                </>
                              ) : (
                                <span className="text-indigo-300">—</span>
                              )}
                            </td>

                            <td className="py-2.5 px-3 bg-emerald-50/25 border-r border-indigo-100">
                              {stats.sigma !== null ? (
                                <div className="space-y-0.5">
                                  <div className="flex items-center gap-1.5 flex-wrap">
                                    <span
                                      className={`px-2 py-0.5 rounded-lg font-mono font-black text-[11px] border ${
                                        stats.sigma >= 6
                                          ? "bg-emerald-400 text-emerald-950 border-emerald-500 shadow-[0_0_10px_rgba(52,211,153,0.45)]"
                                          : stats.sigma >= 4
                                          ? "bg-cyan-100 text-cyan-950 border-cyan-400 shadow-[0_0_8px_rgba(34,211,238,0.3)]"
                                          : stats.sigma >= 3
                                          ? "bg-amber-100 text-amber-950 border-amber-400"
                                          : "bg-rose-100 text-rose-900 border-rose-400"
                                      }`}
                                    >
                                      {stats.sigma.toFixed(2)}σ
                                    </span>
                                    <span className="text-[10px] font-black text-teal-800">
                                      (TEa: {stats.teaPercent}
                                      {stats.teaUnit === "ABSOLUTE"
                                        ? ` ${test.unit}`
                                        : "%"}
                                      )
                                    </span>
                                  </div>
                                  <div className="text-[10.5px] font-black text-indigo-950">
                                    Luật: {stats.recommendedRuleText}
                                  </div>
                                  <div className="text-[9.5px] font-bold text-violet-700">
                                    Tần suất: {stats.frequencyText}
                                  </div>
                                </div>
                              ) : (
                                <span className="text-indigo-400 italic text-[11px]">
                                  Chưa đủ dữ liệu tính σ
                                </span>
                              )}
                            </td>
                          </>
                        )}

                        {/* CỘT 9: THAO TÁC CHỐT RANGE NỘI BỘ LAB HOẶC KHÔI PHỤC RANGE HÃNG */}
                        {lvIdx === 0 && (
                          <td
                            rowSpan={lvList.length}
                            className="py-3 px-3 align-middle text-right bg-gradient-to-b from-white to-indigo-50/25 whitespace-nowrap"
                          >
                            <div className="flex flex-col items-end gap-1.5">
                              <button
                                type="button"
                                onClick={() => handleOpenLockRangeModal(test)}
                                className={`px-3 py-1.5 rounded-xl font-black text-[11px] shadow-xs transition ${
                                  stats.cleanCount >= 20
                                    ? "bg-gradient-to-r from-emerald-500 via-teal-500 to-cyan-500 hover:brightness-105 text-white shadow-[0_0_10px_rgba(20,184,166,0.35)]"
                                    : "bg-gradient-to-r from-indigo-50 to-fuchsia-50 hover:from-indigo-100 hover:to-fuchsia-100 text-indigo-950 border-2 border-indigo-200"
                                }`}
                              >
                                {stats.cleanCount >= 20
                                  ? "🔒 Chốt Range Lab (≥20đ)"
                                  : "📐 Tính & Tạm chốt Range"}
                              </button>

                              {test.range_source !== "MANUFACTURER" && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    handleRevertToManufacturerRange(test)
                                  }
                                  className="px-2.5 py-1 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 font-bold text-[10.5px] transition"
                                >
                                  ↺ Về Range Hãng
                                </button>
                              )}
                            </div>
                          </td>
                        )}
                      </tr>
                    );
                  });
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* =================================================================== */}
      {/* MODAL 1: XÁC NHẬN CHỐT / KHÓA DẢI MEAN ± SD NỘI BỘ (SOP 5.2.2)      */}
      {/* =================================================================== */}
      {lockingTestModal && (
        <div className="fixed inset-0 bg-indigo-950/55 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white border-2 border-violet-300 rounded-3xl w-full max-w-2xl p-6 shadow-2xl space-y-4 max-h-[92vh] overflow-y-auto">
            <div className="flex items-start justify-between border-b border-indigo-100 pb-3">
              <div>
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase bg-gradient-to-r from-emerald-500 to-teal-500 text-white">
                  Thiết lập Dải Kiểm Soát Nội Bộ Phòng Xét Nghiệm (SOP 5.2.2 ·
                  BM.03 & BM.04)
                </span>
                <h3 className="text-base font-black text-indigo-950 mt-1">
                  {lockingTestModal.test.test_name} (
                  {lockingTestModal.test.unit}) —{" "}
                  {lockingTestModal.test.machine_name}
                </h3>
                <p className="text-xs text-indigo-700 mt-0.5 font-medium">
                  Giá trị Mean mới được đối chiếu tự động với khoảng chấp nhận
                  của NSX. Range Hãng gốc được sao lưu an toàn.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setLockingTestModal(null)}
                className="px-3 py-1 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-800 font-bold text-xs"
              >
                ✕ Đóng
              </button>
            </div>

            <div className="overflow-x-auto border-2 border-indigo-100 rounded-2xl">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-gradient-to-r from-indigo-600 via-violet-600 to-purple-600 text-white uppercase text-[10.5px]">
                    <th className="py-2.5 px-3">Mức QC · Lọ / Số Lô</th>
                    <th className="py-2.5 px-3 text-center">Số điểm hợp lệ</th>
                    <th className="py-2.5 px-3 text-right">
                      Khoảng NSX (±2SD)
                    </th>
                    <th className="py-2.5 px-3 text-right bg-emerald-600/40">
                      Range Thực Tế Mới Sẽ Chốt
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-indigo-100 font-mono">
                  {(
                    [
                      lockingTestModal.l1Stats,
                      lockingTestModal.l2Stats,
                      lockingTestModal.l3Stats,
                    ].filter(Boolean) as ComputedLevelStats[]
                  ).map((st) => {
                    const nextMean = st.actualMean ?? st.targetMean;
                    const nextSd =
                      lockingTestModal.sdMethod === "POOLED_CV_SD"
                        ? st.proposedSdByPooledCv || st.actualSd || st.targetSd
                        : lockingTestModal.sdMethod === "MAX_CV_SD"
                        ? st.proposedSdByMaxCv || st.actualSd || st.targetSd
                        : st.actualSd ?? st.targetSd;
                    const nextCv =
                      lockingTestModal.sdMethod === "POOLED_CV_SD"
                        ? st.pooledCvPct
                        : lockingTestModal.sdMethod === "MAX_CV_SD"
                        ? st.maxHistoricalCvPct
                        : st.actualCv ?? st.targetCv;

                    const mfgLow = roundSmartDecimal(
                      st.mfgMean - 2 * st.mfgSd,
                      st.mfgSd
                    );
                    const mfgHigh = roundSmartDecimal(
                      st.mfgMean + 2 * st.mfgSd,
                      st.mfgSd
                    );

                    return (
                      <tr key={st.level}>
                        <td className="py-2.5 px-3">
                          <span className="font-black text-indigo-950">
                            {st.level}
                          </span>
                          <div className="text-[10px] font-sans font-bold text-violet-700">
                            {st.levelControlName} (Lô: {st.levelLotNumber})
                          </div>
                        </td>
                        <td className="py-2.5 px-3 text-center font-bold text-indigo-900">
                          n = {st.cleanCount}{" "}
                          {st.outlierCount > 0 &&
                            `(Đã lọc ${st.outlierCount} ngoại lai)`}
                        </td>
                        <td className="py-2.5 px-3 text-right text-sky-900">
                          <div>
                            {st.mfgMean} ± {st.mfgSd} ({mfgLow} – {mfgHigh})
                          </div>
                          <div
                            className={`text-[10px] font-sans font-black ${
                              st.isMeanWithinMfg2SD
                                ? "text-emerald-700"
                                : "text-amber-700"
                            }`}
                          >
                            {st.isMeanWithinMfg2SD
                              ? "✓ Nằm trong khoảng NSX"
                              : "⚠️ Lệch ngoài ±2SD NSX"}
                          </div>
                        </td>
                        <td className="py-2.5 px-3 text-right font-black text-emerald-900 bg-emerald-50/70">
                          {nextMean} ± {nextSd} (CV: {nextCv}%)
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs">
              <div className="bg-indigo-50/60 border border-indigo-200 rounded-2xl p-3 space-y-1.5">
                <div className="font-black text-indigo-950">
                  Phương pháp tính SD áp dụng (SOP 5.2.2 & BM.03):
                </div>
                <label className="flex items-center gap-1.5 cursor-pointer font-bold text-indigo-900">
                  <input
                    type="radio"
                    name="sdMethodRadio"
                    checked={lockingTestModal.sdMethod === "ACTUAL_LOT_SD"}
                    onChange={() =>
                      setLockingTestModal((p) =>
                        p ? { ...p, sdMethod: "ACTUAL_LOT_SD" } : null
                      )
                    }
                    className="accent-indigo-600"
                  />
                  <span>1. SD thực tế của Lô hiện tại (≥20 điểm)</span>
                </label>
                <label className="flex items-center gap-1.5 cursor-pointer font-bold text-purple-900">
                  <input
                    type="radio"
                    name="sdMethodRadio"
                    checked={lockingTestModal.sdMethod === "POOLED_CV_SD"}
                    onChange={() =>
                      setLockingTestModal((p) =>
                        p ? { ...p, sdMethod: "POOLED_CV_SD" } : null
                      )
                    }
                    className="accent-purple-600"
                  />
                  <span>
                    2. SD tạm từ CV_TB cộng dồn (
                    {lockingTestModal.l1Stats.lotsCountUsed} lô - CLSI C24)
                  </span>
                </label>
                <label className="flex items-center gap-1.5 cursor-pointer font-bold text-fuchsia-900">
                  <input
                    type="radio"
                    name="sdMethodRadio"
                    checked={lockingTestModal.sdMethod === "MAX_CV_SD"}
                    onChange={() =>
                      setLockingTestModal((p) =>
                        p ? { ...p, sdMethod: "MAX_CV_SD" } : null
                      )
                    }
                    className="accent-fuchsia-600"
                  />
                  <span>
                    3. SD tạm từ CV_Max (
                    {lockingTestModal.l1Stats.maxHistoricalCvPct}% - BM.03)
                  </span>
                </label>
              </div>

              <div className="bg-cyan-50/60 border border-cyan-200 rounded-2xl p-3 space-y-2">
                <div className="font-black text-cyan-950">
                  Trạng thái Dải QC & Số ngày đã dùng:
                </div>
                <label className="flex items-center gap-1.5 cursor-pointer font-black text-emerald-900">
                  <input
                    type="radio"
                    name="lockTypeRadio"
                    checked={lockingTestModal.lockType === "LAB_OFFICIAL"}
                    onChange={() =>
                      setLockingTestModal((p) =>
                        p ? { ...p, lockType: "LAB_OFFICIAL" } : null
                      )
                    }
                    className="accent-emerald-600"
                  />
                  <span>✓ Range Chính thức Lab (≥ 20 điểm)</span>
                </label>
                <label className="flex items-center gap-1.5 cursor-pointer font-bold text-indigo-900">
                  <input
                    type="radio"
                    name="lockTypeRadio"
                    checked={lockingTestModal.lockType === "LAB_TEMP"}
                    onChange={() =>
                      setLockingTestModal((p) =>
                        p ? { ...p, lockType: "LAB_TEMP" } : null
                      )
                    }
                    className="accent-indigo-600"
                  />
                  <span>⏳ Range Tạm thời Lab (Song song 3–10 ngày)</span>
                </label>
                <div className="pt-1 border-t border-cyan-200 flex items-center justify-between gap-2">
                  <span className="font-bold text-cyan-950">
                    Số ngày đã dùng Range này:
                  </span>
                  <input
                    type="number"
                    min={1}
                    value={lockingTestModal.activeDaysDraft}
                    onChange={(e) =>
                      setLockingTestModal((p) =>
                        p ? { ...p, activeDaysDraft: e.target.value } : null
                      )
                    }
                    className="w-20 bg-white border-2 border-violet-300 rounded-lg px-2 py-1 font-mono font-black text-right text-violet-950"
                  />
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-indigo-100">
              <button
                type="button"
                onClick={() => setLockingTestModal(null)}
                className="px-4 py-2.5 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-900 font-bold text-xs"
              >
                Hủy bỏ
              </button>
              <button
                type="button"
                disabled={isLockingRange}
                onClick={handleConfirmLockLabRange}
                className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 via-teal-500 to-cyan-500 hover:brightness-105 text-white font-black text-xs shadow-md disabled:opacity-50"
              >
                {isLockingRange
                  ? "⏳ Đang chốt Range..."
                  : "🔒 Xác Nhận Áp Dụng Range Thực Tế Lab"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =================================================================== */}
      {/* MODAL 2: SỔ LƯU VẾT LỊCH SỬ CẬP NHẬT BIAS% & TEa% ĐỊNH KỲ 3 THÁNG  */}
      {/* =================================================================== */}
      {historyModalTest && (
        <div className="fixed inset-0 bg-indigo-950/55 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white border-2 border-fuchsia-300 rounded-3xl w-full max-w-2xl p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-start justify-between border-b border-indigo-100 pb-3">
              <div>
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase bg-gradient-to-r from-indigo-600 to-fuchsia-600 text-white">
                  Sổ Theo Dõi Định Kỳ 3 Tháng — Bias% Ngoại Kiểm & TEa% (SOP
                  5.2.3 · BM.07)
                </span>
                <h3 className="text-base font-black text-indigo-950 mt-1">
                  {historyModalTest.test_name} ({historyModalTest.unit}) —{" "}
                  {historyModalTest.machine_name}
                </h3>
                <p className="text-xs text-indigo-700 mt-0.5 font-medium">
                  Lưu vết tự động mỗi lần cập nhật kết quả Ngoại kiểm (EQA) hoặc
                  công bố lại TEa theo đúng tiêu chuẩn ISO 15189:2022.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setHistoryModalTestId(null)}
                className="px-3 py-1 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-800 font-bold text-xs"
              >
                ✕ Đóng
              </button>
            </div>

            {(() => {
              const logs = getMuAuditLogFromConfig(historyModalTest);
              const curDraft = inlineDrafts[historyModalTest.test_id];
              return (
                <div className="space-y-3 text-xs">
                  {curDraft && (
                    <div className="bg-fuchsia-50/70 border border-fuchsia-200 rounded-2xl p-3 flex flex-wrap items-center justify-between gap-2">
                      <span className="font-black text-fuchsia-950">
                        Nhãn kỳ đánh giá cho lần lưu tiếp theo:
                      </span>
                      <input
                        type="text"
                        value={curDraft.periodLabel}
                        onChange={(e) =>
                          handleInlineFieldChange(
                            historyModalTest.test_id,
                            "periodLabel",
                            e.target.value
                          )
                        }
                        placeholder="VD: Quý 4/2026 - Đợt EQA Tháng 11"
                        className="w-64 bg-white border-2 border-fuchsia-300 rounded-xl px-3 py-1.5 font-bold text-indigo-950 outline-none"
                      />
                    </div>
                  )}

                  <div className="overflow-x-auto border-2 border-indigo-100 rounded-2xl">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="bg-gradient-to-r from-indigo-600 via-violet-600 to-fuchsia-600 text-white uppercase text-[10.5px]">
                          <th className="py-2.5 px-3">
                            Thời điểm · Kỳ đánh giá
                          </th>
                          <th className="py-2.5 px-3">
                            Nguồn Bias (SOP 5.2.3)
                          </th>
                          <th className="py-2.5 px-3 text-right">
                            Thay đổi Bias% (Cũ ➔ Mới)
                          </th>
                          <th className="py-2.5 px-3 text-right">
                            TEa (Cũ ➔ Mới)
                          </th>
                          <th className="py-2.5 px-3">Người cập nhật</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-indigo-100">
                        {logs.length === 0 ? (
                          <tr>
                            <td
                              colSpan={5}
                              className="py-8 text-center text-indigo-400 font-semibold italic"
                            >
                              Chưa có lịch sử cập nhật định kỳ nào. Khi bạn nhập
                              Bias% hoặc TEa% và bấm "✓ Lưu", hệ thống sẽ tự
                              động ghi vết tại đây.
                            </td>
                          </tr>
                        ) : (
                          logs.map((entry, idx) => (
                            <tr
                              key={`${entry.updated_at}-${idx}`}
                              className="even:bg-indigo-50/35"
                            >
                              <td className="py-2.5 px-3">
                                <div className="font-black text-indigo-950">
                                  {entry.period_label}
                                </div>
                                <div className="font-mono text-[10.5px] text-indigo-600">
                                  {entry.updated_at}
                                </div>
                              </td>
                              <td className="py-2.5 px-3 font-bold text-violet-900">
                                {BIAS_SOURCE_LABELS[entry.bias_source] ||
                                  entry.bias_source}
                              </td>
                              <td className="py-2.5 px-3 text-right font-mono">
                                <div>
                                  L1: {entry.old_bias_L1 ?? 0}% ➔{" "}
                                  <b className="text-cyan-800">
                                    {entry.new_bias_L1 ?? 0}%
                                  </b>
                                </div>
                                {historyModalTest.levels_count >= 2 && (
                                  <div>
                                    L2: {entry.old_bias_L2 ?? 0}% ➔{" "}
                                    <b className="text-fuchsia-800">
                                      {entry.new_bias_L2 ?? 0}%
                                    </b>
                                  </div>
                                )}
                                {historyModalTest.levels_count === 3 && (
                                  <div>
                                    L3: {entry.old_bias_L3 ?? 0}% ➔{" "}
                                    <b className="text-amber-800">
                                      {entry.new_bias_L3 ?? 0}%
                                    </b>
                                  </div>
                                )}
                              </td>
                              <td className="py-2.5 px-3 text-right font-mono">
                                {entry.old_tea}% ➔{" "}
                                <b className="text-emerald-700">
                                  {entry.new_tea}%
                                </b>
                              </td>
                              <td className="py-2.5 px-3 font-bold text-indigo-950">
                                {entry.updated_by}
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            })()}
          </div>
        </div>
      )}
    </div>
  );
}
// ================= KẾT THÚC TOÀN BỘ FILE TroLyRangeMU.tsx =================
