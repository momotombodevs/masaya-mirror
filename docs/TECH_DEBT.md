# Deuda técnica

Prioridad = (Impacto + Riesgo) × (6 − Esfuerzo). Cada valor va de 1 a 5. Estado a 2026-10-19.

| #   | Elemento                                                                         | Tipo            | Impacto | Riesgo | Esfuerzo | Prioridad |
| --- | -------------------------------------------------------------------------------- | --------------- | ------- | ------ | -------- | --------- |
| 1   | Instaladores sin firmar (macOS y Windows)                                        | Infraestructura | 4       | 4      | 3        | **24**    |
| 2   | Electron 30 ya no recibe parches de seguridad                                    | Dependencias    | 3       | 4      | 3        | **21**    |
| 3   | `scrcpy-server.jar` versionado como binario en git                               | Infraestructura | 2       | 2      | 2        | **16**    |
| 4   | `MirrorStreamClient` y `mirror-port-delivery` usan estado global por dispositivo | Código          | 3       | 2      | 3        | **15**    |
| 5   | Sin pruebas de los hooks del renderer ni E2E con dispositivo                     | Pruebas         | 3       | 4      | 4        | **14**    |
| 6   | `adb` no se incluye con la app                                                   | Producto        | 3       | 3      | 4        | **12**    |
| 7   | Sin actualización automática                                                     | Infraestructura | 3       | 3      | 4        | **12**    |
| 8   | Canal de audio: el main lo reenvía pero el renderer lo descarta                  | Código          | 2       | 1      | 2        | **12**    |
| 9   | Validadores IPC escritos a mano (sin librería de esquemas)                       | Código          | 2       | 2      | 3        | **12**    |
| 10  | Mensajes de error internos en inglés, sin i18n                                   | Código          | 2       | 1      | 2        | **12**    |

## Plan por fases

### Fase 1 — antes de distribuir fuera del equipo

1. **Firma y notarización (1).** Certificado de desarrollador de Apple y de firma de código para Windows;
   ver [RELEASING.md](RELEASING.md). Sin esto, los usuarios ven avisos de seguridad en el primer arranque.
2. **Actualizar Electron (2).** Subir a una versión con soporte y revisar cambios de `sandbox`, `session` y
   `MessagePort`. Cubrir con los tests de `src/main`.

### Fase 2 — junto al trabajo de producto

3. **Pruebas de los hooks (5).** Empezar por `useMirrorInput` (mapeo de eventos a mensajes) y
   `useMirrorDecoder` (rebind de puerto al cambiar de calidad), con `@testing-library/react`.
4. **Prueba manual guiada por plataforma:** abrir espejo, cambiar calidad, escribir con acentos,
   capturar, grabar, cerrar. Registrar latencia por preset (ver ADR-0001).
5. **Simplificar el cliente de stream (4).** Sustituir los mapas globales por un contexto de React por
   ventana; la ventana del espejo solo maneja un dispositivo.

### Fase 3 — según la demanda

6. **Audio (8):** o se muestra con un control en la barra y se decodifica, o se elimina de `scrcpy` y de la
   canalización.
7. **Auto-actualización (7)** con `electron-updater` una vez exista firma.
8. **Empaquetar `adb` (6)** o añadir una guía de instalación dentro de la app.
9. **Esquemas (9) e i18n (10)** si los mensajes IPC siguen creciendo.
