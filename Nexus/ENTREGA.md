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
| H1 | En curso: H1.1–H1.3 implementados; ingreso, roles y READY listos para prueba física | H1.1: 9c0642b; H1.2: 16f2674; commit H1.3 (ver registro) | 3 Nodes simulados con roles/estados independientes; faltan pruebas nativas | Probar roles/READY en LAN; grabación local y reproducción siguen pendientes |
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

### 2026-11-14 · H1.2 · Ingreso real desde las pantallas

Base comprobada antes de editar: árbol limpio, rama `desarrollo`,
HEAD `9c0642b465c65e63fcb76d17ec16ded460ea3aab` y package.json en
`C:\Projects\Nexus\Nexus`. La versión instalada es Expo 54.0.37 con
expo-router 6.0.24; se consultaron la referencia SDK 54 y la documentación
instalada de `useFocusEffect` antes de implementar.

Estado: **listo para prueba física de H1.2**. H1 sigue **en curso**.
La evidencia automática corresponde al commit `feat(studio): connect H1.2 session joining UI`;
obtener el SHA con `git log -1 --format=%H --grep='feat(studio): connect H1.2 session joining UI'`.

- Studio crea sesiones reales y muestra el código recibido del relay. Permite
  introducir el código, solicitar ingreso y ver envío, espera, aceptación o rechazo.
  Muestra identidad local, estado de conexión y mensajes claros ante errores.
- Session confirma su estado con `refreshSession` al recuperar el foco y tiene
  actualización manual. Muestra código, solicitudes individuales al Controller
  y miembros aceptados por deviceId en una colección dinámica. Cada decisión espera
  confirmación del servidor y bloquea la repetición del botón de ese dispositivo.
- Las pantallas usan `getSessionService()` mediante `useStudioSession`, que elimina
  su listener al desmontarse y cancela la suscripción si la identidad termina de
  cargar después del desmontaje. No se dispone el cliente compartido. La conexión
  manual reutiliza `connectSocket`; no se añade otro WebSocket ni se construye
  JSON de protocolo en la interfaz.
- No se modificaron el servicio H1.1, el protocolo, el relay, Firebase, la presencia,
  IP ni PORT. Se conservaron selección, subida, catálogo y visualización de medios
  de la pantalla de sesión, incluso cuando ya no hay membresía de red.
- No se implementaron asignación de roles, READY, cámara ni REC/STOP.
- Validación: `npx tsc --noEmit`, `npm run lint`, ESLint ampliado de las dos
  pantallas y del hook, y `node --test tests/*.test.cjs`: 13/13 pruebas pasan.
  Se ejecutaron con `npx.cmd`/`npm.cmd` en PowerShell y los tests en Git Bash.
  No se añadió una prueba de interacción sintética: las pruebas H1.1 siguen
  cubriendo el servicio y relay, pero no equivalen a ejecutar estas pantallas.
- La comprobación visual no pudo ejecutarse: no hay navegador conectado y el
  navegador integrado respondió `Browser is not available: iab`. No hay evidencia
  de interacción web ni física. La subida/importación real también queda pendiente.

Prueba física exacta (Controller + dos Nodes):

1. Desde la carpeta con package.json, comprobar el SHA con `git rev-parse HEAD`.
   Iniciar `npm run relay` y, en otra terminal, `npx expo start --dev-client --lan`.
   Los tres dispositivos usan el mismo cliente de desarrollo compatible y LAN.
   El operador comprueba manualmente la dirección de `config/server.ts`.
2. Abrir **Studio** en los tres y esperar **Relay: Conectado**. Conservar los tres
   deviceId visibles. En el Controller pulsar **NUEVA SESIÓN**, anotar el código
   mostrado y pulsar **ABRIR SESIÓN**.
3. En cada Node introducir ese código y pulsar **SOLICITAR INGRESO**. Ambos deben
   mostrar solicitud pendiente. En el Controller comprobar dos solicitudes con
   deviceId diferentes; aceptar ambas individualmente.
4. En ambos Nodes comprobar **Ingreso aceptado · Node** y pulsar **ABRIR SESIÓN**.
   Los tres deben mostrar la misma Session y tres miembros separados: un
   Controller y dos Nodes. Comparar los deviceId con los anotados.
5. Volver a Studio y reabrir la Session: debe volver a confirmarse con el relay,
   conservar los miembros reales y seguir mostrando los medios importados.
   Importar un medio de prueba con Cloudinary configurado y abrir su detalle.
6. Para probar rechazo sin otro teléfono: cerrar completamente un Node y esperar
   que desaparezca de la lista del Controller. Reabrirlo, conectar al relay si es
   necesario y solicitar ingreso otra vez; rechazarlo desde el Controller.
   El Node debe mostrar rechazo y permitir otra solicitud. Probar también un
   código de seis caracteres que no corresponda a una sesión activa.
7. Detener el relay: mostrar desconexión sin miembros confirmados. Al intentar
   crear/ingresar debe aparecer un error claro. Reiniciarlo, conectar manualmente
   y crear una sesión nueva (el registro del relay es temporal).

Pendiente de registrar con SHA y dispositivos: ingreso simultáneo en LAN,
aceptación/rechazo visibles, identidades, actualización al reabrir, desconexión,
importación/visualización de medios y arranque sin Firebase en un cliente nativo.
Roles editables, READY y captura siguen fuera de H1.2 y no permiten verificar H1.

Publicación: `git ls-remote --heads origin desarrollo` informó
`a8020ef9e83250bec0ff64ad615d848666163d66`. H1.1 aún es local.
Publicar **H1.1 y H1.2**, junto con su ascendencia (incluye `96eb0d5`), mediante
`git push -u origin desarrollo` desde esta rama. No se ejecutó push ni se cambió main.

### 2026-11-14 · H1.3 · Roles individuales y READY

Base: `desarrollo@16f26743ccc027314bda5871fb32473dc0c75099`, comprobada antes
de editar. El único cambio local previo era `config/server.ts`: se conservó
sin editar y **no se incluye en el commit H1.3**. Paquetes existentes: Expo SDK
54.0.37 y expo-camera 17; se consultó la documentación SDK 54 y el código instalado.

Estado: **listo para prueba física de H1.3**; H1 sigue **en curso**, no verificado.
La evidencia automática corresponde al commit `feat(studio): add H1.3 node roles and readiness`.
Obtener su SHA con `git log -1 --format=%H --grep='feat(studio): add H1.3 node roles and readiness'`.

- El Controller edita un rol por deviceId, sin posiciones ni límite fijo de Nodes.
  El servicio envía `ASSIGN_ROLE` y el Node confirma recepción automáticamente con
  `SESSION_ROLE_ACK`. El relay valida Controller, Session, membresía y destinatario,
  aplica el rol sólo tras ACK y publica el snapshot confirmado. Deduplica por messageId:
  repetir un comando antiguo no revierte un rol posterior. Tras 10 segundos sin
  ACK se rechaza el cambio y el barrido informa timeout; no hay éxito simulado.
- Cada Node informa permiso, disponibilidad y motor preparado mediante `NODE_STATE`.
  El relay sólo admite su propio estado hacia su Controller. READY se deriva de
  permiso concedido + cámara disponible + motor preparado + ausencia de error y
  conexión; no acepta un boolean READY arbitrario. Se muestran razones individuales.
- `CaptureEngine` implementa únicamente preparación: consulta/solicitud de permiso,
  comprobación de disponibilidad y callbacks de CameraView. En Android/iOS la
  disponibilidad queda desconocida hasta `onCameraReady`; `isAvailableAsync` sólo
  se llama en web porque SDK 54 no lo implementa en nativo. La cámara se monta en
  modo vídeo silenciado, sin grabar. Un fallo informa su causa; callbacks y permisos
  tardíos no restablecen READY tras desactivar el motor.
- Al salir de la Session o pasar a segundo plano, el Node publica motor sin preparar
  y libera la cámara. Al volver comprueba permisos de nuevo. Reporta cambios y renueva
  el estado cada 5 segundos. Si deja de renovar, el relay retira READY tras 15 segundos
  más hasta 1 segundo de barrido, aunque aún no haya cerrado TCP. Un cierre elimina
  al Node y publica la nueva lista. El Controller pierde todos los READY al perder
  su conexión. La consulta al recuperar foco de H1.2 sigue usando `refreshSession`.
- Se conserva creación/ingreso, presencia, socket compartido, medios existentes y
  Firebase. No se implementaron grabación, REC/STOP ni nuevas subidas o transferencias.
  El contrato ampliado está en `services/SESSION_CONTRACT.md`.

Pruebas automatizadas: TypeScript, lint, ESLint ampliado y **16/16 tests pasan**.
Los nuevos casos usan tres clientes WebSocket reales contra un relay local efímero:
roles y readiness independientes, tercer Node por el mismo mecanismo, rechazo de
cliente ajeno y rol no autorizado, destino inválido, ACK falso, payload de readiness
contradictorio, aislamiento y desconexión de un Node READY. Una prueba con reloj
controlado cubre estado vencido, ACK ausente/tardío y que no se aplique un rol sin ACK.
CaptureEngine se prueba con adaptadores simulados: permiso denegado, cámara ausente,
fallo de montaje, callback antiguo y permiso que termina después de salir.

La primera ejecución dio 15/16: la aserción de desconexión encontró un snapshot
histórico anterior al tercer ingreso; se corrigió para esperar un snapshot posterior
al cierre. Las 16 pruebas pasan tras la corrección. No hay evidencia física de cámara
ni de interacción con teléfonos; los adaptadores simulados no equivalen a hardware.

Repetir desde la carpeta de package.json (Node 24, Git Bash):

```bash
git rev-parse HEAD
npx tsc --noEmit
npm run lint
node --test tests/*.test.cjs
npx eslint components/NodeReadinessPanel.tsx components/NodeRoleEditor.tsx services/sessionProtocol.ts services/sessionClient.ts services/captureEngine.ts server/sessions.js server/index.js hooks/use-studio-session.ts tests/sessions.test.cjs
```

Prueba física exacta con tres teléfonos (un Controller y dos Nodes):

1. Instalar/abrir el mismo cliente de desarrollo compatible con SDK 54 en los tres.
   Desde la app ejecutar `npm run relay` (reiniciar el proceso anterior) y en otra
   terminal `npx expo start --dev-client --lan`. Usar la LAN configurada manualmente
   por el operador. No hace falta cambiar permisos nativos ni compilar por H1.3.
2. Controller: **Studio → NUEVA SESIÓN → ABRIR SESIÓN**. Ambos Nodes: introducir el
   código en Studio, **SOLICITAR INGRESO**. Aceptar los dos deviceId en el Controller;
   ambos Nodes pulsan **ABRIR SESIÓN**. Anotar Session y los tres deviceId.
3. Controller: en el primer Node escribir `main-camera`, pulsar **ASIGNAR ROL** y
   esperar **Rol confirmado por el Node (ACK)**. En el segundo asignar `side-camera`.
   Cambiar sólo el primero a `detail-camera`: los tres teléfonos deben mostrar el
   nuevo rol del primero y conservar `side-camera` en el segundo.
4. En cada Node, dentro de **Preparación de este Node**, pulsar **COMPROBAR / CONCEDER
   PERMISO** si falta permiso. Esperar preview y READY. Controller y Node deben
   mostrar separadamente permiso granted, cámara disponible y motor preparado.
   No pulsar controles de linterna ni abrir otra cámara durante esta prueba.
5. En un Node volver a Studio o enviar la app a segundo plano. Su estado debe pasar
   a NO LISTO sin cambiar rol ni READY del otro Node. Reabrir Session y comprobar
   que vuelve a preparar cámara y obtiene READY. Denegar el permiso en un Node
   (desde ajustes del teléfono si ya estaba concedido), volver a la Session y comprobar
   **Permiso de cámara denegado**, conservando el estado del otro. Conceder y repetir.
6. Con ambos READY, desconectar la Wi-Fi de uno: el Controller debe retirar su READY
   al cerrar el socket o por caducidad en un máximo aproximado de 16 segundos desde
   su último informe. El otro Node mantiene su estado. Reconectar manualmente y
   solicitar ingreso de nuevo si el relay eliminó la membresía; empieza sin READY.
7. En el Controller volver a Studio y reabrir Session: esperar confirmación del relay
   y comprobar roles/estados reales. Registrar SHA, modelos, permisos, errores de
   montaje y tiempos de retirada de READY. Un cuarto teléfono puede incorporarse
   como tercer Node por el mismo flujo; ese caso ya está cubierto automáticamente.

Pendiente: ejecutar y registrar todos estos pasos físicos, comprobar preparación
nativa y revocación/reconcesión de permisos, error real de cámara y caída silenciosa
de LAN. No afirmar capacidad de grabar/reproducir un archivo ni audio por READY;
la captura y reproducción del clip de H1 siguen sin implementar en este módulo.
