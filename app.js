"use strict";

/* ------------------------------------------------------------------
 * 婚活市場価値診断（エンタメ版）
 * ネット上でよく言われる「婚活市場での傾向」を元にした簡易スコアリング。
 * 統計的・科学的根拠はなく、人の価値を測るものではありません。
 * ------------------------------------------------------------------ */

const APPEARANCE_LABELS = [
  "かなり控えめ",
  "控えめ",
  "普通",
  "整っている方",
  "かなり整っている",
];

const PERSONALITY_LABELS = [
  "かなり要努力",
  "やや要努力",
  "普通",
  "良好",
  "かなり良好",
];

const JOB_TIERS = [
  { value: "student", label: "学生・無職・その他", points: 2 },
  { value: "nonregular", label: "契約・派遣・非正規", points: 5 },
  { value: "freelance", label: "自営業・フリーランス", points: 8 },
  { value: "sme", label: "中小企業正社員", points: 9 },
  { value: "midsize", label: "中堅企業正社員", points: 12 },
  { value: "top", label: "大企業・公務員・士業（医師・弁護士等）", points: 15 },
];

const CATEGORIES = {
  male: [
    { key: "income", label: "年収", type: "income", cap: 35, max: 35, k: 700, unit: "万円", plausible: [0, 10000] },
    { key: "age", label: "年齢", type: "gaussian", max: 15, floor: 5, peak: 30, sigma: 12, unit: "歳", plausible: [20, 70] },
    { key: "height", label: "身長", type: "gaussian", max: 15, floor: 3, peak: 178, sigma: 10, unit: "cm", plausible: [150, 200] },
    { key: "job", label: "職業・雇用形態", type: "discrete", max: 15, tiers: JOB_TIERS },
    { key: "appearance", label: "外見", type: "slider", max: 15, labels: APPEARANCE_LABELS },
    { key: "personality", label: "性格・コミュ力", type: "slider", max: 5, labels: PERSONALITY_LABELS },
  ],
  female: [
    { key: "age", label: "年齢", type: "gaussian", max: 30, floor: 4, peak: 25, sigma: 7, unit: "歳", plausible: [20, 60] },
    { key: "appearance", label: "外見", type: "slider", max: 30, labels: APPEARANCE_LABELS },
    { key: "height", label: "身長", type: "gaussian", max: 15, floor: 4, peak: 162, sigma: 9, unit: "cm", plausible: [140, 185] },
    { key: "income", label: "年収", type: "income", cap: 10, max: 10, k: 500, unit: "万円", plausible: [0, 10000] },
    { key: "personality", label: "性格・家庭的な面", type: "slider", max: 15, labels: PERSONALITY_LABELS },
  ],
};

function scoreCategory(cat, rawValue) {
  switch (cat.type) {
    case "income": {
      const v = Math.max(0, Number(rawValue) || 0);
      return cat.cap * (1 - Math.exp(-v / cat.k));
    }
    case "gaussian": {
      const v = Number(rawValue) || 0;
      return cat.floor + (cat.max - cat.floor) * Math.exp(-((v - cat.peak) ** 2) / (2 * cat.sigma * cat.sigma));
    }
    case "discrete": {
      const tier = cat.tiers.find((t) => t.value === rawValue) || cat.tiers[0];
      return tier.points;
    }
    case "slider": {
      const v = Math.min(5, Math.max(1, Number(rawValue) || 1));
      return (v / 5) * cat.max;
    }
    default:
      return 0;
  }
}

function scoreProfile(genderKey, values) {
  const cats = CATEGORIES[genderKey];
  let total = 0;
  const breakdown = [];
  cats.forEach((cat) => {
    const points = scoreCategory(cat, values[cat.key]);
    total += points;
    breakdown.push({ ...cat, points, ratio: points / cat.max });
  });
  return { total: Math.round(total * 10) / 10, breakdown };
}

function rankOf(score) {
  if (score >= 90) return { label: "SS", desc: "市場でごく少数の、超ハイスペック層" };
  if (score >= 80) return { label: "S", desc: "誰から見ても好条件、モテる層" };
  if (score >= 70) return { label: "A", desc: "条件面で優位に立てる層" };
  if (score >= 60) return { label: "B", desc: "平均よりやや高めの層" };
  if (score >= 50) return { label: "C", desc: "標準的な市場価値の層" };
  if (score >= 40) return { label: "D", desc: "やや控えめ、工夫でカバーできる層" };
  return { label: "E", desc: "市場では厳しめ、条件の見直しや強みの発見がおすすめ" };
}

function verdictOf(diff) {
  if (diff >= 15) {
    return { tone: "good", text: "あなたの市場価値なら十分狙える、むしろ相手にとってお得まである組み合わせです。" };
  }
  if (diff >= 0) {
    return { tone: "good", text: "釣り合いが取れている、現実的な組み合わせです。" };
  }
  if (diff >= -15) {
    return { tone: "warn", text: "やや背伸びした条件です。可能性はゼロではありませんが、競争率はかなり高めと考えましょう。" };
  }
  return { tone: "bad", text: "現状の市場価値とはギャップが大きい組み合わせです。条件を見直すか、自分の市場価値を高める努力が必要そうです。" };
}

function invertCategory(cat, ratio) {
  const r = Math.min(0.985, Math.max(0, ratio));
  switch (cat.type) {
    case "income": {
      if (r <= 0) return "こだわらなくてもOK";
      const target = r * cat.cap;
      const minIncome = -cat.k * Math.log(1 - target / cat.cap);
      return `${Math.max(0, Math.round(minIncome))}万円以上が目安`;
    }
    case "gaussian": {
      const target = r * cat.max;
      if (target <= cat.floor) {
        return "特にこだわらなくても対象になりやすい範囲";
      }
      const inner = (target - cat.floor) / (cat.max - cat.floor);
      const delta = cat.sigma * Math.sqrt(-2 * Math.log(inner));
      let lo = Math.round(cat.peak - delta);
      let hi = Math.round(cat.peak + delta);
      lo = Math.max(cat.plausible[0], lo);
      hi = Math.min(cat.plausible[1], hi);
      return `${lo}〜${hi}${cat.unit}`;
    }
    case "discrete": {
      const target = r * cat.max;
      let best = cat.tiers[0];
      let bestDiff = Infinity;
      cat.tiers.forEach((t) => {
        const d = Math.abs(t.points - target);
        if (d < bestDiff) {
          bestDiff = d;
          best = t;
        }
      });
      return `${best.label} 程度`;
    }
    case "slider": {
      const target = r * cat.max;
      const level = Math.min(5, Math.max(1, Math.round((target / cat.max) * 5)));
      return `${cat.labels[level - 1]}（レベル${level}/5）`;
    }
    default:
      return "-";
  }
}

function suggestPartnerProfile(partnerGenderKey, ownScore) {
  const r = ownScore / 100;
  return CATEGORIES[partnerGenderKey].map((cat) => ({
    label: cat.label,
    suggestion: invertCategory(cat, r),
  }));
}

/* ------------------------------- DOM ------------------------------- */

function opposite(gender) {
  return gender === "male" ? "female" : "male";
}

function readForm(prefix) {
  const gender = document.querySelector(`input[name="${prefix}-gender"]:checked`).value;
  return {
    gender,
    values: {
      income: document.getElementById(`${prefix}-income`).value,
      age: document.getElementById(`${prefix}-age`).value,
      height: document.getElementById(`${prefix}-height`).value,
      job: document.getElementById(`${prefix}-job`).value,
      appearance: document.getElementById(`${prefix}-appearance`).value,
      personality: document.getElementById(`${prefix}-personality`).value,
    },
  };
}

function toggleJobRow(prefix) {
  const gender = document.querySelector(`input[name="${prefix}-gender"]:checked`).value;
  const row = document.getElementById(`${prefix}-job-row`);
  row.hidden = gender !== "male";
}

function renderBreakdown(container, breakdown) {
  container.innerHTML = "";
  breakdown.forEach((cat) => {
    const row = document.createElement("div");
    row.className = "bar-row";
    const pct = Math.round((cat.points / cat.max) * 100);
    row.innerHTML = `
      <div class="bar-label">
        <span>${cat.label}</span>
        <span class="bar-points">${cat.points.toFixed(1)} / ${cat.max}</span>
      </div>
      <div class="bar-track"><div class="bar-fill" style="width:${pct}%"></div></div>
    `;
    container.appendChild(row);
  });
}

let ownScoreState = null;
let ownGenderState = null;

function updateSelfLiveLabels() {
  document.getElementById("self-appearance-value").textContent =
    APPEARANCE_LABELS[document.getElementById("self-appearance").value - 1];
  document.getElementById("self-personality-value").textContent =
    PERSONALITY_LABELS[document.getElementById("self-personality").value - 1];
}

function updatePartnerLiveLabels() {
  document.getElementById("partner-appearance-value").textContent =
    APPEARANCE_LABELS[document.getElementById("partner-appearance").value - 1];
  document.getElementById("partner-personality-value").textContent =
    PERSONALITY_LABELS[document.getElementById("partner-personality").value - 1];
}

function handleSelfSubmit(e) {
  e.preventDefault();
  const { gender, values } = readForm("self");
  const { total, breakdown } = scoreProfile(gender, values);
  ownScoreState = total;
  ownGenderState = gender;

  const rank = rankOf(total);
  document.getElementById("self-score-value").textContent = total.toFixed(1);
  document.getElementById("self-rank-label").textContent = rank.label;
  document.getElementById("self-rank-desc").textContent = rank.desc;
  renderBreakdown(document.getElementById("self-breakdown"), breakdown);
  document.getElementById("self-result").hidden = false;

  // 相手の性別デフォルトを異性に、パートナーフォームを表示
  const partnerGenderInput = document.querySelector(
    `input[name="partner-gender"][value="${opposite(gender)}"]`
  );
  if (partnerGenderInput) {
    partnerGenderInput.checked = true;
    toggleJobRow("partner");
  }
  document.getElementById("partner-section").hidden = false;

  renderSuggestion();
  document.getElementById("self-result").scrollIntoView({ behavior: "smooth", block: "nearest" });
}

function handlePartnerSubmit(e) {
  e.preventDefault();
  if (ownScoreState === null) return;
  const { gender, values } = readForm("partner");
  const { total, breakdown } = scoreProfile(gender, values);

  const rank = rankOf(total);
  document.getElementById("partner-score-value").textContent = total.toFixed(1);
  document.getElementById("partner-rank-label").textContent = rank.label;
  document.getElementById("partner-rank-desc").textContent = rank.desc;
  renderBreakdown(document.getElementById("partner-breakdown"), breakdown);

  const diff = Math.round((ownScoreState - total) * 10) / 10;
  const v = verdictOf(diff);
  const verdictEl = document.getElementById("verdict-box");
  verdictEl.className = `verdict verdict-${v.tone}`;
  verdictEl.innerHTML = `
    <div class="verdict-diff">あなた: ${ownScoreState.toFixed(1)}点 － 求める条件: ${total.toFixed(1)}点 ＝ 差 ${diff > 0 ? "+" : ""}${diff.toFixed(1)}点</div>
    <div class="verdict-text">${v.text}</div>
  `;

  document.getElementById("partner-result").hidden = false;
  document.getElementById("partner-result").scrollIntoView({ behavior: "smooth", block: "nearest" });
}

function renderSuggestion() {
  if (ownScoreState === null || ownGenderState === null) return;
  const partnerGender = opposite(ownGenderState);
  const suggestions = suggestPartnerProfile(partnerGender, ownScoreState);
  const list = document.getElementById("suggestion-list");
  list.innerHTML = "";
  suggestions.forEach((s) => {
    const li = document.createElement("li");
    li.innerHTML = `<span class="suggestion-label">${s.label}</span><span class="suggestion-value">${s.suggestion}</span>`;
    list.appendChild(li);
  });
  document.getElementById("suggestion-score").textContent = ownScoreState.toFixed(1);
  document.getElementById("suggestion-result").hidden = false;
}

document.addEventListener("DOMContentLoaded", () => {
  document.querySelectorAll('input[name="self-gender"]').forEach((el) =>
    el.addEventListener("change", () => toggleJobRow("self"))
  );
  document.querySelectorAll('input[name="partner-gender"]').forEach((el) =>
    el.addEventListener("change", () => toggleJobRow("partner"))
  );
  document.getElementById("self-appearance").addEventListener("input", updateSelfLiveLabels);
  document.getElementById("self-personality").addEventListener("input", updateSelfLiveLabels);
  document.getElementById("partner-appearance").addEventListener("input", updatePartnerLiveLabels);
  document.getElementById("partner-personality").addEventListener("input", updatePartnerLiveLabels);

  document.getElementById("self-form").addEventListener("submit", handleSelfSubmit);
  document.getElementById("partner-form").addEventListener("submit", handlePartnerSubmit);

  toggleJobRow("self");
  toggleJobRow("partner");
  updateSelfLiveLabels();
  updatePartnerLiveLabels();
});
