import 'package:flutter/foundation.dart';

import '../api/docs_api.dart';
import '../api/models.dart';
import '../models/company_document.dart';
import 'doc_slots.dart';

/// 업로드가 도는 동안의 한 건.
/// 🔴 우리 API는 동기다 — 응답이 오기 전에는 **문서 종류를 모른다.**
///    아는 척하지 않고 파일명만 보여 준다.
class PendingUpload {
  PendingUpload(this.filename, this.bytes);
  final String filename;
  final int bytes;
}

class UploadFailure {
  const UploadFailure({required this.filename, required this.code, required this.message});
  final String filename;
  final String code;

  /// 🔴 서버가 준 문장 그대로. 프론트가 짓지 않는다
  final String message;
}

class CompanyRegistrationController extends ChangeNotifier {
  CompanyRegistrationController(this._api, {this.maxConcurrent = 3});

  final DocsApi _api;

  /// 🔴 한꺼번에 여러 건을 드롭해도 동시 요청 수를 묶는다.
  ///    한 건이 Upstage 에이전트를 8~10초 물고 있어서, 8건을 동시에 쏘면
  ///    레이트리밋과 타임아웃이 겹친다.
  final int maxConcurrent;

  /// 🔴 배너가 무한히 쌓이지 않게 한다
  static const maxFailures = 6;

  final Map<String, DocUploadResult> _results = {};
  final List<PendingUpload> _pending = [];
  final List<UploadFailure> _failures = [];
  bool _disposed = false;
  bool _saving = false;
  SavedCard? _saved;
  List<String> _missing = const [];

  Map<String, DocUploadResult> get results => Map.unmodifiable(_results);
  List<PendingUpload> get pending => List.unmodifiable(_pending);
  List<UploadFailure> get failures => List.unmodifiable(_failures);
  bool get isBusy => _pending.isNotEmpty;
  bool get isSaving => _saving;

  /// 저장 성공 결과. null이면 아직 저장 전
  SavedCard? get saved => _saved;

  /// 🔴 서버가 「무엇이 빠졌다」고 알려 준 목록. 프론트가 판정하지 않는다
  List<String> get missing => List.unmodifiable(_missing);

  /// 화면이 미리 아는 만큼의 부족 항목 — 버튼을 눌러보기 전에도 안내할 수 있게.
  /// 🔴 그래도 **정본은 서버**다. 여기서 막지 않고, 눌렀을 때 서버 판정을 따른다.
  List<String> get locallyMissing =>
      [for (final f in cardFields) if (f.status == FieldStatus.missing) f.label];

  bool get looksComplete => locallyMissing.isEmpty;

  @override
  void dispose() {
    _disposed = true;
    super.dispose();
  }

  void _notify() {
    // 🔴 업로드가 도는 중에 화면이 사라질 수 있다 (리사이즈로 위젯 교체 등)
    if (!_disposed) notifyListeners();
  }

  /// 업로드 전에 걸러진 파일 — 서버에 가기도 전에 막힌 이유를 그대로 보여 준다
  void reportRejected(String filename, String message) {
    _addFailure(UploadFailure(filename: filename, code: 'E_REJECTED_LOCALLY', message: message));
    _notify();
  }

  void _addFailure(UploadFailure f) {
    // 같은 파일·같은 코드는 한 번만
    _failures.removeWhere((x) => x.filename == f.filename && x.code == f.code);
    _failures.add(f);
    while (_failures.length > maxFailures) {
      _failures.removeAt(0);
    }
  }

  void dismissFailure(UploadFailure f) {
    _failures.remove(f);
    _notify();
  }

  void clearFailures() {
    _failures.clear();
    _notify();
  }

  Future<void> uploadAll(List<PickedDoc> docs) async {
    for (var i = 0; i < docs.length; i += maxConcurrent) {
      final chunk = docs.skip(i).take(maxConcurrent);
      await Future.wait(chunk.map(_uploadOne));
    }
  }

  Future<void> _uploadOne(PickedDoc doc) async {
    final p = PendingUpload(doc.filename, doc.size);
    _pending.add(p);
    _notify();
    try {
      final r = await _api.upload(doc);
      final key = r.docType.key;
      if (key == null) {
        // 🔴 판정이 서지 않았으면 억지로 칸에 넣지 않는다
        _addFailure(UploadFailure(
          filename: doc.filename,
          code: 'E_DOC_TYPE_UNKNOWN',
          message: _unknownTypeMessage(r.docType),
        ));
      } else {
        final prev = _results[key];
        if (prev != null && prev.filename != doc.filename) {
          // 🔴 조용히 덮어쓰지 않는다 — 앞의 문서가 사라진 사실을 알린다
          _addFailure(UploadFailure(
            filename: prev.filename,
            code: 'E_REPLACED',
            message: '「${r.docType.label ?? key}」 자리를 ${doc.filename}(으)로 바꿨습니다.',
          ));
        }
        _results[key] = r;
      }
    } on ApiException catch (e) {
      _addFailure(UploadFailure(filename: doc.filename, code: e.code, message: e.message));
    } catch (e) {
      _addFailure(UploadFailure(
        filename: doc.filename,
        code: 'E_NETWORK',
        message: '서버에 연결하지 못했습니다. 백엔드 주소와 실행 여부를 확인해 주세요.',
      ));
    } finally {
      _pending.remove(p);
      _notify();
    }
  }

  /// 🔴 서버가 후보를 줬으면 그걸 그대로 보여 준다 — 우리가 문장을 짓지 않는다
  static String _unknownTypeMessage(DocTypeVerdict v) {
    if (v.candidates.isEmpty) return '문서 종류를 판정하지 못했습니다.';
    final names = v.candidates.take(2).map((c) => c.label).where((s) => s.isNotEmpty).join(' · ');
    return names.isEmpty
        ? '문서 종류를 판정하지 못했습니다.'
        : '문서 종류를 판정하지 못했습니다. 비슷한 후보: $names';
  }

  /// 「회사 카드 만들기」.
  /// 🔴 완성 여부는 **서버가 정한다** — 프론트가 요건표를 따로 들고 있으면 두 벌로 갈라진다.
  ///    부족하면 서버가 422 + 빠진 항목 목록을 주고, 그 문장을 그대로 띄운다.
  Future<bool> createCard() async {
    if (_saving || isBusy) return false;
    _saving = true;
    _missing = const [];
    _notify();
    try {
      final fields = {for (final f in cardFields) f.label: f.value};
      final docs = [
        for (final e in _results.entries)
          SaveCardDocument(
            docTypeKey: e.key,
            filename: e.value.filename,
            uploadId: e.value.uploadId,
            confidence: e.value.extraction.confidence,
            bytes: e.value.bytes,
            data: e.value.extraction.data,
          ),
      ];
      _saved = await _api.saveCard(SaveCardRequest(
        companyId: _saved?.companyId,
        name: _valueOf('상호'),
        bizNo: _bizNo(),
        fields: fields,
        documents: docs,
      ));
      _failures.removeWhere((f) => f.code == 'E_CARD_INCOMPLETE');
      return true;
    } on ApiException catch (e) {
      _missing = e.missing;
      _addFailure(UploadFailure(filename: '회사 카드', code: e.code, message: e.message));
      return false;
    } catch (_) {
      _addFailure(const UploadFailure(
        filename: '회사 카드',
        code: 'E_NETWORK',
        message: '서버에 연결하지 못했습니다. 백엔드 주소와 실행 여부를 확인해 주세요.',
      ));
      return false;
    } finally {
      _saving = false;
      _notify();
    }
  }

  String? _valueOf(String label) {
    for (final f in cardFields) {
      if (f.label == label && f.status != FieldStatus.missing && f.status != FieldStatus.reading) {
        return f.value;
      }
    }
    return null;
  }

  /// 사업자등록번호는 사업자등록증에서만 가져온다
  String? _bizNo() => _results['biz_reg']?.extraction.pick(['등록번호']);

  // ── 화면이 읽는 것 ─────────────────────────────────────

  /// 「필요한 서류」 목록 = 진행 중 + 정의된 칸 + 칸에 없는 갈래
  List<CompanyDocument> get documents => [
        for (final p in _pending)
          CompanyDocument(
            title: _stripExt(p.filename),
            subtitle: '문서 종류를 판정하는 중입니다',
            status: DocStatus.reading,
          ),
        for (final slot in kDocSlots) ..._slotRows(slot),
        for (final e in _results.entries)
          if (!kSlottedKeys.contains(e.key))
            CompanyDocument(
              title: e.value.docType.label ?? e.key,
              subtitle: e.value.filename,
              status: DocStatus.done,
              typeKey: 'co_${e.key}',
            ),
      ];

  /// 🔴 한 칸이 여러 갈래를 받으면(중소기업확인서 + 지정서) **둘 다 보여 준다.**
  ///    첫 매치만 그리면 나중에 올린 문서가 목록에서 «사라진» 것처럼 보인다.
  List<CompanyDocument> _slotRows(DocSlot slot) {
    final present = slot.accepts.where(_results.containsKey).toList();
    if (present.isEmpty) {
      return [CompanyDocument(title: slot.title, subtitle: '업로드 되지 않음', status: DocStatus.missing)];
    }
    return [
      for (final k in present)
        CompanyDocument(
          // 둘 이상이면 각자의 이름으로 구분해 보여 준다
          title: present.length == 1 ? slot.title : (_results[k]!.docType.label ?? slot.title),
          subtitle: _results[k]!.filename,
          status: DocStatus.done,
          typeKey: 'co_$k',
        ),
    ];
  }

  /// 회사 카드 미리보기
  List<CompanyCardField> get cardFields => [
        for (final spec in kCardFields) _cardRow(spec),
      ];

  CompanyCardField _cardRow(CardFieldSpec spec) {
    final parts = <String>[];
    final sources = <String>[];
    DocUploadResult? first;

    for (final key in spec.sources) {
      final r = _results[key];
      if (r == null) continue;
      final value = spec.read(r.extraction);
      if (value == null || value.isEmpty) continue;

      first ??= r;
      for (final piece in value.split('・')) {
        if (piece.isNotEmpty && !parts.contains(piece)) parts.add(piece);
      }
      sources.add(r.filename);
      if (!spec.combine) break;
    }

    if (first != null) {
      final conf = first.extraction.confidence;
      return CompanyCardField(
        label: spec.label,
        value: parts.join('・'),
        source: sources.length == 1 ? sources.first : '${sources.first} 외 ${sources.length - 1}건',
        // 🔴 high일 때만 확정이다. unknown을 초록 체크로 그리면
        //    «확인되지 않은 값»을 확인됐다고 말하는 것이 된다.
        status: conf == 'high' ? FieldStatus.confirmed : FieldStatus.unverified,
        page: _firstPage(first.extraction),
      );
    }

    // 이 줄을 채울 문서가 지금 올라오는 중인가
    if (_pending.isNotEmpty) {
      return CompanyCardField(
        label: spec.label,
        value: '읽는 중 ...',
        source: _pending.first.filename,
        status: FieldStatus.reading,
      );
    }
    return CompanyCardField(
      label: spec.label,
      value: '서류 없음',
      source: '자료가 확인되지 않습니다',
      status: FieldStatus.missing,
    );
  }

  static int _firstPage(Extraction e) {
    for (final f in e.fields.values) {
      if (f.page > 0) return f.page;
    }
    return 0;
  }

  static String _stripExt(String name) {
    final i = name.lastIndexOf('.');
    return i > 0 ? name.substring(0, i) : name;
  }
}
