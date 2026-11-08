# Publicar una versión

Masaya se distribuye como app nativa de macOS (14 o superior, Apple Silicon). La última versión Electron,
para macOS, Windows y Linux, es la **v0.3.3**; ya no se publican versiones para Windows, Linux ni Mac Intel.

> **Estado:** la `.app` firmada y notarizada, el DMG, la GitHub Release y las actualizaciones automáticas
> llegan en la fase F5 ([plan de la etapa 2](plans/etapa-2-nsh.md)). Hasta entonces no se publica nada
> automáticamente.

## Versión

La versión vive en `[workspace.package]` de `Cargo.toml` (por ejemplo `0.4.0`, **sin** prefijo `v`) y la
heredan los dos crates.

1. En tu rama, sube `version` en `Cargo.toml` y ejecuta `cargo build` para que `Cargo.lock` se actualice.
2. Abre el PR de `develop` hacia `main`. El job **Version is new** de `.github/workflows/rust.yml` falla si
   ya existe el tag `v<versión>`.

## Build de prueba

El workflow **Release** (`.github/workflows/release.yml`) solo se lanza a mano (Actions → Release → Run
workflow). Comprueba la versión con `scripts/check-version.sh` (desde una rama que no sea `main`, que sea
mayor que la de `main`; siempre, que el tag no exista), compila `cargo build --release --locked -p masaya-nsh`
en macOS 15 y sube como artefacto del workflow `masaya-nsh-v<versión>-macos-arm64-unsigned.tar.gz`, **sin
firmar**. No crea tag ni release.

El tarball no tiene carpeta raíz y contiene:

```text
masaya-nsh                                  # el binario, ejecutable
resources/scrcpy-server/scrcpy-server.jar
```

El binario solo busca el jar en `MASAYA_SCRCPY_SERVER`, en `Contents/Resources/` de la `.app` y en el
`resources/` del repositorio donde se compiló, así que fuera de esas rutas no lo encuentra solo. Quien lo
pruebe tiene que indicar la ruta:

```bash
mkdir masaya-nsh && tar -xzf masaya-nsh-v<versión>-macos-arm64-unsigned.tar.gz -C masaya-nsh
cd masaya-nsh
xattr -dr com.apple.quarantine .   # sin firmar: si macOS lo bloquea al abrirlo
MASAYA_SCRCPY_SERVER="$PWD/resources/scrcpy-server/scrcpy-server.jar" ./masaya-nsh
```

En local:

```bash
cargo build --release --locked -p masaya-nsh   # target/release/masaya-nsh
```

El perfil `release` usa LTO, `opt-level = "s"`, `strip` y `panic = "unwind"` (un panic en una tarea no
debe cerrar la app).

## Icono

`build/icon.png` (1024×1024) es la fuente del icono; F5 lo convertirá a `.icns` para la `.app`.

## scrcpy-server

`resources/scrcpy-server/scrcpy-server.jar` está versionado y se verifica por SHA-256 en
`scripts/setup-scrcpy.sh`, que lo descarga de la release oficial de
[Genymobile/scrcpy](https://github.com/Genymobile/scrcpy/releases). Para actualizarlo:

1. Cambia la versión y el hash por defecto en el script (o pruébalo antes con `SCRCPY_SERVER_VERSION` y
   `SCRCPY_SERVER_SHA256`).
2. Borra el jar actual y ejecuta `./scripts/setup-scrcpy.sh`.
3. Actualiza `SERVER_VERSION` en `crates/masaya-core/src/scrcpy/options.rs`: debe coincidir con el jar.
4. Prueba el espejo con un dispositivo real.

## Usuarios de la versión Electron

El bundle id de la app nativa (`dev.momotombo.app.masayamirror`) es distinto del de Electron
(`com.masaya.app`), así que no hay actualización directa: macOS volverá a pedir los permisos. Cómo se avisa a
los usuarios de v0.3.3 se decide en F5.
