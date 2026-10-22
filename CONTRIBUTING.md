# Contribuir a Masaya

Gracias por querer ayudar. Los reportes de errores, las ideas y los PR son bienvenidos.

- **¿Un error o una idea?** Abre un [issue](https://github.com/momotombodevs/masaya-mirror/issues/new/choose)
  con la plantilla que corresponda.
- **¿Una vulnerabilidad?** No la publiques; sigue [SECURITY.md](SECURITY.md).
- **¿Un cambio grande?** Abre primero un issue para hablarlo, así no trabajas en algo que luego no encaja.

## Preparar el entorno

Necesitas Node.js 20 o superior, pnpm 10 (`corepack enable`) y `adb` (Android platform-tools). Los
detalles están en el [README](README.md#requisitos).

```bash
pnpm install        # también descarga scrcpy-server y verifica su hash
pnpm dev            # abre la app con recarga en caliente
pnpm dev:debug      # igual, con DevTools
```

Para entender cómo está armada la app, lee [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) y las
decisiones en [docs/adr/](docs/adr/).

## Antes de abrir un PR

```bash
pnpm check          # typecheck, lint, formato y tests (lo mismo que CI)
pnpm format         # si falla el formato, Prettier lo arregla
```

Y pruébalo en un teléfono real con `pnpm dev`: los tests no cubren el espejo ni el control. En el PR
cuenta qué teléfono, versión de Android y conexión (USB o Wi-Fi) usaste.

## Ramas

- Trabaja en una rama propia desde `develop` (`feat/…`, `fix/…`, `docs/…`).
- Abre el PR hacia **`develop`**.
- `develop` → `main` es solo para publicar versiones: cada merge a `main` con una versión nueva en
  `package.json` crea una release. El proceso está en [docs/RELEASING.md](docs/RELEASING.md).

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
