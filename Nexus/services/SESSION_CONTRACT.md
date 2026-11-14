# Contrato de sesiones · H1.1–H2

La sección H2 al final amplía las restricciones históricas de H1: ahora existen
REC/STOP remotos y takeId compartido. No modifica el catálogo de H3.

Entrada de la aplicación: `await getSessionService()` de `services/session.ts`.
Reutiliza `getOrCreateDeviceId()` y el único socket de `services/socket.ts`.
No requiere usuario, Firebase Auth ni RTDB. No construir mensajes en pantallas.

1. Suscribirse con `service.subscribe(snapshot => ...)`; devuelve la baja y entrega el estado actual inmediatamente.
2. Esperar `snapshot.connection === 'Connected'` para enviar. El servicio conecta el socket existente; un envío sin conexión lanza `SOCKET_NOT_CONNECTED`.
3. Controller: `createSession()` devuelve `{ sessionId, messageId }`. Esperar `SESSION_SNAPSHOT`; leer el código de `snapshot.sessions[sessionId].code`.
4. Node: `requestJoin(code)` devuelve `messageId`. Normaliza espacios exteriores y mayúsculas. `SESSION_JOIN_PENDING` contiene el `sessionId` resuelto, `deviceId` y `requestId` (el messageId de la solicitud). Esto aún no concede membresía.
5. Controller: leer `snapshot.pending[sessionId]`; llamar `acceptJoin(sessionId, deviceId, requestId)` o `rejectJoin(...)`. Ambas devuelven el messageId de la decisión. Un snapshot confirma la decisión al Controller; el Node aceptado recibe su primer snapshot, y el rechazado recibe `SESSION_JOIN_REJECTED` relacionado con su solicitud original.
6. `refreshSession(sessionId)` consulta únicamente una sesión de la que el dispositivo ya es miembro.

`getSnapshot()` permite lectura sin suscripción. `lastEvent` contiene la última
respuesta del relay; los listeners reciben cada evento. Los métodos confirman
el **envío**, no la aceptación del servidor. Correlacionar `lastEvent.payload.requestId`
con el identificador devuelto. Los errores de formato local lanzan `INVALID_MESSAGE`.
Las respuestas fallidas llegan como `SESSION_ERROR` con `payload.code`:
`INVALID_MESSAGE`, `IDENTITY_CONFLICT`, `SESSION_EXISTS`, `INVALID_CODE`,
`ALREADY_MEMBER`, `JOIN_PENDING`, `SESSION_NOT_FOUND`, `NOT_MEMBER`,
`CONTROLLER_REQUIRED`, `INVALID_TARGET`.

Los tipos compartidos y validadores están en `sessionProtocol.ts`. Cada Session
tiene exactamente un `controllerId` y `members: Record<deviceId, SessionMember>`.
Cada miembro tiene `deviceId`, `kind` y `role`; cada Node recibe un `nodeId`
único para esa participación. Los Nodes empiezan con rol `unassigned`.
No existe un máximo fijo de Nodes. H1.2 debe renderizar esta colección, no posiciones A/B.
El relay entrega la lista `pending` completa sólo al Controller; los miembros
aceptados reciben el estado de su Session, nunca el de otras sesiones.

Todos los mensajes llevan versión 1, messageId, type, sessionId, senderId,
sentAt y payload; las decisiones requieren targetId = deviceId solicitado.
`SESSION_CREATE` usa un sessionId generado por el servicio; el relay genera el código.
`SESSION_JOIN_REQUEST` usa el identificador reservado `join-by-code` porque aún
no conoce la sesión. Sólo este mensaje admite ese identificador y el relay
resuelve el código antes de entregar la solicitud al Controller. Los demás
mensajes requieren el sessionId real. Los eventos son emitidos por
`nexus-relay` y tienen targetId individual. El cliente valida versión, formato y destino.

El relay vincula senderId a la conexión y rechaza una segunda conexión con
la misma identidad. No permite cambiar identidad durante una conexión.
Sólo el Controller miembro puede aceptar/rechazar una solicitud pendiente
coincidente, con Node conectado. Una aceptación repetida no duplica miembros.
Todo mensaje Studio, desconocido o mal formado se consume antes de presencia
y del broadcast heredado; sólo los tipos heredados existentes sin envelope
Studio pueden continuar por ese camino.

El registro es **en memoria**: reiniciar el relay pierde sesiones y códigos.
Desconectar un Node elimina su membresía/solicitud; desconectar al Controller
cierra sus sesiones e informa `SESSION_CLOSED` a miembros y solicitantes.
El servicio borra estado local al perder conexión; una nueva conexión necesita
crear/solicitar ingreso de nuevo. H1.1 no implementa reconexión automática.
`dispose()` corresponde al propietario del cliente (pruebas); las pantallas
deben dar de baja sólo su suscripción al servicio compartido.

La identidad es declarada por la instalación en una LAN de confianza; no hay
SessionToken, WSS ni autenticación criptográfica de dispositivos en este módulo.
La autorización de sesión es independiente de Firebase. H1.3 añade roles y
preparación individual (ver abajo). La grabación sigue pendiente; no hay START/STOP.

Firebase existente: sin las siete variables públicas completas, los exports
`firebaseApp`, `auth` y `database` son null. La cuenta muestra configuración
ausente y sus operaciones fallan con un mensaje explícito mediante `requireFirebase()`;
el registro de dispositivos no se inicia. Con configuración completa se conserva
la inicialización, persistencia, autenticación y escritura del perfil existentes.

## H1.3 · Roles y preparación individual

Ampliación aditiva del protocolo versión 1. Reiniciar el relay y actualizar todos
los clientes; un Node H1.2 no confirma comandos de rol y produce timeout.

- `assignRole(sessionId, deviceId, role)` envía `ASSIGN_ROLE`, dirigido a un Node
  **aceptado**. Sólo el Controller de esa Session puede enviarlo. El rol es texto
  de 1–64 caracteres, sin controles, recortado por el servicio; no hay posiciones
  A/B ni límite fijo de Nodes. Cada miembro conserva su propio `role`.
- El relay envía el comando únicamente al destinatario. El servicio de ese Node
  valida Controller/membresía/destino y responde automáticamente `SESSION_ROLE_ACK`,
  dirigido al Controller, con `payload.requestId = messageId` del comando.
  Las pantallas no construyen ni confirman envelopes.
- El relay aplica el rol **después del ACK** del destinatario y publica un
  `SESSION_SNAPSHOT` con `payload.requestId` igual al comando original. Ésta es la
  confirmación que muestra la interfaz. Una segunda aceptación del mismo comando
  no vuelve a aplicar el rol; retransmitir un comando antiguo no revierte uno nuevo.
  Reutilizar su ID con otro rol/destinatario da `MESSAGE_ID_CONFLICT`.
- Sólo puede haber un cambio sin ACK por Node (`ROLE_PENDING`). Tras 10 segundos
  sin ACK, el siguiente barrido (cada segundo) informa `ROLE_ACK_TIMEOUT`; no aplica
  el rol y rechaza ACK tardío. Desconectar al Node limpia sus comandos pendientes.
- `reportNodeState(sessionId, controllerId, readiness)` envía `NODE_STATE` únicamente
  desde un Node aceptado hacia su Controller. El sender sólo puede cambiar su propio
  estado; no puede informar por otro Node ni cambiar el rol. El relay publica el
  snapshot de esa Session, manteniendo aisladas las demás.
- `SessionMember.readiness` contiene `cameraPermission` (`unknown/granted/denied`),
  `cameraAvailable` (`null/true/false`), `enginePrepared` (boolean) y `error`
  (`null` o texto de hasta 256 caracteres). Una combinación con motor preparado
  exige permiso concedido, cámara disponible y error null; las demás se rechazan.
  Un miembro sin estado o recién aceptado nunca es READY.
- READY se **deriva**, no se acepta un boolean `ready` del cliente:
  `readinessReasons(readiness, connected).length === 0`. No requiere un rol concreto
  ni READY de los demás Nodes. La UI muestra las razones individuales si no está listo.
- La preparación se informa al cambiar y se renueva cada 5 segundos. El relay usa
  su propio reloj: transcurridos 15 segundos sin estado, el siguiente barrido retira
  `enginePrepared` y muestra estado vencido. Una pérdida silenciosa retira READY en
  un máximo aproximado de 16 segundos desde el último informe. El cierre del socket
  elimina al miembro y lo publica inmediatamente; el cliente Controller desconectado
  limpia sus snapshots. Abrir de nuevo la Session sigue usando `refreshSession`.

`CaptureEngine` prepara permiso y disponibilidad, invalida generaciones antiguas
y procesa `onCameraReady`/`onMountError`. `NodeReadinessPanel` monta una única
CameraView tras conceder permiso, en modo vídeo **silenciado**, mientras la Session
tiene foco y la app está activa. En SDK 54 `CameraView.isAvailableAsync` sólo existe
en web: en Android/iOS disponibilidad y motor sólo se confirman mediante el callback
nativo `onCameraReady`; un error de montaje informa cámara no disponible y su causa.
No se asume disponibilidad a partir del permiso. Salir de Session o pasar la app a
segundo plano publica motor sin preparar y desmonta la cámara. Al volver comprueba
de nuevo los permisos. La prueba no garantiza todavía archivos grabados ni audio:
no hay grabación, REC/STOP ni transferencias nuevas en H1.3.

## H1.4 · Captura y reproducción locales

No amplía el protocolo remoto. Se conservan roles, ingreso y `NODE_STATE`.
El Node aceptado utiliza su sessionId, deviceId y nodeId reales. El Controller no
envía comandos de captura ni recibe archivos en este módulo.

`CaptureEngine` admite un adaptador de grabación/persistencia y expone:

- `start(identity)`: comprueba preparación y vuelve a consultar permiso antes de
  invocar `recordAsync`. Mantiene una sola operación en curso.
- `stop()`: requiere grabación activa; llama a `stopRecording` una sola vez y
  espera la resolución de `recordAsync` antes de guardar. Si falla STOP, conserva
  la operación activa y permite reintentar STOP.
- `retrySave()`: reintenta persistir el mismo clip, sin iniciar otra grabación.
- `getSnapshot()`: fases `idle/preparing/ready/starting/recording/saving/saved/error`,
  `captureError`, `pendingSave` y `lastCapture`. Las promesas de captura completan
  con el resultado en este estado; observar `phase === 'saved'`, no sólo await.
- `getReadiness()`: mantiene el contrato H1.3, pero informa motor ocupado/no READY
  durante inicio, grabación, guardado, error o archivo pendiente. La preparación
  física y el bloqueo de la operación se mantienen separados para no desmontar
  CameraView mientras `recordAsync` sigue activo.

Una actualización de membresía, `refreshSession` o pérdida del relay ya no desmonta
la cámara de un Node que estaba aceptado. Se conserva su identidad para terminar
el clip y se mantiene STOP local; para iniciar otro se exige membresía confirmada.
La navegación de salida se bloquea durante captura/guardado o reintento pendiente.
Al pasar a segundo plano se intenta detener y guardar, conservando la instancia de
cámara hasta finalizar; no se implementa grabación nativa en segundo plano.

`localCaptures.ts` usa las API **asíncronas** de `expo-file-system/legacy`, incluidas
en SDK 54, para no bloquear la interfaz al copiar el vídeo. Escribe primero un
sidecar por clip con sessionId, deviceId, nodeId, id local, takeId **null**, fecha,
bytes esperados, URI local y audio false. No fabrica una Take coordinada.
Luego copia a `documentDirectory/nexus-captures/<sessionId>/<deviceId>/<clipId>/`,
conservando extensión .mp4/.mov. Sólo declara guardado después de comprobar que
el destino existe, es archivo y tiene el mismo tamaño positivo que el original.
Sólo entonces elimina la copia temporal de cámara. Si falla copia/metadatos,
conserva el temporal y permite reintentar; si el origen está vacío o falta, informa
la causa y permite grabar un clip nuevo. Un resultado parcial nunca se muestra
como archivo disponible.

Cada clip tiene su sidecar: no hay un índice compartido que pueda perder resultados
simultáneos. La lista local vuelve a leer metadatos y comprobar archivos al abrir
la misma Session. Resuelve la URI usando el documentDirectory actual del teléfono.
No modifica el catálogo de importaciones ni exige Firebase, red o Cloudinary para
leer/reproducir archivos. El guardado verificado por tamaño no demuestra que el
vídeo se decodifique: la reproducción física sigue siendo evidencia necesaria.

`LocalCapturesPanel` utiliza `expo-video ~3.0.16` con controles nativos y presenta
errores de reproducción. El reproductor se libera al salir o durante una captura.
Se añadió su plugin y se actualizó el texto iOS de permiso de cámara en app.json.
Es necesario **reconstruir e instalar el cliente de desarrollo en los tres equipos**;
una recarga Metro no incorpora ExpoVideo al binario antiguo. Se conserva
`recordAudioAndroid: false`, CameraView usa `mode="video" mute` y no solicita
micrófono. REC/STOP remoto, takeId común, catálogo agregado y subidas quedan pendientes.

## H2 · Toma coordinada

- `startTake(sessionId)` genera takeId y messageId en el Controller y envía
  `START_RECORDING { takeId, targetNodeIds }`. Incluye todos los Nodes aceptados.
  El relay comprueba rol, membresía, destino, conexión y READY reciente con su reloj.
  Rechaza el grupo completo antes de enviar si falta preparación de un destinatario.
  No limita la arquitectura a dos Nodes; dos es el mínimo de la prueba física.
- La lista de participantes de la toma queda congelada por nodeId/deviceId. Un
  ingreso posterior no recibe comandos de esa toma. `stopTake(sessionId)` reutiliza
  el takeId y los mismos participantes, aunque uno ya esté desconectado o haya fallado.
- El relay dirige cada comando exclusivamente a su Node. El servicio del Node
  valida el Controller, Session, nodeId y Take, responde `RECORDING_ACK` con el
  requestId del comando y sólo después entrega a su motor registrado.
  Un ACK significa **recepción**, nunca prueba de grabación ni archivo guardado.
- `coordinateCapture` conecta el servicio a la única instancia CaptureEngine de
  `NodeReadinessPanel`. No crea un socket ni otra cámara. Conserva el STOP local.
  `RECORDING_STATE` informa starting/recording/saving/saved/error, busy y error.
  El estado recording significa que el motor invocó recordAsync con permisos y
  cámara preparada y sigue esperando su resultado; Expo Camera SDK 54 no expone
  un callback público separado de inicio físico. Un rechazo nativo se informa
  como error. Sólo un archivo persistente verificado produce saved, con id,
  bytes positivos y URI local. Ninguno de estos estados certifica decodificación.
- El original y su sidecar conservan sessionId, nodeId, deviceId, takeId y UUID
  local independiente. Los clips manuales H1 con takeId null siguen siendo legibles.
  En el Node se muestra takeId junto al vídeo; el Controller sólo recibe referencias.
  No se transfieren binarios, no se agregan medios a la biblioteca ni se suben capturas.
- El relay registra comandos por Session/messageId. Repetir un ID con otro payload
  se rechaza. Repetir un ID válido reenvía la confirmación/estado sin repetir captura
  ni STOP nativo. Un Take no se puede reiniciar con otro ID; comandos de tomas
  anteriores no se entregan a una toma nueva. El diario del Node vive en el servicio
  compartido, por encima del montaje de la pantalla.
- STOP recibido durante la reconsulta asíncrona de permiso queda pendiente hasta
  que el motor pueda detener. Si falla STOP, el Node permanece ocupado; otro STOP
  deliberado usa un nuevo messageId y puede reintentarlo. Si falla la copia, el Node
  conserva su temporal y usa REINTENTAR GUARDADO sin volver a grabar ni perder takeId.
- El snapshot incluye `session.take.nodes[deviceId]`: ACK REC/STOP, fase, busy,
  error y referencia local. El Controller muestra cada resultado, incluidos fallos
  parciales. Un Node fallido no detiene automáticamente al resto.
- A los 15 segundos sin ACK o sin confirmación de ejecución se muestra incertidumbre,
  sin simular éxito. Un guardado sin progreso por 60 segundos también avisa.
  Las respuestas reales posteriores pueden resolver esos avisos. Un Node desconectado
  queda desconocido; una toma con trabajo pendiente/desconocido bloquea otra REC.
  No hay recuperación automática de membresía ni de estado después de reiniciar el relay.
- Perder la LAN o al Controller no detiene el original. Usar STOP local y reproducir
  en el Node. El relay conserva en memoria sólo la última toma y el diario de IDs;
  el historial de archivos sigue exclusivamente en los teléfonos.

Actualizar relay y los tres clientes juntos. Un cliente H1 no procesa REC/STOP y
provoca falta de confirmación. H2 no añade dependencias ni configuración nativa:
requiere el cliente compatible con ExpoVideo ya definido por H1.4. Las capturas
siguen silenciadas; no se promete sincronización exacta de fotogramas ni audio.
