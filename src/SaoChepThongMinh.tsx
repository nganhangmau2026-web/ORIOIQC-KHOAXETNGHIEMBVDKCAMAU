import React, { useState, useEffect, useMemo, useCallback } from "react";
import {
  TestConfig,
  ReagentLotBM16,
  getVnIsoDateString,
  addDaysToIsoDate,
  QUALITATIVE_OPTIONS,
} from "./KieuDuLieu";

// ============================================================================
// FILE 6: src/SaoChepThongMinh.tsx (V7.1 SMART CLONE WIZARD — 3 LEVELS FULL)
// - Sao chép danh mục xét nghiệm siêu tốc giữa các Thiết bị & Hóa chất QC.
// - Hỗ trợ 2 chế độ: Copy toàn bộ (FULL) hoặc Copy bộ khung nhập Mean/SD mới (SKELETON).
// - Đầy đủ tùy chọn Nhãn tiêu chuẩn (Giữ nguyên / Ép chuẩn ISO 15189 / Ép Thường).
// - Đầy đủ tùy chọn Xử lý trùng tên Test (Bỏ qua / Ghi đè) & Khai báo Lô tự pha BM.16.
// - Bảng lưới Bước 3 hỗ trợ đầy đủ cả 3 Mức (L1, L2, L3), TEa và Xét nghiệm Định tính.
// ✦ An intellectual product by Handsome Long ✦
// ============================================================================

export interface WizardGridRowDraft {
  levels_count: 1 | 2 | 3;
  tea: string;
  m1: string;
  sd1: string;
  m2: string;
  sd2: string;
  m3: string;
  sd3: string;
  qual1: string;
  qual2: string;
  qual3: string;
}

export interface SaoChepThongMinhProps {
  labMachines: { section: string; machine: string }[];
  reagents: ReagentLotBM16[];
  configs: TestConfig[];
  getControlsForMachine: (m: string) => string[];
  getTestsForControl: (m: string, c: string) => TestConfig[];
  onClose: () => void;
  onExecuteCopy: (payload: any) => void;
  isSaving: boolean;
  setupMachineFallback: string;
}

export default function SaoChepThongMinh({
  labMachines,
  reagents,
  configs,
  getControlsForMachine,
  getTestsForControl,
  onClose,
  onExecuteCopy,
  isSaving,
  setupMachineFallback,
}: SaoChepThongMinhProps) {
  const runDate = getVnIsoDateString();
  const defaultSrcMac =
    labMachines.find((m) => m.machine !== setupMachineFallback)?.machine ||
    labMachines[0]?.machine ||
    "";

  const [cwStep, setCwStep] = useState<1 | 2 | 3>(1);
  const [cwSrcMachine, setCwSrcMachine] = useState<string>(defaultSrcMac);
  const [cwSrcControl, setCwSrcControl] = useState<string>(
    getControlsForMachine(defaultSrcMac)[0] || ""
  );
  const [cwSelectedTestIds, setCwSelectedTestIds] = useState<string[]>([]);

  const [cwTargetMachine, setCwTargetMachine] =
    useState<string>(setupMachineFallback);
  const [cwTargetControlMode, setCwTargetControlMode] = useState<
    "EXISTING" | "CREATE_NEW"
  >(() =>
    getControlsForMachine(setupMachineFallback).length > 0
      ? "EXISTING"
      : "CREATE_NEW"
  );
  const [cwTargetControl, setCwTargetControl] = useState<string>(
    getControlsForMachine(setupMachineFallback)[0] || ""
  );

  const [cwNewControlForm, setCwNewControlForm] = useState({
    control_name: cwSrcControl || "QC Control",
    lot_number: "",
    expiry_date: addDaysToIsoDate(runDate, 180),
    is_manual_prep: false,
    prep_date: runDate,
    use_expiry_date: addDaysToIsoDate(runDate, 3),
    quantity_prepared: "3",
    note: "",
  });

  const [cwCopyMode, setCwCopyMode] = useState<"FULL" | "SKELETON">("FULL");
  const [cwLabelMode, setCwLabelMode] = useState<
    "KEEP" | "FORCE_ISO" | "FORCE_THUONG"
  >("KEEP");
  const [cwDuplicatePolicy, setCwDuplicatePolicy] = useState<
    "SKIP" | "OVERWRITE"
  >("SKIP");
  const [cwGridDrafts, setCwGridDrafts] = useState<
    Record<string, WizardGridRowDraft>
  >({});

  const getLatestLotLabelForControl = useCallback(
    (machineName: string, ctrlName: string): string => {
      const matched = (reagents || []).filter(
        (r) => r.machine_name === machineName && r.control_name === ctrlName
      );
      const latest = matched[matched.length - 1];
      return latest?.lot_number ? ` (Lô: ${latest.lot_number})` : "";
    },
    [reagents]
  );

  const sourceTestsList = useMemo(
    () => getTestsForControl(cwSrcMachine, cwSrcControl),
    [cwSrcMachine, cwSrcControl, configs, getTestsForControl]
  );

  useEffect(() => {
    setCwSelectedTestIds(sourceTestsList.map((t) => t.test_id));
  }, [sourceTestsList]);

  const selectedSourceTests = useMemo(
    () =>
      sourceTestsList.filter(
        (t) => cwSelectedTestIds.indexOf(t.test_id) !== -1
      ),
    [sourceTestsList, cwSelectedTestIds]
  );

  const handleNextToTarget = () => {
    if (cwSelectedTestIds.length === 0) {
      window.alert("Vui lòng chọn ít nhất 1 xét nghiệm để sao chép!");
      return;
    }
    setCwStep(2);
  };

  const handleNextToFinal = () => {
    if (!cwTargetMachine) {
      window.alert("Vui lòng chọn Thiết bị đích!");
      return;
    }
    if (cwTargetControlMode === "EXISTING" && !cwTargetControl.trim()) {
      window.alert(
        "Thiết bị đích chưa có Hóa chất QC. Vui lòng chọn Khai báo Hóa chất QC mới!"
      );
      return;
    }
    if (
      cwTargetControlMode === "CREATE_NEW" &&
      (!cwNewControlForm.control_name.trim() ||
        !cwNewControlForm.lot_number.trim() ||
        !cwNewControlForm.expiry_date)
    ) {
      window.alert(
        "Vui lòng nhập đầy đủ Tên, Số Lô (Lot) và Hạn sử dụng cho Hóa chất mới!"
      );
      return;
    }

    if (cwCopyMode === "FULL") {
      onExecuteCopy({
        selectedSourceTests,
        targetMachine: cwTargetMachine,
        targetControlMode: cwTargetControlMode,
        targetControlName:
          cwTargetControlMode === "EXISTING"
            ? cwTargetControl
            : cwNewControlForm.control_name,
        newControlForm: cwNewControlForm,
        copyMode: cwCopyMode,
        labelMode: cwLabelMode,
        duplicatePolicy: cwDuplicatePolicy,
        gridDrafts: {},
      });
    } else {
      const drafts: Record<string, WizardGridRowDraft> = {};
      selectedSourceTests.forEach((t) => {
        drafts[t.test_id] = {
          levels_count: t.levels_count,
          tea: t.tea !== undefined ? String(t.tea) : "10",
          m1: String(t.mfg_mean_L1 || t.mean_L1 || ""),
          sd1: String(t.mfg_sd_L1 || t.sd_L1 || ""),
          m2:
            t.levels_count >= 2 ? String(t.mfg_mean_L2 || t.mean_L2 || "") : "",
          sd2: t.levels_count >= 2 ? String(t.mfg_sd_L2 || t.sd_L2 || "") : "",
          m3:
            t.levels_count === 3
              ? String(t.mfg_mean_L3 || t.mean_L3 || "")
              : "",
          sd3: t.levels_count === 3 ? String(t.mfg_sd_L3 || t.sd_L3 || "") : "",
          qual1: t.expected_qual_L1 || "ÂM TÍNH",
          qual2: t.expected_qual_L2 || "DƯƠNG TÍNH",
          qual3: t.expected_qual_L3 || "DƯƠNG TÍNH",
        };
      });
      setCwGridDrafts(drafts);
      setCwStep(3);
    }
  };

  const handleFinalSubmit = () => {
    onExecuteCopy({
      selectedSourceTests,
      targetMachine: cwTargetMachine,
      targetControlMode: cwTargetControlMode,
      targetControlName:
        cwTargetControlMode === "EXISTING"
          ? cwTargetControl
          : cwNewControlForm.control_name,
      newControlForm: cwNewControlForm,
      copyMode: cwCopyMode,
      labelMode: cwLabelMode,
      duplicatePolicy: cwDuplicatePolicy,
      gridDrafts: cwGridDrafts,
    });
  };

  const updateRowDraft = (
    testId: string,
    patch: Partial<WizardGridRowDraft>
  ) => {
    setCwGridDrafts((prev) => ({
      ...prev,
      [testId]: {
        ...prev[testId],
        ...patch,
      },
    }));
  };

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white border-2 border-indigo-200 rounded-3xl shadow-2xl max-w-5xl w-full flex flex-col max-h-[92vh] overflow-hidden">
        {/* HEADER */}
        <div className="p-5 border-b border-indigo-100 flex justify-between items-center bg-gradient-to-r from-indigo-50 via-sky-50 to-white">
          <div>
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase bg-indigo-600 text-white">
              Trợ lý Nhân bản Cấu hình Nhanh (Bước {cwStep}/
              {cwCopyMode === "SKELETON" ? "3" : "2"})
            </span>
            <h2 className="text-base font-black text-indigo-950 mt-1">
              📋 Sao Chép Danh Mục Xét Nghiệm & Hóa Chất QC Giữa Các Máy
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 rounded-xl bg-white hover:bg-slate-100 border border-slate-200 font-bold text-slate-600 text-xs"
          >
            ✕ Đóng
          </button>
        </div>

        {/* BODY */}
        <div className="p-6 overflow-y-auto flex-1 text-xs space-y-5">
          {/* =============================================================== */}
          {/* BƯỚC 1: CHỌN MÁY NGUỒN, CONTROL NGUỒN VÀ CÁC XÉT NGHIỆM         */}
          {/* =============================================================== */}
          {cwStep === 1 && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-black text-slate-900 uppercase">
                  Bước 1: Chọn Thiết Bị Nguồn & Các Xét Nghiệm Cần Sao Chép
                </h3>
                <span className="text-xs font-bold text-indigo-700 bg-indigo-50 px-3 py-1 rounded-xl border border-indigo-200">
                  Đã chọn: {cwSelectedTestIds.length}/{sourceTestsList.length}{" "}
                  xét nghiệm
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-slate-50 p-4 rounded-2xl border border-slate-200">
                <div>
                  <label className="block mb-1 font-bold text-slate-700">
                    1. Máy xét nghiệm nguồn:
                  </label>
                  <select
                    value={cwSrcMachine}
                    onChange={(e) => {
                      const m = e.target.value;
                      setCwSrcMachine(m);
                      const firstCtrl = getControlsForMachine(m)[0] || "";
                      setCwSrcControl(firstCtrl);
                    }}
                    className="w-full border border-slate-300 p-2.5 rounded-xl bg-white font-bold text-blue-800"
                  >
                    {labMachines.map((m) => (
                      <option key={m.machine} value={m.machine}>
                        {m.machine} ({m.section})
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block mb-1 font-bold text-slate-700">
                    2. Hóa chất QC nguồn:
                  </label>
                  <select
                    value={cwSrcControl}
                    onChange={(e) => setCwSrcControl(e.target.value)}
                    className="w-full border border-slate-300 p-2.5 rounded-xl bg-white font-bold text-purple-800"
                  >
                    {getControlsForMachine(cwSrcMachine).map((c) => (
                      <option key={c} value={c}>
                        {c}
                        {getLatestLotLabelForControl(cwSrcMachine, c)}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="border border-slate-200 rounded-2xl p-4 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2 pb-2.5 border-b border-slate-100">
                  <span className="font-black text-slate-800 uppercase">
                    Danh sách xét nghiệm của {cwSrcMachine} (
                    {cwSrcControl || "—"}
                    ):
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        setCwSelectedTestIds(
                          sourceTestsList.map((t) => t.test_id)
                        )
                      }
                      className="px-2.5 py-1 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-800 font-bold"
                    >
                      ✓ Chọn tất cả
                    </button>
                    <button
                      type="button"
                      onClick={() => setCwSelectedTestIds([])}
                      className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold"
                    >
                      Bỏ chọn hết
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2 max-h-64 overflow-y-auto pr-1">
                  {sourceTestsList.map((t, i) => {
                    const checked = cwSelectedTestIds.indexOf(t.test_id) !== -1;
                    return (
                      <label
                        key={t.test_id}
                        className={`flex items-center gap-2.5 p-2.5 rounded-xl border cursor-pointer transition ${
                          checked
                            ? "bg-indigo-50/70 border-indigo-300 text-indigo-950 font-bold"
                            : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(e) => {
                            if (e.target.checked)
                              setCwSelectedTestIds([
                                ...cwSelectedTestIds,
                                t.test_id,
                              ]);
                            else
                              setCwSelectedTestIds(
                                cwSelectedTestIds.filter(
                                  (id) => id !== t.test_id
                                )
                              );
                          }}
                          className="accent-indigo-600 w-4 h-4 rounded"
                        />
                        <div className="truncate">
                          <div>
                            {i + 1}. {t.test_name}{" "}
                            <span className="text-[10.5px] font-normal text-slate-500">
                              ({t.unit})
                            </span>
                          </div>
                          <div className="text-[10px] font-mono text-slate-500">
                            {t.levels_count} mức ·{" "}
                            {t.standard_label === "ISO"
                              ? "ISO 15189"
                              : "Thường"}
                          </div>
                        </div>
                      </label>
                    );
                  })}
                  {sourceTestsList.length === 0 && (
                    <div className="col-span-3 py-8 text-center text-slate-400 italic">
                      Không có xét nghiệm nào trong Hóa chất QC nguồn này.
                    </div>
                  )}
                </div>
              </div>

              <div className="flex justify-end pt-2">
                <button
                  type="button"
                  onClick={handleNextToTarget}
                  className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-black rounded-xl shadow-md transition"
                >
                  Tiếp tục chọn Đích đến ➔
                </button>
              </div>
            </div>
          )}

          {/* =============================================================== */}
          {/* BƯỚC 2: CHỌN THIẾT BỊ ĐÍCH, HÓA CHẤT ĐÍCH & CHÍNH SÁCH COPY      */}
          {/* =============================================================== */}
          {cwStep === 2 && (
            <div className="space-y-4">
              <h3 className="text-sm font-black text-slate-900 uppercase">
                Bước 2: Chọn Thiết Bị Đích, Hóa Chất QC Đích & Tùy Chọn Nhân Bản
              </h3>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block mb-1 font-bold text-slate-700">
                    1. Máy xét nghiệm đích *:
                  </label>
                  <select
                    value={cwTargetMachine}
                    onChange={(e) => {
                      const m = e.target.value;
                      setCwTargetMachine(m);
                      const ctrls = getControlsForMachine(m);
                      if (ctrls.length > 0) {
                        setCwTargetControlMode("EXISTING");
                        setCwTargetControl(ctrls[0]);
                      } else {
                        setCwTargetControlMode("CREATE_NEW");
                        setCwTargetControl("");
                      }
                    }}
                    className="w-full border border-slate-300 p-2.5 rounded-xl bg-slate-50 font-bold text-blue-700"
                  >
                    {labMachines.map((m) => (
                      <option key={m.machine} value={m.machine}>
                        {m.machine} ({m.section})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block mb-1 font-bold text-slate-700">
                    2. Chế độ sao chép thông số *:
                  </label>
                  <select
                    value={cwCopyMode}
                    onChange={(e) =>
                      setCwCopyMode(e.target.value as "FULL" | "SKELETON")
                    }
                    className="w-full border border-indigo-300 p-2.5 rounded-xl bg-indigo-50/70 font-black text-indigo-950"
                  >
                    <option value="FULL">
                      1. Copy toàn bộ (Giữ nguyên Mean & SD của máy nguồn)
                    </option>
                    <option value="SKELETON">
                      2. Copy bộ khung (Chỉnh sửa lại Mean & SD ở Bước 3)
                    </option>
                  </select>
                </div>

                <div>
                  <label className="block mb-1 font-bold text-slate-700">
                    3. Chuyển đổi Nhãn tiêu chuẩn ISO:
                  </label>
                  <select
                    value={cwLabelMode}
                    onChange={(e) =>
                      setCwLabelMode(
                        e.target.value as "KEEP" | "FORCE_ISO" | "FORCE_THUONG"
                      )
                    }
                    className="w-full border border-slate-300 p-2.5 rounded-xl bg-slate-50 font-bold text-slate-800"
                  >
                    <option value="KEEP">
                      Giữ nguyên nhãn ISO / Thường như máy nguồn
                    </option>
                    <option value="FORCE_ISO">
                      ★ Chuyển tất cả sang chuẩn ISO 15189:2022
                    </option>
                    <option value="FORCE_THUONG">
                      Chuyển tất cả sang Xét nghiệm Thường quy
                    </option>
                  </select>
                </div>

                <div>
                  <label className="block mb-1 font-bold text-slate-700">
                    4. Xử lý nếu trùng tên xét nghiệm tại máy đích:
                  </label>
                  <select
                    value={cwDuplicatePolicy}
                    onChange={(e) =>
                      setCwDuplicatePolicy(
                        e.target.value as "SKIP" | "OVERWRITE"
                      )
                    }
                    className="w-full border border-slate-300 p-2.5 rounded-xl bg-slate-50 font-bold text-slate-800"
                  >
                    <option value="SKIP">
                      Bỏ qua các xét nghiệm đã tồn tại (An toàn)
                    </option>
                    <option value="OVERWRITE">
                      Ghi đè thông số mới lên xét nghiệm trùng tên
                    </option>
                  </select>
                </div>
              </div>

              <div className="flex flex-wrap gap-4 border border-slate-200 p-3.5 rounded-2xl bg-slate-50 font-bold">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="tgtCtrlMode"
                    checked={cwTargetControlMode === "EXISTING"}
                    onChange={() => setCwTargetControlMode("EXISTING")}
                    className="accent-indigo-600 w-4 h-4"
                  />
                  <span>Dùng Hóa chất QC đã có trên {cwTargetMachine}</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer text-indigo-900">
                  <input
                    type="radio"
                    name="tgtCtrlMode"
                    checked={cwTargetControlMode === "CREATE_NEW"}
                    onChange={() => {
                      setCwTargetControlMode("CREATE_NEW");
                      if (!cwNewControlForm.control_name) {
                        setCwNewControlForm((p) => ({
                          ...p,
                          control_name: cwSrcControl || "QC Control",
                        }));
                      }
                    }}
                    className="accent-indigo-600 w-4 h-4"
                  />
                  <span>
                    + Khai báo Lô Hóa chất QC mới cho {cwTargetMachine}
                  </span>
                </label>
              </div>

              {cwTargetControlMode === "EXISTING" ? (
                <div>
                  <label className="block mb-1 font-bold text-slate-700">
                    Chọn Hóa chất QC đích *:
                  </label>
                  <select
                    value={cwTargetControl}
                    onChange={(e) => setCwTargetControl(e.target.value)}
                    className="w-full border border-slate-300 p-2.5 rounded-xl font-bold text-purple-800 bg-white"
                  >
                    {getControlsForMachine(cwTargetMachine).map((c) => (
                      <option key={c} value={c}>
                        {c}
                        {getLatestLotLabelForControl(cwTargetMachine, c)}
                      </option>
                    ))}
                  </select>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 p-4 border-2 border-amber-200 rounded-2xl bg-amber-50/60">
                  <div>
                    <label className="font-bold text-slate-700 block mb-1">
                      Tên Hóa chất QC mới *
                    </label>
                    <input
                      required
                      value={cwNewControlForm.control_name}
                      onChange={(e) =>
                        setCwNewControlForm({
                          ...cwNewControlForm,
                          control_name: e.target.value,
                        })
                      }
                      placeholder="VD: Serum Control"
                      className="w-full bg-white border border-amber-300 p-2 rounded-xl font-bold"
                    />
                  </div>
                  <div>
                    <label className="font-bold text-slate-700 block mb-1">
                      Số Lô (Lot) *
                    </label>
                    <input
                      required
                      value={cwNewControlForm.lot_number}
                      onChange={(e) =>
                        setCwNewControlForm({
                          ...cwNewControlForm,
                          lot_number: e.target.value,
                        })
                      }
                      placeholder="VD: LOT-9921"
                      className="w-full bg-white border border-amber-300 p-2 rounded-xl font-mono font-bold"
                    />
                  </div>
                  <div>
                    <label className="font-bold text-slate-700 block mb-1">
                      Hạn sử dụng Lô (Date) *
                    </label>
                    <input
                      type="date"
                      required
                      value={cwNewControlForm.expiry_date}
                      onChange={(e) =>
                        setCwNewControlForm({
                          ...cwNewControlForm,
                          expiry_date: e.target.value,
                        })
                      }
                      className="w-full bg-white border border-amber-300 p-2 rounded-xl font-mono font-bold"
                    />
                  </div>

                  <div className="md:col-span-3 pt-1">
                    <label className="flex items-center gap-2 cursor-pointer font-bold text-amber-950">
                      <input
                        type="checkbox"
                        checked={cwNewControlForm.is_manual_prep}
                        onChange={(e) =>
                          setCwNewControlForm({
                            ...cwNewControlForm,
                            is_manual_prep: e.target.checked,
                          })
                        }
                        className="w-4 h-4 accent-amber-600 rounded"
                      />
                      <span>
                        Là Hóa chất tự pha chế (Theo dõi trong sổ BM.16 & cảnh
                        báo ≥ 75%)
                      </span>
                    </label>
                  </div>

                  {cwNewControlForm.is_manual_prep && (
                    <>
                      <div>
                        <label className="font-bold text-slate-700 block mb-1">
                          Ngày pha *
                        </label>
                        <input
                          type="date"
                          value={cwNewControlForm.prep_date}
                          onChange={(e) =>
                            setCwNewControlForm({
                              ...cwNewControlForm,
                              prep_date: e.target.value,
                              use_expiry_date: addDaysToIsoDate(
                                e.target.value,
                                3
                              ),
                            })
                          }
                          className="w-full bg-white border border-amber-300 p-2 rounded-xl font-mono font-bold"
                        />
                      </div>
                      <div>
                        <label className="font-bold text-slate-700 block mb-1">
                          Hạn dùng sau pha *
                        </label>
                        <input
                          type="date"
                          value={cwNewControlForm.use_expiry_date}
                          onChange={(e) =>
                            setCwNewControlForm({
                              ...cwNewControlForm,
                              use_expiry_date: e.target.value,
                            })
                          }
                          className="w-full bg-white border border-amber-300 p-2 rounded-xl font-mono font-bold"
                        />
                      </div>
                      <div>
                        <label className="font-bold text-slate-700 block mb-1">
                          Số lượng đã pha *
                        </label>
                        <input
                          type="number"
                          min={1}
                          value={cwNewControlForm.quantity_prepared}
                          onChange={(e) =>
                            setCwNewControlForm({
                              ...cwNewControlForm,
                              quantity_prepared: e.target.value,
                            })
                          }
                          className="w-full bg-white border border-amber-300 p-2 rounded-xl font-mono font-bold"
                        />
                      </div>
                    </>
                  )}
                </div>
              )}

              <div className="flex justify-between pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setCwStep(1)}
                  className="px-4 py-2.5 border border-slate-300 rounded-xl font-bold text-slate-700 hover:bg-slate-50"
                >
                  ⬅ Quay lại Bước 1
                </button>
                <button
                  type="button"
                  disabled={isSaving}
                  onClick={handleNextToFinal}
                  className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-black rounded-xl shadow-md disabled:opacity-50 transition"
                >
                  {cwCopyMode === "FULL"
                    ? isSaving
                      ? "⏳ Đang sao chép..."
                      : "✓ Thực Thi Sao Chép Ngay"
                    : "Tiếp tục chỉnh Mean/SD (Bước 3) ➔"}
                </button>
              </div>
            </div>
          )}

          {/* =============================================================== */}
          {/* BƯỚC 3: BẢNG LƯỚI NHẬP NHANH MEAN & SD CHO CẢ 3 MỨC L1, L2, L3   */}
          {/* =============================================================== */}
          {cwStep === 3 && cwCopyMode === "SKELETON" && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="text-sm font-black text-slate-900 uppercase">
                    Bước 3: Chỉnh Sửa Nhanh Mean & SD Cho Máy Đích (
                    {cwTargetMachine})
                  </h3>
                  <p className="text-xs text-slate-500">
                    Mặc định hệ thống đã điền sẵn thông số nguồn để bạn sửa
                    nhanh từng ô (Hỗ trợ đầy đủ L1, L2, L3 & Định tính).
                  </p>
                </div>
              </div>

              <div className="max-h-[54vh] overflow-y-auto border border-slate-200 rounded-2xl">
                <table className="w-full text-xs text-left border-collapse">
                  <thead className="bg-slate-900 text-white sticky top-0 z-10 text-[10.5px] uppercase">
                    <tr>
                      <th className="py-2.5 px-3">Xét nghiệm</th>
                      <th className="py-2.5 px-2 text-center w-20">Số mức</th>
                      <th className="py-2.5 px-2 text-center w-20">TEa</th>
                      <th className="py-2.5 px-2 bg-sky-900">
                        Mức 1 (Mean ± SD / Chứng L1)
                      </th>
                      <th className="py-2.5 px-2 bg-purple-900">
                        Mức 2 (Mean ± SD / Chứng L2)
                      </th>
                      <th className="py-2.5 px-2 bg-amber-800">
                        Mức 3 (Mean ± SD / Chứng L3)
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {selectedSourceTests.map((t, idx) => {
                      const d = cwGridDrafts[t.test_id] || {
                        levels_count: t.levels_count,
                        tea: String(t.tea || 10),
                        m1: "",
                        sd1: "",
                        m2: "",
                        sd2: "",
                        m3: "",
                        sd3: "",
                        qual1: "ÂM TÍNH",
                        qual2: "DƯƠNG TÍNH",
                        qual3: "DƯƠNG TÍNH",
                      };
                      const isQual = t.test_type === "QUALITATIVE";

                      return (
                        <tr
                          key={t.test_id}
                          className="hover:bg-sky-50/40 transition"
                        >
                          <td className="py-2 px-3 font-black text-slate-900">
                            {idx + 1}. {t.test_name}{" "}
                            <span className="text-[10px] font-normal text-slate-500">
                              ({t.unit})
                            </span>
                          </td>
                          <td className="py-2 px-2 text-center">
                            <select
                              value={d.levels_count}
                              onChange={(e) =>
                                updateRowDraft(t.test_id, {
                                  levels_count: Number(e.target.value) as
                                    | 1
                                    | 2
                                    | 3,
                                })
                              }
                              className="border border-slate-300 rounded-lg px-1.5 py-1 font-bold bg-white"
                            >
                              <option value={1}>1 mức</option>
                              <option value={2}>2 mức</option>
                              <option value={3}>3 mức</option>
                            </select>
                          </td>
                          <td className="py-2 px-2 text-center">
                            {!isQual ? (
                              <input
                                type="number"
                                step="any"
                                value={d.tea}
                                onChange={(e) =>
                                  updateRowDraft(t.test_id, {
                                    tea: e.target.value,
                                  })
                                }
                                className="w-16 border border-slate-300 rounded-lg p-1 font-mono font-bold text-center"
                              />
                            ) : (
                              <span className="text-slate-400">—</span>
                            )}
                          </td>

                          {/* CỘT MỨC 1 (L1) */}
                          <td className="py-2 px-2">
                            {!isQual ? (
                              <div className="flex gap-1">
                                <input
                                  type="number"
                                  step="any"
                                  placeholder="Mean L1"
                                  value={d.m1}
                                  onChange={(e) =>
                                    updateRowDraft(t.test_id, {
                                      m1: e.target.value,
                                    })
                                  }
                                  className="w-20 border border-sky-300 rounded-lg p-1 font-mono font-bold"
                                />
                                <input
                                  type="number"
                                  step="any"
                                  placeholder="SD L1"
                                  value={d.sd1}
                                  onChange={(e) =>
                                    updateRowDraft(t.test_id, {
                                      sd1: e.target.value,
                                    })
                                  }
                                  className="w-20 border border-sky-300 rounded-lg p-1 font-mono font-bold"
                                />
                              </div>
                            ) : (
                              <select
                                value={d.qual1}
                                onChange={(e) =>
                                  updateRowDraft(t.test_id, {
                                    qual1: e.target.value,
                                  })
                                }
                                className="border border-emerald-300 rounded-lg p-1 font-bold bg-white w-full"
                              >
                                {QUALITATIVE_OPTIONS.map((opt) => (
                                  <option key={opt} value={opt}>
                                    {opt}
                                  </option>
                                ))}
                              </select>
                            )}
                          </td>

                          {/* CỘT MỨC 2 (L2) */}
                          <td className="py-2 px-2">
                            {d.levels_count >= 2 ? (
                              !isQual ? (
                                <div className="flex gap-1">
                                  <input
                                    type="number"
                                    step="any"
                                    placeholder="Mean L2"
                                    value={d.m2}
                                    onChange={(e) =>
                                      updateRowDraft(t.test_id, {
                                        m2: e.target.value,
                                      })
                                    }
                                    className="w-20 border border-purple-300 rounded-lg p-1 font-mono font-bold"
                                  />
                                  <input
                                    type="number"
                                    step="any"
                                    placeholder="SD L2"
                                    value={d.sd2}
                                    onChange={(e) =>
                                      updateRowDraft(t.test_id, {
                                        sd2: e.target.value,
                                      })
                                    }
                                    className="w-20 border border-purple-300 rounded-lg p-1 font-mono font-bold"
                                  />
                                </div>
                              ) : (
                                <select
                                  value={d.qual2}
                                  onChange={(e) =>
                                    updateRowDraft(t.test_id, {
                                      qual2: e.target.value,
                                    })
                                  }
                                  className="border border-purple-300 rounded-lg p-1 font-bold bg-white w-full"
                                >
                                  {QUALITATIVE_OPTIONS.map((opt) => (
                                    <option key={opt} value={opt}>
                                      {opt}
                                    </option>
                                  ))}
                                </select>
                              )
                            ) : (
                              <span className="text-slate-300 font-mono">
                                —
                              </span>
                            )}
                          </td>

                          {/* CỘT MỨC 3 (L3) */}
                          <td className="py-2 px-2">
                            {d.levels_count === 3 ? (
                              !isQual ? (
                                <div className="flex gap-1">
                                  <input
                                    type="number"
                                    step="any"
                                    placeholder="Mean L3"
                                    value={d.m3}
                                    onChange={(e) =>
                                      updateRowDraft(t.test_id, {
                                        m3: e.target.value,
                                      })
                                    }
                                    className="w-20 border border-amber-300 rounded-lg p-1 font-mono font-bold"
                                  />
                                  <input
                                    type="number"
                                    step="any"
                                    placeholder="SD L3"
                                    value={d.sd3}
                                    onChange={(e) =>
                                      updateRowDraft(t.test_id, {
                                        sd3: e.target.value,
                                      })
                                    }
                                    className="w-20 border border-amber-300 rounded-lg p-1 font-mono font-bold"
                                  />
                                </div>
                              ) : (
                                <select
                                  value={d.qual3}
                                  onChange={(e) =>
                                    updateRowDraft(t.test_id, {
                                      qual3: e.target.value,
                                    })
                                  }
                                  className="border border-amber-300 rounded-lg p-1 font-bold bg-white w-full"
                                >
                                  {QUALITATIVE_OPTIONS.map((opt) => (
                                    <option key={opt} value={opt}>
                                      {opt}
                                    </option>
                                  ))}
                                </select>
                              )
                            ) : (
                              <span className="text-slate-300 font-mono">
                                —
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="flex justify-between pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setCwStep(2)}
                  className="px-4 py-2.5 border border-slate-300 rounded-xl font-bold text-slate-700 hover:bg-slate-50"
                >
                  ⬅ Quay lại Bước 2
                </button>
                <button
                  type="button"
                  disabled={isSaving}
                  onClick={handleFinalSubmit}
                  className="px-6 py-2.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:brightness-105 text-white font-black rounded-xl shadow-md disabled:opacity-50 transition"
                >
                  {isSaving
                    ? "⏳ Đang lưu cấu hình..."
                    : "✓ Hoàn Tất & Thực Thi Sao Chép"}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
