# Tablet · Pantalla blanca, ruta Firebase y keep-awake

2026-11-16 · devb/ux-etapas-3-4 · HEAD 146a926 con mitigación Yoga pendiente conservada.

## Cambio mínimo aplicado

app/firebase.ts era un módulo de configuración dentro del árbol de rutas, sin
componente default. Se movió a config/firebase.ts conservando byte por byte el
archivo local original. No se deja un reexport en app porque seguiría siendo ruta.
Se actualizaron los seis consumidores (Cuenta, StudioIdentityPanel, authService,
firebaseTest, deviceRegistry y studioIdentity), más los mocks de dos suites.

getApps/getApp/initializeApp, initializeAuth, getReactNativePersistence(AsyncStorage),
el fallback getAuth, RTDB y acceso directo EXPO_PUBLIC se conservan exactamente.
No cambian namespace de persistencia, claves, usuarios o datos. El verificador
compara el módulo con Git normalizando solo CRLF/LF y los consumidores completos
normalizando únicamente la importación autorizada. El movimiento original sí
comprobó igualdad de bytes antes/después. Nada modifica .env o credenciales.

Confirmación adicional importante: una consulta de manifiesto local de Metro 8091
respondió HTTP 200 con projectRoot Nexus_Final/Nexus/Nexus, la copia ORIGINAL,
no Nexus_Final/Nexus-DevB-UX/Nexus. Si la tablet usa 8091, no recibe este candidato
ni su mitigación. No se conoce todavía el servidor concreto seleccionado en ella.
No se detuvo, reinició ni cambió ese proceso. El Host 127.0.0.1 de esa consulta
local no es evidencia de la dirección LAN que el dispositivo esté usando.

La advertencia firebase.ts debe desaparecer al cargar el nuevo bundle correcto.
Era un defecto de organización de rutas; no demuestra por sí sola la causa de
una pantalla blanca en todas las rutas. Falta comprobar carga/hidratación nativa.

## Keep-awake, investigado por separado

No hay llamadas propias de NEXUS a useKeepAwake/activateKeepAwake en app/services/
components. Expo 54.0.37 lo invoca desde node_modules/expo/src/launch/withDevTools.tsx.
El paquete resuelto desde Expo es expo-keep-awake 15.0.8, instalado anidado dentro
de Expo; no falta por no estar en el primer nivel de node_modules.

Su useKeepAwake activa una promesa con then sin catch de activación. La opción
suppressDeactivateWarnings suprime solo errores de DESACTIVAR. En el código Android
instalado, ExpoKeepAwakeManager requiere ActivityProvider/currentActivity y lanza
CurrentActivityNotFoundException si no existe. KeepAwakeModule convierte ese caso
en ActivateKeepAwakeException con el mensaje exacto «Unable to activate keep awake».
Esto sustenta un fallo de disponibilidad/lifecycle de Activity en la herramienta
de desarrollo, no prueba una avería Firebase, de permisos o del motor de captura.
La versión nativa realmente incluida en el APK y el stack de la tablet aún deben
comprobarse. No se edita node_modules, no se parchea el hook ni se oculta la promesa
globalmente; tampoco se instala/actualiza nada ni se reconstruye un APK.

El aviso Reduced motion de Reanimated proviene de su preferencia de accesibilidad
y logger de desarrollo; ese bloque no lanza una excepción. No se cambia la
preferencia ni se identifica como causa de pantalla blanca sin otra evidencia.

## Validación

- TypeScript, lint y ESLint adicional: PASS.
- Firebase/Auth/acceso relay: 21/21 PASS en suites específicas (con mocks).
- Suite completa H4+UI con emulador aislado: 121 PASS, 0 FAIL, 0 SKIP.
- Guard de inicialización/imports y mitigación Yoga: PASS; diff-check PASS.
- Arranque físico tablet / desaparición efectiva del warning / conexión: PENDIENTE.
- No se ejecutó código cliente contra Firebase/Cloudinary ni se cambió el relay.

## Reprueba propuesta, sin iniciar procesos automáticamente

Con cámaras/motores detenidos, sin guardado o subida pendiente y datos conservados,
verificar servidor seleccionado en development client. Servir desde la copia UX,
con variables públicas locales autorizadas, en un puerto libre distinto al del
Metro original (8095 es solo ejemplo; comprobar disponibilidad):

```powershell
# Ejecutar desde Nexus/ del clon de la rama candidata.
$env:EXPO_PUBLIC_RELAY_URL='<URL wss del relay de ensayo autorizado>'
npx.cmd expo start --dev-client --lan --clear --port 8095
```

Abrir explícitamente la URL LAN de ese Metro en la tablet; no usar localhost desde
el teléfono. No desinstalar/borrar almacenamiento. La limpieza es de caché Metro,
no de datos del dispositivo. No se requiere un APK nuevo por este movimiento JS.
No ejecutar reset/clean ni detener procesos ajenos para liberar puertos.

Sí hace falta logcat ESPECÍFICO de la tablet para atribuir la pantalla blanca o el
rechazo keep-awake. Registrar modelo/Android/APK, puerto y projectRoot de Metro,
hora de inicio y si la app estaba entrando desde development launcher, primer
plano, Home o recarga. Conservar la primera excepción JS y el stack completo de
keep-awake, más posibles abortos nativos. No reutilizar el log del Redmi como
prueba de esta tablet. No limpiar logs antes de conservar la evidencia.

```powershell
adb devices -l
adb -s SERIAL_TABLET logcat -v threadtime ReactNativeJS:V ReactNative:V Expo:V AndroidRuntime:E libc:F DEBUG:F '*:S' > "$env:TEMP\nexus-tablet-startup-private.log"
adb -s SERIAL_TABLET logcat -b crash -d -v threadtime > "$env:TEMP\nexus-tablet-crash-private.log"
```

Los comandos se entregan al operador, no se ejecutaron aquí. Seleccionar el serial
correcto y revisar/redactar tokens, URLs privadas o IDs antes de compartir. Guardar
fuera del repositorio. Si hay pantalla blanca sin JS stack en esos filtros, capturar
una ventana temporal más amplia del arranque con ayuda del operador, sin ocultar
errores globales. Si vuelve Yoga, usar también PLAYBACK_YOGA.md y NEXUS_PLAYBACK.

Sin commit, push, despliegue o cambios de dependencias. La mitigación Yoga queda
pendiente de validación nativa y no se descarta para este diagnóstico.
