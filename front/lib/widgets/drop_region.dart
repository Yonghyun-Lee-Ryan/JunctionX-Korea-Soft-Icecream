import 'dart:async';

import 'package:desktop_drop/desktop_drop.dart';
import 'package:flutter/material.dart';

import '../services/document_picker.dart';

/// 드롭을 받는 영역.
///
/// 🔴 **카드가 아니라 넓은 영역에 건다.** desktop_drop의 웹 구현은 `web.window`에 전역
///    핸들러를 걸어 브라우저 기본 동작을 막는다. 그래서 279px 카드 밖에 놓으면
///    아무 일도 안 일어나면서 브라우저도 파일을 안 여는 «먹통»처럼 보인다.
///
/// 🔴 **하이라이트가 멈추는 버그를 막는 워치독이 있다.** 웹에서 파일이 아닌 것
///    (텍스트·URL·브라우저 이미지)을 놓으면 플러그인 내부에서 `webkitGetAsEntry()!`가
///    null로 터지고 그 예외가 삼켜진다 → `onDragDone`이 **영영 안 온다** →
///    테두리가 켜진 채 굳는다. dragUpdated가 끊기면 스스로 끈다.
class DropRegion extends StatefulWidget {
  const DropRegion({
    super.key,
    required this.child,
    required this.onFiles,
    this.onDragChanged,
    this.enabled = true,
  });

  final Widget child;
  final Future<void> Function(PickOutcome) onFiles;
  final ValueChanged<bool>? onDragChanged;

  /// 🔴 이 위에 다이얼로그·새 라우트를 띄우면 false로 내려야 한다.
  ///    DropTarget은 화면에서 가려져도 드롭을 계속 받는다.
  final bool enabled;

  @override
  State<DropRegion> createState() => _DropRegionState();
}

class _DropRegionState extends State<DropRegion> {
  static const _watchdog = Duration(milliseconds: 900);
  Timer? _timer;
  bool _dragging = false;

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }

  void _setDragging(bool v) {
    if (_dragging != v) {
      _dragging = v;
      widget.onDragChanged?.call(v);
    }
    _timer?.cancel();
    if (v) {
      // dragUpdated가 끊기면(=드래그가 어떤 이유로든 끝나면) 스스로 끈다
      _timer = Timer(_watchdog, () => _setDragging(false));
    }
  }

  Future<void> _onDone(DropDoneDetails d) async {
    _setDragging(false);
    final outcome = await toPickedDocs(flattenDrop(d.files));
    if (!mounted) return;
    await widget.onFiles(outcome);
  }

  @override
  Widget build(BuildContext context) => DropTarget(
        enable: widget.enabled,
        // 🔴 entered와 updated 둘 다에서 true — 웹은 내부 DOM 경계를 넘을 때 exit가 튄다
        onDragEntered: (_) => _setDragging(true),
        onDragUpdated: (_) => _setDragging(true),
        onDragExited: (_) => _setDragging(false),
        onDragDone: _onDone,
        child: widget.child,
      );
}
