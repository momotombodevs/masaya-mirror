# Publicar una versión

## Pasos

1. Actualiza `version` en `package.json` (por ejemplo `0.4.0`, **sin** prefijo `v`).
2. Asegúrate de que `pnpm check` pasa.
3. Haz merge a `main`, crea y empuja el tag:

   ```bash
   git tag v0.4.0
   git push origin v0.4.0
   ```

4. El workflow **Release** (`.github/workflows/release.yml`):
   - comprueba que el tag coincide con `package.json`;
   - ejecuta typecheck, lint y tests;
   - empaqueta en macOS (DMG `arm64` y `x64`), Windows (NSIS x64) y Linux (AppImage);
   - publica todo en una GitHub Release con notas generadas.

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
