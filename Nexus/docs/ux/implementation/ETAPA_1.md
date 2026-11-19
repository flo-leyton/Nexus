# A / Consola · Etapa 1: tema compartido y Studio

16 de noviembre de 2026 · `feat/ui-polish` · base `e1ac26901bdbb5cdafa8c294a4b5db1c00725b7f`.

Estado: implementada, validada localmente y **aprobada visualmente por el operador**. Se prepara un commit exclusivo con esta documentación, las capturas y la referencia A aprobada. La prueba en dispositivos continúa pendiente; no se comienza Session.

## 1. Archivos y componentes

| Archivo | Cambio |
|---|---|
| `constants/studio-ui.ts` | Colores semánticos, espacios y forma de Consola. Tokens MD3 separados del índigo heredado usado con texto blanco en otras pantallas. |
| `constants/paper-theme.ts` (nuevo) | Temas MD3 claro/oscuro basados en Paper instalado y adaptación de React Navigation conservando sus fuentes y contratos. |
| `constants/theme.ts` | El acento de navegación reutiliza el token de Consola. |
| `app/_layout.tsx` | PaperProvider y tema de navegación coherentes; StatusBar según tema. Mismos efectos, pantallas y opciones de Stack. |
| `app/(tabs)/index.tsx` | Conecta los mismos estados y handlers a StudioHome. Se retira sólo el JSX/StyleSheet anterior. |
| `components/studio/StudioHome.tsx` (nuevo) | Presentación de Studio: encabezado, conexión, acciones, filas de sesiones, formulario contextual y soporte secundario. |
| `components/studio/StudioStatus.tsx` (nuevo) | Aviso persistente con icono, texto y color semántico. Los errores no desaparecen por timeout. |
| `components/RejoinSessionPanel.tsx` | `consoleMode` optativo para botones Paper y código de última participación en Studio. Session conserva la presentación predeterminada. Mismos callbacks, condiciones y suscripciones. |
| `ENTREGA.md` | Registro breve de la validación visual y limitaciones, sin cambiar estados H1–H4. |
| `docs/ux/implementation/` (nuevo) | Este informe, galería, script de captura local y cuatro capturas reales de Expo web. |

Reutilizados sin modificar: StudioIdentityPanel, useStudioSession, connectSocket, cliente compartido, RejoinSessionPanel y métodos del servicio. Componentes Paper usados: PaperProvider, Button, Text, TextInput, Divider, Icon, ActivityIndicator y TouchableRipple. No se añadieron dependencias ni archivos de ruta.

Los archivos de `docs/ux/proposals/` se conservan completos y se incluyen en este commit como referencia aprobada y destino de los enlaces del informe. Sus conclusiones sobre la referencia remota pertenecen a la auditoría anterior; la comparación actualizada con H4 se registra abajo sin reescribir ese histórico.

## 2. Cambio visible y correspondencia con A

- Encabezado NEXUS compacto y conexión separada del contenido, fondo oscuro **#131018** y variantes claras que respetan la preferencia del sistema.
- «Tus sesiones», crear e ingresar al inicio. Las sesiones aparecen antes del bloque de identidad; filas con código, rol, número de Nodes aceptados, identificador y acceso a la misma ruta existente. El número de Nodes no representa READY.
- El formulario de código se revela bajo su acción sin navegar a otra ruta. Conserva el borrador, los seis caracteres, el valor controlado, las condiciones de edición y el handler original.
- Actualizar sólo aparece con la conexión confirmada, como antes. La lista no inventa caché offline: usa exclusivamente `snapshot.sessions`.
- Reanudar y solicitar reingreso siguen siendo dos acciones distintas. Los botones son MD3 sólo en Studio; no se reorganiza el módulo funcional de Session.
- Identidad y soporte quedan en una sección desplegable al final. El panel **permanece montado** aunque se oculte: conserva sus suscripciones, mensajes y operaciones pendientes. UID/deviceId y recuperación/transferencia continúan accesibles. Los errores del socket se muestran arriba y la pantalla Cuenta conserva su panel de identidad original.
- Controles principales con altura mínima de 48, radios de 12, texto adaptable, filas de altura natural y ancho de lectura máximo de 720. Sin hero decorativo ni una tarjeta por párrafo.

### Diferencias deliberadas respecto de la lámina

1. Se mantiene el orden, los nombres y los iconos actuales de las pestañas: Studio / Dispositivos / Medios / Cuenta. Renombrar y reordenar la navegación queda para la revisión específica posterior.
2. La lámina deshabilitaba crear/solicitar ingreso sin conexión. Aquí se conserva **exactamente** `busy || !service` como condición visual de las acciones, y el handler conserva su rechazo `SOCKET_NOT_CONNECTED`. No se cambia una condición operativa para hacer coincidir el dibujo. Conexión y causa del bloqueo son visibles.
3. No se afirma «sesión activa», READY ni conexión por Node a partir del código o del catálogo; los estados mostrados proceden del snapshot actual. No hay datos ficticios en producción.
4. Los IDs completos siguen en las filas y en soporte, en texto secundario seleccionable. Su traslado a otro detalle está pendiente de navegación; no se eliminan.
5. El índigo antiguo permanece para botones heredados con texto blanco fuera de Studio. Paper usa **#BCB2FF sobre #23184A** en oscuro. Así esta etapa no vuelve ilegibles los controles antiguos ni exige rediseñar otras pantallas.
6. Identidad se despliega en la misma pantalla; no se ha trasladado su lógica a Cuenta ni eliminado ninguna confirmación de transferencia.

## 3. Comparación con H4 y conflictos futuros

Se ejecutó `git fetch origin` sin merge/rebase. La referencia pasó de bfe2cba a **origin/desarrollo@1f66b47**, merge del PR #5. Incluye 301f650 (autorización/routing), 3e287dc (emulador), 315fd12 (reglas/UID) y 7c05541 (evidencia física).

H4 elimina el fallback de control broadcast global, limita comandos heredados al par Controller A → único Node B autorizado/online en una Session inequívoca, exige aceptación también en consultas y restringe la información pending al Controller. Vibración restringe el envío a A y ambas pantallas presentan rechazos de seguridad. Esos archivos no se han tocado en esta etapa ni se han integrado.

No hay solapamiento funcional entre Studio/tema de esta etapa y los cambios H4 revisados. Sí existe riesgo textual en **ENTREGA.md**, donde ambas ramas agregan registros. Resolverlo en una integración posterior preservando ambos historiales. No reemplazar el archivo completo por una rama. `components/RejoinSessionPanel.tsx`, `services/sessionClient.ts` y Studio no tienen cambios H4 desde el ancestro consultado.

Esta rama **no contiene H4**. El éxito de las 103 pruebas locales no certifica sus nuevas pruebas ni su servidor endurecido. La futura integración tendrá que validar el candidato conjunto y los controles heredados; no se simula esa integración ahora.

## 4. Validaciones y resultados

| Verificación | Resultado y límite |
|---|---|
| `npx.cmd tsc --noEmit` | **PASS**, también tras los últimos ajustes visuales. |
| `npm.cmd run lint` | **PASS**, sin errores ni advertencias ESLint. |
| Git Bash: `node --test tests/*.test.cjs` | **103 PASS / 1 SKIP / 0 FAIL**, 104 tests. RTDB real/emulador opcional omitido; no se usa un proyecto productivo. |
| `git diff --check` | **PASS**. |
| Comparación de lógica de Studio | **PASS**: bloque desde estado `code` hasta el return idéntico al de HEAD, normalizando saltos CRLF/LF. Incluye callback de eventos, pending/busy y start(). |
| Comparación de lógica de reingreso | **PASS**: refs, suscripciones, estado, última participación y condiciones de habilitación idénticos. Callbacks de resume/rejoin conservados. |
| Diff de archivos protegidos | **Vacío**: services, server, config, app/session, types, tests, Vibración y Linterna. También intactos Auth, RTDB, CaptureEngine, REC/STOP, almacenamiento y permisos. |
| Compilación web Expo SDK 54 | **PASS**, bundle cliente y render servidor. |
| Vista previa real con Edge headless | **PASS**: hidratación, móvil 390×844 claro/oscuro, escritorio 1280×960, abrir/cerrar formulario de código y capturas PNG. |
| Carga y deshabilitados | Visto el HTML inicial con «Preparando Studio…» y acciones deshabilitadas; después se esperó hidratación. Las capturas finales son del cliente hidratado. `busy`, envío y pending conservan las condiciones previas; no se provocó una admisión real para comprobarlas en relay. |
| Error / desconexión | **PASS visual**: mensajes reales de la app con acceso externo bloqueado en el navegador de prueba, aviso de Firebase Auth y estado Sin conexión. No representan una caída observada del servicio real. |
| Conectado, lista real, aprobación/reanudación | **No probado físicamente ni contra servicios reales**. Proyección y callbacks revisados, suites de servicio pasan. Ver pasos de operador. |
| Cámara / REC / archivo / cuenta real / subida | **No ejecutados** en esta etapa visual. |
| Android/iOS, texto ampliado, TalkBack/VoiceOver | **Pendientes de dispositivo**. La vista web no los certifica. |

En PowerShell, `npx`/`npm` resolvían a scripts .ps1 bloqueados por la política local. Se usaron los lanzadores `.cmd`, sin cambiar esa política. El primer puerto Metro 8081 estaba ocupado; se usó **8091 sólo para Metro**, sin modificar el puerto ni URL del relay.

La primera captura rápida sólo vio SSR y no confirmó interacción. Se corrigió el script para esperar hidratación y tema; se reemplazaron las imágenes y se comprobó que el campo estaba realmente visible después del clic. No se presentan aquellas capturas iniciales como validación final.

Avisos de ejecución existentes/externos al alcance: `app/firebase.ts` aparece como ruta sin export default; React Native Web/Paper muestran deprecaciones de pointerEvents/shadow durante el bundle. No impidieron la compilación ni el render. Se conserva el árbol de rutas por la restricción expresa del operador.

## 5. Vista previa

Abrir [galería de implementación](index.html). Contiene capturas del **código real**, no de los mockups:

- [Móvil oscuro, desconexión/error](studio-dark-mobile.png).
- [Formulario de código desplegado](studio-dark-code.png).
- [Móvil claro](studio-light-mobile.png).
- [Escritorio oscuro](studio-dark-desktop.png).

El script usa un perfil temporal limpio de Edge, navegación a localhost:8091 y bloquea solicitudes Firebase/Cloudinary y WebSocket público. No pulsa conectar, crear, ingresar ni iniciar sesión. La app puede intentar la autenticación habitual al arrancar; esa red se bloquea en el navegador de QA. No se modificó el servicio para obtener las imágenes. El indicador flotante de desarrollo Expo puede aparecer en alguna captura.

## 6. Cómo verlo en Expo y repetir la prueba física

Desde `C:\Projects\Nexus\Nexus`, con el cliente de desarrollo existente compatible con SDK 54:

```powershell
git branch --show-current
git rev-parse --short HEAD
npx.cmd expo start --dev-client --lan --port 8091
```

Abrir el proyecto desde el development client del teléfono. Para vista web, con Metro ya activo, abrir `http://localhost:8091`. No hace falta instalar dependencias ni hacer un build nativo por estos cambios JS. La URL/configuración actual del relay se conserva; no arrancar un segundo relay contra la RTDB compartida.

La base anterior es **e1ac269**, que por sí sola no contiene el rediseño. El commit de esta entrega se identifica con `git log -1 --format=%H --grep='feat(ui): implement Consola stage 1 theme and Studio'`. El SHA se entrega al operador tras crearlo. No hacer pull, checkout o reset sobre esta copia para visualizarla.

Pasos del operador:

1. En tema oscuro comprobar fondo #131018, acciones legibles, barra inferior actual y estado Sin conexión. Cambiar al tema claro del sistema y volver; revisar texto ampliado, safe areas y teclado.
2. Abrir/cerrar Ingresar por código, escribir hasta seis caracteres y comprobar que el borrador se conserva al plegar. Revisar disabled durante preparación/envío con el entorno habitual; un error de conexión permanece visible.
3. Abrir Identidad y soporte y comprobar UID/deviceId y acciones de identidad disponibles según el estado real. Ninguna transferencia debe saltar su confirmación o verificación de ambas cuentas.
4. Con el relay autorizado habitual, conectar y esperar confirmación. Actualizar sesiones y comprobar sólo las autorizadas; abrir una existente por su código. Regresar no debe cerrar Session.
5. Crear sesión y hacer que otro teléfono solicite ingreso; verificar espera/rechazo/aceptación con los mismos handlers. Como Node, comprobar última participación, reanudar y solicitar reingreso como acciones distintas. No dar por READY al reconectar.
6. Regresión con Controller y dos Nodes: roles independientes, READY fresco, REC/STOP y dos originales, tal como ya exige ENTREGA. Esta etapa no altera esa pantalla ni certifica hardware; verificarla antes de distribuir una versión.
7. Revisar Cuenta, Dispositivos, Medios y una sesión existente para detectar efectos no deseados del tema global. No usar los cambios H4 como si estuvieran integrados en esta rama.

Para repetir sólo las capturas, con Metro local ya activo:

```powershell
node docs/ux/implementation/capture-studio.cjs
```

## 7. Próximo punto de revisión

El operador aprobó visualmente esta primera etapa y autorizó su commit exclusivo. TypeScript, lint/ESLint y la suite se repitieron antes de preparar ese commit: **103 PASS / 1 SKIP / 0 FAIL**; diff protegido vacío. La revisión en dispositivos sigue pendiente. Session/Controller/Node sólo recibe un plan separado hasta nueva autorización. No se han cambiado URLs ni contratos de navegación, integrado H4, ni hecho push, merge, rebase, build o despliegue.
