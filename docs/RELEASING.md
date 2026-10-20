# Publicar una versión

## Pasos

1. En tu rama, actualiza `version` en `package.json` (por ejemplo `0.4.0`, **sin** prefijo `v`).
2. Asegúrate de que `pnpm check` pasa y abre un PR hacia `main`. CI falla si esa versión ya tiene tag.
3. Al hacer merge a `main`, el workflow **Release** (`.github/workflows/release.yml`) se dispara solo:
   - si el tag `v<versión>` ya existe, no hace nada (un merge sin subir la versión no publica);
   - ejecuta typecheck, lint y tests;
   - empaqueta en macOS (DMG `arm64` y `x64`), Windows (NSIS x64) y Linux (AppImage y `.deb`, `x64` y `arm64`);
   - crea el tag sobre el commit del merge y publica todo en una GitHub Release con notas generadas.

Los nombres siguen `manolo-mirror-<versión>-<os>-<arch>.<ext>`.

## Probar el empaquetado en local

```bash
pnpm build:mac     # en macOS
pnpm build:win     # en Windows
```

Cada comando compila la app y empaqueta solo para esa plataforma. `pnpm build:app` compila sin
empaquetar. CI también ejecuta `build:app` en macOS y Windows en cada PR.

## Qué entra en el paquete

Todo el código (main, preload y renderer) lo empaqueta Vite, así que las dependencias de la app van en
`devDependencies`: electron-builder copia `dependencies` a `app.asar` aunque ya estén dentro del bundle. Si
algún día una dependencia se carga en tiempo de ejecución sin pasar por Vite (un módulo nativo), esa sí va
en `dependencies`.

`electronFuses` (en `electron-builder.json5`) desactiva `ELECTRON_RUN_AS_NODE`, `NODE_OPTIONS` y
`--inspect`, y obliga a cargar la app solo desde `app.asar`. La app no se lanza a sí misma como Node; si
eso cambia, revisa `runAsNode`.

## Materiales de ventana

La ventana principal usa `vibrancy` en macOS y Mica en Windows 11 22H2 o superior
(`src/main/system-theme.ts`). En Linux y en Windows anterior se ve el color sólido del tema. Son efectos
del sistema: revísalos a mano en cada plataforma antes de publicar.

## Firma

El workflow **Release** firma solo cuando existen los secretos del repositorio; sin ellos, el instalador
sale sin firmar y el resto del proceso no cambia.

| Plataforma | Secretos del repositorio                                                                           |
| ---------- | -------------------------------------------------------------------------------------------------- |
| macOS      | `MAC_CSC_LINK`, `MAC_CSC_KEY_PASSWORD`, `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID` |
| Windows    | `WIN_CSC_LINK`, `WIN_CSC_KEY_PASSWORD`                                                             |

- `*_CSC_LINK` es el certificado `.p12`/`.pfx` en base64 (o una URL https).
- macOS necesita un certificado **Developer ID Application**. Con los tres `APPLE_*` presentes,
  electron-builder también notariza (`mac.notarize` y el entitlements están en `electron-builder.json5`
  y `build/entitlements.mac.plist`).

### Firmar y notarizar en macOS, paso a paso

Requisitos: una cuenta inscrita en el **Apple Developer Program** (de pago), un Mac y Xcode. Solo el
Account Holder o un Admin del equipo puede crear el certificado. Los nombres de los menús de Apple pueden
cambiar; ante la duda, manda lo que diga el portal.

1. **Crear el certificado.** Xcode → Settings → Accounts → tu Apple ID → **Manage Certificates** → **+** →
   **Developer ID Application** (el de "Apple Distribution" es para la App Store y no sirve aquí).
2. **Exportarlo.** En Acceso a Llaveros → Mis certificados, busca «Developer ID Application: …», clic
   derecho → **Exportar** como `.p12` y ponle una contraseña (será `MAC_CSC_KEY_PASSWORD`).
3. **Pasarlo a base64** (será `MAC_CSC_LINK`):

   ```bash
   base64 -i certificado.p12 | pbcopy
   ```

4. **Datos de notarización.**
   - `APPLE_ID`: el correo de la cuenta de desarrollador.
   - `APPLE_APP_SPECIFIC_PASSWORD`: se crea en appleid.apple.com → Inicio de sesión y seguridad →
     Contraseñas específicas de app.
   - `APPLE_TEAM_ID`: developer.apple.com/account → Membership details (10 caracteres).
5. **Cargar los cinco secretos** en Settings → Secrets and variables → Actions → New repository secret,
   con los nombres de la tabla. Nunca subas el `.p12` ni su contraseña al repositorio; borra el archivo
   local cuando no lo necesites.
6. **Probar.** Publica una versión (ver «Pasos»), descarga el DMG en un Mac que no sea el tuyo y comprueba
   que abre sin aviso de Gatekeeper. Si la notarización falla, el motivo está en el log del job de macOS.

No hace falta subir la app a la App Store para distribuirla así.

- Mientras un instalador salga sin firmar:
  - **macOS:** clic derecho → **Abrir**, o permitirla en Ajustes del Sistema → Privacidad y seguridad. En
    Apple Silicon puede hacer falta `xattr -cr "/Applications/Manolo Mirror.app"`.
  - **Windows:** SmartScreen avisa; **Más información → Ejecutar de todas formas**.

## Icono

`build/icon.png` (1024×1024) se convierte a `.icns` y `.ico` al empaquetar. Para cambiar el icono,
reemplaza ese archivo.

## scrcpy-server

`resources/scrcpy-server/scrcpy-server.jar` está versionado y se verifica por SHA-256 en
`scripts/setup-scrcpy.mjs`. Para actualizarlo, cambia `SCRCPY_SERVER_VERSION` y `SCRCPY_SERVER_SHA256` en
ese script, ejecuta `pnpm setup:tools` y prueba el espejo con un dispositivo real.

## Actualizaciones automáticas

La app usa `electron-updater` con las GitHub Releases como fuente. Cada release publica, además de los
instaladores, los archivos `latest.yml`, `latest-mac.yml`, `latest-linux.yml`, los `.zip` de macOS y los
`.blockmap`; sin ellos las instalaciones existentes no ven la versión nueva.

- Comprueba 10 s después de abrir y cada 4 h, descarga en segundo plano y pregunta si reiniciar. Si el
  usuario elige «Más tarde», se instala al cerrar la app.
- Menú → **Buscar actualizaciones…** hace una comprobación manual (Manolo Mirror en macOS, Archivo en
  Windows y Linux).
- Solo funciona en la app instalada y firmada: en `pnpm dev`, en un `.deb` o fuera de un AppImage el menú
  no aparece. En macOS la actualización exige que el DMG esté firmado y notarizado.
- No borres ni renombres los archivos de una release publicada: las versiones instaladas los leen.
