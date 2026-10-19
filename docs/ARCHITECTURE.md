# Arquitectura

Manolo Mirror es una app Electron con tres procesos de código. El video nunca pasa por el proceso de
interfaz principal: viaja por un canal dedicado y se decodifica en la ventana del espejo.

## Vista general

```mermaid
flowchart LR
  subgraph Device[Dispositivo Android]
    S[scrcpy-server]
  end
  subgraph Main[Proceso principal]
    A[AdbService]
    SC[ScrcpyService]
    W[MirrorWindowService]
    H[Handlers IPC + validación]
  end
  subgraph Win[Ventana del espejo]
    P[Preload]
    R[React + WebCodecs]
  end
  A -- adb devices --> Device
  SC -- adb + socket --> S
  SC -- MessagePort: init y paquetes de video --> R
  R -- invoke: control, opciones, captura --> P --> H --> SC
  W -- crea y posee --> Win
```

| Proceso   | Responsabilidad                                                                                         | Código         |
| --------- | ------------------------------------------------------------------------------------------------------- | -------------- |
| Principal | Encontrar `adb`, listar dispositivos, abrir sesiones scrcpy, crear ventanas, menú, diálogos de guardado | `src/main`     |
| Preload   | Exponer a cada ventana solo su parte de la API                                                          | `src/preload`  |
| Renderer  | Lista de dispositivos y ventana del espejo                                                              | `src/renderer` |

`src/shared` contiene lo único que ven los tres: contratos IPC (`*.contract.ts`), el tipo `Result` y los
tipos del espejo.

## Flujos

### Listar dispositivos

`DeviceList` → `useDevices` → `listDevices` (IPC) → `AdbService` ejecuta `adb devices -l` y
`parseAdbDevicesOutput` lo convierte en `AndroidDevice[]`. La lista se refresca al enfocar la ventana, cada
5 s y con ⌘/Ctrl+R.

### Abrir un espejo

1. La lista pide `openMirrorWindow`; `MirrorWindowService` crea una ventana por dispositivo.
2. La ventana pide `openMirror`; `ScrcpyService` sube `scrcpy-server`, arranca el cliente y crea un
   `MessageChannelMain`. Un extremo viaja a la ventana (`mirror:port`).
3. `MirrorStreamSession` envía `init` con el códec y el tamaño, y después cada paquete de video.
4. El renderer mete los paquetes en una **cola acotada** (`packet-queue.ts`) y un `WebCodecsVideoDecoder`
   los dibuja en un `<canvas>`. Si el decodificador va lento, se descartan cuadros hasta el siguiente
   keyframe para que la latencia no crezca.

### Control

`useMirrorInput` traduce eventos del navegador en mensajes (`touch`, `scroll`, `key`, `text`). Los
movimientos se agrupan por puntero y por cuadro de animación (`control-coalescer.ts`). En el proceso
principal, `parseControlMessage` los valida y `ScrcpyService` los ejecuta **de uno en uno por
dispositivo**, para que no se reordenen.

### Cambiar la calidad

`setMirrorOptions` cierra la sesión **sin avisar a la ventana** (`notifyRenderer: false`) y abre otra con
las nuevas opciones. La ventana recibe un puerto nuevo y reinicia el decodificador. Si avisara del cierre,
la ventana se cerraría sola.

## Límites de confianza

El renderer no es de confianza. Cada canal IPC:

1. valida el identificador de dispositivo (`parseDeviceId`);
2. comprueba que quien llama sea la ventana dueña de ese dispositivo (`handleOwnedDevice`);
3. valida el resto del mensaje con reglas numéricas explícitas (`parseNumericFields`): los campos
   obligatorios deben existir y estar dentro de rango.

Además, cada ventana recibe una API recortada (`exposeOnly` en `manolo.api.ts`): la ventana principal
no puede enviar control y la del espejo no puede listar dispositivos.

## Decisiones

- [ADR 0001 — El video viaja por MessagePort y se decodifica en la ventana](adr/0001-video-por-messageport.md)
- [ADR 0002 — Contratos IPC con validación en el proceso principal](adr/0002-validacion-ipc.md)

La deuda técnica conocida está en [TECH_DEBT.md](TECH_DEBT.md).
