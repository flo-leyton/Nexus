# NEXUS Studio · Relevo técnico para DEV-A

Corte del 17 de noviembre de 2026. Este relevo corresponde a la rama pública `devb/ux-etapas-3-4` de `flo-leyton/Nexus`. El SHA de la versión que descargues se obtiene con `git rev-parse HEAD`.

## 1. Qué contiene la rama

- H4 integrado desde `desarrollo@1f66b47` y Consola etapas 1 y 2 desde `feat/ui-polish@9f4f20d`, unidos en `6379986`. La navegación y Biblioteca de la etapa 3 se incorporaron en `c8d9ce5`, y la validación de etapa 4 en `146a926`.
- El traslado de `app/firebase.ts` a `config/firebase.ts` conserva la inicialización y persistencia de Firebase. La mitigación Yoga conserva montados los propietarios de captura y consola. Ambas correcciones incluyen sus diagnósticos y quedan pendientes de comprobación nativa.
- `desarrollo`, `feat/ui-polish` y `main` siguen siendo referencias independientes de esta entrega.

## 2. Clonar y ejecutar

Git Bash con Node 24 y npm:

```bash
git clone --branch devb/ux-etapas-3-4 --single-branch https://github.com/flo-leyton/Nexus.git Nexus-relevo
cd Nexus-relevo
git rev-parse HEAD
cd Nexus
npm ci
```

Si ya tienes un clon, ejecuta `git fetch origin refs/heads/devb/ux-etapas-3-4:refs/remotes/origin/devb/ux-etapas-3-4` y `git switch --track origin/devb/ux-etapas-3-4` para crear la rama local. Si ya existe, cámbiate a ella con `git switch devb/ux-etapas-3-4` y actualízala con `git merge --ff-only origin/devb/ux-etapas-3-4`. Registra el SHA junto con tus evidencias. El lockfile fija Expo 54.0.37. También puedes descargar el ZIP de la rama en GitHub y abrir el subdirectorio `Nexus/` que contiene `package.json`.

### Configuración cliente

Solicita al operador los valores públicos del entorno de ensayo aprobado. Puedes configurarlos en tu `.env` local ignorado por Git. Los valores `EXPO_PUBLIC_*` quedan visibles en el bundle.

- Relay: `EXPO_PUBLIC_RELAY_URL` con la URL `wss://` aprobada de Render. En desarrollo, sin override, el cliente usa la LAN de `config/server.ts`.
- Firebase: `EXPO_PUBLIC_FIREBASE_API_KEY`, `EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN`, `EXPO_PUBLIC_FIREBASE_DATABASE_URL`, `EXPO_PUBLIC_FIREBASE_PROJECT_ID`, `EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET`, `EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID`, `EXPO_PUBLIC_FIREBASE_APP_ID`. Usa la configuración cliente del mismo proyecto que el relay y confirma que el proveedor anónimo está habilitado.
- Cloudinary: `EXPO_PUBLIC_CLOUDINARY_CLOUD_NAME` y `EXPO_PUBLIC_CLOUDINARY_UPLOAD_PRESET`, con el preset unsigned aprobado.
- Si administras un relay de ensayo, consulta [DEPLOY_RELAY.md](../DEPLOY_RELAY.md) para `PORT`, `FIREBASE_PROJECT_ID`, `FIREBASE_DATABASE_URL` y Firebase Admin. Las credenciales Admin, archivos de cuenta de servicio y claves de firma se gestionan fuera de Git, EAS cliente y la documentación. Usa una RTDB aislada si levantas otro relay.

Para Android con un Development Build compatible ya instalado, inicia Metro desde **este checkout** con `npx expo start --dev-client --lan --port 8092`, usando un puerto libre, y abre la URL mostrada desde el cliente en la misma red. Comprueba que el bundle corresponde al proyecto elegido. El diagnóstico anterior encontró Metro 8091 sirviendo el checkout original. Para inspección web ejecuta `npx expo start --web`. La vista web sirve para revisar navegación y layout. La prueba de cámara, permisos, grabación y reproducción corresponde a Android.

## 3. APK Android

| Elemento | Estado |
| --- | --- |
| APK histórico H3 | EAS Build ID `f6cfefce-9958-4ddd-acee-8eaa4f32ad9f`, perfil `preview`, `versionCode 2` y SHA `bfe2cbad41752c3e2959badb6a5ab5892e1f10ba` según DEV-A en [ENTREGA.md](../ENTREGA.md). La versión de app configurada en el proyecto es 1.0.0. La versión exacta del artefacto, su firma y su URL directa siguen pendientes de cotejar con EAS. |
| Ubicación | Proyecto EAS existente de NEXUS, identificado en `app.json` por `extra.eas.projectId` `5af287be-187e-46bc-b9ff-1412a6a21a1a`, sección Builds, buscar el ID anterior. EAS rechazó la consulta de lectura con la cuenta activa. No se encontró un archivo APK en los árboles locales revisados. |
| Metro | El perfil `preview` configura APK interno, bundle incluido y `developmentClient: false`. El APK H3 reportado como preview debería abrir sin Metro; la prueba con laptop apagada sigue pendiente en el registro. El flujo coordinado necesita Internet y acceso al relay/Firebase; la subida necesita Cloudinary. Un Development Build para iterar JS usa Metro. |
| Candidato de DEV-B | Sin APK verificable para el candidato integrado. El binario histórico sólo sirve como referencia de H3. |

Con una cuenta autorizada, abre Builds en Expo, selecciona el ID H3 y descarga el artefacto Android desde la ficha. Si necesitas que el titular lo comparta, pídele el enlace de instalación o el APK por un canal privado, con SHA-256, perfil, SHA Git, versión y versionCode. Puedes cotejar el hash con `Get-FileHash -Algorithm SHA256 .\Nexus.apk` en PowerShell. En Android abre el APK desde Archivos o el navegador, autoriza la instalación de esa fuente si el dispositivo lo solicita y concede cámara cuando Studio lo pida. Con ADB usa `adb install -r Nexus.apk`. Para actualizar conserva el paquete `com.floleyton.nexus`, una firma compatible y un versionCode adecuado. Ante incompatibilidad detén la instalación y conserva la app y sus datos.

Para un APK del candidato, tras aprobación selecciona el SHA que incluya las correcciones revisadas, prepara la copia aislada y las variables EAS `preview`, confirma acceso al proyecto y firma, y ejecuta la comprobación y el build descritos en [APK_PREVIEW.md](../APK_PREVIEW.md). El paso que inicia la compilación es `eas build --platform android --profile preview`; ejecútalo en el entorno preparado por esa guía. Registra también qué relay se usó para validar el APK. El encabezado de la guía refleja la preparación inicial, y [ENTREGA.md](../ENTREGA.md) recoge la evidencia H3 posterior. [Guía oficial de instalación APK](https://docs.expo.dev/build-reference/apk/)

## 4. Arquitectura y recorrido operativo

1. **Identidad y conexión.** Expo Router muestra Studio, Biblioteca, Dispositivos y Cuenta en el candidato. Firebase Auth reutiliza una identidad persistida o el ingreso anónimo, y `studioIdentity.ts` aporta el token al WebSocket compartido de `services/socket.ts`. El relay valida el token con Firebase Admin antes de presencia y Studio. UID y deviceId identifican la instalación. La aceptación del Controller concede la participación en la Session.
2. **Controller, MAIN y SIDE.** En Studio, Controller crea la Session y comparte el código. Cada Node solicita ingreso y el Controller acepta y asigna roles. MAIN y SIDE son roles de cámara de dos Nodes, cada uno con permisos y READY propios. La pantalla contextual Session/Producción dirige la operación; `services/sessionClient.ts` y `services/sessionProtocol.ts` implementan el contrato.
3. **Control y persistencia.** El relay Node.js previsto para Render expone `/health` y WebSocket, autentica, valida membresía, rol, destinatario y aislamiento. `server/sessionStorage.js` persiste sesiones y vínculos en Firebase RTDB. Reanudar conserva participación/rol cuando hay vínculo válido y requiere READY nuevo. REC/STOP comparten takeId, se deduplican por messageId y distinguen por Node ACK, grabación y resultado de guardado. Tras desconexión el Node puede continuar y detener localmente; el Controller puede ver resultado parcial y reconciliar la toma interrumpida. La reconexión conserva historial y evita repetir comandos anteriores.
4. **Captura y medios.** `services/captureEngine.ts` y `services/coordinatedCapture.ts` coordinan cámara y parada. El Node conserva primero el original local con sessionId, takeId y nodeId. `captureUpload.ts` y `cloudinary.ts` suben el archivo directamente a Cloudinary; el relay distribuye estados y referencias. `mediaCatalog.ts` y `takeMedia.ts` permiten ver los ángulos por toma y conservar importaciones anteriores. Una subida fallida se puede reintentar desde el original.
5. **Integración de UI.** El candidato une seguridad H4 y Consola con navegación móvil/rail, Biblioteca con búsqueda y filtros, herramientas en Dispositivos y ajustes de Cuenta. El cambio de navegación conserva las rutas operativas y los propietarios de captura. Los diagnósticos locales de Yoga y tablet quedan pendientes de aceptación Android.

Puntos de entrada para documentar: [arquitectura](../README/DOCS/ARCHITECTURE.md), [backlog](../README/DOCS/BACKLOG.md), [protocolo](../services/SESSION_CONTRACT.md), [guía operativa](../GUIA_DE_TRABAJO.md), [relay](../DEPLOY_RELAY.md) y [producto](../README/000%20-%20Definición%20de%20producto.md). El checkout carece de un `README.md` general, tanto en la raíz Git como en la de la aplicación; las guías viven en `README/` y los archivos anteriores.

## 5. Evidencia y documentación académica

- [ENTREGA.md](../ENTREGA.md) registra P3/P4 físicos H3 comunicados por el operador, incluida grabación de ambos ángulos, recuperación con SIDE offline, segunda toma y arranque frío de clientes. El reinicio real de Render y la aceptación física del candidato siguen pendientes.
- [Etapa 3](ux/implementation/ETAPA_3.md), [Etapa 4](ux/implementation/ETAPA_4.md) y [galería](ux/implementation/stage4-gallery.html) documentan implementación, capturas web con fixtures, diez comprobaciones web y doce de Session. Etapa 4 registra 117 pruebas con emulador; el registro local posterior cita 121 tras la mitigación y el traslado de Firebase. En la validación previa a publicar, TypeScript, lint, las auditorías de Etapa 4 y layout retenido, y las 121 pruebas con RTDB emulada pasaron (0 fallos y 0 omitidas).
- Los informes [Yoga](diagnostics/PLAYBACK_YOGA.md) y [tablet](diagnostics/TABLET_STARTUP.md) describen la investigación y la reproducción controlada. La mitigación Yoga y la causa de la pantalla blanca siguen pendientes de verificación en hardware.
- Desde `Nexus/`, usa Git Bash para repetir `npx tsc --noEmit`, `npm run lint` y `node --test tests/*.test.cjs`. Para la suite RTDB completa sigue [las instrucciones del emulador](../tests/emulator/README.md). Los tests cubren routing, aislamiento, comandos duplicados, persistencia y catálogo en condiciones controladas. Para evidencia física usa tres teléfonos y sigue P3/P4 en ENTREGA y la prueba Android de Etapa 4, con un entorno autorizado.
- En la memoria académica incluye objetivo y alcance, requisitos y casos de uso, diagrama de componentes y secuencia de admisión/REC/STOP/subida, configuración reproducible, matriz de pruebas con SHA de app, ID/versión de APK y SHA de relay, resultados, incidencias, pendientes y manual breve. Cita cada evidencia con su fecha y entorno, y rotula las capturas de fixtures. Para la entrega final incorpora el README de entrada y verifica con el operador qué resultados físicos pueden publicarse, con datos de prueba y sin exponer identificadores, enlaces privados o medios personales.

## 6. Qué requiere autorización

Para distribuir el APK H3, coordina con el titular de EAS la verificación y entrega privada del artefacto. La compilación preview del candidato, cualquier PR o fusión hacia otra rama, y los cambios, reinicios o ensayos con escritura en servicios compartidos requieren coordinación por separado.
