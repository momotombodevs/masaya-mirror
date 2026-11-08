## Qué cambia

<!-- Una o dos frases: qué hace este PR y por qué. Enlaza el issue si lo hay (Closes #123). -->

## Cómo lo probé

<!-- Teléfono, versión de Android, conexión (USB/Wi-Fi) y sistema operativo del equipo. -->

## Checklist

- [ ] La rama base es `develop` (solo los PR de publicación van a `main`)
- [ ] `cargo fmt --all --check`
- [ ] `cargo clippy -p masaya-core --all-targets --locked -- -D warnings`
- [ ] `cargo test -p masaya-core --locked`
- [ ] En macOS: `cargo clippy -p masaya-nsh --all-targets --locked -- -D warnings`
- [ ] En macOS: `cargo test -p masaya-nsh --locked`
- [ ] Probado en un teléfono real con `cargo run -p masaya-nsh`
