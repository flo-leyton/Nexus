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

## BLOQUE B — STUDIO, SESIONES Y SOLICITUDES

Studio y sesión en `components/studio/`, `app/session/[id].tsx` y `components/session/`. Presentación para listas y estados. Nombre, descripción y fecha pueden requerir campos persistentes compatibles en `sessionProtocol.ts`, `sessionClient.ts` y `server/sessionSchema.js`.

- **PENDIENTE** · Simplificar el Controller cuando no hay Nodes conectados.
- **PENDIENTE** · Conservar el código corto de sesión como dato principal.
- **PENDIENTE** · Ocultar UUID, deviceId, nodeId y otros identificadores técnicos en apartados desplegables.
- **PENDIENTE** · Evitar información técnica duplicada.
- **PENDIENTE** · Conservar «Dispositivos de la sesión» antes de la consola de grabación.
- **PENDIENTE** · Mostrar una consola contextual cuando existan Nodes, conservando los controles necesarios para recuperar grabaciones interrumpidas.
- **PENDIENTE** · Simplificar la lista «Tus sesiones».
- **PENDIENTE** · Agregar nombre descriptivo y descripción opcionales de la sesión.
- **PENDIENTE** · Registrar y mostrar automáticamente la fecha de creación; reutilizar un timestamp existente cuando sea posible.
- **PENDIENTE** · Mostrar nombre, fecha, código y estado de sesión. Mostrar la descripción únicamente si existe.
- **PENDIENTE** · Mantener compatibilidad con sesiones antiguas sin nombre ni descripción.
- **PENDIENTE** · Mantener intactos los identificadores, permisos y mecanismos de ingreso.
- **PENDIENTE** · Eliminar «Importar medio» del Controller, conservando la función existente en los Nodes.
- **PENDIENTE** · Al solicitar ingreso desde un Node, mostrar un solo mensaje «Esperando aprobación», sin avisos duplicados.
- **PENDIENTE** · Mostrar «Solicitud enviada» mientras está pendiente.
- **PENDIENTE** · En las solicitudes recibidas por el Controller, mostrar el nombre real del dispositivo si está disponible.
- **PENDIENTE** · Mantener identificadores técnicos como respaldo y conservar «Identificar solicitante».
- **PENDIENTE** · Simplificar tarjetas de Nodes aceptados: nombre del teléfono, rol, estado READY/NO LISTO y opción de editar rol.
- **PENDIENTE** · Mostrar solo una causa breve y real cuando una cámara no está lista.
- **PENDIENTE** · Conservar diagnóstico técnico en apartados expandibles.

## BLOQUE C — INTERFAZ DEL NODE

`NodeReadinessPanel.tsx`, `components/session/NodeCaptureView.tsx` y `app/session/[id].tsx`. Presentación y ubicación del diagnóstico. Preservar preparación y recuperación de cámara.

- **PENDIENTE** · Dar protagonismo a la vista de cámara.
- **PENDIENTE** · Retirar «Prueba local» de la pantalla principal, preservando la función en herramientas de diagnóstico si todavía es necesaria.
- **PENDIENTE** · Simplificar «Detalles de cámara y toma».
- **PENDIENTE** · Mantener «Volver a preparar cámara» y las herramientas de recuperación.
- **PENDIENTE** · Reducir la sección «Participación» a información útil del propio Node: nombre del teléfono, rol, sesión y estado de conexión.
- **PENDIENTE** · Evitar listar todos los identificadores y datos técnicos de los demás dispositivos.
- **PENDIENTE** · Conservar «Confirmar READY», «Tomar foto» y «Reanudar participación», respetando la recuperación de rol cuando corresponda.
- **PENDIENTE** · No añadir un aviso permanente de «Grabación sin audio» a la interfaz principal.
- **PENDIENTE** · No mostrar afirmaciones engañosas sobre capacidades de audio.

## BLOQUE D — TOMAS, VIDEOS Y FOTOGRAFÍAS

`components/session/LocalCapturesView.tsx`, `components/MediaAssetCard.tsx`, `app/media/[id].tsx` y `app/(tabs)/explore.tsx`. Presentación y gestión del visor. Agrupación y numeración derivadas de las tomas existentes cuando sea posible.

- **PENDIENTE** · Compactar las tarjetas de capturas locales, importadas y remotas.
- **PENDIENTE** · Mostrar fecha, hora, tamaño y origen del archivo cuando corresponda.
- **PENDIENTE** · Presentar numeración legible de tomas, sin sustituir sus identificadores internos.
- **PENDIENTE** · Reproducir videos locales mediante una ventana o visor que se abre al pulsar Reproducir, sin desplazarse hasta el final de la pantalla.
- **PENDIENTE** · Permitir cerrar el reproductor y volver al mismo punto de la lista.
- **PENDIENTE** · Reproducir del mismo modo los ángulos remotos subidos a Cloudinary.
- **PENDIENTE** · Agrupar MAIN y SIDE bajo la misma toma.
- **PENDIENTE** · Abrir fotografías locales e importadas en una vista ampliada con opción de cerrar.
- **PENDIENTE** · Preservar proporciones originales.
- **PENDIENTE** · Ocultar UUID, rutas locales y URL técnicas en desplegables.
- **PENDIENTE** · Conservar los indicadores relevantes Solo local, Subida confirmada y Archivo no disponible.
- **PENDIENTE** · Conservar íntegramente Subir a Cloudinary, Guardar en galería y Eliminar de Nexus.
- **PENDIENTE** · Aplicar criterios visuales consistentes en Biblioteca, Node y Controller.

## BLOQUE E — IDENTIDAD VISUAL DE DEV-A

`app.json`, configuración Expo y `assets/`. Marca visual y recursos nativos para la futura APK.

- **PENDIENTE** · Localizar y revisar `Nexus_Expo_Iconos.zip`.
- **PENDIENTE** · Integrar sus iconos oficiales de Android, icono adaptable, splash y recursos compatibles con Expo.
- **PENDIENTE** · Verificar dimensiones, transparencia y configuración en app.json/app.config.
- **PENDIENTE** · Mantener la paleta violeta y React Native Paper Material Design 3.
- **PENDIENTE** · Colocar una marca discreta en Studio, sin saturar Controller ni Node.
- **PENDIENTE** · Los cambios de recursos nativos se incluirán en la futura APK de presentación.
