import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:solar_for_bid/api/factsheet.dart';
import 'package:solar_for_bid/theme/tokens.dart';
import 'package:solar_for_bid/widgets/app_chip.dart';
import 'package:solar_for_bid/widgets/kit_panels.dart';

/// 파일제출 줄 — 🔴 파일이 붙은 줄도 눌러서 다시 올릴 수 있어야 하고, 상태 칩의 색은 서버가 준 tone 이다.
///    실측: 「보완 필요」가 초록 칩으로 그려졌고, 준비됨 줄은 다시 올릴 길이 없었다.
KitTab _tab() => const KitTab(
      id: 'submitfiles', title: '필요한 서류', kind: 'docs', columns: [], rows: [],
      items: [
        KitItem(title: '입찰참가신청서', filename: '신청서.pdf', state: 'done', label: '준비됨', chip: KitCell('준비됨', tone: 'ok', chip: true)),
        KitItem(title: '제안서', filename: '제안서_v1.pdf', state: 'done', label: '보완 필요', chip: KitCell('보완 필요', tone: 'warn', chip: true)),
        KitItem(title: '실적증명서', filename: '업로드 되지 않음', state: 'missing', label: '업로드'),
      ],
    );

Future<List<KitItem>> _pump(WidgetTester t) async {
  final tapped = <KitItem>[];
  await t.pumpWidget(MaterialApp(
    home: Scaffold(body: SizedBox(width: 900, child: KitDocsList(tab: _tab(), onUpload: tapped.add))),
  ));
  await t.pump();
  return tapped;
}

void main() {
  testWidgets('🔴 파일이 붙은 줄(준비됨·보완 필요)에도 「다시 올리기」가 있고, 누르면 그 서류로 올린다', (t) async {
    final tapped = await _pump(t);
    expect(find.text('다시 올리기'), findsNWidgets(2));
    expect(find.text('업로드'), findsOneWidget);
    await t.tap(find.text('다시 올리기').last);
    await t.pump();
    expect(tapped.single.title, '제안서');
  });

  testWidgets('🔴 상태 칩의 색은 서버가 준 tone — 보완 필요는 주의색(urgent), 준비됨은 초록', (t) async {
    await _pump(t);
    // 🔴 AppChip.tone 의 어휘: warn → urgent 칩. 초록(준비됨)으로 그리지 않는 것이 핵심이다
    final warn = t.widget<AppChip>(find.widgetWithText(AppChip, '보완 필요'));
    expect(warn.background, AppColors.urgentBg);
    expect(warn.background, isNot(AppColors.successBg));
    final ok = t.widget<AppChip>(find.widgetWithText(AppChip, '준비됨'));
    expect(ok.background, AppColors.successBg);
  });
}
