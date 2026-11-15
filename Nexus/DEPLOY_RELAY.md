# H3.4d · Relay Render · propuesta para aprobación

Estado: preparado localmente, SIN push, servicio creado ni despliegue. H3.4c/H3.4d
siguen pendientes de prueba física. Configuración: `Nexus/render.yaml` desde la raíz
Git; aplicación en `Nexus/`. No importar la configuración privada del relay en EAS.

## Revisión del servicio

| Campo | Valor propuesto |
| --- | --- |
| Tipo / nombre | Web Service Node / nexus-relay |
| Rama / raíz | desarrollo / Nexus |
| Node | 24.15.0 |
| Build / start | `npm ci` / `npm run relay` |
| Región / cómputo | Oregon / `0.5c-512mb` (requiere aprobar costo) |
| Instancias | 1, sin autoscaling |
| Health | GET /health, 503 hasta recuperar RTDB; 200 `{"ready":true}` después |
| Despliegue automático | Off; cada despliegue es manual y revisado |
| Disco / otros servicios | Ninguno; no Postgres, Redis ni disco persistente |

El proceso escucha `0.0.0.0` y `process.env.PORT`; Render suministra PORT (no copiar
el 8080 LAN a la URL pública). Render termina TLS: la app usará el hostname real
asignado por Render con `wss://`, sin puerto interno; health usa `https://`.
`config/server.ts` mantiene IP/PORT manuales para desarrollo.

## Variables del servidor (Dashboard privado, sin valores en Git)

| Nombre | Uso |
| --- | --- |
| NODE_VERSION | 24.15.0, declarado en blueprint |
| NODE_ENV | production, declarado en blueprint |
| PORT | Asignado por Render; no sobrescribir manualmente |
| FIREBASE_PROJECT_ID | Proyecto Firebase existente de la app |
| FIREBASE_DATABASE_URL | URL HTTPS exacta de esa RTDB |
| FIREBASE_ADMIN_CREDENTIALS | JSON completo de cuenta de servicio privada, como variable protegida del servidor |

Credenciales con permisos para verificar Firebase Auth/revocación y leer/escribir
RTDB. Alternativa local ADC: GOOGLE_APPLICATION_CREDENTIALS apunta a un archivo
fuera del repositorio; no se copia esa ruta Windows a Render. No usar ambos métodos
ni subir una cuenta de servicio a EAS. Nunca EXPO_PUBLIC para una credencial Admin.
No incluir tokens/JSON en comandos, documentación, capturas o logs. El blueprint
deja los tres valores Firebase sin sincronizar (`sync:false`), para carga privada.

Persistencia existente: `nexusStudio/relayV1`, schemaVersion=1. Sessions, códigos,
miembros, roles, Takes, diarios y referencias Cloudinary viven en RTDB. Vídeos y
file:// no se guardan allí; originales siguen en teléfonos y remotos en Cloudinary.
Auth Anonymous debe estar habilitado; Email/Password para el formulario Cuenta.
Las reglas del prefijo relay deben negar lectura/escritura de clientes, sin una
regla abierta heredada desde un padre. No se modifican reglas desde este módulo.

## Paso a aprobar, todavía NO ejecutado

1. Revisar commits locales y los archivos exactos; los cambios LAN y el espacio
   ajeno de ENTREGA.md quedan fuera. Publicar sólo desarrollo con `git push origin
   desarrollo` (sin force) DESPUÉS de autorización. Incluye también commits previos
   aún locales de H3.4a/b/c y correcciones, según `git log origin/desarrollo..HEAD`.
2. Detener el relay de la laptop antes de conectar Render a la MISMA RTDB. Un solo
   escritor: no dejar LAN y Render simultáneos. Pruebas LAN posteriores requieren
   detener Render o usar OTRO proyecto/base; nunca borrar/mover datos para ocultarlo.
3. En Render elegir New Blueprint, repositorio del equipo, rama desarrollo y
   Blueprint Path `Nexus/render.yaml`. Revisar nombre, región, un solo cómputo y costo
   antes de crear. Cargar las variables Firebase por el Dashboard privado.
4. Crear/desplegar sólo con aprobación. Esperar recuperación; consultar desde un
   teléfono `https://HOST_REAL_ASIGNADO/health`. Debe ser 200 y ready=true sin revelar
   configuración. Si es 503, revisar permisos/URL/proyecto; no abrir RTDB al público.
5. Anotar el hostname REAL; entregarlo como EXPO_PUBLIC_RELAY_URL en el entorno
   preview de EAS. No compilar con HOST_REAL_ASIGNADO ni otro marcador literal.
6. Para redeploy/restart programado: terminar capturas, desconectar todos los
   clientes y dejar expirar roles pendientes antes de la acción manual. Render
   puede solapar procesos incluso con numInstances=1 durante su cambio de versión.
   El CAS de revisión rechaza escrituras obsoletas; no es una implementación de
   cluster/traspaso sin interrupción. Un conflicto deja health degradado o rechaza
   el nuevo arranque: revisar qué versión está activa y recuperar antes de continuar,
   sin repetir REC ni editar RTDB. No certificar disponibilidad continua por este YAML.

El handler de SIGTERM/SIGINT drena conexiones y la cola durable una sola vez antes
de salir; límite 25 s, inferior al plazo Render habitual. Si no consigue confirmar
el cierre, sale con error y la recuperación conserva resultados desconocidos. Nunca
envía STOP/REC para cerrar el proceso. La prueba automatizada verifica ese ciclo;
falta observarlo contra RTDB/Render reales.

## Costos a aprobar (consulta 2026-11-15)

- Propuesta `0.5c-512mb`: USD 7/mes de cómputo base para una instancia, más impuestos,
  posibles cargos del workspace y uso excedente de red/build. No se contrató nada.
  [Tarifa Render](https://render.com/pricing?trk=public_profile__reactions-text).
- Alternativa Free: USD 0 dentro de cuotas; duerme tras 15 min sin tráfico y puede
  tardar alrededor de un minuto en despertar. Eso excede el timeout de Auth del
  cliente: habría que abrir health, esperar y reconectar. No se selecciona en el
  blueprint propuesto. [Límites Free](https://render.com/docs/free).
- RTDB/Auth y Cloudinary mantienen las cuotas/costos del proyecto existente. El
  relay transmite metadatos, no vídeo; la subida/descarga consume Cloudinary y la
  red del teléfono. Revisar saldo/cuotas antes de la prueba. Sin almacenamiento
  persistente Render añadido ni costos de otra base.

Fuentes de configuración: [Blueprint](https://render.com/docs/blueprint-spec),
[puerto público](https://render.com/docs/web-services),
[despliegue, solapamiento y SIGTERM](https://render.com/docs/deploys).
