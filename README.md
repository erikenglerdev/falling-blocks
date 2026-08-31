# Falling Blocks

Eine installierbare, vollständig clientseitige PWA im Stil eines modernen
Blockspiels. Es gibt kein Backend und keine Datenbank. Spielstände und die
lokale Bestenliste bleiben im Browser (`localStorage`).

Der Regelkern orientiert sich an öffentlich dokumentierten Standards moderner
Falling-Block-Spiele: 10 × 20 sichtbare Felder plus zwei verdeckte Spawn-Reihen,
7-Bag, Hold, Ghost Piece, SRS-Wall-Kicks, Lock Delay, DAS/ARR, T-Spins,
Back-to-Back, Combos und Perfect Clears. Dies ist keine Aussage über eine
offizielle Lizenz oder Zertifizierung.

Die Anwendung öffnet direkt die Spielauswahl. Es ist weder eine Anmeldung noch
ein Zugangscode erforderlich.

## Lokal starten

Voraussetzung: Node.js 22.13 oder neuer.

```bash
npm ci
npm run dev
```

Danach `http://localhost:3000` öffnen.

## Prüfungen

```bash
npm run check
```

## Docker

```bash
docker compose up --build -d
```

Die Anwendung ist anschließend unter `http://localhost:8080` erreichbar. Der
Container liefert nur die PWA-Dateien aus; die komplette Spiellogik und alle
Spielstände bleiben auf dem jeweiligen Gerät.

## Steuerung

- `←` oder `1`: nach links bewegen
- `→` oder `3`: nach rechts bewegen
- `↓` oder `2`: schneller fallen
- `↑`, `5` oder `X`: im Uhrzeigersinn drehen
- `Y`: gegen den Uhrzeigersinn drehen
- `C`: um 180 Grad drehen
- `Leertaste`: sofort ablegen
- `V`: Stein halten
- `P` oder `Esc`: pausieren

Auf kleinen Bildschirmen werden zusätzlich Touch-Steuerelemente eingeblendet.
Die Zahlensteuerung funktioniert sowohl über die Zahlenreihe als auch über den
Ziffernblock.
Light und Dark Mode folgen beim ersten Aufruf der Systemeinstellung und können
anschließend manuell umgeschaltet werden; die Auswahl bleibt lokal gespeichert.

## Fallgeschwindigkeit

Vor jeder neuen Runde kann zwischen Level 0 und Level 9 gewählt werden. Bei
Start auf Level 0 beginnt Level 1 nach insgesamt 10 entfernten Linien. Bei Start
auf Level 9 bleibt das Tempo bis zur 100. entfernten Linie bestehen; dann beginnt
Level 10.

Die Fallgeschwindigkeit wird direkt als Zeit pro Reihe in Millisekunden
festgelegt. Level 0 startet bei 800 ms. Von Level 1 bis Level 9 wird sie mit
jedem Level erhöht: von 717 ms über 633, 550, 467, 383, 300, 217 und 133 ms bis
auf 100 ms. Level 19 liegt bei 33 ms, ab Level 29 sind es 16 ms pro Reihe.
Zwischen Level 9 und 19 gelten feste Zwischenstufen.

## Spiel später fortsetzen

Eine laufende oder normal pausierte Runde wird regelmäßig und beim Schließen
der Seite automatisch in `localStorage` gesichert. Über „Für später“ kann sie
außerdem bewusst angehalten werden. Beim nächsten Aufruf erscheint direkt eine
Fortsetzen-Option mit Level, Linien, Punkten und Speicherzeit. Die Sicherung
bleibt vollständig auf dem jeweiligen Gerät.

Die Hinweise zu eingebundenen Schriften und Icons stehen in
[`public/THIRD_PARTY_NOTICES.txt`](public/THIRD_PARTY_NOTICES.txt).
