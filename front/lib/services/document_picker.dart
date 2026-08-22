import 'dart:typed_data';

import 'package:desktop_drop/desktop_drop.dart';
import 'package:file_selector/file_selector.dart';

import '../api/docs_api.dart';

/// 받아들이는 확장자. 🔴 점 없이 소문자.
const kAllowedExtensions = <String>{'pdf'};

/// 아직 못 받는 것. 백엔드가 PDF 텍스트 레이어로 갈래를 판정하기 때문이다.
const kPlannedExtensions = <String>{'hwp', 'hwpx', 'jpg', 'jpeg', 'png'};

/// 드롭존에 뜨는 문구. 🔴 손으로 쓰지 않고 실제 허용 목록에서 만든다.
String get acceptedLabel {
  final now = kAllowedExtensions.map((e) => e.toUpperCase()).join('・');
  final later = kPlannedExtensions.map((e) => e.toUpperCase()).toSet().join('・');
  return '$now  ·  $later는 준비 중';
}

/// 변환 결과. 🔴 거른 파일을 조용히 버리지 않는다 — 이유를 같이 돌려준다.
class PickOutcome {
  const PickOutcome({required this.docs, required this.rejected});
  final List<PickedDoc> docs;

  /// 파일명 → 거른 이유
  final Map<String, String> rejected;

  bool get isEmpty => docs.isEmpty && rejected.isEmpty;
}

/// 🔴 드롭(DropItem)과 선택(XFile)이 **같은 타입**으로 모인다 — 변환 경로가 하나다.
Future<PickOutcome> toPickedDocs(List<XFile> files) async {
  final out = <PickedDoc>[];
  final rejected = <String, String>{};

  for (final f in files) {
    final name = f.name;
    // macOS Finder 다중 선택 시 최상위로 섞여 들어오는 숨김 파일(.DS_Store 등)
    if (name.isEmpty || name.startsWith('.')) continue;

    if (!isAllowed(name)) {
      rejected[name] = '지금은 PDF만 분석할 수 있습니다.';
      continue;
    }

    // 🔴 웹에서는 XHR로 blob을 다시 받아온다 — 호출당 1회 복사다. 두 번 부르지 않는다.
    //    🔴 macOS에서 폴더를 드롭하면 여기서 **던진다**(웹은 0바이트를 조용히 준다).
    //       잡지 않으면 파일이 아무 말 없이 사라진다.
    Uint8List bytes;
    try {
      bytes = await f.readAsBytes();
    } catch (_) {
      rejected[name] = '파일을 읽지 못했습니다. 폴더이거나 접근 권한이 없는 파일일 수 있습니다.';
      continue;
    }

    // 🔴 웹에서 폴더를 드롭하면 터지지 않고 **0바이트를 조용히** 돌려준다
    if (bytes.isEmpty) {
      rejected[name] = '빈 파일이거나 폴더입니다. 파일을 직접 올려 주세요.';
      continue;
    }
    out.add(PickedDoc(filename: name, bytes: bytes));
  }
  return PickOutcome(docs: out, rejected: rejected);
}

bool isAllowed(String filename) {
  final dot = filename.lastIndexOf('.');
  if (dot < 0) return false;
  return kAllowedExtensions.contains(filename.substring(dot + 1).toLowerCase());
}

/// 🔴 폴더를 통째로 떨어뜨리면 DropItemDirectory가 온다. 평탄화하지 않으면 readAsBytes에서 터진다.
List<XFile> flattenDrop(List<DropItem> items) {
  final flat = <XFile>[];
  void walk(DropItem it) {
    if (it is DropItemDirectory) {
      it.children.forEach(walk);
    } else {
      flat.add(it);
    }
  }

  items.forEach(walk);
  return flat;
}

/// 파일 선택 다이얼로그. web·macOS 공통.
Future<PickOutcome> pickDocuments() async {
  const pdf = XTypeGroup(
    label: '문서',
    extensions: <String>['pdf'],
    uniformTypeIdentifiers: <String>['com.adobe.pdf'],
    mimeTypes: <String>['application/pdf'],
  );
  final files = await openFiles(acceptedTypeGroups: const [pdf]);
  return toPickedDocs(files);
}
