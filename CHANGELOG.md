# Changelog

Format zgodny z [Keep a Changelog](https://keepachangelog.com/pl/1.1.0/), wersjonowanie [SemVer](https://semver.org/lang/pl/).

## [1.1.0] - 2026-10-04

### Zmienione
- `maxDays` domyślnie wynosi `1`: moduł pokazuje tylko najbliższy dzień z wywozem. Aby wrócić do poprzedniego widoku, ustaw `maxDays: 5`.
- Nieprawidłowa wartość `maxDays` (np. `0` lub tekst) jest traktowana jak `1`.

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
