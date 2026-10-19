# Manolo Mirror

Espeja y controla dispositivos Android desde el escritorio (macOS y Windows). Pensada para QA:
captura de pantalla, grabación de video y control con mouse y teclado, sin instalar scrcpy.

- **Espejo en ventana propia** por dispositivo, con calidad ajustable (Equilibrada, Alta, Máxima).
- **Control completo:** toques, multitouch, arrastre, rueda, teclado (incluye acentos y símbolos) y
  clic derecho como «Atrás».
- **Captura y grabación** desde la barra del espejo o con atajos.
- **Tema claro/oscuro** y color de acento del sistema.

## Requisitos

| Herramienta                  | Versión             | Para qué                                                  |
| ---------------------------- | ------------------- | --------------------------------------------------------- |
| Node.js                      | 20 o superior       | Desarrollo y compilación                                  |
| pnpm                         | 10                  | Gestor de paquetes (`corepack enable`)                    |
| adb (Android platform-tools) | cualquiera reciente | Comunicarse con el dispositivo. **La app no lo incluye.** |

En el teléfono: activa las **Opciones de desarrollador** y la **Depuración USB**.

La app busca `adb` en `ADB_PATH`, `ANDROID_HOME`, `ANDROID_SDK_ROOT`, las rutas habituales del SDK y
el `PATH`.

## Empezar

```bash
pnpm install        # también descarga scrcpy-server y verifica su hash
pnpm dev            # abre la app con recarga en caliente
pnpm dev:debug      # igual, con DevTools
```

## Scripts

| Comando                                      | Qué hace                                           |
| -------------------------------------------- | -------------------------------------------------- |
| `pnpm check`                                 | Typecheck, lint, formato y tests (lo mismo que CI) |
| `pnpm typecheck` · `pnpm lint` · `pnpm test` | Cada comprobación por separado                     |
| `pnpm format`                                | Formatea con Prettier                              |
| `pnpm build:app`                             | Compila main, preload y renderer (sin empaquetar)  |
| `pnpm build:mac`                             | DMG para Apple Silicon e Intel (solo en macOS)     |
| `pnpm build:win`                             | Instalador NSIS x64 (en Windows)                   |
| `pnpm build:linux`                           | AppImage x64                                       |

Los instaladores quedan en `release/<versión>/`. Detalles de versionado y firma en
[docs/RELEASING.md](docs/RELEASING.md).

## Atajos

| Acción                           | macOS                        | Windows                      |
| -------------------------------- | ---------------------------- | ---------------------------- |
| Actualizar lista de dispositivos | ⌘R                           | Ctrl+R                       |
| Captura de pantalla              | ⌘⇧4                          | Ctrl+Shift+4                 |
| Grabar / detener                 | ⌘⇧5                          | Ctrl+Shift+5                 |
| Abrir espejo                     | Doble clic en el dispositivo | Doble clic en el dispositivo |

En la ventana del espejo, el teclado y el mouse se envían al dispositivo.

## Cómo está organizado

```
src/
  main/       Proceso principal de Electron: adb, sesiones scrcpy, ventanas, menú, IPC
  preload/    Puente seguro: expone a cada ventana solo las llamadas que necesita
  renderer/   Interfaz React + Tailwind: lista de dispositivos y ventana del espejo
  shared/     Tipos y contratos IPC compartidos entre procesos
docs/         Arquitectura, decisiones (ADR), publicación y deuda técnica
```

Para el detalle de flujos y decisiones, lee [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Seguridad

Las ventanas usan `sandbox`, `contextIsolation` y una política CSP; no pueden abrir ventanas ni
navegar fuera de la app. Todo mensaje IPC se valida en el proceso principal y solo la ventana dueña
de un dispositivo puede controlarlo.

## Solución de problemas

- **«ADB no encontrado»:** instala platform-tools o define `ADB_PATH` con la ruta del ejecutable.
- **El dispositivo aparece «Sin autorizar»:** acepta el diálogo de depuración USB en el teléfono.
- **La imagen va con retraso:** baja la calidad a «Equilibrada»; el decodificador descarta cuadros
  antiguos cuando no da abasto.
- **macOS o Windows avisan al abrir la app:** los instaladores aún no están firmados; ver
  [docs/RELEASING.md](docs/RELEASING.md).
