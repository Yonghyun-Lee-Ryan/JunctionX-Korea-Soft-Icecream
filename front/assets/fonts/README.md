# Pretendard

디자인 원본(Figma `정션2026`)이 **Pretendard**를 쓴다. 폰트 파일은 라이선스상 재배포는 가능하지만
레포에 넣을지는 팀이 정할 일이라 **비워 두었다.**

지금 상태에서도 앱은 돈다 — `fontFamily: 'Pretendard'`가 없으면 Flutter가 시스템 한글 폰트로
떨어지고, 크기·자간·굵기는 `lib/theme/tokens.dart`가 그대로 잡고 있어 레이아웃은 어긋나지 않는다.

## 넣으려면

1. https://github.com/orioncactus/pretendard 릴리스에서 OTF를 받는다 (OFL 1.1)
2. 이 폴더에 `Pretendard-Medium.otf` · `Pretendard-SemiBold.otf` · `Pretendard-Bold.otf`를 둔다
3. `pubspec.yaml`의 `fonts:` 블록 주석을 푼다
4. `flutter pub get`

🔴 `Inter`는 로고 글자(`Solar for Bid`)에만 쓴다 — 없으면 시스템 산세리프로 떨어진다.
