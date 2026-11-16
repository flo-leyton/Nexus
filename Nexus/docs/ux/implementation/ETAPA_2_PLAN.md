# Etapa 2 · Session A / Consola · Plan para autorización

**Plan histórico, sustituido por autorización integral del operador.** La Etapa 2 se implementa completa sin aprobaciones intermedias; ver [ETAPA_2.md](ETAPA_2.md). Se conserva el plan para documentar las decisiones y riesgos originales.

**Sólo planificación. No autoriza implementación.**

Actualización del operador: **2A autorizada**. Su implementación y validación se registran en [ETAPA_2A.md](ETAPA_2A.md). 2B y 2C continúan pendientes; la secuencia siguiente no autoriza ejecutarlas automáticamente.

Base revisada: `feat/ui-polish@43d0d0b859ac0a67bfc9ffa768c8261f32c5c21f`.
Ese commit cierra exclusivamente la Etapa 1: tema/Studio, documentación, capturas y referencia A aprobada. TypeScript, lint/ESLint y suite repetidos: **103 PASS / 1 SKIP / 0 FAIL**. Ningún cambio de red, servicio o Session en ese commit. Árbol limpio inmediatamente después de crearlo.

Este plan se escribe **después** del commit y queda separado, sin commit. No se modificó código de producción para la Etapa 2. La prueba física de la Etapa 1 sigue pendiente; su aprobación fue visual.

## 1. Diagnóstico y objetivo

Session mezcla admisión, cierre administrativo, grabación, lista de miembros, cámara local, historial, originales e importación en un ScrollView. El Controller debe leer estados y coordinar; el Node debe ver su cámara, preparación y parada local. La separación propuesta es visual y usa el rol ya confirmado: no crea roles, rutas ni autorizaciones nuevas.

Problemas que resolver, en orden:

1. REC/STOP y parada local pueden quedar fuera del viewport.
2. La vista de cámara Node aparece después de bloques administrativos y de miembros.
3. ACK, grabación activa, archivo guardado y subida se explican con párrafos extensos, aunque son fuentes/estados distintos.
4. El cierre de Session compite visualmente con operación; las dos confirmaciones de cierre tienen consecuencias distintas.
5. IDs y metadatos dominan el espacio, mientras cada Node requiere un resumen legible de conectividad, rol y preparación.

## 2. Composición propuesta, conservando navegación

La única pantalla continúa siendo `/session/[id]`, con los mismos parámetros, retorno y protección al salir. No modificar tabs, Stack, URLs, hooks de foco ni introducir rutas Controller/Node. **Operación / Tomas y medios** permanece como arquitectura de información objetivo de la propuesta A; en esta etapa se expresa con secciones dentro de la pantalla, sin nuevas pestañas, tabs ocultables o cambio de ruta.

### Controller

```text
←  Sesión · código                         Relay / actualizar
   Controller

Nodes aceptados                         online / aceptados
  Node · …ID  | rol | conectado/offline | READY / NO LISTO
  Permiso / cámara / motor / motivo que impide preparación
  Editar rol → mismo editor y ACK

Toma actual · takeId
  Por Node: REC ACK | fase de captura | STOP ACK | resultado
  Fallo parcial/desconocido con explicación persistente

Solicitudes: aceptar/rechazar individualmente
Administración: detalles y cierre explícito de Session
Historial / ángulos / originales / importar (se conservan)

Controles de toma visibles: REC y STOP según habilitación real
```

Prioridad: lista de Nodes y resultado de cada uno. No hay mosaico de vídeo remoto. El cierre de toma interrumpida se presenta en recuperación con su advertencia completa; no se convierte en un STOP ni en confirmación de archivo. No ocultar solicitudes o funciones mientras se decide una reorganización posterior.

### Node

```text
←  Node · …ID                  Relay conectado / desconectado
   Sesión y rol cuando el snapshot los confirma

Estado local: preparar / listo / grabando / guardando / error
READY / NO LISTO + motivo / confirmación nueva si corresponde

Vista de cámara local (una sola CameraView)
Información fuera del encuadre: vídeo silenciado y toma

Preparar / conceder permiso / confirmar READY / prueba local
Error de guardado → conservar pantalla y reintentar

Parada local visible: DETENER Y GUARDAR (según fase existente)

Información secundaria / originales / reproducción / subida
```

Desconectado durante REC, la experiencia sigue mostrando la captura local y su parada, aunque el snapshot de Session ya no esté disponible. Si faltan código o rol confirmados, no inventar una caché ni una membresía para completar el título; conservar nodeId/sessionId de la identidad local existente y señalar la falta de confirmación.

### Referencias visuales oficiales

- [Controller preparado, Node offline en REC y Biblioteca](../proposals/02-operacion.png).
- [Fallo parcial, READY caducado y guardado fallido](../proposals/03-estados.png).
- [Controller en pantalla grande](../proposals/04-adaptable.png).
- [Permiso denegado](../proposals/06-permiso-ingreso.png).

Son mockups estáticos con datos representativos. Se reutilizan como referencia de A; no se diseña una dirección nueva ni se presentan como Session implementada.

## 3. Archivos y componentes previstos

| Archivo | Cambio previsto | Protección |
|---|---|---|
| `app/session/[id].tsx` | Composición y estilos de encabezado, filas y secciones; conexión/avisos con componentes Paper. | Mantener estado `verified`, `localNode`, `captureBusy`, refs, refresh/decide/importar/cerrar y sus condiciones. No cambiar hooks ni rutas. |
| `components/session/SessionHeader.tsx` (nuevo) | Presentación de rol, conexión, código, identificadores y acciones existentes. | Recibe datos/callbacks; no conoce sockets ni tiene efectos de dominio. |
| `components/session/SessionMemberRow.tsx` (nuevo) | Fila por deviceId con nodeId, rol, conectividad, READY/motivos y detalles legibles. | Claves estables; usa resultados actuales de readinessReasons y flags existentes. No asume dos Nodes. |
| `components/NodeRoleEditor.tsx` | TextInput/Button/feedback MD3 en la fila de Controller. | Rol libre de 1–64 caracteres, mismo borrador, ACK, suscripción y handler. No restringir a MAIN/SIDE. |
| `components/ControllerTakePanel.tsx` | Apariencia de REC/STOP, resultados por Node, recuperación e historial. | Conservar refs, pending, timer de 15 s, suscripción, run/close y canStart/canStop/canClose. |
| `components/session/TakeNodeStatus.tsx` (nuevo) | Presentación separada de ACK REC/STOP, fase, error y referencia de captura. | Componente puro; no combina todo en un indicador de éxito. |
| `components/session/ControllerTakeControls.tsx` (nuevo si se necesita) | Presentación del bloque de botones, con callbacks de ControllerTakePanel. | No crear un segundo ControllerTakePanel ni otra instancia de su estado. Una acción disponible por comando. |
| `components/NodeReadinessPanel.tsx` | Sólo JSX/estilos de preparación, cámara, aviso y parada local, en una fase propia. | Engine, coordinator, refs, efectos, canMount, generation, permisos y condiciones intactos. |
| `components/session/NodeCaptureStatus.tsx` (nuevo) | Etiquetas, razones y errores a partir del estado recibido. | Sin motor, hooks de foco, timers o captura dentro del componente visual. |
| `components/session/NodeSafetyControls.tsx` (nuevo si se necesita) | Presentación de STOP local/reintento con callbacks del owner actual. | No llamar stop en montaje, render o efecto; no depender de la conexión para la parada. |
| `components/studio/StudioStatus.tsx`, tokens y tema MD3 | Reutilización de los recursos de Etapa 1. | Ajustar sólo si falta una variante visual; comprobar también Studio si cambia un componente compartido. |
| Paneles de medios/locales/reingreso | Reutilizar, manteniendo acciones y ubicación accesible. | No retocar sus servicios, lectura, subidas ni reproductores como trabajo incidental. Su pulido específico puede quedar para otra revisión. |

No se modifican `services/*`, `server/*`, `config/*`, Auth/RTDB, protocolos, permisos nativos, modelos, CaptureEngine, coordinatedCapture ni almacenamiento. No se instalan dependencias.

## 4. Secuencia: una unidad verificable por vez

### 2A · Encabezado y lectura de Nodes de Controller — primer alcance recomendado

- Implementar SessionHeader y SessionMemberRow con Paper, colores/espacios de Consola, texto accesible y conexión separada.
- Aplicar el editor de rol con su handler original y conservar todas las acciones de admisión/cierre.
- Cambiar sólo los bloques de presentación de Controller y el encabezado común. No mover NodeReadinessPanel, no cambiar sus ancestros, key, condiciones de montaje o ubicación de propietario.
- No modificar aún ControllerTakePanel ni intentar un dock fijo. Sus controles actuales permanecen accesibles.
- TypeScript/lint/tests, diff de lógica, capturas de preparado/no listo/offline y revisión del operador. Detenerse antes de 2B.

### 2B · Operación coordinada de Controller — requiere revisión posterior

- Rediseñar ControllerTakePanel: distinguir recepción, captura y archivo por Node; fallo parcial/desconocido; cierre interrumpido y advertencia existentes.
- Presentar REC/STOP visibles fuera del scroll largo, conservando el owner actual del comando. Evaluar un bloque visual en Portal de Paper, sin mover el panel propietario ni duplicar controles. Su montaje visual debe limitarse al foco de esa Session y respetar safe areas/teclado; no puede quedar sobre otra pantalla.
- Si el dock exige cambiar el estado, el ciclo de vida del panel o las condiciones operativas, detenerse y presentar ese cambio para aprobación específica. No introducir stores nuevos para resolver el layout.
- Revisión independiente con dos Nodes, ACK separados, fallo parcial, STOP y recuperación; detenerse antes de 2C.

### 2C · Preparación, cámara y seguridad de Node — requiere revisión y dispositivo

- Cambiar únicamente presentación en NodeReadinessPanel primero: estado, razones, permiso, confirmación READY, cámara y reintento de guardado. Conservar su ubicación y ownership mientras se valida esa unidad.
- Una entrega posterior dentro de 2C puede elevar el encuadre y resolver el dock de parada. Revisar expresamente el árbol React antes de hacerlo: la instancia de NodeReadinessPanel no debe depender de que `session` esté verificada/online ni de una sección expandida.
- Para parada fija, evaluar proyectar únicamente el componente visual de botones mediante Portal; la cámara y el engine permanecen en su owner. Nunca mover CameraView a un Portal o montar una segunda vista para conseguir el efecto.
- Validación física de continuidad offline, STOP, guardado/reintento, foco y segundo plano antes de aceptar el cambio. Si hace falta mover CaptureEngine a otro propietario, es un cambio arquitectónico fuera de esta autorización visual.

Cada subetapa entrega diff, capturas, resultados, limitaciones y revisión. No ejecutar 2A→2B→2C automáticamente.

## 5. Riesgos de ciclo de vida y medidas concretas

| Riesgo constatado en el código | Medida obligatoria |
|---|---|
| NodeReadinessPanel crea CaptureEngine mediante useState y registra coordinateCapture/registerCaptureHandler. Al desmontarse cancela coordinación y llama engine.deactivate(). | Mantener una sola instancia y el mismo ownership. No condicionar ese owner a Controller/Node según un snapshot que desaparece; la ruta ya conserva `localNode` fuera del snapshot verificado. |
| Cambiar de padre/tipo de ancestro en React puede remontar aunque `key={nodeId}` permanezca igual. | Comparar árbol/ancestros y comprobar montaje, además de claves. No usar `key` ligada a tema, ancho, fase, takeId o conexión. No alternar entre dos árboles de cámara para móvil/tablet. |
| canMount mantiene CameraView durante busy; `key={generation}` invalida callbacks viejos. | Preservar ambas expresiones y el ref. No reemplazar la cámara con skeleton/placeholder al perder relay, al cerrar detalles o mientras guarda. |
| Foco y AppState activan preparación o desactivación; la desactivación intenta STOP/guardado. | Sin nuevos hooks de foco ni efectos de preparar/detener. No presentar grabación en segundo plano como capacidad. No abrir otra cámara/linterna durante captura. |
| `onBusyChange(engine.isBusy() || pendingSave)` alimenta `usePreventRemove(captureBusy)` en Session. | Mantener callback y semántica: starting/recording/saving y pendingSave siguen protegiendo salida. El aviso de guardado fallido no es descartable como si ya hubiera archivo. |
| Perder relay elimina el snapshot; `accepted` puede quedar falso mientras el motor local sigue grabando. | Estado local y parada deben sobrevivir visualmente a esa pérdida. No cambiar el owner por una pantalla de “sin autorización”. No deshabilitar STOP por conexión o accepted. |
| Los controles actuales tienen condiciones específicas: STOP local sólo se habilita en recording; reintento cuando pendingSave y no busy. | Conservar condiciones exactas. Visible no significa habilitado en cualquier fase; no prometer una nueva capacidad de cancelar starting. |
| Reconectar/restaurar membresía no recupera READY automáticamente. | Confirmación actual con readyEpoch, misma acción de confirmNodeReady; sin confirmación desde render/efecto o apertura de pantalla. |
| ControllerTakePanel mantiene pending/request y timer de respuesta. | El componente visual de dock no puede tener una segunda copia de run/close, otro timer o retransmisión implícita. |
| REC opera sobre Nodes online según el código actual; miembros offline pueden permanecer en Session. | Mostrar online/aceptados y motivos por separado. No añadir política “todos los miembros deben estar online”, selección nueva de destinos ni regla “exactamente dos”. |
| ACK recibido no implica captura activa; saved no implica subida; desconexión no demuestra error de archivo. | Etiquetas y fuentes distintas; guardar “desconocido” sin inferencias. No inventar progreso porcentual, duración, batería, espacio o preview remoto. |

Los cambios se desarrollarán/actualizarán con los dispositivos sin captura activa; Fast Refresh o recargar el bundle durante REC no es una prueba de continuidad ni una operación segura prometida por este rediseño.

## 6. Validación prevista después de cada autorización

- `npx.cmd tsc --noEmit`, `npm.cmd run lint` y ESLint de nuevos módulos si la orden normal no los cubre.
- Git Bash: `node --test tests/*.test.cjs`. Comparar el bloque de estado/efectos/handlers antes y después; revisar que el diff de servicios/configuración siga vacío.
- Capturas de la implementación con fixtures claramente rotulados para estados que no se reproduzcan en vivo. Las capturas web no prueban CameraView nativa ni guardado real.
- Controller: cero Nodes, Node no listo/permiso denegado, dos READY, solicitud offline, rol esperando ACK, REC recibido/iniciando/grabando, STOP/guardando/saved, fallo de un Node y resultado desconocido. Mantener historial/importados y advertencias completas de ambos cierres.
- Node físico: permiso sin comprobar/denegado sin poder pedir otra vez, preparar, READY caducado, grabación coordinada y prueba manual diferenciadas, pérdida de red, parada local, archivo reproducible, error de guardado y reintento cuando pueda reproducirse de forma controlada.
- Continuidad: actualizar snapshot, cambiar tamaño/tema y ver detalles no deben crear otra instancia/CameraView. Atrás sigue bloqueado durante busy/pendingSave; segundo plano conserva la política actual de intento de parada/guardado.
- Controller + dos Nodes, tomas repetidas, mismo takeId por comando, ACK individuales, ningún replay al reconectar; cerrar toma interrumpida explícitamente antes de una nueva y conservar originales.
- Contraste, 48 dp, texto ampliado, teclado, safe areas, TalkBack/VoiceOver y foco de menús/diálogos. No dejar un Portal de controles sobre otra pantalla.

## 7. H4, alcance excluido y aprobación

La referencia local `origin/desarrollo@1f66b47` incorpora H4; esta rama no lo integra. Las fuentes Session/ControllerTakePanel/NodeReadinessPanel/CaptureEngine revisadas no presentan diferencias frente a esa referencia, pero los endurecimientos del relay y de Vibración/Linterna siguen pendientes de integración coordinada. No certificar H4 con la suite de esta rama ni modificar esos controles durante el pulido.

También quedan fuera: nuevas rutas/secciones navegables, reconexión automática, cambio de política READY/REC/STOP, background recording, preview remoto, multiview, QR, nueva identidad, subida automática, cambios de firma/build/despliegue y traslado del engine a un store.

Decisiones propuestas, máximo dos:

1. **Autorizar sólo 2A** (recomendado): encabezado y filas Controller, dejando controles de toma y Node intactos hasta revisión separada.
2. **Confirmar la secuencia 2A → revisión → 2B → revisión → 2C**, conservando navegación y ownership; cada implementación requiere su autorización. Cualquier necesidad de cambio funcional se eleva antes de actuar.

Se espera la autorización explícita del operador. La [skill aplicada](../../../.agents/skills/nexus-ux-ui/SKILL.md), fase 2, paso 7, indica: **“Detente aquí. Espera aprobación explícita del usuario antes de implementar.”** En este caso coincide con el límite pedido por el operador.
