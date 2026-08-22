import 'package:flutter/material.dart';
import '../state/company_registration_controller.dart';
import '../theme/tokens.dart';

/// 🔴 서버가 준 `error.message`를 **그대로** 띄운다. 프론트가 문장을 짓지 않는다.
class UploadFailureBanner extends StatelessWidget {
  const UploadFailureBanner({super.key, required this.failures, required this.onDismiss});

  final List<UploadFailure> failures;
  final ValueChanged<UploadFailure> onDismiss;

  @override
  Widget build(BuildContext context) {
    if (failures.isEmpty) return const SizedBox.shrink();
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        for (final f in failures)
          Container(
            margin: const EdgeInsets.only(bottom: 8),
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
            decoration: BoxDecoration(
              color: const Color(0xFFFDF3F3),
              borderRadius: AppRadius.card,
              border: Border.all(color: const Color(0xFFF0C9C9)),
            ),
            child: Row(
              children: [
                const Icon(Icons.error_outline, size: 20, color: Color(0xFFB02828)),
                const SizedBox(width: 10),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(f.filename, style: AppText.rowSub.copyWith(color: const Color(0xFF7A1D1D))),
                      const SizedBox(height: 2),
                      Text(f.message, style: AppText.rowSub.copyWith(color: const Color(0xFF7A1D1D), fontWeight: FontWeight.w600)),
                    ],
                  ),
                ),
                IconButton(
                  onPressed: () => onDismiss(f),
                  icon: const Icon(Icons.close, size: 18, color: Color(0xFF7A1D1D)),
                  tooltip: '닫기',
                ),
              ],
            ),
          ),
      ],
    );
  }
}
