# Deuda técnica

Prioridad = (Impacto + Riesgo) × (6 − Esfuerzo). Cada valor va de 1 a 5. Estado a 2026-10-19 (tras Electron 42, firma opcional, asistente de adb y pruebas).

| #   | Elemento                                                                         | Tipo            | Impacto | Riesgo | Esfuerzo | Prioridad |
| --- | -------------------------------------------------------------------------------- | --------------- | ------- | ------ | -------- | --------- |
| 1   | Instaladores sin firmar (falta contratar los certificados)                       | Infraestructura | 4       | 4      | 2        | **32**    |
| 3   | `scrcpy-server.jar` versionado como binario en git                               | Infraestructura | 2       | 2      | 2        | **16**    |
| 4   | `MirrorStreamClient` y `mirror-port-delivery` usan estado global por dispositivo | Código          | 3       | 2      | 3        | **15**    |
| 5   | Sin pruebas con un dispositivo real (hay E2E con `adb` simulado)                 | Pruebas         | 3       | 3      | 4        | **12**    |
| 6   | `adb` no se incluye con la app (la app guía a descargarlo o elegirlo)            | Producto        | 2       | 2      | 4        | **8**     |
| 7   | Sin actualización automática                                                     | Infraestructura | 3       | 3      | 4        | **12**    |
| 8   | Canal de audio: el main lo reenvía pero el renderer lo descarta                  | Código          | 2       | 1      | 2        | **12**    |
| 9   | Validadores IPC escritos a mano (sin librería de esquemas)                       | Código          | 2       | 2      | 3        | **12**    |
| 10  | Mensajes de error internos en inglés, sin i18n                                   | Código          | 2       | 1      | 2        | **12**    |

## Avances

### Hecho

- **Electron 42** (antes 30, sin parches). Verificado con typecheck, tests y un arranque real bajo Xvfb.
- **Firma y notarización cableadas:** `electron-builder.json5` y el workflow **Release** firman cuando
  existen los secretos (ver [RELEASING.md](RELEASING.md)). Falta solo conseguir los certificados.
- **Pruebas de hooks** (`useMirrorInput`, `useMirrorDecoder`, `useApkInstall`, `useDeviceKeys`) y de los
  diálogos, con `@testing-library/react`; **E2E** con Playwright contra un `adb` simulado (`e2e/`).

## Plan por fases

### Fase 1 — antes de distribuir fuera del equipo

1. **Conseguir los certificados (1)** de Apple Developer ID y de firma de código de Windows, y cargarlos como
   secretos del repositorio.
2. **Prueba manual guiada por plataforma** con un teléfono: abrir espejo, cambiar calidad, escribir con
   acentos, capturar, grabar, botones de navegación, instalar un APK, conectar por Wi-Fi. Registrar la
   latencia por preset (ver ADR-0001).

### Fase 2 — junto al trabajo de producto

3. **Simplificar el cliente de stream (4).** Sustituir los mapas globales por un contexto de React por
   ventana; la ventana del espejo solo maneja un dispositivo.
4. **E2E con dispositivo (5):** un teléfono o emulador en CI, solo si el costo lo justifica.

### Fase 3 — según la demanda

5. **Audio (8):** o se muestra con un control en la barra y se decodifica, o se elimina de `scrcpy` y de la
   canalización.
6. **Auto-actualización (7)** con `electron-updater` una vez exista firma.
7. **Empaquetar `adb` (6)** si la guía dentro de la app no basta.
8. **Esquemas (9) e i18n (10)** si los mensajes IPC siguen creciendo.
