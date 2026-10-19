# ADR-0001: El video viaja por MessagePort y se decodifica en la ventana

**Estado:** Aceptada
**Fecha:** 2026-10-19

## Contexto

El espejo recibe un flujo H.264/H.265 de scrcpy y debe mostrarlo con baja latencia. El proceso principal
habla con el dispositivo; la interfaz vive en otro proceso.

## Decisión

El proceso principal reenvía los paquetes ya demultiplexados por un `MessageChannelMain` a la ventana, y
la ventana los decodifica con WebCodecs sobre un `<canvas>`. Los comandos (control, opciones, captura)
usan `ipcRenderer.invoke`, no el canal de video.

## Opciones consideradas

### A. Decodificar en el proceso principal y enviar imágenes

| Dimensión      | Evaluación                                       |
| -------------- | ------------------------------------------------ |
| Complejidad    | Alta (sin decodificador de video nativo en Node) |
| Ancho de banda | Alto: cuadros sin comprimir entre procesos       |
| Latencia       | Peor                                             |

### B. Enviar paquetes por IPC normal

Más simple, pero `ipcRenderer.send` serializa cada mensaje por el bus compartido y compite con los
comandos de control.

### C. MessagePort dedicado + WebCodecs (elegida)

| Dimensión      | Evaluación                         |
| -------------- | ---------------------------------- |
| Complejidad    | Media                              |
| Ancho de banda | Bajo: paquetes comprimidos         |
| Latencia       | Baja, con aceleración por hardware |

## Consecuencias

- Más sencillo razonar sobre el video: un canal por sesión, que se cierra con ella.
- La ventana debe rebindar el puerto cuando la sesión se reinicia (cambio de calidad).
- Hace falta control de contrapresión: sin él, un decodificador lento acumula paquetes. Lo resuelve la cola
  acotada del renderer.
- WebCodecs limita los códecs a los que soporta Chromium (H.264 y H.265 según plataforma).

## Pendiente

- [ ] Medir latencia extremo a extremo en dispositivos reales con cada preset de calidad.
