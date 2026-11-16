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
| H3 | H3.1–H3.3 implementados; corregido falso fallo por public_id generado | H3.1: 4416702; corrección actual (ver registro) | 62 tests automáticos; pendiente confirmar subida/reproducción reales con la corrección | Reintentar clip existente sin cambiar preset y ejecutar A–D; H3 no verificado |
| H3.4a | Aceptado físicamente por el operador | e3fedbb819d67c44c6ac57e684efb3ab17e65c0b | Aceptación comunicada al solicitar H3.4b | Sin despliegue |
| H3.4b | Persistencia compartida implementada; pendiente prueba RTDB/reinicio real | Commit H3.4b (ver registro) | Ver validación actual de H3.4c | Probar reinicio real con la reanudación H3.4c |
| H3.4c | Reanudación implementada; pendiente entrega física | Commit local H3.4c (ver registro) | 97 PASS, 1 SKIP; TypeScript y lint PASS | Apagar teléfonos, reiniciar relay, reabrir Session y grabar otra Take sin replay |
| H3.4d | Render/APK preparados localmente; sin despliegue ni APK compilado | Relay 4eac17b; APK ver registro/entrega | 103 PASS, 1 SKIP; autolinking Android y archivo EAS local comprobados | Aprobar push/despliegue y después build; prueba sin laptop pendiente |
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

### 2026-11-15 · H3 · Reproducción directa del fallo de naming

Se añadió `scripts/diagnose-cloudinary.cjs`, ejecutable con Node 24:
`node --env-file=.env scripts/diagnose-cloudinary.cjs`. Usa sólo las dos variables
públicas Cloudinary; sube un PNG sintético de 1 píxel y 68 bytes, nunca originales.
Si el proveedor conserva el ID, repite el mismo para comprobar idempotencia;
si lo sustituye, se detiene para no generar otro recurso aleatorio.

**Resultado real contra el proveedor:** preset `nexus_studio_demo`, public_id
solicitado `nexus/diagnostic-f1bdbeef-a674-428f-8a83-f7497ca02a96`, HTTP 200,
public_id recibido `kvacnsmm2e2aoj0z5e2c`, resource_type image, bytes 67,
identityPreserved false. Se creó una imagen sintética de diagnóstico en Cloudinary;
no se borró ni se enviaron vídeos personales. El primer intento no salió de la
restricción de red; el segundo se ejecutó con aprobación de acceso a red.

Esto reproduce la sustitución en una petición multipart directa desde Node,
independiente del teléfono, Expo, relay y captura. No se atribuye ya el fallo
únicamente a Android ni se exige cambiar controles visuales sin evidencia.
La documentación Cloudinary establece que public_id del request prevalece en
unsigned salvo disallow_public_id=true; corresponde inspeccionar ese valor efectivo
y establecerlo a false mediante administración del proveedor. No se dispone de
credenciales privadas y no se cambió el preset ni .env; no añadir secretos a la app.

La prueba usa imagen con el mismo endpoint auto/upload y el mismo preset para
aislar naming; no certifica vídeo, reintentos de vídeo ni reproducción H3. El
diagnóstico pasa ESLint. Suite existente 60/60, TypeScript y lint PASS.
Siguiente paso: administrador corrige el preset, repetir el diagnóstico y exigir
identityPreserved true en ambos intentos; luego reintentar el clip real desde Node
y comprobar publicación/reproducción en Controller. **H3 sigue no verificado**.

### 2026-11-15 · H3.2/H3.3 · Respuesta Cloudinary como identidad remota definitiva

Base comprobada `desarrollo@8c47dfeb7ee7a7fd17bc381a8aa90fdaae012030`.
Cambios ajenos iniciales: LAN en config/server.ts y espacio en línea vacía de H2
en ENTREGA.md; ambos preservados fuera del commit. No se cambió .env, el preset,
el relay ni los ACK/estado histórico H2. Catálogo local, takeMedia y relay se
inspeccionaron: sus claves por identidad local ya evitan duplicar entradas.

**Causa del falso fallo:** adaptador y worker exigían correspondencia entre
public_id solicitado y devuelto. Una subida HTTP exitosa y completa se rechazaba
cuando Cloudinary generaba un nombre distinto. La identidad local del clip no
depende del nombre remoto; esa restricción se elimina. Las indicaciones anteriores
de cambiar el preset o exigir identityPreserved quedan sustituidas por este contrato.

- Respuesta exitosa válida: public_id no vacío, resource_type video, bytes positivos
  y secure_url HTTPS de vídeo Cloudinary. Se usan exactamente los valores devueltos,
  aunque el solicitado sea nexus/<hash> y el devuelto rzobn7ekss6c49y8iiqi.
- El worker espera la persistencia de uploaded antes de anunciarlo. Node muestra
  **Subido**; publicId/URL son referencias remotas y no sustituyen catalogId,
  localId, sessionId, takeId, deviceId ni nodeId de la participación original.
- Dos pulsaciones comparten operación. Tras persistir éxito, volver a pulsar o
  reabrir sólo comunica la referencia guardada, sin repetir la transferencia.
  takeMedia y relay siguen deduplicando por dispositivo + id local, no por publicId.
  Controller conserva una referencia reproducible por ángulo de la Take.
- Timeout/error de red sin respuesta y respuesta inválida siguen sin confirmar.
  Una reapertura interrumpida no anuncia éxito ni reintenta automáticamente.
  Un reintento explícito con respuesta previamente perdida puede crear otro archivo
  en un proveedor que genera IDs; no se promete deduplicación física en Cloudinary.
  El catálogo y la agregación mantienen una única entrada del clip local.
- El diagnóstico sintético ahora distingue identityPreserved de uploadConfirmed:
  un ID generado con respuesta válida no es fallo. Se detiene tras ese éxito para
  evitar crear otra imagen innecesaria. No se ejecutó otra subida real en esta revisión.

Validación: **62/62 tests PASS**, TypeScript PASS, npm run lint y ESLint ampliado
PASS; sintaxis del script PASS. Diff-check de los cambios del commit PASS (el
espacio ajeno previo de ENTREGA sigue fuera del índice). Regresión con respuesta
realista nexus/… → rzobn7ekss6c49y8iiqi: timeout, reintento, catálogo y referencias
persistentes recargados, comprobación de persistencia antes de notificar, etiqueta
Subido, URI remota exacta, original intacto y repetición/reapertura sin otro HTTP
ni entrada duplicada. Prueba de relay con el ID generado verifica routing, dos
ángulos, notificaciones repetidas y conservación de H2. Respuesta inválida no
publica uploaded. No se afirma decodificar vídeo mediante pruebas simuladas.

Prueba física pendiente, sin tocar preset, LAN ni reinstalar/borrar datos:

1. Recargar JS en los teléfonos. Con Session viva y Node autorizado, abrir el clip
   que mostraba Subida sin confirmar. Si necesita reingreso, autorizarlo; conservar
   el nodeId original del clip. Pulsar REINTENTAR SUBIDA en esa misma entrada.
2. Con respuesta válida debe mostrar Subido y permitir ABRIR VÍDEO REMOTO.
   Comprobar en Controller el ángulo bajo el takeId correcto, con Node original;
   pulsar REPRODUCIR ÁNGULO REMOTO y ▶, comprobar imagen/duración.
3. COMUNICAR RESULTADO otra vez y salir/volver: un solo ángulo. Cerrar/reabrir sin
   borrar datos; en Node conservar original/Subido, en Controller Medios recuperar
   referencia y reproducir. La Session puede terminar si cierra Controller; la
   referencia persistida no restaura membresía ni diario H2.
4. Repetir con dos Nodes de la misma Take: dos ángulos individuales, nunca uno
   sobrescrito. Mantener separados REC ACK, STOP ACK, guardado y subida confirmada.

**H3 sigue no verificado** hasta recibir evidencia física de estos pasos.

### 2026-11-15 · H3.4a · Configuración y acceso autenticado

Base `desarrollo@6a3d3cea0fd299b134f08b008162d182cf778e90`, coincidente con
origin/desarrollo conocido. Se leyeron AGENTS, esta entrega, GUIA_DE_TRABAJO,
contrato y arquitectura. Había **dos cambios ajenos ya en el índice**: IP LAN en
config/server.ts y un espacio en línea vacía del registro H2 de ENTREGA. Se conservan
fuera del commit propio y se restituye su estado preparado en el índice. No se
modifican los valores IP/PORT, stashes, main ni el remoto. No se hace push.

Estado: **implementado, listo para prueba física LAN con Auth**. Obtener SHA con
`git log -1 --format=%H --grep='feat(relay): add H3.4a authenticated access and connection config'`.

- URL única de la app en config/relay.ts: EXPO_PUBLIC_RELAY_URL explícita o LAN
  manual sólo en desarrollo. Preview/producción exige wss:// válido y muestra la
  causa si falta. No se incluyen credenciales ni tokens en URL/query.
- Relay HTTP + WebSocket en un puerto sobre 0.0.0.0, PORT de proceso o puerto
  manual local como alternativa. GET /health sólo informa ready=true. Blueprint
  Nexus/render.yaml: raíz Nexus/, Node 24.15.0, npm ci, npm run relay y health
  sin despliegue automático. No se crea servicio ni se despliega nada.
- Firebase Auth reutiliza cuenta existente o restaura/crea anónima persistente.
  Espera authStateReady antes de crear una cuenta y fuerza getIdToken(true) por
  conexión/renovación. Firebase ausente, Anonymous deshabilitado y red fallida
  muestran causa sin simular autorización. El motor de Session sigue independiente.
- Handshake SOCKET_AUTH en el único socket, Firebase Admin verifica token y
  revocación en servidor. Vincula UID verificado y deviceId, rechaza suplantación,
  conexiones duplicadas y otros UID para la instalación ya vinculada. Antes de
  autorizar no se admite ni recibe presencia, Studio ni broadcast heredado.
  senderId se coteja con el dispositivo autenticado; membresía/destino/H2 conservados.
- Connected sólo tras AUTH_OK. Se renueva token en el mismo socket antes de expirar;
  cambio de cuenta o expiración corta acceso. Reconnect manual espera cierre físico
  anterior, pide token nuevo y no guarda/reenvía REC/STOP ni ACK pendientes. No hay
  reanudación durable ni sockets paralelos. Callbacks antiguos se ignoran.
- Admin sólo se importa en server/firebaseAdmin.js. Se añade firebase-admin 13.10.0
  y lockfile. No se copian claves, cuentas de servicio ni tokens a EXPO_PUBLIC,
  APK o Git. La instalación informó 50 avisos de auditoría del árbol completo;
  no se ejecutó audit fix ni se afirma resolver vulnerabilidades del árbol existente.
- ADR-H3.4a documenta la decisión online autorizada y sustituye Auth opcional de
  la LAN histórica. Contrato/guía/AGENTS incluyen variables y preparación LAN.
  No cambian captura, medios locales, subidas Cloudinary ni ACK/desconocidos H2.

Variables de app: las EXPO_PUBLIC_FIREBASE_* actuales del mismo proyecto Firebase
y EXPO_PUBLIC_RELAY_URL opcional en desarrollo, obligatoria wss:// en preview y
producción. En Firebase Console habilitar **Authentication → Sign-in method → Anonymous**.
No configurar Anonymous en una RTDB: se usa Firebase Auth.

Variables privadas del servidor: **FIREBASE_PROJECT_ID** y ADC mediante
**GOOGLE_APPLICATION_CREDENTIALS** (ruta privada fuera de Git), o
**FIREBASE_ADMIN_CREDENTIALS** (JSON en secret env del servidor). ADC también admite
GOOGLE_CLOUD_PROJECT. PORT es opcional local y lo suministrará Render. Los permisos
de la cuenta deben permitir Firebase Authentication y comprobación de revocación.
No guardar esas variables en el .env público de Expo ni versionar valores secretos.

Validación automática en Node 24.15.0:

- `npx tsc --noEmit`: PASS.
- `npm run lint`: PASS; ESLint ampliado de todos los TS/JS/tests afectados: PASS.
- `node --test tests/*.test.cjs` desde Git Bash: **73/73 PASS**. Doce casos H3.4a
  sustituyen/amplían la prueba anterior de socket único: health/puerto/bind, LAN y
  WSS, tráfico/broadcast pre-auth, tokens inválidos/expirados, otro UID/deviceId,
  timeout, renovación y continuidad de Session, socket único incluso mientras
  cierra, reconexión sin REC/STOP, Auth existente/anónimo/ausente/deshabilitado,
  y entrada PORT + adaptador Admin con revocación. Suites anteriores de ingreso,
  3 Nodes, aislamiento, presencia, captura, ACK/desconexión/cierre, importaciones
  y catálogo/Cloudinary siguen pasando con transporte autenticado de prueba.
- Diff-check de los cambios del commit: PASS. El espacio ajeno preparado de
  ENTREGA permanece fuera del commit. Las primeras ejecuciones detectaron import
  TypeScript sin extensión en Node y cierre excesivo ante JSON inválido ya
  autenticado: se corrigieron; no quedan fallos de validación pendientes.

Las pruebas inyectan un verificador o Admin simulado; no se usaron secretos ni
Firebase real, no se subieron archivos al proveedor y no se certifica WSS público.
Node puede advertir MODULE_TYPELESS_PACKAGE_JSON por el contrato TS compartido;
no altera el resultado ni exige migrar todo el proyecto a ESM.

Prueba LAN exacta pendiente (Controller y dos Nodes):

1. Mantener los datos del cliente H2 y los originales. Habilitar Anonymous en el
   proyecto Firebase de la app. Si ya hay cuenta iniciada, se reutiliza sin crear
   otra anónima. Preparar credenciales privadas Admin fuera de Git del mismo proyecto.
2. En Git Bash desde Nexus/, con project ID/ruta privados propios:

   ```bash
   export FIREBASE_PROJECT_ID='TU_PROJECT_ID'
   export GOOGLE_APPLICATION_CREDENTIALS='/ruta/privada/fuera-del-repo/servicio.json'
   npm ci
   npm run relay
   ```

   En otra terminal, dejar EXPO_PUBLIC_RELAY_URL ausente para la LAN manual actual
   y ejecutar `npx expo start --dev-client --lan --clear`. No requiere cambio nativo.
3. Consultar `curl http://<IP-actual>:<PORT-actual>/health`: sólo ready=true. PORT
   privado de escucha es independiente de la app. Si se prueba otro PORT, poner
   la URL explícita de desarrollo correspondiente sin editar config/server.ts.
4. Recargar los tres clientes, CONECTAR AL RELAY. Deben llegar a Conectado sólo
   después de autenticar. Sin Firebase o con Anonymous deshabilitado (en proyecto
   de prueba sin usuario restaurado), debe aparecer su causa y no presencia falsa.
5. Crear Session, introducir código desde ambos Nodes y aceptarlos. Roles distintos,
   ambos READY. REC breve/STOP en Controller: comprobar ACK y guardado individual,
   reproducción original y subida/remoto como H3. No duplicar capturas por reconectar.
6. Cerrar/reabrir un Node sin borrar datos: Firebase debe restaurar el usuario;
   conectar y solicitar reingreso autorizado, con nodeId nuevo como H2. Cortar
   la red durante otra toma, detener/guardar offline y conservar desconocido en
   Controller; reconectar no debe disparar otro REC/STOP. Probar cierre advertido.
7. Reiniciar relay: las Sessions se pierden (resultado esperado). No afirmar que
   recuperar credenciales o referencias locales restaura membresía/Take del relay.

Límites: vínculo UID/deviceId y sesiones sólo viven en el proceso; no hay atestación
del hardware ni transferencia automática de instalación entre cuentas. Cambiar
cuenta cierra socket; el propietario anterior sigue protegido mientras viva el
proceso. No usar reinicio como reanudación. **H3.4b** guardará Sessions/medios en
RTDB; **H3.4c** reanudará durablemente; **H3.4d** desplegará Render/probará APK sin
laptop. Ninguno está implementado ni H3 se marca verificado por esta entrega.

### 2026-11-15 · H3.4b · Persistencia compartida

Base comprobada `desarrollo@e3fedbb819d67c44c6ac57e684efb3ab17e65c0b`, aceptada
físicamente por el operador según su solicitud. No se inventan modelos/IDs ni
otros detalles de esa prueba. AGENTS, entrega y contrato leídos antes de editar.
Se conservan intactos los cambios ajenos preparados en el índice: configuración
LAN de config/server.ts y espacio en línea vacía del registro H2 de ENTREGA.
El commit se prepara con índice aislado y se conserva su estado preparado original.
No se hace push, no se toca main, Cloudinary, IP/PORT ni configuración nativa.

Estado: **implementado, pendiente prueba física RTDB y reinicio**. Localizar SHA:
`git log -1 --format=%H --grep='feat(relay): persist shared Sessions and recover durable state'`.

- Adaptador servidor sessionStorage.js: Firebase Admin existente, load/commit/close,
  URL privada FIREBASE_DATABASE_URL obligatoria junto con FIREBASE_PROJECT_ID y
  credenciales H3.4a. No hay fallback a memoria para producción. Falta de configuración
  falla claramente; inaccesibilidad/recuperación fallida mantiene /health 503.
- Esquema 1 en nexusStudio/relayV1: revisión global, vínculo deviceId→uid, Sessions,
  código, Controller y miembros con UID/dispositivo/nodeId/rol, pendientes, diario
  de roles, Take/historial, ACK/resultados y referencias Cloudinary por clip/revisión.
  Proyección explícita sin tokens, claves, vídeos ni file://; captura compartida
  sólo id/bytes. Se conservan errores quitando rutas locales. No se toca el árbol
  users/devices existente de la app ni se publican permisos RTDB.
- Cola de mutaciones + transacción CAS de revisión sobre el registro. Evita pérdida
  de dos resultados o ángulos simultáneos y sobrescrituras de otra instancia obsoleta.
  Se soporta un relay escritor activo. Códigos únicos se reconstruyen desde Sessions;
  duplicados/esquema inválido bloquean recuperación, nunca se elige uno arbitrariamente.
- Efectos de red diferidos hasta commit: snapshots, ingreso/rechazo, roles tras ACK,
  comandos REC/STOP, ACK, resultado guardado, cierres y MEDIA_ACCEPTED. Ante escritura
  fallida se revierte el cambio y se descartan efectos; error recuperable y estado
  local/subida confirmada intactos. Conflicto/timeout ambiguo exige recuperar el
  relay antes de continuar. Un fallo de entrega WS no revierte un commit exitoso.
- Al iniciar, recuperar y validar antes de ready. Offline/READY desconocido para
  todos; UID/deviceId durable impide suplantar miembros tras reinicio. No reenviar
  comandos recuperados, incluso si se repite manualmente su ID. Pending se solicita
  otra vez, rol sin ACK vence. Históricos de ACK se conservan como hechos recibidos.
- Desconexión ya no cierra Session ni elimina miembros: conserva UID/nodeId/rol y
  marca offline. Node necesita nueva aprobación para activar captura/READY; se
  asigna nodeId nuevo y no se atribuyen clips antiguos a éste. Controller conocido
  puede volver a consultar su Session con el mismo UID/deviceId autenticado.
- Una Take incompleta al reiniciar queda interrupted/relay-restarted; resultados
  activos se muestran desconocidos, sin archivo ni ACK inferido. Se conservan los
  resultados saved que sí eran durables. Cierre advertido permite abandonar esa
  Take aun sin STOP previo y comenzar una nueva, sin cambiar resultados históricos.
- SESSION_CLOSE autorizado, persistido e idempotente; botón y confirmación en la
  pantalla actual. Exige finalizar/cerrar primero la Take activa. No borra historial
  ni referencias; el código cerrado no acepta ingresos. Sus miembros pueden consultar
  la Session cerrada. SESSION_CLOSED sólo significa este cierre explícito.
- Ajustes mínimos de compatibilidad: miembros offline visibles sin READY; REC sólo
  selecciona Nodes online; reingreso manual no confunde una consulta histórica con
  aceptación; se conserva el motor local y STOP de emergencia. H3.4c no se implementa.

Verificación en Node 24: TypeScript PASS, npm run lint PASS, ESLint ampliado PASS,
**81 tests: 80 PASS, 1 SKIP, 0 fallos**, diff-check del commit PASS. Nuevas pruebas
con adaptadores/relays reconstruidos: mismas Session/código/UID/miembros/roles/Take
e historial/ángulos; dos guardados y ángulos simultáneos; Controller offline;
repetidos, cierre explícito y código cerrado; UID/deviceId ajenos y código sin
membresía; espera del commit y recuperación antes de health; escritura fallida en
creación, aceptación/rechazo, rol, START/ACK/saved, cierre y MEDIA_STATE; código
duplicado/CAS; Take interrumpida y ausencia de replay REC/STOP/ACK. H1–H3 y presencia
siguen pasando. Se actualizaron expectativas antiguas de borrado al desconectar.

Emulador: prueba opcional tests/rtdb-emulator.test.cjs, **no ejecutada** porque aquí
no hay Firebase CLI y sólo está disponible Java 8; no se instalaron herramientas
adicionales ni se accedió a RTDB real. Para un equipo con Firebase CLI y Java compatible,
iniciar Database Emulator en proyecto demo-nexus-h34b/puerto 9000 y ejecutar:

```bash
FIREBASE_DATABASE_EMULATOR_HOST=127.0.0.1:9000 node --test tests/rtdb-emulator.test.cjs
```

Usa sólo localhost y su prefijo temporal nexusStudioEmulatorTests/<uuid>; no toca
datos de producción. La prueba real verifica Admin RTDB, caché/transacción y CAS.
Las pruebas simuladas incluyen la omisión real de null/objetos/listas vacías de RTDB.
No se afirma validar permisos/latencia del proveedor con simulaciones.

Preparación privada para la prueba manual, en Git Bash desde Nexus/:

```bash
export FIREBASE_PROJECT_ID='TU_PROJECT_ID'
export FIREBASE_DATABASE_URL='https://TU_BASE.firebasedatabase.app'
export GOOGLE_APPLICATION_CREDENTIALS='/ruta/privada/fuera-de-Git/servicio.json'
npm run relay
```

Alternativa de credenciales: FIREBASE_ADMIN_CREDENTIALS privada ya usada en H3.4a.
La cuenta debe poder leer/escribir RTDB y verificar Auth en el mismo proyecto.
No poner credenciales Admin en EXPO_PUBLIC ni el APK. Proteger nexusStudio contra
acceso directo de clientes en reglas RTDB, sin permisos amplios de un padre;
el Admin del relay es la autoridad. No desplegar reglas generales que rompan perfiles
o dispositivos existentes para probar este módulo. Render sólo añade la variable;
no se despliega ni se construye APK.

**Prueba manual exacta de reinicio (pendiente):**

1. Iniciar relay con esas variables y Metro como H3.4a. Esperar ready=true en
   `curl http://<IP-manual>:<PORT-manual>/health`. Crear una **Session nueva con
   este código H3.4b**; las anteriores que nunca fueron persistidas no se migran.
2. Controller acepta dos Nodes, roles distintos y READY. REC/STOP breve, guardar
   originales y subir ambos. Anotar sessionId, código, nodeIds y takeId; comprobar
   dos ángulos distintos y reproducibles en Controller. Dejar abierta su ruta Session.
3. Detener sólo el relay con Ctrl+C, sin CERRAR SESSION ni borrar datos. Reiniciarlo
   en la misma terminal con npm run relay y las mismas variables. Esperar health
   ready=true; en Firebase Console debe seguir el mismo registro Session/código.
4. En la ruta que sigue abierta en Controller, CONECTAR AL RELAY y consultar/volver
   a enfocar Session. Deben aparecer el mismo sessionId/código, roles/historial y
   ángulos. Nodes offline y sin READY hasta nueva aprobación; no debe comenzar REC
   ni recibirse otro STOP espontáneo. Reproducir los ángulos ya confirmados.
5. Reconectar Nodes, SOLICITAR REINGRESO y aceptar ambos. NodeIds nuevos, roles por
   reasignar; confirmar que la Take histórica conserva los nodeIds originales y
   que otra Take funciona. Los originales locales siguen en cada teléfono.
6. Repetir reinicio durante REC. Detener/guardar desde cada Node si continúa grabando.
   Controller consulta la Take interrumpida: saved previo, si existía, se conserva;
   los resultados sin confirmación siguen desconocidos. CERRAR TOMA INTERRUMPIDA
   con advertencia; luego reingreso/roles/READY y una Take nueva sin replay.
7. Tras finalizar/cerrar la Take, CERRAR SESSION → CONFIRMAR CIERRE. El código ya no
   permite ingresos. Reiniciar otra vez y consultar por identidad autorizada: estado
   cerrado, historial y referencias conservados, sin aceptar nuevos controles.

**Pendiente H3.4c:** recordar/descubrir/listar Sessions del Controller desde app fría,
selección/reapertura guiada y reconciliación durable de participación/estado local.
Aquí funciona la consulta con sessionId conocido (ruta conservada) y reingreso
manual; no se promete que cerrar/reabrir toda la app encuentre automáticamente la
Session. H3.4d desplegará Render/probará APK sin laptop. **H3.4b y H3 global no se
marcan verificados físicamente por estas pruebas automatizadas.**

### 2026-11-15 · H3.4b · Corrección del arranque Auth → RTDB

Base desarrollo@0382000dc95890a9ef0fe2c67eb07ba7b0080aa4. La llamada getDatabase(app,
url) no acepta esa URL como segundo argumento: con la app creada primero para Auth,
sin databaseURL en options, fallaba «Can't determine Firebase Database URL».
sessionStorage.js ahora importa y usa getDatabaseWithUrl(env.FIREBASE_DATABASE_URL,
getRelayAdminApp(env)), conservando la instancia Admin ya inicializada.

Regresión con Firebase Admin SDK real: inicializa Auth primero, comprueba ausencia
de databaseURL por defecto y crea el almacén con la URL explícita en la misma app.
Usa credenciales sintéticas y Database offline, sin verificar tokens ni acceder a
RTDB/red. Se ejecutó antes del cambio (FAIL con el error citado) y después (PASS).

Validaciones: TypeScript PASS, lint/ESLint ampliado PASS, **81 PASS / 1 SKIP / 0 fallos**
en la suite completa; el SKIP sigue siendo el emulador no disponible. Diff-check
del commit PASS. Pendiente repetir npm run relay con la configuración privada real
y comprobar /health ready tras recuperar RTDB. No se tocaron credenciales, IP/PORT,
datos remotos ni los dos cambios ajenos preparados; no se hace push.

### 2026-11-15 · Corrección prioritaria de identidad y reapertura tras H3.4b

Base desarrollo@4e82ff9d29f35e6733e254454d239e6bd649da07. origin/desarrollo local
apunta a 6a3d3ce; e3fedbb, 0382000 y 4e82ff9 son posteriores. Sin fetch/push ni main.
Se conservan exactamente los dos cambios ajenos preparados: LAN config/server.ts
y un espacio en una línea de este documento. Este commit no los incluye.

Diagnóstico del código y del caso comunicado: la pantalla Cuenta usa email/password
(dirección Gmail, confirmado por operador), no OAuth Google. Antes sustituía el
UID anónimo al iniciar otra cuenta; el dueño durable devices[deviceId] seguía siendo
el UID original. El socket se cerraba al cambiar Auth, sin renovación controlada,
y no había descubrimiento desde app fría. H3.4b no borra Session al desconectar.
No se ha certificado la existencia del registro concreto de ese teléfono en RTDB:
esta terminal no tiene configuración privada Admin para consultar la base real.
Las pruebas usan almacén simulado; no se leyó/modificó RTDB productiva ni secretos.
Para comprobar el caso, el operador puede comparar en Firebase Console, sólo lectura,
nexusStudio/relayV1/devices/<deviceId> y sessions/<sessionId>/members/<controllerId>/uid
con el UID que muestra Cuenta. /health ready confirma recuperación, no titularidad.

Implementado:
- Cierre/espera del socket anterior y token fresco al cambiar Auth; una sola
  conexión compartida, sin outbox ni repetición de REC/STOP/ACK. Logout suspende
  transporte. Errores distintos para conexión todavía activa y UID propietario ajeno.
- Cuenta anónima puede crear/vincular email/password conservando UID. Servicio
  linkStudioCredential también admite AuthCredential Google; no añade OAuth nativo.
  Colisión nunca cambia cuenta silenciosamente: se confirma el cambio y después
  la transferencia por separado. Google habilitado no sustituye Email/Password
  para el formulario actual. Referencia: https://firebase.google.com/docs/auth/web/account-linking
- Referencia Firebase User anterior sólo en memoria permite restaurar o demostrar
  control del anónimo con token renovado. Transferencia explícita por el socket
  verifica ambos tokens con Admin/revocación, fija UID destino al consentimiento,
  exige instalación sin otra conexión y persiste cambio atómico antes de AUTH_OK.
  Conserva Session/código, deviceId, roles, nodeIds históricos, Takes, resultados
  desconocidos y URLs. Error durable revierte propiedad; respuesta perdida se
  reconcilia con conexión normal, sin presumir éxito.
- discoverSessions/SESSION_LIST consulta al conectar y desde ACTUALIZAR MIS SESSIONS.
  Lista sólo Controllers con UID Y deviceId verificados. Desde Studio se abre la
  Session persistida y SESSION_GET actualiza miembros offline, pending, roles,
  historial y ángulos. Salir de la pantalla no cierra; sólo CERRAR SESSION explícito.
- Pending verificado conserva UID/requestId durante desconexión/reinicio, muestra
  Controller offline al Node y solicitante offline al Controller. Puede aceptarse
  tras reconexión autenticada del Node o rechazarse estando offline. No concede
  membresía ni READY automáticamente. Reconectar notifica cambios de disponibilidad.

Límite explícito para el bloqueo ya ocurrido: si el User anónimo original fue
abandonado antes de esta versión y ya no existe credencial/instalación que lo
conserve, no hay prueba de control disponible y la app NO puede recuperarlo ni
transferir su propiedad. UID/deviceId/código en RTDB no bastan. Un nuevo anónimo no
recupera esas Sessions. No se implementa atajo ni se editan datos para ocultarlo.
Requiere un procedimiento externo de recuperación con evidencia verificable, si
fuera posible; habilitar Google o volver a entrar con Gmail no constituye esa prueba.
La referencia anterior en memoria no sobrevive al cierre de app: resolver el cambio
o restaurar identidad antes de cerrarla. No se guardan tokens adicionales en disco.

Validación automática: TypeScript PASS, npm run lint PASS, ESLint ampliado PASS,
git diff --check de cambios propios PASS; **92 PASS / 1 SKIP / 0 fallos** en la suite
completa (node --test tests/*.test.cjs). Casos: cambio Auth
con/sin socket y espera de cierre, vinculación Google simulada conservando UID,
colisión email/Google, recuperación verificable y rechazo de anónimo abandonado,
doble prueba/transferencia durable/fallo de escritura, descubrimiento desde cliente
nuevo, reinicio con pending, autorización ajena, dos Nodes, Takes/ángulos y no replay.
Emulador RTDB opcional sigue omitido; no se infiere prueba física desde simulación.

Procedimiento físico pendiente (dos teléfonos: Controller + Node):
1. Actualizar Metro y relay a este commit, mismas variables privadas/LAN; no borrar
   datos. npm run relay; comprobar /health ready. En Cuenta anotar UID/deviceId.
   Para la Session antigua usar ACTUALIZAR MIS SESSIONS con su identidad original
   si todavía está disponible. Sin prueba original, detener la recuperación ahí;
   no cambiar RTDB. Este parche no promete desbloquear una identidad ya perdida.
2. Con identidad autorizada crear/abrir Session, aceptar Node y anotar Session/código,
   nodeId y rol. REC/STOP breve, reproducir original, subir y abrir vídeo remoto.
3. Sin salir de Auth, cerrar completamente la app Controller y reiniciar relay.
   Node reconecta y solicita reingreso con mismo código mientras Controller offline:
   debe indicar solicitud guardada/Controller offline. Reiniciar otra vez el relay.
4. Abrir Studio Controller, conectar: debe descubrir la misma Session/código sin
   escribir ruta. Abrirla: historial/roles/ángulo y Node offline/pending conservados.
   Node conecta; Controller recibe solicitud y acepta/rechaza. No debe repetirse
   REC/STOP ni recuperarse READY hasta reingreso/preparación real. Reproducir remoto.
5. Con anónimo original aún activo, en Cuenta vincular email nuevo: UID no cambia,
   Session sigue accesible. Para colisión, usar cuenta existente: primer intento
   no cambia UID; CONFIRMAR CAMBIO cambia cuenta pero no propiedad. No cerrar app.
   RECUPERAR IDENTIDAD ANTERIOR debe restaurar acceso; repetir cambio y TRANSFERIR
   A LA CUENTA ACTUAL → Autorizar transferencia debe persistir antes de reconectar.
   Mismo deviceId, Session/código, Node histórico, roles/Takes/URLs; cerrar/reabrir
   app y reiniciar relay para comprobar acceso de la cuenta destino persistida.
6. En una instalación/cuenta ajena comprobar lista vacía y rechazo de consulta,
   cierre y transferencia sin prueba anterior. Salir/volver de pantalla conserva
   Session; sólo CERRAR SESSION con confirmación invalida código. Original intacto.
7. Repetir pasos 2–5 con Controller + DOS Nodes (tres teléfonos): roles y ángulos
   distintos de la misma Take, y ninguna captura espontánea tras reapertura.

Pendiente físico: todo el procedimiento anterior con Firebase real, colisión,
restauración/transferencia, disponibilidad tras reinicio y reproducción en teléfonos.
H3.4b y H3 no se marcan verificados. Se adelanta descubrimiento/reapertura de H3.4c;
siguen pendientes reconciliación completa de participación local/reanudación guiada,
reconexión de red transparente, despliegue H3.4d y prueba sin laptop. Sin cambios
nativos, variables nuevas, LAN, Cloudinary, originales ni ACK de H2.

### 2026-11-15 · H3.4c · Reanudación durable de participación

Base exacta desarrollo@00ef263a20d55660911c02a0cd55145afdab610e. Se conservaron
los cambios ajenos ya preparados en config/server.ts y una línea de ENTREGA.md;
no se incluyen en este commit. Sin push ni cambios en main.

Reutilizado de 00ef263: Auth con token actual y vínculo UID/deviceId, recuperación
RTDB antes de health ready, descubrimiento de Controller, pending durable y cierre
explícito. Faltaban reanudar al Node sin cambiar participación, confirmación nueva
de READY y caducar comandos al cortar conexión sin reiniciar el proceso.

Completado:
1. SESSION_RESUME vuelve a verificar Auth/membresía, rechaza cuentas/instalaciones
   ajenas y Sessions cerradas. Conserva nodeId y rol del Node aprobado. Ingreso
   inicial y solicitud de participación nueva siguen necesitando aprobación.
2. SESSION_LIST ahora descubre también membresías Node aprobadas. Studio abre la
   Session y consulta snapshot de miembros, roles, pending, Takes y referencias.
   REANUDAR PARTICIPACIÓN activa al Node tras persistir; repetición es idempotente.
   El Controller se restaura al autenticar; salir de pantalla no cierra Session.
3. Conexión perdida/nueva invalida READY mediante readyEpoch y confirmación nueva.
   Perder Controller afecta a todos sus Nodes. Informes automáticos no habilitan
   READY hasta CONFIRMAR READY PARA NUEVA TOMA con cámara/permiso/motor real y ocioso.
   Renovar token en el mismo socket no reinicia preparación ni participación.
4. Destinos de REC/STOP se marcan caducados en el diario durable; roles sin ACK
   expiran. No se retransmiten por reanudar. ACK/estados tardíos se rechazan;
   un STOP antiguo tampoco se entrega al Node reanudado con el mismo nodeId.
5. Resultados activos sin confirmación quedan disconnected/connectionLost y captura
   desconocida, conservando sólo ACK durables. Controller perdido interrumpe Take;
   reinicio abrupto también. Saved/error finales y URLs confirmadas se conservan;
   no se infiere archivo ni subida. Sólo perder un Node permite STOP a los restantes.
6. Después de STOP local/guardado, reanudación/confirmación READY y cierre explícito
   advertido de Take interrumpida, REC crea otro takeId sin duplicar historial.
   El cierre no convierte desconocidos en guardados/fallidos. Originales, catálogos,
   importaciones e identidades/revisiones de ángulos se conservan.

Pruebas automatizadas: **97 PASS / 1 SKIP / 0 fallos**, suite completa. TypeScript,
npm run lint, ESLint ampliado y diff-check de cambios propios PASS. El emulador RTDB
opcional sigue omitido por no estar disponible; adaptador simulado y WebSockets
reales de prueba, no Firebase productivo ni hardware. Cámara mantiene API instalada
expo-camera 17.0.10 / Expo SDK 54; sin dependencias/configuración nativa nuevas.

Criterios comprobados:
- Identidad/autorización: Node aprobado reanuda; cliente ajeno rechazado. Escritura
  fallida no confirma participación online ni publica snapshot afirmando éxito.
- Snapshot: Node conserva rol/nodeId, dos miembros independientes, Take y ángulos;
  lectura de datos anteriores y descubrimiento desde cliente nuevo siguen pasando.
- READY: false tras reconectar/reiniciar; epoch viejo, informe automático y permiso
  denegado no confirman. Confirmación nueva habilita preparación de ese Node.
- Caducidad: rol sin ACK expirado, ACK tardío rechazado y cero REC/STOP antiguos
  recibidos por Node reanudado. Renovación en mismo socket y deduplicación H2 pasan.
- Desconocidos: corte de Controller, corte de Node y reinicio abrupto con un Node
  saved durable y otro sin ACK; no se inventan resultados. ACK existentes se conservan.
- Toma siguiente: cierre explícito tras reconciliar; nueva Take con ambos Nodes y
  un solo registro histórico. Repetir ID antiguo no crea ni ejecuta otra captura.

Entrega física PENDIENTE (no marcar H3.4c ni H3 verificados):
1. Mismo entorno privado/LAN y cliente actual, sin cerrar Auth, borrar datos ni
   cambiar cuenta. Actualizar Metro/relay; npm run relay y /health ready. Controller
   crea/abre Session y acepta Node. Anotar UID/deviceId, sessionId/código, nodeId/rol.
2. REC/STOP breve, comprobar original local y subir/reproducir referencia remota.
   Anotar takeId. Apagar AMBOS teléfonos (Controller y Node) completamente.
3. Detener/reiniciar relay con las mismas variables/RTDB. Esperar /health ready.
   Encender ambos, abrir app y CONECTAR AL RELAY. Studio debe descubrir la misma
   Session para ambas identidades originales; abrirla y ACTUALIZAR SESIÓN.
4. Node pulsa REANUDAR PARTICIPACIÓN · CONSERVAR ROL. Verificar nodeId/rol iguales,
   miembros offline hasta volver, historial y URL anterior intactos, READY falso.
   Preparar cámara y pulsar CONFIRMAR READY PARA NUEVA TOMA en Node. Controller
   debe recibir READY nuevo; no debe haberse recibido REC/STOP espontáneo.
5. Grabar y detener otra Take. Verificar takeId distinto, un vídeo nuevo por Node,
   una sola entrada por toma/ángulo y reproducción anterior y nueva. Salir/volver de
   pantalla mantiene Session; sólo CERRAR SESSION explícito la cierra.
6. Repetir apagado/reinicio DURANTE REC (original podría quedar interrumpido por
   apagar el teléfono: no se promete guardado). Tras abrir, resultado sin confirmación
   durable debe seguir desconocido. Si un motor continúa activo en una reconexión
   sin apagado, usar DETENER Y GUARDAR local. Preparar/confirmar READY, CERRAR TOMA
   INTERRUMPIDA → confirmar advertencia y crear otra Take. No inventar ACK/archivo.
7. Repetir con Controller + dos Nodes (tres teléfonos): roles independientes, dos
   ángulos de la misma Take y ninguna repetición de comandos ni ángulos históricos.

Límites: reconexión de red sigue siendo manual; no recuperación mediante un anónimo
nuevo ni apropiación de identidad abandonada. Un Node pendiente aún necesita
aprobación del Controller. No se reconstruye un vídeo dañado/no finalizado al apagar
el teléfono. Ni pruebas simuladas ni este registro certifican grabación física o
RTDB real. H3.4d (despliegue y APK sin laptop) permanece pendiente.

### 2026-11-15 · H3.4d · Preparación del relay Render (sin desplegar)

Base desarrollo@3dd7fdeb26238641ccd9f13158221c90862ba088. Se conservan los dos
cambios ajenos preparados (LAN y una línea de este archivo). Un commit local
separado para relay; APK se prepara a continuación en otro commit. Sin push/main.

Verificado que 0.0.0.0 + PORT, health condicionado a recuperación RTDB y persistencia
externa ya existen. Blueprint ahora fija una instancia, sin autoscaling/disco,
Oregon y cómputo 0.5c-512mb propuesto (USD 7/mes base, sujeto a aprobación y cargos
por uso/workspace). Autodeploy sigue Off. Firebase Admin sólo se configura mediante
variables privadas del servidor; no se han leído/copiadо credenciales ni desplegado.

Se añade cierre SIGTERM/SIGINT: drena el relay/cola durable una sola vez antes de
salir y retira health ready al comenzar cierre. No envía comandos de captura.
DEPLOY_RELAY.md documenta archivos, variables, build/start, revisión para aprobación,
costos, parada de LAN antes de usar la misma RTDB y limitación del solapamiento de
procesos Render durante redeploy. CAS protege revisiones; no promete alta
disponibilidad ni dos escritores concurrentes. Primera puesta en marcha pendiente.

Pruebas: contrato del blueprint y cierre con éxito/error, más suites existentes de
puerto/health/recuperación/deduplicación: **99 PASS / 1 SKIP / 0 fallos**. TypeScript,
lint, ESLint ampliado y diff-check propios PASS. Faltan aprobación de push/despliegue, RTDB real y prueba
física con laptop apagada; H3/H3.4d no verificados.

### 2026-11-15 · H3.4d · Preparación del APK preview (sin compilar)

Primer commit de relay: 4eac17bc0df0f99cea420f4b7c066322a49523ee. Este segundo
commit prepara APK/documentación sin publicar ni consumir un build EAS. Conserva
LAN y cambios ajenos del índice. No se ha creado servicio Render ni elegido una URL
ficticia: el hostname público real queda pendiente del despliegue aprobado.

Perfil preview explícito: Release/APK interno, sin developmentClient, entorno EAS
preview, Node 24.15.0 y versión Android incremental. EXPO_NO_DOTENV=1 no mezcla .env
LAN. app.config valida URL wss pública sin IP/puerto interno, variables Firebase y
Cloudinary completas y ausencia de credenciales Admin/emuladores. Development
conserva la alternativa LAN; producción también usa validación online.

Expo SDK resuelto 54.0.0. Autolinking Android real detectó ExpoVideo 3.0.16,
expo.modules.video.VideoModule/Name ExpoVideo; cámara, archivos, AsyncStorage/Auth
y otros módulos de UI/presencia están enlazados. app.json ya incluía plugin Video;
no se cambian cámara/audio ni applicationId. Hook EAS comprueba módulos tras instalar
dependencias. Esto no prueba el contenido/funcionamiento de un APK todavía inexistente.

.easignore limita fuentes del APK y excluye servidor, variables, claves, vídeos y
caches. Por ser repositorio padre + Nexus/, se documenta copia aislada del commit
y EAS_NO_VCS/EAS_PROJECT_ROOT para usar ese filtro sin subir archivos ajenos.
APK_PREVIEW.md documenta diez variables públicas, comandos exactos, firma compatible
y prueba sin laptop. No desinstalar/borrar datos si la firma no permite actualización:
se perderían originales/identidad. Firma de APK nuevo sigue pendiente de comprobar.

Pruebas nuevas: bloqueo de URL LAN/variables ausentes/Admin, conservación de config
development, autolinking nativo real y fallo si falta Video, filtros de archivo EAS.
Resultado: **103 PASS / 1 SKIP / 0 fallos** en suite completa; TypeScript, lint,
ESLint ampliado y diff-check propios PASS. Copia local con la implementación real
del filtro EAS 27.7.2: 91 archivos, incluidas pantallas/servicios/assets; sin server,
.env ni caches nativos. Se corrigió el filtro de directorios sin slash que usa
fs.cp/EAS y se añadió regresión; no se subió el archivo de revisión. El preflight
de configuración REAL queda pendiente de URL/entorno reales, no sustituido por
fixtures. Pendientes: aprobar push,
crear/desplegar una instancia Render, configurar URL pública real/EAS preview,
aprobar/compilar APK, verificar firma/instalar y ejecutar prueba física.

Aceptación H3.4c/H3.4d PENDIENTE: laptop APAGADA; Controller + Node crean/reabren
misma Session, ingreso/reanudación autorizado, READY nuevo, otra Take, subida y
reproducción local/remota. Apagar ambos teléfonos, reabrir/reanudar y grabar otra
Take sin REC/STOP antiguo ni pérdida/duplicación de historial. Repetir con dos Nodes.
H3 no se marca verificado por autolinking o pruebas simuladas. Costos propuestos:
Render USD 7/mes base más uso/workspace; EAS sujeto a cuota/plan (Free actualmente
15 builds Android/mes). No se contrató/compiló nada; precios/fuentes y límites están
en ambos documentos de revisión.

### 2026-11-15 · Corrección del preflight de APK

APK_PREVIEW.md ejecuta git archive desde la raíz Git con SHA y ruta Nexus separados;
tras extraer trabaja en temporal/Nexus. Comprueba package.json, package-lock.json y
google-services.json antes de npm ci y detiene el flujo si npm ci falla. EAS 27.7.2
usa el argumento posicional `env:exec preview`, confirmado en su CLI instalada.
.easignore conserva explícitamente google-services.json como configuración cliente.

Comprobación local: ZIP de 973883 bytes, tres archivos presentes; copia filtrada
real de EAS con 91 archivos, sin server/, .env, credenciales privadas ni vídeos
(incluidas sondas sintéticas). Archivos requeridos copiados sin alteración. Suite
103 PASS / 1 SKIP; TypeScript, lint y diff-check propios PASS. No npm ci, subida,
build remoto ni push. LAN y cambios ajenos preparados permanecen intactos.

### 2026-11-15 · H4 · Corrección de autorización P2

Base bfe2cbad41752c3e2959badb6a5ab5892e1f10ba, worktree Nexus-H4-DevB,
rama devb/h4-preparation. H4 sigue el relevo DevA como cierre backend de extremo a
extremo; esta etapa corrige solo privacidad de solicitudes y comandos heredados.

SESSION_LIST ahora filtra pending igual que los snapshots ordinarios y SESSION_GET:
solo el Controller recibe la lista completa. La regresión de privacidad falló antes
del cambio y pasa después. Nodes, solicitantes pendientes y otro dispositivo del
mismo UID no reciben datos de otros solicitantes ni acceso por el código.

Se elimina el fallback de broadcast global del relay. CAPABILITY_COMMAND valida
campos y autoriza Controller→único Node aceptado/online de una única Session activa,
comprobando socket y propietario. No usa A/B como autoridad ni adivina un destino
entre varios Nodes/sesiones; no entrega a offline ni a otra Session. Preserva
vibración A→B y linterna remota en esa pareja autorizada; linterna manual intacta.

Compatibilidad a coordinar con DevA: control sin Session, vibración B→A y A/B con
varios Nodes/sesiones ya no se permiten. El envelope antiguo no permite resolverlos
con seguridad. UI muestra requisitos/rechazos; soporte de capacidades 1→N explícitas
queda pendiente de contrato y selección de destino. REC/STOP Studio no cambia.

Pruebas nuevas: Controller conserva pending; Node no lo obtiene por LIST/GET/RESUME;
ajenos/misma cuenta en otra instalación y pendientes no acceden a la Session;
dos Sessions operan capacidades por separado; emisor Node/ajeno, campos inválidos,
ambigüedad, offline, reanudación y Session cerrada se verifican con WebSockets locales
reales, tokens sintéticos y almacén en memoria. No se conecta a RTDB productiva.
Prueba física de estas correcciones: NOT RUN. H3 y H4 no se declaran terminados.
No se modifican configuración, .env, dependencias, Firebase/Render/Cloudinary ni
repositorio original, documentos personales o stash. Commit local identificable en el historial Git; sin push o despliegue.

Validación final de esta corrección: TypeScript PASS; npm run lint PASS; ESLint
ampliado de relay/pantallas/tests PASS; suite completa 107 PASS, 1 SKIP, 0 FAIL
(108 casos). La suite específica de autorización más presencia: 6/6 PASS.
El SKIP es el emulador RTDB no configurado. git diff --check PASS. La advertencia
MODULE_TYPELESS_PACKAGE_JSON de Node ya existente no produce fallos; no se cambian
formatos de módulos ni dependencias para ocultarla. Validación física pendiente.

### 2026-11-15 · H4 P2 · RTDB emulada aislada

Base 301f650, worktree Nexus-H4-DevB, rama devb/h4-preparation. Firebase CLI no
estaba instalada y Java 8 era el valor del PATH. Se prepararon herramientas solo
en tests/emulator/tools (CLI 15.36.0, rules-unit-testing 5.0.0, Firebase 12.19.0)
con manifest/lockfile propios y sin scripts de instalación. Java 21 existente se
selecciona únicamente en el proceso de pruebas. Emulador RTDB 4.11.2 en caché CLI.
No se modifican dependencias/configuración de la app ni el .env de DevA.

Proyecto demo-nexus-h34b, RTDB loopback 19000; hub/logging 14400/14500. El ejecutor
limpia variables públicas/privadas de producción y proxies, no carga .env, valida
proyecto/host, aísla configuración CLI y bloquea sockets externos en los tests.
Un primer intento se detuvo porque CLI inyectaba FIREBASE_CONFIG; ahora se proporciona
un fixture projectId-only verificado y se elimina antes de las pruebas, sin URLs
remotas ni credenciales. No se usó Firebase Auth/RTDB/Render de producción.

Resultado final: suite COMPLETA con emulador 113 PASS, 0 FAIL, 0 SKIP; TypeScript,
lint y ESLint ampliado PASS. El test RTDB anteriormente SKIP se ejecutó con Admin
SDK y transacciones reales del emulador: persistencia y conflicto de revisión.
La integración adicional crea Session, dos Nodes, roles, READY, Takes y referencias
sintéticas; termina abruptamente solo un relay hijo y arranca otro contra los mismos
datos locales. Conserva identidad/código/roles/historial/medios, retira READY, mantiene
resultados desconocidos, rechaza ACK antiguo y permite cerrar e iniciar otra Take.
No se afirman capturas o reproducción física: verificador, resultados y URLs son fixtures.
Se adaptó una aserción de tests/relay-storage.test.cjs para reconocer la reescritura
de URL del Admin SDK al activar el emulador; no se cambió código de producción.

Seguridad: pruebas de clientes sin Auth, Controller, Node y ajenos deniegan lectura
y escritura al prefijo/descendientes/padres con una POLÍTICA LOCAL PROPUESTA.
Un control negativo comprueba que un padre permisivo sí anula el deny del hijo;
se restaura después la política segura. No se conocen ni se modificaron las reglas
realmente desplegadas; esas verificaciones permanecen PENDIENTES.

La instalación de herramientas de test reportó 19 avisos (14 moderados, 5 altos),
separados de las dependencias de la app. No se ejecutó audit fix ni se ocultó esa
deuda. Los logs/configuración temporal y node_modules se ignoran en Git.
El emulador se detiene al terminar y sus datos sintéticos se limpian; no se promete
persistencia de esos datos tras apagar el emulador. Reproducción y límites en
tests/emulator/README.md. Commit local en historial; sin push/despliegue. Originales, documentos
personales, LAN, .env y stash permanecen intactos. H3/H4 no están cerrados globalmente.

### 2026-11-15 · H4 P2 · Reglas comunicadas por DevA y preparación P3

Esta actualización sustituye la política propuesta del ensayo anterior por la
reproducción de las reglas informadas por DevA para nexus-fda0e, instancia
nexus-fda0e-default-rtdb.firebaseio.com. No se consultaron directamente Firebase
Console ni las reglas desplegadas mediante una cuenta autorizada. No se conectó
el emulador a ese proyecto: sigue usando demo-nexus-h34b y loopback exclusivamente.

users/$uid y devices/$uid autorizan lectura/escritura únicamente cuando
`auth != null && auth.uid === $uid`. No se añaden permisos ni denegaciones
explícitas en raíz, nexusStudio o relayV1: sin concesión, el acceso se deniega.
El fixture reproduce la semántica comunicada; no pretende ser una exportación
textual certificada de producción. La política del primer ensayo queda histórica.

| Criterio P2 | Resultado | Evidencia / límite |
|---|---|---|
| Lectura/escritura de users y devices por propietario | PASS emulador | Dos UID independientes; lectura, escritura y borrado del propietario |
| Otro UID y cliente sin Auth | PASS emulador | Lectura/escritura/borrado y escritura descendiente rechazados |
| Acceso directo a relayV1, descendientes, nexusStudio y raíz | PASS emulador | Sin Auth, Controller, Node y ajeno: lectura/escritura denegadas |
| Ausencia de concesiones heredadas en política comunicada | PASS emulador | Padres denegados; control negativo demuestra que una concesión de raíz sí permitiría acceso y restaura después las reglas de DevA |
| Actualizaciones multipath cruzadas | PASS emulador | Rechazo atómico, sin escritura parcial en rama propia |
| Sessions/Takes, conflictos y recuperación | PASS emulador | Integración Admin/RTDB y reinicio de proceso; sin inferir ACK o archivos |
| Suite completa / TypeScript / lint / ESLint específico / diff-check | PASS | 114 PASS, 0 FAIL, 0 SKIP; advertencias de módulo preexistentes |
| Reglas efectivamente desplegadas e IAM del relay | PENDIENTE | Reglas proporcionadas por DevA; no verificadas directamente; Admin omite reglas cliente |
| Auth real y recuperación tras reinicio de Render | PENDIENTE | Requiere ensayo aprobado; no reiniciar servicio compartido por iniciativa propia |
| Deuda de dependencias | PENDIENTE | Auditorías previas: 51 app y 19 herramientas; sin actualización en esta etapa |
| Dos ángulos, subida y reproducción remota física | PENDIENTE P3 | Tests sintéticos no prueban vídeos ni Cloudinary real |

Información de despliegue aportada por DevA, no comprobada independientemente:
Render bfe2cbad41752c3e2959badb6a5ab5892e1f10ba; APK H3 EAS
f6cfefce-9958-4ddd-acee-8eaa4f32ad9f, preview, versionCode 2, mismo SHA según DevA.
Ese APK/relay H3 no contienen las correcciones H4 locales posteriores.

Preparación P3: acordar ventana y Session sintética de ensayo con DevA; confirmar
APK instalado, applicationId y firma compatibles sin borrar datos; verificar Auth
real y health. Controller + dos Nodes MAIN/SIDE graban una Take, reproducen ambos
originales y suben cada ángulo. Controller debe mostrar ambos bajo el mismo takeId,
sin duplicación ni sustitución al llegar juntos, reproducir ambas URLs remotas y
conservar catálogo/importaciones al reabrir. Probar fallo/reintento de subida sin
perder originales ni duplicar referencias. Registrar SHA/build/modelos/sessionId/
takeId/nodeId y evidencias no sensibles. Cualquier reinicio de Render, despliegue
del candidato H4 o escritura de ensayo en servicios compartidos requiere alcance
y autorización acordados; nunca segundo relay escritor sobre la misma RTDB.

Sin cambios de runtime, dependencias, .env, LAN, reglas/datos reales, Render ni
Cloudinary. Sin commit ni push. P2 automatizada supera esta matriz; P2 productiva
y aceptación global H3/H4 permanecen pendientes de las evidencias indicadas.
### 2026-11-15 · H4 P3 · Evidencia física H3 comunicada por el operador

PASS físico comunicado por el operador en esta conversación; no observado
instrumentalmente por Codex. APK H3 de DevA: build EAS
f6cfefce-9958-4ddd-acee-8eaa4f32ad9f, preview, versionCode 2 según DevA.
Relay público Render: bfe2cbad41752c3e2959badb6a5ab5892e1f10ba según DevA.
La asociación del APK con ese mismo SHA fue informada por DevA; la consulta EAS
sigue sin permisos de lectura. No se inventan modelos, hora, firma, sessionId,
takeId, hashes de archivos ni capturas de evidencia que no se proporcionaron.

| Criterio P3 | Resultado físico comunicado |
|---|---|
| Controller y dos Nodes autorizados, MAIN/SIDE y ambos READY | PASS |
| REC/STOP coordinado y dos originales reproducibles | PASS |
| Dos ángulos asociados al mismo takeId | PASS |
| Subida Cloudinary y reproducción remota de ambos | PASS |
| Cerrar/reabrir Controller conserva ambos ángulos | PASS |
| Fallo de subida sin conexión detectado, original local conservado | PASS |
| Reintento exitoso y reproducción remota del vídeo recuperado | PASS |

Esta evidencia valida el recorrido principal H3 usando los binarios/relay H3.
No valida las correcciones H4 locales de privacidad SESSION_LIST ni aislamiento
de CAPABILITY_COMMAND, todavía NO desplegadas. La matriz P2 anterior queda como
registro histórico: su fila de ángulos físicos pasa ahora para este recorrido H3.
Las 114 pruebas automatizadas corresponden a la validación anterior, no se han
repetido para esta actualización exclusivamente documental.

NOT RUN / pendiente: reinicio real de Render y recuperación RTDB productiva;
P4 desconexión durante REC con SESSION_RESUME; arranque frío de los tres teléfonos
con laptop apagada; conservación de importaciones previas no reportada en P3;
comparación instrumental de firma/APK y exportación directa de reglas/IAM;
aislamiento multisesión con clientes reales y pruebas destructivas/de fallos de
almacenamiento en entorno aislado autorizado. No reiniciar Render ni inyectar
mensajes forjados o fallos contra el entorno compartido. H3/H4 no quedan aceptados
globalmente por esta prueba parcial. P5 candidato H4 sigue pendiente.

#### P4 · Procedimiento preparado, NO ejecutado

Coordinar la ventana con DevA. Mantener APK H3 y relay indicados, identidad y datos
actuales; usar una Session de ensayo, sin segundo relay ni cambios de configuración.
Registrar modelo/red/hora, sessionId, deviceId, nodeId y rol de cada Node, takeId T1
y estados ACK/resultado. No publicar tokens, vídeos personales ni claves.

1. Controller y dos Nodes MAIN/SIDE conectados y autorizados; confirmar READY real
   en ambos. Orientar cámaras a escenas diferentes; usar clips breves silenciados.
2. Iniciar T1 desde Controller. Verificar captura activa en ambos: REC ACK por sí
   solo no demuestra grabación. Anotar takeId e identidades antes del corte.
3. Cortar solo la conectividad de SIDE (Wi-Fi y datos móviles, sin conmutación a
   otra red), manteniendo la app/cámara activa. No apagar ni cerrar el teléfono.
   Si abrir ajustes manda la cámara a segundo plano y detiene la captura, registrar
   esa interferencia; no declararla continuidad offline superada.
4. Esperar detección offline en Controller: SIDE pierde READY y queda desconocido,
   sin inventar STOP ACK ni guardado. Confirmar que SIDE continúa capturando localmente.
5. Controller pulsa STOP · FINALIZAR TOMA. MAIN recibe STOP, termina/guarda y reproduce
   su original. SIDE usa DETENER Y GUARDAR estando aún offline; comprobar archivo
   no vacío y reproducción local. No cerrar la Take mientras haya captura alcanzable activa.
6. Restaurar red de SIDE y conectar al relay si hace falta. Usar REANUDAR PARTICIPACIÓN
   (CONSERVAR ROL), NO nueva solicitud de ingreso. El relay verifica UID/deviceId y
   membresía durable: mismo sessionId, nodeId y rol SIDE, sin participante duplicado.
   Si falla, registrar error y detener esta prueba; no ocultarlo con ingreso nuevo.
7. Comprobar READY retirado al reanudar y ausencia de REC/STOP antiguos: no debe iniciar
   ni detener otra captura, ni añadir ACK antiguos. Con cámara/motor ociosos y permiso
   real, pulsar CONFIRMAR READY PARA NUEVA TOMA en los Nodes que lo requieran. SIDE
   no se declara READY automáticamente por reconectar; MAIN no necesita reiniciarse
   si conservó preparación válida. Capturar evidencia antes y después de confirmar.
8. Controller pulsa CERRAR TOMA INTERRUMPIDA y lee la advertencia; confirmar cierre
   solo tras verificar ambos originales y participantes alcanzables ociosos. El
   cierre no detiene una cámara ni certifica un resultado ausente. Si el relay
   rechaza por actividad/preparación, registrar y resolver localmente, sin forzar.
9. Confirmar cierre operativo T1 con ACK/resultados originales intactos y ausencia
   marcada desconocida/no confirmada, aunque el vídeo offline exista. Una referencia
   Cloudinary posterior no convierte retrospectivamente el resultado H2 en saved.
10. Con MAIN y SIDE online y READY nuevos donde corresponda, iniciar T2 desde
    Controller: takeId distinto, dos capturas reales, STOP y dos originales
    reproducibles. T1 permanece una sola vez en historial con sus resultados.
11. Si está dentro de la ventana aprobada, subir/publicar el original offline de T1
    y reproducir su ángulo. Mantener takeId/nodeId históricos, sin otra captura ni
    reescritura de ACK. Verificar que T2 y los ángulos previos permanecen intactos.

Aceptación P4: continuidad y guardado offline reales; STOP independiente de MAIN;
mismo nodeId/rol al reanudar; READY explícito nuevo; ningún comando reproducido;
cierre autorizado sin falsificar resultados; T2 exitosa con historial intacto.
La observación física comprueba ausencia de acciones viejas; rechazo exacto de
COMMAND_EXPIRED/ACK tardío se prueba automáticamente y, si requiere inspección de
protocolo/inyección, solo en entorno aislado. No forjar mensajes en producción.
Variante SIDE que nunca regresa: mantener desconocido y advertencia, verificar
MAIN finalizado antes del cierre; ejecutar solo como ensayo separado coordinado.

Las acciones P4 sobre el relay escriben metadatos reales en RTDB; el paso 11 sube
medios a Cloudinary y consume cuota. Este registro no inicia esas acciones.
Solo ENTREGA.md modificado; sin código funcional, commit, push ni despliegue.

### 2026-11-15 · H4 P4 · Resistencia principal superada físicamente

Evidencia comunicada por el operador en esta conversación, no observada ni
instrumentada directamente por Codex. Tres teléfonos; APK H3
f6cfefce-9958-4ddd-acee-8eaa4f32ad9f; relay Render
bfe2cbad41752c3e2959badb6a5ab5892e1f10ba. Este registro actualiza el estado
NO ejecutado del procedimiento P4 anterior, que se conserva como referencia.

El operador confirma: MAIN y SIDE iniciaron REC; SIDE perdió Internet y continuó
grabando localmente; usó DETENER Y GUARDAR sin conexión; MAIN recibió STOP remoto.
Ambos originales se guardaron y reprodujeron. SIDE reanudó participación con el
mismo nodeId y rol; recuperó READY mediante preparación nueva. El Controller cerró
la toma interrumpida, habilitó REC para dos Nodes y ambos grabaron una segunda toma
cuyos vídeos se reprodujeron correctamente. Estos puntos son PASS físico H3.

Historial actualizado el 2026-11-16 con evidencia física comunicada por el operador:
T1 interrumpida `6cec451b-978e-4587-b0ac-8a8c850b2b3b`; T2 posterior
`dc052d63-4d96-4909-b5b1-fd0d1cebdf21`. Los takeId son diferentes. En la
interfaz del Controller, T1 aparece una sola vez con MAIN guardado y SIDE sin
confirmación remota. T2 muestra REC ACK y STOP ACK de ambos Nodes; sus dos
originales se guardaron y reprodujeron. Comprobación física del historial: PASS.
La ausencia de duplicados se observó en la interfaz; no es una auditoría directa
de registros RTDB ni de recursos Cloudinary. No se ha informado una nueva revisión
del historial tras otro cierre/reapertura para esta comprobación concreta. Esto
no certifica por sí solo la ausencia de todo comando antiguo ni el rechazo de ACK
tardíos. APK/relay H3 identificados arriba; no valida correcciones H4 sin desplegar.

#### Matriz de aceptación H4 actualizada

PASS indica únicamente el alcance de evidencia especificado. PENDIENTE no significa
FAIL; no hay un fallo nuevo confirmado en esta ejecución. H4 global no está cerrado.

| Criterio | Estado | Evidencia / límite |
|---|---|---|
| Controller + dos Nodes autorizados, roles y READY | PASS | P3/P4 físicos comunicados, binarios H3 |
| REC/STOP, originales y reproducción de ambos | PASS | P3 y segunda toma P4, físicos H3 |
| Dos ángulos, subida y reproducción remota, persistencia al reabrir Controller | PASS | P3 físico H3 |
| Fallo/reintento de subida conserva original y recupera reproducción remota | PASS | P3 físico H3 |
| SIDE continúa REC offline, STOP local; MAIN STOP remoto independiente | PASS | P4 físico H3 |
| Reanudar mismo nodeId/rol y preparar READY nuevo | PASS | P4 físico H3 |
| Cierre operativo de toma interrumpida y segunda toma con dos Nodes | PASS | P4 físico H3 |
| T1/T2 con distintos takeId e historial visible sin duplicados | PASS físico H3 | Operador, 2026-11-16: IDs registrados; T1 una sola vez, MAIN guardado/SIDE sin confirmación; T2 ACK REC/STOP de ambos y originales reproducidos. Alcance: interfaz, no auditoría RTDB |
| Sin replay de comandos ni ACK/resultados antiguos alterados | PENDIENTE físico | Cubierto automáticamente; no informado explícitamente en P4 |
| Privacidad SESSION_LIST y aislamiento CAPABILITY_COMMAND | PASS automatizado / PENDIENTE candidato | Correcciones locales H4, no desplegadas ni certificadas por APK/relay H3 |
| Persistencia, transacciones, conflictos y reinicio del relay | PASS emulador / PENDIENTE real | Integración RTDB local; no reinicio real de Render |
| Política RTDB comunicada por DevA y aislamiento por UID | PASS emulador | No lectura directa de reglas desplegadas ni revisión IAM |
| TypeScript, lint y suite | PASS previo | 114 PASS, 0 FAIL, 0 SKIP; no repetidos por esta edición documental |
| Variante Node que nunca regresa y fallos inyectados/multisesión reales | PENDIENTE | Tests cubren casos; ensayo adicional solo en entorno autorizado aislado |
| Arranque frío de los tres teléfonos: misma Session, roles y originales | PASS físico H3 | Operador, 2026-11-16; no prueba reinicio de Render ni confirma laptop apagada |
| Conservación de importaciones previas y ejecución con laptop apagada | PENDIENTE | No confirmadas específicamente por el operador |
| Dependencias y riesgos pendientes | PENDIENTE decisión | Auditorías previas; sin cambios de dependencias |
| P5: candidato, APK y relay H4 finales | PENDIENTE | Sin publicación/despliegue/build ni validación final H4 |

Para P5: IDs/historial visible ya PASS; completar evidencia de no replay y acordar con DevA los
riesgos aceptados y verificaciones restantes (incluido reinicio real solo en
ventana autorizada). Seleccionar SHA candidato H4 y repetir validaciones; después,
solo con autorización, publicar/desplegar y decidir si se requiere APK nuevo.
Las correcciones actuales son principalmente de servidor; un build nuevo no
sustituye desplegar el relay corregido. Si se genera APK final H4, registrar SHA,
build ID, versionCode y firma compatible e instalar como actualización sin borrar
datos. Repetir P3/P4 con ese par cliente/relay e identificar sus SHAs y evidencias.
La firma y procedencia del APK no se certifican con el relato de pruebas físicas.

No se realizaron operaciones contra servicios reales, reinicios ni pruebas nuevas
por Codex en esta actualización. Sin cambios funcionales, commit, push o despliegue.
Solo ENTREGA.md actualizado; .env, LAN, repositorio original, documentos personales
y stash se conservan. Las correcciones H4 locales siguen sin desplegarse.

### 2026-11-16 · H4 · Arranque frío físico H3 e integración propuesta

El operador confirma arranque frío de Controller, MAIN y SIDE con APK H3
f6cfefce-9958-4ddd-acee-8eaa4f32ad9f y relay Render H3
bfe2cbad41752c3e2959badb6a5ab5892e1f10ba. Controller recuperó la misma Session
y tomas anteriores; MAIN y SIDE reanudaron conservando roles y sus grabaciones
locales. No fue necesario crear otra Session ni borrar datos. PASS físico
comunicado por el operador; no observado directamente por Codex. No se añaden
suposiciones de nodeId, READY, laptop apagada o importaciones previas no reportadas.

Este resultado prueba recuperación de clientes tras arranque frío, NO recuperación
del proceso relay tras reinicio real de Render. Ese ensayo continúa PENDIENTE y
requiere ventana autorizada. Tampoco certifica las correcciones H4 sin desplegar.
Las menciones pendientes de arranque frío en registros anteriores son históricas;
esta evidencia y la matriz actualizada las sustituyen para el alcance indicado.

Integración propuesta, sin ejecutar: commits locales 301f650 (autorización y
routing), 3e287dc (infraestructura emulador) y 315fd12 (reglas de DevA/UID), en ese
orden. ENTREGA.md contiene además evidencias P3/P4 sin commit que se deberán
revisar y registrar aparte solo con autorización. Consulta de solo lectura
`git ls-remote origin refs/heads/desarrollo` el 2026-11-16: desarrollo sigue en
bfe2cbad41752c3e2959badb6a5ab5892e1f10ba. No informa del trabajo local o de
otras ramas de DevA; no garantiza ausencia de conflictos futuros.

Riesgo de conflicto textual: app/(tabs)/linterna.tsx y vibracion.tsx (mensajes,
listeners y habilitación A→B segura frente a rediseño de interfaz); ENTREGA.md
(registros de ambos); services/SESSION_CONTRACT.md (contratos compartidos).
server/sessions.js y server/relay.js son sensibles si DevA modifica flujo, mensajes
o routing. tests/device-presence.test.cjs y tests/relay-storage.test.cjs pueden
coincidir con sus regresiones; tests/emulator/* y los nuevos tests solo entrarían
en conflicto si DevA creó rutas equivalentes. Revisar también integración semántica
de componentes/servicios aunque Git no declare conflictos.

Antes de integrar: acordar con DevA SHA/ramas y una ventana de único integrador;
registrar ambos trabajos sin incluir .env/LAN/archivos personales. Con autorización,
actualizar referencias y comparar diff desde merge-base con ambas ramas. Integrar
en copia/rama aislada de revisión sobre desarrollo más reciente; conservar el
worktree original. Si los commits H4 son ancestros, no reaplicarlos. Usar una sola
estrategia coordinada (merge de rama completa mediante PR, preferida; cherry-pick
en orden solo si se acuerda selección), evitando duplicar commits. Resolver con
DevA cualquier conflicto de UI conservando autorización, rechazo explícito y
socket compartido; no resolver usando un lado completo por defecto. La compatibilidad
heredada restringe A→B a Controller y un único Node aceptado en una única Session;
B→A/control sin Session/múltiples destinos no son compatibles con el envelope viejo.

Validar candidato integrado: TypeScript, lint/ESLint, suite completa mediante
emulador aislado (referencia previa 114/0/0; el total puede cambiar con DevA),
diff-check y revisión de archivos/secretos. Probar privacidad de pending y routing
entre Sessions con clientes sintéticos aislados, incluidos rechazos y regresiones
legítimas. No usar relay local adicional contra la RTDB compartida. Desplegar solo
tras autorización y con sesiones compartidas sin capturas activas: registrar SHA
servidor, comprobar health ready tras recuperación, probar APK H3 contra relay nuevo
y repetir P3/P4/arranque frío; revisar errores de contrato. Cambios cliente H4 de
mensajes/controles y UI DevA necesitan bundle/APK candidato compatible; APK H3 no
los recibe automáticamente. Validar ambos lados y firma conservando datos. Ensayar
reinicio real coordinado y documentar plan de reversión autorizado, nunca rollback
ciego si hubiera cambios incompatibles de datos. No se ejecuta integración,
publicación, build, reinicio ni despliegue en esta etapa.
