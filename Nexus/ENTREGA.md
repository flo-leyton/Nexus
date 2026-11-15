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
| H1 | En curso: H1.1–H1.4 implementados, listos para prueba física | H1.3: 6908c17; commit H1.4 (ver registro) | 24 tests automáticos; falta confirmación del usuario de grabación y reproducción reales | Reconstruir clientes y probar clip local; H1 NO verificado |
| H2 | Recuperación de toma interrumpida verificada físicamente por el operador; cierre global pendiente | Base 50bb211 + corrección registrada en historial Git | 42 tests automáticos; operador confirma conservación de vídeos, cierre, reingreso autorizado y nueva grabación en ambos Nodes | Completar evidencias restantes del cierre global de H2; ver registro de recuperación |
| H3 | H3.1–H3.3 implementados, listos para prueba física | H3.1: 4416702; commit H3.2/H3.3 (ver registro) | 58 tests automáticos; pendiente subida y reproducción reales en teléfonos | Ejecutar pruebas A–D con Cloudinary y dos Nodes; H3 no verificado |
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

### 2026-11-14 · H1.4 · Vídeo local del Node

Base comprobada: rama `desarrollo`, HEAD `6908c178ac27cb6b2e8079876a99f31c6fd30b31`.
El único cambio previo era **config/server.ts ya en staging**. Se conserva sin
editar ni incluir en el commit H1.4, también sin alterar su estado de staging.
La evidencia corresponde a `feat(studio): implement H1.4 persistent local video`;
obtener el SHA con `git log -1 --format=%H --grep='feat(studio): implement H1.4 persistent local video'`.

Estado: **listo para prueba física**, H1 sigue **en curso**. No marcar verificado
hasta que el usuario confirme que grabó y reprodujo un vídeo en un teléfono real.

- CaptureEngine gestiona preparación, reconsulta de permiso al iniciar, una única
  grabación local, STOP, espera del archivo de cámara, persistencia y errores.
  Las fases visibles distinguen preparación, cámara lista, inicio, grabando,
  guardando, archivo disponible y error. Un fallo de STOP permite volver a pulsarlo.
- Un fallo de copia o metadatos conserva el temporal y ofrece **REINTENTAR GUARDADO**
  para el mismo clip, sin volver a grabar. Si el origen falta o está vacío, informa
  la causa y permite preparar/grabar otro. No acepta START/STOP duplicados.
- Se escriben primero metadatos por clip, con sessionId, deviceId y nodeId reales,
  identificador de clip local, takeId null (sin toma coordinada), URI y bytes esperados.
  Luego se copia el vídeo a documentDirectory/nexus-captures. Sólo se muestra como
  archivo disponible después de verificar existencia y tamaño positivo igual al
  original. Se conserva .mp4/.mov y se elimina el temporal sólo tras esa validación.
  Cada clip tiene su propio sidecar; dos resultados no sobrescriben un índice común.
- La lista de vídeos locales relee metadatos y verifica los archivos al reabrir la
  misma Session, y antes de reproducir. ExpoVideo reproduce el archivo en el teléfono
  con controles nativos y muestra sus errores. Esta lista no modifica el catálogo
  de medios importados ni sube archivos. Persistencia significa almacenamiento de la
  app; desinstalar/borrar datos de la app elimina esos originales.
- READY usa el estado real H1.3, pero informa motor ocupado/no listo durante captura,
  guardado y errores. Perder conexión o actualizar la Session no desmonta la cámara
  de un Node ya aceptado: conserva STOP local y su identidad hasta terminar. No
  inicia otro clip sin membresía confirmada. La navegación de salida se bloquea
  mientras haya captura/guardado/reintento pendiente. Pasar a segundo plano intenta
  detener y guardar; no se implementa grabación nativa de fondo.
- Se conservan el socket, relay, presencia, roles e ingreso 1→N; no se construyen
  envelopes nuevos para capturar. No hay REC/STOP remoto, takeId común, catálogo
  agregado ni nuevas operaciones Cloudinary. La importación anterior sigue intacta.

API consultadas de la rama oficial SDK 54:
[Camera](https://raw.githubusercontent.com/expo/expo/sdk-54/docs/pages/versions/v54.0.0/sdk/camera.mdx),
[FileSystem](https://raw.githubusercontent.com/expo/expo/sdk-54/docs/pages/versions/v54.0.0/sdk/filesystem.mdx),
[FileSystem legacy](https://raw.githubusercontent.com/expo/expo/sdk-54/docs/pages/versions/v54.0.0/sdk/filesystem-legacy.mdx)
y [Video](https://raw.githubusercontent.com/expo/expo/sdk-54/docs/pages/versions/v54.0.0/sdk/video.mdx),
contrastadas con las declaraciones instaladas. Para copias asíncronas se usa la
entrada soportada `expo-file-system/legacy`; reproducción con `expo-video ~3.0.16`.

**Cambio nativo:** se añadió ExpoVideo y su plugin. También se actualizó el texto
iOS del permiso de cámara para describir Studio. `recordAudioAndroid` sigue en
**false**, CameraView usa **mode video + mute**, y no se solicita micrófono.
Hay que **reconstruir e instalar el cliente de desarrollo en los tres teléfonos**;
el cliente anterior no contiene el módulo nativo ExpoVideo y recargar Metro no lo
instala. No se ejecutó ninguna compilación EAS ni se instaló nada en teléfonos.

Validación automática final: TypeScript pasa, lint pasa sin advertencias, ESLint
ampliado pasa y **24/24 tests pasan**, incluidos todos los anteriores. Ocho tests
nuevos cubren transiciones y READY ocupado, dobles controles, STOP fallido,
revocación de permiso, fallos nativos, error de cámara durante la reconsulta de
permiso, falta de URI, archivo vacío/incompleto, reintento y parada al desactivar.
El adaptador FileSystem de pruebas usa disco real en un directorio temporal y
comprueba metadatos/copia, conservación del origen ante fallos, clips independientes,
descubrimiento tras recargar el servicio y nueva verificación antes de reproducir.
Esto NO prueba codificación, decodificación ni duración de un vídeo nativo.

El bundle JavaScript Android se exporta correctamente (1554 módulos). El primer
intento de Metro con varios workers agotó memoria; pasó con `--max-workers 1`.
También hubo un intento de lint sin memoria; el reintento secuencial final pasó.
Una prueba inicial de archivo inexistente usaba una URI sin ruta absoluta Windows;
se corrigió para usar pathToFileURL. No quedan fallos automáticos pendientes.

Repetir desde `Nexus/`, con package.json y Node 24 (Git Bash):

```bash
git rev-parse HEAD
npx tsc --noEmit
npm run lint
node --test tests/*.test.cjs
npx eslint components/LocalCapturesPanel.tsx components/NodeReadinessPanel.tsx services/captureEngine.ts services/localCaptures.ts types/capture.ts tests/capture-engine.test.cjs
npx expo export --platform android --output-dir .expo/h14-export --max-workers 1
```

Prueba física exacta, un Controller y dos Nodes:

1. Antes de abrir H1.4, crear el cliente actualizado con
   `npx eas-cli build --platform android --profile development` e instalar el APK
   en los tres teléfonos. Si se usa iOS, construir con `--platform ios --profile development`
   e instalar en los dispositivos registrados. Esta compilación debe incluir ExpoVideo.
2. Comprobar SHA y dirección manual del relay. Ejecutar `npm run relay` y, en otra
   terminal, `npx expo start --dev-client --lan`. Abrir el cliente nuevo en los tres,
   en la misma LAN. Controller: Studio → NUEVA SESIÓN → ABRIR SESIÓN. Ambos Nodes:
   código → SOLICITAR INGRESO; Controller acepta cada deviceId; ambos abren Session.
3. En cada Node conceder permiso de cámara con **COMPROBAR / CONCEDER PERMISO**.
   Esperar preview y **Cámara lista / READY**. Anotar sessionId, nodeId y deviceId.
   Denegar permiso en uno debe impedir grabar, sin cambiar el estado del otro.
4. En el primer Node pulsar **GRABAR VÍDEO SIN AUDIO**. Esperar **Grabando**, grabar
   5–10 segundos y pulsar **DETENER Y GUARDAR**. Debe mostrar **Guardando archivo**
   y luego **Archivo disponible**, con tamaño positivo en **Vídeos locales de este
   dispositivo**. Durante el clip el Controller muestra ese Node no listo/ocupado.
5. Pulsar **REPRODUCIR VÍDEO LOCAL** y ▶ en los controles del reproductor. Comprobar
   imagen en movimiento, duración razonable y ausencia de audio. Cerrar reproductor,
   volver a Studio y reabrir la MISMA Session: el vídeo debe seguir en la lista y
   reproducirse. Grabar otro clip y comprobar que el primero se conserva.
6. Repetir grabación/guardado/reproducción en el segundo Node apuntando a otra escena.
   Los vídeos son independientes y se reproducen en su teléfono; el Controller no
   recibe un catálogo agregado en H1.4. Comprobar también una importación anterior.
7. Opcional de resistencia: durante otro clip quitar la Wi-Fi de un Node sin salir
   de la pantalla. Debe poder usar STOP y guardar/reproducir localmente. Volver a
   conectar y solicitar ingreso si el relay eliminó su membresía. La pérdida de red
   no es una orden local de parada; enviar la app a segundo plano sí intenta STOP.

Pendiente físico: compilación/instalación del cliente, permisos reales, codificación
silenciada, latencia de STOP, archivo reproducible con duración válida, reapertura
de pantalla, segunda captura y continuidad local sin relay. Registrar SHA, modelo/OS,
tamaño, duración, audio ausente y cualquier error. Hasta recibir esa confirmación,
**H1 no está verificado**.

### 2026-11-14 · H2 · Grabación coordinada

Base `desarrollo@10c7c15`. Se confirmó exclusividad de esta sesión antes de editar.
Se preservaron los cinco documentos locales pendientes y la IP del relay; no se
aplicaron stashes, no se modificó Firebase y no se implementó H3.
Se ejecutó npm ci para instalar expo-video ya fijado por H1.4; manifest/lockfile
no se actualizaron. Persisten las advertencias de auditoría npm anteriores.

Implementado: REC/STOP de Controller, takeId común, fan-out a Nodes aceptados y
READY, ACK individual de recepción y estados separados del motor y archivo.
CaptureEngine guarda originales independientes con takeId; se conserva captura
manual, lectura de clips H1 y STOP local. Se validan pertenencia, rol, destino,
formato y correlación de comandos/reportes. Deduplicación en relay y cliente;
retransmitir no reinicia la cámara y no detiene una toma posterior. Fallos de un
Node se muestran por separado; la toma sana puede finalizar y guardarse.
Detalle del protocolo y límites: `services/SESSION_CONTRACT.md`, sección H2.

Validación técnica: TypeScript PASS, npm run lint PASS, pruebas **32/32 PASS**.
La cobertura nueva usa WebSocket local real y CaptureEngine con adaptador de
cámara simulado; la persistencia de sidecars se prueba en disco temporal real.
Incluye REC/STOP y IDs compartidos, duplicados antiguos/actuales, STOP durante
permiso pendiente, error nativo/STOP/guardado, reintento local, desconexión,
aislamiento, reportes falsos, READY insuficiente y ACK sin ejecución.
No hay evidencia física de estos cambios y no se marca H1 ni H2 verificado.
La prueba física de desconexión de un Node durante REC sigue **PENDIENTE**;
las pruebas automatizadas con adaptadores no sustituyen esa evidencia.
ESLint ampliado sobre todos los archivos H2 pasa. La exportación Android con
un worker genera bytecode Hermes (1556 módulos); el primer intento dentro del
sandbox falló con spawn EPERM al ejecutar Hermes y pasó fuera del sandbox.
El primer acceso a caché Metro avisó de datos no deserializables y rehizo el escaneo.

Prueba física H2 (Controller + dos Nodes):

1. Instalar en los tres un cliente compatible con SDK 54 y ExpoVideo de H1.4.
   No iniciar un build sólo por H2: no cambió configuración nativa. Registrar
   SHA base y diff H2 hasta que el equipo revise/autorice el commit candidato.
2. Reiniciar `npm run relay` con el código H2. En otra terminal de la aplicación:
   `npx expo start --dev-client --lan`. Comprobar manualmente la IP ya configurada.
   Recargar los tres clientes; misma LAN y pantallas en primer plano.
3. Controller: crear Session. Nodes: solicitar ingreso por código y abrir Session
   después de aceptación. Escribir roles distintos en los campos de texto y
   confirmar. Conceder cámara y esperar ambos READY y previews.
4. Controller: pulsar **REC · TODOS LOS NODES** una vez. Registrar takeId y
   comprobar ACK REC y estado de motor por separado en ambos Nodes. Los dos
   muestran la toma y Grabando; ningún ACK por sí solo equivale a vídeo válido.
5. Esperar 5–10 segundos con escenas distintas; pulsar **STOP · FINALIZAR TOMA**.
   Comprobar ACK STOP y luego **Archivo guardado en el Node** para cada uno,
   con IDs/URIs independientes, bytes positivos y el mismo takeId.
6. En cada Node pulsar **REPRODUCIR VÍDEO LOCAL** y ▶. Registrar imagen en
   movimiento, duración razonable, tamaño y ausencia de audio. Volver a Studio y
   abrir la misma Session; comprobar que ambos originales siguen en su teléfono.
   Una nueva REC debe usar otro takeId y no borrar archivos previos.
7. Fallos: denegar permiso en uno antes de REC debe impedir iniciar el grupo.
   Recuperar permisos/READY. Durante otra toma desconectar un Node de la Wi-Fi:
   el Controller informa resultado desconocido para ese Node; STOP finaliza el
   conectado. En el desconectado usar STOP local y comprobar original reproducible.
   Para otra toma tras pérdida de membresía puede ser necesaria una Session nueva.

Si falla, informar versión/diff o SHA, modelo/OS, Session/takeId/nodeId, acción,
ACK, fase/error y archivos existentes. No borrar datos ni reinstalar la aplicación
para probar persistencia. La prueba de START duplicado es automatizada; no hace
falta fabricar mensajes desde la UI. No certificar sincronización exacta, video
decodificable ni tolerancia de hardware hasta ejecutar estas pruebas.

### 2026-11-14 · Reingreso explícito sin volver a escribir el código (etapa 1)

Implementación sobre H2 (ver historial Git). Se conserva el socket,
la configuración de LAN, REC/STOP y los originales. Se añade recuerdo persistente
de la última Session aceptada como Node y un botón SOLICITAR REINGRESO en Studio
y Session sin membresía. La conexión al relay sigue siendo manual.
El Controller debe aprobar otra solicitud; después hay nuevo nodeId, rol
unassigned y READY recalculado. No se implementan credenciales ni recuperación
transparente. Detener/guardar primero una captura local antes del reingreso.

El mismo SESSION_JOIN_REQUEST se fija al sessionId recordado para evitar entrar
por accidente a otra sesión si el código se reutilizó. La Session cerrada informa
su ausencia y permite ingresar mediante otro código. Se bloquean pulsaciones
duplicadas y no se carga ninguna membresía desde almacenamiento local.

Pruebas nuevas: desconexión/recarga y nueva aceptación; deduplicación; nuevo nodeId
con preparación reiniciada; rechazo/reintento; cierre; ID/código incompatibles;
persistencia/corrupción/errores de almacenamiento y actualización de una sesión
antigua sin sobrescribir la más reciente. Suite completa: **38/38 PASS**.
Validación física de esta etapa: **NOT RUN**; no marcarla verificada.

Prueba física con Controller y dos Nodes:
1. Reiniciar relay con este código, recargar los tres clientes y crear/aceptar ambos
   Nodes. Anotar deviceId, nodeId y Session. Ambos deben preparar cámara y READY.
2. Sin grabación activa, apagar Wi-Fi de uno y esperar su eliminación en Controller.
   Volver a encender Wi-Fi y pulsar CONECTAR AL RELAY. No se restaura membresía.
3. Pulsar SOLICITAR REINGRESO sin escribir código. Controller debe mostrar una sola
   solicitud del mismo deviceId. Antes de aceptarla, el Node no pertenece a Session.
4. Rechazar y repetir; después aceptar. Comprobar nuevo nodeId, rol unassigned y
   preparación nueva, sin duplicar miembros ni afectar al segundo Node.
5. Cerrar/reabrir la app sin borrar sus datos: el recuerdo debe seguir disponible
   si perdió membresía. Cerrar el Controller o reiniciar relay mientras el Node está
   offline; al reconectar/solicitar debe indicar Session inexistente y permitir otro código.
6. Comprobar que los vídeos anteriores siguen disponibles localmente. No repetir
   START automáticamente ni atribuir los vídeos antiguos a la participación nueva.

### 2026-11-14 · H2: cierre de toma interrumpida

Fallo físico reportado: tras desconexión durante REC y reingreso con nuevo nodeId,
la toma antigua bloqueaba la siguiente REC. Implementado cierre explícito con
confirmación en Controller y autorización en relay. Exige STOP previo, resultado
terminal sin busy en participantes originales alcanzables y READY reciente si el
dispositivo ya reingresó. El ausente sigue no confirmado: no se fabrican ACK ni
archivo, no se envía START y no se detiene su cámara mediante el cierre.

Se conservan toma, identidades, ACK, errores y referencias en el historial de la
Session en memoria. STOP repetido no reinicia confirmaciones. La participación
nueva no hereda bloqueos de su nodeId anterior. Sin cambios de LAN, dependencias,
Firebase, reconexión automática o almacenamiento de vídeos.

Prueba física de recuperación: **PASS**, según confirmación del operador recibida
el 2026-11-14. Sobre la base `50bb211` más esta corrección, MAIN y SIDE conservaron
sus vídeos; el Controller cerró la toma interrumpida; SIDE reingresó con aprobación;
ambos grabaron otra vez en la misma Session. La toma anterior permaneció en el
historial con sus resultados no confirmados. Evidencia: reporte del operador en
esta conversación; Codex no ejecutó ni observó directamente la prueba física.
El commit que contiene este registro identifica el código de la corrección.

Esta evidencia verifica la recuperación descrita, no acredita por sí sola todos
los criterios de cierre de H2/H4. El operador no aportó modelos, IDs concretos,
metadatos de reproducción ni confirmación de cada variante negativa del protocolo
de prueba siguiente; esos detalles y variantes siguen pendientes de registrar.
Validación automatizada: TypeScript PASS, lint PASS, ESLint ampliado PASS y
suite completa 42/42 PASS (relay WebSocket local y cámara simulada; sin hardware).
Procedimiento para reproducir y ampliar la evidencia con relay y tres clientes actualizados:
1. Crear Session, aceptar MAIN/SIDE, preparar ambos y pulsar REC una vez.
2. Desactivar Wi-Fi de SIDE durante REC; comprobar que sigue grabando localmente.
   Pulsar STOP en Controller: MAIN debe guardar; SIDE no debe recibir STOP ACK ficticio.
3. Intentar cerrar mientras MAIN siga activo/guardando: el relay debe rechazar.
   En SIDE usar STOP local y reproducir el original sin red.
4. Esperar archivo confirmado en MAIN. Pulsar CERRAR TOMA INTERRUMPIDA y confirmar
   la advertencia. Revisar takeId, ACK y resultado no confirmado de SIDE.
5. Reconectar SIDE, solicitar reingreso, aprobarlo y preparar su nodeId nuevo.
   También repetir el caso reingresando antes de cerrar: el cierre exige READY nuevo.
6. Pulsar REC de nuevo en la MISMA Session: takeId nuevo, dos grabaciones, STOP y
   reproducción de ambos originales. Revisar historial y reproducir el clip offline
   anterior: debe conservar takeId/nodeId antiguos y no haberse sobrescrito.
7. Repetir dejando SIDE desconectado: cerrar permite otra toma solo con MAIN READY,
   manteniendo visible el resultado desconocido de SIDE. No borrar datos ni reiniciar
   el relay para liberar la toma. Registrar SHA base + diff, modelos, IDs y evidencia.

### 2026-11-14 · H3.1 · Catálogo persistente de capturas locales

Base comprobada antes de editar: `desarrollo@541bc389aac56e927f3102165eac6e688af4e9d1`.
`git ls-remote --heads origin desarrollo` confirmó el mismo SHA publicado.
El único cambio previo era `config/server.ts`: se conserva sin editar ni incluir
en el commit. No se modifican stash ni documentos personales.

Se leyó **NEXUS_H2_Entrega_DevA_2026-11-14.md**, proporcionado por el usuario en
esta conversación. Sus pruebas físicas de H2 se aceptan como evidencia del operador.
La nota del informe sobre cierre aún sin commit/push quedó resuelta comprobando
`541bc38` en local y remoto. No se vuelve a implementar ni alterar ese cierre.

Estado: **listo para prueba física de H3.1**; H3 sigue **en curso**, no verificado.
La evidencia automática corresponde a `feat(media): add H3.1 persistent local capture catalog`;
obtener el SHA con `git log -1 --format=%H --grep='feat(media): add H3.1 persistent local capture catalog'`.

- Incompatibilidad resuelta: NexusMediaAsset exigía publicId/URL para todo medio.
  Ahora distingue remotos con referencias reales y capturas con sessionId, takeId,
  deviceId, nodeId, localId, URI y bytes. Mantiene manuales H1 con takeId null y tomas H2.
- Al consultar Medios/detalle reconstruye el catálogo desde los sidecars de todas
  las sesiones de este teléfono, sin exigir una Session viva. Verifica archivo y
  tamaño; si falta/está incompleto conserva metadatos y muestra no disponible.
  Vuelve a verificar justo antes de reproducir.
- Cada clip tiene identidad estable sessionId + deviceId + id local y una clave
  AsyncStorage propia. Reincorporar no duplica ni reinicia upload. Las escrituras
  de esa clave se serializan; Nodes/tomas distintos no sobrescriben una lista común.
  Las importaciones mantienen su clave, cargan sin migración destructiva y también
  serializan escrituras concurrentes, conservando los registros existentes.
- Disponibilidad local es independiente de upload: local/queued/uploading/uploaded/failed.
  Se presentan Sólo local, Subida pendiente, Subiendo, Subida completada y Error de
  subida. El descubrimiento no inventa referencias remotas. La API de estados queda
  preparada para H3.2, sin worker ni nuevos controles de subida. uploaded exige
  metadatos reales del proveedor; las referencias de los tests son fixtures.
- Medios y detalle muestran capturas y reproducción dentro de la app. El detalle
  importado conserva su apertura anterior. Session mantiene panel local e importaciones
  sin duplicar capturas. Cloudinary sólo añade discriminante/tipado a su resultado
  existente de importación; no se implementan nuevas subidas de capturas.
- No se modifican CaptureEngine, coordinación H2, relay, servicio de sesión, ACK ni
  historial. Un clip offline puede aparecer aquí y continuar no confirmado en Controller.
  Leer el catálogo no envía mensajes. No se cambiaron dependencias ni configuración
  nativa: usar el cliente H2 con ExpoVideo; no reinstalar ni borrar datos.

Validación: base **42/42 PASS**, nueva suite **49/49 PASS**, TypeScript PASS,
lint PASS, ESLint ampliado PASS y `git diff --check` PASS. Los siete tests nuevos
usan sidecars/archivos reales en un directorio temporal y adaptadores de plataforma:
importaciones antiguas, takeId null, dos Nodes de la misma toma con igual id local,
otra toma/participación, reapertura/reconstrucción sin índice, archivo ausente/vacío,
desaparición después de leer, incorporación repetida, estados de subida persistentes
y escrituras simultáneas sin pérdida. La suite H2 de ACK != saved, cierre,
desconexión y resultados desconocidos sigue pasando. TypeScript detectó incidencias
de tipado durante la implementación; se corrigieron y no quedan fallos pendientes.
Esto no acredita decodificación ni ejecución de la interfaz en un teléfono físico.

Repetir desde la carpeta con package.json, Node 24 y Git Bash:

```bash
git rev-parse HEAD
npx tsc --noEmit
npm run lint
node --test tests/*.test.cjs
npx eslint services/mediaCatalog.ts services/localCaptures.ts services/cloudinary.ts types/media.ts components/MediaAssetCard.tsx components/LocalVideoPlayer.tsx components/LocalCapturesPanel.tsx tests/media-catalog.test.cjs
git diff --check
```

Prueba física con los originales H2 existentes:

1. Recargar el código en el cliente H2 de cada teléfono, sin desinstalar ni borrar
   datos. Anotar SHA y abrir **Medios** en cada Node. Consultar archivos no requiere
   reingresar a una Session ni conexión al relay.
2. Abrir la tarjeta de un vídeo H2 y comparar sessionId, takeId, deviceId, nodeId,
   id local, bytes y URI. Debe indicar **Sólo local**, archivo verificado y ninguna
   URL/publicId remota inventada. Pulsar **REPRODUCIR VÍDEO LOCAL**, luego ▶.
3. Comprobar imagen/duración. Cerrar y reabrir la app sin borrar datos; entrar a
   Medios, comprobar el mismo id y reproducir de nuevo. Repetir en el otro Node.
4. Comprobar una importación antigua: tarjeta, detalle y apertura remota deben
   seguir funcionando. Si hay un manual H1, comprobar takeId null y reproducción.
5. Para nuevos clips, iniciar relay/Metro como H2, aceptar ambos Nodes y preparar
   READY. REC/STOP en Controller; en Medios comprobar los clips con mismo takeId
   (cada teléfono ve sus archivos). Reabrir varias veces: no duplicar ni perder previos.
6. Revisar en SIDE el clip offline de la toma interrumpida reportada
   `35c26956-77f6-4c41-985f-1c16776aaa97`: debe aparecer y reproducirse. Si la Session
   sigue viva, el historial de Controller debe mantener SIDE no confirmado/STOP sin
   ACK. No reiniciar relay para buscar un historial que sólo vive en memoria.

Pendiente: ejecutar estos pasos físicos y registrar SHA/modelos/IDs y reproducción
tras reabrir. No eliminar originales para probar archivo ausente: lo cubren los tests.
H3.2 hará subidas/reintentos reales; H3.3 agregará referencias en Controller.
**H3 no está verificado.**

### 2026-11-14 · H3.2/H3.3 · Subida y agregación de ángulos

Base comprobada: `desarrollo@441670260770dbafe728372d5e66ed5d62b77422` (H3.1).
`origin/desarrollo` y consulta directa al remoto: `541bc389aac56e927f3102165eac6e688af4e9d1`.
H3.1 ya era un commit local no publicado. Se leyó el informe H2 proporcionado por
el operador y se conservan sus distinciones ACK/guardado/resultado desconocido.
Se preservan IP/PORT y el cambio local LAN de config/server.ts; no se aplican
stashes ni se incluyen documentos personales. Durante el trabajo apareció además
un espacio local ajeno en una línea vacía del registro H2; se conserva fuera del commit.

Estado: **listo para prueba física H3.2/H3.3; H3 no verificado**.
Commit identificable con `git log -1 --format=%H --grep='feat(media): upload captures and aggregate take angles'`.
No se efectuaron subidas reales ni reproducción física durante esta implementación.

- CaptureUploadControls ofrece subida/reintento por clip en Session y detalle de
  Medios. Verifica propietario, original persistente y tamaño antes de subir;
  Cloudinary mantiene límite de 80 MB y muestra su causa si falla. No elimina el
  original ni cambia sessionId/takeId/deviceId/nodeId. Estados local, pendiente,
  subiendo, subido, error y sin confirmar son persistentes y distintos.
- Una operación por clip y public_id determinista evitan identidades nuevas en
  reintentos. Respuesta perdida/incompleta o cierre durante transferencia quedan
  sin confirmar. Sólo una respuesta validada permite uploaded/URL. Si falla el
  relay después del éxito HTTP, se permite COMUNICAR RESULTADO sin subir de nuevo.
- MEDIA_STATE/ACCEPTED sólo transportan referencias. El relay exige Node miembro,
  dispositivo propio, Controller destino y participación histórica exacta en la
  Take. Comprueba clipId/bytes cuando H2 los conoce, y revisiones para evitar
  duplicados/sobrescrituras. Captura el rol al REC. Conserva el historial H2 intacto.
- Controller agrupa N ángulos por takeId y muestra Node/dispositivo/rol/estado;
  permite reproducir cada URL confirmada. Guarda cada referencia por separado en
  AsyncStorage. Session vuelve a consultar el relay; Medios recupera referencias
  persistidas aunque la Session ya no viva. No afirma restaurar membresía ni el
  diario H2 después de reiniciar relay/Controller.
- Tras reingreso autorizado, un clip antiguo mantiene nodeId original. Publicar
  su subida no cambia STOP sin ACK ni el resultado desconocido de una toma cerrada.
  Si esa Session/Take ya no existe, conserva original/subida pero no inventa otra.
- Importaciones anteriores y manuales takeId null siguen legibles. Los manuales
  pueden subirse sin agregarlos ficticiamente a una Take. No hay cambios nativos,
  dependencias, Firebase ni grabación/audio nuevos; usar cliente H2 sin reinstalar
  ni borrar datos. No enviar binarios por WebSocket.

Configuración pública necesaria en .env.local (sin secretos):

```dotenv
EXPO_PUBLIC_CLOUDINARY_CLOUD_NAME=<cloud del equipo>
EXPO_PUBLIC_CLOUDINARY_UPLOAD_PRESET=<preset unsigned de vídeo>
```

El preset debe aceptar vídeos y permitir/conservar el public_id solicitado
(`disallow_public_id` desactivado). Unsigned upload no sobrescribe un recurso
existente. Un preset que renombra el public_id produce subida sin confirmar;
corregirlo antes de probar reintentos. Reiniciar Metro para cargar variables.
Referencia consultada: Expo SDK 54 (FileSystem legacy, Expo Video) y documentación
oficial Cloudinary de unsigned upload/public_id. No se imprime el contenido de .env.

Validaciones automáticas: TypeScript PASS; npm run lint PASS; ESLint ampliado
(servicios, relay y tests modificados) PASS; **58/58 tests PASS**. Se conservan las
49 pruebas anteriores, incluidas presencia, H1/H2 y catálogo/importaciones H3.1.
Nuevos casos: dos ángulos en orden inverso y persistencia desde el cliente,
duplicados/revisiones viejas, identidad/destino/Session/Take ajenos, reingreso con
nodeId nuevo sin cambiar resultados H2, pulsaciones simultáneas, fallo/reintento
con original/identidad intactos, interrupción incierta, original ausente/alterado,
límite 80 MB, respuesta malformada/ajena, error de preset, publicación sin repetir
HTTP, manual sin Take y recuperación concurrente de referencias tras reabrir.
`git diff --cached --check` comprueba los cambios de este commit; el espacio ajeno
en ENTREGA.md queda fuera del índice y se documenta como diferencia local previa.

Repetir en Git Bash desde la carpeta con package.json y Node 24:

```bash
npx tsc --noEmit
npm run lint
node --test tests/*.test.cjs
npx eslint services/captureUpload.ts services/cloudinary.ts services/mediaCatalog.ts services/takeMedia.ts services/session.ts services/sessionClient.ts services/sessionProtocol.ts server/sessions.js server/recording.js types/media.ts tests/media-upload.test.cjs tests/coordinated-recording.test.cjs
git diff --cached --check
```

Prueba física pendiente (anotar SHA, modelos, sessionId/takeId, clips y resultado):

Preparar variables/preset, iniciar `npm run relay` y `npx expo start --dev-client --lan`.
Reiniciar relay para cargar este protocolo antes de crear la Session; recargar los
tres clientes H2. Conectar al relay, crear Session en Controller, solicitar ingreso
en Nodes y aceptarlos. Asignar roles distintos y comprobar READY. No borrar datos.

**A · Un Node.** Con sólo un Node aceptado/READY, REC 2–3 s y STOP desde Controller.
Esperar STOP ACK y archivo guardado. En Node abrir Medios → tarjeta del nuevo clip,
comprobar takeId y reproducir el original; pulsar SUBIR A CLOUDINARY. Esperar Subida
completada; en Controller → Session → Ángulos remotos por Take, comprobar un ángulo
del mismo takeId/deviceId/nodeId, pulsar REPRODUCIR ÁNGULO REMOTO y ▶. Verificar
imagen/duración. No confundir la reproducción original del Node con esta prueba.

**B · Fallo y reintento.** Grabar otra Take breve y guardar. Cortar salida a Internet
manteniendo LAN/relay si es posible (deshabilitar datos móviles para evitar fallback).
SUBIR en Node: esperar error o subida sin confirmar, sin URL exitosa. Reproducir el
original local. Restaurar Internet y REINTENTAR SUBIDA en la misma tarjeta. Comprobar
mismo id de catálogo/takeId/nodeId, una sola entrada/ángulo y reproducción remota.
Si se cortó Wi-Fi, reconectar manualmente al relay y solicitar reingreso autorizado;
el clip conserva nodeId antiguo. COMUNICAR RESULTADO si la subida ya se confirmó.

**C · Dos Nodes.** Aceptar el segundo Node, roles distintos y ambos READY. REC/STOP
desde Controller hacia escenas distintas. Ambos guardan clips del mismo takeId.
Subir primero el segundo Node y luego el primero (o casi a la vez). Controller debe
mostrar dos ángulos distintos bajo esa Take, con deviceId/nodeId propios y URLs
diferentes. Reproducir ambos. Volver a COMUNICAR RESULTADO: no duplicar ángulos.
Verificar que REC ACK/STOP ACK y guardado se mantienen separados de subida.

**D · Reapertura.** Salir/volver a Session mientras vive: consulta real al relay y
dos ángulos. Cerrar/reabrir apps sin borrar datos: en Nodes Medios conserva clips,
originales reproducibles y estados; en Controller Medios conserva ambas referencias
y permite reproducirlas por Internet. Si cerrar Controller terminó la Session,
ver referencias guardadas en Medios; no se afirma recuperar la Session ni historial
H2 del relay. Comprobar además una importación antigua y un manual H1 si existe.

Pendiente adicional: ejecutar el caso H2 de desconexión/cierre con original offline,
reingresar y publicar su clip original sin convertir su resultado desconocido en
STOP ACK/guardado confirmado. Los tests lo cubren sin hardware; falta evidencia
física del proveedor, preset, transferencia, decodificación y persistencia nativa.
**H3 no se marca verificado por estas pruebas simuladas.**

### 2026-11-15 · H3 · Diagnóstico de subida rechazada en teléfono

Base `desarrollo@a1eadbf`. El operador grabó un vídeo y reportó Subida sin confirmar,
con original disponible. Encontró en Cloudinary el public_id `lghocqr1xsfm7mn5ztde`.
Ese ID no conserva el `nexus/<hash>` solicitado por la app: si corresponde a la
misma operación, el preset está ignorando/sustituyendo la identidad. Revisar el
preset de EXPO_PUBLIC_CLOUDINARY_UPLOAD_PRESET, mantener Unsigned y desactivar
Disallow public ID. No se accedió ni se modificó la consola del proveedor.

Se encontraron además dos defectos concretos del diagnóstico/compatibilidad:

- El adaptador y worker rechazaban un prefijo de carpeta legítimo. Ahora permiten
  folder/public_id_prefix manteniendo íntegro el ID solicitado en límite de ruta;
  persisten el public_id completo recibido y la URL real. Mantienen el rechazo
  de un basename renombrado o aleatorio, conservando original y estado sin confirmar.
- El mensaje genérico culpaba al preset ante cualquier campo inválido. Ahora
  identifica public_id esperado/recibido, resource_type, secure_url o bytes según
  el campo que falló. La pantalla evita repetir el mismo error persistido.

La corrección de prefijos no resuelve por sí sola un preset que genera IDs
aleatorios. No se acepta ese ID ni se reconstruye una URL; hacerlo eliminaría la
garantía de identidad estable en reintentos. Reintentar después de corregir el
preset puede dejar en Cloudinary el recurso aleatorio del intento anterior; la
app no lo borra ni lo atribuye automáticamente a una Take.

Validación: TypeScript PASS, lint y ESLint ampliado PASS, **60/60 tests PASS**.
Dos casos nuevos cubren prefijo de carpeta en adaptador/worker/reintento y el
diagnóstico por campo. Se comprueba rechazo del ID aleatorio reportado y de
sufijos parciales/renombrados. Diff-check del commit PASS; espacio ajeno previo
en ENTREGA y configuración LAN preservados fuera del commit.

Pendiente físico: guardar el ajuste del preset, recargar JS sin reinstalar ni borrar
datos, reintentar el mismo clip y comprobar Subida completada, publicación y
reproducción remota en Controller. Si falla, compartir el diagnóstico nuevo con
los IDs esperado/recibido. **H3 sigue no verificado**; el fallo físico se registra
sin presentar la presencia en Media Library como una validación completa del flujo.
