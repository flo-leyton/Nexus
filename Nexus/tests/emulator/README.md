# RTDB local aislada para H4

Esta carpeta es solo para pruebas. No configura ni despliega Firebase real.
La política database.rules.json es una PROPUESTA mínima de denegación; no es una
copia ni una verificación de las reglas actualmente desplegadas de NEXUS.

## Requisitos y ejecución (desde Nexus/ del worktree H4)

- Node 24.19.0 probado. Java 21 o superior; Java 8 del PATH no sirve.
- Herramientas separadas: Firebase CLI 15.36.0, rules-unit-testing 5.0.0,
  Firebase cliente 12.19.0. package.json/lockfile de la app NO se modifican.
- Emulator RTDB 4.11.2 descargado por CLI a su caché habitual, fuera de Git.

```powershell
npm.cmd ci --prefix tests/emulator/tools --ignore-scripts
$env:NEXUS_EMULATOR_JAVA_HOME = '<directorio de Java 21>'
node tests/emulator/run.cjs
```

No ejecutar firebase init, login, deploy, database:remove ni el relay productivo.
El comando anterior inicia/cierra solo el emulador local y los hijos de prueba.
No copiar .env ni credenciales al directorio de herramientas. Las dependencias de
prueba se fijan en su propio lockfile; no ejecutar npm audit fix automáticamente.
La instalación de estas herramientas reportó 19 avisos (14 moderados, 5 altos),
independientes de los 51 de la app. Son herramientas de test, excluidas del APK;
esta etapa no resuelve ni oculta esa deuda de dependencias.

## Aislamiento

- Proyecto fijo demo-nexus-h34b. RTDB 127.0.0.1:19000, hub 14400, logging 14500.
  Se comprueba que esos puertos estén libres antes de iniciar, sin adoptar procesos ajenos.
- Se crea un entorno hijo por lista permitida de variables del sistema. Se descartan
  EXPO_PUBLIC_*, credenciales Admin/ADC/tokens, URLs de producción y proxies.
- EXPO_NO_DOTENV=1; no se carga el .env de DevA en los procesos de prueba.
- Firebase CLI recibe una configuración sintética con solo projectId; execute.cjs
  comprueba su forma exacta y la elimina. Se evita que CLI invente una URL remota.
- assert-isolation.cjs exige el host local y proyecto demo. network-guard.cjs impide
  abrir sockets externos incluso si una URL accidental se introdujera en un test.
- El almacén de integración usa un prefijo aleatorio nexusStudioEmulatorTests/<uuid>.
  Se limpia solo ese prefijo local. La prueba de reglas usa nexusStudio/relayV1
  exclusivamente dentro del emulador y restaura la política segura tras el control.
- La configuración de CLI es local (.runtime/); logs y dependencias están ignorados.
  No publicar logs: incluso los emuladores pueden escribir tokens sintéticos de prueba.
- run.cjs no modifica las variables de la terminal padre ni el Java del sistema.

## Qué cubre

El ejecutor corre la suite completa, secuencialmente, con el emulador habilitado.
El test rtdb-emulator.test.cjs ya existente deja de ser SKIP: transacción Admin real,
lectura y conflicto de revisión. Las nuevas pruebas añaden:

- Aislamiento de entorno y rechazo de sockets no locales antes de conectarse.
- Relay real en un proceso hijo, WebSockets locales y adaptador Admin real contra
  RTDB emulada. Crear Session, aceptar dos Nodes, roles, READY, Take guardada,
  dos referencias sintéticas y otra Take con un resultado guardado y otro desconocido.
- Terminación abrupta SOLO de ese hijo y arranque de otro proceso sobre los mismos
  datos del emulador: Session/código/identidades/roles/Takes/referencias conservados,
  READY nuevo, comandos viejos rechazados, cierre explícito y siguiente Take.
- Clientes sin Auth, Controller, Node y usuario ajeno reciben PERMISSION_DENIED
  al leer/escribir el prefijo protegido, descendientes y padres con la política propuesta.
- Control negativo local: una concesión autenticada en el padre permite el acceso
  pese al deny del hijo. El test lo detecta y restaura la política de denegación.

No hay cámara, vídeos ni subidas reales; los ACK, resultados de captura y referencias
son sintéticos. El verificador del relay hijo usa tokens sintéticos: NO certifica
Firebase Auth productivo. Las pruebas de reglas usan contextos de usuario emulados,
no Admin para demostrar denegación. Admin solo prepara/limpia datos de prueba.
La integración de persistencia sí usa transacciones de RTDB, no el almacén en memoria.

## Límites

Pendiente: leer las reglas de la instancia real autorizada, evaluar los permisos
heredados efectivos, revisar IAM y verificar Auth/RTDB/Render reales en un entorno
de ensayo aprobado. No reiniciar el relay compartido para esta prueba. El catálogo
y la reproducción/captura física siguen requiriendo dispositivos. H3/H4 no quedan
aceptados globalmente por estos resultados.

Referencia: https://firebase.google.com/docs/emulator-suite/connect_rtdb
Pruebas de reglas: https://firebase.google.com/docs/rules/unit-tests
