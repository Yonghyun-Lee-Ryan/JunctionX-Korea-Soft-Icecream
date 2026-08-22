import 'dart:typed_data';
import 'card_view.dart';
import 'factsheet.dart';
import 'screening.dart';
import 'models.dart';

/// 업로드할 파일 한 건.
/// 🔴 웹의 XFile.path는 파일 경로가 아니라 **blob URL**이다(없는 게 아니다).
///    파일명 파싱이나 전송에 쓰면 안 되고, 항상 name + bytes를 쓴다.
class PickedDoc {
  const PickedDoc({required this.filename, required this.bytes});
  final String filename;
  final Uint8List bytes;
  int get size => bytes.lengthInBytes;
}

/// 🔴 인터페이스로 두는 이유 — 테스트가 http 없이 컨트롤러를 돌린다.
abstract interface class DocsApi {
  Future<DocUploadResult> upload(PickedDoc doc);
  Future<List<DocTypeInfo>> types();

  /// 회사 카드 저장. 🔴 요건 검사는 **서버가 정본**이다
  Future<SavedCard> saveCard(SaveCardRequest req);

  /// 🔴 첫 진입 분기 — 저장된 회사가 있나. 프론트가 스스로 판단하지 않는다
  Future<CurrentCompany> currentCompany();

  /// 저장된 회사 카드 상세
  Future<CompanyCardView> cardView(String companyId);

  /// 추천 공고 목록 (S2~S4). 🔴 나라장터 키가 없으면 캐시 목록이 온다
  Future<ScreeningResult> screening(String companyId, {bool live = false});

  /// 🚪 사람 게이트 — 응찰 여부
  Future<void> setDecision(String companyId, String caseId, String decision);

  /// 응찰 준비 — 공고번호로 케이스를 만들고 첨부 수집을 시작한다 (S1)
  Future<Factsheet> createCase({required String bidPbancNo, String bidPbancOrd, String? companyId});

  /// 응찰 준비 Bid Kit (화면④)
  Future<Factsheet> factsheet(String caseId);

  /// 🔴 케이스에 제출 서류를 올린다 — 서버가 제출 검사를 다시 돌려 갱신된 봉투를 준다.
  ///    [requirement]는 파일제출 탭의 서류 이름(어느 서류용인지). 드롭존에서 올리면 null.
  Future<Factsheet> uploadCaseFile(String caseId, PickedDoc doc, {String? requirement});

  /// 🔴 제안서 원고(PDF)를 올린다 — 서버가 금지 표현 스캔·검사를 다시 돌려 갱신된 봉투를 준다
  Future<Factsheet> uploadProposal(String caseId, PickedDoc doc);

  /// 🔴 체크리스트의 체크를 서버에 저장한다 — 화면 로컬 상태는 탭을 나가면 사라졌다(실측).
  ///    [key]는 행의 첫 칸(요구사항 ID). 돌아오는 값은 그 탭에서 지금 체크된 키 전부.
  Future<List<String>> setCheck(String caseId, String tabId, String key, {required bool checked});

  /// 🚪 「응찰 준비」를 찍은 공고를 저장한다
  Future<void> saveBid(String companyId, ShortlistItem item);

  /// 응찰 준비중인 공고 목록
  Future<List<ShortlistItem>> bids(String companyId);

  /// 응찰 대상에서 뺀다
  Future<void> dropBid(String companyId, String caseId);
}

class SaveCardRequest {
  const SaveCardRequest({this.companyId, this.name, this.bizNo, required this.fields, required this.documents});
  final String? companyId;
  final String? name;
  final String? bizNo;
  final Map<String, String> fields;
  final List<SaveCardDocument> documents;

  Map<String, dynamic> toJson() => {
        if (companyId != null) 'companyId': companyId,
        if (name != null) 'name': name,
        if (bizNo != null) 'bizNo': bizNo,
        'fields': fields,
        'documents': documents.map((d) => d.toJson()).toList(),
      };
}

class SaveCardDocument {
  const SaveCardDocument({
    required this.docTypeKey,
    required this.filename,
    this.uploadId,
    this.confidence,
    this.bytes,
    this.data,
  });
  final String docTypeKey;
  final String filename;
  final String? uploadId;
  final String? confidence;
  final int? bytes;
  final Map<String, dynamic>? data;

  Map<String, dynamic> toJson() => {
        'docTypeKey': docTypeKey,
        'filename': filename,
        if (uploadId != null) 'uploadId': uploadId,
        if (confidence != null) 'confidence': confidence,
        if (bytes != null) 'bytes': bytes,
        if (data != null) 'data': data,
      };
}

class SavedCard {
  const SavedCard({required this.companyId, required this.savedAt});
  final String companyId;
  final String savedAt;

  factory SavedCard.fromJson(Map<String, dynamic> j) => SavedCard(
        companyId: j['companyId'] as String? ?? '',
        savedAt: j['savedAt'] as String? ?? '',
      );
}

class DocTypeInfo {
  const DocTypeInfo({required this.key, required this.label, required this.agentConfigured});
  final String key;
  final String label;
  final bool agentConfigured;

  factory DocTypeInfo.fromJson(Map<String, dynamic> j) => DocTypeInfo(
        key: j['key'] as String? ?? '',
        label: j['label'] as String? ?? '',
        agentConfigured: j['agentConfigured'] as bool? ?? false,
      );
}
