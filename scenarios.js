// Predloge simulacij, ki jih "uporabljajo" specializirani agenti na tržnici.
// Telo sporočila uporablja oznake:
//   {{kljuc|besedilo}}  – rdeča zastavica, ki se po odzivu označi v besedilu
//   <<link>>            – mesto povezave (prikazano besedilo ≠ prava povezava)

export const TACTICS = {
  avtoriteta: {
    label: 'Avtoriteta',
    desc: 'Napadalec se predstavi kot nadrejeni ali vodstvo, da prejemnik zahteve ne bi preverjal.',
    tip: 'Nenavadne zahteve vodstva vedno preveri po drugem kanalu (telefon, osebno, znana številka).',
  },
  nujnost: {
    label: 'Časovni pritisk',
    desc: 'Kratek rok ali grožnja (zaklep računa, zamuda) skrajša čas za razmislek.',
    tip: 'Rok »v 2 urah« je znak, da upočasniš, ne pospešiš. Odpri storitev neposredno, ne prek povezave.',
  },
  zaupanje: {
    label: 'Znan pošiljatelj',
    desc: 'Sporočilo pride iz (kompromitiranega) računa osebe, s katero se redno dopisuješ.',
    tip: 'Tudi znan pošiljatelj je lahko kompromitiran. Nepričakovane priloge in povezave preveri pri pošiljatelju po drugem kanalu.',
  },
  tehnicni: {
    label: 'Tehnični kontekst',
    desc: 'Lažna varnostna ali sistemska obvestila (GitHub, CI/CD, MFA), ki ciljajo tehnično osebje.',
    tip: 'Varnostna obvestila odpiraj neposredno v aplikaciji. Kode MFA in žetonov ne deli nikoli, z nikomer.',
  },
  radovednost: {
    label: 'Radovednost',
    desc: 'Vabljiva vsebina (deljene fotografije, dokument), ki spodbudi klik brez razmisleka.',
    tip: 'Preveri, ali je dokument res deljen iz vašega sistema (domena, način prijave), preden se prijaviš.',
  },
};

export const CHANNELS = {
  email: 'E-pošta',
  sms: 'SMS',
  chat: 'Klepet (Teams)',
  glas: 'Glasovno sporočilo',
};

const pick = (d, low, mid, high) => (d <= 2 ? low : d === 3 ? mid : high);

const emailActions = [
  { id: 'click', label: 'Odpri povezavo', outcome: 'fail' },
  { id: 'reply', label: 'Odgovori', outcome: 'fail' },
  { id: 'report', label: 'Prijavi kot phishing', outcome: 'success' },
  { id: 'ignore', label: 'Izbriši', outcome: 'neutral' },
];
const smsActions = [
  { id: 'click', label: 'Odpri povezavo', outcome: 'fail' },
  { id: 'report', label: 'Prijavi kot phishing', outcome: 'success' },
  { id: 'ignore', label: 'Prezri', outcome: 'neutral' },
];
const chatActions = [
  { id: 'reply', label: 'Pošlji kodo', outcome: 'fail' },
  { id: 'report', label: 'Prijavi IT varnosti', outcome: 'success' },
  { id: 'ignore', label: 'Prezri', outcome: 'neutral' },
];

const flag = (key, where, title, explanation) => ({ key, where, title, explanation });

const TEMPLATES = {
  'email:avtoriteta': (d, c) => {
    const fromAddress = pick(d, 'marko.novak.direktor@gmail.com', 'marko.novak@podjetje-si.com', 'marko.novak@podjetje.si-mail.net');
    return {
      fromName: 'Marko Novak (direktor)',
      fromAddress,
      subject: pick(d, 'NUJNO!!! pregled pogodbe', 'Nujno: pregled pogodbe pred 14:00', `Pogodba za oddelek ${c.department} – potrebujem pregled do 14:00`),
      body: [
        pick(d, 'Pozdravljeni,', 'Živjo,', 'Živjo,'),
        `{{pressure|${pick(d, 'Takoj rabim da pregledate pogodbo, nimam časa za razlage!!', 'potrebujem tvoj pregled pogodbe še pred sestankom ob 14:00.', 'pred sestankom z upravo ob 14:00 bi rad, da na hitro pogledaš priloženo pogodbo.')}}}`,
        `Dokument je tukaj: <<link>>`,
        `{{secrecy|${pick(d, 'Ne govorite nikomur o tem, zaupno je.', 'Prosim, da zaenkrat ostane med nama.', 'Ker gre za občutljivo zadevo, je ne posreduj naprej.')}}}`,
        pick(d, 'Lp Marko', 'Hvala, Marko', 'Hvala,\nMarko Novak\nDirektor'),
      ].join('\n\n'),
      link: {
        label: 'Pogodba_2026_osnutek.pdf',
        real: pick(d, 'http://bit.ly/pogodba-nujno', 'https://podjetje-si.com/share/pogodba', 'https://podjetje.si-mail.net/sharepoint/pogodba.pdf'),
      },
      redFlags: [
        flag('sender', 'from', 'Naslov pošiljatelja', `Direktor ne piše z naslova ${fromAddress}. Uradna domena je @podjetje.si.`),
        flag('pressure', 'body', 'Avtoriteta + rok', 'Kombinacija nadrejenega in kratkega roka je klasičen vzvod, da ne preveriš zahteve.'),
        flag('secrecy', 'body', 'Zahteva po molčečnosti', 'Prošnja, naj zadeva ostane skrivnost, prepreči, da bi kdo drug opazil prevaro.'),
        flag('link', 'link', 'Povezava vodi drugam', 'Besedilo povezave kaže PDF, dejanski naslov pa vodi na zunanjo domeno.'),
      ],
      actions: emailActions,
    };
  },

  'email:nujnost': (d) => {
    const fromAddress = pick(d, 'it-support@microsoft-365-help.com', 'it.podpora@podjetje-it.com', 'it-podpora@podjetje.si.helpdesk-m365.com');
    return {
      fromName: 'IT podpora',
      fromAddress,
      subject: pick(d, 'Vaše geslo POTEČE DANES!!!', 'Vaše geslo poteče čez 2 uri', 'Obvestilo o poteku gesla (M365)'),
      body: [
        'Pozdravljeni,',
        `{{deadline|${pick(d, 'vase geslo potece cez 1 uro in izgubili boste VSE podatke.', 'vaše geslo za Microsoft 365 poteče čez 2 uri. Po poteku bo račun zaklenjen.', 'v skladu s politiko gesel vaše geslo za Microsoft 365 poteče danes ob 16:00.')}}}`,
        'Geslo podaljšate tukaj: <<link>>',
        `{{generic|${pick(d, 'Lep pozdrav, Microsoft Team', 'Hvala za razumevanje, IT podpora', 'Za vprašanja smo dosegljivi na interni številki 1234.')}}}`,
      ].join('\n\n'),
      link: {
        label: 'Podaljšaj geslo',
        real: pick(d, 'http://m1crosoft-login.xyz/reset', 'https://podjetje-it.com/m365/reset', 'https://login.podjetje.si.helpdesk-m365.com/reset'),
      },
      redFlags: [
        flag('sender', 'from', 'Zunanja domena IT podpore', `Interna IT podpora ne pošilja z ${fromAddress}.`),
        flag('deadline', 'body', 'Umeten rok', 'Grožnja z zaklepom in rok v urah sta namenjena temu, da ne razmisliš.'),
        flag('link', 'link', 'Prijava prek povezave', 'Gesla nikoli ne spreminjaj prek povezave v e-pošti. Odpri portal neposredno.'),
        flag('generic', 'body', 'Splošen podpis', 'Podpis brez konkretne osebe ali s številko, ki je ne moreš preveriti.'),
      ],
      actions: emailActions,
    };
  },

  'email:radovednost': (d) => {
    const fromAddress = pick(d, 'photos-share@drive-docs.net', 'deljenje@podjetje-drive.com', 'no-reply@podjetje.sharepoint-online.co');
    return {
      fromName: pick(d, 'Google Drive', 'Deljenje dokumentov', 'SharePoint Online'),
      fromAddress,
      subject: pick(d, 'Nekdo je delil fotke z vami!!', 'Fotografije s teambuildinga so na voljo', 'Petra K. je z vami delila mapo »Teambuilding Bohinj 2026«'),
      body: [
        `{{bait|${pick(d, 'Poglejte smešne fotke z zabave, tudi vi ste gor :)', 'Fotografije z zadnjega teambuildinga so naložene v skupno mapo.', 'Petra K. je z vami delila mapo »Teambuilding Bohinj 2026« (48 elementov).')}}}`,
        'Ogled: <<link>>',
        `{{login|${pick(d, 'Za ogled se prijavite z geslom od službene pošte.', 'Za dostop se prijavite s službenim računom.', 'Dostop zahteva ponovno prijavo zaradi varnostne politike.')}}}`,
      ].join('\n\n'),
      link: {
        label: 'Odpri mapo',
        real: pick(d, 'http://drive-docs.net/login', 'https://podjetje-drive.com/login', 'https://podjetje.sharepoint-online.co/login'),
      },
      redFlags: [
        flag('sender', 'from', 'Lažna storitev deljenja', `${fromAddress} ni domena vašega SharePointa (podjetje.sharepoint.com).`),
        flag('bait', 'body', 'Vaba radovednosti', 'Osebna, zabavna vsebina zniža pozornost.'),
        flag('login', 'body', 'Zahteva za ponovno prijavo', 'Ogled deljene mape ne bi smel zahtevati vnosa gesla na novi strani.'),
        flag('link', 'link', 'Povezava na tujo domeno', 'Povezava ne vodi na vaš uradni SharePoint.'),
      ],
      actions: emailActions,
    };
  },

  'email:zaupanje': (d) => {
    const fromAddress = pick(d, 'ana.kovac.podjetje@outlook.com', 'ana.kovac@podjetje.si', 'ana.kovac@podjetje.si');
    return {
      fromName: 'Ana Kovač',
      fromAddress,
      subject: 'Re: Specifikacija API v2 – osnutek',
      body: [
        'Živjo,',
        `{{context|${pick(d, 'tukaj je dokument ki si ga hotel.', 'kot dogovorjeno pošiljam posodobljeno specifikacijo z vašimi pripombami.', 'vključila sem tvoje pripombe glede avtentikacije in paginacije, posodobljena verzija je spodaj.')}}}`,
        `{{attachment|${pick(d, 'Prenesi ZIP in zaženi setup.exe za ogled.', 'Datoteka je prevelika za prilogo, zato je na OneDrive:', 'Ker je dokument večji, sem ga naložila na OneDrive:')}}} <<link>>`,
        pick(d, 'Ana', 'Lp, Ana', 'Lp, Ana'),
      ].join('\n\n'),
      link: {
        label: 'Specifikacija_API_v2.zip',
        real: pick(d, 'http://files-share.ru/spec.zip', 'https://onedrive-share.podjetje-files.com/spec.zip', 'https://1drv-ms.share-podjetje.com/f/spec_v2.zip'),
      },
      redFlags: [
        flag('sender', 'from', pick(d, 'Zasebni naslov sodelavke', 'Pravi naslov, kompromitiran račun', 'Pravi naslov, kompromitiran račun'),
          pick(d, 'Ana ti običajno piše s službenega naslova, ne z Outlook.com.', 'Naslov je pravi. Pri prevzemu računa to ni dovolj, preveri vsebino.', 'Naslov je pravi. Pri prevzemu računa to ni dovolj, preveri vsebino.')),
        flag('context', 'body', 'Zloraba obstoječe niti', 'Napadalec nadaljuje resničen pogovor, zato sporočilo deluje pričakovano.'),
        flag('attachment', 'body', 'ZIP namesto dokumenta', 'Specifikacijo bi pričakoval kot dokument v skupnem prostoru, ne kot ZIP na zunanji povezavi.'),
        flag('link', 'link', 'Lažni OneDrive', 'Domena povezave ni onedrive.live.com ali vaš SharePoint.'),
      ],
      actions: emailActions,
    };
  },

  'email:tehnicni': (d, c) => {
    const fromAddress = pick(d, 'security@github-alerts.com', 'noreply@github-security.io', 'noreply@github.com.security-notice.dev');
    return {
      fromName: 'GitHub',
      fromAddress,
      subject: pick(d, '[GitHub] Your acount was HACKED', '[GitHub] Zaznana sumljiva prijava', `[GitHub] Osebni dostopni žeton za podjetje/${c.department.toLowerCase()}-api poteče`),
      body: [
        `{{alert|${pick(d, 'Vaš račun je bil vlomljen! Takoj potrdite identiteto.', 'zaznali smo prijavo v vaš račun iz nove naprave (Frankfurt, DE).', 'osebni dostopni žeton »ci-deploy« poteče čez 24 ur. Pipeline za produkcijo se bo ustavil.')}}}`,
        'Preverite tukaj: <<link>>',
        `{{token|${pick(d, 'Vpišite geslo in kodo 2FA.', 'Za potrditev boste potrebovali kodo 2FA.', 'Za podaljšanje se prijavite in potrdite obstoječi žeton.')}}}`,
      ].join('\n\n'),
      link: {
        label: 'github.com/settings/security',
        real: pick(d, 'http://github-alerts.com/verify', 'https://github-security.io/login', 'https://github.com.security-notice.dev/settings/tokens'),
      },
      redFlags: [
        flag('sender', 'from', 'Lažna domena GitHuba', `GitHub pošilja z @github.com, ne z ${fromAddress}.`),
        flag('alert', 'body', 'Strah pred izpadom', 'Grožnja z vdorom ali izpadom produkcije cilja ravno na tehnično osebje.'),
        flag('token', 'body', 'Zahteva po kodi ali žetonu', 'Pravi GitHub nikoli ne zahteva vnosa obstoječega žetona prek povezave.'),
        flag('link', 'link', 'Prikazan ≠ pravi naslov', 'Prikazano besedilo kaže github.com, povezava pa vodi drugam.'),
      ],
      actions: emailActions,
    };
  },

  'sms:nujnost': (d) => ({
    fromName: pick(d, '+386 40 123 999', 'PostaSI', 'Posta Slovenije'),
    fromAddress: 'SMS',
    subject: 'SMS',
    body: `{{deadline|${pick(d, 'VAŠ PAKET BO VRNJEN DANES!!', 'Pošiljka čaka na doplačilo 1,20 € in bo vrnjena v 24 h.', 'Pošiljka RR123456789SI: neuspešna dostava. Nov termin izberite do 18:00.')}}} <<link>>`,
    link: {
      label: pick(d, 'bit.ly/paket', 'posta-si.info/placilo', 'posta.si-sledenje.com/RR123456789SI'),
      real: pick(d, 'http://bit.ly/paket', 'https://posta-si.info/placilo', 'https://posta.si-sledenje.com/RR123456789SI'),
    },
    redFlags: [
      flag('deadline', 'body', 'Rok in grožnja vračila', 'Nujnost prepreči, da bi preveril, ali sploh pričakuješ paket.'),
      flag('link', 'link', 'Domena ni posta.si', 'Uradna domena je posta.si. Vse drugo (posta-si, si-sledenje) je posnetek.'),
      flag('sender', 'from', 'Nepreverjen pošiljatelj', 'Ime pošiljatelja SMS-a je mogoče ponarediti.'),
    ],
    actions: smsActions,
  }),

  'chat:zaupanje': (d) => ({
    fromName: pick(d, 'IT Helpdesk (zunanji)', 'Jure – IT', 'Jure Zupan (IT)'),
    fromAddress: pick(d, 'zunanji uporabnik', 'zunanji uporabnik', 'podjetje.si'),
    subject: 'Teams',
    body: [
      `{{context|${pick(d, 'Hej, IT tukaj. Rabim tvojo kodo.', 'Živjo, ravno selimo račune na novi MFA strežnik.', 'Živjo, ravno urejam tvoj račun po včerajšnjem posodabljanju VPN-ja (ticket IT-2231).')}}}`,
      `{{code|${pick(d, 'Pošlji mi 6-mestno kodo iz aplikacije.', 'Dobil boš SMS s kodo, prosim pošlji mi jo sem, da potrdim prenos.', 'Na telefon ti bo prišla koda, prilepi jo sem, da zaključim, sicer bo VPN jutri nedelujoč.')}}}`,
    ].join('\n\n'),
    link: null,
    redFlags: [
      flag('sender', 'from', 'Zunanji ali nepreverjen račun', 'Preveri, ali gre za znan interni račun. Teams označuje zunanje uporabnike.'),
      flag('context', 'body', 'Verjetna zgodba', 'Sklic na resnično dogajanje (selitev, ticket) naredi zahtevo verodostojno.'),
      flag('code', 'body', 'Zahteva po kodi MFA', 'IT nikoli ne potrebuje tvoje kode MFA. To je jasen znak prevzema računa.'),
    ],
    actions: chatActions,
  }),

  'chat:tehnicni': (d, c) => ({
    fromName: pick(d, 'DevOps Bot', 'CI Bot', 'GitLab CI'),
    fromAddress: 'zunanja aplikacija',
    subject: 'Teams',
    body: [
      `{{alert|${pick(d, 'BUILD FAILED!!! takoj popravi', 'Build za main je padel zaradi neveljavnih poverilnic.', `Pipeline ${c.department.toLowerCase()}-api #4812 je padel: registry token je potekel.`)}}}`,
      `{{code|${pick(d, 'Prilepi svoj token sem.', 'Za ponovni zagon prilepi svoj osebni žeton v odgovor.', 'Za ponovni zagon odgovori z novim deploy žetonom ali ga potrdi tukaj:')}}} <<link>>`,
    ].join('\n\n'),
    link: {
      label: 'ci.podjetje.si/retry',
      real: pick(d, 'http://ci-retry.xyz', 'https://ci-podjetje.dev/retry', 'https://ci.podjetje.si.pipeline-retry.dev/4812'),
    },
    redFlags: [
      flag('sender', 'from', 'Nepreverjen bot', 'Bot ni iz vašega seznama odobrenih integracij.'),
      flag('alert', 'body', 'Izpad kot vzvod', 'Pritisk zaradi padlega builda ti da razlog za bližnjico.'),
      flag('code', 'body', 'Zahteva po žetonu', 'Žetoni se nikoli ne pošiljajo prek klepeta.'),
    ],
    actions: chatActions,
  }),

  'glas:avtoriteta': (d) => ({
    fromName: 'Marko Novak (glasovno sporočilo)',
    fromAddress: '+386 31 000 111',
    subject: 'Glasovno sporočilo (prepis)',
    body: [
      '[Prepis glasovnega sporočila, 0:34]',
      `{{voice|${pick(d, 'Ej, tukaj Marko, rabim pomoč, nujno pokliči.', 'Živjo, Marko tukaj. Sem na letališču in ne morem v VPN.', 'Živjo, Marko tukaj, sem na poti na sestanek pri stranki in ne morem v sistem.')}}}`,
      `{{code|${pick(d, 'Pošlji mi kodo ki ti pride.', 'Prosim, pošlji mi kodo, ki ti bo prišla na telefon, da se prijavim s tvojim računom.', 'Ti bo prišla potrditvena koda, mi jo prosim pošlješ v SMS-u, da pokažem demo?')}}}`,
    ].join('\n\n'),
    link: null,
    redFlags: [
      flag('sender', 'from', 'Neznana številka', 'Številka ni direktorjeva službena številka iz imenika.'),
      flag('voice', 'body', 'Sintetiziran glas', 'Glas je mogoče ponarediti iz nekaj sekund posnetka. Prepoznaven glas ni dokaz identitete.'),
      flag('code', 'body', 'Zahteva po kodi', 'Nihče, tudi direktor, ne potrebuje tvoje potrditvene kode.'),
    ],
    actions: [
      { id: 'reply', label: 'Pošlji kodo', outcome: 'fail' },
      { id: 'report', label: 'Pokliči nazaj na znano številko in prijavi', outcome: 'success' },
      { id: 'ignore', label: 'Prezri', outcome: 'neutral' },
    ],
  }),
};

// Dodatne različice, da ponovna vaja na isti taktiki ni enako sporočilo
const VARIANTS = {
  'email:avtoriteta': [
    (d, c) => {
      const fromAddress = pick(d, 'vodja.razvoja@outlook.com', 'tomaz.horvat@podjetje-dev.com', 'tomaz.horvat@podjetje.si.access-review.net');
      return {
        fromName: `Tomaž Horvat (vodja oddelka ${c.department})`,
        fromAddress,
        subject: pick(d, 'Daj dostop TAKOJ', 'Dostop za zunanjega sodelavca – danes', 'Odobritev dostopa: zunanji izvajalec za projekt API v2'),
        body: [
          'Živjo,',
          `{{pressure|${pick(d, 'rabim da takoj daš dostop novemu sodelavcu, jaz sem na sestanku.', 'prosim, da novemu zunanjemu izvajalcu še danes odobriš dostop do repozitorija, jutri začne.', 'zunanji izvajalec za API v2 začne jutri zjutraj, zato bi rad, da mu še danes odobriš dostop do repozitorija.')}}}`,
          `{{process|${pick(d, 'Ne odpiraj zahtevka, ni časa.', 'Zahtevek v Jiri bom odprl naknadno.', 'Formalni zahtevek bo HR uredil naknadno, odobritev je tukaj:')}}} <<link>>`,
          pick(d, 'T.', 'Hvala, Tomaž', 'Hvala,\nTomaž Horvat'),
        ].join('\n\n'),
        link: {
          label: pick(d, 'Odobri dostop', 'Odobri dostop v GitLabu', 'gitlab.podjetje.si/access/approve'),
          real: pick(d, 'http://access-grant.top/ok', 'https://gitlab-podjetje.dev/approve', 'https://gitlab.podjetje.si.access-review.net/approve'),
        },
        redFlags: [
          flag('sender', 'from', 'Naslov ni službeni', `Vodja oddelka ne piše z ${fromAddress}.`),
          flag('pressure', 'body', 'Avtoriteta + rok', 'Nadrejeni, ki je »na sestanku« in potrebuje nekaj »še danes«, ti onemogoči preverjanje.'),
          flag('process', 'body', 'Obvod uradnega postopka', 'Dostope se odobri prek zahtevka, ne prek povezave v e-pošti. Obljuba »naknadno« je opozorilo.'),
          flag('link', 'link', 'Lažna stran za odobritev', 'Povezava ne vodi na vaš GitLab.'),
        ],
        actions: emailActions,
      };
    },
  ],
};

export function generateScenario({ channel, tactic, difficulty, role, department, variant = 0 }) {
  const key = TEMPLATES[`${channel}:${tactic}`] ? `${channel}:${tactic}` : `email:${tactic}`;
  const usedChannel = key.split(':')[0];
  const d = Math.max(1, Math.min(5, Number(difficulty) || 1));
  const options = [TEMPLATES[key], ...(VARIANTS[key] || [])];
  const s = options[Math.abs(Number(variant) || 0) % options.length](d, { role, department });
  return { channel: usedChannel, tactic, difficulty: d, ...s };
}

export function scenarioText(s) {
  return [s.fromName, s.fromAddress, s.subject, s.body, s.link?.label, s.link?.real].filter(Boolean).join(' ');
}

export const LEGIT_MESSAGES = [
  {
    channel: 'email',
    fromName: 'Ana Kovač',
    fromAddress: 'ana.kovac@podjetje.si',
    subject: 'Specifikacija API v2 – osnutek',
    body: 'Živjo,\n\nv skupni prostor sem naložila osnutek specifikacije za API v2. Prosim, da do četrtka dodaš pripombe glede avtentikacije.\n\nLp, Ana',
  },
  {
    channel: 'email',
    fromName: 'Kadrovska služba',
    fromAddress: 'kadrovska@podjetje.si',
    subject: 'Opomnik: oddaja potnih nalogov do petka',
    body: 'Pozdravljeni,\n\nspominjamo vas, da potne naloge za oktober oddate v sistemu HRM do petka.\n\nKadrovska služba',
  },
  {
    channel: 'email',
    fromName: 'Jira',
    fromAddress: 'jira@podjetje.atlassian.net',
    subject: '[DEV-412] Dodeljen vam je nov zahtevek',
    body: 'Zahtevek DEV-412 »Paginacija na /orders« vam je dodelil uporabnik Ana Kovač.\n\nPrioriteta: srednja',
  },
];
