Gold path reliability plan — volledig geamendeerd

Changed (C1–C10) — Summary — Harden de bestaande overlay-first UIA/PowerShell-route zonder nieuwe settings. Bevries de bestemming vóór UIA-snapshotting, onderscheid incomplete capture van bewezen leegte, valideer uitsluitend binnen het frozen venster, gebruik single-shot dispatch en handhaaf het vierdelige Apply-resultaat zonder optimistic ooit als confirmed te behandelen.

Changed (C1) — Capture-outcomecontract — Voeg aan `CaptureResult` een expliciete state toe: `captured`, `proven-empty`, `suppressed` of `incomplete`. Alleen een resolved frozen target dat daadwerkelijk een lege waarde retourneert mag `proven-empty` en `mode="empty"` opleveren. Een snapshot- of capture-timeout, ontbrekende UIA-data of bridgefout wordt `incomplete` met een reason en behoudt de bekende field- of terminalmodus. Een bewust uitgesloten non-terminal selection wordt `suppressed`, niet empty. `copied` en `retained` blijven uitsluitend Apply-resultaten.

Changed (C1) — Incomplete capture UX — Een incomplete capture opent de overlay met een afzonderlijke neutrale status, behoudt het vroeg bevroren basisdoel en claimt nooit dat het veld leeg is. De gebruiker kan de bestemming opnieuw proberen of handmatig invoer geven, maar de incomplete uitkomst telt niet als succesvolle capture. Een populated ondersteund control dat tijdens normale validatie incomplete of empty oplevert, laat de release-gate falen; een geforceerde timeouttest slaagt alleen wanneer hij voorspelbaar als incomplete herstelt.

Changed (C2, C7, C8) — Clipboard en InjectResult — Gebruik `confirmed`, `dispatched`, `copied` en `retained`. Alleen `confirmed` mag de pre-capture clipboard herstellen. `dispatched` betekent dat precies één muterende handeling mogelijk is uitgevoerd zonder volledige bevestiging; de overlay sluit en de refined tekst blijft op de clipboard. `copied` betekent dat vóór enige dispatch veilig is gestopt en de refined clipboard is geverifieerd. `retained` betekent dat vóór dispatch veilig is gestopt maar clipboardverificatie niet slaagde; de editable overlay blijft beschikbaar.

Changed (C2) — Clipboard clobber — Clobber betekent uitsluitend dat refined tekst na een niet-confirmed Apply zowel uit de clipboard als uit de overlay verloren is. Het bewust behouden van refined tekst bij `dispatched` of `copied` is geen clobber. Het herstellen van de pre-capture clipboard bij enig resultaat anders dan `confirmed` is wel een contractschending.

Changed (C7) — Clipboard ownership — De main orchestrator is de enige component die de pre-capture clipboard mag herstellen. Iedere Apply krijgt een generation token dat wordt gekoppeld aan de frozen target, refined tekst en clipboardsnapshot. Restore gebeurt alleen na een normaal beëindigde `confirmed`, wanneer het token nog actief is en de huidige clipboard nog door die Apply wordt beheerd. Als token of clipboardinhoud niet meer overeenkomt, blijft de huidige clipboard onaangeroerd. PowerShell en `Try-TerminalPaste` herstellen nooit een saved clipboard.

Changed (C7) — Clipboard-uitvoering — Schrijf en verifieer de refined tekst vóór het verbergen van de overlay, met drie readbackpogingen op intervallen van 50 ms. Bij mislukte preflight wordt geen injectie gestart en volgt `retained`. Na `dispatched` wordt de refined tekst opnieuw vastgelegd en nooit vervangen door de eerdere snapshot. Na een pre-dispatchfout wordt `copied` gesynthetiseerd als de tokengebonden refined clipboard nog verifieert; anders wordt het `retained`.

Changed (C1) — Vroege target-freeze — Breid de native Koffi-laag uit met `GetWindowThreadProcessId` en `GetClassNameW`. Foreground tracking bewaart HWND, PID en window class. `prepareCaptureTarget` wist ieder ouder injectiedoel en bevriest deze basisidentiteit vóór overlayweergave en UIA-snapshotting. UIA runtime ID, control type, bounds, process name en host kind zijn best-effort verrijking. Een snapshot-abort kan daardoor geen oud doel hergebruiken, maar levert nog steeds `incomplete` en nooit empty.

Changed (C3, C5, C6, C8) — Single-shot dispatch — Iedere muterende methode meldt `PF_INJECT_DISPATCH_BEGIN=<method>` voordat ValuePattern-set, paste, Unicode-invoer of right-click wordt uitgevoerd. Zodra deze marker is bereikt, mag dezelfde Apply geen tweede insertiemethode proberen. Ontbrekende of gedeeltelijke readback na die handeling wordt `dispatched`. Alleen een methode die aantoonbaar faalt vóór `DISPATCH_BEGIN` mag plaatsmaken voor de volgende geschikte methode. Een tweede dispatch blijft een critical failure.

Changed (C8) — PF_INJECT_VERIFY — Dit blijft een intern bridgeprotocol en wordt geen setting. `full` levert uitsluitend `confirmed` na normale process exit en een gedefinieerde contentmatch: genormaliseerde newline- en zero-width-verwijdering plus exacte match voor tekst tot 2.048 tekens; langere tekst vereist zowel de eerste 200 als laatste 100 tekens zonder tegenstrijdige readback. `partial` en `optimistic` leveren `dispatched`. Een verify-marker zonder normale bridgecompletion mag nooit `confirmed` synthetiseren.

Changed (C6) — Bridge-kill synthesis — Bij inject-deadline of onverwachte process death bepaalt de ontvangen `DISPATCH_BEGIN`-state het resultaat. Zonder dispatch wordt `copied` gesynthetiseerd wanneer de refined clipboard verifieert, anders `retained`. Zodra enige dispatch mogelijk gestart is, wordt het `dispatched`; de overlay sluit, refined blijft op de clipboard en er volgt geen retry. Kill of timeout mag nooit silent success of herstel van de pre-capture clipboard opleveren.

Changed (target protection) — Harde target-resolutie — `Resolve-TargetElement` zoekt een runtime ID uitsluitend onder `AutomationElement.FromHandle(frozenTopHwnd)`, met een begrensde node-scan. De zoekroute vanaf `AutomationElement.RootElement` en iedere fallback naar `AutomationElement.FocusedElement` worden verwijderd. Bounds-resolutie via `FromPoint` is alleen geldig wanneer het gevonden editable element via zijn ancestors aan exact hetzelfde top-HWND behoort, compatible controltype/class heeft en minimaal 50% met de frozen rectangle overlapt. Foreground focus is nooit een substituut.

Changed (target protection) — Changed target — Apply vereist een live HWND met dezelfde PID en class. Exacte runtime ID binnen het frozen venster heeft voorrang; bounds-fallback volgt uitsluitend de bovenstaande ownership-, compatibility- en overlapregels. Terminals vereisen daarnaast een terminalpane binnen frozen bounds. Iedere mismatch stopt vóór dispatch en wordt `copied` of `retained`, afhankelijk van clipboardverificatie.

Changed (C3, C5, C6, C8) — Cursor chat

| Outcome | Cursor-chatmapping |
|---|---|
| `confirmed` | Eén ValuePattern-set of clipboardpaste, gevolgd door `full` composer-readback en normale bridge-exit. |
| `dispatched` | De eerste mutatie is gestart en readback is `partial`, `optimistic` of ontbreekt; ook bridge-kill na `DISPATCH_BEGIN`. Refined blijft op de clipboard. |
| `copied` | Composer/HWND/PID/class/RID/bounds mismatch of bridge-kill vóór dispatch, terwijl refined clipboard verifieert. |
| `retained` | Clipboardpreflight faalt, of een pre-dispatch mismatch/kill wordt gevolgd door mislukte clipboardverificatie. |
| N/A | Snapshot/capture-timeout is `incomplete`, geen InjectResult. Terminal right-click en iedere alternatieve methode na eerste dispatch zijn niet van toepassing. |

Changed (Cursor path) — Cursor capture beperkt terminaldetectie tot het focused element en diens ancestors; whole-window terminal-tree discovery verdwijnt uit het composerpad. Populated composers worden via ValuePattern of TextPattern gelezen en verrijken het reeds frozen basisdoel. Een populated composer die tijdens een niet-geforceerde ronde incomplete of empty oplevert, faalt de gate.

Changed (C3, C5, C6, C8) — Chrome

| Outcome | Chromemapping |
|---|---|
| `confirmed` | Eén clipboardreplacement met `full` ValuePattern- of TextPattern-readback en normale bridge-exit. |
| `dispatched` | Paste is gestart maar readback is `partial`, `optimistic` of niet beschikbaar; ook bridge-kill na dispatch. Geen Unicode-retry. |
| `copied` | Frozen window/control mismatch of bridge-kill vóór paste, met geverifieerde refined clipboard. |
| `retained` | Clipboardpreflight of pre-dispatch recovery kan refined tekst niet bevestigen. |
| N/A | Snapshot/capture-timeout wordt `incomplete`. Native ValuePattern- of Unicode-fallback na een reeds gestarte paste is verboden. |

Changed (Chrome path) — Capture bevriest het focused editable control binnen het Chrome-HWND. Apply gebruikt maximaal één muterende methode. Onleesbare Chromium-content mag alleen `dispatched` opleveren en mag nooit de eerdere clipboardsnapshot herstellen.

Changed (C3, C5, C6, C8) — Word

| Outcome | Wordmapping |
|---|---|
| `confirmed` | Eén writable ValuePattern-set, clipboardpaste of Unicode-dispatch met `full` ValuePattern- of TextPattern DocumentRange-readback en normale bridge-exit. |
| `dispatched` | De eerste mutatie start maar readback is slechts `partial`, `optimistic` of ontbreekt; ook bridge-kill na dispatch. Er volgt geen andere Word-methode. |
| `copied` | Documenttarget mismatch of bridge-kill vóór enige mutatie, terwijl refined clipboard verifieert. |
| `retained` | Clipboardpreflight faalt, of recovery na een pre-dispatch stop kan refined tekst niet bevestigen. |
| N/A | Snapshot/capture-timeout is `incomplete`. ValuePattern is N/A voor rich controls zonder writable pattern; paste/Unicode wordt alleen overwogen zolang nog geen mutatie gestart is. |

Changed (Word path) — Probeer ValuePattern alleen wanneer het resolved control een writable ValuePattern aanbiedt. Rich Word-documentcontrols gebruiken clipboardpaste of Unicode als eerste daadwerkelijk beschikbare mutatiemethode. Verificatie accepteert ValuePattern of TextPattern DocumentRange binnen hetzelfde frozen venster; lange content vereist de vastgelegde prefix- én suffixmatch.

Changed (C3, C5, C6, C7, C8, C10) — Windows Terminal

| Outcome | Windows-Terminalmapping |
|---|---|
| `confirmed` | Eén right-click paste binnen frozen bounds, gevolgd door veilige UIA-readback met `full` match en normale bridge-exit. |
| `dispatched` | Right-click is gestart en UIA-readback is `partial`, `optimistic` of ontbreekt; ook bridge-kill na dispatch. Refined clipboard blijft staan. |
| `copied` | Terminal-HWND/PID/class/bounds mismatch of bridge-kill vóór right-click, met geverifieerde refined clipboard. |
| `retained` | Clipboardpreflight of pre-dispatch recovery kan refined tekst niet bevestigen. |
| N/A | Snapshot/capture-timeout is `incomplete`. Ctrl+C-verificatie, keyboard-copy, Ctrl+V- of Unicode-retry na right-click zijn verboden. |

Changed (WT path) — Capture en Apply-verificatie blijven UIA-only en output blijft single-line. `Try-TerminalPaste` bevat geen clipboard-save/restore-finally meer. Main bezit de clipboard; na optimistic of partial blijft refined staan.

Changed (C3, C5, C6, C7, C8, C10) — Integrated terminal

| Outcome | Integrated-terminalmapping |
|---|---|
| `confirmed` | Eén Ctrl+V replacement in het frozen pane, gevolgd door veilige UIA-readback met `full` match en normale bridge-exit. |
| `dispatched` | Ctrl+V is gestart en readback is `partial`, `optimistic` of afwezig; ook bridge-kill na dispatch. |
| `copied` | Pane/HWND/PID/class/bounds mismatch of bridge-kill vóór Ctrl+V, met geverifieerde refined clipboard. |
| `retained` | Clipboardpreflight of pre-dispatch recovery kan refined tekst niet bevestigen. |
| N/A | Snapshot/capture-timeout is `incomplete`. Right-click, Ctrl+C-verificatie en iedere tweede paste/Unicode-methode zijn verboden. |

Changed (integrated-terminal path) — Detecteer het pane uitsluitend via focused-element ancestry en bewaar hostproces en bounds. Capture en Apply-verificatie gebruiken nooit Ctrl+C of een andere keyboard-copyactie. Safe UIA-readback mag `full` bevestigen; anders blijft het resultaat `dispatched`.

Changed (renderer mapping) — Apply-notices — `confirmed` sluit zonder notice. `dispatched` sluit terwijl refined clipboard behouden blijft. `copied` heropent de editable output met “Insert could not be completed. Refined text is on the clipboard.” `retained` heropent met “Insert could not be completed. Refined text remains here.” Capture `incomplete` gebruikt een afzonderlijke neutrale melding. Alle recoverytekst gebruikt `text-white/45` of equivalente styling, nooit `text-warn`. Controleer in renderer-tests dat de kerntekst op de smalste overlay leesbaar blijft zonder warn-bannerregressie.

Changed (C9) — SLA-klokken en bridgebudgetten — De enige starttijd is het moment waarop de global hotkeycallback vuurt. Glass-visible moet binnen 250 ms vallen. Capture-complete moet vanaf dezelfde start p95 binnen één seconde vallen. End-to-end activation moet binnen twee seconden eindigen. De snapshot krijgt maximaal 650 ms, de slow capture maximaal 250 ms en beide delen samen één gedeelde deadline van 950 ms vanaf hotkey fire; iedere stap ontvangt alleen de resterende tijd. Een snapshot die zijn budget verbruikt start geen extra fallback buiten die deadline en levert `incomplete`.

Changed (C1, C9) — Killgedrag — Snapshot- en captureprocessen worden op hun deadline beëindigd; na 250 ms wordt een nog levende process tree asynchroon geforceerd gestopt zonder overlaydelivery te blokkeren. Onvolledige UIA-state wordt gewist, maar de vroeg frozen HWND/PID/class blijft behouden. Inject houdt een afzonderlijke deadline van 4.000 ms; de daaropvolgende resultaatsynthese volgt uitsluitend de pre- of post-dispatchregels van C6.

Changed (C9) — Hotkeyperformance — Behoud exact prepare en freeze target, show resident shell, snapshot, capture en deliver. Meet de packaged autostart-build tijdens tien volledige Windows boot/login-cycli, niet via een warme `npm run dev`-sessie. De gedeelde capturebudgetten mogen de vastgelegde SLA’s niet optellen of verruimen.

Changed (C1, C2, C4, C5, C6, C10) — Reliability gate — Critical failures zijn een hotkey boven twee seconden, een populated ondersteund control dat in een normale ronde empty of incomplete oplevert, injectie in het verkeerde venster/control, duplicate dispatch/insertion, Ctrl+C of keyboard-copy in een shell, crash, onbruikbare overlay of clipboard clobber zoals opnieuw gedefinieerd: refined tekst ontbreekt na een niet-confirmed Apply zowel uit clipboard als overlay. Bewuste refined retention bij `dispatched` of `copied` is geen clobber. Alleen positief gelezen leegte mag als empty slagen.

Changed (C4) — Success soak — Vereis 50 succesvolle capture/refine/Apply-rondes in Cursor chat, Chrome, Word, Windows Terminal en een integrated terminal, plus 100 extra Cursor-chat-rondes en tien packaged cold-startcycli. Iedere ronde verifieert exact één insertie in het juiste target en het toepasselijke clipboardresultaat. Een `dispatched` ronde telt alleen als de werkelijke enkele insertie extern is bevestigd.

Changed (C4, C5, C6) — Directed fault injection — De release-gate vereist daarnaast geforceerde tests voor wrong target, snapshot-timeout, inject-processkill op 4.000 ms vóór én na `DISPATCH_BEGIN`, clipboard verify failure en een instrumented double-dispatch attempt. Verwachte resultaten zijn respectievelijk geen dispatch plus `copied/retained`, capture `incomplete`, `copied/retained` vóór dispatch, `dispatched` na dispatch, `retained` zonder injectstart en blokkering van de tweede methode. Er mogen nul critical failures optreden. Alleen de success soak uitvoeren is onvoldoende.

Changed (C1–C9) — Automated validation — Voeg unitcoverage toe voor alle CaptureResult-states, bewezen leegte, timeout-is-not-empty, vroeg frozen HWND/PID/class, tokengebonden clipboardownership, alle vier InjectResult-transities, `full/partial/optimistic`-mapping, scoped RID-resolutie, 50%-bounds-overlap, target mismatch, single-shot dispatch, pre- en post-dispatch kill synthesis, Word TextPattern-readback, terminalclipboardgedrag en neutrale renderer-notices. Run daarna de volledige testsuite en production build.

Changed (C7, C8, C10) — Documentatie — Voeg een changelog-entry toe en synchroniseer AGENTS.md plus capture/inject guard comments met het capture-outcomecontract, freeze-before-snapshot, window-scoped target resolution, single-shot dispatch, generation-token clipboardownership en de nieuwe PF_VERIFY-semantiek. Voeg expliciet toe: “Terminal and shell capture and Apply verification are UIA-only; never use Ctrl+C or any keyboard-copy action in a shell.” De verouderde, niet-beschikbare `promptforge-terminal-capture` skill is geen source of truth en wordt niet gebruikt.
