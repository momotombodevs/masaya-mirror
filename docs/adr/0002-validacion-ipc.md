# ADR-0002: Contratos IPC con validación en el proceso principal

**Estado:** Aceptada
**Fecha:** 2026-10-19

## Contexto

El renderer puede ejecutar contenido comprometido (por ejemplo, un bug de XSS). Los mensajes que inyecta
en el dispositivo (toques, teclas, texto) y las rutas de guardado son superficie de ataque.

## Decisión

- Los tipos de cada canal viven en `src/shared/ipc/*.contract.ts`.
- El proceso principal **valida cada payload** antes de usarlo y devuelve un `Result` en lugar de lanzar.
- Los campos numéricos se leen con reglas explícitas: obligatorios salvo que tengan `fallback`, con rango.
- Un canal que apunta a un dispositivo solo acepta a la ventana que lo posee.
- El preload expone a cada ventana únicamente las llamadas que necesita.

## Opciones consideradas

| Opción                              | Ventaja                            | Inconveniente                        |
| ----------------------------------- | ---------------------------------- | ------------------------------------ |
| Confiar en los tipos de TypeScript  | Sin código extra                   | Los tipos no existen en ejecución    |
| Librería de esquemas (Zod, Valibot) | Declarativo, mensajes ricos        | Dependencia nueva para pocas formas  |
| Reglas numéricas propias (elegida)  | Pequeña, sin dependencias, probada | Menos expresiva para formas anidadas |

## Consecuencias

- Fácil de auditar: todo lo que entra pasa por `mirror-parsers.ts` y `device-handler.ts`.
- Si los mensajes crecen en complejidad, conviene migrar a una librería de esquemas.
