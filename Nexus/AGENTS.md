# NEXUS Studio · Instrucciones para Codex

Trabaja en `desarrollo`. Lee [ENTREGA.md](ENTREGA.md), comprueba la rama y el estado del árbol y toma el primer hito pendiente. Implementa el comportamiento completo, desde la pantalla hasta el dispositivo que lo ejecuta. Cada hito deja un commit verificable. El equipo usa [GUIA_DE_TRABAJO.md](GUIA_DE_TRABAJO.md) para la prueba física y el PR final hacia `main`.

Para esta entrega, estos tres documentos sustituyen la asignación DEV-A/DEV-B, la planificación de tres semanas y los prompts por módulo. Consulta [la arquitectura](README/DOCS/ARCHITECTURE.md) para los contratos y [el backlog](README/DOCS/BACKLOG.md) para el detalle de una funcionalidad. Los ejemplos históricos de GitHub y Codex son material de consulta.

## Contratos que debe conservar la implementación

- Usa Expo SDK 54. Antes de escribir código consulta la documentación de la versión instalada. [Expo SDK 54](https://docs.expo.dev/versions/v54.0.0/)
- Centraliza la dirección del relay en `config/server.ts`. IP y PORT son manuales y requieren petición explícita para editarlos. Reutiliza el único cliente de `services/socket.ts`. Mantén los eventos de presencia existentes.
- H3.4a: `config/relay.ts` resuelve la única URL de conexión. En desarrollo usa la LAN manual como alternativa; `EXPO_PUBLIC_RELAY_URL` permite sustituirla. Preview/producción exige `wss://` explícita. El puerto del proceso servidor usa `PORT` y no cambia el puerto de conexión de la app.
- Autentica todo socket, también en LAN, antes de presencia o Studio. `studioIdentity` reutiliza Firebase Auth o ingreso anónimo persistente; habilitar Anonymous Authentication en el proyecto. `Connected` significa confirmación del relay. Firebase Admin sólo existe en `server/`, con `FIREBASE_PROJECT_ID` y credenciales privadas ADC (`GOOGLE_APPLICATION_CREDENTIALS`) o `FIREBASE_ADMIN_CREDENTIALS`; nunca EXPO_PUBLIC ni archivos secretos versionados. UID autentica el transporte; la aceptación del Controller sigue autorizando la Session.
- El relay sirve GET /health y WebSocket en el mismo puerto sobre 0.0.0.0. `render.yaml` prepara Node 24, raíz Nexus/, npm ci y npm run relay, sin despliegue. Desde H3.4b, Sessions y vínculos UID/deviceId son durables en RTDB mediante FIREBASE_DATABASE_URL privada del servidor. Persistir antes de confirmar; /health no está ready hasta recuperar. Desconectar conserva miembros offline, retira READY y no cierra Session. Reiniciar nunca repite REC/STOP ni infiere archivos. SESSION_CLOSE autorizado conserva historial; H3.4c completará reapertura/reanudación en interfaz y H3.4d despliegue/prueba sin laptop.
- Un Controller coordina N Nodes dentro de una Session. El código permite solicitar ingreso y el Controller acepta al Node. Mantén identidad por dispositivo y estado por sesión. Dos es el mínimo de la prueba física.
- Implementa el protocolo en el servicio y el relay. El envelope lleva protocolVersion, messageId, type, sessionId, senderId, sentAt, payload y targetId cuando corresponda. El relay comprueba membresía, rol y destino. Un mensaje Studio inválido debe rechazarse antes de llegar al broadcast heredado.
- START y STOP comparten el takeId creado por el Controller. Los comandos críticos tienen ACK por Node y se deduplican por messageId. Distingue recepción, grabación activa y archivo guardado. El Controller muestra fallos parciales.
- El Node controla permisos, cámara, parada y archivo mediante CaptureEngine. Conserva el original en almacenamiento local persistente al finalizar. Una desconexión durante REC permite continuar y detener desde el Node.
- Separa control, preview y medios. Envía por el relay estados y referencias. Sube archivos con el adaptador Cloudinary. Guarda primero la captura con sessionId, takeId, nodeId y URI local. Conserva los medios importados previamente y evita perder un ángulo si los dos resultados llegan juntos.

## Verificación y relevo

Al cambiar de cuenta, conservar UID mediante vinculación del anónimo cuando sea
posible. Una colisión requiere consentimiento y prueba Firebase de ambas identidades
antes de transferir la instalación; deviceId/código nunca prueban propiedad. No
prometer recuperar un anónimo abandonado. Studio descubre Sessions activas sólo
para el Controller UID/deviceId autorizado. Desmontar pantallas no cierra Session;
solicitudes pendientes sobreviven a Controller offline/reinicio del relay.
H3.4c: SESSION_RESUME verifica la membresía UID/deviceId durable y conserva nodeId
y rol. Reiniciar/conectar no autoriza por código ni recupera READY automáticamente:
exigir confirmación nueva con readyEpoch actual. Caducar destinos de comandos de
conexiones interrumpidas; no repetir REC/STOP ni inferir resultados/ACK. Reconciliar
originales y cerrar explícitamente la Take interrumpida antes de una nueva.
H3.4d: DEPLOY_RELAY.md y APK_PREVIEW.md son la revisión previa a push/despliegue/build
remoto. Preview exige entorno público separado y URL wss real; nunca credenciales
Admin en EAS. Compilar desde copia aislada del commit, conservar firma y datos al
instalar. No marcar H3 verificado sin la prueba física con laptop apagada.

Desde el directorio de la aplicación ejecuta `npx tsc --noEmit`, `npm run lint` y `node --test tests/*.test.cjs` (Git Bash). Añade pruebas para routing, aislamiento y comandos duplicados cuando implementes esos comportamientos. En ENTREGA registra qué pasó, qué falló y qué falta probar físicamente. Entrega al operador el SHA y los pasos exactos para repetir la prueba. Marca el hito como verificado cuando exista la evidencia indicada.
