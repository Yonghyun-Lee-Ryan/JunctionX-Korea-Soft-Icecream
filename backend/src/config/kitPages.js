/**
 * 응찰 준비(Bid Kit) 화면의 **탭 구성**.
 *
 * 🔴 프론트가 tab id로 분기하지 않게 **서버가 배치를 정한다.**
 *    Figma는 「WBS」 한 장에 WBS·임계경로·M/M 원가 세 패널을 같이 두는데,
 *    그걸 화면 코드에 박으면 패널이 늘 때마다 화면이 바뀐다.
 *
 * 🔴 `tabs`에 적힌 id 중 **실제로 존재하는 것만** 그려진다.
 *    아직 에이전트가 만들지 않은 탭은 비어 있고, 화면이 「아직 없음」이라고 말한다.
 *
 * 🔴 `span: 'full'`은 열 위에 **전폭**으로 얹는다는 뜻이다. 배너와 큰 표가 그렇다.
 * 🔴 `kind: 'upload'`인 페이지는 좌측 서류 목록 + 우측 드롭존 레이아웃이다.
 */
export const KIT_PAGES = [
  {
    id: 'files',
    label: '파일제출',
    kind: 'upload',
    // 좌 필요한 서류 1055 · 우 드롭존 714 (Figma 74:6470)
    tabs: [{ id: 'submitfiles', column: 0 }],
    columnFlex: [1055, 714],
  },
  {
    id: 'compliance',
    label: '요구사항 체크리스트',
    // 전폭 한 장 (Figma 74:7004)
    tabs: [{ id: 'compliance', column: 0 }],
  },
  {
    id: 'wbs',
    label: 'WBS',
    // 좌 WBS · 우 임계경로 + M/M 원가 (Figma 77:8081)
    // 🔴 임계경로는 별도 탭을 두지 않는다 — 이 탭 안 우측 패널로 이미 보인다
    tabs: [
      { id: 'wbs', column: 0 },
      { id: 'criticalpath', column: 1 },
      { id: 'cost', column: 1 },
    ],
    columnFlex: [1080, 710],
  },
  {
    id: 'submit',
    label: '제출준비',
    // 제출 제약 배너 + 전폭 표, 그 아래 좌 보완요청 1020 · 우 금지 표현 770 (Figma 74:7362)
    tabs: [
      { id: 'constraints', column: 0, span: 'full' },
      { id: 'checklist', column: 0, span: 'full' },
      { id: 'rework', column: 0 },
      { id: 'phrases', column: 1 },
    ],
    columnFlex: [1020, 770],
  },
];

/** 다음 단계 버튼 — 🔴 문구도 서버가 준다 */
export const KIT_PRIMARY_ACTION = {
  files: '다음으로',
  compliance: 'WBS로',
  wbs: '제출준비',
  submit: '제출하기',
};

/**
 * 보조 버튼.
 * 🔴 파일제출에서는 「임시저장」이 아니라 「나중에」다 — 저장할 내 원고가 아직 없고,
 *    이 단계를 건너뛴다는 뜻이기 때문이다. 문구를 화면이 정하지 않는다.
 */
export const KIT_SECONDARY_ACTION = {
  files: '나중에',
  compliance: '임시저장',
  wbs: '임시저장',
  submit: '임시저장',
};
