# ADR-0004: Reescribir Masaya como app nativa en Rust con NSH

**Estado:** Propuesta (borrador). Falta la prueba manual de la ventana con ratón y teclado reales.
**Fecha:** 2026-11-07
**Reemplaza a:** [ADR-0003](0003-migracion-a-tauri.md)

## Contexto

Queremos Masaya 100 % en Rust: sin Chromium, sin Node y sin JavaScript. La etapa 1 del spike
(`feature/nsh-spike`, `crates/masaya-nsh`) construyó con NSH 0.4.0 la lista de dispositivos, el mirror
de video H.264 con `AVSampleBufferDisplayLayer` y el control con ratón y teclado, sobre
`crates/masaya-core`. Esta ADR decide con mediciones si seguimos con la migración completa (etapa 2)
o nos quedamos en Electron.

## Cómo se midió

- Mac15,6 (M3 Pro, 18 GB), macOS 27.0, pantalla externa de 2560×1440 a 60 Hz. Samsung S23 Ultra
  por USB con pantalla a 120 Hz. Electron 42.11.15 (build de producción) contra un binario
  `--release` de `masaya-nsh`.
- Las dos apps piden lo mismo: H.264 a 896×1920 (`maxSize` 1920), 16 Mbit/s, sin audio y sin
  sincronizar el portapapeles.
- El mismo input sintético en las dos: 12 arrastres por escenario de un 35 % del alto en 1,5 s
  a 125 movimientos/s, mantenidos 200 ms. Cada ensayo empieza con la pantalla quieta (800 ms sin
  paquetes). En Electron lo envía CDP; en NSH, `MASAYA_BENCH` por el camino real del input. Solo se
  salta el despacho de eventos de AppKit.
- Antes de cada run se abre Ajustes de cero en el teléfono. Un vigilante anota cada segundo la app
  que está delante y descarta el run si no fue siempre Ajustes. Además se aborta si hay otra
  instancia de Masaya o un servidor scrcpy ajeno. Dos runs por app y escenario, en orden alterno.
- CPU con `top` (35 muestras de 1 s): suma del árbol de procesos de la app más
  `VTDecoderXPCService`. Memoria: RSS del árbol.

## Resultados

| Medida | Electron | NSH |
| --- | --- | --- |
| Input → paquete de video, p50 / p95 | 56–57 / 62–67 ms | 49–55 / 60–62 ms |
| Input → cuadro entregado al renderer, p50 / p95 ¹ | 58–60 / 67–70 ms | 56–57 / 63–65 ms |
| FPS del teléfono durante el arrastre | 115,4–115,9 | 115,8–117,5 |
| Refrescos de la pantalla con cuadro nuevo (de 60) | 58,5–58,9 | 58,4–58,6 |
| CPU con la pantalla quieta ² | 5–8 % | 2 % |
| CPU arrastrando ² | 34–36 % | 9 % |
| Memoria (RSS del árbol) | 457–568 MB | 77–87 MB |
| Arranque hasta la primera ventana | 0,6–1,1 s | 0,17–0,45 s ³ |
| Estabilidad, 10 min con swipes cada 3 s | (no repetida, es la app actual) | sin caídas, 0 fallos del renderer, RSS plano 40–54 MB |

1. En Electron es `transferFromImageBitmap` (después de decodificar en WebCodecs); `to_visible` en el
   siguiente rAF suma otros ~8 ms (66–69 ms). En NSH es el contador de cuadros del renderer
   (`loadVideoPerformanceMetrics`): decodifica dentro de AVFoundation y la API pública no expone el
   momento en que se muestra. Ninguna de las dos cifras incluye el compositor ni la pantalla.
2. CPU de NSH sin la sonda de cuadros: la sonda consulta el renderer 500 veces por segundo y
   añade ~13 puntos (17 % en reposo y 22 % arrastrando con ella activa). Electron incluye su
   instrumentación por CDP, que es ligera.
3. Un run de NSH dio 0,73 s.

## Problema encontrado y corregido: App Nap

Con la ventana tapada por otras apps, a los ~40 s macOS ponía el proceso de NSH en App Nap. La tarea
que escribe en el socket de control se despertaba solo cada ~100 ms, con 10–12 mensajes en cola. El
teléfono recibía el input a ráfagas y bajaba de ~118 a ~50 fps. Chromium evita esto en Electron. La
vista del mirror ahora mantiene una actividad `UserInitiatedAllowingIdleSystemSleep | LatencyCritical`
de `NSProcessInfo` mientras existe (`NoNap` en `macos/mirror_view.rs`). Con eso los 12 ensayos se
mantienen en 114–120 fps. Las cifras de arriba son con la corrección.

## Lo que no se midió

- Ratón, trackpad y teclado reales, y la sensación al usarlo. Es la prueba manual pendiente
  (`cargo run -p masaya-nsh`).
- La latencia hasta el fotón (input físico → pantalla). Haría falta una cámara.
- El escenario de rueda: en esta pantalla de Ajustes casi no desplaza en ninguna de las dos apps
  (~10–20 fps), así que no compara nada.
- Wi-Fi, grabación, varias ventanas, Windows y Linux.

## Decisión propuesta

**GO para la etapa 2**, condicionado a que la prueba manual no muestre problemas de input. Con el
mismo stream, NSH iguala la latencia y la fluidez de Electron y usa unas 6 veces menos memoria y unas
4 veces menos CPU mientras se usa. Electron se mantiene como app publicada hasta terminar la migración.

## Consecuencias

- Hay que portar ~13.000 líneas de interfaz de React a NSH: ventana completa del mirror,
  capturas y grabación, Wi-Fi, ajustes e i18n, empaquetado y firma. Después se elimina Electron.
- Solo macOS 14+ en Apple Silicon hasta que NSH madure en Windows y Linux. Es aceptado.
- Para video, NSH depende de APIs de AVFoundation, que no son portables. Cada sistema necesitará su
  propia vista nativa.
- Cualquier vista que haga trabajo en tiempo real tiene que mantener desactivado App Nap mientras
  trabaja.
