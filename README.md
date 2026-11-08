# Masaya

Espeja y controla dispositivos Android desde el Mac. App nativa en Rust para **macOS 14 o superior en
Apple Silicon**, construida con [NSH](https://crates.io/crates/nsh-core) sobre `crates/masaya-core`, sin
Chromium ni Node. Pensada para QA, sin instalar scrcpy.

> **Windows, Linux y Mac Intel ya no tienen soporte.** La última versión para ellos es la app Electron
> [v0.3.3](https://github.com/momotombodevs/masaya-mirror/releases/tag/v0.3.3), que no recibe más
> correcciones. La decisión está en [ADR-0004](docs/adr/0004-app-nativa-con-nsh.md).

## Qué hace hoy

- **Lista de dispositivos** con su estado (conectado, sin autorizar, desconectado) y qué hacer en cada caso;
  se actualiza sola.
- **Espejo** del teléfono con video H.264 decodificado por hardware (VideoToolbox).
- **Control con mouse y teclado:** toques, arrastre, rueda y trackpad, teclado (incluye acentos y símbolos),
  clic derecho como «Atrás» y clic central como «Inicio».

La app se está portando por fases desde la versión Electron: ventanas por dispositivo, captura, grabación,
APK, portapapeles, audio, Wi-Fi por QR y Ajustes llegan en las fases siguientes
([plan de la etapa 2](docs/plans/etapa-2-nsh.md)).

## Requisitos

| Herramienta                  | Versión             | Para qué                                                  |
| ---------------------------- | ------------------- | --------------------------------------------------------- |
| macOS                        | 14 o superior       | Apple Silicon                                             |
| Rust                         | 1.88 o superior     | Compilar ([rustup](https://rustup.rs))                    |
| adb (Android platform-tools) | cualquiera reciente | Comunicarse con el dispositivo. **La app no lo incluye.** |

En el teléfono: activa las **Opciones de desarrollador** y la **Depuración USB**.

La app busca `adb` en `ADB_PATH`, `ANDROID_HOME`, `ANDROID_SDK_ROOT`, las rutas habituales del SDK y el
`PATH`. La forma más rápida de tenerlo: `brew install android-platform-tools`.

## Empezar

```bash
./scripts/setup-scrcpy.sh   # descarga scrcpy-server si falta y verifica su SHA-256
cargo run -p masaya-nsh     # abre la app
cargo test                  # tests del core y de la app
```

`resources/scrcpy-server/scrcpy-server.jar` ya está en el repositorio; el script lo descarga de la
release oficial de scrcpy solo si falta y falla si el hash no coincide.

| Comando                                                  | Qué hace                                       |
| -------------------------------------------------------- | ---------------------------------------------- |
| `cargo fmt --all --check`                                | Formato (lo mismo que CI)                      |
| `cargo clippy --workspace --all-targets -- -D warnings`  | Lint (lo mismo que CI)                         |
| `cargo test -p masaya-core`                              | Solo el core: funciona en cualquier sistema    |
| `cargo build --release -p masaya-nsh`                    | Binario optimizado en `target/release/`        |

La `.app` firmada y notarizada llega en la fase F5; ver [docs/RELEASING.md](docs/RELEASING.md).

## Cómo está organizado

```
crates/
  masaya-core/   adb y protocolo scrcpy, sin dependencias de interfaz (compila en cualquier sistema)
  masaya-nsh/    la app de macOS: pantallas NSH, vista nativa del espejo y entrada de mouse y teclado
resources/       scrcpy-server.jar que se copia al teléfono
scripts/         setup-scrcpy.sh
docs/            sitio web (inicio y privacidad), arquitectura, decisiones (ADR), planes y publicación
```

Para el detalle, lee [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Solución de problemas

- **«No encontramos adb»:** instala platform-tools o define `ADB_PATH` con la ruta del ejecutable y pulsa
  Reintentar.
- **El dispositivo aparece «Sin autorizar»:** desbloquea el teléfono y acepta el diálogo de depuración USB.
- **«Falta scrcpy-server»:** ejecuta `./scripts/setup-scrcpy.sh`.
