import '../api/models.dart';

/// 화면의 「필요한 서류」 한 칸.
/// 🔴 백엔드 8갈래와 1:1이 아니다 — 디자인이 「중소기업 확인서・지정서」처럼 둘을 묶는다.
class DocSlot {
  const DocSlot({required this.title, required this.accepts});
  final String title;

  /// 이 칸이 받아들이는 백엔드 docType.key
  final List<String> accepts;
}

const kDocSlots = <DocSlot>[
  DocSlot(title: '사업자 등록증', accepts: ['biz_reg']),
  DocSlot(title: '실적증명서', accepts: ['performance']),
  DocSlot(title: '재무제표', accepts: ['financial']),
  DocSlot(title: '기술인력 보유현황', accepts: ['tech_staff']),
  DocSlot(title: '중소기업 확인서・지정서', accepts: ['sme_cert', 'pia_designation']),
];

/// 🔴 위 칸에 안 들어가는 갈래(credit_rating · sw_business)도 버리지 않는다.
///    올라오면 목록 끝에 서버가 준 label 그대로 한 줄을 붙인다.
const kSlottedKeys = {'biz_reg', 'performance', 'financial', 'tech_staff', 'sme_cert', 'pia_designation'};

/// 회사 카드 미리보기 한 줄의 정의.
/// 🔴 값은 **추출 결과에서 꺼내기만** 한다. 없으면 없다고 둔다 — 채워 넣지 않는다.
class CardFieldSpec {
  const CardFieldSpec({
    required this.label,
    required this.sources,
    required this.read,
    this.combine = false,
  });

  final String label;

  /// 이 줄을 채울 수 있는 docType.key. 앞에 있는 것이 우선이다
  final List<String> sources;

  /// 해당 문서의 extraction에서 표시값을 꺼낸다. 못 꺼내면 null
  final String? Function(Extraction e) read;

  /// 🔴 true면 **첫 매치에서 멈추지 않고** 모든 source의 값을 모아 「・」로 잇는다.
  ///    「등록・지정」이 그렇다 — 소프트웨어사업자 신고확인서와 영향평가기관 지정서가
  ///    각각 한 조각씩 갖고 있어서, 먼저 잡히는 하나만 쓰면 영영 합쳐지지 않는다.
  final bool combine;
}

/// 🔴 자릿수 구분만 넣는다. 「84.2억」처럼 표기를 바꾸지 않는다.
///    음수·소수·비유한수에서 깨지지 않아야 한다.
String formatAmount(Object? v) {
  if (v == null) return '';
  final n = v is num ? v : num.tryParse(v.toString().replaceAll(',', ''));
  if (n == null || !n.isFinite) return v.toString();

  final neg = n < 0;
  final abs = n.abs();
  final whole = abs.truncate();
  final frac = abs - whole;

  final digits = whole.toString();
  final b = StringBuffer();
  for (var i = 0; i < digits.length; i++) {
    if (i > 0 && (digits.length - i) % 3 == 0) b.write(',');
    b.write(digits[i]);
  }
  // 소수를 반올림해 없애지 않는다 — 있는 그대로 붙인다
  final tail = frac == 0 ? '' : frac.toString().substring(1);
  return '${neg ? '-' : ''}$b$tail';
}

final kCardFields = <CardFieldSpec>[
  CardFieldSpec(
    label: '상호',
    sources: ['biz_reg', 'sme_cert', 'credit_rating', 'sw_business', 'pia_designation', 'financial', 'tech_staff', 'performance'],
    read: (e) => e.pick([
      '법인명_단체명', 'company_name', 'evaluated_company_name',
      'applicant_company_name', 'designated_organization_name', 'summary_table_company_name',
    ]),
  ),
  CardFieldSpec(
    label: '소재지',
    sources: ['biz_reg', 'pia_designation', 'sw_business', 'credit_rating', 'sme_cert'],
    read: (e) => e.pick([
      '사업장소재지', '본점소재지', 'designated_organization_address',
      'applicant_address', 'evaluated_company_address', 'company_address',
    ]),
  ),
  CardFieldSpec(
    label: '기업 규모',
    sources: ['sme_cert'],
    read: (e) => e.pick(['company_size_classification']),
  ),
  CardFieldSpec(
    label: '등록・지정',
    // 🔴 합성이다. 하나만 잡고 끝내면 「소프트웨어사업」만 남는다
    combine: true,
    sources: ['sw_business', 'pia_designation', 'biz_reg'],
    read: (e) {
      final v = e.pick(['reported_business_field']) ?? e.pick(['designation_field']);
      if (v != null) return v;
      // 사업자등록증의 업태·종목에서 종목만 이어 붙인다
      final kinds = e.data['사업의종류'];
      if (kinds is List && kinds.isNotEmpty) {
        final names = kinds
            .whereType<Map>()
            .map((m) => (m['종목'] ?? '').toString())
            .where((s) => s.isNotEmpty)
            .toList();
        if (names.isNotEmpty) return names.join('・');
      }
      return null;
    },
  ),
  CardFieldSpec(
    label: '최근 실적',
    sources: ['performance'],
    read: (e) {
      final cnt = e.data['summary_table_total_case_count'];
      final amt = e.data['summary_table_total_amount'];
      if (cnt == null && amt == null) return null;
      return [
        if (cnt != null) '$cnt건',
        if (amt != null) '${formatAmount(amt)}원',
      ].join(' · ');
    },
  ),
  CardFieldSpec(
    label: '재무',
    sources: ['financial'],
    read: (e) {
      // 🔴 매출은 평탄한 키가 아니라 recent_3_year_sales 안에 있다.
      //    🔴 마지막 항목을 집으면 안 된다 — 그 자리는 「3개년 합계」다.
      //    합계 행을 두 겹으로 막는다: ① 기간 날짜가 없는 행 ② 라벨에 「합계」가 든 행.
      //    (합계 행이 날짜를 갖고 오는 판이 오면 ①만으로는 2.7배 부풀어 보인다)
      final years = e.data['recent_3_year_sales'];
      if (years is List) {
        Map? latest;
        var latestEnd = '';
        for (final y in years.whereType<Map>()) {
          final label = (y['fiscal_year_label'] ?? '').toString();
          if (label.contains('합계') || label.contains('소계') || label.contains('평균')) continue;
          final end = (y['period_end_date'] ?? '').toString();
          if (end.isEmpty) continue;
          if (end.compareTo(latestEnd) > 0) {
            latestEnd = end;
            latest = y;
          }
        }
        final sales = latest?['sales_amount'];
        if (sales != null) {
          final label = latest?['fiscal_year_label']?.toString() ?? '';
          return '$label 매출 ${formatAmount(sales)}원'.trim();
        }
      }
      // 🔴 매출을 못 뽑으면 **기간 라벨을 대신 보여 주지 않는다.**
      //    「제17(당)기」를 재무 값으로 확정 표시하면 값을 아는 것처럼 보인다.
      return null;
    },
  ),
  CardFieldSpec(
    label: '인력',
    sources: ['tech_staff', 'sw_business'],
    read: (e) {
      final total = e.data['total_personnel_count'] ?? e.data['applicant_technical_staff_count'];
      final ratio = e.data['regular_employee_ratio_percent'];
      if (total == null) return null;
      return ratio == null ? '$total명' : '$total명 · 정규직 $ratio%';
    },
  ),
];
