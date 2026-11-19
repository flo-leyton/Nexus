# NEXUS · Auditoría y propuesta UX/UI

16 de noviembre de 2026 · Sólo propuesta · Material Design 3 como referencia.

**Recomendación:** dirección **A / Consola**, cuatro destinos estables y dos secciones dentro de sesión: **Operación** y **Tomas y medios**. Priorizar el estado individual de cada Node y mantener REC/STOP visibles. Mostrar cuenta y diagnóstico bajo demanda, con avisos contextuales cuando bloqueen una tarea.

Ver [galería visual](index.html), [comparación de Studio](01-direcciones.png), [Controller, Node y Biblioteca](02-operacion.png), [estados críticos](03-estados.png), [pantalla grande](04-adaptable.png), [soporte](05-soporte.png) e [ingreso y permiso](06-permiso-ingreso.png).

## 1. Base inspeccionada y límites de la auditoría

- Repositorio local `flo-leyton/Nexus`, aplicación en `Nexus/`; rama **feat/ui-polish**, HEAD **e1ac26901bdbb5cdafa8c294a4b5db1c00725b7f**. Árbol limpio al empezar.
- Referencia disponible `origin/desarrollo`: **bfe2cba**, 15-11-2026. Comparación de extremos y de merge-base: nueve archivos, 172 inserciones y 38 eliminaciones. No se hizo fetch: esta comparación no afirma conocer cambios remotos posteriores a la referencia local.
- Leídos AGENTS, ENTREGA, GUIA_DE_TRABAJO, arquitectura, backlog, contrato de sesiones y skill `nexus-ux-ui`. Revisadas las diez pantallas, ambos layouts, componentes operativos, tema, hooks y servicios relacionados con la experiencia. `app/firebase.ts` es un módulo de configuración, no una pantalla; se conserva sin moverlo.
- La indicación general de trabajar en desarrollo y tomar el primer hito entra en conflicto con esta solicitud. Prevalece la solicitud específica: **sin cambio de rama, implementación, commit, push, merge ni despliegue**. ENTREGA no se modifica.
- Expo declarado `~54.0.36`, resuelto localmente **54.0.37**; React Native 0.81.5; Router ~6.0.24; Paper ^5.15.3 ya declarado. No se instala nada. La UI operativa usa principalmente Pressable/ThemedView/ThemedText; no tiene un PaperProvider en el layout raíz.
- Inspección estática: **no se ejecutó la app**, no hubo captura real de su estado, inspección con lector de pantalla ni prueba física. El “actual” de la lámina es una reconstrucción abreviada a partir de JSX/estilos, no una captura del dispositivo. Los números de ejemplo, códigos y sufijos de IDs son ficticios y corresponden a campos existentes; no se consultaron datos productivos.

### Diferencias con desarrollo y estado de H4

Los cambios de esta rama afectan el tema, tokens StudioUI, presentación de Studio/Dispositivos/Medios y barra de pestañas. Vibración y Linterna tienen ahora `href: null`; sus rutas siguen existiendo, pero la búsqueda de enlaces no encuentra un acceso visible equivalente desde las pantallas actuales. Cuenta aparece como pestaña `explore`, con icono de envío; Medios usa icono de código.

También hay cambios previos en ENTREGA y en la IP manual de `config/server.ts` —de 192.168.0.2 a 192.168.137.1—. No se atribuyen a esta auditoría ni se corrigen. No hay diferencias de protocolos, CaptureEngine, servidor o servicios en la comparación con esa referencia. No existe un commit H4 identificable en los logs locales consultados; **ENTREGA mantiene H4 pendiente**. Por tanto, no se inventa una integración de H4 ni se certifica resistencia a fallos.

Las protecciones relevantes ya presentes en la base son H2/H3.4: captura local offline, cierre explícito de toma interrumpida, identidad con prueba de ambas cuentas, persistencia durable, reanudación autorizada, READY nuevo y caducidad de comandos. La propuesta las conserva. Las secciones históricas de ARCHITECTURE que presentan Auth opcional o persistencia sólo en memoria están superadas por sus ADR y el contrato actual. El rediseño no usa esas descripciones históricas para rebajar seguridad.

## 2. Diagnóstico UX/UI priorizado

| Prioridad | Hallazgo comprobable | Efecto durante el uso | Propuesta |
|---|---|---|---|
| P0 | La misma `session/[id]` coloca encabezado técnico, cierre de Session y admisión antes de parte de los controles; cámara Node, capturas e importación llegan después de miembros e historial. Todo está en un ScrollView. | STOP local y cámara pueden quedar fuera del área visible cuando más se necesitan. El cierre administrativo compite con acciones operativas. | Encabezado compacto; vista por rol; dock permanente de grabación/parada; cierre de sesión en menú con confirmación existente. |
| P0 | Estado de comando en ControllerTakePanel, resultado local en LocalCapturesPanel y referencias en TakeMediaPanel son fuentes distintas. La UI explica esta diferencia con párrafos extensos. | El operador puede confundir ACK o URL con original guardado. | Por Node: `REC recibido`, `Grabando`, `Archivo guardado`; subida en columna/sección separada. Conservar “desconocido” sin check verde. |
| P1 | Studio muestra hero, UID, advertencia larga, actualización y bloque “Controller + Nodes + Session” antes de crear/ingresar y listar sesiones. | La tarea frecuente queda subordinada a soporte e información técnica. | Sesiones y dos acciones al inicio; identidad resumida; UID y explicación completa en Cuenta; aviso urgente de identidad si aplica. |
| P1 | Vibración y Linterna están ocultas en tabs sin enlaces de reemplazo encontrados. Dispositivos aún dice que allí se eligen los roles. | Funciones existentes difíciles de descubrir; roles A/B heredados pueden confundirse con roles de Session. | Accesos explícitos en Dispositivos → Herramientas. Etiqueta “prueba heredada A/B”; no usarla para asignar Nodes. |
| P1 | Colores repartidos entre StudioUI, Colors, estilos locales y enlaces azules fijos. Hay campos blancos dentro de superficies oscuras y controles rojos/grises con semántica distinta. | Jerarquía y significado dependen de la pantalla; el nuevo tema no alcanza la operación completa. | Tokens semánticos MD3, contraste medido y estado con texto/icono; una única regla de componentes. |
| P1 | Medios combina catálogo local/importados y referencias por Take, con tarjetas grandes y metadatos largos. Importar sólo está en sesión. | Difícil saber qué se puede reproducir aquí, dónde está un original o desde qué dispositivo se puede subir. | Biblioteca por sesión/toma y sección importados/manuales; acciones por ubicación real y propietario. Acceso contextual a importación con sessionId explícito. |
| P2 | Anchos máximos de 440–680, sin composición específica de escritorio; pestañas con iconos semánticamente ajenos. | Una pantalla grande no ayuda a ver Nodes y controles simultáneamente; mayor esfuerzo para reconocer destinos. | Lista de Nodes + panel lateral en ancho grande; navigation rail; iconos studio, biblioteca, dispositivos y cuenta. |

No se afirma que un cambio visual resuelva por sí solo estos riesgos: separar rutas y conservar la cámara requieren una implementación y una prueba posteriores.

### Inventario de rutas y responsabilidades actuales

| Ruta / componente | Funciona actualmente en el código | Fricción o dependencia que conservar |
|---|---|---|
| `/` · `app/(tabs)/index.tsx` | Conectar, descubrir sesiones autorizadas, crear, pedir ingreso con código, recibir rechazo/aceptación, abrir, última participación y reanudar/reingresar. | Hook y cliente compartidos; estado pendiente puede sobrevivir al desmontaje. `busy` combina petición en vuelo y pendientes. Crear/ingresar se habilitan visualmente con service aunque la conexión pueda fallar después; proponer explicación previa sin saltar validación. |
| `/session/[id]` · Controller | Consultar/verificar sesión, aceptar/rechazar por dispositivo, asignar rol libre, REC/STOP, ACK/resultado por Node, cierre de toma, historial, cierre de sesión, medios e importación. | Admisión offline no aceptable hasta reconectar; rol confirmado mediante ACK; membresía validada por relay. Un cambio de presentación no cambia destinos ni criterios canStart/canStop/canClose. |
| `/session/[id]` · Node | Reanudar membresía, preparar cámara, confirmar READY cuando se exige, vista local, captura manual de prueba sin Take, grabación coordinada, STOP local, reintentar guardado, originales, subida y publicación. | CaptureEngine nace en NodeReadinessPanel; CameraView depende de foco, AppState, permisos, generación y captura ocupada. `usePreventRemove(captureBusy)` protege navegación. No graba en segundo plano. |
| `/medios` | Recuperar estado de subidas, escanear catálogo de este teléfono, importaciones previas, capturas y referencias de ángulos persistidas, abrir detalle. | No es inventario global de todos los archivos del sistema; sus datos locales no certifican ACK del relay. |
| `/media/[id]` | Imagen remota, metadatos, local verificado, vídeo local con expo-video, URL remota, subir/reintentar/comunicar. Estados cargando, ausente y error. | Reproducir local exige verificación; remoto exige URL confirmada. Un `localUri` de otro teléfono nunca es reproducible aquí. |
| `/dispositivos` | Información local y de **un remoto observado**, conexión, actualización manual y cada 30 s en activo. Identificación, SO, API, arquitectura, RAM, espacio, pantalla, batería/carga/red, cámaras, flash/vibración y roles heredados. | `devicePresence.ts` tiene un campo `remote`, no una colección N. No prometer panel de hardware de todos los Nodes ni fusionar por nombres. |
| `/explore` · Cuenta | Registro email/contraseña, login, logout, colisión con confirmación explícita, perfil RTDB, StudioIdentityPanel y enlace a notificaciones. | Vinculación de anónimo cuando procede; transferencia con ambas identidades. Identidad anterior vive sólo en memoria de esa ejecución. No hay botón Google en esta pantalla. |
| `/vibracion` | Elegir A/B, conectar, enviar vibración al otro teléfono durante 5 s y mostrar último evento. | Roles y mensajes heredados CAPABILITY_COMMAND, no dominio de Session. No se propone convertirlos en control por Node. |
| `/linterna` | A controla encender/apagar B; B permite prueba manual, permiso y CameraView trasera para torch. | Cámara de linterna debe respetar foco; no abrirla durante captura de Node. Mantener ruta, handlers y estados. |
| `/notifications-test` | Permisos, registro push, plataforma/dispositivo, EAS ID presente, tokens Expo/FCM y errores. | Herramienta de diagnóstico con restricciones de plataforma/build; no prometer notificaciones operativas de producción. Tokens sólo en diagnóstico explícito. |
| `/modal` | Modal de plantilla con enlace de regreso al inicio. | Sin tarea audiovisual propia; conservar ruta/enlace y ubicar acceso de diagnóstico, sin convertirlo en nuevo flujo operativo. |
| `_layout`, tabs y componentes compartidos | Stack, presencia única, notificaciones, selección de tema y tabs; identidad, reingreso, roles, preparación, control de toma, catálogo, subida y reproducción. | No crear otro socket ni remontar el servicio. HapticTab conserva respuesta en iOS. IconSymbol exige mapping Android/web e iOS. |

También revisados los componentes de plantilla ThemedView/Text, Collapsible, ParallaxScrollView, HelloWave, ExternalLink e iconos: no son nuevas funciones del producto. Su reutilización es una decisión visual; no hay razón para añadir parallax o animación decorativa a la consola.

### Flujos reales que guían la propuesta

**Controller:** conectar y autenticar → crear/abrir sesión autorizada → compartir código textual → revisar solicitudes → aceptar individualmente → asignar roles y esperar ACK → comprobar READY actual por Node → REC → distinguir ACK/inicio/grabación → STOP → comprobar resultados → revisar originales/referencias y reproducir donde estén disponibles.

**Node nuevo:** conectar y autenticar → escribir código → solicitar aprobación → esperar (también con Controller offline) → abrir tras aceptación → permisos/preparación → READY vigente → captura → STOP remoto o local → guardado persistente → reproducción local → subida manual → comunicar referencia al Controller.

**Reanudación:** misma cuenta y deviceId → conexión confirmada por relay → SESSION_RESUME verifica vínculo durable y conserva nodeId/rol → preparar y confirmar READY nuevo si se solicita → reconciliar originales → cerrar explícitamente toma interrumpida antes de otra. Reconectar no ejecuta REC/STOP antiguo. Si no hay membresía válida, solicitar ingreso; nunca “recuperar por código”. El descubrimiento de Sessions del Controller queda restringido a su UID/deviceId autorizado; para Node se conserva la última participación conocida, sin inventar un buscador global.

## 3. Arquitectura de información propuesta

```text
Studio                            Biblioteca
├─ Nueva sesión (Controller)       ├─ Por sesión → toma → ángulo/medio
├─ Ingresar por código (Node)      ├─ Importados y clips manuales
├─ Mis sesiones autorizadas        ├─ Detalle / reproducción / subida propia
├─ Última participación Node       └─ Importar dentro de sesión seleccionada
└─ Sesión /session/[id]
   ├─ Operación según rol          Dispositivos
   │  ├─ Controller: Nodes + REC   ├─ Local / último remoto observado
   │  └─ Node: cámara + STOP local ├─ Identificación / hardware / estado
   ├─ Tomas y medios              └─ Herramientas: Vibración / Linterna
   └─ Menú: actualizar, IDs,
      cerrar sesión (Controller)  Cuenta
                                  ├─ Vincular / ingresar / salir
                                  ├─ Resolver identidad / transferencia
                                  └─ Diagnóstico: RTDB, push y modal heredado
```

Los cuatro destinos preservan el acceso habitual. “Medios” se presenta como **Biblioteca** sin exigir cambiar su URL. “Cuenta” puede mantener `/explore` internamente para preservar enlaces. Operación y Tomas y medios son secciones de la sesión: la primera implementación recomendada no crea una segunda ruta de cámara.

En móvil: barra inferior sólo en destinos principales; sesión usa app bar de regreso y menú contextual, y dock operativo. En Node activo o guardado pendiente, el regreso mantiene la protección actual; no se ofrece minimizar captura ni navegar al historial como si fuera seguro. En escritorio/tablet: rail lateral y dos columnas si el espacio permite legibilidad; los mismos estados y handlers. No añadir UI web de captura persistente: el código remite la validación de captura a Android/iOS.

Propuesta adaptable: ancho <600 dp una columna; 600–839 dp ajustar márgenes/listas manteniendo lectura; ≥840 dp rail y panel operativo lateral si caben contenidos. Son umbrales de diseño propuestos, pendientes de prueba en ventanas reales, no requisitos del protocolo. Con texto ampliado, aceptar scroll en contenido y dock de altura variable, sin recortar STOP.

### Revelado progresivo

- Conexión resumida siempre visible: Conectando, conectado **tras confirmación**, desconectado o error con causa. El detalle técnico no ocupa el hero. Conectar sigue siendo manual.
- Al desconectar, sessionClient limpia `sessions` y `pending` del snapshot local; sólo conserva la referencia `lastNodeSession`. Studio offline no muestra una lista de Sessions Controller “activas” recuperada sin conexión. La durabilidad del relay permite consultarlas después de autenticar, sin inventar una caché local nueva.
- Solicitudes: fila con conteo → revisión con ID completo seleccionable, online/offline, Aceptar/Rechazar y resultado pendiente. No aceptar por deslizar ni aceptar a todos.
- Rol: texto junto al Node → editor de texto de 1–64 caracteres. Conservar rol libre y ACK, sin menú fijo MAIN/SIDE que limite el dominio.
- IDs: sufijos para explorar; completo seleccionable en detalle. Los sufijos no son claves ni prueba de identidad. Si coinciden, ampliar la porción visible; no usar nombres de modelo como identidad.
- Errores críticos no se ocultan: transferencia pendiente, preparación caducada, resultado desconocido, permiso denegado y guardado pendiente se presentan junto a su acción.
- Cerrar sesión queda en menú; cerrar toma interrumpida aparece sólo cuando la condición existente lo permite, con su advertencia completa. Regresar a Studio no cierra Session.

## 4. Propuestas visuales y antes/después

### A / Consola · recomendada

Fondo #131018, superficies poco elevadas, divisores y filas en lugar de una tarjeta por párrafo. Índigo claro en acción primaria y selección. Estado individual ocupa el centro; grabación usa una acción de tono rojo con texto oscuro y etiqueta inequívoca. Radios moderados y tipografía del sistema. Sin gradientes, halos, métricas ficticias o mosaicos de cámaras.

Studio muestra crear/ingresar y sesiones en el primer nivel. Controller dedica el espacio a Nodes y resultados. Node presenta encuadre local y STOP accesible aun desconectado. Biblioteca señala **Remoto** frente a **Sólo en Node**, deshabilitando reproducción sin URL. Ver láminas 01–06.

### B / Mesa de producción

Superficie índigo amplia al inicio, título editorial, control/captura mediante selector de tarea y contenedores más suaves. Es más didáctica en el primer uso y diferencia claramente la intención. La sección Capturar contendría código, solicitud y reanudación Node; Controlar muestra creación y sesiones propias. La lámina muestra el estado Controlar y permite evaluar la composición, no es un prototipo funcional del selector.

Su coste: mayor scroll, un paso extra para alternar intención y menor densidad útil. Por eso no se recomienda como base operativa. No asociar los modos visuales a un cambio automático de rol o identidad.

| Pantalla | Actual según código | Después propuesto | Tipo de cambio |
|---|---|---|---|
| Studio | Hero y explicación técnica anteceden tareas/sesiones; autenticación aparece con UID y advertencia permanente. | Dos acciones, sesiones autorizadas, resumen de identidad; explicación completa en Cuenta, aviso contextual si bloquea. | Visual + reubicación de información; nuevo formulario contextual de ingreso requiere estado UI. |
| Controller | Cierre, solicitudes, REC/STOP, lista de miembros, historial e importación apilados. | Lista de Nodes con preparación/resultado; admisión contextual; dock; historial/medios separado dentro de sesión. | Visual + navegación interna; conserva habilitaciones existentes. |
| Node | Cámara de 180 px situada después de bloques de sesión/miembros. | Cámara local más legible, estado y parada antes de soporte; guardado pendiente domina el feedback. | Layout con riesgo de ciclo de vida; no remonta cámara ni engine. |
| Biblioteca | Tarjetas altas con bloques VIDEO y IDs; referencias remotas al final. | Sesión/toma como contexto; filas por ángulo, importados y manuales identificados; local y remoto separados. | Agrupación derivada de datos existentes y navegación de lectura. |
| Dispositivos | Secciones técnicas completas expandidas y un remoto. | Resumen de estado y detalle expandible; herramientas accesibles. | Revelado progresivo; no promete N remotos. |
| Cuenta | Firebase Account, perfil RTDB y prueba push mezclados con autenticación. | Identidad/continuidad primero; diagnóstico después; colisión y transferencia explícitas. | Presentación y orden; misma seguridad y consentimiento. |

La lámina de pantalla grande demuestra la jerarquía adaptable, no una implementación web ni una promesa de preview. La escena dentro del Node es un dibujo esquemático del encuadre; nunca vídeo remoto. No se dibuja un logo nuevo: el repositorio contiene iconos de plantilla Expo/React, sin una marca gráfica NEXUS inequívoca identificada. Se conserva el nombre NEXUS y su paleta.

## 5. Sistema de diseño sugerido

### Colores y semántica

| Token propuesto | Oscuro | Uso |
|---|---|---|
| background / onBackground | #131018 / #F6F3FA | Identidad y lectura principal. |
| surface / surfaceContainerHigh | #1D1925 / #272131 | App bar, dock, campos y soporte. |
| onSurfaceVariant | #B0A8BC | Información secundaria; evitar opacidad adicional. |
| primary / onPrimary | #BCB2FF / #23184A | Acción principal, mejor contraste que texto blanco sobre índigo claro. |
| primaryContainer / onPrimaryContainer | #3B2E54 / #E6DDFF | Selección y navegación. |
| outline | #84758F | Bordes de controles; divisores decorativos pueden usar #393145. |
| ready / onReadyContainer | #68D7A4 / #162C25 | Preparación confirmada, siempre con READY. |
| warning / warningContainer | #F1BA73 / #332619 | Offline, preparación caducada y resultado incierto. |
| error / errorContainer | #FFB4AB / #352027 | Fallo con mensaje y acción de recuperación. |
| recordingAction / onRecordingAction | #FFB4AB / #530B0C | Grabar o detener según fase, con texto/icono que diferencia la acción. |
| disabled / onDisabled | #27232E / #928A9D | No disponible; acompañar de razón legible. |

Conservar #8173F3 como acento de marca o elemento gráfico, evitando el par actual blanco sobre ese relleno en texto pequeño: su contraste es 3,70:1. En la propuesta #BCB2FF/#23184A da 8,42:1; texto #F6F3FA sobre #131018, 17,15:1; secundario #B0A8BC sobre #1D1925, 7,53:1. El borde de control #84758F supera 3:1 en las tres superficies propuestas. Las cifras están en [VALIDACION](VALIDACION.md), calculadas por script. Son comprobaciones de pares, no una certificación integral de accesibilidad.

Modo claro: conservar la intención de #F7F6FA, #FFFFFF, #221C2C e índigo #6858DB; contrastes por verificar al preparar la futura implementación. La propuesta visual desarrollada es oscura. No forzar un cambio de preferencia de tema durante esta auditoría.

### Tipografía, espacio y componentes

- Fuente del sistema, sin descargas: título de pantalla 28–30/36, sección 17–20/24, cuerpo 16/24, etiqueta 14/20, metadato 12–13/18–20; monoespaciada sólo para código/IDs. Las láminas compactan algunos textos de apoyo a 12–14 px; una implementación debe validar tamaño dinámico y ampliar donde haga falta. No usar texto operativo esencial a 10–11 px.
- Escala espacial 4/8/12/16/24/32; margen móvil 20–24; filas variables; superficies de contenido con radio 12–16, selector segmentado puede ser redondo. Sin elevación en cada párrafo.
- Objetivo táctil mínimo **48 × 48 dp** también en volver, menú, editar, actualizar y filas; iconos 20–24 dentro del área de toque. Las láminas son representaciones visuales, no miden touch targets reales de React Native.
- Paper existente: MD3 theme + PaperProvider integrado con ThemeProvider de navegación; Appbar, Button, List, Menu, Dialog, SegmentedButtons, Banner, ProgressBar y Snackbar según función. No sustituir todos los componentes de golpe. Verificar API de la versión instalada antes de implementar.
- Snackbars sólo para confirmación no crítica. Guardado fallido, estado desconocido y conflicto de identidad permanecen visibles; el feedback no depende sólo de duración o color.
- Estados con etiqueta, icono y contraste. Foco visible; lector de pantalla anuncia cambios con moderación, no todos los reportes de 5 s; controles con nombre, estado deshabilitado/seleccionado, y orden de lectura acorde al visual. No ocultar IDs completos al acceso de detalle.
- Vídeos/imágenes conservan proporción y controles. No cubrir encuadre con párrafos: estado en franja propia y controles fuera del preview. No usar placeholders VIDEO como si fueran miniaturas generadas.

### Estados que debe expresar la futura UI

| Fuente real | Presentación propuesta | Límite semántico |
|---|---|---|
| Connecting / Connected / Disconnected / Error | Conectando / Relay conectado / Sin conexión / Error con causa | Connected sólo tras AUTH_OK del relay. |
| Solicitud en vuelo / pendiente / rechazada | Enviando / Esperando aprobación / Rechazada | Pendiente puede conservarse con Controller offline; no convertirlo en miembro. |
| requiresReadyConfirmation + readyEpoch | Confirmar READY para nueva toma | Sólo acción explícita actual; no restaurar el READY previo. |
| Permiso desconocido/denegado, cámara/motor | Comprobar, conceder o ir a ajustes cuando no puede pedir otra vez | No confundir permiso con cámara lista. |
| pending / starting / recording | Esperando recepción / Iniciando / Grabando | ACK recibido no demuestra fase recording. |
| saving / saved / pendingSave | Guardando / Archivo guardado / Reintentar guardado | No salir ni anunciar éxito si falta persistir el original. |
| error / disconnected / interrupted | Fallo / Desconectado, resultado desconocido / Toma interrumpida | No inferir archivo, no reproducir comandos al reconectar. |
| local / queued / uploading / uploaded / failed / uncertain | Sólo local / Pendiente / Subiendo / Subida confirmada / Error / Sin confirmar | Subida manual; uncertain puede indicar recepción remota sin confirmación. No dibujar porcentajes que no entrega el adaptador. |

## 6. Mapa de reubicación: ninguna función desaparece

| Función existente | Ubicación propuesta y comportamiento conservado |
|---|---|
| Conectar al relay, causa de error, actualización manual | Estado de app bar → panel conexión; acción visible si desconectado. Sin reconexión automática nueva. |
| Descubrir/actualizar Sessions | Studio → Tus sesiones → Actualizar. Mantener descubrimiento ya disparado por conexión del cliente. |
| Crear Session | Studio → Nueva sesión, con pending/error/confirmación relay. |
| Código y solicitud de ingreso | Studio → Ingresar por código → formulario contextual. No QR ficticio. |
| Solicitud pendiente, rechazo y reintento | Studio → estado de solicitud; aceptar permite abrir, rechazo permite solicitar otra vez. No se inventa cancelar solicitud, función no existente. |
| Última Session, reanudar y solicitar reingreso | Studio → Última participación Node; ambos caminos siguen disponibles y distintos. |
| Abrir y actualizar Session; ID/deviceId/código | Lista Studio → misma ruta de sesión; menú → actualizar / detalles completos. Código sigue visible/seleccionable para compartir verbalmente. No se promete copiar/compartir nativo inexistente. |
| Solicitudes y decisiones por dispositivo | Controller → fila Solicitudes → detalle con Aceptar/Rechazar y solicitudes offline conservadas. |
| Miembros, rol y preparación | Controller → lista de Nodes y detalle; Controller propio en detalles de sesión. Roles libres, ACK y errores. En Node → información de sesión/miembros secundaria. |
| REC/STOP coordinados | Controller → dock operativo; conserva destinatarios, deduplicación y habilitaciones. START/STOP comparten takeId existente. |
| ACK REC/STOP, error, archivo, takeId | Resumen por Node durante operación; detalle de toma con todos los IDs, bytes y resultados. |
| Historial de tomas, cierre interrumpido | Sesión → Tomas y medios; banner de recuperación en Operación enlaza al cierre si habilitado. Advertencia y confirmación explícitas completas. |
| Cerrar Session | Menú de Controller → Cerrar sesión, confirmación y restricciones actuales. No confundir con cerrar cuenta. |
| Preparar cámara, comprobar/conceder permiso | Node → Preparación; con acción de volver a preparar cuando proceda. |
| Confirmar READY vigente | Node → preparación caducada → Confirmar READY para nueva toma. No confirmación silenciosa. |
| Captura manual sin Take | Node → Prueba local, secundaria sólo cuando la condición actual permite grabar; sigue silenciada y separada de tomas coordinadas. |
| Cámara, STOP offline, reintento guardado | Node → encuadre y dock/parada; fallo guardado con reintento visible. Guardado pendiente bloquea salida. |
| Originales, verificación, reproducción, cerrar reproductor | Node → tomas locales cuando no captura; Biblioteca → detalle de original propio. Cerrar reproductor sigue disponible. |
| Subir, reintentar, comunicar resultado, abrir remoto | Detalle de clip propio; mismos controles de CaptureUploadControls. Subir/comunicar no se confunden. No subir originales ajenos. |
| Importar imagen/vídeo hasta 80 MB, seleccionar/cambiar/subir, abrir éxito/importar otro | Sesión → Tomas y medios → Importar. Biblioteca ofrece acceso contextual a la sesión seleccionada, sin cambiar el contrato de importación ni añadir importación sin Session. |
| Catálogo, problemas de lectura y medios importados previos | Biblioteca → Por sesión / Importados y manuales. Conserva lectura/migración actual y disponibilidad comprobada. |
| Referencias de ángulos, revisiones, reproducción remota | Biblioteca / sesión → toma → ángulos. Mismos IDs compuestos y última revisión; sin perder dos resultados simultáneos. |
| Metadatos completos, URI y Public ID | Detalle de medio → Datos técnicos expandibles, no eliminados. |
| Todos los campos de dispositivo y actualización | Dispositivos → resumen y secciones de identificación/sistema/hardware/estado/capacidades. Se conserva cada campo y el remoto offline. |
| Vibración A/B y evento, Linterna A/B/remota/manual/permisos | Dispositivos → Herramientas → rutas existentes. Conservar conectividad, selección de rol y feedback; no mezclarlos con membresía Studio. |
| Registro/login/logout/perfil RTDB | Cuenta → acceso e identidad / detalles de perfil. Cerrar cuenta conserva las condiciones de seguridad actuales. |
| Colisión, consentimiento, recuperar anterior, transferir | Cuenta → resolver cambio; aviso visible también en Studio si afecta acceso. Prueba de ambas identidades y confirmaciones permanecen. |
| Push/FCM y modal de plantilla | Cuenta → diagnóstico → rutas existentes. Sin borrar herramientas ni convertir tokens en contenido público. |

## 7. Riesgos técnicos y protecciones

| Riesgo concreto | Medida para una implementación posterior |
|---|---|
| Mover NodeReadinessPanel a otra ruta desmonta engine, coordinación y CameraView; cambiar key/generation rompe la continuidad. | Primera fase conserva ruta, instancia, refs y keys. Cambiar sólo layout dentro de un árbol estable. No ocultar cámara mediante render condicional de pestaña mientras busy/pendingSave. No añadir un segundo CaptureEngine. |
| Cambio de foco, segundo plano o cámara de Linterna | Mantener efectos de foco/AppState y usePreventRemove. Bloquear/suspender navegación a herramientas durante captura con la protección actual; no prometer background recording. Probar Android/iOS reales. |
| Menú y dock cambian cuándo se dispara un handler | Reusar service, hooks y callbacks; no construir envelopes ni ejecutar comandos en useEffect, navegación o montaje. Mantener canStart/canStop/canClose. No ampliar destinos a Nodes offline. |
| Resumen “listos” cambia la política de grabación | El código actual considera Nodes online para canStart. UI debe mostrar online/aceptados y destinos reales; no imponer que todos los miembros offline bloqueen REC ni permitir seleccionar un subconjunto nuevo. |
| Separar historial/medios altera lectura o almacenamiento | Agrupar proyecciones por sessionId/takeId/deviceId/clipId sin migración. Preservar merge por revisión y escritura concurrente. Catálogo local y resultados del relay no se fusionan en un booleano “éxito”. |
| Traslado de autenticación oculta un conflicto | Mantener alerta contextual al perder acceso; no retirar las confirmaciones de colisión/transferencia. Explicar que un anónimo abandonado no es recuperable por código/deviceId. |
| Datos de presencia confundidos con membresía | No derivar lista de Nodes de devicePresence. Mantener fuentes/IDs distintos. No mostrar batería o espacio por Node si sólo existe dato de un remoto heredado. |
| Nueva navegación rompe deep links/atrás o cierra Session | Mantener `/session/[id]`, `/media/[id]`, `/medios`, `/explore` y rutas auxiliares. Estado del servicio no vive en screens nuevas. Desmontar nunca equivale a SESSION_CLOSE. |
| ThemeProvider y PaperProvider divergen | Integrar tokens explícitos para ambos sin reescribir servicios. Verificar claro/oscuro, StatusBar, modales y Android/iOS/web. No introducir biblioteca adicional. |
| Densidad compromete accesibilidad | Validar 48 dp, texto ampliado, teclado en formularios, safe areas, contraste de estados y TalkBack/VoiceOver. No fijar altura rígida del dock. |

### Clasificación de decisiones

**V — Visuales:** color, tipografía, iconos, espaciado, divisores, estilo de botones, jerarquía dentro de la misma pantalla, etiquetas traducidas sin cambiar estados y superficies.

**N — Navegación / estado UI:** formulario contextual, menú de sesión, expansiones de detalle, secciones Operación/Tomas y medios, filtros/agrupación de Biblioteca, enlaces a herramientas y rail adaptable. Requieren aprobación y pruebas de routing/foco; no implican permiso para cambiar dominio.

**A — Arquitectura / comportamiento, fuera de alcance:** persistir o trasladar CaptureEngine a otro owner, captura en background, nuevas reglas REC/READY, reconexión automática, sistema N de presencia, nuevo auth, cambios de protocolo/RTDB/relay, previews remotos, subida automática, QR, eliminar Nodes, sincronización temporal y edición. No se proponen como requisito del diseño ni se autorizan al aprobar la estética.

### Pruebas necesarias después de aprobar implementación

1. Aprobación de una dirección y alcance. Primera entrega visual en rutas existentes; después navegación interna, con diffs pequeños.
2. TypeScript, lint y `node --test tests/*.test.cjs` en Git Bash; pruebas de rutas si cambian, más las suites de aislamiento/deduplicación/identity/resume existentes. No simular éxito físico.
3. Controller + dos Nodes reales: crear, aprobar individualmente, roles independientes/ACK, cámara/permisos, READY por Node, REC/STOP con mismo takeId, archivos locales y reproducción. Repetir toma e importación previa.
4. Cortar red de un Node durante REC, mantenerlo capturando, STOP local, guardado y reproducción. Otro Node responde STOP. Controller refleja desconocido hasta dato real; reanudar con nodeId/rol, READY nuevo, reconciliar y cierre explícito de toma antes de otra.
5. Navegación atrás y cambio de sección durante REC/guardado; verificar protección. No abrir cámara de Linterna a la vez. Error de guardado debe permitir reintento sin perder original temporal.
6. Subir desde propietario, fallo/uncertain/reintento y comunicar resultado; dos ángulos simultáneos permanecen visibles. Reproducción remota sólo con URL válida.
7. Reiniciar relay/reabrir app conservando identidades: ninguna repetición REC/STOP, ninguna apropiación por código. Colisión de cuenta requiere las pruebas/consentimiento originales. Revisar teclado, texto ampliado y lector de pantalla.

Esta auditoría no cambia el estado de H1–H4 ni sustituye la prueba con laptop apagada de H3.4d.

## 8. Recomendación y decisiones para aprobar

1. **Elegir A / Consola (recomendada) o B / Mesa de producción.** A reduce scroll y mantiene la atención en operación; B da más contexto al primer uso a costa de espacio/pasos.
2. **Aprobar la organización propuesta:** cuatro destinos; Biblioteca por sesión/toma; Operación y Tomas y medios dentro de sesión; herramientas bajo Dispositivos, identidad/diagnóstico bajo Cuenta. Conservando URLs y funciones.
3. **Aprobar implementación por fases:** primero cambios V en rutas y árbol de captura existentes; luego N con revisión de navegación y prueba física. Ninguna aprobación estética se interpreta como autorización de cambios A.

**La propuesta termina aquí. No se ha implementado ni se implementará producción sin aprobación explícita.** Así lo exige la solicitud y la [skill aplicada](../../../.agents/skills/nexus-ux-ui/SKILL.md), fase 2, paso 7: “Detente aquí. Espera aprobación explícita del usuario antes de implementar.”

## Referencias verificables

Fuentes del repositorio: [Studio](../../../app/(tabs)/index.tsx), [tabs](../../../app/(tabs)/_layout.tsx), [sesión](../../../app/session/[id].tsx), [ControllerTakePanel](../../../components/ControllerTakePanel.tsx), [NodeReadinessPanel](../../../components/NodeReadinessPanel.tsx), [biblioteca](../../../app/(tabs)/medios.tsx), [detalle](../../../app/media/[id].tsx), [dispositivos](../../../app/(tabs)/dispositivos.tsx), [cuenta](../../../app/(tabs)/explore.tsx), [identidad](../../../components/StudioIdentityPanel.tsx), [reingreso](../../../components/RejoinSessionPanel.tsx), [protocolo](../../../services/sessionProtocol.ts), [contrato](../../../services/SESSION_CONTRACT.md), [presencia](../../../services/devicePresence.ts), [subida](../../../services/captureUpload.ts), [ENTREGA](../../../ENTREGA.md), [arquitectura](../../../README/DOCS/ARCHITECTURE.md) y [backlog](../../../README/DOCS/BACKLOG.md).

Referencia visual: [Material Design 3: estados](https://m3.material.io/foundations/interaction/states/overview). El sitio requiere JavaScript; se usa como referencia del encargo, sin atribuirle mediciones no consultadas.

Expo: los enlaces públicos v54 consultados redirigen a latest en este entorno. Para evitar usar API de otro SDK, se consultó la [documentación oficial de Camera en la rama sdk-54](https://github.com/expo/expo/blob/sdk-54/docs/pages/versions/v54.0.0/sdk/camera.mdx). Indica limitar preview de cámara activo y gestionar el desenfoque; no se usa esa recomendación para desmontar una captura ocupada contra la protección existente. También se contrasta con el módulo y los componentes instalados.

Paper: la guía web consultada no estuvo disponible (404). Se comprobó la dependencia y el código local de tema MD3 en `node_modules/react-native-paper/src/styles/themes/v3`. La futura implementación verificará los componentes de esa versión; no se añaden dependencias durante esta propuesta.
