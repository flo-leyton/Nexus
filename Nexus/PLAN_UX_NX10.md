# Plan UX/UI NX-10

Punto de recuperación local `nx10/pre-ux-final` en `d510dd3`. La pérdida intermitente de conexión del Controller con Render DEV-B sigue sin causa confirmada.

Estados del plan · PENDIENTE, IMPLEMENTADA y VERIFICADA. La verificación automatizada y la prueba física se registran por separado.

El ZIP se encontró en la raíz de la aplicación, un nivel por debajo del directorio solicitado. Contiene icono principal, adaptable, monocromo, notificaciones, splash, una vista previa, instrucciones y configuración Expo. Los recursos siguen en el ZIP.

## BLOQUE A — CONTROLLER Y VISTAS PREVIAS

Vista del Controller y composición de sesión en `app/session/[id].tsx`, `ControllerTakePanel.tsx`, `ControllerTakeView.tsx`, `ExperimentalPreview.tsx` y `SessionPage.tsx`. Presentación y estado visual. La ampliación y el nombre remoto requieren comprobar continuidad del visor e identidad del dispositivo.

- **IMPLEMENTADA** · Integrar cada visor WebRTC dentro de su correspondiente tarjeta de «Control por cámara».
- **IMPLEMENTADA** · Eliminar la sección independiente «Vista previa experimental» cuando sus visores hayan sido integrados.
- **IMPLEMENTADA** · Identificar cada cámara por su rol MAIN/SIDE y mostrar el nombre del teléfono cuando esté disponible. La etiqueta del rol está implementada. El nombre del teléfono queda PENDIENTE hasta disponer de una asociación fiable con el miembro de la sesión.
- **IMPLEMENTADA** · Mantener un visor independiente por nodeId.
- **IMPLEMENTADA** · Dar a ambas cámaras espacios visuales de tamaño consistente.
- **IMPLEMENTADA** · Evitar que el tamaño de las tarjetas cambie bruscamente al conectar, desconectar o recibir distintas resoluciones.
- **IMPLEMENTADA** · Conservar las proporciones del video, sin estirarlo ni recortarlo innecesariamente. Usar una presentación equivalente a contain.
- **IMPLEMENTADA** · Tablet horizontal: dos tarjetas en columnas del mismo tamaño.
- **IMPLEMENTADA** · Teléfono vertical: tarjetas apiladas.
- **VERIFICADA** · Adaptar la interfaz al ancho real disponible sin modificar la orientación nativa de CameraView.
- **IMPLEMENTADA** · No reiniciar las conexiones WebRTC cuando cambie el tamaño de la pantalla.
- **IMPLEMENTADA** · Dentro de cada tarjeta colocar vista previa, controles de iniciar/detener vista previa, REC/STOP, Foto, Linterna y Zoom.
- **IMPLEMENTADA** · Orden visual de las acciones principales: REC/STOP, Foto, Linterna.
- **PENDIENTE** · Permitir ampliar la vista previa a pantalla completa y regresar sin perder el estado de transmisión.
- **VERIFICADA** · Mantener controles y estados independientes para MAIN y SIDE.
- **IMPLEMENTADA** · Conservar REC/STOP general y las funciones de grabación programada.
- **IMPLEMENTADA** · Mantener accesibles las acciones de recuperación o STOP durante desconexiones o tomas interrumpidas.
- **IMPLEMENTADA** · Simplificar los textos explicativos y evitar duplicación de estados.

La verificación de identidad de tarjetas y aislamiento de transportes es automatizada. Falta comprobar en la tablet y los teléfonos que las vistas y una grabación continúan al girar el dispositivo. La ampliación a pantalla completa queda pendiente porque mover o duplicar la superficie nativa del visor podría interrumpir la presentación del flujo. La sesión de Studio carece de un nombre de teléfono vinculado al miembro y la ficha de presencia heredada no identifica de forma fiable a MAIN y SIDE.

El operador confirmó que la presentación vertical y los controles por cámara funcionan. La primera revisión horizontal reveló una consola demasiado estrecha y una barra inferior mal situada. La corrección da a la consola todo el ancho, iguala las columnas, limita cada visor a 320 × 180 y compacta la barra general. Queda pendiente volver a probar esta revisión en la tablet.

La segunda prueba física confirmó las dos columnas y detectó tarjetas todavía grandes. El ajuste compacto en horizontal reduce los espacios, agrupa REC/STOP, Foto y Linterna en una fila y pone el zoom debajo. Representa la conexión con texto hasta que WebRTC entrega la URL del flujo. El visor ocupa hasta 256 × 144 dp y desaparece al detener esa vista. La revisión física del ajuste compacto sigue pendiente.

El último ajuste aplica el modo compacto de Paper a los botones con icono y extiende el botón de vista previa al ancho de la tarjeta. En vertical, el contenedor 16:9 se mantenía después del desmontaje de RTCView. Ahora se retira en ambas orientaciones cuando desaparece el flujo. Se simplificaron el título de la barra general y los mensajes de linterna, y se reforzaron los insets del Controller horizontal.

**VERIFICADA por el operador, 25 de noviembre de 2026.** Probó `76e058f` en la tablet. Confirmó que el visor desaparece en vertical, aprobó el diseño horizontal y verificó que MAIN y SIDE se mantienen independientes al detener vistas y cambiar de orientación.

## BLOQUE B — STUDIO, SESIONES Y SOLICITUDES

Studio y sesión en `components/studio/`, `app/session/[id].tsx` y `components/session/`. En la auditoría, `Session` y el registro durable carecen de nombre, descripción y fecha de creación. `closedAt` es la fecha de cierre. La marca temporal de un mensaje fecha ese mensaje. Ni `SessionMember` ni `JoinRequest` incluyen un nombre vinculado a la identidad autenticada. La presencia heredada carece de una correspondencia fiable con esos miembros.

**VERIFICADA por el operador, 25 de noviembre de 2026.** El operador comunicó la aprobación física de la parte visual del Bloque B en `23eda26`.

**Datos descriptivos.** El Controller asigna y edita nombre y descripción mediante `SESSION_DETAILS_SET`. El relay confirma los cambios después de persistirlos y asigna `createdAt` en `SESSION_CREATE`. Los límites son 80 caracteres para nombre y 400 para descripción. Las sesiones antiguas se pueden editar y conservan su fecha desconocida. El editor requiere que el relay anuncie soporte. El cliente puede consultar y operar sesiones de relays anteriores.

El dispositivo publica nombre y modelo con la presencia existente de Expo Device. El relay lee el dato de la conexión autenticada del solicitante, prefiere el nombre y usa el modelo como alternativa. Cuando está disponible, guarda la etiqueta de hasta 80 caracteres con la solicitud y el miembro aceptado. Los campos de identidad y autorización conservan su función actual. Si falta la etiqueta, la interfaz muestra un identificador corto y deja el ID completo en los detalles.

- **IMPLEMENTADA** · Simplificar el Controller cuando no hay Nodes conectados.
- **IMPLEMENTADA** · Conservar el código corto de sesión como dato principal.
- **IMPLEMENTADA** · Ocultar UUID, deviceId, nodeId y otros identificadores técnicos en apartados desplegables.
- **IMPLEMENTADA** · Evitar información técnica duplicada.
- **IMPLEMENTADA** · Conservar «Dispositivos de la sesión» antes de la consola de grabación.
- **IMPLEMENTADA** · Mostrar una consola contextual cuando existan Nodes, conservando los controles necesarios para recuperar grabaciones interrumpidas.
- **IMPLEMENTADA** · Simplificar la lista «Tus sesiones».
- **IMPLEMENTADA** · Agregar nombre descriptivo y descripción opcionales de la sesión.
- **IMPLEMENTADA** · Registrar y mostrar automáticamente la fecha de creación de sesiones nuevas.
- **IMPLEMENTADA** · Mostrar nombre, fecha, código y estado de sesión. Mostrar la descripción únicamente si existe.
- **IMPLEMENTADA** · Mantener compatibilidad con sesiones antiguas sin nombre ni descripción.
- **IMPLEMENTADA** · Mantener intactos los identificadores, permisos y mecanismos de ingreso.
- **IMPLEMENTADA** · Eliminar «Importar medio» del Controller, conservando la función existente en los Nodes.
- **IMPLEMENTADA** · Al solicitar ingreso desde un Node, mostrar un solo mensaje «Esperando aprobación», sin avisos duplicados.
- **IMPLEMENTADA** · Mostrar «Solicitud enviada» mientras está pendiente.
- **IMPLEMENTADA** · En las solicitudes recibidas por el Controller, mostrar el nombre o modelo del dispositivo si está disponible.
- **IMPLEMENTADA** · Mantener identificadores técnicos como respaldo y conservar «Identificar solicitante».
- **IMPLEMENTADA** · Simplificar tarjetas de Nodes aceptados: nombre o modelo del teléfono, rol, estado READY/NO LISTO y opción de editar rol.
- **IMPLEMENTADA** · Mostrar solo una causa breve y real cuando una cámara no está lista.
- **IMPLEMENTADA** · Conservar diagnóstico técnico en apartados expandibles.

**VERIFICADA por el operador, 25 de noviembre de 2026.** Probó `cf8a1f8` en LAN con el emulador RTDB y el registro aislado `nexusStudio/relayDevBBlockB`. Confirmó nombre y descripción de sesión, fecha automática de creación, nombre del dispositivo, aceptación, rol y READY. Esta evidencia corresponde al entorno LAN.

Para desplegar los datos descriptivos en Render DEV-B hace falta autorización, publicar el commit y verificar la configuración de `nexusStudio/relayDevB` antes del despliegue manual. El formato durable sigue siendo compatible y carece de migración. El relay anterior serializa solo sus campos conocidos, por lo que un rollback después de guardar datos descriptivos podría perder esos campos. Antes de desplegar, acordar una reversión que preserve metadatos (por ejemplo, una revisión de rollback que conserve el serializador actualizado).

## BLOQUE C — INTERFAZ DEL NODE

`components/session/NodeCaptureView.tsx`, `components/session/NodeParticipation.tsx` y `app/session/[id].tsx`. La cámara y sus acciones preceden los avisos de recuperación. «Herramientas de cámara» conserva la preparación. «Datos técnicos de cámara» reúne permisos, motor e identificador de toma. «Participación» utiliza el nombre o modelo local del teléfono y muestra solo los datos del propio Node. Falta la revisión física del Bloque C.

- **IMPLEMENTADA** · Dar protagonismo a la vista de cámara.
- **IMPLEMENTADA** · Mantener la grabación local visible junto a «Tomar foto» con «REC local» y «STOP local». El motor y el guardado existentes siguen vinculando la grabación al Node aceptado de una sesión. La captura manual guarda el original sin asociarlo a una toma coordinada.
- **IMPLEMENTADA** · Simplificar «Detalles de cámara y toma».
- **IMPLEMENTADA** · Mantener «Volver a preparar cámara» y las herramientas de recuperación.
- **IMPLEMENTADA** · Reducir «Participación» al nombre del teléfono, rol, sesión y estado de conexión y READY.
- **IMPLEMENTADA** · Mostrar solo los identificadores técnicos del propio Node, en un desplegable.
- **IMPLEMENTADA** · Conservar «Confirmar READY», «Tomar foto» y «Reanudar participación», respetando la recuperación de rol.
- **IMPLEMENTADA** · Usar avisos operativos breves sin añadir afirmaciones sobre audio.

**VERIFICADA por el operador, 25 de noviembre de 2026.** Aprobó físicamente `e4f8e55`: diseño del Node, herramientas y datos técnicos, participación, Confirmar READY y fotografía. También aprobó `dcb81b5`: grabó con REC local, detuvo con STOP local y reprodujo el original. REC local permanece visible junto a Tomar foto.

El 25 de noviembre de 2026 el operador aprobó físicamente `6eaecb8`: Participación aparece antes de Cámara en el Node. Las herramientas técnicas y de recuperación siguen accesibles.

## BLOQUE D — TOMAS, VIDEOS Y FOTOGRAFÍAS

Biblioteca en `app/(tabs)/medios.tsx` y `components/navigation/LibraryContents.tsx`. Tomas y originales en `components/session/`. El visor compartido en `components/MediaViewer.tsx` conserva las listas montadas y desmonta `LocalVideoPlayer` al cerrar. Los archivos locales siguen pasando por la verificación existente. La numeración se deriva de las tomas disponibles en cada vista y no reemplaza los IDs.

- **IMPLEMENTADA** · Compactar las tarjetas de capturas locales, importadas y remotas.
- **IMPLEMENTADA** · Mostrar fecha, hora, tamaño y origen del archivo cuando corresponda.
- **IMPLEMENTADA** · Presentar numeración legible de tomas, sin sustituir sus identificadores internos.
- **IMPLEMENTADA** · Reproducir videos locales mediante una ventana o visor que se abre al pulsar Reproducir, sin desplazarse hasta el final de la pantalla.
- **IMPLEMENTADA** · Permitir cerrar el reproductor y volver al mismo punto de la lista.
- **IMPLEMENTADA** · Reproducir del mismo modo los ángulos remotos subidos a Cloudinary.
- **IMPLEMENTADA** · Agrupar MAIN y SIDE bajo la misma toma.
- **IMPLEMENTADA** · Abrir fotografías locales e importadas en una vista ampliada con opción de cerrar.
- **IMPLEMENTADA** · Preservar proporciones originales.
- **IMPLEMENTADA** · Ocultar UUID, rutas locales y URL técnicas en desplegables.
- **IMPLEMENTADA** · Conservar los indicadores relevantes Solo local, Subida confirmada y Archivo no disponible.
- **IMPLEMENTADA** · Conservar íntegramente Subir a Cloudinary, Guardar en galería y Eliminar de Nexus.
- **IMPLEMENTADA** · Aplicar criterios visuales consistentes en Biblioteca, Node y Controller.

El operador confirmó físicamente en `6c4d408` la reproducción de videos en modal y la apertura de fotos con sus proporciones. El visor de fotos usa fondo negro, doble toque, pellizco y arrastre con Gesture Handler y Reanimated, ya presentes en la APK. Falta validar los gestos, el cierre y el retorno al desplazamiento en Android, además de las acciones de galería, eliminación y subida.

El operador observó una subida a Cloudinary que no apareció en «Ángulos por toma». Una grabación con REC local carece de `takeId` y su subida se conserva en la Biblioteca del Node. En una toma coordinada, la subida local persistida y la confirmación `MEDIA_ACCEPTED` son pasos distintos. El Controller muestra las referencias aceptadas de la sesión, consolidadas por dispositivo y clip. Los registros revisados no permiten identificar el clip ni confirmar en qué paso quedó. No se cambiaron las asociaciones, la persistencia ni la publicación.

## BLOQUE E — IDENTIDAD VISUAL DE DEV-A

`app.json`, configuración Expo y `assets/`. Marca visual y recursos nativos para la futura APK.

- **IMPLEMENTADA** · Revisar `Nexus_Expo_Iconos.zip`, sus instrucciones, el ejemplo de Expo y la vista previa.
- **IMPLEMENTADA** · Integrar icono general, adaptativo, monocromático, splash e icono Android de notificaciones.
- **VERIFICADA LOCALMENTE** · PNG de 1024 × 1024 y notificaciones de 96 × 96. Expo resuelve los cinco archivos y conserva `com.floleyton.nexus`.
- **IMPLEMENTADA** · Conservar el tema de React Native Paper y el encabezado actual de Studio.
- **PREPARADA** · Usar `presentation-nx10` para la futura APK con bundle integrado, WebRTC NX-10 y relay público DEV-B. Queda pendiente comprobar los recursos nativos y la apertura en Android con Metro apagado.
