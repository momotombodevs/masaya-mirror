# Plan de la etapa 2: Masaya nativo con NSH

Plan generado el 2026-11-07 tras aceptar [ADR-0004](../adr/0004-app-nativa-con-nsh.md). Estado: **pendiente de aprobación**.

> **Actualización 2026-11-07:** el usuario decidió retirar Electron ya, en el PR 2 del stack. F6 queda hecha salvo el aviso a usuarios de v0.3.3 y la web, que pasan a F5; el script de scrcpy ya está portado a shell (`scripts/setup-scrcpy.sh`); los runners de macOS pasan a `macos-15`.

Meta: paridad con Electron en macOS 14+ (Apple Silicon) con ~6× menos memoria y ~4× menos CPU; después, retirar Electron.
Éxito: lista de paridad verificada con S23 + emulador; benchmark de ADR-0004 sin regresión (RSS < 150 MB con un espejo, CPU arrastrando ≤ 12 %); beta NSH estable antes de F6.
Fuera de alcance: Windows, Linux, iPhone, Mac Intel; zoom web, DevTools, recarga forzada; vibrancy; recordar posición de ventanas; fallback WebM.

## Hallazgos que afectan al plan

1. `panic = "abort"` en `[profile.release]`: un panic en una tarea cierra la app. Pasar a `unwind` (1.0).
2. `⌘⇧4` / `⌘⇧5` (captura / grabación en `src/main/app-menu.ts`) chocan con atajos del sistema.
3. El audio del teléfono existe en Electron (`mirror-audio.ts`) y no estaba en las fases: entra en F2.
4. H.265 se ofrece en Ajustes; `LayerSink` solo crea formatos H.264.
5. Las ventanas simultáneas por dispositivo ya existen en Electron (`mirror-window.service.ts`): es paridad.
6. `FrameSink::frame` no lleva PTS; la grabación lo necesita.
7. `scripts/setup-scrcpy.mjs` es Node: portarlo antes de F6.
8. Electron escribe `~/Library/Logs/Masaya/main.log`: NSH usará `nsh.log`.

NSH 0.4.0 trae comandos de ventana, menús con atajos, diálogos de archivos, soltar archivos, portapapeles de texto, alertas y componentes base. No trae: varias ventanas (`run_app` abre una; se usa `AppView::new` + `NSWindow` con objc2), persistencia compatible con `settings.json`, actualizador, imagen al portapapeles ni tamaño mínimo de ventana (objc2).

## Fases

| Fase | Resultado                                                                                   | Tamaño   |
| ---- | ------------------------------------------------------------------------------------------- | -------- |
| F1   | Espejo completo en su propia ventana, varios a la vez; cimientos (preferencias, i18n, logs) | ~12 d    |
| F2   | Captura, grabación, GIF, portapapeles, APK, audio                                           | ~10–13 d |
| F3   | Wi-Fi (QR), configurar adb, lista igual que en Electron                                     | ~4 d     |
| F4   | Ajustes, idioma en vivo, diagnóstico, H.265                                                 | ~5–7 d   |
| F5   | `.app` firmada y notarizada, actualizaciones, CI, beta, migración de usuarios               | ~6–9 d   |
| F6   | Borrar Electron y Node, documentación                                                       | ~2 d     |

Spikes en paralelo con F1: S-A captura (`copyDisplayedPixelBuffer` → `VTPixelTransferSession`, plan B decodificar desde el último keyframe), S-B grabación sin recodificar (`AVAssetWriter` passthrough), S-C audio (`AVSampleBufferAudioRenderer`, plan B PCM + `AVAudioEngine`), S-D soltar archivos sobre la vista nativa.

## F1 en porciones

Verificación común: `cargo fmt --all --check`, `cargo clippy -p masaya-nsh --all-targets -- -D warnings`, `cargo test -p masaya-nsh`, `cargo test -p masaya-core`, `tests/real_phone.rs` con el S23 y prueba manual (S23 + emulador arm64).

- **1.0 Integrar el spike en `develop`** (0,5 d): PR de `feature/nsh-spike`; job `nsh` de CI obligatorio; `panic = "unwind"`.
- **1.1 SPIKE varias ventanas** (≤ 1,5 d, ∥ 1.2): `AppView` por `NSWindow` en `macos/windows.rs`. GO si: dos espejos a la vez, componente registrado en cada vista, cierre sin scrcpy huérfano, menú global correcto al cambiar de ventana, la app vive con solo espejos abiertos. Plan B: un proceso por dispositivo. Plan C: una ventana con selector.
- **1.2 Cimientos** (2 d, ∥ 1.1): `settings.rs` (lee y escribe el mismo `settings.json`, conserva claves desconocidas, escritura atómica, `SettingsHub` entre ventanas), `i18n.rs` (es/en/sistema, `match` exhaustivo), `logging.rs` (2 MB × 3, `$HOME` oculto, hook de panic).
- **1.3 Espejo en su ventana + «Reflejando»** (2 d): `OpenMirrors::open_or_focus`, Escape va al teléfono, `⌘W` cierra, `⌘Q` cierra todas las sesiones.
- **1.4 Tamaño de ventana y rotación** (1,5 d): porta `mirror-layout.ts` y sus tests; la ventana sigue al giro del teléfono.
- **1.5 Barra superior, teclas y navegación** (1,5 d): Vol±, Encendido, Rotar, Pantalla completa; Atrás/Inicio/Recientes por el canal ordenado del input; sin botones muertos.
- **1.6 Siempre visible, pantalla completa, mostrar clics** (1 d).
- **1.7 Reconexión automática** (1 d): porta `useReconnect` (12 intentos) y sus tests.
- **1.8 Menú de la app y atajos** (1 d): cada acción de la barra con ítem de menú y atajo (con el foco en el espejo, las teclas van al teléfono).

Salida de F1: S23 y emulador a la vez, rotar, teclas, pantalla completa, siempre visible, desenchufar y reconectar; benchmark sin regresión. (Electron ya no existe en el repositorio: ver la actualización del inicio.)

## Ramas

Una rama `feature/nsh-<fase>-<slug>` por porción desde `develop`, PRs pequeños. Spikes en `feature/nsh-spike-<tema>`. NSH no entra en los artefactos de release hasta F5.

## Revisiones

`reviewer` en cada PR; `ux-reviewer` en F1–F4; `security-reviewer` en F2 (rutas de APK), F3 (adb, vinculación) y F5 (firma, actualizador).

## Decisiones del usuario (2026-11-07)

- **Windows, Linux y Mac Intel:** F6 borra Electron por completo. Esos usuarios se quedan en la última versión de Electron, que mostrará un aviso.
- **Espejos simultáneos:** si el spike 1.1 falla, se usa un proceso por teléfono (plan B).
- **Audio:** bloquea F6.
- **Bundle id:** `dev.momotombo.app.masayamirror` (ya aplicado en `crates/masaya-nsh/src/main.rs` y `nsh.json`). Al ser distinto de `com.masaya.app`, en F5 no hay actualización directa desde Electron: Electron avisa con un enlace a la descarga nativa, y macOS volverá a pedir los permisos.

## Decisiones tomadas por defecto (cambiables)

- Reabrir un dispositivo abierto enfoca su ventana.
- Atajos: `⌘⇧S` captura, `⌘⇧R` grabar; sin atajos de Atrás/Inicio/volumen.
- Grabación: si el teléfono gira, se corta y se guarda; al cerrar la ventana grabando, se guarda.
- H.265 se implementa en F4 (si da problemas, se quita la opción).
- Un PR por porción.
