/// 서류 한 건의 상태. 🔴 백엔드 `POST /api/docs/upload`의 결과가 여기로 들어온다.
enum DocStatus {
  /// 아직 올리지 않음 → 「업로드」 버튼
  missing,

  /// 에이전트가 읽는 중 → 보라 칩 + 진행 막대
  reading,

  /// 추출 완료 → 초록 칩(docType key)
  done,
}

class CompanyDocument {
  const CompanyDocument({
    required this.title,
    required this.subtitle,
    required this.status,
    this.typeKey,
    this.progress,
  });

  final String title;

  /// 파일명 또는 「업로드 되지 않음」
  final String subtitle;
  final DocStatus status;

  /// done일 때 초록 칩에 뜨는 값 (예: co_biz_reg)
  final String? typeKey;

  /// reading일 때 0.0~1.0.
  /// 🔴 **null이면 indeterminate**다. 우리 API는 동기라 진행률을 알 수 없으므로
  ///    보통 null이다 — Figma 목업의 76%는 정지 화면이지 실제 값이 아니다.
  ///    0을 넣으면 막대가 0%로 «굳어» 멈춘 것처럼 보인다.
  final double? progress;
}

/// 회사 카드 미리보기 한 줄의 상태.
///
/// 🔴 `confirmed`와 `unverified`를 가른 이유 — 라이브 8건 중 6건이 `confidence:"unknown"`이다.
///    배열 필드에는 confidence가 실려 오지 않기 때문이고, 그걸 초록 체크(확정)로 그리면
///    **확인되지 않은 값을 확인됐다고 말하는 것**이 된다.
enum FieldStatus {
  /// 값이 있고 추출 신뢰도가 high
  confirmed,

  /// 값은 있으나 신뢰도가 low·unknown → ⚠ + 근거 쪽
  unverified,

  /// 이 줄을 채울 문서가 지금 올라오는 중
  reading,

  /// 채울 문서가 아직 없음
  missing,
}

class CompanyCardField {
  const CompanyCardField({
    required this.label,
    required this.value,
    required this.source,
    required this.status,
    this.page = 0,
  });

  final String label;
  final String value;

  /// 근거 파일명. 🔴 값이 어디서 나왔는지를 잃지 않는다
  final String source;
  final FieldStatus status;

  /// 근거 쪽. 🔴 0이면 「쪽 미상」
  final int page;
}

class CrossCheckItem {
  const CrossCheckItem({required this.label, required this.badge});
  final String label;
  final String badge;
}
