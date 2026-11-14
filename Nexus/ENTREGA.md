# NEXUS Studio · Entrega en una jornada

**Resultado esperado.** Un Controller reúne dos teléfonos en una Session, les asigna roles, inicia y detiene una toma, e identifica los dos videos en el catálogo. Cada teléfono conserva su original. Cloudinary recibe las capturas cuando hay Internet.

**Punto de partida.** Base de esta guía: `main@cdbac68`, con NX-002 integrado mediante el PR #2. Ya existen presencia, socket compartido, relay, catálogo local para importaciones y subida a Cloudinary. La pantalla de sesión de esta base es demostrativa. Las pruebas de presencia y notificaciones son el punto de partida para ampliar la cobertura.

| Horas | Hito | Prueba de aceptación |
|---|---|---|
| 1–2 | H1 · Sesión y cámara | Crear una sesión, solicitar ingreso por código con dos teléfonos y aceptar ambos. Asignar un rol a uno y comprobar que el otro conserva el suyo. Mostrar por separado los dos READY con permisos de cámara y motor preparado. Grabar, guardar y reproducir un clip de prueba en un teléfono. |
| 3–4 | H2 · Grabación coordinada | Un REC y un STOP desde el Controller generan dos originales locales reproducibles, uno por Node, con el mismo takeId. Registrar confirmación individual. Reenviar el mismo START en una prueba automatizada y verificar que se inicia una sola grabación. |
| 5–6 | H3 · Catálogo y subida | Ver ambos ángulos bajo una toma en el Controller. Comprobar que el catálogo persiste tras reabrir la aplicación y que un medio importado anteriormente sigue visible. Verificar una subida real y reproducir el recurso remoto. Simular un fallo de subida, comprobar el original y reintentar sin duplicar la captura. |
| 7–8 | H4 · Resistencia y entrega | Durante otra toma, desconectar un Node de la LAN. Comprobar que sigue grabando, detenerlo localmente y reproducir su archivo. El Node conectado responde a STOP. Verificar aislamiento entre sesiones, repetir el recorrido normal y ejecutar TypeScript, lint y tests en el commit candidato. |

**Decisión de la hora 4.** Si falta un video reproducible, registrar en qué Node y en qué paso se pierde, concentrar el trabajo en H2 y actualizar la previsión antes de continuar. WebRTC, multivista, QR, tercer Node, SQLite, temporización START_AT y reconexión automática quedan para después de esta entrega.

## Registro de la jornada

Actualizar después de cada prueba. Usar pendiente, en curso, listo para prueba física, verificado o bloqueado. Anotar el SHA del código probado y conservar la evidencia junto al registro o enlazarla en el PR.

| Hito | Estado inicial | SHA probado | Evidencia que debe registrar el equipo | Fallo o siguiente acción |
|---|---|---|---|---|
| H1 | En curso: H1.1 implementado y probado automáticamente | Commit H1.1 de desarrollo (ver registro abajo) | Contrato y relay con 3 Nodes simulados; falta evidencia física de identificadores, roles, READY y clip | H1.2: pantallas, roles editables, permisos y CaptureEngine |
| H2 | Pendiente | — | takeId, dos Nodes, duración de ambos archivos y confirmaciones | — |
| H3 | Pendiente | — | Toma en catálogo, recurso remoto verificado y resultado sin Internet | — |
| H4 | Pendiente | — | Clip tras desconexión, segunda toma, resultado de cada comando y SHA final | — |

El equipo revisa estos resultados en el PR de `desarrollo` a `main`. Si una prueba queda pendiente, indicar su efecto sobre el uso del producto y conservar el estado real de la entrega.

### 2026-11-14 · H1.1 · Núcleo de sesiones

Implementado únicamente H1.1. H1 permanece **en curso**, sin verificación física.
La evidencia automatizada pertenece al commit `feat(studio): implement H1.1 session core`
en `desarrollo`; obtener su SHA con `git log -1 --format=%H --grep='feat(studio): implement H1.1 session core'`.
No se modificaron IP/PORT ni se construyeron pantallas de sesión/cámara.

- Contrato en `services/sessionProtocol.ts`, cliente independiente del transporte en
  `services/sessionClient.ts` y servicio compartido `getSessionService()` en `services/session.ts`.
  Instrucciones para H1.2 en `services/SESSION_CONTRACT.md`.
- Relay: sesiones y solicitudes en memoria, Controller único, miembros dinámicos
  por deviceId y nodeId por participación. Validación previa al broadcast heredado;
  identidad vinculada a conexión, control de membresía, rol, código y destinatario.
- Pruebas: creación, solicitud/aceptación de tres Nodes en una sesión, rechazo por
  Controller y por código inválido, identidad suplantada/duplicada, cliente ajeno,
  versión/formato inválidos, destinatario incorrecto, aceptación repetida,
  aislamiento de dos sesiones, desconexión y cierre de sesión.
- Firebase bloqueaba la carga sin variables por una excepción durante el import.
  Ahora la configuración ausente/incompleta deja los proveedores en null; la cuenta
  informa la ausencia y el registro remoto queda inactivo. Con configuración completa
  se conservan Auth con persistencia y escrituras RTDB. Pruebas con adaptadores
  simulados cubren ambos caminos; no se probó login contra un proyecto real.
- Resultado: TypeScript y `npm run lint` pasan; 13/13 tests pasan, incluidos los
  anteriores de presencia, socket único y notificaciones. ESLint adicional sobre
  servicios, relay y pruebas pasa. El primer intento con `npx` en PowerShell falló
  por ExecutionPolicy; se usó `npx.cmd`. El lint ampliado detectó `__dirname` en
  las pruebas CommonJS nuevas; se declaró ese global y se corrigió.

Repetición exacta desde la carpeta que contiene package.json, con Node 24 y Git Bash:

```bash
git branch --show-current  # desarrollo
git rev-parse HEAD        # conservar este SHA con el resultado
npx tsc --noEmit
npm run lint
node --test tests/*.test.cjs
npx eslint services/session.ts services/sessionClient.ts services/sessionProtocol.ts services/authService.ts services/deviceRegistry.ts services/firebaseTest.ts server/index.js server/sessions.js tests/sessions.test.cjs tests/firebase-optional.test.cjs
```

Los tests abren relays con puerto efímero y clientes WebSocket reales locales;
no usan Firebase, teléfonos ni el puerto manual del operador.
Pendiente en H1.2: conectar las pantallas a este contrato y probar en LAN con
Controller y al menos dos Nodes físicos, comprobar roles independientes, permisos,
READY y reproducción del clip. Comprobar también el arranque nativo sin variables
Firebase y la cuenta con el proyecto real configurado. No existe aún un recorrido
visual para ejecutar H1.1 desde las pantallas demostrativas.
