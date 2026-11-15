# NEXUS Studio · Guía de trabajo para el equipo

Una persona conduce la sesión de Codex. La otra prepara el Controller y los dos Nodes, prueba cada versión y comunica el resultado. El Controller y ambos Nodes deben poder alcanzar la laptop que ejecuta el relay por la misma LAN. Para distinguir los clips durante la revisión, orienten las cámaras hacia escenas diferentes.

## 1. Abrir la rama y preparar la laptop

Comandos para Git Bash en Windows. Para una primera copia:

```bash
git clone --branch desarrollo https://github.com/flo-leyton/Nexus.git
cd Nexus/Nexus
npm ci
```

Si ya tienen el repositorio, desde su raíz ejecuten `git status -sb`, conserven cualquier trabajo local, luego `git fetch origin`, `git switch desarrollo`, `git pull --ff-only origin desarrollo` y `cd Nexus`. Ejecuten `npm ci` en la carpeta que contiene package.json. La base ya incorpora la corrección de tipos Firebase de NX-002. Usen Node 24 como referencia para reproducir el entorno probado y comprueben `node -v` y `npm -v`.

## 2. Conectar los dispositivos

1. En Windows, ejecuten `ipconfig` y comparen la IPv4 del adaptador LAN activo con la IP de `config/server.ts`. Si la red cambió, el operador ajusta esa configuración manualmente. El puerto del relay se consulta en el mismo archivo.
2. Preparen la configuración pública del proyecto en `.env.local`, junto a package.json, a partir del entorno que ya usan. Cloudinary lee `EXPO_PUBLIC_CLOUDINARY_CLOUD_NAME` y `EXPO_PUBLIC_CLOUDINARY_UPLOAD_PRESET`; usen el preset habilitado para la subida sin firma. Firebase lee las variables con prefijo `EXPO_PUBLIC_FIREBASE_` y sufijos `API_KEY`, `APP_ID`, `AUTH_DOMAIN`, `DATABASE_URL`, `MESSAGING_SENDER_ID`, `PROJECT_ID` y `STORAGE_BUCKET`. Las variables EXPO_PUBLIC son visibles en el cliente. Las credenciales privadas permanecen fuera de la aplicación y del repositorio.
3. En una terminal de la carpeta de la aplicación ejecuten `npm run relay`. En otra ejecuten `npx expo start --dev-client --lan`. Abran el proyecto en los tres dispositivos con su cliente de desarrollo compatible. Si falta el cliente Android, el proyecto incluye el perfil EAS `development`: con la cuenta del equipo configurada, ejecuten `npx eas-cli build --platform android --profile development` e instalen el APK resultante. Anticipen ese tiempo de compilación.
4. Comprueben que el relay registra conexiones y que la pantalla existente de dispositivos detecta los teléfonos. Si Metro carga y el relay no recibe conexiones, revisen IP, puerto, aislamiento entre clientes Wi-Fi y acceso del relay en el firewall de la red privada.
5. Concedan el permiso de cámara y comprueben espacio disponible. En la base Android, `app.json` declara `recordAudioAndroid: false`. Para probar primero la imagen, configuren explícitamente captura silenciada. Para validar sonido, Codex debe habilitar el audio, solicitar permiso de micrófono y el equipo debe instalar una compilación nativa actualizada. Registren si el clip probado incluye audio.

## 3. Iniciar la implementación con Codex

### Preparación adicional desde H3.4a (también en LAN)

El relay exige Firebase Auth antes de presencia y Studio. En el proyecto Firebase
de la app habilitar Authentication → Sign-in method → Anonymous. Una cuenta ya
autenticada se reutiliza; si no existe, Studio crea una anónima persistente. No
borrar datos entre pruebas: se perderían el usuario anónimo y los originales.

Para iniciar el proceso local, usar una cuenta de servicio privada del mismo
proyecto con permisos de Firebase Authentication, guardada **fuera del repositorio**.
Desde Git Bash en Nexus/ (las rutas y project ID siguientes son marcadores):

```bash
export FIREBASE_PROJECT_ID='TU_PROJECT_ID'
export GOOGLE_APPLICATION_CREDENTIALS='/ruta/privada/fuera-de-Git/cuenta-servicio.json'
npm ci
npm run relay
```

Alternativa de servidor: FIREBASE_ADMIN_CREDENTIALS como secret env con el JSON.
No pegar secretos en .env de la app, EXPO_PUBLIC, archivos versionados ni mensajes.
En otra terminal ejecutar `npx expo start --dev-client --lan --clear`. Sin cambios
nativos, usar el cliente H2 actual. Si Metro exige regenerar por otro cambio ajeno,
no borrar datos para probar esta configuración.

En desarrollo dejar EXPO_PUBLIC_RELAY_URL ausente para usar la IP/PORT manual
actual de config/server.ts. Para otra URL establecer esa variable pública y
reiniciar Metro. No editar IP/PORT automáticamente. Preview/producción exige
EXPO_PUBLIC_RELAY_URL=wss://<host-del-relay>; no se permite fallback LAN. Cambiar
la variable en un APK exige generar un bundle/APK nuevo; aún no se prueba APK online.

Verificar `curl http://<IP-manual>:<PORT-manual>/health`: sólo ready=true. El
servidor acepta PORT privado como escucha alternativa; en ese caso configurar
explícitamente la URL de conexión de desarrollo para ese puerto. La escucha del
proceso no reescribe la dirección de la app.

En Controller y dos Nodes, CONECTAR AL RELAY debe terminar en Conectado sólo tras
AUTH_OK. Crear Session, solicitar/aceptar ambos, roles, READY y REC/STOP breve;
comprobar originales, ACK separados, subida/reproducción como H3. Si falta Firebase
o Anonymous está deshabilitado, Studio debe indicar esa causa, sin presencia falsa.
Perder red y reconectar exige reingreso manual autorizado; no repite REC/STOP.
Detener localmente un Node offline y mantener el resultado desconocido en Controller.

Preparación Render en Nexus/render.yaml (ruta de Blueprint desde Git: Nexus/render.yaml):
Node 24.15.0, raíz Nexus/, npm ci, npm run relay y /health en el puerto de Render.
Configurar FIREBASE_PROJECT_ID y FIREBASE_ADMIN_CREDENTIALS como variables privadas
cuando llegue H3.4d. **No crear ni desplegar servicio en H3.4a.** No hay persistencia
de Sessions tras reinicio; H3.4b/c siguen pendientes.

Abrir el repositorio en la rama desarrollo y enviar este mensaje:

> Implementa H1 de Nexus en desarrollo. Lee Nexus/AGENTS.md y Nexus/ENTREGA.md. Comprueba la base actual, reutiliza la identidad, la presencia y el socket, y conecta la sesión de extremo a extremo. Ejecuta las validaciones y deja un commit probado. Dame el SHA, los pasos para probar con los teléfonos y el resultado esperado. Registra por separado las pruebas que todavía requieren hardware.

| Trabajo | Dónde empezar dentro de Nexus/ |
|---|---|
| Creación y lista de Nodes | `app/(tabs)/index.tsx`, `app/session/[id].tsx`, `services/deviceIdentity.ts` y `services/devicePresence.ts` |
| Membresía, destino y ACK | `server/index.js`, `server/devicePresence.js`, `services/deviceProtocol.ts`, `services/socket.ts` y `tests/device-presence.test.cjs` |
| Grabación | Revisar permisos en `app.json` y el uso existente de CameraView en `app/(tabs)/linterna.tsx`. Implementar la captura para el Node de la sesión. |
| Toma y biblioteca | `types/media.ts`, `services/mediaCatalog.ts`, `services/cloudinary.ts` y `app/(tabs)/medios.tsx`. El catálogo inicial requiere URL y publicId: adaptar la lectura para admitir capturas locales y conservar las importaciones. |

## 4. Probar cada versión

Codex publica el commit del hito en desarrollo. En la laptop de prueba, ejecuten `git pull --ff-only origin desarrollo` y `git rev-parse --short HEAD`. Reinicien el relay si cambió el servidor y recarguen los tres clientes. Si cambió la configuración nativa, instalen el cliente actualizado. Sigan la prueba de [ENTREGA.md](ENTREGA.md) para ese hito.

Al reportar un fallo indiquen el SHA, el equipo afectado, la acción, lo esperado y lo observado. Por ejemplo: «H2, Node B recibió STOP y salió de REC. Al abrir el archivo, la duración era cero. Node A reprodujo su clip». Codex debe poder retomar el mismo hito con ese dato. Para el siguiente, basta pedir «Implementa el primer hito pendiente de Nexus/ENTREGA.md y dame la prueba física».

## 5. Cerrar la jornada

Desde la carpeta de la aplicación, con la versión candidata:

```bash
npx tsc --noEmit
npm run lint
node --test tests/*.test.cjs
git status -sb
git rev-parse --short HEAD
```

Ejecuten las pruebas del relay en una laptop con acceso a las interfaces de red. En GitHub abran un PR con base `main` y compare `desarrollo`. Incluyan el SHA probado, el registro de los cuatro hitos, el resultado de los comandos y cualquier limitación. El equipo revisa esa evidencia y decide el merge. Conserven desarrollo para la siguiente iteración.
