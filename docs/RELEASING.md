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

## Firma (pendiente)

Los instaladores **no están firmados**. Hasta firmarlos:

- **macOS:** el primer arranque requiere clic derecho → **Abrir**, o permitirla en Ajustes del Sistema →
  Privacidad y seguridad. En Apple Silicon, las apps sin firma pueden requerir además
  `xattr -cr "/Applications/Manolo Mirror.app"`.
- **Windows:** SmartScreen avisa; **Más información → Ejecutar de todas formas**.

Para firmar:

| Plataforma | Qué necesitas                     | Variables de CI                                                                            |
| ---------- | --------------------------------- | ------------------------------------------------------------------------------------------ |
| macOS      | Apple Developer ID + notarización | `CSC_LINK`, `CSC_KEY_PASSWORD`, `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID` |
| Windows    | Certificado de firma de código    | `CSC_LINK`, `CSC_KEY_PASSWORD`                                                             |

Con esas variables, quita `CSC_IDENTITY_AUTO_DISCOVERY: 'false'` del workflow y configura la
notarización según la [documentación de electron-builder](https://www.electron.build/code-signing).

## Icono

`build/icon.png` (1024×1024) se convierte a `.icns` y `.ico` al empaquetar. Para cambiar el icono,
reemplaza ese archivo.

## scrcpy-server

`resources/scrcpy-server/scrcpy-server.jar` está versionado y se verifica por SHA-256 en
`scripts/setup-scrcpy.mjs`. Para actualizarlo, cambia `SCRCPY_SERVER_VERSION` y `SCRCPY_SERVER_SHA256` en
ese script, ejecuta `pnpm setup:tools` y prueba el espejo con un dispositivo real.
