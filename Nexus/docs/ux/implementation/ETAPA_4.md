# A / Consola · Etapa 4 · Validación del candidato H4 + UI

2026-11-16 · Rama devb/ux-etapas-3-4 · Integración local 6379986.
El candidato contiene ambas bases verificadas: 9f4f20d (UI) y 1f66b47 (H4).
Esta entrega completa implementación y QA disponible; no certifica producción
ni convierte fixtures en una prueba física de cámara, Auth o reproducción.

## Matriz de validación

| Verificación | Resultado | Alcance |
|---|---|---|
| Ancestría H4 y UI | PASS | merge-base --is-ancestor de ambas bases contra HEAD |
| TypeScript | PASS | npx.cmd --no-install tsc --noEmit |
| Expo lint y ESLint adicional de componentes/tests | PASS | Sin modificar reglas ESLint |
| Suite completa con Firebase RTDB Emulator | PASS: 117 / 0 FAIL / 0 SKIP | 114 H4 + 3 nuevas de navegación; proyecto demo, entorno saneado, sockets de test sólo loopback |
| Navegación: eventos, destino activo, rail, retorno desde herramientas y rutas | PASS | Pruebas de componente transpilado en VM y rutas conservadas; sin hardware |
| Auditoría de lógica protegida | PASS | Diff exacto contra merge 6379986 en servicios, relay, configuración, Session/cámara/owners, legacy H4, tipos y dependencias; efectos/handlers de Cuenta exactos |
| Navegación/layout web | PASS: 10 comprobaciones; stage4-navigation-results.json | Rutas reales, red externa bloqueada; barra/rail, búsqueda y estados de Biblioteca, Cuenta/herramientas, deep links y atrás |
| Session con fixtures | PASS: 12 comprobaciones | REC único, pending, rol/ACK, diálogos, permiso/offline, STOP local y reintento, cambio de ancho y propietario conservado; slot de cámara sintético |
| Galería / revisión visual | PASS local | Capturas stage4-*.png; claro/oscuro, móvil/rail, estados operativos sintéticos. No son vídeo real |
| git diff --check | PASS | Candidato sin errores de whitespace |
| Cámara/ExpoVideo, navegación durante REC y reproducción en Android | NO VERIFICADO | Requiere APK development compatible y tres teléfonos |
| TalkBack/VoiceOver, teclado nativo, escala de fuente/orientación/safe areas reales | NO VERIFICADO | Responsable: operador con DevA/DevB |
| Relay/Auth/RTDB/Cloudinary reales y firma APK | NO VERIFICADO en esta etapa | Sin acceso ni escritura de producción; ensayos sólo tras coordinación |

## Verificadores e incidentes corregidos

verify-session-logic.cjs se conserva como histórico de Etapa 2. Su baseline H3
43d0d0b y su prohibición de cambios en tabs/tests/servidor ya no son aplicables a
este candidato integrado. Se inspeccionó ese alcance y se complementa, sin relajar
la seguridad, con verify-stage4-logic.cjs: exige igualdad exacta con la verdadera
base combinada para todos los propietarios y contratos protegidos. No se presenta
el verificador histórico como PASS en el candidato nuevo ni se sobrescribe su JSON.

Se corrigieron durante QA: fallback de tipo inalcanzable en una etiqueta de
Biblioteca; dos aserciones iniciales del test (arrays de VM y expresión regular);
contraste de botones/campo blanco en Cuenta; whitespace JSX. En el capturador de
fixtures se corrigieron viewport/fondo/fuente local y CORS. React Navigation puede
conservar pantallas inactivas montadas: la comprobación contextual usa ruta y
encabezado, no ausencia absoluta de nodos DOM históricos. Resultados finales y
capturas sustituyen los intentos preliminares, sin afirmar ensayos nativos.

Advertencias existentes: app/firebase.ts sin export default en Expo Router,
MODULE_TYPELESS_PACKAGE_JSON y deprecaciones de estilos web de dependencias.
No se cambiaron rutas funcionales, módulos o versiones para ocultarlas.
npm ci instaló las dependencias fijadas: 50 avisos (9 bajos, 23 moderados, 17 altos,
1 crítico); herramientas aisladas de emulador: 19 (14 moderados, 5 altos).
No se ejecutó audit fix, no se modificaron lockfiles ni se aprobaron scripts nuevos.

## Reproducción de QA local

Desde Nexus-DevB-UX/Nexus, Node 24.19.0, dependencias de la app instaladas con npm ci:

```powershell
npx.cmd --no-install tsc --noEmit
npm.cmd run lint
node docs/ux/implementation/verify-stage4-logic.cjs
npm.cmd ci --prefix tests/emulator/tools --ignore-scripts
$env:NEXUS_EMULATOR_JAVA_HOME='C:/Program Files/Eclipse Adoptium/jre-21.0.6.7-hotspot'
node tests/emulator/run.cjs
git diff --check
```

Java 21 es sólo selección del proceso de tests, no cambio del sistema. No arrancar
server/index.js contra producción. El runner del emulador evita cargar .env y
usa demo-nexus-h34b con host loopback; no requiere credenciales reales.

Vista web, en terminal de QA sin variables reales:

```powershell
npx.cmd expo start --offline --port 8091
node docs/ux/implementation/capture-navigation.cjs
node docs/ux/implementation/capture-session-stage4.cjs
```

Los dos capturadores se ejecutan por turnos, con Edge headless y perfiles temporales,
puertos de depuración locales. Bloquean servicios externos. El capturador Session
sirve fixtures en 8092 y el de Biblioteca en 8093; 8091 es Metro, NO relay.
Galería local stage4-gallery.html, nueva evidencia separada de etapas anteriores.

## Prueba Android pendiente · Controller + dos Nodes

Responsables: operador y DevA/DevB. Preparar con cámaras detenidas un development
client compatible con Expo SDK 54, ExpoVideo, cámara y almacenamiento existentes.
No reinstalar/desinstalar ni borrar datos. Si falta un módulo nativo, detenerse,
registrar error y revisar compatibilidad/firma antes de cualquier build autorizado.

1. Preparar sólo variables públicas autorizadas en el entorno local de esta copia,
   sin copiar credenciales Admin ni secretos. No se copió .env de otras carpetas.
   Si se ensaya Render, fijar EXPO_PUBLIC_RELAY_URL explícita en la terminal para
   evitar la IP LAN heredada de la otra laptop; no editar IP/PORT. Coordinar SHA
   cliente y relay: un cliente nuevo NO despliega automáticamente H4 en Render.
2. Detener únicamente el Metro QA de esta copia antes de arrancar el modo físico:
   npx.cmd expo start --dev-client --lan --clear --port 8091.
   Teléfonos alcanzan Metro por la IPv4 LAN actual del operador. No iniciar otro
   relay contra la RTDB compartida. Arrancar/recargar bundle sólo sin REC/guardado.
3. Recorrer Studio/Biblioteca/Dispositivos/Cuenta, atrás, enlaces a Session y medios,
   herramientas y diagnósticos; regreso nunca cierra Session. No abrir Linterna
   mientras una captura o pendingSave bloquee salir. Revisar teclado y fuente grande.
4. Conectar/autenticar, crear/reanudar Session, aceptar/rechazar individualmente,
   roles con ACK y READY real por Node. Denegar cámara de forma controlada y
   comprobar que no se anuncia READY. Restaurar permiso/preparación normalmente.
5. REC/STOP coordinados, mismo takeId, ACK/ejecución/guardado separados y dos
   originales reproducibles. Cambiar orientación/tema y desplegar detalles sin
   perder cámara, propietario ni STOP; atrás durante busy/pendingSave debe protegerse.
6. Cortar red de un Node durante REC: continúa, STOP/guardado local accesibles;
   el otro recibe STOP remoto. Reproducir ambos, reanudar mismo nodeId/rol y READY
   nuevo, cerrar toma interrumpida con advertencia; otra Take con ID diferente e
   historial sin duplicados. No inferir ACK/archivo ni repetir comandos antiguos.
7. Subir/reintentar/comunicar desde propietario, dos ángulos simultáneos y reproducción
   remota; original conservado si falla subida. Importar un medio desde Session,
   abrir su detalle desde Biblioteca y conservar importaciones anteriores al reabrir.
8. Revisar cierres/Cancelar y confirmaciones de cuenta sin ejecutar transferencias
   de identidades reales como prueba. Colisiones/transferencias y ataques entre
   sesiones se ensayan en entorno aislado autorizado, junto con capacidades H4:
   Controller→único Node aceptado/online permitido; emisores/Session ajenos rechazados.
9. TalkBack Android (VoiceOver si hay iOS), foco, labels, contraste, teclado, áreas
   táctiles y safe area del dock. No dar PASS por estas capturas web.

Registrar SHA cliente/relay, build ID, modelos/red, sessionId, nodeId/takeId,
resultados y evidencias sin secretos. Las escrituras de ensayo en Firebase y
subidas reales Cloudinary requieren coordinación; esta entrega no las ejecuta.
H4 funcional físico previo pertenece a APK H3: no se recicla como aceptación de UI.

## Entrega Git

Merge sólo local autorizado; implementación y QA en commits independientes con
mensajes identificables. Obtener SHA final con git rev-parse HEAD; no dejar un
SHA circular inventado en el informe. Sin push, PR, merge remoto, despliegue ni
build productivo. Siguiente paso recomendado: revisión de DevA/operador y prueba
física del candidato, antes de solicitar publicación.
