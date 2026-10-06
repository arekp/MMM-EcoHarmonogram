# Changelog

Format zgodny z [Keep a Changelog](https://keepachangelog.com/pl/1.1.0/), wersjonowanie [SemVer](https://semver.org/lang/pl/).

## [1.2.1] - 2026-10-06

### Poprawione
- Alert nie przepada już po starcie lustra: moduł wysyła `SHOW_ALERT` dopiero po `DOM_OBJECTS_CREATED`. Wcześniej alert wysłany zaraz po pobraniu danych mógł zniknąć bez śladu, a kolejna próba była dopiero po `alertRepeatInterval` (1 h).
- `alertFromHour` domyślnie wynosi `12` zamiast `16`, więc alert o jutrzejszym wywozie pojawia się już od południa.

## [1.2.0] - 2026-10-04

### Dodane
- `showAlert` (domyślnie `true`): dzień przed wywozem moduł pokazuje alert „Jutro wywóz śmieci” z rodzajami odpadów, przez wbudowany moduł MagicMirror `alert`.
- Opcje alertu: `alertType`, `alertFromHour`, `alertRepeatInterval`, `alertTimer`.
- `showList` (domyślnie `true`): włącza lub wyłącza listę wywozów na lustrze.

## [1.1.0] - 2026-10-04

### Zmienione
- `maxDays` domyślnie wynosi `1`: moduł pokazuje tylko najbliższy dzień z wywozem. Aby wrócić do poprzedniego widoku, ustaw `maxDays: 5`.
- Nieprawidłowa wartość `maxDays` (np. `0` lub tekst) jest traktowana jak `1`.
- README: opis `maxDays` w tabeli opcji i przykładzie konfiguracji, podglądy dla 1 i 5 dni.

## [1.0.0] - 2026-10-04

### Dodane
- Pierwsze wydanie modułu MMM-EcoHarmonogram.
- Pobieranie harmonogramu z API ecoharmonogram.pl dla dowolnego adresu (miejscowość, gmina, ulica, numer).
- Obsługa wariantów harmonogramu (`sides`), rejonów (`region`), grup (`groups.g1`…`g5`), `community` i `app`.
- Automatyczne łączenie okresów harmonogramu (np. przełom roku).
- Widok z grupowaniem po dniach, „Dziś”/„Jutro”, ikonami Font Awesome i kolorami z EcoHarmonogramu.
- Tłumaczenia: polski, angielski, ukraiński.
- Skrypt `npm run find` do sprawdzania adresu i generowania konfiguracji.
- Testy (node:test) i ESLint uruchamiane w GitHub Actions.
