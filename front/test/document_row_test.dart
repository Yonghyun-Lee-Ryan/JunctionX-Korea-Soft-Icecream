import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:solar_for_bid/models/company_document.dart';
import 'package:solar_for_bid/widgets/document_row.dart';

Future<void> _pump(WidgetTester t, CompanyDocument doc) async {
  await t.pumpWidget(MaterialApp(
    home: Scaffold(body: SizedBox(width: 700, child: DocumentRow(doc: doc))),
  ));
}

void main() {
  testWidgets('done — 초록 칩에 docType key', (t) async {
    await _pump(t, const CompanyDocument(
      title: '사업자 등록증', subtitle: 'a.pdf', status: DocStatus.done, typeKey: 'co_biz_reg'));
    expect(find.text('co_biz_reg'), findsOneWidget);
    expect(find.byType(LinearProgressIndicator), findsNothing);
  });

  testWidgets('missing — 업로드 버튼', (t) async {
    await _pump(t, const CompanyDocument(
      title: '재무제표', subtitle: '업로드 되지 않음', status: DocStatus.missing));
    expect(find.text('업로드'), findsOneWidget);
  });

  testWidgets('🔴 reading — 막대가 indeterminate여야 한다 (0%로 굳으면 멈춘 것처럼 보인다)', (t) async {
    await _pump(t, const CompanyDocument(
      title: '실적증명서.pdf', subtitle: '문서 종류를 판정하는 중입니다', status: DocStatus.reading));
    expect(find.text('읽는 중'), findsOneWidget);
    final bar = t.widget<LinearProgressIndicator>(find.byType(LinearProgressIndicator));
    expect(bar.value, isNull, reason: 'value가 0이면 막대가 굳는다');
  });

  testWidgets('reading — 값이 주어지면 그 값을 쓴다', (t) async {
    await _pump(t, const CompanyDocument(
      title: 'x', subtitle: 'y', status: DocStatus.reading, progress: 0.4));
    expect(t.widget<LinearProgressIndicator>(find.byType(LinearProgressIndicator)).value, 0.4);
  });

  testWidgets('긴 제목·파일명이 넘치지 않는다', (t) async {
    var overflow = 0;
    final old = FlutterError.onError;
    FlutterError.onError = (d) {
      if (d.exceptionAsString().contains('overflowed')) overflow++;
    };
    await t.pumpWidget(MaterialApp(
      home: Scaffold(
        body: SizedBox(
          width: 300,
          child: DocumentRow(
            doc: const CompanyDocument(
              title: '아주아주 긴 문서 제목이 들어오면 어떻게 되는가 확인용 문자열',
              subtitle: '아주아주_긴_파일명_다온피엠씨_2026_최종_진짜최종_v3.pdf',
              status: DocStatus.done,
              typeKey: 'co_biz_reg',
            ),
          ),
        ),
      ),
    ));
    await t.pump();
    FlutterError.onError = old;
    expect(overflow, 0);
  });
}
