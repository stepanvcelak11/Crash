# TURBO CRASH – 3D dismount physics

Prohlížečový klon *Turbo Dismount* postavený na **Three.js** (WebGL) a **cannon-es** (fyzika).
Žádný build ani instalace – stačí statický hosting (vše včetně knihoven je ve složce `vendor/`).

**Hrát:** https://stepanvcelak11.github.io/Crash/

Lokálně: `python3 -m http.server 8000` a otevřít `http://localhost:8000`.

## Ovládání
| | |
|---|---|
| **Mezerník (držet / pustit)** | nabíjení Power Meteru → odpal. Za jízdy = **DISMOUNT** (vyhození figuríny) |
| **A / D** (nebo šipky) | zatáčení, pokud je zapnuté „Ruční řízení“ |
| **C** nebo **1–4** | kamery: Chase · POV · Fly-by · Free |
| **P** | pauza + replay (scrubber, slow-mo 0.1×–1.0×) |
| **R** | okamžitý restart bez načítání |
| **W / S** (v editoru) | posun kamery po trati |
| **M** | zvuk |

## Novinky (v3)
- **Grafika:** odrazy prostředí na laku (PBR + clear-coat), obloha se sluncem, hvězdami a mraky, FXAA, vignetace / barevný grading, speed lines, voda s animací.
- **Výkon:** cache statického prostředí (úpravy trati jsou okamžité), přeskakování spících těles, dynamické rozlišení, 3 úrovně kvality.
- **Ovládání:** undo (Ctrl+Z), gamepad, pevná síla odpalu, slow-mo při nárazech, nastavení a nápověda (H).
- **+10 vozidel:** Mini, kolo, motorka, letadlo, raketa, sáňky, traktor, autobus, tank, kancelářská židle (celkem 15).
- **+10 map:** Schody, Mrakodrap, Most (voda), Skatepark, Kaňon, Stavba, Pláž (molo + moře), Cukrová země (pružná), Láva, Bowling (celkem 17). Nová překážka: trampolína.

## Novinky (v2)
- **Mobil:** dotykové ovládání (tah = kamera, dva prsty = zoom + posun, tlačítka řízení, velké tlačítko odpalu), spodní panel se záložkami, přepínač kvality, celá obrazovka. Hraj na šířku.
- **Vozidla:** auto, nákupní košík, motokára, dodávka, monster truck (každé má vlastní fyziku, deformaci a barvy).
- **Mapy:** silnice, poušť, led (kluzko), noční město, aréna, propast, Měsíc (nízká gravitace).
- **Kreslení trasy:** záložka Trasa → Kreslit; vozidlo startuje na začátku čáry a samo ji následuje.
- **Překážky kamkoliv:** klepni na zem, pak je přesouvej tahem, otáčej, zvětšuj a zvedej. Rozložení se ukládá pro každou mapu.

## Co hra obsahuje
**Příprava pokusu** – 6 póz (sedící, stojící, Superman, skloněný, salto, vzpažený), umístění (v autě / na střeše / na kapotě / na silnici bez auta), 10 slotů na trati a 6 překážek (můstek, turbo, mina, olej, zeď, píst). Sloty se nastavují klikem do 3D scény nebo na minimapu.

**Fyzika** – rigovaná figurína (17 kostí, kužel-twist klouby), arkádové raycast auto, auto s deformací vrcholů (promáčklé plechy, odpadávající kapota / nárazníky / dveře / kola, tříštící se sklo), betonové zdi se rozpadají na suť.

**Bodování** – zlomeniny a vykloubení podle impulsu a krouticího momentu každé kosti, čas ve vzduchu, salta, bonus za vyhození, poškození auta, destrukce. Při zlomenině blikne **X-Ray** náhled kostry, na konci se zobrazí **heatmapa zranění** (zelená / žlutá / červená).

**Grafika** – dynamické stíny 4096², bloom, motion blur podle rychlosti, částice (jiskry, kouř, prach, střepy, oheň), syntetizované zvuky.

## Struktura
```
index.html, css/style.css
js/engine.js    renderer, post-processing, fyzikální svět, registr entit
js/ragdoll.js   kostra, pózy (FK), klouby, zlomeniny / vykloubení
js/vehicle.js   raycast auto, deformace sítě, odpadávající díly
js/track.js     silnice, scenérie, sloty, překážky, rozbitné zdi
js/fx.js        částice, audio, log efektů pro replay
js/replay.js    záznam 30 Hz + interpolovaný replay
js/main.js      stavový automat, bodování, kamery, UI
vendor/         three.js r160 + cannon-es 0.20 (MIT)
```
