import 'package:flutter/material.dart';

/// 글자 배율만 바꾸고 **나머지 MediaQuery는 그대로 물려받는다.**
///
/// 🔴 `MediaQuery(data: MediaQueryData(textScaler: ...))`로 감싸면 `size`가 `Size.zero`가 된다.
///    `WidgetsApp`은 자기 MediaQuery를 만들지 않으므로(View가 만든다) 그 zero가 그대로 화면에 간다 —
///    폭을 1920으로 잡아 놓고도 트리 전체가 compact로 그려졌고, 폭 스윕이 전부 같은 레이아웃을 봤다.
class Scaled extends StatelessWidget {
  const Scaled({super.key, required this.textScale, required this.child});

  final double textScale;
  final Widget child;

  @override
  Widget build(BuildContext context) => MediaQuery(
        data: MediaQuery.of(context).copyWith(textScaler: TextScaler.linear(textScale)),
        child: child,
      );
}
