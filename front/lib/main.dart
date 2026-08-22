import 'package:flutter/material.dart';

import 'api/http_docs_api.dart';
import 'app_root.dart';
import 'services/document_picker.dart' as picker;
import 'state/company_registration_controller.dart';
import 'theme/tokens.dart';
import 'api/docs_api.dart';

void main() {
  final api = HttpDocsApi();
  runApp(SolarForBidApp(api: api, controller: CompanyRegistrationController(api)));
}

class SolarForBidApp extends StatelessWidget {
  const SolarForBidApp({
    super.key,
    required this.controller,
    required this.api,
    this.pickDocuments,
    this.startCompanyId,
  });

  final CompanyRegistrationController controller;
  final DocsApi api;

  /// 🔴 테스트가 가짜 픽커를 넣는다 — 위젯 테스트에서 실제 파일 다이얼로그를 띄울 수 없다
  final Future<picker.PickOutcome> Function()? pickDocuments;

  /// 테스트가 첫 진입 분기를 건너뛸 때만
  final String? startCompanyId;

  @override
  Widget build(BuildContext context) => MaterialApp(
        title: 'Solar for Bid',
        debugShowCheckedModeBanner: false,
        theme: ThemeData(
          useMaterial3: true,
          fontFamily: 'Pretendard',
          scaffoldBackgroundColor: AppColors.canvas,
          colorScheme: ColorScheme.fromSeed(seedColor: AppColors.primary, surface: AppColors.surface),
          dividerColor: AppColors.line1,
        ),
        home: AppRoot(
          api: api,
          controller: controller,
          pickDocuments: pickDocuments,
          startCompanyId: startCompanyId,
        ),
      );
}
