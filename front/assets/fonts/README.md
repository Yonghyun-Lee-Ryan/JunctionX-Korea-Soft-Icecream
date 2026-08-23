# Pretendard

The design source (Figma `정션2026`) uses Pretendard. The license permits redistribution, but
whether to commit the font files is the team's call, so this folder is left empty.

The app runs fine as is. Without `fontFamily: 'Pretendard'` resolving, Flutter falls back to the
system Korean font, and since `lib/theme/tokens.dart` still fixes size, letter spacing, and weight,
the layout does not shift.

## To add them

1. Download the OTFs from the https://github.com/orioncactus/pretendard releases (OFL 1.1)
2. Put `Pretendard-Medium.otf`, `Pretendard-SemiBold.otf`, and `Pretendard-Bold.otf` in this folder
3. Uncomment the `fonts:` block in `pubspec.yaml`
4. Run `flutter pub get`

`Inter` is used only for the logo text (`Solar for Bid`). Without it, that falls back to the system
sans-serif.
