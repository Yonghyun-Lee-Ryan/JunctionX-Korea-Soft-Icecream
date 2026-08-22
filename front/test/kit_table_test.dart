import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:solar_for_bid/api/factsheet.dart';
import 'package:solar_for_bid/widgets/kit_table.dart';

/// 요구사항 체크리스트의 체크박스 — 🔴 체크 안 된 칸이 직사각형으로 늘어나던 실측(표 칸이 폭을 꽉 채운다),
///    체크 상태가 위젯 안에 살아 탭을 나가면 사라지던 실측.
KitTab _tab({List<String> checked = const []}) => KitTab(
      id: 'compliance', title: '요구사항 체크리스트', kind: 'checklist',
      columns: const ['요구사항 ID', '명칭'],
      rows: const [
        [KitCell('CSR-001'), KitCell('로그인')],
        [KitCell('CSR-002'), KitCell('검색')],
      ],
      checked: checked,
    );

Future<List<(String, bool)>> _pump(WidgetTester t, {Set<String> checked = const {}}) async {
  final calls = <(String, bool)>[];
  await t.pumpWidget(MaterialApp(
    home: Scaffold(
      body: SizedBox(width: 800, child: KitTableCard(tab: _tab(), checked: checked, onCheck: (k, v) => calls.add((k, v)))),
    ),
  ));
  await t.pump();
  return calls;
}

void main() {
  testWidgets('🔴 체크 안 된 칸도 체크된 칸과 같은 24×24 정사각형이다', (t) async {
    await _pump(t, checked: {'CSR-002'});
    expect(t.getSize(find.byKey(const ValueKey('check:CSR-001:off'))), const Size(24, 24));
    expect(t.getSize(find.byKey(const ValueKey('check:CSR-002:on'))), const Size(24, 24));
  });

  testWidgets('🔴 체크는 부모가 준 값으로 그리고, 누르면 onCheck(키, 새 값)로 알린다 — 위젯이 스스로 기억하지 않는다', (t) async {
    final calls = await _pump(t, checked: {'CSR-002'});
    await t.tap(find.byKey(const ValueKey('check:CSR-001:off')));
    await t.pump();
    expect(calls, [('CSR-001', true)]);
    await t.tap(find.byKey(const ValueKey('check:CSR-002:on')));
    await t.pump();
    expect(calls.last, ('CSR-002', false));
    // 부모가 값을 바꾸기 전에는 그대로 — 저장이 실패하면 화면이 거짓으로 체크되지 않는다
    expect(find.byKey(const ValueKey('check:CSR-001:off')), findsOneWidget);
  });
}
