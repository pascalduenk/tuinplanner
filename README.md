# Tuinplanner

Een kleine app voor het onderhoud van de tuin. Het startscherm laat zien wat er **rond de huidige tijd** moet of kan gebeuren. Per plant zie je een foto, informatie, de verzorging en een jaarkalender. De app werkt op je telefoon (ook offline) en op de laptop.

## Op de laptop testen

Open een terminal in deze map en start een lokale webserver:

```bash
python -m http.server 8080
```

Ga daarna in de browser naar <http://localhost:8080>. Dubbelklikken op `index.html` werkt niet, omdat de browser de gegevens dan niet mag laden.

- **Ander moment van het jaar bekijken:** ga naar *Meer → Andere datum bekijken*, of zet `?datum=2027-03-15` achter het adres.
- **Telefoonformaat bekijken:** gebruik in Chrome de ontwikkelaarstools (F12, daarna Ctrl+Shift+M).

## Op GitHub Pages zetten (eenmalig)

1. Maak op github.com een **lege, publieke** repository aan met de naam `tuinplanner`, zonder README.
2. Koppel de repo en push:
   ```bash
   git remote add origin https://github.com/<gebruikersnaam>/tuinplanner.git
   ```
   ```bash
   git push -u origin main
   ```
   Bij de eerste push opent er een browservenster waarin je inlogt bij GitHub.
3. Ga op GitHub naar **Settings → Pages**. Kies bij *Branch* `main` en map `/ (root)` en klik op *Save*.
4. Na ongeveer een minuut staat de app op `https://<gebruikersnaam>.github.io/tuinplanner/`.

Let op: de repo is publiek, dus iedereen die de link kent, kan de plantfoto's zien. De originele foto's in `fotos/` worden niet geüpload.

## Gedeelde online opslag (Firebase)

Afgevinkte taken, notities, eigen planten en foto's worden bewaard in **Firestore**, zodat iedereen die toegang heeft hetzelfde ziet. Inloggen gaat met een Google-account. Zonder internet werkt de app gewoon door; wijzigingen worden later gesynchroniseerd.

- Configuratie: `js/firebase-config.js`. Staat daar `null`, dan bewaart de app alles alleen op het apparaat zelf.
- Wie toegang heeft: `firestore.rules`. Na een wijziging plak je de regels in de Firebase-console (Firestore Database → Regels → Publiceren).
- Inloggen werkt alleen vanaf domeinen die in de Firebase-console zijn toegestaan: Authentication → Instellingen → Geautoriseerde domeinen. Hier staan `localhost` en `pascalduenk.github.io`.
- Foto's worden verkleind (max. 1000 px, ca. 250 KB) en in Firestore opgeslagen. Daarvoor is het gratis Spark-abonnement genoeg.

## Op de telefoon installeren

Open de GitHub Pages-link in Chrome op je telefoon. Tik op het menu (⋮) en kies **App installeren** of **Toevoegen aan startscherm**. Daarna start de app vanaf je startscherm en werkt hij ook zonder internet.

Met *Meer → Exporteren/Importeren* maak je een back-up van alle gegevens, of zet je er een terug.

## Iets aanpassen

| Wat | Waar |
|---|---|
| Plantinformatie en taken | `data/planten.json` |
| Foto's opnieuw verkleinen (na nieuwe originelen in `fotos/`) | `python tools/fotos_verkleinen.py` |
| Gegevens controleren | `node tools/controleer_data.mjs` |
| App-iconen | `python tools/iconen_maken.py` |

Elke taak heeft een periode van maand `van` tot en met maand `tot`. Die periode mag over de jaarwisseling lopen, bijvoorbeeld van 11 tot 2.
- `prioriteit` is `moet`, `kan` of `niet` ("liever niet doen").
- `herhaal` is optioneel: `wekelijks` of `maandelijks`.
- `groep` voegt gelijke taken van meerdere planten samen tot één kaart, bijvoorbeeld "Water geven bij droogte".

**Na een wijziging:** verhoog `VERSIE` in `sw.js` (bijvoorbeeld naar `tuinplanner-v2`), commit en push. Daarna halen geïnstalleerde telefoons de nieuwe versie op.

## Bronnen

De planten zijn op 24-10-2026 herkend aan de hand van foto's. Twijfelgevallen staan in de app gemarkeerd. De verzorgingsinformatie komt onder meer van RHS, MAX Vandaag, tuinadvies.be, Hessenhof, Intratuin, Van den Berk, Ecostyle en Vogelbescherming Nederland. De links staan per plant in de app.
