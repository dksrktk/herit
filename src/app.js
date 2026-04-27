const profiles = {
  "가족 간 분쟁 예방": {
    score: 82,
    summary: "상속 전에 의사결정권과 수익권을 분리하는 가족 신탁 구조가 적합합니다.",
    trust: "위탁자 1인, 공동수익자 3인, 주요 처분은 2/3 동의 조건 권장",
    tax: "증여 추정, 임대수익 귀속, 상속 개시 시점 평가 기준 검토 필요",
    liquidity: "가족 외 이전은 제한하고 내부 수익권 배분부터 시작 권장",
    actions: ["가족 관계와 희망 지분율 확정", "임대차 계약과 담보 설정 내역 업로드", "신탁 계약 초안 상담 예약"],
  },
  "임대 수익 분배": {
    score: 76,
    summary: "임대 수익을 정기 분배하는 운영형 신탁 설계가 우선입니다.",
    trust: "월별 임대료 입금 계좌와 수익자별 배분 규칙 설정",
    tax: "수익자별 소득 귀속과 원천징수 처리 방식 확인 필요",
    liquidity: "수익권 이전보다 분배 자동화가 먼저입니다.",
    actions: ["최근 12개월 임대료 내역 등록", "수익자별 배분율 입력", "분배 캘린더 생성"],
  },
  "일부 유동화": {
    score: 68,
    summary: "일부 유동화는 가능하지만 투자자 적격성 검토와 전송 제한이 선행되어야 합니다.",
    trust: "수익권 일부를 별도 클래스로 분리하는 구조 권장",
    tax: "양도, 증여, 배당 성격이 혼재될 수 있어 사전 검토 필요",
    liquidity: "화이트리스트 등록 투자자에게만 제한적 이전 가능",
    actions: ["유동화 희망 비율 입력", "투자자 유형 확인", "전송 제한 정책 검토"],
  },
  "세무 리스크 점검": {
    score: 73,
    summary: "현재 단계에서는 세무 리스크 식별 후 신탁 구조를 조정하는 접근이 안전합니다.",
    trust: "계약 구조 확정 전 세무 쟁점 태깅 필요",
    tax: "상속세, 증여세, 양도세 이벤트가 모두 후보로 감지됨",
    liquidity: "세무 검토 전 외부 이전은 보류 권장",
    actions: ["취득가와 보유 기간 입력", "가족 간 기존 증여 내역 확인", "세무 검토 리포트 생성"],
  },
};

const assets = [
  { name: "성수동 상업용 빌딩", value: "128억", status: "진단 완료", risk: "중간" },
  { name: "분당 아파트", value: "24억", status: "정보 부족", risk: "낮음" },
  { name: "파주 토지", value: "39억", status: "세무 검토", risk: "높음" },
];

const vaultSteps = [
  { title: "자산 등록", state: "완료" },
  { title: "소유권/담보 확인", state: "완료" },
  { title: "상속인 컨텍스트 매핑", state: "진행 중" },
  { title: "규제 적합성 확인", state: "대기" },
  { title: "신탁 계약 초안", state: "대기" },
];

const inheritanceTaxBrackets = [
  { limit: 100_000_000, rate: 0.1, deduction: 0, label: "1억원 이하 / 10%" },
  { limit: 500_000_000, rate: 0.2, deduction: 10_000_000, label: "5억원 이하 / 20%" },
  { limit: 1_000_000_000, rate: 0.3, deduction: 60_000_000, label: "10억원 이하 / 30%" },
  { limit: 3_000_000_000, rate: 0.4, deduction: 160_000_000, label: "30억원 이하 / 40%" },
  { limit: Infinity, rate: 0.5, deduction: 460_000_000, label: "30억원 초과 / 50%" },
];

function getFormState() {
  return {
    assetType: document.querySelector("#asset-type").value,
    assetValue: document.querySelector("#asset-value").value,
    debtValue: document.querySelector("#debt-value").value,
    giftValue: document.querySelector("#gift-value").value,
    spouseValue: document.querySelector("#spouse-value").value,
    heirCount: Number(document.querySelector("#heir-count").value || 1),
    goal: document.querySelector("#goal").value,
    concern: document.querySelector("#concern").value,
  };
}

function calculateScore(baseScore, heirCount) {
  const complexityPenalty = Math.max(0, heirCount - 3) * 4;
  return Math.max(42, Math.min(94, baseScore - complexityPenalty));
}

function parseKrw(value) {
  const source = String(value || "").replaceAll(",", "").replace(/\s/g, "");
  if (!source) return 0;

  const eokMatch = source.match(/([\d.]+)억/);
  const manMatch = source.match(/([\d.]+)만/);
  const plainNumber = Number(source.replace(/[^\d.]/g, ""));

  let amount = 0;
  if (eokMatch) amount += Number(eokMatch[1]) * 100_000_000;
  if (manMatch) amount += Number(manMatch[1]) * 10_000;
  if (!eokMatch && !manMatch && Number.isFinite(plainNumber)) amount = plainNumber;

  return Number.isFinite(amount) ? Math.max(0, Math.round(amount)) : 0;
}

function formatKrw(value) {
  const amount = Math.max(0, Math.round(value));
  if (amount >= 100_000_000) {
    const eok = amount / 100_000_000;
    return `${eok.toLocaleString("ko-KR", { maximumFractionDigits: 1 })}억`;
  }
  if (amount >= 10_000) {
    const man = amount / 10_000;
    return `${man.toLocaleString("ko-KR", { maximumFractionDigits: 0 })}만원`;
  }
  return `${amount.toLocaleString("ko-KR")}원`;
}

function estimateInheritanceTax(form) {
  const grossEstate = parseKrw(form.assetValue) + parseKrw(form.giftValue);
  const debt = parseKrw(form.debtValue);
  const funeralDeduction = 10_000_000;
  const lumpSumDeduction = form.heirCount > 0 ? 500_000_000 : 200_000_000;
  const spouseInput = parseKrw(form.spouseValue);
  const spouseDeduction = spouseInput > 0 ? Math.min(Math.max(spouseInput, 500_000_000), 3_000_000_000) : 0;
  const deductions = Math.min(grossEstate, debt + funeralDeduction + lumpSumDeduction + spouseDeduction);
  const taxBase = Math.max(0, grossEstate - deductions);
  if (taxBase === 0) {
    return {
      grossEstate,
      deductions,
      taxBase,
      calculatedTax: 0,
      bracket: { label: "과세표준 없음 / 0%" },
    };
  }

  const bracket = inheritanceTaxBrackets.find((item) => taxBase <= item.limit);
  const calculatedTax = Math.max(0, taxBase * bracket.rate - bracket.deduction);

  return {
    grossEstate,
    deductions,
    taxBase,
    calculatedTax,
    bracket,
  };
}

function renderResult() {
  const form = getFormState();
  const profile = profiles[form.goal];
  const score = calculateScore(profile.score, form.heirCount);
  const tax = estimateInheritanceTax(form);

  document.querySelector("#score").textContent = score;
  document.querySelector("#score-bar").style.setProperty("--score", `${score}%`);
  document.querySelector("#result-summary").textContent = `${form.assetValue} 규모의 ${form.assetType}은 ${profile.summary}`;
  document.querySelector("#trust-result").textContent = profile.trust;
  document.querySelector("#tax-result").textContent = profile.tax;
  document.querySelector("#liquidity-result").textContent = profile.liquidity;
  document.querySelector("#estimated-tax").textContent = formatKrw(tax.calculatedTax);
  document.querySelector("#tax-gross").textContent = formatKrw(tax.grossEstate);
  document.querySelector("#tax-deductions").textContent = formatKrw(tax.deductions);
  document.querySelector("#tax-base").textContent = formatKrw(tax.taxBase);
  document.querySelector("#tax-rate").textContent = tax.bracket.label;
  document.querySelector("#next-actions").innerHTML = profile.actions.map((action) => `<li>${action}</li>`).join("");
}

function renderAssets() {
  document.querySelector("#asset-list").innerHTML = assets
    .map(
      (asset) => `
        <article class="asset-card">
          <div>
            <strong>${asset.name}</strong>
            <span>${asset.status}</span>
          </div>
          <dl>
            <div>
              <dt>평가액</dt>
              <dd>${asset.value}</dd>
            </div>
            <div>
              <dt>리스크</dt>
              <dd>${asset.risk}</dd>
            </div>
          </dl>
        </article>
      `,
    )
    .join("");
}

function renderVault() {
  document.querySelector("#vault-steps").innerHTML = vaultSteps
    .map(
      (step, index) => `
        <div class="vault-step ${step.state === "완료" ? "is-done" : ""} ${step.state === "진행 중" ? "is-active" : ""}">
          <span>${index + 1}</span>
          <strong>${step.title}</strong>
          <em>${step.state}</em>
        </div>
      `,
    )
    .join("");
}

document.querySelector("#diagnosis-form").addEventListener("submit", (event) => {
  event.preventDefault();
  renderResult();
  document.querySelector("#sample-result").scrollIntoView({ behavior: "smooth", block: "start" });
});

document.querySelector("#diagnosis-form").addEventListener("input", renderResult);
document.querySelector("#diagnosis-form").addEventListener("change", renderResult);

renderResult();
renderAssets();
renderVault();
