import 'package:flutter/material.dart';

/// Figma 디자인 토큰. 🔴 화면 코드에 hex를 직접 쓰지 않는다 — 전부 여기를 거친다.
/// 출처: Figma `정션2026` / node 47:896 「회사 등록」
abstract final class AppColors {
  // ── 기본 ────────────────────────────────────────────
  static const black = Color(0xFF090909);        // --black
  static const canvas = Color(0xFFFDFDFD);       // 배경
  static const surface = Color(0xFFFFFFFF);      // 카드·사이드바

  // ── 글자 ────────────────────────────────────────────
  static const fontGray1 = Color(0xFF707070);    // --font-gray1
  static const fontGray2 = Color(0xFF9D9D9D);    // --font-gray2
  static const fontMuted = Color(0xFFBABABA);    // 보조 설명·파일명
  static const subhead = Color(0xFF9198B2);      // 화면 부제

  // ── 선 ──────────────────────────────────────────────
  static const line1 = Color(0xFFF3F3F3);        // --line1 (카드 테두리)
  static const border = Color(0xFFDADADA);       // 버튼 테두리

  // ── 강조 ────────────────────────────────────────────
  static const primary = Color(0xFF5D53FF);
  static const primarySoft = Color(0xFFEFF2FF);  // 선택된 nav · 「읽는 중」 칩

  // ── 상태 칩 ─────────────────────────────────────────
  static const chipBg1 = Color(0xFFEEF3FB);      // --chip-bg1
  static const chipTypo1 = Color(0xFF7C97B6);    // --chip-typo1
  static const successBg = Color(0xFFDEF8F1);
  static const successFg = Color(0xFF00A54C);
  static const neutralBg = Color(0xFFF0F0F0);
  static const neutralFg = fontGray2;
  static const warnBg = Color(0xFFFFF4E5);
  static const warnFg = Color(0xFFB26B00);
  static const dangerBg = Color(0xFFFFE9EC);
  static const dangerFg = Color(0xFFE40027);
  // 마감이 임박한 D-day
  static const urgentBg = Color(0xFFFFF4D8);
  static const urgentFg = Color(0xFFFF8800);
  /// 제출 제약 배너
  static const noticeBg = Color(0xFFFFF4DB);

  // ── M/M 예상 원가 카드 (Figma 77:8081) ───────────────
  /// 🔴 rgba(238,243,251,0.51) — 흰 카드 위에 얹히는 반투명이라 알파를 그대로 둔다
  static const metricBg = Color(0x82EEF3FB);
  static const metricBorder = Color(0xFFD4E3F8);
  static const metricEvidence = Color(0xFF6684A6);
}

/// 🔴 Pretendard가 없으면 시스템 한글 폰트로 떨어진다 — 자간·크기는 그대로 유지된다.
///    assets/fonts/README.md 참고.
abstract final class AppText {
  static const _family = 'Pretendard';

  static TextStyle _t(double size, FontWeight w, Color c, double tracking) => TextStyle(
        fontFamily: _family,
        fontSize: size,
        fontWeight: w,
        color: c,
        letterSpacing: tracking,
        height: 1.2,
      );

  // 자간은 Figma의 tracking(px)을 그대로 옮겼다
  static final brand = TextStyle(
      fontFamily: 'Inter', fontSize: 22, fontWeight: FontWeight.w600,
      color: Colors.black, letterSpacing: -0.66, height: 1.2);

  static final pageTitle = _t(34, FontWeight.w600, AppColors.black, -1.02);
  static final pageSubtitle = _t(20, FontWeight.w500, AppColors.subhead, -0.6);
  static final sectionTitle = _t(20, FontWeight.w600, AppColors.black, -0.6);
  static final cardTitle = _t(24, FontWeight.w600, AppColors.black, -0.72);

  static final navActive = _t(18, FontWeight.w600, AppColors.primary, -0.54);
  static final navIdle = _t(18, FontWeight.w500, AppColors.fontGray1, -0.54);

  static final rowTitle = _t(20, FontWeight.w600, AppColors.black, -0.6);
  static final rowSub = _t(16, FontWeight.w500, AppColors.fontMuted, -0.48);
  static final fieldLabel = _t(20, FontWeight.w600, AppColors.fontGray1, -0.6);
  static final fieldValue = _t(18, FontWeight.w600, AppColors.black, -0.54);

  static final chip = _t(14, FontWeight.w500, AppColors.chipTypo1, -0.42);
  static final button = _t(20, FontWeight.w600, Colors.white, -0.6);
  static final buttonGhost = _t(20, FontWeight.w600, AppColors.fontGray1, -0.6);
  static final smallButton = _t(14, FontWeight.w500, AppColors.fontGray1, -0.42);
  static final chooseFile = _t(18, FontWeight.w500, AppColors.fontGray2, -0.54);

  static final kitTitle = _t(30, FontWeight.w600, AppColors.black, -0.9);
  static final kitMeta = _t(20, FontWeight.w500, AppColors.subhead, -0.6);
  static final tabLabel = _t(18, FontWeight.w600, AppColors.subhead, -0.54);
  static final tabLabelActive = _t(18, FontWeight.w600, AppColors.black, -0.54);
  static final cellHead = _t(18, FontWeight.w600, AppColors.fontGray1, -0.54);
  static final cell = _t(18, FontWeight.w600, AppColors.black, -0.54);
  static final cellProviso = _t(18, FontWeight.w600, AppColors.urgentFg, -0.54);
  static final bigNumber = _t(36, FontWeight.w700, AppColors.black, -1.08);

  /// M/M 예상 원가의 큰 숫자 — 🔴 보라다. 강조가 아니라 «우리가 계산한 값»이라는 표시다
  static final metricValue = _t(36, FontWeight.w700, AppColors.primary, -1.08);
  static final metricCaption = _t(18, FontWeight.w600, AppColors.fontGray1, -0.54);
  static final metricNote = _t(16, FontWeight.w500, AppColors.primary, -0.48);
  static final metricEvidence = _t(16, FontWeight.w500, AppColors.metricEvidence, -0.48);

  /// 제출 제약 배너
  static final bannerLabel = _t(18, FontWeight.w700, AppColors.urgentFg, -0.54);
  static final bannerText = _t(18, FontWeight.w600, AppColors.chipTypo1, -0.54);
  static final bannerEvidence = _t(18, FontWeight.w500, AppColors.fontGray2, -0.54);

  /// 셀 색 — 🔴 서버가 준 tone을 옮길 뿐, 값을 보고 고르지 않는다
  static final cellDanger = _t(18, FontWeight.w700, AppColors.dangerFg, -0.54);
  static final cellWarn = _t(18, FontWeight.w700, AppColors.urgentFg, -0.54);
  static final cellMuted = _t(18, FontWeight.w700, AppColors.fontGray2, -0.54);
  static final cellOk = _t(18, FontWeight.w700, AppColors.successFg, -0.54);

  /// 글로 말하는 카드
  static final noteBody = _t(16, FontWeight.w400, AppColors.black, -0.48);
  static final noteEmphasis = _t(16, FontWeight.w600, AppColors.dangerFg, -0.48);
  static final noteEvidence = _t(16, FontWeight.w400, AppColors.fontGray1, -0.48);

  static final cardHeadline = _t(22, FontWeight.w600, AppColors.black, -0.66);
  static final reqTitle = _t(20, FontWeight.w600, AppColors.fontGray1, -0.6);
  static final actionButton = _t(16, FontWeight.w500, AppColors.fontGray1, -0.48);
  static final excludedTitle = _t(20, FontWeight.w600, AppColors.fontGray1, -0.6);
  static final excludedBody = _t(20, FontWeight.w500, AppColors.fontGray1, -0.6);

  static final statLabel = _t(18, FontWeight.w600, AppColors.fontGray2, -0.54);
  static final statValue = _t(30, FontWeight.w600, AppColors.black, -0.9);
  static final statSub = _t(16, FontWeight.w500, AppColors.fontGray2, -0.48);

  static final sidebarLabel = _t(16, FontWeight.w500, AppColors.fontGray2, -0.48);
  static final sidebarCardTitle = _t(16, FontWeight.w700, AppColors.fontGray1, -0.48);
  static final sidebarCardSub = _t(16, FontWeight.w500, AppColors.fontGray2, -0.48);
}

abstract final class AppRadius {
  static const card = BorderRadius.all(Radius.circular(8));
  static const chip = BorderRadius.all(Radius.circular(8));
  static const bar = BorderRadius.all(Radius.circular(19));
}

abstract final class AppIcons {
  static const _base = 'assets/icons';
  static const logo = '$_base/logo.svg';
  static const navCompany = '$_base/nav_company.svg';
  static const navSearch = '$_base/nav_search.svg';
  static const navBids = '$_base/nav_bids.svg';
  static const navSettings = '$_base/nav_settings.svg';
  static const uploadCloud = '$_base/upload_cloud.svg';
  static const docFile = '$_base/doc_file.svg';
  static const check = '$_base/check.svg';
  static const clock = '$_base/clock.svg';
  static const checkOk = '$_base/check_ok.svg';
  static const refresh = '$_base/refresh.svg';
  static const chevronDown = '$_base/chevron_down.svg';
  static const chevronUp = '$_base/chevron_up.svg';
  static const cardFade = '$_base/card_fade.svg';
  static const scrollHint = '$_base/scroll_hint.svg';
  static const dividerWide = '$_base/divider_wide.svg';
  static const back = '$_base/back.svg';
  static const download = '$_base/download.svg';
  static const warnCircle = '$_base/warn_circle.svg';
  static const checkboxOn = '$_base/checkbox_on.svg';
  static const infoCircle = '$_base/info_circle.svg';
  static const dividerH = '$_base/divider_h.svg';
  static const dividerV = '$_base/divider_v.svg';
}
