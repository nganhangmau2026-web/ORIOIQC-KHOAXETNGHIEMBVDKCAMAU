import React, { useState, useRef, useMemo } from "react";
import {
  TestConfig,
  ReagentLotBM16,
  UserAccount,
  TestCategoryType,
  MuModeType,
  LevelMuConfig,
  LotArchiveItem,
  RangeSourceType,
  getReagentThreshold75,
  isReagentReached75,
  formatDateVN,
  getVnIsoDateString,
  addDaysToIsoDate,
  rpcCall,
  computeMuAndSigma,
  COMMON_TEST_NAMES,
  COMMON_UNITS,
  QUALITATIVE_OPTIONS,
  QualitativeOptionType,
  roundSmartDecimal,
  formatSmartDecimal,
  hasPermission,
  STORAGE_KEYS,
} from "./KieuDuLieu";
import SaoChepThongMinh from "./SaoChepThongMinh";

// ============================================================================
// FILE 5: src/QuanLyDanhMuc.tsx — PHẦN 1/2 (SMART UNITS, DECOUPLED LOTS & LOGIC)
// - Bảo tồn 100% tính năng gốc của QuanLyDanhMuc.tsx.
// - Từ điển Đơn vị Xét nghiệm Thông minh (SI & Conventional) cho Huyết học,
//   Đông máu, Sinh hóa, Miễn dịch, Sinh học phân tử: Tự động lọc đúng đơn vị
//   theo tên xét nghiệm (VD: WBC chỉ hiện 10^9/L, 10^3/uL, K/uL, G/L).
// - Hỗ trợ gắn Lọ Hóa chất QC & Số Lô độc lập cho từng mức (L1, L2, L3) và
//   lưu Lịch sử 12 Lô độc lập từng mức mà không làm đứt đoạn mức còn lại.
// - Gom nhóm các lọ QC khui ngắn ngày (3-4 ngày/lọ) theo cùng Lô và hỗ trợ
//   Khai báo theo Bộ (L1-L2-L3) hoặc Khui/Pha lọ tiếp theo chỉ với 1-Click.
// ✦ An intellectual product by Handsome Long ✦
// ============================================================================

const Ic = {
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
      width="14"
      height="14"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      viewBox="0 0 24 24"
    >
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
    </svg>
  ),
  Grip: () => (
    <svg
      width="14"
      height="14"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      viewBox="0 0 24 24"
    >
      <circle cx="9" cy="5" r="1" />
      <circle cx="9" cy="12" r="1" />
      <circle cx="9" cy="19" r="1" />
      <circle cx="15" cy="5" r="1" />
      <circle cx="15" cy="12" r="1" />
      <circle cx="15" cy="19" r="1" />
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

// ============================================================================
// TỪ ĐIỂN ĐƠN VỊ XÉT NGHIỆM THÔNG MINH QUỐC TẾ (SI & CONVENTIONAL SYSTEMS)
// ============================================================================
interface SmartUnitRule {
  keywords: string[];
  units: string[];
}

export const SMART_TEST_UNIT_RULES: SmartUnitRule[] = [
  // 1. HUYẾT HỌC TẾ BÀO (Sysmex, Abbott, Mindray, Beckman Coulter, Nihon Kohden)
  {
    keywords: [
      "WBC",
      "NEU#",
      "NEUT#",
      "LYM#",
      "LYMPH#",
      "MON#",
      "MONO#",
      "EOS#",
      "BAS#",
      "BASO#",
      "IG#",
      "NRBC#",
      "RET#",
    ],
    units: ["10^9/L", "10^3/µL", "10^3/uL", "G/L", "K/µL", "K/uL", "cells/µL"],
  },
  {
    keywords: ["RBC"],
    units: ["10^12/L", "10^6/µL", "10^6/uL", "T/L", "M/µL", "M/uL"],
  },
  {
    keywords: ["PLT"],
    units: ["10^9/L", "10^3/µL", "10^3/uL", "G/L", "K/µL", "K/uL"],
  },
  {
    keywords: ["HGB", "HB"],
    units: ["g/L", "g/dL", "mmol/L"],
  },
  {
    keywords: ["HCT"],
    units: ["%", "L/L"],
  },
  {
    keywords: ["MCV", "MPV", "PDW-SD"],
    units: ["fL"],
  },
  {
    keywords: ["MCH"],
    units: ["pg", "fmol"],
  },
  {
    keywords: ["MCHC"],
    units: ["g/L", "g/dL", "mmol/L", "%"],
  },
  {
    keywords: [
      "RDW",
      "RDW-CV",
      "PCT-PLT",
      "P-LCR",
      "NEU%",
      "NEUT%",
      "LYM%",
      "MON%",
      "EOS%",
      "BAS%",
      "RET%",
      "IPF",
    ],
    units: ["%"],
  },
  {
    keywords: ["RDW-SD"],
    units: ["fL"],
  },
  {
    keywords: ["ESR", "VSS", "MAU LANG"],
    units: ["mm/h", "mm/1h"],
  },

  // 2. ĐÔNG MÁU HUYẾT HỌC (Sysmex CS-2500, CA-600, Stago, ACL TOP)
  {
    keywords: ["PT", "PROTHROMBIN", "TQ"],
    units: ["giây (s)", "s", "%", "INR", "Ratio"],
  },
  {
    keywords: ["INR"],
    units: ["INR", "Ratio", "Không đơn vị"],
  },
  {
    keywords: ["APTT", "TCK", "PTT", "TT", "THROMBIN TIME"],
    units: ["giây (s)", "s", "Ratio"],
  },
  {
    keywords: ["FIB", "FIBRINOGEN"],
    units: ["g/L", "mg/dL"],
  },
  {
    keywords: ["D-DIMER", "DDIMER"],
    units: [
      "mg/L FEU",
      "ng/mL FEU",
      "µg/mL FEU",
      "µg/L DDU",
      "ng/mL DDU",
      "mg/L",
      "ng/mL",
    ],
  },
  {
    keywords: ["ANTI-XA", "AT-III", "ANTITHROMBIN", "PROTEIN C", "PROTEIN S"],
    units: ["%", "IU/mL", "U/mL"],
  },

  // 3. SINH HÓA LÂM SÀNG & KHÍ MÁU (Cobas, AU, Architect, Alinity, Dimension)
  {
    keywords: [
      "GLU",
      "GLUCOSE",
      "URE",
      "UREA",
      "BUN",
      "CHOL",
      "CHOLESTEROL",
      "TRIG",
      "TRIGLYCERIDE",
      "HDL",
      "LDL",
      "LACTATE",
    ],
    units: ["mmol/L", "mg/dL", "g/L"],
  },
  {
    keywords: [
      "CRE",
      "CREATININE",
      "UA",
      "URIC",
      "BIL",
      "BILIRUBIN",
      "NH3",
      "AMMONIA",
    ],
    units: ["µmol/L", "umol/L", "mg/dL", "mmol/L"],
  },
  {
    keywords: [
      "AST",
      "GOT",
      "ALT",
      "GPT",
      "GGT",
      "ALP",
      "LDH",
      "CK",
      "CPK",
      "CK-MB",
      "AMY",
      "AMYLASE",
      "LIP",
      "LIPASE",
      "CHE",
      "G6PD",
    ],
    units: ["U/L", "IU/L", "µkat/L", "U/g Hb"],
  },
  {
    keywords: ["ALB", "ALBUMIN", "TP", "PROTEIN", "GLOBULIN"],
    units: ["g/L", "g/dL", "mg/dL", "mg/L"],
  },
  {
    keywords: [
      "NA",
      "NA+",
      "K",
      "K+",
      "CL",
      "CL-",
      "CA",
      "CA2+",
      "MG",
      "PHOSPHO",
      "HCO3",
    ],
    units: ["mmol/L", "mEq/L", "mg/dL"],
  },
  {
    keywords: ["FE", "SAT", "IRON", "TIBC", "UIBC", "CU", "ZN"],
    units: ["µmol/L", "umol/L", "µg/dL", "ug/dL", "mg/L"],
  },
  {
    keywords: ["HBA1C", "A1C"],
    units: ["% (NGSP)", "mmol/mol (IFCC)", "%", "mmol/mol"],
  },
  {
    keywords: [
      "CRP",
      "HS-CRP",
      "RF",
      "ASO",
      "IGG",
      "IGA",
      "IGM",
      "C3",
      "C4",
      "PREALBUMIN",
    ],
    units: ["mg/L", "mg/dL", "g/L", "IU/mL", "U/mL"],
  },
  {
    keywords: ["PH"],
    units: ["Không đơn vị", "pH"],
  },
  {
    keywords: ["PCO2", "PO2"],
    units: ["mmHg", "kPa"],
  },

  // 4. MIỄN DỊCH - HORMON - MARKER UNG THƯ - TIM MẠCH
  {
    keywords: [
      "TSH",
      "LH",
      "FSH",
      "PRL",
      "PROLACTIN",
      "HCG",
      "BETA-HCG",
      "ACTH",
      "INSULIN",
    ],
    units: ["µIU/mL", "uIU/mL", "mIU/L", "mIU/mL", "IU/L", "ng/mL", "pmol/L"],
  },
  {
    keywords: [
      "FT3",
      "FT4",
      "T3",
      "T4",
      "E2",
      "ESTRADIOL",
      "PROGESTERONE",
      "TESTOSTERONE",
      "CORTISOL",
    ],
    units: ["pmol/L", "ng/dL", "pg/mL", "nmol/L", "µg/dL", "ng/mL", "µg/L"],
  },
  {
    keywords: [
      "TROPONIN",
      "TNI",
      "TNT",
      "HS-TNI",
      "HS-TNT",
      "BNP",
      "NT-PROBNP",
    ],
    units: ["ng/L", "pg/mL", "ng/mL", "µg/L", "pmol/L"],
  },
  {
    keywords: [
      "PCT",
      "PROCALCITONIN",
      "FERRITIN",
      "AFP",
      "CEA",
      "PSA",
      "FPSA",
      "TG",
      "CALCITONIN",
    ],
    units: ["ng/mL", "µg/L", "IU/mL", "pg/mL"],
  },
  {
    keywords: [
      "CA 125",
      "CA125",
      "CA 15-3",
      "CA15-3",
      "CA 19-9",
      "CA19-9",
      "CA 72-4",
      "HE4",
    ],
    units: ["U/mL", "IU/mL", "pmol/L", "kU/L"],
  },
  {
    keywords: [
      "CYFRA",
      "NSE",
      "SCC",
      "S100",
      "VITAMIN D",
      "25-OH",
      "VITAMIN B12",
      "FOLATE",
    ],
    units: ["ng/mL", "nmol/L", "pg/mL", "pmol/L", "µg/L"],
  },
  {
    keywords: [
      "HBSAG",
      "ANTI-HBS",
      "HBEAG",
      "ANTI-HBE",
      "ANTI-HBC",
      "ANTI-HCV",
      "HIV",
      "SYPHILIS",
      "TPHA",
      "DENGUE",
      "IGM",
      "IGG",
    ],
    units: [
      "S/CO",
      "COI",
      "Index",
      "mIU/mL",
      "IU/L",
      "IU/mL",
      "U/mL",
      "Không đơn vị",
    ],
  },

  // 5. SINH HỌC PHÂN TỬ (Realtime-PCR, Load Virus)
  {
    keywords: [
      "HBV-DNA",
      "HBV DNA",
      "HCV-RNA",
      "HCV RNA",
      "HIV-RNA",
      "HIV RNA",
      "CMV",
      "EBV",
      "HPV",
      "PCR",
      "MTB",
      "SARS-COV-2",
    ],
    units: [
      "IU/mL",
      "copies/mL",
      "log10 IU/mL",
      "log10 copies/mL",
      "Ct",
      "copies/µL",
      "Không đơn vị",
    ],
  },
];

export const ALL_INTERNATIONAL_LAB_UNITS: string[] = Array.from(
  new Set([
    // Huyết học & Đông máu
    "10^9/L",
    "10^3/µL",
    "10^12/L",
    "10^6/µL",
    "G/L",
    "T/L",
    "K/µL",
    "M/µL",
    "g/L",
    "g/dL",
    "%",
    "L/L",
    "fL",
    "pg",
    "mm/h",
    "giây (s)",
    "s",
    "INR",
    "Ratio",
    "mg/L FEU",
    "ng/mL FEU",
    "µg/mL FEU",
    "µg/L DDU",
    // Sinh hóa
    "mmol/L",
    "µmol/L",
    "mg/dL",
    "mg/L",
    "µg/dL",
    "U/L",
    "IU/L",
    "µkat/L",
    "mEq/L",
    "% (NGSP)",
    "mmol/mol (IFCC)",
    "mmHg",
    "kPa",
    // Miễn dịch
    "µIU/mL",
    "mIU/L",
    "mIU/mL",
    "IU/mL",
    "U/mL",
    "pmol/L",
    "nmol/L",
    "ng/mL",
    "pg/mL",
    "ng/L",
    "µg/L",
    "S/CO",
    "COI",
    "Index",
    // Sinh học phân tử
    "copies/mL",
    "log10 IU/mL",
    "log10 copies/mL",
    "Ct",
    "Không đơn vị",
    ...COMMON_UNITS,
  ])
);

/**
 * Tra cứu danh sách đơn vị chuẩn xác theo Tên xét nghiệm và Khoa/Lab.
 * Nếu khớp tên (VD: WBC), chỉ trả về đúng các hệ đơn vị của WBC (10^9/L, 10^3/µL, G/L, K/µL).
 */
export function getSmartUnitsForTest(
  testName: string,
  sectionName?: string
): {
  matchedSpecific: boolean;
  recommendedUnits: string[];
  allUnits: string[];
} {
  const cleanName = String(testName || "")
    .trim()
    .toUpperCase();

  if (cleanName) {
    for (const rule of SMART_TEST_UNIT_RULES) {
      const isHit = rule.keywords.some((kw) => {
        if (cleanName === kw) return true;
        if (cleanName.startsWith(`${kw} `) || cleanName.startsWith(`${kw}(`))
          return true;
        if (cleanName.includes(`(${kw})`) || cleanName.includes(` ${kw}`))
          return true;
        return false;
      });
      if (isHit) {
        return {
          matchedSpecific: true,
          recommendedUnits: rule.units,
          allUnits: ALL_INTERNATIONAL_LAB_UNITS,
        };
      }
    }
  }

  const secUpper = String(sectionName || "").toUpperCase();
  if (secUpper.includes("HUYẾT") || secUpper.includes("ĐÔNG")) {
    return {
      matchedSpecific: false,
      recommendedUnits: [
        "10^9/L",
        "10^3/µL",
        "10^12/L",
        "10^6/µL",
        "g/L",
        "g/dL",
        "%",
        "fL",
        "pg",
        "giây (s)",
        "INR",
        "mg/L FEU",
      ],
      allUnits: ALL_INTERNATIONAL_LAB_UNITS,
    };
  }
  if (secUpper.includes("MIỄN")) {
    return {
      matchedSpecific: false,
      recommendedUnits: [
        "µIU/mL",
        "mIU/L",
        "pmol/L",
        "nmol/L",
        "ng/mL",
        "pg/mL",
        "ng/L",
        "U/mL",
        "IU/mL",
        "S/CO",
        "COI",
      ],
      allUnits: ALL_INTERNATIONAL_LAB_UNITS,
    };
  }
  if (
    secUpper.includes("PHÂN TỬ") ||
    secUpper.includes("PCR") ||
    secUpper.includes("SHPT")
  ) {
    return {
      matchedSpecific: false,
      recommendedUnits: [
        "IU/mL",
        "copies/mL",
        "log10 IU/mL",
        "log10 copies/mL",
        "Ct",
      ],
      allUnits: ALL_INTERNATIONAL_LAB_UNITS,
    };
  }

  return {
    matchedSpecific: false,
    recommendedUnits: [
      "mmol/L",
      "µmol/L",
      "U/L",
      "g/L",
      "mg/dL",
      "mg/L",
      "%",
      "mEq/L",
    ],
    allUnits: ALL_INTERNATIONAL_LAB_UNITS,
  };
}

const DEFAULT_EXEMPT_HEMATOLOGY_TESTS = ["WBC", "RBC", "HGB", "HCT", "PLT"];
function isDefaultExemptTestName(testName: string): boolean {
  const upper = String(testName || "")
    .trim()
    .toUpperCase();
  return DEFAULT_EXEMPT_HEMATOLOGY_TESTS.some(
    (code) =>
      upper === code ||
      upper.startsWith(`${code} `) ||
      upper.includes(`(${code})`)
  );
}

/**
 * Lưu trữ Lô cũ vào Lịch sử 12 Lô (lot_history) có hỗ trợ tách Lô độc lập cho từng mức (L1, L2, L3).
 * Nếu chỉ đổi Lô của Mức 1 (mà Mức 2, 3 giữ nguyên Lô cũ), hệ thống chỉ reset dữ liệu Mức 1.
 */
function archiveOldLotOnClientIfChanged(
  cfg: TestConfig,
  newLotNumber: string,
  newExpiryDate: string,
  archiveDate: string,
  newControlName?: string,
  levelPatch?: {
    levelKey: "L1" | "L2" | "L3";
    newCtrl: string;
    newLot: string;
    newExp: string;
  }
): TestConfig {
  const anyCfg = cfg as any;

  // Trường hợp cập nhật riêng 1 mức nồng độ (Decoupled Level Lot)
  if (levelPatch) {
    const { levelKey, newCtrl, newLot, newExp } = levelPatch;
    const oldLvLot = String(
      anyCfg[`lot_number_${levelKey}`] || cfg.lot_number || ""
    ).trim();
    const cleanNewLot = String(newLot || "").trim();

    const updatedMeta: any = {
      ...cfg,
      [`control_name_${levelKey}`]: newCtrl,
      [`lot_number_${levelKey}`]: cleanNewLot,
      [`expiry_date_${levelKey}`]: newExp,
    };

    if (levelKey === "L1") {
      updatedMeta.control_name = newCtrl;
      updatedMeta.lot_number = cleanNewLot || cfg.lot_number;
      updatedMeta.expiry_date = newExp || cfg.expiry_date;
    }

    if (
      !oldLvLot ||
      !cleanNewLot ||
      oldLvLot.toLowerCase() === cleanNewLot.toLowerCase()
    ) {
      return updatedMeta as TestConfig;
    }

    const mu1 = computeMuAndSigma(cfg, "L1");
    const mu2 = computeMuAndSigma(cfg, "L2");
    const mu3 = computeMuAndSigma(cfg, "L3");
    const targetMu = levelKey === "L1" ? mu1 : levelKey === "L2" ? mu2 : mu3;

    let nextHistory: LotArchiveItem[] = Array.isArray(cfg.lot_history)
      ? [...cfg.lot_history]
      : [];

    if (targetMu.validPointsCount > 0 || targetMu.cvPct > 0) {
      const archiveTag = `${oldLvLot} (${levelKey})`;
      const archiveItem: LotArchiveItem = {
        lot_number: archiveTag,
        expiry_date: anyCfg[`expiry_date_${levelKey}`] || cfg.expiry_date,
        range_source: cfg.range_source,
        mean_L1:
          mu1.validPointsCount > 0
            ? roundSmartDecimal(mu1.meanLab, cfg.sd_L1)
            : cfg.mean_L1,
        sd_L1:
          mu1.validPointsCount > 1
            ? roundSmartDecimal(mu1.sdLab, cfg.sd_L1)
            : cfg.sd_L1,
        cv_L1: mu1.cvPct,
        n_L1: mu1.validPointsCount,
        mean_L2:
          mu2.validPointsCount > 0
            ? roundSmartDecimal(mu2.meanLab, cfg.sd_L2)
            : cfg.mean_L2,
        sd_L2:
          mu2.validPointsCount > 1
            ? roundSmartDecimal(mu2.sdLab, cfg.sd_L2)
            : cfg.sd_L2,
        cv_L2: mu2.cvPct,
        n_L2: mu2.validPointsCount,
        mean_L3:
          mu3.validPointsCount > 0
            ? roundSmartDecimal(mu3.meanLab, cfg.sd_L3)
            : cfg.mean_L3,
        sd_L3:
          mu3.validPointsCount > 1
            ? roundSmartDecimal(mu3.sdLab, cfg.sd_L3)
            : cfg.sd_L3,
        cv_L3: mu3.cvPct,
        n_L3: mu3.validPointsCount,
        archived_at: archiveDate || getVnIsoDateString(),
      };
      nextHistory = [
        archiveItem,
        ...nextHistory.filter(
          (item) =>
            item.lot_number.trim().toLowerCase() !== archiveTag.toLowerCase()
        ),
      ].slice(0, 12);
    }

    updatedMeta.lot_history = nextHistory;
    return updatedMeta as TestConfig;
  }

  // Trường hợp cập nhật Lô chuẩn chung
  const oldLot = String(cfg.lot_number || "").trim();
  const nextLot = String(newLotNumber || "").trim();
  const nextCtrl = newControlName ? newControlName.trim() : cfg.control_name;

  if (!oldLot || !nextLot || oldLot.toLowerCase() === nextLot.toLowerCase()) {
    return {
      ...cfg,
      control_name: nextCtrl,
      lot_number: nextLot || cfg.lot_number,
      expiry_date: newExpiryDate || cfg.expiry_date,
    };
  }

  const mu1 = computeMuAndSigma(cfg, "L1");
  const mu2 = computeMuAndSigma(cfg, "L2");
  const mu3 = computeMuAndSigma(cfg, "L3");
  const hasAnyPoints =
    mu1.validPointsCount > 0 ||
    mu2.validPointsCount > 0 ||
    mu3.validPointsCount > 0 ||
    mu1.cvPct > 0;
  let nextHistory: LotArchiveItem[] = Array.isArray(cfg.lot_history)
    ? [...cfg.lot_history]
    : [];

  if (hasAnyPoints) {
    const archiveItem: LotArchiveItem = {
      lot_number: oldLot,
      expiry_date: cfg.expiry_date,
      range_source: cfg.range_source,
      mean_L1:
        mu1.validPointsCount > 0
          ? roundSmartDecimal(mu1.meanLab, cfg.sd_L1)
          : cfg.mean_L1,
      sd_L1:
        mu1.validPointsCount > 1
          ? roundSmartDecimal(mu1.sdLab, cfg.sd_L1)
          : cfg.sd_L1,
      cv_L1: mu1.cvPct,
      n_L1: mu1.validPointsCount,
      mean_L2:
        mu2.validPointsCount > 0
          ? roundSmartDecimal(mu2.meanLab, cfg.sd_L2)
          : cfg.mean_L2,
      sd_L2:
        mu2.validPointsCount > 1
          ? roundSmartDecimal(mu2.sdLab, cfg.sd_L2)
          : cfg.sd_L2,
      cv_L2: mu2.cvPct,
      n_L2: mu2.validPointsCount,
      mean_L3:
        mu3.validPointsCount > 0
          ? roundSmartDecimal(mu3.meanLab, cfg.sd_L3)
          : cfg.mean_L3,
      sd_L3:
        mu3.validPointsCount > 1
          ? roundSmartDecimal(mu3.sdLab, cfg.sd_L3)
          : cfg.sd_L3,
      cv_L3: mu3.cvPct,
      n_L3: mu3.validPointsCount,
      archived_at: archiveDate || getVnIsoDateString(),
    };
    nextHistory = [
      archiveItem,
      ...nextHistory.filter(
        (item) => item.lot_number.trim().toLowerCase() !== oldLot.toLowerCase()
      ),
    ].slice(0, 12);
  }
  return {
    ...cfg,
    control_name: nextCtrl,
    lot_number: nextLot,
    expiry_date: newExpiryDate || cfg.expiry_date,
    lot_history: nextHistory,
    accumulated_points: 0,
    range_active_days: 0,
  };
}

interface LevelMuDraft {
  mu_mode: MuModeType;
  manual_mu: string;
  verif_cvr: string;
  verif_bias: string;
  urw_pooled: string;
  uc_cal: string;
  ubias_periodic: string;
}
const emptyLevelMuDraft = (): LevelMuDraft => ({
  mu_mode: "INITIAL_VERIFICATION",
  manual_mu: "",
  verif_cvr: "",
  verif_bias: "",
  urw_pooled: "",
  uc_cal: "",
  ubias_periodic: "",
});
const levelMuConfigToDraft = (cfg?: LevelMuConfig): LevelMuDraft => ({
  mu_mode: cfg?.mu_mode || "NONE",
  manual_mu: cfg?.manual_mu !== undefined ? String(cfg.manual_mu) : "",
  verif_cvr: cfg?.verif_cvr !== undefined ? String(cfg.verif_cvr) : "",
  verif_bias: cfg?.verif_bias !== undefined ? String(cfg.verif_bias) : "",
  urw_pooled: cfg?.urw_pooled !== undefined ? String(cfg.urw_pooled) : "",
  uc_cal: cfg?.uc_cal !== undefined ? String(cfg.uc_cal) : "",
  ubias_periodic:
    cfg?.ubias_periodic !== undefined ? String(cfg.ubias_periodic) : "",
});
const draftToLevelMuConfig = (d: LevelMuDraft): LevelMuConfig => ({
  mu_mode: d.mu_mode,
  manual_mu: d.manual_mu ? parseFloat(d.manual_mu) : undefined,
  verif_cvr: d.verif_cvr ? parseFloat(d.verif_cvr) : undefined,
  verif_bias: d.verif_bias ? parseFloat(d.verif_bias) : undefined,
  urw_pooled: d.urw_pooled ? parseFloat(d.urw_pooled) : undefined,
  uc_cal: d.uc_cal ? parseFloat(d.uc_cal) : undefined,
  ubias_periodic: d.ubias_periodic ? parseFloat(d.ubias_periodic) : undefined,
});

export interface QuanLyDanhMucProps {
  apiUrl: string;
  authToken: string;
  currentUser: UserAccount;
  users: UserAccount[];
  sections: string[];
  labMachines: { section: string; machine: string }[];
  configs: TestConfig[];
  setConfigs: React.Dispatch<React.SetStateAction<TestConfig[]>>;
  reagents: ReagentLotBM16[];
  setReagents: React.Dispatch<React.SetStateAction<ReagentLotBM16[]>>;
  onNavigateToAssistant: (testId: string) => void;
}

export default function QuanLyDanhMuc({
  apiUrl,
  authToken,
  currentUser,
  users,
  sections,
  labMachines,
  configs,
  setConfigs,
  reagents,
  setReagents,
  onNavigateToAssistant,
}: QuanLyDanhMucProps) {
  const runDate = getVnIsoDateString();
  const getMachinesForSection = (sec: string) =>
    labMachines.filter((m) => m.section === sec).map((m) => m.machine);

  const getControlsForMachine = (m: string) => {
    const fromReagents = reagents
      .filter((r) => r.machine_name === m)
      .map((r) => r.control_name);
    const fromConfigs = configs
      .filter((c) => c.machine_name === m)
      .map((c) => c.control_name);
    return Array.from(new Set([...fromReagents, ...fromConfigs]));
  };

  const getTestsForControl = (m: string, ctrl: string) =>
    configs
      .filter((c) => {
        if (c.machine_name !== m) return false;
        const anyC = c as any;
        return (
          c.control_name === ctrl ||
          anyC.control_name_L1 === ctrl ||
          anyC.control_name_L2 === ctrl ||
          anyC.control_name_L3 === ctrl
        );
      })
      .sort((a, b) => a.order - b.order);

  const getActiveReagentLot = (
    m: string,
    ctrl: string
  ): ReagentLotBM16 | undefined => {
    const matches = reagents.filter(
      (r) => r.machine_name === m && r.control_name === ctrl
    );
    return matches[matches.length - 1];
  };

  const canManageCatalog =
    currentUser.role === "ADMIN" ||
    currentUser.role === "QLCM" ||
    hasPermission(currentUser, "MANAGE_CATALOG");
  const canReorderOrDelete =
    currentUser.role === "ADMIN" ||
    hasPermission(currentUser, "MANAGE_CATALOG");

  const defaultSec = sections[0] || "Sinh Hóa";
  const defaultMac = getMachinesForSection(defaultSec)[0] || "";
  const defaultCtrl = getControlsForMachine(defaultMac)[0] || "";

  const [setupSection, setSetupSection] = useState<string>(defaultSec);
  const [setupMachine, setSetupMachine] = useState<string>(defaultMac);
  const [setupControl, setSetupControl] = useState<string>(defaultCtrl);

  const [editingReagentId, setEditingReagentId] = useState<string | null>(null);
  const [editingOriginalControlName, setEditingOriginalControlName] =
    useState<string>("");
  const [isReagentFormDimmed, setIsReagentFormDimmed] =
    useState<boolean>(false);

  // Chế độ khai báo Hóa chất: Đơn lẻ 1 lọ (SINGLE) hoặc Khai báo nhanh Bộ 2-3 mức (BATCH_SET)
  const [reagentEntryMode, setReagentEntryMode] = useState<
    "SINGLE" | "BATCH_SET"
  >("SINGLE");
  const [batchSetCount, setBatchSetCount] = useState<2 | 3>(3);
  const [batchVialsDraft, setBatchVialsDraft] = useState([
    { control_name: "", lot_number: "", expiry_date: "" },
    { control_name: "", lot_number: "", expiry_date: "" },
    { control_name: "", lot_number: "", expiry_date: "" },
  ]);

  const [reagentForm, setReagentForm] = useState({
    section_name: defaultSec,
    machine_name: defaultMac,
    control_name: "",
    lot_number: "",
    expiry_date: "",
    is_manual_prep: false,
    prep_date: runDate,
    use_expiry_date: addDaysToIsoDate(runDate, 3),
    prep_by_id: currentUser.id,
    prep_by_pw: "",
    quantity_prepared: "3",
    usage_count: "0",
    note: "",
  });
  const [reagentMsg, setReagentMsg] = useState<{
    type: "ok" | "err";
    text: string;
  } | null>(null);

  const [catalogLabFilter, setCatalogLabFilter] = useState<string>("Tất cả");
  const [catalogMachineFilter, setCatalogMachineFilter] =
    useState<string>("Tất cả");
  const [catalogStatusFilter, setCatalogStatusFilter] = useState<
    "GROUPED_LOT" | "ALL" | "ACTIVE"
  >("GROUPED_LOT");
  const [expandedGroupKeys, setExpandedGroupKeys] = useState<
    Record<string, boolean>
  >({});

  const [showCopyWizard, setShowCopyWizard] = useState<boolean>(false);
  const [isSavingCopyWizard, setIsSavingCopyWizard] = useState<boolean>(false);

  const [editingTestId, setEditingTestId] = useState<string | null>(null);
  const [activeMuTab, setActiveMuTab] = useState<"L1" | "L2" | "L3">("L1");
  const [useSeparateControlPerLevel, setUseSeparateControlPerLevel] =
    useState<boolean>(false);

  const [newTestForm, setNewTestForm] = useState({
    test_name: "",
    unit: "mmol/L",
    standard_label: "ISO" as "ISO" | "THUONG",
    test_type: "QUANTITATIVE" as TestCategoryType,
    levels_count: 2 as 1 | 2 | 3,
    range_source: "MANUFACTURER" as RangeSourceType,
    range_active_days: "0",
    range_applied_date: runDate,
    accumulated_points: "0",
    tea: "10",
    tea_unit: "PERCENT" as "PERCENT" | "ABSOLUTE",
    is_exempt_long_rules: false,
    control_L1: defaultCtrl,
    control_L2: defaultCtrl,
    control_L3: defaultCtrl,
    mean_L1: "",
    sd_L1: "",
    mean_L2: "",
    sd_L2: "",
    mean_L3: "",
    sd_L3: "",
    mfg_mean_L1: "",
    mfg_sd_L1: "",
    mfg_mean_L2: "",
    mfg_sd_L2: "",
    mfg_mean_L3: "",
    mfg_sd_L3: "",
    expected_qual_L1: "ÂM TÍNH" as QualitativeOptionType,
    expected_qual_L2: "DƯƠNG TÍNH" as QualitativeOptionType,
    expected_qual_L3: "DƯƠNG TÍNH" as QualitativeOptionType,
    mu_L1: emptyLevelMuDraft(),
    mu_L2: emptyLevelMuDraft(),
    mu_L3: emptyLevelMuDraft(),
  });
  const [testDropdownOpen, setTestDropdownOpen] = useState(false);
  const [unitDropdownOpen, setUnitDropdownOpen] = useState(false);
  const [configMsg, setConfigMsg] = useState<{
    type: "ok" | "err";
    text: string;
  } | null>(null);

  const [draggedTestId, setDraggedTestId] = useState<string | null>(null);
  const [activeInfoTestId, setActiveInfoTestId] = useState<string | null>(null);

  const reagentFormRef = useRef<HTMLDivElement | null>(null);
  const testFormRef = useRef<HTMLDivElement | null>(null);

  // Tính toán danh sách Đơn vị thông minh dựa trên tên xét nghiệm đang gõ
  const smartUnitsInfo = useMemo(
    () => getSmartUnitsForTest(newTestForm.test_name, setupSection),
    [newTestForm.test_name, setupSection]
  );

  // Gom nhóm các lọ hóa chất cùng (Máy + Tên Control + Số Lô) để bảng gọn gàng
  const groupedReagentRows = useMemo(() => {
    const filtered = reagents.filter((r) => {
      if (catalogLabFilter !== "Tất cả" && r.section_name !== catalogLabFilter)
        return false;
      if (
        catalogMachineFilter !== "Tất cả" &&
        r.machine_name !== catalogMachineFilter
      )
        return false;
      if (catalogStatusFilter === "ACTIVE") {
        if (r.expiry_date && r.expiry_date < runDate) return false;
        if (
          r.is_manual_prep &&
          r.quantity_prepared &&
          r.usage_count >= r.quantity_prepared
        )
          return false;
      }
      return true;
    });

    if (catalogStatusFilter !== "GROUPED_LOT") {
      return filtered.map((r) => ({
        groupKey: r.control_id,
        latestVial: r,
        olderVials: [] as ReagentLotBM16[],
        totalVialsInLot: 1,
      }));
    }

    const map = new Map<string, ReagentLotBM16[]>();
    filtered.forEach((r) => {
      const key = `${r.machine_name}__${r.control_name
        .trim()
        .toUpperCase()}__${r.lot_number.trim().toUpperCase()}`;
      const list = map.get(key) || [];
      list.push(r);
      map.set(key, list);
    });

    return Array.from(map.entries()).map(([key, list]) => {
      const sorted = [...list].sort((a, b) =>
        String(b.prep_date || "").localeCompare(String(a.prep_date || ""))
      );
      return {
        groupKey: key,
        latestVial: sorted[0],
        olderVials: sorted.slice(1),
        totalVialsInLot: sorted.length,
      };
    });
  }, [
    reagents,
    catalogLabFilter,
    catalogMachineFilter,
    catalogStatusFilter,
    runDate,
  ]);

  // Nút 1-Click: Nạp sẵn thông tin để Khui/Pha lọ tiếp theo trong cùng Lô (3-4 ngày/lọ)
  const handlePrepareNextVialFromTable = (r: ReagentLotBM16) => {
    setEditingReagentId(null);
    setEditingOriginalControlName("");
    setReagentEntryMode("SINGLE");
    setIsReagentFormDimmed(false);
    setReagentMsg({
      type: "ok",
      text: `⚡ Đã nạp sẵn thông tin Lô ${r.lot_number} của "${r.control_name}". Hãy kiểm tra Ngày khui/pha mới và nhập mật khẩu để lưu lọ tiếp theo!`,
    });
    setReagentForm({
      section_name: r.section_name,
      machine_name: r.machine_name,
      control_name: r.control_name,
      lot_number: r.lot_number,
      expiry_date: r.expiry_date,
      is_manual_prep: r.is_manual_prep,
      prep_date: runDate,
      use_expiry_date: addDaysToIsoDate(runDate, 3),
      prep_by_id: currentUser.id,
      prep_by_pw: "",
      quantity_prepared: String(r.quantity_prepared || 3),
      usage_count: "0",
      note: r.note || "",
    });
    setTimeout(() => {
      reagentFormRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }, 80);
  };

  const handleSaveReagentLot = async (e: React.FormEvent) => {
    e.preventDefault();
    const {
      section_name,
      machine_name,
      control_name,
      lot_number,
      expiry_date,
      is_manual_prep,
      prep_date,
      use_expiry_date,
      prep_by_id,
      prep_by_pw,
      quantity_prepared,
      usage_count,
      note,
    } = reagentForm;

    const accountList =
      Array.isArray(users) && users.length > 0 ? users : [currentUser];
    const verifier = accountList.find(
      (u) =>
        (u.id.toLowerCase() === prep_by_id.trim().toLowerCase() ||
          u.name.toLowerCase() === prep_by_id.trim().toLowerCase()) &&
        u.password === prep_by_pw
    );
    if (!verifier) {
      setReagentMsg({
        type: "err",
        text: `Xác thực ${
          is_manual_prep ? "Người pha" : "Người mở nắp"
        } thất bại! Sai ID hoặc Mật khẩu.`,
      });
      return;
    }

    const qtyNum = is_manual_prep
      ? Math.max(1, parseInt(quantity_prepared, 10) || 3)
      : undefined;
    const cleanUseExpiry = is_manual_prep
      ? use_expiry_date || addDaysToIsoDate(prep_date, 3)
      : expiry_date;

    // CHẾ ĐỘ KHAI BÁO NHANH TRỌN BỘ 2-3 MỨC (L1, L2, L3) TRONG 1 LẦN LƯU
    if (!editingReagentId && reagentEntryMode === "BATCH_SET") {
      const activeBatch = batchVialsDraft
        .slice(0, batchSetCount)
        .filter(
          (v) => v.control_name.trim() && v.lot_number.trim() && v.expiry_date
        );

      if (activeBatch.length === 0) {
        setReagentMsg({
          type: "err",
          text: "Vui lòng nhập đầy đủ Tên Hóa chất, Số Lô và HSD cho ít nhất 1 mức trong bộ!",
        });
        return;
      }

      const createdLots: ReagentLotBM16[] = activeBatch.map((v, idx) => ({
        control_id: `CTRL-${Date.now().toString().slice(-4)}-${idx + 1}`,
        section_name,
        machine_name,
        control_name: v.control_name.trim(),
        lot_number: v.lot_number.trim(),
        expiry_date: v.expiry_date,
        is_manual_prep,
        prep_date,
        use_expiry_date: is_manual_prep ? cleanUseExpiry : v.expiry_date,
        prep_by_id: verifier.id,
        prep_by_name: verifier.name,
        quantity_prepared: qtyNum,
        usage_count: 0,
        used_days_map: {},
        note: is_manual_prep ? note : "Mở nắp dùng ngay",
      }));

      setReagents((prev) => [...prev, ...createdLots]);

      setConfigs((prev) =>
        prev.map((c) => {
          if (c.machine_name !== machine_name) return c;
          let nextC = { ...c };
          const anyC = nextC as any;
          createdLots.forEach((lotObj) => {
            if (anyC.control_name_L1 === lotObj.control_name) {
              nextC = archiveOldLotOnClientIfChanged(
                nextC,
                lotObj.lot_number,
                lotObj.expiry_date,
                runDate,
                lotObj.control_name,
                {
                  levelKey: "L1",
                  newCtrl: lotObj.control_name,
                  newLot: lotObj.lot_number,
                  newExp: lotObj.expiry_date,
                }
              );
            }
            if (anyC.control_name_L2 === lotObj.control_name) {
              nextC = archiveOldLotOnClientIfChanged(
                nextC,
                lotObj.lot_number,
                lotObj.expiry_date,
                runDate,
                lotObj.control_name,
                {
                  levelKey: "L2",
                  newCtrl: lotObj.control_name,
                  newLot: lotObj.lot_number,
                  newExp: lotObj.expiry_date,
                }
              );
            }
            if (anyC.control_name_L3 === lotObj.control_name) {
              nextC = archiveOldLotOnClientIfChanged(
                nextC,
                lotObj.lot_number,
                lotObj.expiry_date,
                runDate,
                lotObj.control_name,
                {
                  levelKey: "L3",
                  newCtrl: lotObj.control_name,
                  newLot: lotObj.lot_number,
                  newExp: lotObj.expiry_date,
                }
              );
            }
            if (nextC.control_name === lotObj.control_name) {
              nextC = archiveOldLotOnClientIfChanged(
                nextC,
                lotObj.lot_number,
                lotObj.expiry_date,
                runDate
              );
            }
          });
          return nextC;
        })
      );

      setSetupSection(section_name);
      setSetupMachine(machine_name);
      setSetupControl(createdLots[0].control_name);
      setUseSeparateControlPerLevel(true);
      setNewTestForm((prev) => ({
        ...prev,
        levels_count: batchSetCount,
        control_L1: createdLots[0]?.control_name || prev.control_L1,
        control_L2:
          createdLots[1]?.control_name ||
          createdLots[0]?.control_name ||
          prev.control_L2,
        control_L3:
          createdLots[2]?.control_name ||
          createdLots[0]?.control_name ||
          prev.control_L3,
      }));

      setIsReagentFormDimmed(true);
      setReagentMsg({
        type: "ok",
        text: `✓ Đã lưu trọn bộ ${
          createdLots.length
        } lọ Hóa chất QC (${createdLots
          .map((x) => x.control_name)
          .join(", ")}) cho máy ${machine_name}!`,
      });
      setReagentForm((prev) => ({ ...prev, prep_by_pw: "", note: "" }));

      for (const lotItem of createdLots) {
        await rpcCall(apiUrl, "save_control", lotItem, authToken);
      }
      return;
    }

    if (
      !control_name.trim() ||
      !lot_number.trim() ||
      !expiry_date ||
      !prep_date ||
      !prep_by_id.trim()
    ) {
      setReagentMsg({
        type: "err",
        text: "Vui lòng điền đầy đủ các trường bắt buộc (*)!",
      });
      return;
    }

    const cleanCtrlName = control_name.trim();
    const cleanLot = lot_number.trim();

    if (editingReagentId) {
      let updatedLotObj: ReagentLotBM16 | null = null;
      const oldCtrlName = editingOriginalControlName || cleanCtrlName;
      const parsedUsage = Math.max(0, parseInt(usage_count, 10) || 0);

      setReagents((prev) =>
        prev.map((r) => {
          if (r.control_id !== editingReagentId) return r;
          const nextR: ReagentLotBM16 = {
            ...r,
            section_name,
            machine_name,
            control_name: cleanCtrlName,
            lot_number: cleanLot,
            expiry_date,
            is_manual_prep,
            prep_date,
            use_expiry_date: cleanUseExpiry,
            prep_by_id: verifier.id,
            prep_by_name: verifier.name,
            quantity_prepared: qtyNum,
            usage_count: parsedUsage,
            note: is_manual_prep ? note : "Mở nắp dùng ngay",
          };
          updatedLotObj = nextR;
          return nextR;
        })
      );

      setConfigs((prev) =>
        prev.map((c) => {
          if (c.machine_name !== machine_name) return c;
          let nextC = { ...c };
          const anyC = nextC as any;
          if (
            anyC.control_name_L1 === cleanCtrlName ||
            anyC.control_name_L1 === oldCtrlName
          ) {
            nextC = archiveOldLotOnClientIfChanged(
              nextC,
              cleanLot,
              expiry_date,
              runDate,
              cleanCtrlName,
              {
                levelKey: "L1",
                newCtrl: cleanCtrlName,
                newLot: cleanLot,
                newExp: expiry_date,
              }
            );
          }
          if (
            anyC.control_name_L2 === cleanCtrlName ||
            anyC.control_name_L2 === oldCtrlName
          ) {
            nextC = archiveOldLotOnClientIfChanged(
              nextC,
              cleanLot,
              expiry_date,
              runDate,
              cleanCtrlName,
              {
                levelKey: "L2",
                newCtrl: cleanCtrlName,
                newLot: cleanLot,
                newExp: expiry_date,
              }
            );
          }
          if (
            anyC.control_name_L3 === cleanCtrlName ||
            anyC.control_name_L3 === oldCtrlName
          ) {
            nextC = archiveOldLotOnClientIfChanged(
              nextC,
              cleanLot,
              expiry_date,
              runDate,
              cleanCtrlName,
              {
                levelKey: "L3",
                newCtrl: cleanCtrlName,
                newLot: cleanLot,
                newExp: expiry_date,
              }
            );
          }
          if (
            nextC.control_name === cleanCtrlName ||
            nextC.control_name === oldCtrlName
          ) {
            nextC = archiveOldLotOnClientIfChanged(
              nextC,
              cleanLot,
              expiry_date,
              runDate,
              cleanCtrlName
            );
          }
          return nextC;
        })
      );

      if (setupControl === oldCtrlName) setSetupControl(cleanCtrlName);
      setEditingReagentId(null);
      setEditingOriginalControlName("");
      setIsReagentFormDimmed(true);
      setReagentMsg({
        type: "ok",
        text: `Đã cập nhật hóa chất "${cleanCtrlName}" (Lô ${cleanLot}) trong Danh mục hóa chất QC!`,
      });
      setReagentForm((prev) => ({
        ...prev,
        control_name: "",
        lot_number: "",
        expiry_date: "",
        prep_by_pw: "",
        note: "",
      }));
      if (updatedLotObj)
        await rpcCall(
          apiUrl,
          "save_control",
          {
            ...(updatedLotObj as ReagentLotBM16),
            old_control_name: oldCtrlName,
          },
          authToken
        );
      return;
    }

    const newLot: ReagentLotBM16 = {
      control_id: `CTRL-${Date.now().toString().slice(-4)}`,
      section_name,
      machine_name,
      control_name: cleanCtrlName,
      lot_number: cleanLot,
      expiry_date,
      is_manual_prep,
      prep_date,
      use_expiry_date: cleanUseExpiry,
      prep_by_id: verifier.id,
      prep_by_name: verifier.name,
      quantity_prepared: qtyNum,
      usage_count: 0,
      used_days_map: {},
      note: is_manual_prep ? note : "Mở nắp dùng ngay",
    };
    setReagents((prev) => [...prev, newLot]);
    setConfigs((prev) =>
      prev.map((c) => {
        if (c.machine_name !== machine_name) return c;
        let nextC = { ...c };
        const anyC = nextC as any;
        if (anyC.control_name_L1 === cleanCtrlName) {
          nextC = archiveOldLotOnClientIfChanged(
            nextC,
            cleanLot,
            expiry_date,
            runDate,
            cleanCtrlName,
            {
              levelKey: "L1",
              newCtrl: cleanCtrlName,
              newLot: cleanLot,
              newExp: expiry_date,
            }
          );
        }
        if (anyC.control_name_L2 === cleanCtrlName) {
          nextC = archiveOldLotOnClientIfChanged(
            nextC,
            cleanLot,
            expiry_date,
            runDate,
            cleanCtrlName,
            {
              levelKey: "L2",
              newCtrl: cleanCtrlName,
              newLot: cleanLot,
              newExp: expiry_date,
            }
          );
        }
        if (anyC.control_name_L3 === cleanCtrlName) {
          nextC = archiveOldLotOnClientIfChanged(
            nextC,
            cleanLot,
            expiry_date,
            runDate,
            cleanCtrlName,
            {
              levelKey: "L3",
              newCtrl: cleanCtrlName,
              newLot: cleanLot,
              newExp: expiry_date,
            }
          );
        }
        if (nextC.control_name === cleanCtrlName) {
          nextC = archiveOldLotOnClientIfChanged(
            nextC,
            cleanLot,
            expiry_date,
            runDate
          );
        }
        return nextC;
      })
    );
    setSetupSection(section_name);
    setSetupMachine(machine_name);
    setSetupControl(newLot.control_name);
    setIsReagentFormDimmed(true);
    setReagentMsg({
      type: "ok",
      text: is_manual_prep
        ? `Đã lưu Hóa chất tự pha "${newLot.control_name}" (Lô ${newLot.lot_number}, SL pha: ${qtyNum}).`
        : `Đã lưu Hóa chất mở nắp "${newLot.control_name}" (Lô ${newLot.lot_number}).`,
    });
    setReagentForm((prev) => ({
      ...prev,
      control_name: "",
      lot_number: "",
      expiry_date: "",
      prep_by_pw: "",
      note: "",
    }));
    await rpcCall(apiUrl, "save_control", newLot, authToken);
  };

  const handleEditReagentFromTable = (r: ReagentLotBM16) => {
    setEditingReagentId(r.control_id);
    setEditingOriginalControlName(r.control_name);
    setReagentEntryMode("SINGLE");
    setIsReagentFormDimmed(false);
    setReagentMsg(null);
    setReagentForm({
      section_name: r.section_name,
      machine_name: r.machine_name,
      control_name: r.control_name,
      lot_number: r.lot_number,
      expiry_date: r.expiry_date,
      is_manual_prep: r.is_manual_prep,
      prep_date: r.prep_date,
      use_expiry_date: r.use_expiry_date || addDaysToIsoDate(r.prep_date, 3),
      prep_by_id: r.prep_by_id || currentUser.id,
      prep_by_pw: "",
      quantity_prepared: String(r.quantity_prepared || 3),
      usage_count: String(r.usage_count || 0),
      note: r.note || "",
    });
    setTimeout(() => {
      reagentFormRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }, 80);
  };

  const handleDeleteReagentFromTable = async (r: ReagentLotBM16) => {
    if (!canReorderOrDelete) return;
    if (
      !window.confirm(
        `Xác nhận xóa lọ hóa chất "${r.control_name}" (Số lô: ${
          r.lot_number
        } · Ngày ${formatDateVN(r.prep_date)}) khỏi Danh mục hóa chất QC?`
      )
    )
      return;

    const remainingControls = reagents.filter(
      (item) =>
        item.control_id !== r.control_id &&
        item.machine_name === r.machine_name &&
        item.control_name === r.control_name
    );

    setReagents((prev) =>
      prev.filter((item) => item.control_id !== r.control_id)
    );

    if (remainingControls.length === 0) {
      setConfigs((prev) =>
        prev.filter(
          (c) =>
            !(
              c.machine_name === r.machine_name &&
              c.control_name === r.control_name
            )
        )
      );
    }

    if (setupControl === r.control_name && remainingControls.length === 0) {
      const nextCtrls = reagents
        .filter(
          (item) =>
            item.control_id !== r.control_id &&
            item.machine_name === setupMachine
        )
        .map((item) => item.control_name);
      setSetupControl(nextCtrls[0] || "");
    }

    try {
      const draftStr = localStorage.getItem(STORAGE_KEYS.KIOSK_DRAFT);
      if (draftStr && remainingControls.length === 0) {
        const drafts = JSON.parse(draftStr);
        const testsInControl = configs.filter(
          (c) =>
            c.machine_name === r.machine_name &&
            c.control_name === r.control_name
        );
        let changed = false;
        testsInControl.forEach((t) => {
          if (drafts[t.test_id]) {
            delete drafts[t.test_id];
            changed = true;
          }
        });
        if (changed)
          localStorage.setItem(
            STORAGE_KEYS.KIOSK_DRAFT,
            JSON.stringify(drafts)
          );
      }
    } catch {}

    await rpcCall(
      apiUrl,
      "admin_delete_control",
      { control_id: r.control_id },
      authToken
    );
  };

  const handleLoadTestToEdit = (t: TestConfig) => {
    const anyT = t as any;
    setSetupSection(t.section);
    setSetupMachine(t.machine_name);
    setSetupControl(t.control_name);
    setEditingTestId(t.test_id);
    setActiveMuTab("L1");

    const ctrl1 = anyT.control_name_L1 || t.control_name;
    const ctrl2 = anyT.control_name_L2 || t.control_name;
    const ctrl3 = anyT.control_name_L3 || t.control_name;
    const hasMultiCtrl =
      (t.levels_count >= 2 && ctrl2 !== ctrl1) ||
      (t.levels_count === 3 && ctrl3 !== ctrl1);
    setUseSeparateControlPerLevel(hasMultiCtrl);

    const isLabRange = t.range_source && t.range_source !== "MANUFACTURER";
    setNewTestForm({
      test_name: t.test_name,
      unit: t.unit,
      standard_label: t.standard_label,
      test_type: t.test_type,
      levels_count: t.levels_count,
      range_source: t.range_source || "MANUFACTURER",
      range_active_days: String(t.range_active_days ?? (isLabRange ? 1 : 0)),
      range_applied_date: t.range_applied_date || runDate,
      accumulated_points: String(t.accumulated_points ?? 0),
      tea: t.tea !== undefined ? String(t.tea) : "",
      tea_unit: t.tea_unit || "PERCENT",
      is_exempt_long_rules: Boolean(t.is_exempt_long_rules),
      control_L1: ctrl1,
      control_L2: ctrl2,
      control_L3: ctrl3,
      mean_L1: String(isLabRange ? t.mean_L1 : t.mfg_mean_L1 || t.mean_L1),
      sd_L1: String(isLabRange ? t.sd_L1 : t.mfg_sd_L1 || t.sd_L1),
      mean_L2: String(isLabRange ? t.mean_L2 : t.mfg_mean_L2 || t.mean_L2),
      sd_L2: String(isLabRange ? t.sd_L2 : t.mfg_sd_L2 || t.sd_L2),
      mean_L3: String(isLabRange ? t.mean_L3 : t.mfg_mean_L3 || t.mean_L3),
      sd_L3: String(isLabRange ? t.sd_L3 : t.mfg_sd_L3 || t.sd_L3),
      mfg_mean_L1: String(t.mfg_mean_L1 || t.mean_L1 || ""),
      mfg_sd_L1: String(t.mfg_sd_L1 || t.sd_L1 || ""),
      mfg_mean_L2: String(t.mfg_mean_L2 || t.mean_L2 || ""),
      mfg_sd_L2: String(t.mfg_sd_L2 || t.sd_L2 || ""),
      mfg_mean_L3: String(t.mfg_mean_L3 || t.mean_L3 || ""),
      mfg_sd_L3: String(t.mfg_sd_L3 || t.sd_L3 || ""),
      expected_qual_L1: t.expected_qual_L1 || "ÂM TÍNH",
      expected_qual_L2: t.expected_qual_L2 || "DƯƠNG TÍNH",
      expected_qual_L3: t.expected_qual_L3 || "DƯƠNG TÍNH",
      mu_L1: levelMuConfigToDraft(t.mu_L1),
      mu_L2: levelMuConfigToDraft(t.mu_L2),
      mu_L3: levelMuConfigToDraft(t.mu_L3),
    });
    setActiveInfoTestId(null);
    setTimeout(() => {
      testFormRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }, 100);
  };

  const resetTestForm = () => {
    setEditingTestId(null);
    setActiveMuTab("L1");
    setNewTestForm({
      test_name: "",
      unit: "mmol/L",
      standard_label: "ISO",
      test_type: "QUANTITATIVE",
      levels_count: 2,
      range_source: "MANUFACTURER",
      range_active_days: "0",
      range_applied_date: runDate,
      accumulated_points: "0",
      tea: "10",
      tea_unit: "PERCENT",
      is_exempt_long_rules: false,
      control_L1: setupControl,
      control_L2: setupControl,
      control_L3: setupControl,
      mean_L1: "",
      sd_L1: "",
      mean_L2: "",
      sd_L2: "",
      mean_L3: "",
      sd_L3: "",
      mfg_mean_L1: "",
      mfg_sd_L1: "",
      mfg_mean_L2: "",
      mfg_sd_L2: "",
      mfg_mean_L3: "",
      mfg_sd_L3: "",
      expected_qual_L1: "ÂM TÍNH",
      expected_qual_L2: "DƯƠNG TÍNH",
      expected_qual_L3: "DƯƠNG TÍNH",
      mu_L1: emptyLevelMuDraft(),
      mu_L2: emptyLevelMuDraft(),
      mu_L3: emptyLevelMuDraft(),
    });
  };

  const handleSaveOrUpdateTestConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTestForm.test_name.trim()) return;

    const effCtrlL1 = useSeparateControlPerLevel
      ? newTestForm.control_L1 || setupControl
      : setupControl;
    const effCtrlL2 = useSeparateControlPerLevel
      ? newTestForm.control_L2 || effCtrlL1
      : setupControl;
    const effCtrlL3 = useSeparateControlPerLevel
      ? newTestForm.control_L3 || effCtrlL1
      : setupControl;

    if (!effCtrlL1) {
      setConfigMsg({
        type: "err",
        text: "Vui lòng khai báo hoặc chọn Hóa chất QC trước khi tạo xét nghiệm!",
      });
      return;
    }

    const isNumeric = newTestForm.test_type !== "QUALITATIVE";
    if (isNumeric && (!newTestForm.mean_L1 || !newTestForm.sd_L1)) {
      setConfigMsg({
        type: "err",
        text: "Vui lòng nhập đầy đủ Mean và SD của Mức 1 (L1)!",
      });
      return;
    }

    const rg1 = getActiveReagentLot(setupMachine, effCtrlL1);
    const rg2 = getActiveReagentLot(setupMachine, effCtrlL2) || rg1;
    const rg3 = getActiveReagentLot(setupMachine, effCtrlL3) || rg1;

    const lot1 = rg1?.lot_number || "CHUA-CO-LOT";
    const exp1 = rg1?.expiry_date || "2026-12-31";
    const lot2 = rg2?.lot_number || lot1;
    const exp2 = rg2?.expiry_date || exp1;
    const lot3 = rg3?.lot_number || lot1;
    const exp3 = rg3?.expiry_date || exp1;

    const siblings = getTestsForControl(setupMachine, effCtrlL1);

    const s1 = isNumeric ? parseFloat(newTestForm.sd_L1) || 0.1 : 0;
    const m1 = isNumeric ? parseFloat(newTestForm.mean_L1) || 1.0 : 0;
    const s2 =
      isNumeric && newTestForm.levels_count >= 2
        ? parseFloat(newTestForm.sd_L2) || roundSmartDecimal(s1 * 2, s1)
        : 0;
    const m2 =
      isNumeric && newTestForm.levels_count >= 2
        ? parseFloat(newTestForm.mean_L2) || roundSmartDecimal(m1 * 2, s1)
        : 0;
    const s3 =
      isNumeric && newTestForm.levels_count === 3
        ? parseFloat(newTestForm.sd_L3) || roundSmartDecimal(s1 * 3, s1)
        : 0;
    const m3 =
      isNumeric && newTestForm.levels_count === 3
        ? parseFloat(newTestForm.mean_L3) || roundSmartDecimal(m1 * 3, s1)
        : 0;

    const chosenRangeSource: RangeSourceType =
      newTestForm.range_source || "MANUFACTURER";
    const isUsingLabRange = chosenRangeSource !== "MANUFACTURER";
    const parsedActiveDays = isUsingLabRange
      ? Math.max(1, parseInt(newTestForm.range_active_days, 10) || 1)
      : 0;
    const parsedAccumulatedPts = Math.max(
      0,
      parseInt(newTestForm.accumulated_points, 10) || 0
    );

    const mfgM1 = isUsingLabRange
      ? parseFloat(newTestForm.mfg_mean_L1) || m1
      : m1;
    const mfgS1 = isUsingLabRange
      ? parseFloat(newTestForm.mfg_sd_L1) || s1
      : s1;
    const mfgM2 =
      newTestForm.levels_count >= 2
        ? isUsingLabRange
          ? parseFloat(newTestForm.mfg_mean_L2) || m2
          : m2
        : 0;
    const mfgS2 =
      newTestForm.levels_count >= 2
        ? isUsingLabRange
          ? parseFloat(newTestForm.mfg_sd_L2) || s2
          : s2
        : 0;
    const mfgM3 =
      newTestForm.levels_count === 3
        ? isUsingLabRange
          ? parseFloat(newTestForm.mfg_mean_L3) || m3
          : m3
        : 0;
    const mfgS3 =
      newTestForm.levels_count === 3
        ? isUsingLabRange
          ? parseFloat(newTestForm.mfg_sd_L3) || s3
          : s3
        : 0;

    const muL1Obj = draftToLevelMuConfig(newTestForm.mu_L1);
    const muL2Obj =
      newTestForm.levels_count >= 2
        ? draftToLevelMuConfig(newTestForm.mu_L2)
        : undefined;
    const muL3Obj =
      newTestForm.levels_count === 3
        ? draftToLevelMuConfig(newTestForm.mu_L3)
        : undefined;

    if (editingTestId) {
      let updatedRecord: TestConfig | null = null;
      setConfigs((prev) =>
        prev.map((c) => {
          if (c.test_id !== editingTestId) return c;
          const archivedBase = archiveOldLotOnClientIfChanged(
            c,
            lot1,
            exp1,
            runDate,
            effCtrlL1
          );
          const nextObj: any = {
            ...archivedBase,
            section: setupSection,
            machine_name: setupMachine,
            control_name: effCtrlL1,
            lot_number: lot1,
            expiry_date: exp1,
            control_name_L1: effCtrlL1,
            lot_number_L1: lot1,
            expiry_date_L1: exp1,
            control_name_L2:
              newTestForm.levels_count >= 2 ? effCtrlL2 : undefined,
            lot_number_L2: newTestForm.levels_count >= 2 ? lot2 : undefined,
            expiry_date_L2: newTestForm.levels_count >= 2 ? exp2 : undefined,
            control_name_L3:
              newTestForm.levels_count === 3 ? effCtrlL3 : undefined,
            lot_number_L3: newTestForm.levels_count === 3 ? lot3 : undefined,
            expiry_date_L3: newTestForm.levels_count === 3 ? exp3 : undefined,
            test_name: newTestForm.test_name.trim(),
            unit: newTestForm.unit.trim() || "Không đơn vị",
            standard_label: newTestForm.standard_label,
            test_type: newTestForm.test_type,
            levels_count: newTestForm.levels_count,
            tea: newTestForm.tea ? parseFloat(newTestForm.tea) : undefined,
            tea_unit: newTestForm.tea_unit,
            is_exempt_long_rules: newTestForm.is_exempt_long_rules,
            mfg_mean_L1: mfgM1,
            mfg_sd_L1: mfgS1,
            mfg_mean_L2: mfgM2,
            mfg_sd_L2: mfgS2,
            mfg_mean_L3: mfgM3,
            mfg_sd_L3: mfgS3,
            mean_L1: m1,
            sd_L1: s1,
            mean_L2: m2,
            sd_L2: s2,
            mean_L3: m3,
            sd_L3: s3,
            range_source: chosenRangeSource,
            range_active_days: parsedActiveDays,
            range_applied_date: isUsingLabRange
              ? newTestForm.range_applied_date ||
                archivedBase.range_applied_date ||
                runDate
              : undefined,
            accumulated_points: parsedAccumulatedPts,
            expected_qual_L1: newTestForm.expected_qual_L1,
            expected_qual_L2: newTestForm.expected_qual_L2,
            expected_qual_L3: newTestForm.expected_qual_L3,
            mu_L1: muL1Obj,
            mu_L2: muL2Obj,
            mu_L3: muL3Obj,
          };
          updatedRecord = nextObj as TestConfig;
          return nextObj as TestConfig;
        })
      );
      setConfigMsg({
        type: "ok",
        text: `Đã cập nhật xét nghiệm "${newTestForm.test_name.trim()}" (${
          isUsingLabRange
            ? `Range Phòng: ${parsedActiveDays} ngày`
            : "Range Hãng SX"
        }) & Hồ sơ MU đa mức!`,
      });
      resetTestForm();
      if (updatedRecord)
        await rpcCall(apiUrl, "save_config", updatedRecord, authToken);
      return;
    }

    const newCfg: any = {
      test_id: `T-${Date.now().toString().slice(-5)}`,
      section: setupSection,
      machine_name: setupMachine,
      control_name: effCtrlL1,
      lot_number: lot1,
      expiry_date: exp1,
      control_name_L1: effCtrlL1,
      lot_number_L1: lot1,
      expiry_date_L1: exp1,
      control_name_L2: newTestForm.levels_count >= 2 ? effCtrlL2 : undefined,
      lot_number_L2: newTestForm.levels_count >= 2 ? lot2 : undefined,
      expiry_date_L2: newTestForm.levels_count >= 2 ? exp2 : undefined,
      control_name_L3: newTestForm.levels_count === 3 ? effCtrlL3 : undefined,
      lot_number_L3: newTestForm.levels_count === 3 ? lot3 : undefined,
      expiry_date_L3: newTestForm.levels_count === 3 ? exp3 : undefined,
      test_name: newTestForm.test_name.trim(),
      unit: newTestForm.unit.trim() || "Không đơn vị",
      standard_label: newTestForm.standard_label,
      test_type: newTestForm.test_type,
      levels_count: newTestForm.levels_count,
      tea: newTestForm.tea ? parseFloat(newTestForm.tea) : undefined,
      tea_unit: newTestForm.tea_unit,
      is_exempt_long_rules: newTestForm.is_exempt_long_rules,
      order: siblings.length + 1,
      mfg_mean_L1: mfgM1,
      mfg_sd_L1: mfgS1,
      mfg_mean_L2: mfgM2,
      mfg_sd_L2: mfgS2,
      mfg_mean_L3: mfgM3,
      mfg_sd_L3: mfgS3,
      mean_L1: m1,
      sd_L1: s1,
      mean_L2: m2,
      sd_L2: s2,
      mean_L3: m3,
      sd_L3: s3,
      expected_qual_L1: newTestForm.expected_qual_L1,
      expected_qual_L2: newTestForm.expected_qual_L2,
      expected_qual_L3: newTestForm.expected_qual_L3,
      mu_L1: muL1Obj,
      mu_L2: muL2Obj,
      mu_L3: muL3Obj,
      range_source: chosenRangeSource,
      range_applied_date: isUsingLabRange
        ? newTestForm.range_applied_date || runDate
        : undefined,
      range_active_days: parsedActiveDays,
      accumulated_points: parsedAccumulatedPts,
      lot_history: [],
      history_L1: [],
      history_L2: [],
      history_L3: [],
    };
    setConfigs((prev) => [...prev, newCfg as TestConfig]);
    setConfigMsg({
      type: "ok",
      text: `Đã thêm xét nghiệm "${newCfg.test_name}" (${
        isUsingLabRange
          ? `Range Phòng đã dùng ${parsedActiveDays} ngày`
          : `Range Hãng SX · Lô ${lot1}`
      }) kèm Hồ sơ MU!`,
    });
    resetTestForm();
    await rpcCall(apiUrl, "save_config", newCfg, authToken);
  };

  const handleDropTest = async (targetTestId: string) => {
    if (!canReorderOrDelete || !draggedTestId || draggedTestId === targetTestId)
      return;
    const list = getTestsForControl(setupMachine, setupControl);
    const dragIdx = list.findIndex((t) => t.test_id === draggedTestId);
    const dropIdx = list.findIndex((t) => t.test_id === targetTestId);
    if (dragIdx < 0 || dropIdx < 0) return;
    const reordered = [...list];
    const [moved] = reordered.splice(dragIdx, 1);
    reordered.splice(dropIdx, 0, moved);
    const orderMap: Record<string, number> = {};
    reordered.forEach((t, idx) => {
      orderMap[t.test_id] = idx + 1;
    });
    setConfigs((prev) =>
      prev.map((c) =>
        orderMap[c.test_id] ? { ...c, order: orderMap[c.test_id] } : c
      )
    );
    setDraggedTestId(null);
    await rpcCall(
      apiUrl,
      "admin_reorder_configs",
      { order_map: orderMap },
      authToken
    );
  };

  const handleDeleteTest = async (testId: string) => {
    if (!canReorderOrDelete) return;
    if (!window.confirm("Bạn có chắc chắn muốn xóa xét nghiệm này?")) return;

    setConfigs((prev) => prev.filter((c) => c.test_id !== testId));

    try {
      const draftStr = localStorage.getItem(STORAGE_KEYS.KIOSK_DRAFT);
      if (draftStr) {
        const drafts = JSON.parse(draftStr);
        if (drafts[testId]) {
          delete drafts[testId];
          localStorage.setItem(
            STORAGE_KEYS.KIOSK_DRAFT,
            JSON.stringify(drafts)
          );
        }
      }
    } catch {}

    await rpcCall(
      apiUrl,
      "admin_delete_config",
      { test_id: testId },
      authToken
    );
  };

  const handleExecuteSmartCopy = async (payload: any) => {
    setIsSavingCopyWizard(true);
    const targetMacObj = labMachines.find(
      (m) => m.machine === payload.targetMachine
    );
    const targetSection = targetMacObj?.section || setupSection;

    let finalControlName = payload.targetControlName.trim();
    let finalLotNumber = "CHUA-CO-LOT";
    let finalExpiryDate = "2026-12-31";
    let newlyCreatedReagent: ReagentLotBM16 | null = null;

    if (payload.targetControlMode === "CREATE_NEW") {
      finalLotNumber = payload.newControlForm.lot_number.trim();
      finalExpiryDate = payload.newControlForm.expiry_date;
      const qtyNum = payload.newControlForm.is_manual_prep
        ? Math.max(
            1,
            parseInt(payload.newControlForm.quantity_prepared, 10) || 3
          )
        : undefined;
      newlyCreatedReagent = {
        control_id: `CTRL-${Date.now().toString().slice(-4)}`,
        section_name: targetSection,
        machine_name: payload.targetMachine,
        control_name: finalControlName,
        lot_number: finalLotNumber,
        expiry_date: finalExpiryDate,
        is_manual_prep: payload.newControlForm.is_manual_prep,
        prep_date: payload.newControlForm.prep_date || runDate,
        use_expiry_date: payload.newControlForm.is_manual_prep
          ? payload.newControlForm.use_expiry_date ||
            addDaysToIsoDate(payload.newControlForm.prep_date || runDate, 3)
          : finalExpiryDate,
        prep_by_id: currentUser.id,
        prep_by_name: currentUser.name,
        quantity_prepared: qtyNum,
        usage_count: 0,
        used_days_map: {},
        note: payload.newControlForm.is_manual_prep
          ? payload.newControlForm.note
          : "Mở nắp dùng ngay",
      };
    } else {
      const existingRg = getActiveReagentLot(
        payload.targetMachine,
        finalControlName
      );
      if (existingRg) {
        finalLotNumber = existingRg.lot_number;
        finalExpiryDate = existingRg.expiry_date;
      }
    }

    const existingTargetTests = getTestsForControl(
      payload.targetMachine,
      finalControlName
    );
    let orderCounter = existingTargetTests.length;
    const itemsToSaveBulk: TestConfig[] = [];

    payload.selectedSourceTests.forEach((src: TestConfig, idx: number) => {
      const existingMatch = existingTargetTests.find(
        (ex) =>
          ex.test_name.trim().toLowerCase() ===
          src.test_name.trim().toLowerCase()
      );
      if (existingMatch && payload.duplicatePolicy === "SKIP") return;
      const rowDraft = payload.gridDrafts[src.test_id];
      const isSkel = payload.copyMode === "SKELETON" && Boolean(rowDraft);

      const lvCount = isSkel ? rowDraft.levels_count : src.levels_count;
      const teaVal =
        isSkel && rowDraft.tea.trim() !== ""
          ? parseFloat(rowDraft.tea)
          : src.tea;
      const srcM1 = src.mfg_mean_L1 || src.mean_L1;
      const srcS1 = src.mfg_sd_L1 || src.sd_L1;
      const srcM2 = src.mfg_mean_L2 || src.mean_L2;
      const srcS2 = src.mfg_sd_L2 || src.sd_L2;
      const srcM3 = src.mfg_mean_L3 || src.mean_L3;
      const srcS3 = src.mfg_sd_L3 || src.sd_L3;

      const m1 =
        isSkel && rowDraft.m1.trim() !== ""
          ? parseFloat(rowDraft.m1) || srcM1
          : srcM1;
      const s1 =
        isSkel && rowDraft.sd1.trim() !== ""
          ? parseFloat(rowDraft.sd1) || srcS1
          : srcS1;
      const m2 =
        lvCount >= 2
          ? isSkel && rowDraft.m2.trim() !== ""
            ? parseFloat(rowDraft.m2) || srcM2
            : srcM2
          : 0;
      const s2 =
        lvCount >= 2
          ? isSkel && rowDraft.sd2.trim() !== ""
            ? parseFloat(rowDraft.sd2) || srcS2
            : srcS2
          : 0;
      const m3 =
        lvCount === 3
          ? isSkel && rowDraft.m3.trim() !== ""
            ? parseFloat(rowDraft.m3) || srcM3
            : srcM3
          : 0;
      const s3 =
        lvCount === 3
          ? isSkel && rowDraft.sd3.trim() !== ""
            ? parseFloat(rowDraft.sd3) || srcS3
            : srcS3
          : 0;
      const stdLabel: "ISO" | "THUONG" =
        payload.labelMode === "FORCE_ISO"
          ? "ISO"
          : payload.labelMode === "FORCE_THUONG"
          ? "THUONG"
          : src.standard_label;

      if (existingMatch && payload.duplicatePolicy === "OVERWRITE") {
        itemsToSaveBulk.push({
          ...existingMatch,
          section: targetSection,
          machine_name: payload.targetMachine,
          control_name: finalControlName,
          lot_number: finalLotNumber,
          expiry_date: finalExpiryDate,
          standard_label: stdLabel,
          levels_count: lvCount,
          tea: teaVal,
          mfg_mean_L1: m1,
          mfg_sd_L1: s1,
          mfg_mean_L2: m2,
          mfg_sd_L2: s2,
          mfg_mean_L3: m3,
          mfg_sd_L3: s3,
          mean_L1: m1,
          sd_L1: s1,
          mean_L2: m2,
          sd_L2: s2,
          mean_L3: m3,
          sd_L3: s3,
          expected_qual_L1: isSkel
            ? rowDraft.qual1
            : src.expected_qual_L1 || "ÂM TÍNH",
          expected_qual_L2: isSkel
            ? rowDraft.qual2
            : src.expected_qual_L2 || "DƯƠNG TÍNH",
          expected_qual_L3: isSkel
            ? rowDraft.qual3
            : src.expected_qual_L3 || "DƯƠNG TÍNH",
          range_source: "MANUFACTURER",
        });
      } else {
        orderCounter++;
        itemsToSaveBulk.push({
          ...src,
          test_id: `T-${Date.now().toString().slice(-4)}-${
            orderCounter + idx
          }-${Math.random().toString(36).slice(2, 4)}`,
          section: targetSection,
          machine_name: payload.targetMachine,
          control_name: finalControlName,
          lot_number: finalLotNumber,
          expiry_date: finalExpiryDate,
          standard_label: stdLabel,
          levels_count: lvCount,
          tea: teaVal,
          order: orderCounter,
          mfg_mean_L1: m1,
          mfg_sd_L1: s1,
          mfg_mean_L2: m2,
          mfg_sd_L2: s2,
          mfg_mean_L3: m3,
          mfg_sd_L3: s3,
          mean_L1: m1,
          sd_L1: s1,
          mean_L2: m2,
          sd_L2: s2,
          mean_L3: m3,
          sd_L3: s3,
          expected_qual_L1: isSkel
            ? rowDraft.qual1
            : src.expected_qual_L1 || "ÂM TÍNH",
          expected_qual_L2: isSkel
            ? rowDraft.qual2
            : src.expected_qual_L2 || "DƯƠNG TÍNH",
          expected_qual_L3: isSkel
            ? rowDraft.qual3
            : src.expected_qual_L3 || "DƯƠNG TÍNH",
          range_source: "MANUFACTURER",
          range_active_days: 0,
          accumulated_points: 0,
          lot_history: [],
          history_L1: [],
          history_L2: [],
          history_L3: [],
        });
      }
    });

    if (newlyCreatedReagent) {
      setReagents((prev) => [...prev, newlyCreatedReagent!]);
      await rpcCall(apiUrl, "save_control", newlyCreatedReagent, authToken);
    }
    setConfigs((prev) => {
      const map = new Map<string, TestConfig>();
      prev.forEach((c) => map.set(c.test_id, c));
      itemsToSaveBulk.forEach((item) => map.set(item.test_id, item));
      return Array.from(map.values());
    });
    setSetupSection(targetSection);
    setSetupMachine(payload.targetMachine);
    setSetupControl(finalControlName);
    await rpcCall(
      apiUrl,
      "save_configs_bulk",
      { items: itemsToSaveBulk },
      authToken
    );
    setIsSavingCopyWizard(false);
    setShowCopyWizard(false);
  };
  // ================= KẾT THÚC PHẦN 1/2 (DÁN TIẾP PHẦN 2/2 NGAY DƯỚI DÒNG NÀY) =================
  // ================= BẮT ĐẦU PHẦN 2/2 (DÁN NỐI TIẾP NGAY DƯỚI PHẦN 1/2) =================

  const renderLevelMuEditor = (lvKey: "L1" | "L2" | "L3") => {
    const fieldKey =
      lvKey === "L1" ? "mu_L1" : lvKey === "L2" ? "mu_L2" : "mu_L3";
    const draft = newTestForm[fieldKey];
    const meanStr =
      lvKey === "L1"
        ? newTestForm.mean_L1
        : lvKey === "L2"
        ? newTestForm.mean_L2
        : newTestForm.mean_L3;
    const meanVal = parseFloat(meanStr) || 0;
    const teaNum = parseFloat(newTestForm.tea) || 0;
    const limit075Pct =
      teaNum > 0
        ? newTestForm.tea_unit === "ABSOLUTE"
          ? meanVal > 0
            ? Number((((0.75 * teaNum) / meanVal) * 100).toFixed(2))
            : null
          : Number((0.75 * teaNum).toFixed(2))
        : null;

    let previewUc: number | null = null;
    let previewUe: number | null = null;
    if (draft.mu_mode === "INITIAL_VERIFICATION") {
      const ur = parseFloat(draft.verif_cvr) || 0;
      const ub = parseFloat(draft.verif_bias) || 0;
      if (ur > 0 || ub > 0) {
        previewUc = Number(Math.sqrt(ur * ur + ub * ub).toFixed(2));
        previewUe = Number((1.96 * previewUc).toFixed(2));
      }
    } else if (draft.mu_mode === "PERIODIC_IQC") {
      const urw = parseFloat(draft.urw_pooled) || 0;
      const ubias = parseFloat(draft.ubias_periodic) || 0;
      const ucal = parseFloat(draft.uc_cal) || 0;
      if (urw > 0 || ubias > 0 || ucal > 0) {
        previewUc = Number(
          Math.sqrt(urw * urw + ubias * ubias + ucal * ucal).toFixed(2)
        );
        previewUe = Number((2 * previewUc).toFixed(2));
      }
    } else if (draft.mu_mode === "MANUAL") {
      const m = parseFloat(draft.manual_mu) || 0;
      if (m > 0) {
        previewUc = Number((m / 2).toFixed(2));
        previewUe = Number(m.toFixed(2));
      }
    }

    const updateDraft = (patch: Partial<LevelMuDraft>) => {
      setNewTestForm((prev) => ({
        ...prev,
        [fieldKey]: { ...prev[fieldKey], ...patch },
      }));
    };

    return (
      <div className="bg-white/95 p-3 rounded-xl border border-indigo-200 space-y-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="font-black text-indigo-950 text-xs">
            Thiết lập ĐKBĐĐ cho {lvKey} (Nồng độ đích: {meanVal || "—"}{" "}
            {newTestForm.unit})
          </span>
          <select
            value={draft.mu_mode}
            onChange={(e) =>
              updateDraft({ mu_mode: e.target.value as MuModeType })
            }
            className="bg-indigo-50 border border-indigo-300 rounded-lg px-2.5 py-1 font-bold text-indigo-900 text-xs"
          >
            <option value="INITIAL_VERIFICATION">
              1. Thẩm định ban đầu (uR%, uB% · k=1.96)
            </option>
            <option value="PERIODIC_IQC">
              2. Định kỳ hàng năm (uRw%, uBias%, Ucal% · k=2.0)
            </option>
            <option value="MANUAL">3. Nhập tay trực tiếp Ue (%)</option>
            <option value="NONE">Chưa thiết lập ở mức này</option>
          </select>
        </div>

        {draft.mu_mode === "INITIAL_VERIFICATION" && (
          <div className="grid grid-cols-2 gap-2.5">
            <div>
              <label className="font-bold text-slate-600 block mb-1">
                1. ĐKBĐĐ của độ tái lặp uR (%)
              </label>
              <input
                type="number"
                step="any"
                onWheel={(e) => e.currentTarget.blur()}
                placeholder="VD: 8.0"
                value={draft.verif_cvr}
                onChange={(e) => updateDraft({ verif_cvr: e.target.value })}
                className="w-full border border-slate-300 rounded-lg px-2.5 py-1.5 font-mono font-bold"
              />
            </div>
            <div>
              <label className="font-bold text-slate-600 block mb-1">
                2. ĐKBĐĐ của độ chệch uB (%)
              </label>
              <input
                type="number"
                step="any"
                onWheel={(e) => e.currentTarget.blur()}
                placeholder="VD: 1.11"
                value={draft.verif_bias}
                onChange={(e) => updateDraft({ verif_bias: e.target.value })}
                className="w-full border border-slate-300 rounded-lg px-2.5 py-1.5 font-mono font-bold"
              />
            </div>
          </div>
        )}

        {draft.mu_mode === "PERIODIC_IQC" && (
          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="font-bold text-slate-600 block mb-1">
                uRw (%) — Pooled CV%
              </label>
              <input
                type="number"
                step="any"
                onWheel={(e) => e.currentTarget.blur()}
                placeholder="CV% Pooled"
                value={draft.urw_pooled}
                onChange={(e) => updateDraft({ urw_pooled: e.target.value })}
                className="w-full border border-slate-300 rounded-lg px-2 py-1.5 font-mono font-bold"
              />
            </div>
            <div>
              <label className="font-bold text-slate-600 block mb-1">
                uBias (%) — Ngoại kiểm
              </label>
              <input
                type="number"
                step="any"
                onWheel={(e) => e.currentTarget.blur()}
                placeholder="VD: 0.45"
                value={draft.ubias_periodic}
                onChange={(e) =>
                  updateDraft({ ubias_periodic: e.target.value })
                }
                className="w-full border border-slate-300 rounded-lg px-2 py-1.5 font-mono font-bold"
              />
            </div>
            <div>
              <label className="font-bold text-slate-600 block mb-1">
                Ucal (%) — Chất chuẩn
              </label>
              <input
                type="number"
                step="any"
                onWheel={(e) => e.currentTarget.blur()}
                placeholder="VD: 1.5"
                value={draft.uc_cal}
                onChange={(e) => updateDraft({ uc_cal: e.target.value })}
                className="w-full border border-slate-300 rounded-lg px-2 py-1.5 font-mono font-bold"
              />
            </div>
          </div>
        )}

        {draft.mu_mode === "MANUAL" && (
          <div>
            <label className="font-bold text-slate-600 block mb-1">
              Nhập trực tiếp ĐKBĐĐ mở rộng Ue (%):
            </label>
            <input
              type="number"
              step="any"
              onWheel={(e) => e.currentTarget.blur()}
              placeholder="VD: 15.83"
              value={draft.manual_mu}
              onChange={(e) => updateDraft({ manual_mu: e.target.value })}
              className="w-full border border-slate-300 rounded-lg px-2.5 py-1.5 font-mono font-bold"
            />
          </div>
        )}

        {previewUe !== null && (
          <div className="bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2 text-[11px] flex flex-wrap items-center justify-between gap-2">
            <div>
              <span>
                ĐKBĐĐ tổng hợp (uc): <b className="font-mono">{previewUc}%</b>
              </span>
              <span className="mx-2">·</span>
              <span>
                ĐKBĐĐ mở rộng (Ue):{" "}
                <b className="font-mono text-rose-700">{previewUe}%</b>
              </span>
              {limit075Pct !== null && (
                <>
                  <span className="mx-2">·</span>
                  <span>
                    Tiêu chuẩn (0.75×TEa):{" "}
                    <b className="font-mono">{limit075Pct}%</b> (
                    <b
                      className={
                        previewUe < limit075Pct
                          ? "text-emerald-700"
                          : "text-rose-600"
                      }
                    >
                      {previewUe < limit075Pct ? "Đạt" : "Không đạt"}
                    </b>
                    )
                  </span>
                </>
              )}
            </div>
            {meanVal > 0 && (
              <div className="font-mono font-black text-indigo-950 bg-white px-2 py-0.5 rounded border border-emerald-300">
                KQ ước tính: {meanVal} ± {previewUe}%
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  const isFormUsingLabRange = newTestForm.range_source !== "MANUFACTURER";
  const controlsOnSetupMachine = getControlsForMachine(setupMachine);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* ================================================================= */}
        {/* CỘT TRÁI: KHAI BÁO LÔ HÓA CHẤT QC (HỖ TRỢ ĐƠN LỌ & THEO BỘ L1-L3) */}
        {/* ================================================================= */}
        <div
          ref={reagentFormRef}
          onClick={() => {
            if (isReagentFormDimmed) setIsReagentFormDimmed(false);
          }}
          className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm relative transition-all"
        >
          <div className="border-b border-slate-100 pb-3 mb-4 flex flex-wrap items-center justify-between gap-2">
            <div>
              <span
                className={`px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase ${
                  editingReagentId
                    ? "bg-amber-100 text-amber-800"
                    : reagentForm.is_manual_prep
                    ? "bg-purple-100 text-purple-800"
                    : "bg-blue-100 text-blue-800"
                }`}
              >
                {editingReagentId
                  ? "Đang Chỉnh Sửa Hóa Chất QC"
                  : reagentForm.is_manual_prep
                  ? "Hóa chất Tự pha chế (Lưu vào BM.16)"
                  : "Hóa chất Mở nắp dùng ngay (Không lưu BM.16)"}
              </span>
              <h3 className="text-base font-black text-slate-900 mt-1">
                {editingReagentId
                  ? `Cập Nhật Lô Hóa Chất: ${reagentForm.control_name}`
                  : "Khai Báo Lô Hóa Chất QC Mới"}
              </h3>
            </div>

            {!editingReagentId ? (
              <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200 text-[11px] font-black">
                <button
                  type="button"
                  onClick={() => setReagentEntryMode("SINGLE")}
                  className={`px-2.5 py-1 rounded-lg transition ${
                    reagentEntryMode === "SINGLE"
                      ? "bg-blue-600 text-white shadow-xs"
                      : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  1 Lọ đơn
                </button>
                <button
                  type="button"
                  onClick={() => setReagentEntryMode("BATCH_SET")}
                  className={`px-2.5 py-1 rounded-lg transition ${
                    reagentEntryMode === "BATCH_SET"
                      ? "bg-indigo-600 text-white shadow-xs"
                      : "text-slate-600 hover:text-slate-900"
                  }`}
                  title="Khai báo cùng lúc 2 hoặc 3 lọ cho các mức nồng độ (L1, L2, L3)"
                >
                  ⚡ Theo Bộ (L1·L2·L3)
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setEditingReagentId(null);
                  setEditingOriginalControlName("");
                  setReagentForm((prev) => ({
                    ...prev,
                    control_name: "",
                    lot_number: "",
                    expiry_date: "",
                    prep_by_pw: "",
                    note: "",
                  }));
                }}
                className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold"
              >
                ✕ Hủy sửa
              </button>
            )}
          </div>

          {isReagentFormDimmed && (
            <div className="mb-3 bg-emerald-50 border border-emerald-300 rounded-2xl p-3 flex items-center justify-between text-xs font-bold text-emerald-900">
              <span>
                ✓ Đã lưu hóa chất xuống bảng <b>"Danh mục hóa chất QC"</b> bên
                dưới. Form đã được làm mờ.
              </span>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setIsReagentFormDimmed(false);
                  setReagentMsg(null);
                }}
                className="px-3 py-1 rounded-lg bg-emerald-600 text-white font-black text-[11px] shrink-0 ml-2"
              >
                + Khai báo lô tiếp theo
              </button>
            </div>
          )}

          <form
            onSubmit={handleSaveReagentLot}
            className={`grid grid-cols-2 gap-3.5 text-xs transition-opacity duration-300 ${
              isReagentFormDimmed
                ? "opacity-40 pointer-events-none select-none"
                : "opacity-100"
            }`}
          >
            <div>
              <label className="font-bold text-slate-700 block mb-1">
                Lab chuyên môn *
              </label>
              <select
                value={reagentForm.section_name}
                onChange={(e) => {
                  const sec = e.target.value;
                  const firstM = getMachinesForSection(sec)[0] || "";
                  setReagentForm({
                    ...reagentForm,
                    section_name: sec,
                    machine_name: firstM,
                  });
                }}
                className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 font-bold text-slate-800"
              >
                {sections.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="font-bold text-slate-700 block mb-1">
                Thiết bị chạy QC *
              </label>
              <select
                value={reagentForm.machine_name}
                onChange={(e) =>
                  setReagentForm({
                    ...reagentForm,
                    machine_name: e.target.value,
                  })
                }
                className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 font-bold text-slate-800"
              >
                {getMachinesForSection(reagentForm.section_name).map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </div>

            {/* NHẬP 1 LỌ ĐƠN HOẶC NHẬP NHANH TRỌN BỘ 2-3 MỨC (L1, L2, L3) */}
            {reagentEntryMode === "SINGLE" || editingReagentId ? (
              <>
                <div className="col-span-2">
                  <label className="font-bold text-slate-700 block mb-1">
                    Tên Hóa Chất QC (1 lọ tương ứng 1 mức nồng độ) *
                  </label>
                  <input
                    required
                    value={reagentForm.control_name}
                    onChange={(e) =>
                      setReagentForm({
                        ...reagentForm,
                        control_name: e.target.value,
                      })
                    }
                    placeholder="VD: Dade Ci-trol 1, XN CHECK L1, PreciControl ClinChem Multi 1..."
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 font-bold text-slate-900"
                  />
                </div>
                <div>
                  <label className="font-bold text-slate-700 block mb-1">
                    Số Lô (Lot) *
                  </label>
                  <input
                    required
                    value={reagentForm.lot_number}
                    onChange={(e) =>
                      setReagentForm({
                        ...reagentForm,
                        lot_number: e.target.value,
                      })
                    }
                    placeholder="VD: LOT-8841A"
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 font-mono font-bold"
                  />
                </div>
                <div>
                  <label className="font-bold text-slate-700 block mb-1">
                    Hạn sử dụng Lô (Date) *
                  </label>
                  <input
                    type="date"
                    required
                    value={reagentForm.expiry_date}
                    onChange={(e) =>
                      setReagentForm({
                        ...reagentForm,
                        expiry_date: e.target.value,
                      })
                    }
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 font-mono font-bold"
                  />
                </div>
              </>
            ) : (
              <div className="col-span-2 bg-indigo-50/70 border border-indigo-200 rounded-2xl p-3 space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="font-black text-indigo-950 text-[11px] uppercase">
                    ⚡ Khai báo nhanh Bộ QC nhiều mức (Mỗi mức 1 lọ & Số Lô
                    riêng)
                  </span>
                  <div className="flex items-center gap-1 text-[11px] font-bold">
                    <button
                      type="button"
                      onClick={() => setBatchSetCount(2)}
                      className={`px-2 py-0.5 rounded-lg border ${
                        batchSetCount === 2
                          ? "bg-indigo-600 text-white border-indigo-600"
                          : "bg-white text-slate-700 border-slate-300"
                      }`}
                    >
                      Bộ 2 Mức
                    </button>
                    <button
                      type="button"
                      onClick={() => setBatchSetCount(3)}
                      className={`px-2 py-0.5 rounded-lg border ${
                        batchSetCount === 3
                          ? "bg-indigo-600 text-white border-indigo-600"
                          : "bg-white text-slate-700 border-slate-300"
                      }`}
                    >
                      Bộ 3 Mức
                    </button>
                  </div>
                </div>

                {Array.from({ length: batchSetCount }).map((_, idx) => {
                  const item = batchVialsDraft[idx];
                  const lvLabel =
                    idx === 0
                      ? "Lọ Mức 1 (L1)"
                      : idx === 1
                      ? "Lọ Mức 2 (L2)"
                      : "Lọ Mức 3 (L3)";
                  const placeholderName =
                    idx === 0
                      ? "VD: Dade Ci-trol 1 / XN CHECK L1"
                      : idx === 1
                      ? "VD: Dade Ci-trol 2 / XN CHECK L2"
                      : "VD: Control P / XN CHECK L3";

                  return (
                    <div
                      key={idx}
                      className="grid grid-cols-12 gap-2 bg-white p-2 rounded-xl border border-indigo-100 items-center"
                    >
                      <div className="col-span-5">
                        <label className="text-[10px] font-black text-indigo-900 block mb-0.5">
                          {lvLabel} *
                        </label>
                        <input
                          value={item.control_name}
                          onChange={(e) => {
                            const val = e.target.value;
                            setBatchVialsDraft((prev) =>
                              prev.map((row, rIdx) =>
                                rIdx === idx
                                  ? { ...row, control_name: val }
                                  : row
                              )
                            );
                          }}
                          placeholder={placeholderName}
                          className="w-full bg-slate-50 border border-slate-300 rounded-lg px-2 py-1 font-bold text-slate-900 text-[11px]"
                        />
                      </div>
                      <div className="col-span-3">
                        <label className="text-[10px] font-bold text-slate-600 block mb-0.5">
                          Số Lô L{idx + 1} *
                        </label>
                        <input
                          value={item.lot_number}
                          onChange={(e) => {
                            const val = e.target.value;
                            setBatchVialsDraft((prev) =>
                              prev.map((row, rIdx) =>
                                rIdx === idx ? { ...row, lot_number: val } : row
                              )
                            );
                          }}
                          placeholder="Số Lot..."
                          className="w-full bg-slate-50 border border-slate-300 rounded-lg px-2 py-1 font-mono font-bold text-[11px]"
                        />
                      </div>
                      <div className="col-span-4">
                        <label className="text-[10px] font-bold text-slate-600 block mb-0.5">
                          HSD Lô L{idx + 1} *
                        </label>
                        <input
                          type="date"
                          value={item.expiry_date}
                          onChange={(e) => {
                            const val = e.target.value;
                            setBatchVialsDraft((prev) =>
                              prev.map((row, rIdx) =>
                                rIdx === idx
                                  ? { ...row, expiry_date: val }
                                  : row
                              )
                            );
                          }}
                          className="w-full bg-slate-50 border border-slate-300 rounded-lg px-1.5 py-1 font-mono font-bold text-[11px]"
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            <div className="col-span-2 bg-amber-50/80 border border-amber-200 rounded-2xl p-3 flex items-center justify-between">
              <label className="flex items-center gap-2.5 cursor-pointer font-bold text-amber-950">
                <input
                  type="checkbox"
                  checked={reagentForm.is_manual_prep}
                  onChange={(e) =>
                    setReagentForm({
                      ...reagentForm,
                      is_manual_prep: e.target.checked,
                    })
                  }
                  className="w-4 h-4 accent-amber-600 rounded"
                />
                <span>
                  Tick chọn nếu là Hóa chất tự pha chế (Đưa vào sổ BM.16 & cảnh
                  báo ≥ 75% SL pha)
                </span>
              </label>
            </div>
            <div className={reagentForm.is_manual_prep ? "" : "col-span-2"}>
              <label className="font-bold text-slate-700 block mb-1">
                {reagentForm.is_manual_prep ? "Ngày pha *" : "Ngày mở nắp *"}
              </label>
              <input
                type="date"
                required
                value={reagentForm.prep_date}
                onChange={(e) => {
                  const nextPrep = e.target.value;
                  setReagentForm({
                    ...reagentForm,
                    prep_date: nextPrep,
                    use_expiry_date: addDaysToIsoDate(nextPrep, 3),
                  });
                }}
                className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 font-mono font-bold"
              />
            </div>
            {reagentForm.is_manual_prep && (
              <>
                <div>
                  <label className="font-bold text-slate-700 block mb-1">
                    Hạn dùng sau khi pha (BM.16) *
                  </label>
                  <input
                    type="date"
                    required
                    value={reagentForm.use_expiry_date}
                    onChange={(e) =>
                      setReagentForm({
                        ...reagentForm,
                        use_expiry_date: e.target.value,
                      })
                    }
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 font-mono font-bold"
                  />
                </div>
                <div className={editingReagentId ? "" : "col-span-2"}>
                  <label className="font-bold text-slate-700 block mb-1">
                    Số lượng đã pha * (Cảnh báo ≥{" "}
                    {getReagentThreshold75(
                      parseInt(reagentForm.quantity_prepared, 10) || 3
                    )}{" "}
                    lần)
                  </label>
                  <input
                    type="number"
                    min={1}
                    required
                    onWheel={(e) => e.currentTarget.blur()}
                    value={reagentForm.quantity_prepared}
                    onChange={(e) =>
                      setReagentForm({
                        ...reagentForm,
                        quantity_prepared: e.target.value,
                      })
                    }
                    placeholder="VD: 3"
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 font-mono font-bold text-slate-900"
                  />
                </div>
                {editingReagentId && (
                  <div>
                    <label className="font-bold text-amber-800 block mb-1">
                      Số lần đã sử dụng (Hiệu chỉnh)
                    </label>
                    <input
                      type="number"
                      min={0}
                      onWheel={(e) => e.currentTarget.blur()}
                      value={reagentForm.usage_count}
                      onChange={(e) =>
                        setReagentForm({
                          ...reagentForm,
                          usage_count: e.target.value,
                        })
                      }
                      className="w-full bg-amber-50 border border-amber-300 rounded-xl px-3 py-2 font-mono font-bold text-amber-950"
                    />
                  </div>
                )}
                <div className="col-span-2">
                  <label className="font-bold text-slate-700 block mb-1">
                    Ghi chú (BM.16)
                  </label>
                  <input
                    value={reagentForm.note}
                    onChange={(e) =>
                      setReagentForm({ ...reagentForm, note: e.target.value })
                    }
                    placeholder="VD: Hoàn nguyên bằng 1ml nước cất 2 lần..."
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 font-semibold text-slate-800"
                  />
                </div>
              </>
            )}
            <div>
              <label className="font-bold text-indigo-700 block mb-1">
                {reagentForm.is_manual_prep
                  ? "ID Người pha *"
                  : "ID người mở nắp *"}
              </label>
              <input
                required
                value={reagentForm.prep_by_id}
                onChange={(e) =>
                  setReagentForm({ ...reagentForm, prep_by_id: e.target.value })
                }
                className="w-full bg-indigo-50/50 border border-indigo-200 rounded-xl px-3 py-2 font-mono font-bold"
              />
            </div>
            <div>
              <label className="font-bold text-indigo-700 block mb-1">
                Mật khẩu xác nhận *
              </label>
              <input
                type="password"
                required
                value={reagentForm.prep_by_pw}
                onChange={(e) =>
                  setReagentForm({ ...reagentForm, prep_by_pw: e.target.value })
                }
                placeholder={
                  reagentForm.is_manual_prep
                    ? "Nhập mật khẩu người pha..."
                    : "Nhập mật khẩu người mở nắp..."
                }
                className="w-full bg-indigo-50/50 border border-indigo-200 rounded-xl px-3 py-2 font-mono font-bold"
              />
            </div>
            {reagentMsg && (
              <div
                className={`col-span-2 p-2.5 rounded-xl font-bold ${
                  reagentMsg.type === "ok"
                    ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
                    : "bg-rose-50 text-rose-700 border border-rose-200"
                }`}
              >
                {reagentMsg.text}
              </div>
            )}
            <div className="col-span-2 pt-1">
              <button
                type="submit"
                className="w-full py-2.5 rounded-xl font-black uppercase bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-md hover:brightness-105 transition"
              >
                {editingReagentId
                  ? "✓ Lưu Cập Nhật Hóa Chất QC"
                  : reagentEntryMode === "BATCH_SET"
                  ? `⚡ Xác Nhận & Lưu Bộ ${batchSetCount} Lọ Hóa Chất QC`
                  : reagentForm.is_manual_prep
                  ? "Xác Nhận & Lưu Hóa Chất Tự Pha (BM.16)"
                  : "Xác Nhận & Lưu Hóa Chất Mở Nắp"}
              </button>
            </div>
          </form>
        </div>

        {/* ================================================================= */}
        {/* CỘT PHẢI: CẤU HÌNH XÉT NGHIỆM, ĐƠN VỊ THÔNG MINH & HỒ SƠ MU       */}
        {/* ================================================================= */}
        <div
          ref={testFormRef}
          className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm"
        >
          <div className="border-b border-slate-100 pb-3 mb-4 flex items-center justify-between gap-2">
            <div>
              <span
                className={`px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase ${
                  editingTestId
                    ? "bg-amber-100 text-amber-800"
                    : "bg-emerald-100 text-emerald-800"
                }`}
              >
                {editingTestId
                  ? "Đang Chỉnh Sửa Cấu Hình & MU"
                  : "Quản trị Danh mục"}
              </span>
              <h3 className="text-base font-black text-slate-900 mt-1">
                {editingTestId
                  ? `Cập Nhật: ${newTestForm.test_name}`
                  : "Cấu Hình Xét Nghiệm & Hồ Sơ MU"}
              </h3>
            </div>
            <div className="flex items-center gap-1.5">
              {canManageCatalog && (
                <button
                  type="button"
                  onClick={() => setShowCopyWizard(true)}
                  className="px-3.5 py-2 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-800 border-2 border-indigo-200 text-[11px] font-black transition flex items-center gap-1.5 shadow-sm"
                >
                  📋 Sao chép Test từ máy khác
                </button>
              )}
              {editingTestId && (
                <button
                  type="button"
                  onClick={resetTestForm}
                  className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold"
                >
                  ✕ Hủy sửa
                </button>
              )}
            </div>
          </div>

          <form
            onSubmit={handleSaveOrUpdateTestConfig}
            className="grid grid-cols-2 gap-3 text-xs max-h-[580px] overflow-y-auto pr-2"
          >
            <div>
              <label className="font-bold text-slate-700 block mb-1">
                Chọn Thiết bị *
              </label>
              <select
                value={setupMachine}
                onChange={(e) => {
                  const m = e.target.value;
                  const secObj = labMachines.find((x) => x.machine === m);
                  if (secObj) setSetupSection(secObj.section);
                  setSetupMachine(m);
                  const ctrls = getControlsForMachine(m);
                  const firstC = ctrls[0] || "";
                  setSetupControl(firstC);
                  setNewTestForm((prev) => ({
                    ...prev,
                    control_L1: firstC,
                    control_L2: ctrls[1] || firstC,
                    control_L3: ctrls[2] || firstC,
                  }));
                }}
                className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 font-bold text-blue-700"
              >
                {labMachines.map((x) => (
                  <option key={x.machine} value={x.machine}>
                    {x.machine} ({x.section})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="font-bold text-slate-700 block mb-1">
                {useSeparateControlPerLevel
                  ? "Hóa chất QC chính (Mức 1) *"
                  : "Chọn Hóa chất QC *"}
              </label>
              <select
                value={setupControl}
                onChange={(e) => {
                  const c = e.target.value;
                  setSetupControl(c);
                  setNewTestForm((prev) => ({
                    ...prev,
                    control_L1: c,
                  }));
                }}
                className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 font-bold text-purple-700"
              >
                {controlsOnSetupMachine.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>

            {/* TÙY CHỌN GẮN LỌ HÓA CHẤT / SỐ LÔ RIÊNG CHO TỪNG MỨC NỒNG ĐỘ */}
            <div className="col-span-2 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 flex items-center justify-between">
              <label className="flex items-center gap-2 cursor-pointer font-bold text-slate-800">
                <input
                  type="checkbox"
                  checked={useSeparateControlPerLevel}
                  onChange={(e) => {
                    const checked = e.target.checked;
                    setUseSeparateControlPerLevel(checked);
                    if (checked) {
                      setNewTestForm((prev) => ({
                        ...prev,
                        control_L1: prev.control_L1 || setupControl,
                        control_L2:
                          prev.control_L2 ||
                          controlsOnSetupMachine[1] ||
                          setupControl,
                        control_L3:
                          prev.control_L3 ||
                          controlsOnSetupMachine[2] ||
                          setupControl,
                      }));
                    }
                  }}
                  className="w-4 h-4 accent-indigo-600 rounded"
                />
                <span>
                  Mỗi mức nồng độ (L1, L2, L3) gắn với 1 lọ Hóa chất QC / Số Lô
                  riêng biệt
                </span>
              </label>
            </div>

            {/* TÊN XÉT NGHIỆM (CHỌN TÊN TỰ ĐỘNG GỢI Ý ĐÚNG ĐƠN VỊ CHUẨN) */}
            <div className="relative col-span-2">
              <label className="font-bold text-slate-700 block mb-1">
                Tên xét nghiệm (Gõ tìm hoặc nhập mới) *
              </label>
              <input
                required
                value={newTestForm.test_name}
                onFocus={() => setTestDropdownOpen(true)}
                onBlur={() => setTimeout(() => setTestDropdownOpen(false), 200)}
                onChange={(e) => {
                  const val = e.target.value;
                  const sInfo = getSmartUnitsForTest(val, setupSection);
                  setNewTestForm((prev) => ({
                    ...prev,
                    test_name: val,
                    unit: sInfo.matchedSpecific
                      ? sInfo.recommendedUnits[0]
                      : prev.unit,
                    is_exempt_long_rules: editingTestId
                      ? prev.is_exempt_long_rules
                      : isDefaultExemptTestName(val),
                  }));
                }}
                placeholder="VD: WBC, RBC, PT, Glucose, FT4, HBV-DNA..."
                className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 font-bold text-slate-900"
              />
              {testDropdownOpen && (
                <div className="absolute z-20 left-0 right-0 mt-1 max-h-48 overflow-y-auto bg-white border border-slate-200 rounded-xl shadow-lg">
                  {COMMON_TEST_NAMES.filter((n) =>
                    n
                      .toLowerCase()
                      .includes(newTestForm.test_name.toLowerCase())
                  ).map((n) => {
                    const uHint = getSmartUnitsForTest(n, setupSection)
                      .recommendedUnits.slice(0, 3)
                      .join(" · ");
                    return (
                      <button
                        type="button"
                        key={n}
                        onMouseDown={() => {
                          const sInfo = getSmartUnitsForTest(n, setupSection);
                          setNewTestForm((prev) => ({
                            ...prev,
                            test_name: n,
                            unit: sInfo.recommendedUnits[0] || prev.unit,
                            is_exempt_long_rules: editingTestId
                              ? prev.is_exempt_long_rules
                              : isDefaultExemptTestName(n),
                          }));
                          setTestDropdownOpen(false);
                        }}
                        className="w-full text-left px-3 py-1.5 hover:bg-blue-50 font-semibold text-slate-700 flex items-center justify-between"
                      >
                        <span>{n}</span>
                        <div className="flex items-center gap-1.5">
                          <span className="text-[10px] font-mono text-indigo-700 bg-indigo-50 px-1.5 py-0.5 rounded">
                            {uHint}
                          </span>
                          {isDefaultExemptTestName(n) && (
                            <span className="text-[10px] font-black px-2 py-0.5 rounded bg-amber-100 text-amber-800">
                              Ngoại lệ
                            </span>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* BỘ CHỌN ĐƠN VỊ ĐO THÔNG MINH THEO CHỈ SỐ XÉT NGHIỆM */}
            <div className="relative">
              <label className="font-bold text-slate-700 block mb-1">
                Đơn vị đo{" "}
                {smartUnitsInfo.matchedSpecific ? (
                  <span className="text-emerald-700 font-black">
                    (Đã lọc theo {newTestForm.test_name})
                  </span>
                ) : (
                  "(SI & Quốc tế) *"
                )}
              </label>
              <input
                required
                value={newTestForm.unit}
                onFocus={() => setUnitDropdownOpen(true)}
                onBlur={() => setTimeout(() => setUnitDropdownOpen(false), 200)}
                onChange={(e) =>
                  setNewTestForm({ ...newTestForm, unit: e.target.value })
                }
                placeholder="Chọn hoặc gõ đơn vị..."
                className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 font-mono font-bold text-slate-900"
              />
              {unitDropdownOpen && (
                <div className="absolute z-20 left-0 right-0 mt-1 max-h-56 overflow-y-auto bg-white border-2 border-indigo-200 rounded-xl shadow-xl p-1.5 space-y-1">
                  <div className="px-2 py-1 text-[10px] font-black uppercase text-indigo-800 bg-indigo-50 rounded-lg">
                    {smartUnitsInfo.matchedSpecific
                      ? `✓ Hệ đơn vị chuẩn của ${newTestForm.test_name}:`
                      : `Đơn vị gợi ý cho Lab ${setupSection}:`}
                  </div>
                  {smartUnitsInfo.recommendedUnits.map((u) => (
                    <button
                      type="button"
                      key={`rec-${u}`}
                      onMouseDown={() => {
                        setNewTestForm({ ...newTestForm, unit: u });
                        setUnitDropdownOpen(false);
                      }}
                      className={`w-full text-left px-2.5 py-1.5 rounded-lg font-mono font-bold text-xs flex items-center justify-between ${
                        newTestForm.unit === u
                          ? "bg-indigo-600 text-white"
                          : "hover:bg-indigo-50 text-slate-900"
                      }`}
                    >
                      <span>{u}</span>
                      <span className="text-[9.5px] font-sans opacity-75">
                        Chuẩn quốc tế
                      </span>
                    </button>
                  ))}

                  {!smartUnitsInfo.matchedSpecific && (
                    <>
                      <div className="px-2 py-1 text-[10px] font-bold uppercase text-slate-500 border-t border-slate-100 mt-1">
                        Tất cả đơn vị xét nghiệm:
                      </div>
                      {smartUnitsInfo.allUnits
                        .filter(
                          (u) =>
                            !smartUnitsInfo.recommendedUnits.includes(u) &&
                            u
                              .toLowerCase()
                              .includes(newTestForm.unit.toLowerCase())
                        )
                        .map((u) => (
                          <button
                            type="button"
                            key={`all-${u}`}
                            onMouseDown={() => {
                              setNewTestForm({ ...newTestForm, unit: u });
                              setUnitDropdownOpen(false);
                            }}
                            className="w-full text-left px-2.5 py-1 rounded-lg font-mono text-xs text-slate-700 hover:bg-slate-100"
                          >
                            {u}
                          </button>
                        ))}
                    </>
                  )}
                </div>
              )}
            </div>

            <div>
              <label className="font-bold text-indigo-700 block mb-1">
                Số mức nồng độ QC *
              </label>
              <select
                value={newTestForm.levels_count}
                onChange={(e) =>
                  setNewTestForm({
                    ...newTestForm,
                    levels_count: Number(e.target.value) as 1 | 2 | 3,
                  })
                }
                className="w-full bg-indigo-50 border border-indigo-200 rounded-xl px-3 py-2 font-extrabold text-indigo-900"
              >
                <option value={1}>1 Mức (Chỉ L1)</option>
                <option value={2}>2 Mức (L1, L2)</option>
                <option value={3}>3 Mức (L1, L2, L3)</option>
              </select>
            </div>

            <div>
              <label className="font-bold text-blue-800 block mb-1">
                Nhãn tiêu chuẩn *
              </label>
              <select
                value={newTestForm.standard_label}
                onChange={(e) =>
                  setNewTestForm({
                    ...newTestForm,
                    standard_label: e.target.value as "ISO" | "THUONG",
                  })
                }
                className="w-full bg-blue-50 border border-blue-200 rounded-xl px-3 py-2 font-black text-blue-900"
              >
                <option value="ISO">★ Đạt chuẩn ISO 15189:2022</option>
                <option value="THUONG">Xét nghiệm Thường quy</option>
              </select>
            </div>

            <div>
              <label className="font-bold text-teal-800 block mb-1">
                Phân loại xét nghiệm *
              </label>
              <select
                value={newTestForm.test_type}
                onChange={(e) =>
                  setNewTestForm({
                    ...newTestForm,
                    test_type: e.target.value as TestCategoryType,
                  })
                }
                className="w-full bg-teal-50 border border-teal-200 rounded-xl px-3 py-2 font-black text-teal-900"
              >
                <option value="QUANTITATIVE">Định lượng (Biểu đồ L-J)</option>
                <option value="SEMI_QUANTITATIVE">
                  Bán định lượng (Có số đo)
                </option>
                <option value="QUALITATIVE">
                  Định tính (Âm / Dương / Vết)
                </option>
              </select>
            </div>

            {/* KHỐI LỰA CHỌN NGUỒN DẢI CHUẨN (RANGE HÃNG / RANGE PHÒNG) & SỐ NGÀY ĐÃ DÙNG */}
            {newTestForm.test_type !== "QUALITATIVE" && (
              <div className="col-span-2 bg-purple-50/70 border border-purple-200 rounded-2xl p-3 space-y-2.5">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 items-end">
                  <div>
                    <label className="font-black text-purple-950 block mb-1">
                      Nguồn Dải Chuẩn Đang Áp Dụng *
                    </label>
                    <select
                      value={newTestForm.range_source}
                      onChange={(e) => {
                        const nextSrc = e.target.value as RangeSourceType;
                        setNewTestForm((prev) => ({
                          ...prev,
                          range_source: nextSrc,
                          range_active_days:
                            nextSrc === "MANUFACTURER"
                              ? "0"
                              : prev.range_active_days === "0" ||
                                !prev.range_active_days
                              ? "1"
                              : prev.range_active_days,
                          accumulated_points:
                            nextSrc === "LAB_OFFICIAL" &&
                            (prev.accumulated_points === "0" ||
                              !prev.accumulated_points)
                              ? "20"
                              : prev.accumulated_points,
                        }));
                      }}
                      className="w-full bg-white border-2 border-purple-300 rounded-xl px-2.5 py-1.5 font-black text-purple-950"
                    >
                      <option value="MANUFACTURER">
                        🏭 Range Nhà Sản Xuất (Mặc định)
                      </option>
                      <option value="LAB_TEMP">
                        ⏳ Range Tạm Thời Phòng XN (Đang chạy thử / &lt;20 điểm)
                      </option>
                      <option value="LAB_OFFICIAL">
                        ✓ Range Chính Thức Phòng XN (Đã thiết lập ≥20 điểm)
                      </option>
                    </select>
                  </div>

                  <div>
                    <label className="font-bold text-slate-700 block mb-1">
                      Số điểm QC tích lũy kế thừa (nếu có):
                    </label>
                    <input
                      type="number"
                      min={0}
                      onWheel={(e) => e.currentTarget.blur()}
                      value={newTestForm.accumulated_points}
                      onChange={(e) =>
                        setNewTestForm({
                          ...newTestForm,
                          accumulated_points: e.target.value,
                        })
                      }
                      placeholder="VD: 0, 6, 20..."
                      className="w-full bg-white border border-slate-300 rounded-xl px-2.5 py-1.5 font-mono font-bold text-slate-900"
                    />
                  </div>
                </div>

                {isFormUsingLabRange && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-2 border-t border-purple-200/80">
                    <div>
                      <label className="font-black text-purple-900 block mb-1">
                        Số ngày đã dùng Range Phòng (tính đến hiện tại) *
                      </label>
                      <input
                        type="number"
                        min={1}
                        required
                        onWheel={(e) => e.currentTarget.blur()}
                        value={newTestForm.range_active_days}
                        onChange={(e) =>
                          setNewTestForm({
                            ...newTestForm,
                            range_active_days: e.target.value,
                          })
                        }
                        placeholder="VD: 3 ngày, 6 ngày..."
                        className="w-full bg-white border-2 border-purple-400 rounded-xl px-2.5 py-1.5 font-mono font-black text-purple-950"
                      />
                    </div>
                    <div>
                      <label className="font-bold text-purple-900 block mb-1">
                        Ngày bắt đầu áp dụng Range Phòng:
                      </label>
                      <input
                        type="date"
                        value={newTestForm.range_applied_date}
                        onChange={(e) =>
                          setNewTestForm({
                            ...newTestForm,
                            range_applied_date: e.target.value,
                          })
                        }
                        className="w-full bg-white border border-purple-300 rounded-xl px-2.5 py-1.5 font-mono font-bold text-slate-800"
                      />
                    </div>
                  </div>
                )}
              </div>
            )}

            <div className="col-span-2 pt-1">
              {newTestForm.test_type !== "QUALITATIVE" ? (
                <div className="space-y-2.5">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    {/* THẺ MỨC 1 - L1 */}
                    <div className="bg-sky-50/70 border border-sky-200 p-2.5 rounded-xl space-y-1.5">
                      <label className="font-black text-sky-800 block">
                        Mức 1 - L1 (
                        {isFormUsingLabRange
                          ? "Mean & SD Phòng"
                          : "Mean & SD Hãng"}
                        ) *
                      </label>
                      {useSeparateControlPerLevel && (
                        <select
                          value={newTestForm.control_L1 || setupControl}
                          onChange={(e) => {
                            const c = e.target.value;
                            setSetupControl(c);
                            setNewTestForm({ ...newTestForm, control_L1: c });
                          }}
                          className="w-full bg-white border border-sky-300 rounded-lg px-2 py-1 font-bold text-sky-900 text-[11px]"
                        >
                          {controlsOnSetupMachine.map((c) => {
                            const rg = getActiveReagentLot(setupMachine, c);
                            return (
                              <option key={c} value={c}>
                                Lọ L1: {c} {rg ? `(Lô: ${rg.lot_number})` : ""}
                              </option>
                            );
                          })}
                        </select>
                      )}
                      <div className="flex gap-1.5">
                        <input
                          type="number"
                          step="any"
                          required
                          onWheel={(e) => e.currentTarget.blur()}
                          placeholder="Mean L1"
                          value={newTestForm.mean_L1}
                          onChange={(e) =>
                            setNewTestForm({
                              ...newTestForm,
                              mean_L1: e.target.value,
                            })
                          }
                          className="w-1/2 bg-white border border-sky-300 rounded-lg px-2 py-1.5 font-mono font-bold"
                        />
                        <input
                          type="number"
                          step="any"
                          required
                          onWheel={(e) => e.currentTarget.blur()}
                          placeholder="SD L1"
                          value={newTestForm.sd_L1}
                          onChange={(e) =>
                            setNewTestForm({
                              ...newTestForm,
                              sd_L1: e.target.value,
                            })
                          }
                          className="w-1/2 bg-white border border-sky-300 rounded-lg px-2 py-1.5 font-mono font-bold"
                        />
                      </div>
                    </div>

                    {/* THẺ MỨC 2 - L2 */}
                    {newTestForm.levels_count >= 2 && (
                      <div className="bg-purple-50/70 border border-purple-200 p-2.5 rounded-xl space-y-1.5">
                        <label className="font-black text-purple-800 block">
                          Mức 2 - L2 (
                          {isFormUsingLabRange
                            ? "Mean & SD Phòng"
                            : "Mean & SD Hãng"}
                          ) *
                        </label>
                        {useSeparateControlPerLevel && (
                          <select
                            value={newTestForm.control_L2 || setupControl}
                            onChange={(e) =>
                              setNewTestForm({
                                ...newTestForm,
                                control_L2: e.target.value,
                              })
                            }
                            className="w-full bg-white border border-purple-300 rounded-lg px-2 py-1 font-bold text-purple-900 text-[11px]"
                          >
                            {controlsOnSetupMachine.map((c) => {
                              const rg = getActiveReagentLot(setupMachine, c);
                              return (
                                <option key={c} value={c}>
                                  Lọ L2: {c}{" "}
                                  {rg ? `(Lô: ${rg.lot_number})` : ""}
                                </option>
                              );
                            })}
                          </select>
                        )}
                        <div className="flex gap-1.5">
                          <input
                            type="number"
                            step="any"
                            required
                            onWheel={(e) => e.currentTarget.blur()}
                            placeholder="Mean L2"
                            value={newTestForm.mean_L2}
                            onChange={(e) =>
                              setNewTestForm({
                                ...newTestForm,
                                mean_L2: e.target.value,
                              })
                            }
                            className="w-1/2 bg-white border border-purple-300 rounded-lg px-2 py-1.5 font-mono font-bold"
                          />
                          <input
                            type="number"
                            step="any"
                            required
                            onWheel={(e) => e.currentTarget.blur()}
                            placeholder="SD L2"
                            value={newTestForm.sd_L2}
                            onChange={(e) =>
                              setNewTestForm({
                                ...newTestForm,
                                sd_L2: e.target.value,
                              })
                            }
                            className="w-1/2 bg-white border border-purple-300 rounded-lg px-2 py-1.5 font-mono font-bold"
                          />
                        </div>
                      </div>
                    )}

                    {/* THẺ MỨC 3 - L3 */}
                    {newTestForm.levels_count === 3 && (
                      <div className="sm:col-span-2 bg-amber-50/80 border border-amber-200 p-2.5 rounded-xl space-y-1.5">
                        <label className="font-black text-amber-900 block">
                          Mức 3 - L3 (
                          {isFormUsingLabRange
                            ? "Mean & SD Phòng"
                            : "Mean & SD Hãng"}
                          ) *
                        </label>
                        {useSeparateControlPerLevel && (
                          <select
                            value={newTestForm.control_L3 || setupControl}
                            onChange={(e) =>
                              setNewTestForm({
                                ...newTestForm,
                                control_L3: e.target.value,
                              })
                            }
                            className="w-full bg-white border border-amber-300 rounded-lg px-2 py-1 font-bold text-amber-900 text-[11px]"
                          >
                            {controlsOnSetupMachine.map((c) => {
                              const rg = getActiveReagentLot(setupMachine, c);
                              return (
                                <option key={c} value={c}>
                                  Lọ L3: {c}{" "}
                                  {rg ? `(Lô: ${rg.lot_number})` : ""}
                                </option>
                              );
                            })}
                          </select>
                        )}
                        <div className="flex gap-2">
                          <input
                            type="number"
                            step="any"
                            required
                            onWheel={(e) => e.currentTarget.blur()}
                            placeholder="Mean L3"
                            value={newTestForm.mean_L3}
                            onChange={(e) =>
                              setNewTestForm({
                                ...newTestForm,
                                mean_L3: e.target.value,
                              })
                            }
                            className="w-1/2 bg-white border border-amber-300 rounded-lg px-2 py-1.5 font-mono font-bold"
                          />
                          <input
                            type="number"
                            step="any"
                            required
                            onWheel={(e) => e.currentTarget.blur()}
                            placeholder="SD L3"
                            value={newTestForm.sd_L3}
                            onChange={(e) =>
                              setNewTestForm({
                                ...newTestForm,
                                sd_L3: e.target.value,
                              })
                            }
                            className="w-1/2 bg-white border border-amber-300 rounded-lg px-2 py-1.5 font-mono font-bold"
                          />
                        </div>
                      </div>
                    )}
                  </div>

                  {/* TÙY CHỌN LƯU KÈM RANGE HÃNG SX GỐC KHI ĐANG CHỌN RANGE PHÒNG */}
                  {isFormUsingLabRange && (
                    <div className="bg-slate-50 border border-slate-200 p-2.5 rounded-xl space-y-2">
                      <div className="text-[11px] font-bold text-slate-600">
                        Range Hãng SX gốc (Tùy chọn nhập để lưu đối chiếu — Nếu
                        bỏ trống sẽ lấy bằng Range Phòng ở trên):
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                        <div className="flex gap-1">
                          <input
                            type="number"
                            step="any"
                            onWheel={(e) => e.currentTarget.blur()}
                            placeholder="Mean Hãng L1"
                            value={newTestForm.mfg_mean_L1}
                            onChange={(e) =>
                              setNewTestForm({
                                ...newTestForm,
                                mfg_mean_L1: e.target.value,
                              })
                            }
                            className="w-1/2 bg-white border border-slate-300 rounded-lg px-2 py-1 font-mono text-[11px]"
                          />
                          <input
                            type="number"
                            step="any"
                            onWheel={(e) => e.currentTarget.blur()}
                            placeholder="SD Hãng L1"
                            value={newTestForm.mfg_sd_L1}
                            onChange={(e) =>
                              setNewTestForm({
                                ...newTestForm,
                                mfg_sd_L1: e.target.value,
                              })
                            }
                            className="w-1/2 bg-white border border-slate-300 rounded-lg px-2 py-1 font-mono text-[11px]"
                          />
                        </div>
                        {newTestForm.levels_count >= 2 && (
                          <div className="flex gap-1">
                            <input
                              type="number"
                              step="any"
                              onWheel={(e) => e.currentTarget.blur()}
                              placeholder="Mean Hãng L2"
                              value={newTestForm.mfg_mean_L2}
                              onChange={(e) =>
                                setNewTestForm({
                                  ...newTestForm,
                                  mfg_mean_L2: e.target.value,
                                })
                              }
                              className="w-1/2 bg-white border border-slate-300 rounded-lg px-2 py-1 font-mono text-[11px]"
                            />
                            <input
                              type="number"
                              step="any"
                              onWheel={(e) => e.currentTarget.blur()}
                              placeholder="SD Hãng L2"
                              value={newTestForm.mfg_sd_L2}
                              onChange={(e) =>
                                setNewTestForm({
                                  ...newTestForm,
                                  mfg_sd_L2: e.target.value,
                                })
                              }
                              className="w-1/2 bg-white border border-slate-300 rounded-lg px-2 py-1 font-mono text-[11px]"
                            />
                          </div>
                        )}
                        {newTestForm.levels_count === 3 && (
                          <div className="flex gap-1">
                            <input
                              type="number"
                              step="any"
                              onWheel={(e) => e.currentTarget.blur()}
                              placeholder="Mean Hãng L3"
                              value={newTestForm.mfg_mean_L3}
                              onChange={(e) =>
                                setNewTestForm({
                                  ...newTestForm,
                                  mfg_mean_L3: e.target.value,
                                })
                              }
                              className="w-1/2 bg-white border border-slate-300 rounded-lg px-2 py-1 font-mono text-[11px]"
                            />
                            <input
                              type="number"
                              step="any"
                              onWheel={(e) => e.currentTarget.blur()}
                              placeholder="SD Hãng L3"
                              value={newTestForm.mfg_sd_L3}
                              onChange={(e) =>
                                setNewTestForm({
                                  ...newTestForm,
                                  mfg_sd_L3: e.target.value,
                                })
                              }
                              className="w-1/2 bg-white border border-slate-300 rounded-lg px-2 py-1 font-mono text-[11px]"
                            />
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div
                  className={`grid grid-cols-1 ${
                    newTestForm.levels_count === 3
                      ? "sm:grid-cols-3"
                      : newTestForm.levels_count === 2
                      ? "sm:grid-cols-2"
                      : "sm:grid-cols-1"
                  } gap-2.5 bg-emerald-50 p-3 rounded-xl border border-emerald-200`}
                >
                  <div>
                    <label className="font-black text-emerald-900 block mb-1">
                      Chứng Mức 1 (L1) *
                    </label>
                    <select
                      value={newTestForm.expected_qual_L1}
                      onChange={(e) =>
                        setNewTestForm({
                          ...newTestForm,
                          expected_qual_L1: e.target.value,
                        })
                      }
                      className="w-full bg-white border border-emerald-300 rounded-lg px-2 py-1.5 text-xs font-bold"
                    >
                      {QUALITATIVE_OPTIONS.map((opt) => (
                        <option key={opt} value={opt}>
                          {opt}
                        </option>
                      ))}
                    </select>
                  </div>
                  {newTestForm.levels_count >= 2 && (
                    <div>
                      <label className="font-black text-purple-900 block mb-1">
                        Chứng Mức 2 (L2) *
                      </label>
                      <select
                        value={newTestForm.expected_qual_L2}
                        onChange={(e) =>
                          setNewTestForm({
                            ...newTestForm,
                            expected_qual_L2: e.target.value,
                          })
                        }
                        className="w-full bg-white border border-purple-300 rounded-lg px-2 py-1.5 text-xs font-bold"
                      >
                        {QUALITATIVE_OPTIONS.map((opt) => (
                          <option key={opt} value={opt}>
                            {opt}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                  {newTestForm.levels_count === 3 && (
                    <div>
                      <label className="font-black text-amber-900 block mb-1">
                        Chứng Mức 3 (L3) *
                      </label>
                      <select
                        value={newTestForm.expected_qual_L3}
                        onChange={(e) =>
                          setNewTestForm({
                            ...newTestForm,
                            expected_qual_L3: e.target.value,
                          })
                        }
                        className="w-full bg-white border border-amber-300 rounded-lg px-2 py-1.5 text-xs font-bold"
                      >
                        {QUALITATIVE_OPTIONS.map((opt) => (
                          <option key={opt} value={opt}>
                            {opt}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>
              )}
            </div>

            {newTestForm.test_type !== "QUALITATIVE" && (
              <div className="col-span-2 bg-indigo-50/70 p-3.5 rounded-2xl border border-indigo-200 mt-1 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <label className="font-black text-indigo-950">
                      TEa (Tổng sai số cho phép):
                    </label>
                    <input
                      type="number"
                      step="any"
                      onWheel={(e) => e.currentTarget.blur()}
                      placeholder="VD: 15"
                      value={newTestForm.tea}
                      onChange={(e) =>
                        setNewTestForm({ ...newTestForm, tea: e.target.value })
                      }
                      className="w-20 bg-white border border-indigo-300 rounded-lg px-2 py-1 font-mono font-black text-indigo-900"
                    />
                    <select
                      value={newTestForm.tea_unit}
                      onChange={(e) =>
                        setNewTestForm({
                          ...newTestForm,
                          tea_unit: e.target.value as "PERCENT" | "ABSOLUTE",
                        })
                      }
                      className="bg-white border border-indigo-300 rounded-lg px-2 py-1 font-bold text-indigo-900 text-[11px]"
                    >
                      <option value="PERCENT">% (Tương đối)</option>
                      <option value="ABSOLUTE">
                        Số tuyệt đối ({newTestForm.unit || "Đơn vị đo"})
                      </option>
                    </select>
                  </div>
                  <span className="px-2.5 py-1 rounded-lg bg-white border border-indigo-200 font-mono font-bold text-[11px] text-emerald-800">
                    Tiêu chuẩn (0.75 × TEa) ={" "}
                    {newTestForm.tea
                      ? newTestForm.tea_unit === "PERCENT"
                        ? `${(
                            0.75 * (parseFloat(newTestForm.tea) || 0)
                          ).toFixed(2)}%`
                        : `${formatSmartDecimal(
                            0.75 * (parseFloat(newTestForm.tea) || 0),
                            parseFloat(newTestForm.sd_L1) || 0.01
                          )} ${newTestForm.unit}`
                      : "—"}
                  </span>
                </div>
                <div className="bg-amber-50/90 border border-amber-200 rounded-xl px-3 py-2 flex items-center justify-between gap-2 text-[11px]">
                  <label className="flex items-center gap-2 cursor-pointer font-bold text-amber-950">
                    <input
                      type="checkbox"
                      checked={newTestForm.is_exempt_long_rules}
                      onChange={(e) =>
                        setNewTestForm({
                          ...newTestForm,
                          is_exempt_long_rules: e.target.checked,
                        })
                      }
                      className="w-4 h-4 accent-amber-600 rounded"
                    />
                    <span>
                      Thuộc nhóm Test Ngoại lệ (Không xét quy tắc dài hạn 6x,
                      8x, 10x — Mặc định cho WBC, RBC, HGB, HCT, PLT)
                    </span>
                  </label>
                </div>
                <div className="flex items-center gap-1.5 border-b border-indigo-200 pb-2">
                  <span className="font-black text-indigo-900 text-[11px] mr-1">
                    Hồ sơ MU từng mức (BM.01.XN.QTQL.30):
                  </span>
                  <button
                    type="button"
                    onClick={() => setActiveMuTab("L1")}
                    className={`px-3 py-1 rounded-lg font-extrabold text-[11px] transition ${
                      activeMuTab === "L1"
                        ? "bg-sky-600 text-white shadow-sm"
                        : "bg-white text-slate-600 border border-slate-300"
                    }`}
                  >
                    Mức 1 (L1)
                  </button>
                  {newTestForm.levels_count >= 2 && (
                    <button
                      type="button"
                      onClick={() => setActiveMuTab("L2")}
                      className={`px-3 py-1 rounded-lg font-extrabold text-[11px] transition ${
                        activeMuTab === "L2"
                          ? "bg-purple-600 text-white shadow-sm"
                          : "bg-white text-slate-600 border border-slate-300"
                      }`}
                    >
                      Mức 2 (L2)
                    </button>
                  )}
                  {newTestForm.levels_count === 3 && (
                    <button
                      type="button"
                      onClick={() => setActiveMuTab("L3")}
                      className={`px-3 py-1 rounded-lg font-extrabold text-[11px] transition ${
                        activeMuTab === "L3"
                          ? "bg-amber-600 text-white shadow-sm"
                          : "bg-white text-slate-600 border border-slate-300"
                      }`}
                    >
                      Mức 3 (L3)
                    </button>
                  )}
                </div>
                {renderLevelMuEditor(activeMuTab)}
              </div>
            )}
            {configMsg && (
              <div
                className={`col-span-2 p-2.5 rounded-xl font-bold ${
                  configMsg.type === "ok"
                    ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
                    : "bg-rose-50 text-rose-700 border border-rose-200"
                }`}
              >
                {configMsg.text}
              </div>
            )}
            <div className="col-span-2 pt-2">
              <button
                type="submit"
                className={`w-full py-2.5 rounded-xl font-black uppercase text-white shadow-md transition ${
                  editingTestId
                    ? "bg-gradient-to-r from-amber-500 to-orange-600 hover:brightness-105"
                    : "bg-emerald-600 hover:bg-emerald-700"
                }`}
              >
                {editingTestId
                  ? "✓ Lưu Cập Nhật Xét Nghiệm & Hồ Sơ MU Đa Mức"
                  : "+ Lưu Xét Nghiệm Mới & Hồ Sơ MU Đa Mức"}
              </button>
            </div>
          </form>
        </div>
      </div>

      {/* ================================================================= */}
      {/* BẢNG QUẢN LÝ TẬP TRUNG LÔ HÓA CHẤT QC (GOM NHÓM LỌ CÙNG LÔ)      */}
      {/* ================================================================= */}
      <div className="bg-white border-2 border-blue-200 rounded-3xl p-5 shadow-sm space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3">
          <div>
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase bg-blue-600 text-white">
              Quản lý tập trung Lot QC
            </span>
            <h3 className="text-sm font-black text-slate-900 uppercase mt-1">
              Danh Mục Hóa Chất QC (Mở Nắp & Tự Pha Chế)
            </h3>
            <p className="text-xs text-slate-500">
              Tự động gom gọn các lọ khui ngắn ngày (3–4 ngày/lọ) theo cùng Số
              Lô và hỗ trợ Khui/Pha lọ tiếp theo chỉ với 1-Click.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="font-extrabold text-slate-600">Lọc Lab:</span>
            <select
              value={catalogLabFilter}
              onChange={(e) => {
                setCatalogLabFilter(e.target.value);
                setCatalogMachineFilter("Tất cả");
              }}
              className="bg-slate-50 border border-slate-300 rounded-xl px-3 py-1.5 font-bold text-slate-900"
            >
              <option value="Tất cả">Tất cả Lab ({reagents.length})</option>
              {sections.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
            <span className="font-extrabold text-slate-600">Lọc Máy:</span>
            <select
              value={catalogMachineFilter}
              onChange={(e) => setCatalogMachineFilter(e.target.value)}
              className="bg-slate-50 border border-slate-300 rounded-xl px-3 py-1.5 font-bold text-blue-700"
            >
              <option value="Tất cả">Tất cả thiết bị</option>
              {labMachines
                .filter(
                  (m) =>
                    catalogLabFilter === "Tất cả" ||
                    m.section === catalogLabFilter
                )
                .map((m) => (
                  <option key={m.machine} value={m.machine}>
                    {m.machine} ({m.section})
                  </option>
                ))}
            </select>
            <select
              value={catalogStatusFilter}
              onChange={(e) =>
                setCatalogStatusFilter(
                  e.target.value as "GROUPED_LOT" | "ALL" | "ACTIVE"
                )
              }
              className="bg-indigo-50 border border-indigo-200 rounded-xl px-3 py-1.5 font-bold text-indigo-900"
            >
              <option value="GROUPED_LOT">
                📦 Gom gọn theo Lô (Ẩn lọ cũ cùng Lô)
              </option>
              <option value="ACTIVE">Chỉ Lọ đang còn hạn / chưa hết</option>
              <option value="ALL">Hiện rời toàn bộ từng lọ đã khui/pha</option>
            </select>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-900 text-white uppercase text-[10.5px]">
                <th className="py-2.5 px-3 rounded-tl-xl w-10 text-center">
                  STT
                </th>
                <th className="py-2.5 px-3">Lab / Thiết bị</th>
                <th className="py-2.5 px-3">Tên hóa chất QC</th>
                <th className="py-2.5 px-3">Số Lô (Lot)</th>
                <th className="py-2.5 px-3">HSD Lô</th>
                <th className="py-2.5 px-3 text-center">Phân loại</th>
                <th className="py-2.5 px-3">Ngày mở nắp / Ngày pha</th>
                <th className="py-2.5 px-3">Người thực hiện</th>
                <th className="py-2.5 px-3 text-center">Theo dõi sử dụng</th>
                <th className="py-2.5 px-3 text-right rounded-tr-xl">
                  Thao tác
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {groupedReagentRows.map((grp, idx) => {
                const r = grp.latestVial;
                const reached75 = isReagentReached75(r);
                const isExpanded = Boolean(expandedGroupKeys[grp.groupKey]);

                return (
                  <React.Fragment key={grp.groupKey}>
                    <tr className="hover:bg-sky-50/50 transition">
                      <td className="py-2.5 px-3 text-center font-mono font-bold text-slate-500">
                        {idx + 1}
                      </td>
                      <td className="py-2.5 px-3 font-bold text-slate-800">
                        {r.section_name} ·{" "}
                        <span className="text-blue-700">{r.machine_name}</span>
                      </td>
                      <td className="py-2.5 px-3 font-black text-slate-900">
                        <button
                          type="button"
                          onClick={() => {
                            setSetupSection(r.section_name);
                            setSetupMachine(r.machine_name);
                            setSetupControl(r.control_name);
                          }}
                          className="hover:underline text-left text-indigo-950 block"
                        >
                          {r.control_name}
                        </button>
                        {grp.olderVials.length > 0 && (
                          <button
                            type="button"
                            onClick={() =>
                              setExpandedGroupKeys((prev) => ({
                                ...prev,
                                [grp.groupKey]: !prev[grp.groupKey],
                              }))
                            }
                            className="mt-1 px-2 py-0.5 rounded-md bg-indigo-50 hover:bg-indigo-100 text-indigo-800 border border-indigo-200 text-[10px] font-bold inline-flex items-center gap-1"
                          >
                            <span>
                              📦 Đã khui/pha {grp.totalVialsInLot} lọ trong Lô
                              này {isExpanded ? "▴" : "▾"}
                            </span>
                          </button>
                        )}
                      </td>
                      <td className="py-2.5 px-3 font-mono font-black text-blue-700">
                        {r.lot_number}
                      </td>
                      <td className="py-2.5 px-3 font-mono font-semibold text-slate-700">
                        {formatDateVN(r.expiry_date)}
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        {r.is_manual_prep ? (
                          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase bg-amber-100 text-amber-900 border border-amber-300 whitespace-nowrap">
                            Tự pha chế (BM.16)
                          </span>
                        ) : (
                          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase bg-sky-100 text-sky-900 border border-sky-300 whitespace-nowrap">
                            Mở nắp dùng ngay
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 px-3 font-mono text-slate-700">
                        <span className="text-[10.5px] font-sans font-bold text-slate-500 mr-1">
                          {r.is_manual_prep ? "Pha:" : "Mở nắp:"}
                        </span>
                        <b>{formatDateVN(r.prep_date)}</b>
                        {r.is_manual_prep && r.use_expiry_date && (
                          <span className="block text-[10px] text-amber-800">
                            Hạn sau pha: {formatDateVN(r.use_expiry_date)}
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 px-3 font-bold text-slate-800">
                        {r.prep_by_name}{" "}
                        <span className="text-[10.5px] font-mono text-slate-400">
                          ({r.prep_by_id})
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        {r.is_manual_prep ? (
                          <span
                            className={`px-2.5 py-0.5 rounded-lg font-mono text-[11px] font-black ${
                              reached75
                                ? "bg-rose-100 text-rose-800 border border-rose-300"
                                : "bg-emerald-50 text-emerald-800 border border-emerald-200"
                            }`}
                          >
                            {r.usage_count}/{r.quantity_prepared} lần (75%:{" "}
                            {getReagentThreshold75(r.quantity_prepared)})
                          </span>
                        ) : (
                          <span className="text-[11px] text-slate-500 font-semibold">
                            Đã chạy {r.usage_count} lần
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-1.5">
                          {canManageCatalog && (
                            <button
                              type="button"
                              onClick={() => handlePrepareNextVialFromTable(r)}
                              title="Khui hoặc pha lọ mới tiếp theo trong cùng Số Lô này (giữ nguyên Lô cũ cho BM.16)"
                              className="px-2.5 py-1 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300 font-black text-[11px] flex items-center gap-1"
                            >
                              🧪{" "}
                              {r.is_manual_prep
                                ? "Pha lọ tiếp"
                                : "Khui lọ tiếp"}
                            </button>
                          )}
                          {canManageCatalog && (
                            <button
                              type="button"
                              onClick={() => handleEditReagentFromTable(r)}
                              className="px-2.5 py-1 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 font-bold text-[11px] flex items-center gap-1"
                            >
                              <Ic.Edit /> Sửa
                            </button>
                          )}
                          {canReorderOrDelete && (
                            <button
                              type="button"
                              onClick={() => handleDeleteReagentFromTable(r)}
                              className="px-2.5 py-1 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 font-bold text-[11px] flex items-center gap-1"
                            >
                              <Ic.Trash /> Xóa
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>

                    {/* DANH SÁCH CÁC LỌ ĐÃ KHUI/PHA TRƯỚC ĐÓ TRONG CÙNG LÔ (XỔ XUỐNG KHI BẤM) */}
                    {isExpanded &&
                      grp.olderVials.map((oldVial, oIdx) => (
                        <tr
                          key={oldVial.control_id}
                          className="bg-slate-50/90 text-slate-600 text-[11px] border-l-4 border-l-indigo-400"
                        >
                          <td className="py-1.5 px-2 text-center font-mono text-slate-400">
                            ↳ {idx + 1}.{oIdx + 2}
                          </td>
                          <td className="py-1.5 px-3 italic text-slate-500">
                            Lọ cũ trong cùng Lô
                          </td>
                          <td className="py-1.5 px-3 font-bold text-slate-700">
                            {oldVial.control_name}
                          </td>
                          <td className="py-1.5 px-3 font-mono">
                            {oldVial.lot_number}
                          </td>
                          <td className="py-1.5 px-3 font-mono">
                            {formatDateVN(oldVial.expiry_date)}
                          </td>
                          <td className="py-1.5 px-3 text-center">
                            <span className="text-[10px] font-semibold text-slate-500">
                              {oldVial.is_manual_prep ? "Tự pha" : "Mở nắp"}
                            </span>
                          </td>
                          <td className="py-1.5 px-3 font-mono">
                            {oldVial.is_manual_prep ? "Pha:" : "Mở nắp:"}{" "}
                            <b>{formatDateVN(oldVial.prep_date)}</b>
                          </td>
                          <td className="py-1.5 px-3">
                            {oldVial.prep_by_name}
                          </td>
                          <td className="py-1.5 px-3 text-center font-mono">
                            {oldVial.is_manual_prep
                              ? `Đã dùng ${oldVial.usage_count}/${oldVial.quantity_prepared}`
                              : `Đã chạy ${oldVial.usage_count} lần`}
                          </td>
                          <td className="py-1.5 px-3 text-right">
                            <div className="inline-flex items-center gap-1">
                              {canManageCatalog && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    handleEditReagentFromTable(oldVial)
                                  }
                                  className="px-2 py-0.5 rounded bg-white hover:bg-blue-50 text-blue-700 border border-slate-300 font-bold text-[10px]"
                                >
                                  Sửa
                                </button>
                              )}
                              {canReorderOrDelete && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    handleDeleteReagentFromTable(oldVial)
                                  }
                                  className="px-2 py-0.5 rounded bg-white hover:bg-rose-50 text-rose-700 border border-slate-300 font-bold text-[10px]"
                                >
                                  Xóa
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* SẮP XẾP KÉO THẢ & XEM CHI TIẾT CẤU HÌNH XÉT NGHIỆM */}
      <div className="bg-white border border-slate-200 rounded-3xl p-5 shadow-sm space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-black text-slate-900 uppercase">
              Sắp Xếp & Quản Lý Danh Mục ({setupMachine} ·{" "}
              {setupControl || "Chưa chọn Control"})
            </h3>
            <p className="text-xs text-slate-500">
              Nhấp vào tên xét nghiệm để xem chi tiết cấu hình, kéo thả để đổi
              thứ tự.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2.5">
          {getTestsForControl(setupMachine, setupControl).map((t, i) => {
            const anyT = t as any;
            const isLabRange =
              t.range_source && t.range_source !== "MANUFACTURER";
            const hasMultiLots =
              (anyT.lot_number_L2 && anyT.lot_number_L2 !== t.lot_number) ||
              (anyT.lot_number_L3 && anyT.lot_number_L3 !== t.lot_number);

            return (
              <div key={t.test_id} className="relative group">
                <div
                  draggable={canReorderOrDelete}
                  onDragStart={() => setDraggedTestId(t.test_id)}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={() => handleDropTest(t.test_id)}
                  onClick={() =>
                    setActiveInfoTestId(
                      activeInfoTestId === t.test_id ? null : t.test_id
                    )
                  }
                  className={`flex items-center gap-2 px-3.5 py-2 rounded-xl border text-xs font-bold cursor-pointer transition ${
                    activeInfoTestId === t.test_id
                      ? "bg-sky-100 border-sky-400 ring-2 ring-sky-200"
                      : "bg-sky-50/70 border-sky-200 hover:border-blue-400"
                  }`}
                >
                  <span
                    className={`text-slate-400 hover:text-slate-700 ${
                      canReorderOrDelete ? "cursor-grab" : ""
                    }`}
                  >
                    <Ic.Grip />
                  </span>
                  <span className="w-5 h-5 rounded-md bg-blue-600 text-white font-mono text-[11px] flex items-center justify-center">
                    {i + 1}
                  </span>
                  <span className="text-slate-900">{t.test_name}</span>
                  <span className="font-mono text-[10px] text-slate-500">
                    ({t.unit})
                  </span>
                  {t.standard_label === "ISO" && (
                    <span className="rounded-full px-2 py-0.5 text-[9.5px] font-black uppercase bg-blue-600 text-white shadow-sm">
                      ISO 15189
                    </span>
                  )}
                  {isLabRange && (
                    <span className="rounded-full px-2 py-0.5 text-[9.5px] font-black uppercase bg-purple-600 text-white shadow-sm">
                      Range Phòng ({t.range_active_days} ngày)
                    </span>
                  )}
                  {hasMultiLots && (
                    <span className="rounded-full px-2 py-0.5 text-[9.5px] font-black uppercase bg-indigo-600 text-white shadow-sm">
                      Lô riêng từng mức
                    </span>
                  )}
                  {t.is_exempt_long_rules && (
                    <span className="rounded-full px-2 py-0.5 text-[9.5px] font-black uppercase bg-amber-500 text-white shadow-sm">
                      Ngoại lệ 6x/8x/10x
                    </span>
                  )}
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-white border border-slate-200 text-slate-600">
                    {t.levels_count} mức
                  </span>
                  {canManageCatalog && (
                    <button
                      type="button"
                      title="Sửa cấu hình & MU"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleLoadTestToEdit(t);
                      }}
                      className="ml-0.5 text-slate-400 hover:text-blue-600"
                    >
                      <Ic.Edit />
                    </button>
                  )}
                  {canReorderOrDelete && (
                    <button
                      type="button"
                      title="Xóa xét nghiệm"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteTest(t.test_id);
                      }}
                      className="text-slate-400 hover:text-rose-600"
                    >
                      <Ic.Trash />
                    </button>
                  )}
                </div>

                {activeInfoTestId === t.test_id && (
                  <div className="absolute z-30 top-full mt-2 left-0 w-80 sm:w-96 bg-white border-2 border-indigo-200 rounded-2xl shadow-2xl p-4">
                    <div className="flex items-center justify-between mb-2.5 border-b border-slate-100 pb-2">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-xs font-black uppercase text-indigo-950">
                          {t.test_name} ({t.unit})
                        </span>
                        {t.standard_label === "ISO" && (
                          <span className="rounded-full px-2 py-0.5 text-[9px] font-black uppercase bg-blue-600 text-white">
                            ISO 15189
                          </span>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => setActiveInfoTestId(null)}
                        className="text-slate-400 hover:text-slate-700 font-bold text-xs"
                      >
                        ✕
                      </button>
                    </div>
                    <div className="space-y-1.5 text-xs">
                      <div>
                        Lô QC Mức 1:{" "}
                        <b className="font-mono text-blue-700">
                          {anyT.control_name_L1 || t.control_name} · Lô{" "}
                          {anyT.lot_number_L1 || t.lot_number}
                        </b>
                      </div>
                      {t.levels_count >= 2 && (
                        <div>
                          Lô QC Mức 2:{" "}
                          <b className="font-mono text-purple-700">
                            {anyT.control_name_L2 || t.control_name} · Lô{" "}
                            {anyT.lot_number_L2 || t.lot_number}
                          </b>
                        </div>
                      )}
                      {t.levels_count === 3 && (
                        <div>
                          Lô QC Mức 3:{" "}
                          <b className="font-mono text-amber-700">
                            {anyT.control_name_L3 || t.control_name} · Lô{" "}
                            {anyT.lot_number_L3 || t.lot_number}
                          </b>
                        </div>
                      )}
                      <div>
                        Nguồn Range:{" "}
                        <b className="text-purple-800">
                          {t.range_source === "LAB_OFFICIAL"
                            ? `Range Chính thức Phòng (${t.range_active_days} ngày)`
                            : t.range_source === "LAB_TEMP"
                            ? `Range Tạm thời Phòng (${t.range_active_days} ngày)`
                            : "Range Hãng Sản Xuất"}
                        </b>
                      </div>
                      <div>
                        TEa áp dụng:{" "}
                        <b className="font-mono text-indigo-800">
                          {t.tea !== undefined
                            ? `${t.tea} ${
                                t.tea_unit === "ABSOLUTE" ? t.unit : "%"
                              }`
                            : "Chưa nhập"}
                        </b>
                      </div>
                      <div>
                        Range đang áp dụng:{" "}
                        <span className="font-mono font-black text-purple-800">
                          L1: {t.mean_L1}±{t.sd_L1}
                          {t.levels_count >= 2 && (
                            <>
                              {" "}
                              | L2: {t.mean_L2}±{t.sd_L2}
                            </>
                          )}
                          {t.levels_count === 3 && (
                            <>
                              {" "}
                              | L3: {t.mean_L3}±{t.sd_L3}
                            </>
                          )}
                        </span>
                      </div>

                      <div className="pt-2 border-t border-slate-100">
                        <span className="font-extrabold text-slate-700 block mb-1">
                          Lịch sử Lô đã lưu ({t.lot_history?.length || 0}/12
                          Lô):
                        </span>
                        <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
                          {t.lot_history && t.lot_history.length > 0 ? (
                            t.lot_history.slice(0, 12).map((lot, idx) => (
                              <div
                                key={idx}
                                className="bg-slate-50 border border-slate-200 p-2 rounded-lg text-[10.5px]"
                              >
                                <div className="flex justify-between">
                                  <span>
                                    Lot:{" "}
                                    <b className="font-mono text-sky-700">
                                      {lot.lot_number}
                                    </b>{" "}
                                    (N={lot.n_L1 ?? 30})
                                  </span>
                                  <span className="text-slate-500">
                                    Lưu: {formatDateVN(lot.archived_at)}
                                  </span>
                                </div>
                                <div className="font-mono mt-0.5 text-slate-700">
                                  L1: {lot.mean_L1}±{lot.sd_L1} (CV: {lot.cv_L1}
                                  %){" "}
                                  {t.levels_count >= 2 && (
                                    <>
                                      | L2: {lot.mean_L2}±{lot.sd_L2} (CV:{" "}
                                      {lot.cv_L2}%)
                                    </>
                                  )}
                                </div>
                              </div>
                            ))
                          ) : (
                            <div className="text-slate-400 italic text-[11px]">
                              Chưa có lịch sử Lot cũ.
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="pt-2 flex justify-between gap-2">
                        {t.test_type !== "QUALITATIVE" && (
                          <button
                            type="button"
                            onClick={() => onNavigateToAssistant(t.test_id)}
                            className="px-3 py-1.5 rounded-xl bg-purple-100 hover:bg-purple-200 text-purple-900 font-black text-[11px]"
                          >
                            Mở Trợ lý Range & MU →
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => handleLoadTestToEdit(t)}
                          className="px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-black text-[11px] shadow-sm ml-auto"
                        >
                          Nạp vào Form để Sửa
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {showCopyWizard && (
        <SaoChepThongMinh
          labMachines={labMachines}
          reagents={reagents}
          configs={configs}
          getControlsForMachine={getControlsForMachine}
          getTestsForControl={getTestsForControl}
          onClose={() => setShowCopyWizard(false)}
          onExecuteCopy={handleExecuteSmartCopy}
          isSaving={isSavingCopyWizard}
          setupMachineFallback={setupMachine}
        />
      )}
    </div>
  );
}
// ================= KẾT THÚC TOÀN BỘ FILE QuanLyDanhMuc.tsx =================
