# NEXUS · Diagnóstico nativo Yoga/Fabric y mitigación de layout

2026-11-16 · Rama devb/ux-etapas-3-4 · Base examinada 146a9262ffde105c998384baf041d999bf17bf28.
Cambios de diagnóstico/mitigación SIN commit. No es una declaración de fallo resuelto.

## Evidencia confirmada

Se leyó completo nexus-crash.log (227065 bytes), suministrado por el operador y
conservado fuera de este worktree. SHA-256 del archivo:
60a192da7b87f9901b78a5b43561deea92022e5dca0072dd98fc3123b357abe6.
No se copia al repositorio ni se incorporan IDs, huellas de dispositivo o dumps.

Hay SIETE secciones de aborto, no catorce incidentes: algunos avisos de señal se
repiten. Horas locales -0400 del 16/11: 11:47:26, 11:48:18, 11:49:59, 11:50:51,
11:51:57, 11:53:56 y 11:59:16. Todas contienen SIGABRT por la misma aserción en
YogaLayoutableShadowNode.cpp:708, YGNodeGetOwner(childYogaNode) == &yogaNode_.
Los siete stacks incluyen Yoga/Fabric, ScrollViewShadowNode y RNSScreenShadowNode;
no contienen frames de VideoView/ExoPlayer/MediaCodec. Eso sitúa la muerte en el
layout nativo, pero NO descarta que insertar/reproducir vídeo provoque el relayout.

El archivo incluye además una excepción Java de otro proceso del 11/11 (ajena a
NEXUS) y otra NPE de NEXUS a las 01:38 en ReactActivityDelegate.onUserLeaveHint.
Son incidentes distintos de los siete abortos de la mañana; esta mitigación no
pretende resolver la NPE. Si reaparece al salir/volver de la app, registrar aparte
para revisar la compatibilidad del APK, sin actualizar nativo automáticamente.

Versiones resueltas en este worktree: Expo 54.0.37, RN 0.81.5, screens 4.16.0,
expo-video 3.0.16, reanimated 4.1.7. No se ha certificado mediante ADB que el APK
instalado tenga exactamente esas versiones; no hay ADB disponible en el entorno.
El source RN instalado contiene la aserción en línea 708 y el bloque Yoga que
marca hasNewLayout incluso para display:none en una pasada no definitiva.

## Hipótesis sustentada y límites

Upstream documenta y corrige EXACTAMENTE esta aserción al usar display:none: una
bandera hasNewLayout retenida y nodos Yoga compartidos entre generaciones pueden
quedar con propietario anterior al combinar resize, caché y actualización posterior.
Fuente primaria: https://github.com/react/react-native/commit/6fa330693f
Incluye reproducción nativa sin vídeo (resize de contenedor y restyle de un input).
No se aplica ese parche C++, ni se modifica node_modules o una dependencia nativa.

Consola añadió paneles retenidos display:none en SessionDetails, SessionHeader,
SessionPage, NodeRoleEditorView y StudioHome. Hay varias instancias dentro de
ScrollView, incluidas las filas de captura/subida. Añadir un reproductor de 240 dp,
cambiar foco, estado de subida, dock o tamaño produce nuevas pasadas de layout.
La combinación coincide con el mecanismo upstream; la causa precisa en este
Redmi sigue siendo una HIPÓTESIS FUERTE, no una reproducción nativa comprobada.
Los stacks no señalan qué panel concreto tenía la bandera obsoleta.

LocalVideoPlayer ya usa textureView, contentFit=contain y useVideoPlayer por
instancia. No se encontró un player compartido ilegal ni razón demostrada para
cambiar el códec/surfaceType. Se conservan hook, suscripción de status y props
VideoView. Referencia SDK 54:
https://raw.githubusercontent.com/expo/expo/sdk-54/docs/pages/versions/v54.0.0/sdk/video.mdx

LocalCapturesPanel y TakeMediaPanel montan por selección/foco; detalle de medio
carga asíncronamente y verifica archivo antes de montar; cambiar la key reemplaza
la instancia. CaptureUploadControls reacciona a estados y puede cambiar alturas.
No se encontró prueba de que sus handlers causen la corrupción. Sus lecturas,
handlers y ciclo de captura no se modifican. La barra/rail puede redimensionar
pantallas, pero el stack tampoco atribuye causalidad exclusiva a la navegación.
No se cambia freeze/detach/transiciones globales de react-native-screens.

«Subida sin confirmar» tras morir el proceso es la recuperación prevista de
captureUploader.recover(): un uploading sin respuesta durable pasa a uncertain.
No se convierte en failed ni se inventa éxito. Un reintento puede duplicar el
recurso en Cloudinary si se perdió la respuesta; la identidad del catálogo sigue
estable. No se reintenta automáticamente ni se borra ningún original.

## Mitigación localizada preparada

- components/retainedVisibility.ts sustituye display:none de los paneles propios
  retenidos por altura/maxHeight cero, clipping y opacidad cero. Al mostrar, se
  restaura altura natural. Mismos View, keys, children, estado y callbacks;
  no render condicional del propietario ni reparentado de CameraView/CaptureEngine.
- Aplicación únicamente a las cinco vistas citadas. Las banderas de accesibilidad
  existentes se conservan. Riesgos a revisar: espacio de gaps vacíos, coste de
  layout de hijos retenidos, foco/teclado y accesibilidad de paneles colapsados.
  Los componentes internos de dependencias pueden seguir usando display:none;
  esta mitigación no garantiza eliminar toda ruta hacia el defecto upstream.
- LocalVideoPlayer añade trazas NEXUS_PLAYBACK solo en __DEV__: instancia efímera,
  local/remoto, mount/unmount, status, error boolean y dimensiones. No URIs, tokens,
  sessionId/nodeId/clipId, mensajes de error ni datos persistentes. El callback de
  layout existe solo en desarrollo y NO modifica estado React. Un SIGABRT no es capturable con try/catch JS.

## Reproducción mínima y pruebas Android pendientes

YogaLayoutProbe.tsx es un componente aislado bajo docs, NO una ruta de la app ni
un cambio de entrypoint. Compara legacy display:none con retained clipping,
resize y restyle separados. No usa vídeo, red, Auth, almacenamiento o permisos.
Es un candidato de reproducción basado en upstream, NO ejecutado nativamente.
Usarlo solo en un harness de desarrollo desechable autorizado; modo legacy puede
abortar. No activar ese modo en una sesión de producción ni modificar su APK.

Primero probar el recorrido mínimo de la app con el Redmi afectado y otro teléfono:

1. Confirmar todos los motores ociosos y sin guardado/subida pendiente antes de
   recargar el bundle. Conservar APK/firma/datos; no reinstalar, limpiar ni cambiar
   cuenta. Registrar versiones/modelos y SHA cliente/relay sin publicar identidades.
2. Usar un original YA guardado y pequeño; inicialmente sin Cloudinary ni toma
   nueva. Con servicios no necesarios desconectados, abrir desde Session, reproducir
   3–5 segundos, cerrar, repetir 20 veces. Repetir desde Biblioteca→detalle→volver.
3. Entre ciclos, expandir/colapsar metadatos, variar orientación/ancho y regresar.
   Observar que STOP local/propietario no cambien cuando se haga la regresión de
   captura después. No recargar Metro ni cambiar versión durante REC/guardado.
4. Guardar trazas filtradas en un archivo PRIVADO fuera de Git, por ejemplo PowerShell:

```powershell
adb -s SERIAL logcat -v threadtime ReactNativeJS:I '*:S' | Select-String 'NEXUS_PLAYBACK' | Set-Content -Encoding UTF8 "$env:TEMP\nexus-playback-private.log"
adb -s SERIAL logcat -b crash -d -v threadtime > "$env:TEMP\nexus-crash-private.log"
```

No se ejecutaron esos comandos aquí. No limpiar logcat: conservar evidencia.
Revisar/redactar el dump antes de compartirlo; puede contener otros procesos/datos.
Las trazas JS pueden perder los últimos mensajes al abortar; su ausencia no prueba
que no se montó el vídeo. Comparar hora/instancia con nueva sección SIGABRT.

5. Si no falla, repetir en ambos equipos REC/STOP, dos originales, reproducción,
   desconexión/STOP local, reanudación/READY nuevo y segunda toma. Revalidar foco,
   teclado y lector de pantalla en formularios/metadatos retenidos. La estabilidad
   de un equipo no demuestra la del otro.
6. Solo tras coordinación, repetir un ensayo pequeño de subida/reproducción. Si
   reaparece uncertain, conservar original y comprobar resultado remoto sin borrados
   ni reintentos automáticos. No provocar una muerte durante una subida real.
7. Si vuelve la misma aserción, detener la campaña y aportar nueva ventana de crash
   y trazas. No acumular cambios especulativos de VideoView, screens, permisos o
   arquitectura. Aislar navegación interna/ocultamiento de dependencias y contrastar
   el probe nativo; cualquier actualización nativa requiere aprobación aparte.

Cierre físico: cero abortos observados en ciclos y regresión, originales intactos,
controles conservados y sin cambio de seguridad. Esto reduce el riesgo, no demuestra
matemáticamente ausencia de una carrera intermitente. Registrar iteraciones,
duración y dispositivos. Hasta entonces estado: MITIGACIÓN NO VERIFICADA EN ANDROID.

## Validación automatizada

TypeScript, Expo lint, ESLint estricto y diff-check: PASS.
Suite completa H4+UI con RTDB demo emulada: 120 PASS, 0 FAIL, 0 SKIP.
Tres nuevas regresiones prueban estilo retenido, privacidad/dev-only de trazas y
que el guard rechace cambios de callbacks/propietarios. No ejecutan Yoga nativo.
verify-stage4-logic.cjs conserva comparación exacta de servicios/server/config,
Auth, permisos, contratos, captura y owners. Las cinco excepciones de presentación
se comparan por AST sin estilos/import del helper; cualquier cambio restante falla.
Firma de hooks useVideoPlayer/useEvent y JSX nativo VideoView idéntica a la base.
Las 117 pruebas previas y capturas web no ejercitaban Fabric/Yoga Android: por eso
podían pasar aunque este fallo físico existiese.
Resultados de layout con fixtures: 12 PASS; ver playback-layout-ui-results.json. Prueban montaje/STOP/layout web, nunca ausencia del SIGABRT.
Sin commit, push, merge, despliegue, escrituras reales o cambios nativos.
