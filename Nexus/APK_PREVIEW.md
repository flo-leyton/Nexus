# H3.4d · APK preview · revisión antes de compilar

Estado: perfil preparado; SIN APK compilado, build remoto iniciado ni publicación.
Render todavía debe aprobarse/desplegarse según DEPLOY_RELAY.md. No existe aún una
URL real que incluir. No usar una URL de ejemplo ni cambiar IP/PORT de desarrollo.

## Archivos y comportamiento

- eas.json: preview usa entorno EAS preview, distribution=internal,
  developmentClient=false, Android buildType=apk y Node 24.15.0. Bundle Release
  incluido: funciona sin Metro/laptop. autoIncrement usa versión Android remota.
- app.config.js/config/previewBuild.js: preview/producción exige variables públicas
  completas, hostname wss público sin IP/puerto LAN y rechaza credenciales Admin o
  emuladores en el entorno del APK. Nunca copia process.env a extra.
- EXPO_NO_DOTENV=1 evita cargar la configuración local .env durante la compilación
  online. Development conserva cliente de desarrollo y alternativa LAN existente.
- scripts/check-native.cjs comprueba autolinking Android real (Expo + React Native)
  tras instalar dependencias en EAS. Falla si no enlaza VideoModule o falta un módulo
  de captura, archivos, permisos, AsyncStorage/persistencia Auth o UI nativa requerida.
- app.json ya declara expo-video y package-lock fija 3.0.16, compatible con SDK 54;
  la resolución Android detectó expo.modules.video.VideoModule, cuyo nombre nativo
  es ExpoVideo. Plugins/cámara sin audio y applicationId existentes se conservan.
- .easignore permite sólo fuentes/build de la app; excluye server/, .env*, claves,
  vídeos, caches y carpetas nativas generadas. Se usa desde una copia AISLADA del
  commit de Nexus/, con No VCS y EAS_PROJECT_ROOT. Evita incluir documentos del
  repositorio padre o cambios ajenos de la carpeta habitual. No se altera su índice.

La comprobación de autolinking no certifica que un APK ya construido funcione.
Se debe construir/instalar el binario nuevo y reproducir vídeo real. Una recarga JS
o una actualización OTA no añade ExpoVideo a un cliente viejo que no lo contenga.

## Variables públicas EAS preview

Configurar en expo.dev → proyecto EXISTENTE de eas.extra.projectId → Environment
variables → preview. No crear otro proyecto Firebase/EAS por este módulo.

| Nombre | Procedencia |
| --- | --- |
| EXPO_PUBLIC_RELAY_URL | `wss://` + hostname REAL asignado al servicio Render |
| EXPO_PUBLIC_FIREBASE_API_KEY | Configuración pública Firebase de la app |
| EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN | Mismo proyecto |
| EXPO_PUBLIC_FIREBASE_DATABASE_URL | Mismo proyecto/base existente |
| EXPO_PUBLIC_FIREBASE_PROJECT_ID | Debe coincidir con FIREBASE_PROJECT_ID del relay |
| EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET | Configuración pública existente |
| EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID | Configuración pública existente |
| EXPO_PUBLIC_FIREBASE_APP_ID | Configuración pública existente |
| EXPO_PUBLIC_CLOUDINARY_CLOUD_NAME | Adaptador existente |
| EXPO_PUBLIC_CLOUDINARY_UPLOAD_PRESET | Preset unsigned existente, sin cambiarlo |

Son valores públicos visibles en el APK; visibility plaintext permite a EAS CLI
evaluar config localmente. No poner secretos bajo EXPO_PUBLIC ni copiarlos de Render.
FIREBASE_ADMIN_CREDENTIALS/GOOGLE_APPLICATION_CREDENTIALS sólo pertenecen al servidor.
NEXUS_ONLINE_BUILD=1 y EXPO_NO_DOTENV=1 están en el perfil, no son credenciales.
google-services.json existente es configuración cliente Android pública, no una
cuenta de servicio. Se conserva; la clave de firma Android se gestiona en EAS,
fuera del archivo de fuentes, Git y las variables públicas.

## Comandos propuestos (sólo después de aprobación)

Se ejecutan en una terminal NUEVA sin variables privadas del relay. Requieren
EAS CLI >=27.5.0 (local verificado 27.7.2), sesión del operador y permisos al proyecto.
Primero aprobar/publicar los commits de desarrollo y desplegar Render. Configurar
los diez valores públicos reales de preview. No escribir secretos en comandos.

PowerShell desde Nexus/; crea una carpeta temporal nueva y no toca la original:

```powershell
$apkSourceSha = git rev-parse HEAD
$apkStage = Join-Path $env:TEMP ('nexus-preview-' + [guid]::NewGuid().ToString('N'))
$apkArchive = $apkStage + '.zip'
git archive --format=zip --output=$apkArchive ($apkSourceSha + ':Nexus')
if ($LASTEXITCODE) { throw 'No se pudo preparar la copia del commit' }
Expand-Archive -LiteralPath $apkArchive -DestinationPath $apkStage
Set-Location -LiteralPath $apkStage
npm.cmd ci
$env:EAS_NO_VCS = '1'
$env:EAS_PROJECT_ROOT = $apkStage
$env:EXPO_NO_DOTENV = '1'
eas.cmd env:exec --environment preview 'npm run check:preview'
if ($LASTEXITCODE) { throw 'Preflight preview falló; no iniciar build' }
eas.cmd env:exec --environment preview 'eas build --profile preview --platform android'
```

El último comando inicia el trabajo remoto y puede consumir cuota/costo: NO se ha
ejecutado. No VCS no incluye Git; registrar apkSourceSha, build ID, versión Android,
hostname wss y SHA-256 del APK descargado como evidencia de esta compilación.
El directorio temporal contiene el commit revisado, no el árbol con cambios ajenos.
EAS utiliza .easignore de esa carpeta para subir sólo los archivos permitidos.
Puede revisarse primero `eas.cmd build:inspect --platform android --profile preview
--stage archive --output <CARPETA_NUEVA>` dentro de esa copia, con las mismas variables
públicas/configuración. Requiere la misma revisión previa de los archivos a subir.

No ejecutar eas update, submit ni publicar en Play Store para esta prueba. Se
descarga el APK del build aprobado y se distribuye sólo a los teléfonos del equipo.

## Instalación que conserva identidad y originales

Mantener com.floleyton.nexus, firma compatible y versión Android creciente. Comparar
certificados del cliente instalado y APK preview antes de reemplazarlo; conservar
la clave que permita actualizar el cliente actual. Instalar como actualización
(`adb install -r <APK>` o instalador Android). Si aparece firma incompatible, DETENER:
no desinstalar ni borrar datos para forzar instalación. Una reinstalación limpia
puede perder Firebase anónimo, deviceId, catálogo y originales locales, bloqueando
acceso seguro a Sessions. No se ha comprobado aún la firma de un APK nuevo.

## Prueba física H3.4d + H3.4c, pendiente

1. Instalar el APK compatible en Controller y Node, sin limpiar almacenamiento.
   Detener relay/Metro de la laptop y APAGARLA. Los teléfonos necesitan Internet y
   Firebase/Render/Cloudinary accesibles. Preferir dos conexiones móviles para
   demostrar que no dependen de la LAN. No cerrar ni cambiar cuenta Firebase.
2. Abrir la app directamente, sin QR ni Metro. Conectar al relay. Crear Session y
   aprobar Node, o descubrir/abrir la persistida con su identidad original y pulsar
   REANUDAR PARTICIPACIÓN en Node. Verificar mismo nodeId/rol y READY falso al reanudar.
3. Preparar cámara/permiso, CONFIRMAR READY PARA NUEVA TOMA. Controller envía REC/STOP
   breve. Reproducir original en Node, subir y reproducir ángulo remoto en Controller.
   Anotar sessionId/código, deviceId/nodeId, takeId, clipId, URL y resultado real.
4. Apagar AMBOS teléfonos, encenderlos y abrir app otra vez, con laptop aún apagada.
   Debe descubrirse la MISMA Session e historial; reanudar, comprobar rol/nodeId,
   confirmar READY nuevo. No debe llegar ningún REC/STOP antiguo por reconectar.
5. Grabar/subir/reproducir otra Take: takeId distinto, historial anterior sin
   duplicados, original y referencia anterior conservados. Repetir con dos Nodes
   (Controller + dos Nodes = tres teléfonos), dos ángulos por Take.
6. Si se interrumpe REC, usar STOP local si el motor sigue activo; tras apagar no
   se promete reparar un vídeo no finalizado. El resultado no confirmado permanece
   desconocido. Reconciliar, confirmar preparación y cerrar explícitamente la Take
   interrumpida antes de otra; no inventar ACK, guardado o subida.

## Costos y aprobación

Render se revisa por separado en DEPLOY_RELAY.md. EAS Free incluye actualmente 15
builds Android mensuales y cola de baja prioridad; la cuota restante del operador
no se consultó. Un plan de pago/cómputo adicional requiere aprobación: no se cambian
planes ni se compran créditos automáticamente. Cloudinary/RTDB y datos móviles
pueden facturar al exceder cuotas. No se ha iniciado ningún consumo remoto de build.
[Tarifas Expo](https://expo.dev/pricing).

Referencias: [ExpoVideo SDK 54](https://github.com/expo/expo/blob/sdk-54/docs/pages/versions/v54.0.0/sdk/video.mdx),
[APK](https://docs.expo.dev/build-reference/apk/),
[entornos EAS](https://docs.expo.dev/eas/environment-variables/usage/),
[archivos subidos/No VCS](https://docs.expo.dev/build-reference/project-upload/),
[.easignore](https://docs.expo.dev/build-reference/easignore/).
