# Seguridad

## Reportar una vulnerabilidad

No abras un issue público. Repórtala en privado desde GitHub:
**Security → Report a vulnerability**
([enlace directo](https://github.com/momotombodevs/masaya-mirror/security/advisories/new)).

Incluye, si puedes:

- la versión de Masaya y el sistema operativo del equipo;
- qué puede hacer quien la aproveche y en qué condiciones (misma red, acceso al equipo, una APK…);
- pasos para reproducirla o una prueba de concepto.

La idea es responder en unos días, acordar contigo cuándo publicar el detalle y darte crédito en la
release que la corrija, si lo quieres.

## Versiones con soporte

Solo la última versión publicada en
[Releases](https://github.com/momotombodevs/masaya-mirror/releases) recibe correcciones.

## Alcance

Masaya ejecuta código fuera de su propio proceso, así que interesa todo lo que cruce estos límites:

- **adb:** la app ejecuta el `adb` que encuentra en el equipo (o el que eliges) y le pasa comandos
  `shell`. Un argumento que no se escape bien, o un `adb` tomado de una ruta inesperada, es un problema
  de seguridad.
- **scrcpy-server en el teléfono:** la app copia `scrcpy-server.jar` al dispositivo y lo ejecuta con
  permisos de shell de adb. El archivo va en el repositorio y se verifica por SHA-256 al instalar
  (`scripts/setup-scrcpy.mjs`).
- **Conexión por Wi-Fi:** el emparejamiento por código QR y adb por TCP exponen el teléfono en la red
  local mientras están activos.
- **Ventanas e IPC:** las ventanas usan `sandbox`, `contextIsolation` y CSP, y el proceso principal valida
  cada mensaje IPC. Una forma de saltarse eso desde el renderer entra en el alcance.
- **Actualizaciones automáticas:** `electron-updater` descarga desde las GitHub Releases.

Fuera del alcance: fallos de adb, scrcpy o Electron que no dependan de cómo los usa Masaya (repórtalos
en su proyecto), y lo que requiera que el atacante ya controle el equipo o tenga la depuración USB del
teléfono autorizada.
