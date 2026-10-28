# CyberAgent Marketplace – prototip

Avtonomna tržnica AI-agentov za personalizirane kibernetske simulacije z mikroplačili prek protokola x402.
Prototip prikazuje proces iz Naloge 3 (razdelek »Predvideni prototip«): uporabnik izvede simulacijo, glavni AI-agent prepozna potrebo po dodatnem usposabljanju, na tržnici izbere specializiranega agenta, naroči in plača njegovo storitev prek x402, uporabnik pa prejme novo personalizirano simulacijo s povratnimi informacijami. Prikazan je tudi pregled opravljenih mikroplačil.

## Iteracija na podlagi nalog 5 in 6

Prototip zdaj uresničuje prioritete I1–I6 iz `gradivo/Naloga 5 in 6 - Gujt, Lah.docx`. Odzivi T1–T5 so v gradivu označeni kot scenarijske prilagoditve profilov, ne novi dobesedni intervjuji. Izboljšave zato predstavljajo izvedbo predlagane zasnove, ne dokaz njenega učinka na uporabnike.

| Ugotovitev | Izvedba |
|---|---|
| I1: ločeni vlogi | Predstavitvena prijava, različni navigaciji, strežniške seje in preverjanje dostopa na API-ju. Zaposleni ne more brati imenika ali plačil; skrbnik ne more odpirati osebnih nabiralnikov in učnih zgodovin. |
| I2: uvoz, skupine, zahtevnost | CSV/XLSX, ročna preslikava stolpcev, predogled napak in podvojitev, posodabljanje obstoječih e-naslovov; shranjene skupine z izbiro članov, kanalov, zahtevnosti in pogostosti. |
| I3: nadzorovana kampanja | Po pripravi načrta je potrebna izrecna odobritev prejemnikov, stroška in obsega podatkov. Pred odobritvijo in izvajanjem se preverijo trenutni pogoji. |
| I4: razumljivi stroški | Plačnik je organizacija. Načrt pokaže generiranje in etične preglede, skupno oceno, razpoložljiva sredstva in mesečni limit. Prikazani so tudi stroški uspešnih nakupov, če nadaljnji korak odpove. |
| I5: preprost učni tok | Vaja → kratka razlaga → naslednja vaja ali osebni napredek; zasebna utemeljitev odgovora, preverjanje cilja povezave na telefonu in večji gumbi. Brez plačilnih in skrbniških menijev. |
| I6: rezultati skupin | Dejanski kazalniki kampanj in izvoz CSV. Prijave, kliki in mediani čas so skriti pri manj kot petih prejemnikih ali petih različnih sodelujočih. Ilustrativna analitika je ločeno in jasno označena. |

## Zagon

Potreben je Node.js 18 ali novejši.

```bash
npm install
npm start
```

Odpri <http://localhost:4020>. Izberi **Učni portal** ali **IT-konzolo**. Vzorčni zaposleni je `luka.horvat@podjetje.si`; po uvozu se lahko v učni portal prijaviš z e-naslovom katerega koli uvoženega uporabnika.

**Predstavitvena prijava je brez gesla.** Seje ločujejo pravice in vsebino API-ja, vendar izbira vloge in vpis e-naslova nista preverjanje identitete. Pred produkcijsko uporabo je potrebna prava prijava (npr. SSO) in dodeljevanje vlog na strežniku. Za preizkušanje uporabljaj izmišljene podatke.

Imenik in vključitev v program se shranita v `.uporabniki.json`, skupine pa v `.skupine.json`. Učni odgovori, načrti, seje, nastavitve pravil in simulirana plačila so v pomnilniku ter se ob ponovnem zagonu ponastavijo. Osebni odgovori in obravnavana sporočila se med delovanjem odstranijo po nastavljenem roku hrambe (privzeto 90 dni); osebni seštevki se ponovno izračunajo. Imenik in skupine se hranijo do ročnega izbrisa datotek. Ti datoteki nista vključeni v Git.

### Način Base Sepolia (prava plačila na testnem omrežju)

```bash
npm install            # enkrat (viem za podpise EIP-712 in branje stanja)
npm run start:sepolia
```

- Ob prvem zagonu se ustvarijo ključi glavnega agenta in naslovi agentov na tržnici. Shranijo se v `.wallet.json` (ne deli te datoteke). Namesto tega lahko nastaviš svoj ključ z `PAYER_PRIVATE_KEY=0x…`.
- Strežnik izpiše naslov denarnice. Na <https://faucet.circle.com> izberi **Base Sepolia** in nanj pošlji testne USDC. ETH ni potreben, ker plin plača facilitator.
- Glavni agent podpiše pravo avtorizacijo EIP-3009 (EIP-712). Javni facilitator `https://x402.org/facilitator` jo preveri in prenos USDC izvede na verigi. Stanje se bere z verige, transakcije pa so na strani *Plačila x402* povezane na BaseScan.
- **Lastnikova denarnica (MetaMask):** na strani *Plačila x402* klikni »Poveži MetaMask«. Aplikacija preklopi na Base Sepolia, nato pa s podpisom sporočila dokažeš, da je naslov tvoj. Nato lahko:
  - **napolniš agenta:** v MetaMasku podpišeš avtorizacijo EIP-3009, prenos pa izvede facilitator, zato ETH za plin ni potreben;
  - **vrneš neporabljeno:** agent celotno stanje prenese nazaj na povezani naslov.

  Agent ključa lastnika nikoli ne vidi. Porabi lahko le, kar mu nakažeš, in to v okviru pravil porabe.
- En cikel (generiranje + etični pregled) stane okoli 0,1–0,2 testnega USDC, faucet pa da 10 USDC.
- Neobvezno: `FACILITATOR_URL`, `BASE_SEPOLIA_RPC`.

## Demo scenarij po testnih nalogah N1–N8

1. **IT-konzola → Zaposleni in uvoz:** vstavi primer ali naloži CSV/XLSX (prvi delovni list). Klikni »Preveri podatke«, preveri preslikavo in napake, nato potrdi uvoz. Podvojene vrstice v datoteki se preskočijo; obstoječi e-naslov posodobi podatke imenika. Predogled in potrditev uporabljata enako strežniško validacijo.
2. **Skupine:** ustvari npr. »Računovodstvo« (zahtevnost 3, e-pošta) in »Novi zaposleni« (zahtevnost 1, SMS). Izberi člane in pogostost. Skupine je mogoče pozneje urediti.
3. **Kampanje:** izberi ciljno skupino ali ročno označi zaposlene. Pri skupini veljajo njeni člani in nastavitve; globalna pravila imajo prednost. Priprava načrta še ničesar ne plača in ne pošlje. Zaposleni z odprto vajo, izključeni ali nad dovoljeno pogostostjo so izpuščeni.
4. Preglej ponudnike in cene generiranja ter etičnih pregledov. Potrdi vse tri postavke kontrolnega seznama in klikni **»Odobri kampanjo in plačaj«**. Neodobrenega načrta ni mogoče izvesti tudi prek API-ja. Dnevnik pokaže tok `POST → 402 → pravila → podpis → POST + X-PAYMENT → 200`.
5. Dostava je načrtovana ob naključnem času v delovniku. Za predstavitev klikni **»Dostavi vse simulacije zdaj«**. Dostava poteka v lokalni učni portal, ne v pravo e-pošto ali SMS. Stanje načrtov ostane dostopno v zgodovini kampanj tudi po osvežitvi strani.
6. **Zamenjaj prijavo → Učni portal:** vpiši e-naslov zaposlenega, odpri vajo, po želji utemelji odločitev in se odzovi. Na telefonu lahko pravi cilj povezave preveriš brez klika nanjo. Preberi razlago in izberi **»Naslednja vaja«** ali **»Moj napredek«**.
7. Naslednja prostovoljna vaja je lokalna predloga brez plačila ali nove kampanje. Če že obstaja odprta vaja, se odpre ta. Upoštevata se vključitev v program in mesečna omejitev.
8. **IT-konzola → Pregled in poročila:** preveri kampanjo in izvozi CSV. Kazalniki ostanejo skriti do odziva najmanj petih različnih prejemnikov. Spodnja vzorčna analitika je zgolj ilustracija in ni pomešana z dejanskimi rezultati.

Za preizkus omejitev v **Pravila in zasebnost** znižaj mesečni proračun pod oceno pripravljene kampanje ali odstrani izbranega ponudnika z odobrenega seznama. Odobritev oziroma izvedba se zavrne. Po spremembi pogojev pripravi nov načrt. Obvezne odobritve, preverjenih ponudnikov, odobrenega seznama in minimizacije podatkov ni mogoče izklopiti.

## Preverjanje

```bash
npm test
# Neobvezno: Node.js 22+ in nameščen Chrome; drugje nastavi CHROME_BIN.
node test/browser-check.mjs
```

API-testi zaženejo izoliran strežnik na vratih 14020 z začasnim imenikom in skupinami. Preverjajo CSV/XLSX, podvojitve, ločitev vlog, pravice do sporočil, nastavitve skupin, odobritve, proračun, odobrene ponudnike, simulirano poravnavo, preprečevanje ponovnih plačil, povratne informacije in prag skupinskega poročanja. Brskalniški preizkus uporablja vrata 14021 ter namizni in mobilni prikaz. Posnetke shrani v izpisano začasno mapo. Preverjanje ne izvaja transakcij na Base Sepolia.

## Arhitektura

```text
public/
  app.js               vstopna točka: povezava prikazov in dogodkov
  css/                 vizualni sistem: osnove, ogrodje, komponente, prijava, učenje, skrbništvo, odzivnost
  js/core/             API, skupno stanje, navigacija, meni, modal in obvestila
  js/features/
    session.js         predstavitvena prijava in odjava
    inbox.js           učni nabiralnik, odzivi in naslednja vaja
    feedback.js        razlaga po odzivu
    progress.js        osebni napredek
    users.js           imenik, uvoz CSV/XLSX in preslikava
    groups.js          skupine in njihove nastavitve
    campaigns.js       priprava, odobritev in izvajanje kampanje
    campaign-view.js   prikaz načrta, izbire ponudnikov in dnevnika
    market.js          tržnica ponudnikov
    payments.js        pregled transakcij
    wallet.js          MetaMask in polnitve/vračila
    reports.js         skupinska poročila in izvoz
    rules.js           urejanje pravil
server.js              zagon strežnika in načrtovanih dostav
server/
  app.js               sestavljanje HTTP-aplikacije in statične datoteke
  http.js              JSON, zahteve HTTP in usmerjevalnik
  auth.js              preverjanje sej in pravic
  routes/              poti API-ja po funkcionalnostih
  store.js             skupno stanje prototipa v pomnilniku
  directory.js         imenik, vključitev v program in shranjevanje na disk
  planning.js          analiza, izbira ponudnikov in preverjanje načrta
  execution.js         izvajanje kampanj in načrtovana dostava
  learning.js          odzivi, osebni rezultati in rok hrambe
  analytics.js         skupinski kazalniki
  marketplace.js       register ponudnikov
  agent-service.js     plačljive storitve ponudnikov
  payments.js          preverjanje in izvajanje plačil x402
  wallet.js            stanje denarnice in prenosi sredstev
  public-state.js      podatki, dovoljeni posamezni vlogi
  config.js, utils.js  nastavitve in skupne pomožne funkcije
directory-import.js    razčlenjevanje CSV in skupna validacija uvoza
chain.js               Base Sepolia: ključi, EIP-712, stanje USDC
scenarios.js           predloge simulacij
test/                  API-testi, vzorčna XLSX in brskalniški preizkus
```

Vmesnik uporablja izvorne ES-module (`import`/`export`), zato dodaten korak gradnje ni potreben. Posamezna funkcionalnost registrira svoje dogodke; `public/app.js` samo sestavi aplikacijo. Usmerjevalnik dobi seznam prikazov iz vstopne točke, zato med funkcionalnostmi in navigacijo ni krožnih uvozov.

Na strežniku so poti API-ja ločene od pravil in izvajanja storitev. `server/app.js` jih poveže v usmerjevalnik, `server.js` pa naloži imenik in zažene HTTP-strežnik ter dostave. Skupno stanje ostaja v pomnilniku; lokacije shranjenih datotek in ukazi za zagon se niso spremenili.

| Komponenta | Endpoint | Vloga |
|---|---|---|
| Specializirani agenti | `POST /x402/agents/:id/service` | Plačljiva storitev. Brez plačila vrne `402` s `paymentRequirements`. |
| Facilitator | `POST /facilitator/verify`, `/facilitator/settle` | Preveri podpis, znesek, prejemnika, rok in nonce (zaščita pred ponovitvijo) ter poravna plačilo. |
| Uporabniki | `POST /api/users/preview`, `POST /api/users/import`, `POST /api/users/include` | Predogled/preslikava CSV ali XLSX, potrjen uvoz in vključitev v program. |
| Seje | `GET/POST/DELETE /api/session` | Predstavitvena prijava in odjava; HttpOnly sejni piškotek. |
| Skupine | `GET/POST /api/groups` | Člani, kanali, zahtevnost in pogostost. |
| Učenje | `GET /api/messages`, `POST /api/messages/:id/action`, `POST /api/learning/next` | Osebni nabiralnik, odziv, zasebna razlaga in prostovoljna vaja. |
| Poročila | `GET /api/campaign-reports` | Agregirani kazalniki dejanskih kampanj, brez posameznih odgovorov. |
| Glavni agent | `POST /api/agent/plan` (`userIds`), `GET /api/agent/plans/:id/execute` (SSE), `POST /api/agent/plans/:id/deliver` | Za vsakega izbranega uporabnika: analiza → izbira agenta; ena odobritev → plačila x402 → načrt dostave. |

Storitev agenta lahko pokličeš tudi neposredno in vidiš odgovor 402:

```bash
curl -i -X POST http://localhost:4020/x402/agents/mailforge/service -d '{}'
```

## Kaj je simulirano

- **Plačila (privzeti način)**: struktura sporočil sledi specifikaciji x402 (`x402Version`, `accepts`, `scheme: exact`, `X-PAYMENT`, `X-PAYMENT-RESPONSE`, USDC na `base-sepolia`). Podpis je HMAC namesto EIP-712/EIP-3009, facilitator pa je lokalen, zato se pravi denar ne premika. Za produkcijo bi uporabili uradne pakete x402 (npr. `x402-express` na strani agenta, `x402-fetch` na strani glavnega agenta) in javni facilitator. Način `start:sepolia` že uporablja pravi podpis EIP-3009 in javni facilitator (protokol je implementiran neposredno z `viem`), vendar le na testnem omrežju.
- **Generiranje vsebine**: agenti uporabljajo predloge namesto jezikovnega modela, zato je demo ponovljiv in brez zlorabne vsebine. V produkciji bi jih nadomestil LLM znotraj istih etičnih omejitev.
- **Analitika organizacije**: rezultati kampanj izhajajo iz dejanskih odzivov v trenutnem zagonu. Razdelek »Vzorčna analitika organizacije« vsebuje posebej označene ilustrativne podatke. Prag petih sodelujočih je osnovna zaščita v predstavitvi, ne formalni dokaz anonimnosti.
- **Dostava**: sporočila ostajajo v lokalnem portalu. Integracije s ponudniki e-pošte/SMS niso vključene.
- **Prijava**: predstavitvena izbira vloge in e-naslova brez preverjanja identitete; ni produkcijska avtentikacija.

## Povezava z ugotovitvami iz Nalog 2 in 3

| Zahteva | Kje v prototipu |
|---|---|
| E1 takojšnja povratna informacija | Modal po odzivu, rdeče zastavice, označene v sporočilu |
| E2, I9 analitika in merljiv napredek | *Moj napredek*, *Analitika* (prijave, čas odziva, trend) |
| E3, E14 nenapovedane simulacije, primerna pogostost | Naključen čas dostave v delovnem času, omejitev simulacij na mesec |
| E4, E8 personalizacija in stopnjevanje | Glavni agent: taktika glede na pretekle odzive, težavnost 1–5, različice predlog |
| E5, I5 GDPR, minimalni podatki | Pošlje se le vloga, oddelek, jezik in težavnost; agent OSINT je izločen |
| E6 zunanji specializirani agenti | *Tržnica agentov* (8 generatorjev + agent za pregled) |
| E7, I7 nadzor stroškov | Mesečni proračun, limit na transakcijo, odobreni seznam, pregled plačil |
| E10 človeški nadzor in beleženje | Odobritev plana, revizijska sled |
| E11, I11 merjenje in nagrajevanje prijav | Točke budnosti, stopnja prijav kot ključni kazalnik |
| E12 več kanalov | E-pošta, SMS, Teams, glas (glas privzeto onemogočen) |
| I1 zaupanje, ne nadzor | Rezultati posameznika so vidni samo njemu, organizacija vidi k-anonimne podatke |
| I2, I3 pritisk in znani pošiljatelji | Taktike avtoriteta, časovni pritisk, znan (kompromitiran) pošiljatelj |
| I4 tehnično osebje | DevBait / ChatBait (GitHub, CI/CD, MFA) z bonusom za tehnične vloge |
| I8 skrit plačilni mehanizem | Zaposleni x402 sploh ne vidi; skrbnik vidi strošek in rezultat |
| I10, PS17 etične meje | Etični pregled (EthicsGuard QA) in prepovedane teme (odpuščanja, bonusi …) |
