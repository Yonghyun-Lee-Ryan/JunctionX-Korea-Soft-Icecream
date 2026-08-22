// 디자인 대조용 스크린샷 생성기. `flutter test test/golden_capture.dart --update-goldens`
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:solar_for_bid/services/document_picker.dart';
import 'package:solar_for_bid/main.dart';
import 'package:solar_for_bid/state/company_registration_controller.dart';

import '../test/support/fake_api.dart';


void main() {
  testWidgets('회사 등록 1920x1080', (tester) async {
    tester.view.physicalSize = const Size(1920, 1080);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(tester.view.reset);
    await tester.pumpWidget(SolarForBidApp(
      api: FakeApi(),
      controller: CompanyRegistrationController(FakeApi()),
      pickDocuments: () async => const PickOutcome(docs: [], rejected: {}),
    ));
    await tester.pumpAndSettle();
    await expectLater(find.byType(MaterialApp), matchesGoldenFile('goldens/company_registration.png'));
  });
}
