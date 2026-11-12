# Paletka — návod

Paletka jedným klikom zmení farby celej plochy Ubuntu: horný panel a menu, aplikácie,
terminál, textový editor, VS Code, tapetu a ikony. Každá téma je *rodina* so svetlou a tmavou
verziou.

## Požiadavky

- Ubuntu 26.04 (GNOME Shell 50).
- Voliteľne: VS Code, Ptyxis alebo GNOME Terminal, GNOME Text Editor.

## Inštalácia

1. Stiahni `paletka@adamciktomas.github.io.shell-extension.zip` z
   [najnovšieho vydania](https://github.com/TomasAdamcik-dotcom/paletka/releases/latest).
2. V termináli v priečinku so súborom spusti
   `gnome-extensions install --force paletka@adamciktomas.github.io.shell-extension.zip`.
3. Odhlás sa a znova prihlás.
4. Zapni **Paletku** v aplikácii **Rozšírenia** (alebo príkazom
   `gnome-extensions enable paletka@adamciktomas.github.io`).

## Prepínanie tém

Otvor **Rýchle nastavenia** (menu v pravom hornom rohu). Vedľa dlaždice **Tmavý štýl** je
dlaždica **Téma**.

- Šípka na dlaždici **Téma** otvorí zoznam tém. Každý riadok má tlačidlo **Tmavá** a
  **Svetlá**; zvýraznené tlačidlo je práve použité.
- Klik na samotnú dlaždicu prepína medzi Ubuntu a naposledy použitou témou.
- Pôvodná dlaždica **Tmavý štýl** vždy vráti čistý vzhľad Ubuntu (svetlý alebo tmavý).

Hneď sa zmení:

- horný panel, menu a rýchle nastavenia,
- svetlý/tmavý režim vo všetkých aplikáciách,
- farby terminálu, tapeta, farba zvýraznenia a ikony,
- VS Code, ak je nainštalovaná príslušná téma.

Pri prechode na *inú* rodinu tém si už otvorené aplikácie nechajú staré farby, kým ich znova
neotvoríš. **Súbory** sa reštartujú samy a znova otvoria svoje okná. Počkajú, kým pracujú —
kopírujú, presúvajú, mažú, prenášajú do telefónu alebo na sieťové umiestnenie, alebo sa ťa
niečo pýtajú — a reštartujú sa do pol minúty po skončení.

### VS Code

Paletka nastaví VS Code preferovanú svetlú a tmavú tému. Solarized je vo VS Code zabudovaná.
Pre Gruvbox, Nord a Dracula ukáže Paletka pri prvom výbere upozornenie s tlačidlom
**Nainštalovať tému**; jeden klik ju nainštaluje. Ak VS Code nemáš, táto časť sa preskočí.

### Claude Code a iné terminálové aplikácie

Terminálové aplikácie používajú 16 farieb terminálu. V Claude Code raz spusti
`/theme dark-ansi` (alebo `light-ansi`) a odvtedy bude farby terminálu nasledovať.

## Webové stránky

Paletka vie prefarbiť aj webové stránky — biele aj tmavé — farbami aktívnej témy, v Google
Chrome, Chromiu a Firefoxe. Stránky sa prefarbia hneď pri každej zmene témy aj svetlého/tmavého
režimu.

1. Otvor **Nastavenia…** na spodku menu Téma a prejdi na **Prehliadače**.
2. Zapni svoj prehliadač. Riadok potom ukáže *Nainštalujte rozšírenie Paletka v tomto prehliadači*.
3. Nainštaluj rozšírenie:
   - **Chrome / Chromium:** stiahni `paletka-chrome.zip` z
     [najnovšieho vydania](https://github.com/TomasAdamcik-dotcom/paletka/releases/latest) a
     rozbaľ ho. Otvor `chrome://extensions`, zapni **Režim pre vývojárov**, klikni na
     **Načítať rozbalené** a vyber rozbalený priečinok.
   - **Firefox:** nainštaluj doplnok Paletka z najnovšieho vydania (`paletka-firefox.xpi`,
     podpísaný Mozillou) tak, že súbor otvoríš vo Firefoxe.
4. **Len Firefox zo snapu (Ubuntu):** prvýkrát sa Ubuntu opýta, či môže Firefox spustiť Paletku.
   Otázka sa ukáže, len keď je Firefox aktívne okno — klikni do Firefoxu a zvoľ **Povoliť**.
5. Riadok v Paletke ukáže **Aktívne**.

Tlačidlo Paletka v paneli prehliadača ukáže aktívnu tému a má dva prepínače: *Recolor web
pages* (všetky stránky) a *Recolor* + názov stránky (len táto stránka).

**Okno Chromu:** pod Chromom zapni **Farbiť aj okno Chromu**, v Chrome raz zvoľ *Nastavenia →
Vzhľad → Režim → GTK* a Chrome reštartuj. Firefox si okno prefarbí sám.

Dobré vedieť: obrázky, videá a farebné prvky ako tlačidlá si farby nechajú. Niektoré detaily
kreslené špeciálnym spôsobom (napríklad ozdobné prechody) môžu ostať svetlé.

## Vlastná téma

Klikni na **Upraviť témy…** na spodku menu Téma (alebo otvor nastavenia Paletky v aplikácii
Rozšírenia).

- **Nová téma** začína z farieb Solarized; **Duplikovať** skopíruje ľubovoľnú tému
  (duplikát Ubuntu začína štandardnými farbami Ubuntu).
- Na karte **Svetlá** alebo **Tmavá** nastav šesť **základných farieb**: pozadie, text,
  zvýraznenie, panely a bočné lišty, úspech a chyba. Všetko ostatné sa z nich dopočíta.
- **Pokročilé → Odvodené farby** umožní prepísať ktorúkoľvek vypočítanú farbu; **Späť na
  automatickú** to vráti.
- **Terminál**: text, pozadie, kurzor a 16 ANSI farieb (alebo **Obnoviť zo základných
  farieb**).
- **Tapeta**: žiadna, jedna farba, prechod alebo obrázok.
- **Ikony**: ponechať tvoje ikony alebo vybrať nainštalovanú tému ikon.
- **VS Code**: farebná téma VS Code pre túto verziu.

Zmeny aktívnej témy sa použijú priebežne. **Exportovať…** uloží tému ako JSON súbor na
zdieľanie; **Importovať…** ju pridá.

## Vypnutie a odinštalovanie

Vypnutie Paletky **vráti tvoj pôvodný vzhľad** — tvoje nastavenia GTK, tapetu, zvýraznenie,
ikony, farby terminálu, schému Text Editora a nastavenia VS Code — a zmaže súbory, ktoré
Paletka vytvorila (aj prepojenie s prehliadačmi a kópiu spúšťača Chromu). Vypnúť ju môžeš:

- v aplikácii **Rozšírenia** alebo **Extension Manager**,
- na [extensions.gnome.org → Installed extensions](https://extensions.gnome.org/local/),
- v termináli: `gnome-extensions disable paletka@adamciktomas.github.io`.

Odinštalovanie (na tých istých miestach alebo príkazom
`gnome-extensions uninstall paletka@adamciktomas.github.io`) Paletku najprv vypne, takže
všetko vráti rovnako.

Dobré vedieť:

- Paletka si pamätá tvoju tému: po opätovnom zapnutí sa vráti.
- Zamknutie obrazovky ani odhlásenie ju **nevypína**.
- Čo si počas aktívnej témy zmenil sám (napríklad inú tapetu), zostane.
- Otvorené aplikácie ukážu pôvodné farby po znovuotvorení.

Ak bol priečinok Paletky zmazaný ručne bez vypnutia, nainštaluj ju znova, odhlás sa a
prihlás, a potom ju vypni: vzhľad obnoví zo zálohy v `~/.local/share/paletka/backup`.

## Riešenie problémov

- **„Nájdené staré nastavenia farieb“**: súbor `~/.config/gtk-4.0/gtk.css` z iného nástroja
  (napríklad Gradience) napevno nastavuje niektoré farby, čo môže v tmavom režime spraviť
  text nečitateľným. Presuň alebo zmaž ho.
- **Aplikácia má stále staré farby**: zatvor ju a otvor znova.
- **VS Code sa nemení**: nainštaluj tému VS Code uvedenú v nastaveniach témy alebo použi
  tlačidlo **Nainštalovať tému** v upozornení.
