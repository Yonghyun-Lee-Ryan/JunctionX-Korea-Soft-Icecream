/**
 * 응찰 준비(Bid Kit) 화면의 **탭 구성**.
 *
 * 🔴 프론트가 tab id로 분기하지 않게 **서버가 배치를 정한다.**
 *    Figma는 「WBS」 탭 한 장에 WBS·임계경로·M/M 원가 세 패널을 같이 두는데,
 *    그걸 화면 코드에 박으면 탭이나 패널이 늘 때마다 화면이 바뀐다.
 *
 * 🔴 `tabs`에 적힌 id 중 **실제로 존재하는 것만** 그려진다.
 *    아직 에이전트가 만들지 않은 탭은 비어 있고, 화면이 「아직 없음」이라고 말한다.
 */
export const KIT_PAGES = [
  {
    id: 'compliance',
    label: '요구사항 체크리스트',
    tabs: [{ id: 'compliance', column: 0 }],
  },
  {
    id: 'wbs',
    label: 'WBS',
    // 좌 WBS · 우 임계경로 + M/M 원가 (Figma 58:4886)
    tabs: [
      { id: 'wbs', column: 0 },
      { id: 'criticalpath', column: 1 },
      { id: 'cost', column: 1 },
    ],
    columnFlex: [1080, 710],
  },
  {
    id: 'criticalpath',
    label: '임계경로',
    tabs: [{ id: 'criticalpath', column: 0 }],
  },
  {
    id: 'submit',
    label: '제출준비',
    tabs: [
      { id: 'checklist', column: 0 },
      { id: 'rework', column: 0 },
    ],
  },
];

/** 다음 단계 버튼 — 🔴 문구도 서버가 준다 */
export const KIT_PRIMARY_ACTION = {
  compliance: 'WBS로',
  wbs: '제출준비',
  criticalpath: '제출준비',
  submit: '제출하기',
};
