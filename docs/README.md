# KalasääApp – tekninen dokumentaatio

Tämä kansio sisältää KalasääAppin arkkitehtuuri- ja logiikkadokumentaation.

## 📌 Sisältö

### 🧩 master.mmd
Sovelluksen koko arkkitehtuuri:
- käyttöliittymä
- säädata
- OH-laskenta
- saalisilmoitus
- tallennus
- historia ja tilastot

### 🗺 oh-map.mmd
Ottihalukkuuden (OH) laskennan kulku:
- mistä data tulee
- missä ennuste lasketaan
- miten toteutunut OH muodostuu
- miten ennuste ja toteuma yhdistetään

## 🧪 Testaus

Testaus on toteutettu Vitestillä:

- yksikkötestit: `fishingOH.js`
- hook-testit: `useRealizedOHActive`
- integraatiotestit: `VirtavesiIlmoitus`

Testit eivät ole kieliriippuvaisia, vaan testaavat käyttäytymistä.

## 🎯 Tavoite

Dokumentaation tavoitteena on:
- tehdä OH-logiikka ymmärrettäväksi
- varmistaa laajennettavuus
- mahdollistaa jatkokehitys (AI, analytiikka, kaupallistaminen)
## 🧪 Testausstrategia

- **Yksikkötestit**
  - fishingOH.js
  - paine-, tuuli- ja kuufunktiot

- **Hook-testit**
  - useRealizedOHActive
  - varmistaa toteutuneen OH:n ja kertoimen laskennan

- **Integraatiotestit**
  - VirtavesiIlmoitus
  - testaa käyttäjän syötteiden vaikutuksen toteutuneeseen OH:hon

Testit eivät oleta kieliä tai UI-tekstejä, vaan testaavat toiminnallisuutta.

