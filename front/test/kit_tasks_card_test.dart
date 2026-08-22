import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:solar_for_bid/api/factsheet.dart';
import 'package:solar_for_bid/widgets/kit_panels.dart';

/// 보완요청·금지 표현 카드 — 🔴 파일을 올렸는데 화면이 아무 반응이 없던 실측(Solar 재검사 40~80초 동안 침묵).
KitTab _tasks({String? filename}) => KitTab(
      id: 'rework', title: '보완요청 1건', kind: 'tasks', columns: const [], rows: const [],
      items: [
        KitItem(
          title: '실적증명서', detail: '발주기관 직인본 필요 - 사본 불가', filename: filename,
          chip: const KitCell('보완 필요', tone: 'warn', chip: true),
          action: const KitAction(label: '보완 자료 올리기', kind: 'upload'),
        ),
      ],
    );

const _note = KitTab(
  id: 'phrases', title: '금지 표현 검사', kind: 'note', columns: [], rows: [],
  note: KitNoteData(body: '제안서 원고 미제출 — 원고를 올리면 다시 검사합니다.', emphasis: '미제출', action: KitAction(label: '제안서 원고 올리기', kind: 'upload')),
);

void main() {
  testWidgets('🔴 올린 파일이 있으면 카드에 「올린 파일: …」 — 상태가 보완 필요 그대로여도 올린 사실이 보인다', (t) async {
    await t.pumpWidget(MaterialApp(home: Scaffold(body: KitTasksCard(tab: _tasks(filename: '실적증명서_v2.pdf')))));
    expect(find.textContaining('올린 파일: 실적증명서_v2.pdf'), findsOneWidget);
    await t.pumpWidget(MaterialApp(home: Scaffold(body: KitTasksCard(tab: _tasks()))));
    expect(find.textContaining('올린 파일'), findsNothing);
  });

  testWidgets('🔴 올리는 동안(busy) 버튼은 「올리는 중…」이고 눌리지 않는다 — 보완요청·금지 표현 둘 다', (t) async {
    var taps = 0;
    await t.pumpWidget(MaterialApp(
      home: Scaffold(
        body: Column(children: [
          KitTasksCard(tab: _tasks(), busy: true, onAction: (_) => taps++),
          KitNoteCard(tab: _note, busy: true, onAction: (_) => taps++),
        ]),
      ),
    ));
    expect(find.text('올리는 중…'), findsNWidgets(2));
    expect(find.text('보완 자료 올리기'), findsNothing);
    expect(find.text('제안서 원고 올리기'), findsNothing);
    await t.tap(find.text('올리는 중…').first);
    await t.tap(find.text('올리는 중…').last);
    await t.pump();
    expect(taps, 0);
  });
}
