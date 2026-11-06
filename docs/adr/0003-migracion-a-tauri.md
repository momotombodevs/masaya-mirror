# ADR-0003: Migrar el proceso principal de Electron a Tauri 2 y Rust

**Estado:** Propuesta (migración por etapas)
**Fecha:** 2026-11-06

## Contexto

Masaya es una app de escritorio con Electron. Casi todo el código (~12.800 de ~16.700 líneas) es interfaz y contratos compartidos. El renderer
decodifica el video con WebCodecs, graba con `MediaRecorder` y codifica GIF con `gifenc`. El proceso
principal (`src/main`, ~3.900 líneas) solo habla con `adb`, con el servidor de scrcpy y con el sistema
operativo. Queremos un binario más pequeño, menos memoria y arranque más rápido, empezando por Windows.

## Decisión

Reemplazar solo el proceso principal por **Tauri 2 + Rust** y conservar la interfaz React tal cual.

- `crates/masaya-core`: adb, protocolo de scrcpy y el contrato de resultados. Sin dependencias de UI, así
  se compila y se prueba en cualquier máquina.
- `src-tauri`: la capa fina de Tauri (ventanas, comandos, menú, actualizaciones).
- El renderer usa un adaptador (`masaya-api.ts`) que elige Electron o Tauri, así ambos conviven mientras
  dura la migración y cada etapa llega a `develop` por separado.

## Opciones consideradas

### A. Tauri con la lógica de scrcpy en un proceso Node auxiliar

Más rápido de migrar, pero se sigue empaquetando Node y el ahorro de tamaño casi desaparece.

### B. Reescribir también la interfaz (Slint, egui, Dioxus)

Máximo "nativo", pero hay que rehacer toda la UI, el decodificador, el audio y la captura. Descartada.

### C. Tauri con el protocolo de scrcpy en Rust (elegida)

| Dimensión      | Evaluación                                                           |
| -------------- | -------------------------------------------------------------------- |
| Complejidad    | Media: la interfaz no cambia; se porta adb y el protocolo (~1.000 l) |
| Tamaño         | Instalador de unos pocos MB, sin Node ni Chromium propio             |
| Riesgo         | Hay que validar el protocolo en teléfonos reales                     |
| Compatibilidad | WebView2 es Chromium: WebCodecs y MediaRecorder siguen funcionando   |

## Consecuencias

- WebKitGTK (Linux) soporta WebCodecs de forma parcial; Linux queda para una etapa posterior.
- El video viaja por un `Channel` de Tauri en lugar de un `MessagePort` (ver ADR-0001).
- La validación de IPC (ADR-0002) pasa a ser el sistema de _capabilities_ de Tauri más los parsers en Rust.
- Hasta que la paridad esté probada en teléfonos reales, Electron sigue siendo el build de producción.
