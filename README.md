# CyberAgent Marketplace – prototip

Avtonomna tržnica AI-agentov za personalizirane kibernetske simulacije z mikroplačili prek protokola x402.
Prototip prikazuje proces iz Naloge 3 (razdelek »Predvideni prototip«): uporabnik izvede simulacijo, glavni AI-agent prepozna potrebo po dodatnem usposabljanju, na tržnici izbere specializiranega agenta, naroči in plača njegovo storitev prek x402, uporabnik pa prejme novo personalizirano simulacijo s povratnimi informacijami. Prikazan je tudi pregled opravljenih mikroplačil.

## Zagon

Potreben je Node.js 18 ali novejši. Zunanjih odvisnosti ni.

```bash
cd prototip-x402
npm start          # ali: node server.js
```

Odpri <http://localhost:4020>. Stanje je v pomnilniku in se ob ponovnem zagonu ponastavi.

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

## Demo scenarij (približno 3 minute)

1. **Nabiralnik**: med pristnimi sporočili je izhodiščna simulacija (»Marko Novak (direktor)«). Ob prehodu z miško čez povezavo spodaj levo vidiš njen pravi cilj.
2. Klikni priponko (= nasedeš) ali »Prijavi kot phishing«. Takoj se prikaže povratna informacija: uporabljena taktika, oštevilčene rdeče zastavice, ki so označene tudi v samem sporočilu, nasvet in sprememba težavnosti.
3. Klikni **»Kako glavni agent pripravi naslednjo simulacijo →«**. Agent analizira odziv, izbere taktiko in težavnost ter oceni vse agente na tržnici (z razlogi za izločitev: cena, odobreni seznam, osebni podatki, onemogočen kanal …). Prikaže tudi, kateri podatki zapustijo organizacijo.
4. **Odobri in plačaj** (človeški nadzor). V dnevniku v živo poteka pravi tok HTTP x402:
   `POST` → `402 Payment Required` → preverjanje pravil porabe → podpis avtorizacije → ponovni `POST` z glavo `X-PAYMENT` → `200 OK` + `X-PAYMENT-RESPONSE`.
   Zaporedoma se plačata dve storitvi: generiranje simulacije in neodvisen etični pregled.
5. Simulacija je načrtovana ob naključnem času v delovnem času. Za demo klikni **»Dostavi zdaj«** in se odzovi nanjo. Po napaki agent ponovi isto taktiko pri nižji težavnosti in v drugi različici, po uspehu pa dvigne težavnost in izbere novo taktiko (npr. DevBait za razvijalca).
6. Preglej še **Plačila x402**, **Tržnico** (odobreni seznam lahko vklapljaš), **Analitiko** (anonimizirano, oddelki z manj kot 5 osebami so skriti) in **Pravila in nadzor** (proračun, limit na transakcijo, kanali, prepovedane teme, revizijska sled).

Za preizkus pravil: v *Pravila in nadzor* znižaj »Največ na transakcijo« na `0.05`. Agent nato ne najde primernega ponudnika in nič ne plača.

## Arhitektura

```
public/            spletni vmesnik (vanilla JS, odziven za mobilne naprave)
server.js          API, glavni agent, plačljive storitve agentov, simuliran facilitator
chain.js           način Base Sepolia: ključi, podpis EIP-712, stanje USDC na verigi
scenarios.js       predloge simulacij (5 taktik × 4 kanali × 5 stopenj težavnosti)
```

| Komponenta | Endpoint | Vloga |
|---|---|---|
| Specializirani agenti | `POST /x402/agents/:id/service` | Plačljiva storitev. Brez plačila vrne `402` s `paymentRequirements`. |
| Facilitator | `POST /facilitator/verify`, `/facilitator/settle` | Preveri podpis, znesek, prejemnika, rok in nonce (zaščita pred ponovitvijo) ter poravna plačilo. |
| Glavni agent | `POST /api/agent/plan`, `GET /api/agent/plans/:id/execute` (SSE) | Analiza → izbira agenta → odobritev → plačilo x402 → načrt dostave. |

Storitev agenta lahko pokličeš tudi neposredno in vidiš odgovor 402:

```bash
curl -i -X POST http://localhost:4020/x402/agents/mailforge/service -d '{}'
```

## Kaj je simulirano

- **Plačila (privzeti način)**: struktura sporočil sledi specifikaciji x402 (`x402Version`, `accepts`, `scheme: exact`, `X-PAYMENT`, `X-PAYMENT-RESPONSE`, USDC na `base-sepolia`). Podpis je HMAC namesto EIP-712/EIP-3009, facilitator pa je lokalen, zato se pravi denar ne premika. Za produkcijo bi uporabili uradne pakete x402 (npr. `x402-express` na strani agenta, `x402-fetch` na strani glavnega agenta) in javni facilitator. Način `start:sepolia` že uporablja pravi podpis EIP-3009 in javni facilitator (protokol je implementiran neposredno z `viem`), vendar le na testnem omrežju.
- **Generiranje vsebine**: agenti uporabljajo predloge namesto jezikovnega modela, zato je demo ponovljiv in brez zlorabne vsebine. V produkciji bi jih nadomestil LLM znotraj istih etičnih omejitev.
- **Analitika organizacije**: podatki so ilustrativni.

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
