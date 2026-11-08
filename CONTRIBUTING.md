# Contribuir a Masaya

Gracias por querer ayudar. Los reportes de errores, las ideas y los PR son bienvenidos.

- **¿Un error o una idea?** Abre un [issue](https://github.com/momotombodevs/masaya-mirror/issues/new/choose)
  con la plantilla que corresponda.
- **¿Una vulnerabilidad?** No la publiques; sigue [SECURITY.md](SECURITY.md).
- **¿Un cambio grande?** Abre primero un issue para hablarlo, así no trabajas en algo que luego no encaja.

## Preparar el entorno

Necesitas un Mac con Apple Silicon y macOS 14 o superior, [Rust](https://rustup.rs) 1.88 o superior y
`adb` (Android platform-tools). Los detalles están en el [README](README.md#requisitos).

```bash
./scripts/setup-scrcpy.sh   # descarga scrcpy-server si falta y verifica su SHA-256
cargo run -p masaya-nsh     # abre la app
```

`crates/masaya-core` (adb y scrcpy) no depende de la interfaz y compila en cualquier sistema con
`cargo test -p masaya-core`; `crates/masaya-nsh` es la app y solo compila en macOS.

Para entender cómo está armada la app, lee [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md), las
decisiones en [docs/adr/](docs/adr/) y el plan en [docs/plans/](docs/plans/).

## Antes de abrir un PR

Ejecuta lo mismo que CI (`cargo fmt --all` corrige el formato si el primero falla):

```bash
cargo fmt --all --check
cargo clippy -p masaya-core --all-targets --locked -- -D warnings
cargo test -p masaya-core --locked
# solo en macOS: la app
cargo clippy -p masaya-nsh --all-targets --locked -- -D warnings
cargo test -p masaya-nsh --locked
```

CI corre el core en Linux y la app en macOS, y los dos jobs bloquean el merge.

Y pruébalo en un teléfono real con `cargo run -p masaya-nsh`: los tests no cubren el espejo ni el
control. En el PR cuenta qué teléfono, versión de Android y conexión (USB o Wi-Fi) usaste.

## Ramas

- Trabaja en una rama propia desde `develop` (`feat/…`, `fix/…`, `docs/…`).
- Abre el PR hacia **`develop`**.
- `develop` → `main` es solo para publicar versiones: el PR debe subir `version` en
  `[workspace.package]` de `Cargo.toml`. El proceso está en [docs/RELEASING.md](docs/RELEASING.md).

## Commits

Usamos [Conventional Commits](https://www.conventionalcommits.org/es/v1.0.0/), con el asunto en inglés y
en imperativo, como el resto del historial:

```
fix(mirror): accept negative pointer coordinates so a drag off the edge still lifts the finger
feat(device): show phones by their marketing name
docs(landing): add Masaya Mirror as alternateName in the app's JSON-LD
ci(release): upload only the Windows installer, not the unpacked exes
```

Tipos habituales: `feat`, `fix`, `perf`, `refactor`, `docs`, `test`, `ci`, `chore`. El alcance
(`mirror`, `device`, `settings`, `landing`…) es opcional.

## Licencia

<!-- TODO: el proyecto aún no tiene licencia elegida; actualizar esta sección cuando se agregue LICENSE. -->

Masaya todavía no tiene una licencia publicada. Hasta que la tenga, abre un issue antes de invertir
tiempo en un cambio grande.
