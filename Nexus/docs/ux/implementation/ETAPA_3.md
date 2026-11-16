# A / Consola · Etapa 3 · Navegación y organización

2026-11-16 · Rama devb/ux-etapas-3-4 · Worktree Nexus-DevB-UX/Nexus.

## Base e integración

Se leyó íntegramente el relevo NEXUS_RELEVO_DEVB_ETAPAS_3_Y_4.md de DevA.
Se aplica .agents/skills/nexus-ux-ui/SKILL.md en fase de implementación ya aprobada.
Bases verificadas tras fetch: UI 9f4f20d0cf5e1d4e206b79d10d4904061771872b y
H4/desarrollo 1f66b471ec95155e579413899c5faf0fee482559. Ambas son ancestros del
merge LOCAL 6379986816154d5e052c96c57041aab01e60520d. Único conflicto:
ENTREGA.md, resuelto conservando ambos historiales. No hubo conflictos funcionales.
La IP manual heredada de UI, 192.168.137.1, se conserva; no es una recomendación
para la LAN del operador. No se modificaron las copias originales ni sus ramas.
H4 ya estaba fusionado en desarrollo; las frases históricas de Etapas 1/2 sobre
H4 no integrado describen aquella rama UI y permanecen intactas.

## Navegación implementada

| Destino | Ruta conservada | Funciones / accesos |
|---|---|---|
| Studio | / | Conectar, descubrir/crear sesiones autorizadas, solicitar ingreso, pendientes, última participación y reanudar/reingresar: Etapa 1 intacta |
| Biblioteca | /medios | Lectura del catálogo existente, problemas de lectura, búsqueda por datos disponibles, agrupación sesión/toma local e importados/manuales, detalle y acciones; ángulos remotos en panel existente |
| Dispositivos | /dispositivos | Local y último remoto observado, todos los campos originales y actualización; herramientas heredadas A/B explícitas |
| Cuenta | /explore | Login/registro/logout, perfil RTDB, identidad, colisiones/transferencia y consentimiento existentes; notificaciones y modal diagnóstico |
| Producción contextual | /session/[id] | Operación Controller/Node, solicitudes, roles/ACK, READY, REC/STOP, recuperación, historial, originales, subidas, importación y ángulos: Etapa 2 intacta |
| Detalle | /media/[id] | Verificación/reproducción, originales propios, subir/reintentar/comunicar y metadatos existentes |
| Herramientas | /vibracion y /linterna | Acceso desde Dispositivos, rutas ocultas en barra conservadas; A/B no son roles MAIN/SIDE; restricciones H4 intactas |
| Diagnósticos | /notifications-test y /modal | Accesos desde Cuenta, sin publicar tokens ni crear otro flujo funcional |

ConsoleNavigation usa Paper MD3 (Icon/Text/TouchableRipple), cuatro destinos
Studio/Biblioteca/Dispositivos/Cuenta, iconos semánticos, estado seleccionado,
eventos tabPress cancelables y tabLongPress, feedback háptico iOS previo y safe
areas. Controles de al menos 48 dp, altura natural: no se limita el número de
líneas de etiquetas. Desde herramientas se mantiene Dispositivos seleccionado y
su pulsación vuelve a la pantalla principal. Las rutas ocultas siguen navegables.

Por debajo de 840 dp se usa barra inferior; desde 840 dp, rail lateral. Cambia la
presentación del mismo navegador, no crea otra pila o pantalla de captura. A
600–839 dp se mantienen contenido fluido y anchos de lectura existentes. La prueba
nativa de cambio de orientación/ancho sigue pendiente.

Biblioteca deriva filtros/grupos de NexusMediaAsset sin almacenar ni migrar datos.
Sólo usa takeId cuando ya existe; no lo inventa para importaciones/referencias.
Cada original mantiene su disponibilidad y estado de subida; una URL remota no
se presenta como original local. El acceso Abrir Session / importar mantiene la
ruta con el sessionId disponible; la autorización real sigue siendo del relay.
Un detalle ausente conserva su error, no habilita reproducción ficticia.

Cuenta conserva íntegros sus efectos/handlers de autenticación. Se adaptan campos
Paper y colores semánticos, teclado/safe area; la identidad y las confirmaciones
no se ocultan. No se agregan operaciones Firebase. Dispositivos aclara que no
representa hardware de N Nodes. Sus enlaces no eluden la protección de salida de
Session; no se ofrece Linterna dentro de una captura activa.

## Comparación con A y protecciones

Se reutilizan temas, tokens y composición existentes, sin un nuevo rediseño.
Studio y Session mantienen sus árboles y propietarios exactos. Operación y Tomas
y medios siguen dentro de Session; no se agregan pestañas que oculten/desmonten
cámara o STOP. No se añaden selectores condicionales ni rutas de producción nuevas.
Los diagnósticos conservan algunos controles heredados para no reescribir lógica.
No se promete búsqueda de vídeos remotos fuera de las referencias existentes,
preview remoto, expulsión, QR, multivista ni reconexión automática.

## Validación y evidencia

Ver ETAPA_4.md, stage4-gallery.html, stage4-navigation-results.json y
stage4-session-results.json. Galería: rutas Expo web reales sin configuración de
servicios y componentes reales con fixtures claramente rotulados. No son pruebas
físicas del candidato. Los propietarios de cámara/Session y backend se comparan
exactamente con la base combinada mediante verify-stage4-logic.cjs.

Archivos de implementación: app/(tabs)/_layout.tsx, medios.tsx, dispositivos.tsx,
explore.tsx; components/navigation/ConsoleNavigation.tsx y LibraryContents.tsx.
No cambios nuevos en server/services/config/types/Auth/cámara/REC/STOP/permisos,
ni dependencias o configuración nativa. Sin push, PR, despliegues o build remoto.
El SHA del commit de implementación se obtiene con git log y el mensaje
feat(ui): complete Consola stage 3 navigation and library.
