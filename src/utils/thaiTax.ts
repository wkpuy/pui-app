// Thai personal income tax — อิงโครงสร้างปี 2566/2567
// อ้างอิงสรรพากร: https://www.rd.go.th

import type { TaxRecord } from "../db";

// Progressive brackets — ใช้ตั้งแต่ปีภาษี 2560 (ยังไม่เปลี่ยน)
export const TAX_BRACKETS: { min: number; max: number; rate: number }[] = [
  { min: 0, max: 150_000, rate: 0 },
  { min: 150_000, max: 300_000, rate: 0.05 },
  { min: 300_000, max: 500_000, rate: 0.1 },
  { min: 500_000, max: 750_000, rate: 0.15 },
  { min: 750_000, max: 1_000_000, rate: 0.2 },
  { min: 1_000_000, max: 2_000_000, rate: 0.25 },
  { min: 2_000_000, max: 5_000_000, rate: 0.3 },
  { min: 5_000_000, max: Infinity, rate: 0.35 },
];

// คำนวณภาษีจากเงินได้สุทธิ (taxable income)
export function calcTaxFromTaxable(taxable: number): number {
  if (taxable <= 0) return 0;
  let tax = 0;
  for (const b of TAX_BRACKETS) {
    if (taxable <= b.min) break;
    const upper = Math.min(taxable, b.max);
    tax += (upper - b.min) * b.rate;
  }
  return Math.max(0, tax);
}

// อัตราภาษีส่วนเพิ่ม (marginal rate) ที่เงินได้สุทธินี้
export function marginalRate(taxable: number): number {
  for (const b of TAX_BRACKETS) {
    if (taxable > b.min && taxable <= b.max) return b.rate;
  }
  if (taxable > 5_000_000) return 0.35;
  return 0;
}

export interface TaxBreakdown {
  // รายได้
  grossIncome: number; // เงินได้ก่อนหักอะไร
  expenseAllowance: number; // ค่าใช้จ่าย (50% ของเงินเดือน เพดาน 100,000)
  // ลดหย่อน (รวม)
  totalDeductions: number;
  deductionDetails: Record<string, number>; // breakdown ของลดหย่อนแต่ละข้อ
  // เงินได้สุทธิ
  netIncome: number; // = grossIncome - expense - deductions
  // ภาษี
  taxBeforeDonation: number; // ภาษีก่อนหักบริจาค
  donationDeductible: number; // เงินบริจาค (1x + 2x) ที่ใช้สิทธิ์ได้จริง
  taxableAfterDonation: number;
  taxOwed: number; // ภาษีที่ต้องจ่าย
  withholding: number; // หัก ณ ที่จ่ายแล้ว
  netTaxPayable: number; // ภาษีต้องจ่ายเพิ่ม (+) / ขอคืน (−)
  marginal: number; // อัตราภาษีส่วนเพิ่ม
  effective: number; // อัตราภาษีเฉลี่ย (taxOwed / gross)
}

// คำนวณภาษีตามรายการลดหย่อนทั้งหมด — Thai personal income tax
export function calcThaiTax(t: TaxRecord): TaxBreakdown {
  const gross = (t.totalIncome || 0) + (t.bonus || 0) + (t.otherIncome || 0);

  // ค่าใช้จ่าย 50% ของเงินเดือน + โบนัส (เฉพาะรายได้ 40(1)) เพดาน 100,000
  const baseIncome = (t.totalIncome || 0) + (t.bonus || 0);
  const expense = Math.min(baseIncome * 0.5, 100_000);

  // ── ลดหย่อนแต่ละหมวด พร้อมเพดาน ──
  const d: Record<string, number> = {};

  // ส่วนตัว + ครอบครัว
  d["ส่วนตัว"] = 60_000;
  d["คู่สมรส"] = Math.min(t.spouseAllowance || 0, 60_000);
  // บุตร: คนแรกเกิดก่อน 2561 = 30k, คนที่ 2+ เกิด ≥2561 = 60k
  const child1 = Math.min(t.childrenCount || 0, 1) * 30_000;
  const childExtra = Math.max((t.childrenCount || 0) - 1, 0) * 30_000; // คนที่ 2+ เกิดก่อน 2561
  const childAfter2561Extra = (t.childrenAfter2561 || 0) * 60_000; // คนที่ 2+ เกิด ≥2561
  d["บุตร"] = child1 + childExtra + childAfter2561Extra;
  const parentsSupport =
    t.parentsSupport !== undefined && t.parentsSupport !== null
      ? Math.min(t.parentsSupport || 0, 180_000)
      : Math.min(t.parentsCount || 0, 4) * 30_000;
  d["อุปการะบิดามารดา"] = parentsSupport;

  // ประกัน
  const lifeIns = Math.min(t.lifeInsurance || 0, 100_000);
  const healthIns = Math.min(t.healthInsurance || 0, 25_000);
  // รวมประกันชีวิต + สุขภาพ ต้องไม่เกิน 100,000
  const lifeHealth = Math.min(lifeIns + healthIns, 100_000);
  d["ประกันชีวิต+สุขภาพตน"] = lifeHealth;
  d["ประกันสุขภาพบิดามารดา"] = Math.min(t.parentsHealthInsurance || 0, 15_000);
  // ประกันบำนาญ ≤ 15% รายได้ และ ≤ 200,000
  d["ประกันชีวิตแบบบำนาญ"] = Math.min(
    t.pensionInsurance || 0,
    gross * 0.15,
    200_000,
  );
  d["ประกันสังคม"] = Math.min(t.socialSecurity || 0, 9_000);

  // กองทุน — มี cap รวม 500,000 (PVD + บำนาญ + RMF + SSF + กบข + กอช)
  const pvd = Math.min(t.pvdContribution || 0, gross * 0.15, 500_000);
  const rmf = Math.min(t.rmf || 0, gross * 0.3, 500_000);
  const ssf = Math.min(t.ssf || 0, gross * 0.3, 200_000);
  // ตรวจ cap รวม 500k (PVD + บำนาญ + RMF + SSF) -- ยกเว้น ESG, Easy E-Receipt
  const pensionCombo = pvd + (d["ประกันชีวิตแบบบำนาญ"] || 0) + rmf + ssf;
  let pvdFinal = pvd,
    rmfFinal = rmf,
    ssfFinal = ssf,
    pensionFinal = d["ประกันชีวิตแบบบำนาญ"];
  if (pensionCombo > 500_000) {
    // ตัดส่วนเกินตามสัดส่วน (เรียงตามลำดับที่ผู้ใช้น่าจะให้ priority: ssf > rmf > pension > pvd)
    let excess = pensionCombo - 500_000;
    const order = [
      [
        "ssf",
        () => ssfFinal,
        (v: number) => {
          ssfFinal = v;
        },
      ],
      [
        "rmf",
        () => rmfFinal,
        (v: number) => {
          rmfFinal = v;
        },
      ],
      [
        "pension",
        () => pensionFinal,
        (v: number) => {
          pensionFinal = v;
        },
      ],
    ] as const;
    for (const [, get, set] of order) {
      const cur = get();
      const cut = Math.min(cur, excess);
      set(cur - cut);
      excess -= cut;
      if (excess <= 0) break;
    }
  }
  d["PVD"] = pvdFinal;
  d["ประกันชีวิตแบบบำนาญ"] = pensionFinal;
  d["RMF"] = rmfFinal;
  d["SSF"] = ssfFinal;
  // Thai ESG ≤ 30% รายได้ และ ≤ 300,000 (แยกต่างหาก)
  d["Thai ESG Fund"] = Math.min(t.thaiEsg || 0, gross * 0.3, 300_000);

  // อื่นๆ
  d["ดอกเบี้ยกู้ที่อยู่อาศัย"] = Math.min(t.mortgageInterest || 0, 100_000);
  d["Easy E-Receipt"] = Math.min(t.easyEReceipt || 0, 50_000);
  d["บริจาคพรรคการเมือง"] = Math.min(t.donationPolitical || 0, 10_000);

  // รวมลดหย่อนทั้งหมด (ยังไม่รวมบริจาคทั่วไป — บริจาคใช้หลังจากนี้)
  const totalDed = Object.values(d).reduce((s, v) => s + v, 0);

  // เงินได้หลังหักค่าใช้จ่ายและลดหย่อน (ยังไม่หักบริจาค)
  const beforeDonation = Math.max(gross - expense - totalDed, 0);

  // บริจาค: เพดาน 10% ของ beforeDonation
  const donationCap = beforeDonation * 0.1;
  const donEdu2x = Math.min((t.donationEducation || 0) * 2, donationCap); // x2
  const remainingCap = Math.max(donationCap - donEdu2x, 0);
  const donGeneral = Math.min(t.donation || 0, remainingCap);
  const donationDeductible = donEdu2x + donGeneral;
  d["บริจาคศึกษา/สาธารณสุข (×2)"] = donEdu2x;
  d["บริจาคทั่วไป"] = donGeneral;

  const netIncome = Math.max(beforeDonation - donationDeductible, 0);
  const taxOwed = calcTaxFromTaxable(netIncome);
  const wht = t.withholdingTax || 0;

  return {
    grossIncome: gross,
    expenseAllowance: expense,
    totalDeductions: totalDed + donationDeductible,
    deductionDetails: d,
    netIncome,
    taxBeforeDonation: calcTaxFromTaxable(beforeDonation),
    donationDeductible,
    taxableAfterDonation: netIncome,
    taxOwed,
    withholding: wht,
    netTaxPayable: taxOwed - wht,
    marginal: marginalRate(netIncome),
    effective: gross > 0 ? taxOwed / gross : 0,
  };
}

// คำนวณภาษีที่ประหยัดได้ ถ้าซื้อสินทรัพย์เพิ่ม X บาท ในประเภทใดประเภทหนึ่ง
export function simulateTaxSaving(
  t: TaxRecord,
  field: keyof TaxRecord,
  additionalAmount: number,
): { newTax: number; saving: number } {
  const baseTax = calcThaiTax(t).taxOwed;
  const updated: TaxRecord = {
    ...t,
    [field]: ((t[field] as number) || 0) + additionalAmount,
  };
  const newTax = calcThaiTax(updated).taxOwed;
  return { newTax, saving: baseTax - newTax };
}

// แนะนำว่าควรซื้อเพิ่มอีกเท่าไรในแต่ละประเภทเพื่อใช้สิทธิ์เต็ม
export function suggestUnusedAllowances(
  t: TaxRecord,
): { name: string; field: keyof TaxRecord; unused: number; cap: number }[] {
  const gross = (t.totalIncome || 0) + (t.bonus || 0) + (t.otherIncome || 0);
  const items: {
    name: string;
    field: keyof TaxRecord;
    unused: number;
    cap: number;
  }[] = [];
  // RMF
  const rmfCap = Math.min(gross * 0.3, 500_000);
  items.push({
    name: "RMF",
    field: "rmf",
    cap: rmfCap,
    unused: Math.max(rmfCap - (t.rmf || 0), 0),
  });
  // SSF
  const ssfCap = Math.min(gross * 0.3, 200_000);
  items.push({
    name: "SSF",
    field: "ssf",
    cap: ssfCap,
    unused: Math.max(ssfCap - (t.ssf || 0), 0),
  });
  // Thai ESG
  const esgCap = Math.min(gross * 0.3, 300_000);
  items.push({
    name: "Thai ESG",
    field: "thaiEsg",
    cap: esgCap,
    unused: Math.max(esgCap - (t.thaiEsg || 0), 0),
  });
  // Life ins (combined with health)
  const lifeUsed = (t.lifeInsurance || 0) + (t.healthInsurance || 0);
  items.push({
    name: "ประกันชีวิต/สุขภาพ",
    field: "lifeInsurance",
    cap: 100_000,
    unused: Math.max(100_000 - lifeUsed, 0),
  });
  // Pension ins
  const penCap = Math.min(gross * 0.15, 200_000);
  items.push({
    name: "ประกันบำนาญ",
    field: "pensionInsurance",
    cap: penCap,
    unused: Math.max(penCap - (t.pensionInsurance || 0), 0),
  });
  return items.filter((i) => i.unused > 0).sort((a, b) => b.unused - a.unused);
}

export function emptyTaxRecord(year: number): Omit<TaxRecord, "id"> {
  return {
    year,
    totalIncome: 0,
    bonus: 0,
    otherIncome: 0,
    personalAllowance: 60_000,
    spouseAllowance: 0,
    childrenCount: 0,
    childrenAfter2561: 0,
    parentsCount: 0,
    parentsSupport: 0,
    lifeInsurance: 0,
    healthInsurance: 0,
    parentsHealthInsurance: 0,
    pensionInsurance: 0,
    socialSecurity: 9_000,
    pvdContribution: 0,
    rmf: 0,
    ssf: 0,
    thaiEsg: 0,
    mortgageInterest: 0,
    donation: 0,
    donationEducation: 0,
    donationPolitical: 0,
    easyEReceipt: 0,
    withholdingTax: 0,
    updatedAt: new Date().toISOString(),
  };
}
