# NEXUS Studio — ARCHITECTURE.md

**Versión:** 0.2  
**Horizonte actual:** MVP universitario — aproximadamente 3 semanas  
**Equipo:** 2 desarrolladores + Codex como agente principal de implementación  
**Producto:** NEXUS Studio  
**Propuesta:** **Un estudio de grabación para el bolsillo.**

---

# 1. Propósito del sistema

NEXUS Studio convierte varios teléfonos existentes en un sistema coordinado de grabación multicámara.

El flujo conceptual es:

**Create Session → Join Devices → Assign Roles → Ready → Record → Stop → Collect Media**

La arquitectura fundamental es:

**1 Controller → N Nodes → Session → Takes → MediaAssets**

El producto no se define como una plataforma genérica de control remoto.

---

# 2. Objetivo académico actual

El proyecto debe finalizar en aproximadamente tres semanas de trabajo no completamente constante.

La arquitectura, sin embargo, no debe limitarse artificialmente a una demo 1:1 o 1:2.

Se establecen dos niveles:

## 2.1 MVP académico obligatorio

Debe demostrar:

- 1 Controller real;
    
- mínimo 2 Nodes simultáneos reales;
    
- arquitectura y protocolo preparados para N Nodes;
    
- Session;
    
- identidad individual de Nodes;
    
- routing individual;
    
- roles;
    
- estado Ready;
    
- START/STOP remoto;
    
- grabación local por Node;
    
- Take común;
    
- MediaAssets;
    
- catálogo de medios;
    
- almacenamiento Cloudinary;
    
- persistencia básica;
    
- manejo razonable de desconexiones.
    

## 2.2 Target de calidad

Se intentará además:

- 3–4 Nodes concurrentes;
    
- preview remoto;
    
- WebRTC;
    
- QR joining;
    
- reconnect automático;
    
- sincronización temporal mejorada;
    
- health avanzado;
    
- UI multicámara pulida.
    

Estas funcionalidades no deben comprometer el flujo principal.

---

# 3. Invariantes arquitectónicos

## AR-001 — Session First

`Session` es la unidad central de NEXUS.

Todo Node, Take y MediaAsset pertenece a una Session.

---

## AR-002 — Topología 1→N

Una Session tiene exactamente un Controller activo.

Una Session puede contener múltiples Nodes.

La arquitectura nunca debe asumir que existen exactamente dos dispositivos.

Está prohibido reintroducir semánticas tipo:

`A/B`

como identidad estructural.

El producto deberá soportar conceptualmente:

`1 Controller + N Nodes`.

---

## AR-003 — Límite de certificación ≠ límite de arquitectura

La arquitectura no tendrá un límite hardcoded de dos Nodes.

Para el MVP universitario:

- mínimo certificado: 2 Nodes;
    
- objetivo de pruebas: 3 Nodes;
    
- máximo objetivo inicial: 4 Nodes.
    

El límite puede configurarse, no incrustarse en el dominio.

---

## AR-004 — Nodes no coordinan otros Nodes

Los Nodes no necesitan comunicación directa entre ellos.

El Controller coordina.

El Gateway enruta.

Los Nodes capturan y reportan estado.

---

## AR-005 — Local Master

Cada Node graba su archivo maestro localmente.

La calidad del master nunca debe depender de:

- WebSocket;
    
- WebRTC;
    
- Cloudinary;
    
- Controller;
    
- calidad momentánea de Internet.
    

---

## AR-006 — Three Plane Architecture

NEXUS separa:

### Control Plane

Mensajes pequeños:

- JOIN;
    
- READY;
    
- START;
    
- STOP;
    
- STATUS;
    
- ACK;
    
- DEVICE_STATE;
    
- CAMERA_SETTINGS.
    

Tecnología actual/objetivo:

WebSocket.

### Preview Plane

Preview de baja calidad hacia Controller.

Tecnología objetivo:

WebRTC.

### Media Plane

Master local + transferencia posterior.

Tecnologías:

filesystem local + MediaStorage.

Nunca transportar masters por WebSocket.

---

# 4. WebRTC

WebRTC se mantiene como característica importante de NEXUS.

Objetivo:

**Node → Controller live preview**

No forma parte del transporte de masters.

Arquitectura:

```
Controller
 ├── Preview Node 1
 ├── Preview Node 2
 ├── Preview Node 3
 └── Preview Node N
```

El sistema deberá aislar WebRTC detrás de:

`PreviewTransport`

La implementación del resto del producto no podrá depender de que WebRTC esté disponible.

Si WebRTC falla:

- grabación sigue funcionando;
    
- Controller mantiene estado de Nodes;
    
- START/STOP sigue funcionando.
    

Un preview temporal por snapshots está permitido exclusivamente como fallback técnico.

---

# 5. Provider Independence

El dominio no depende directamente de:

- Firebase;
    
- Cloudinary;
    
- Expo;
    
- WebSocket;
    
- WebRTC;
    
- AsyncStorage;
    
- SQLite;
    
- React Native.
    

Esas tecnologías son adapters.

---

# 6. Reglas de dependencia

```
Presentation
     ↓
Application
     ↓
Domain

Infrastructure
     ↑
Application
```

Domain nunca importa:

- UI;
    
- React;
    
- React Native;
    
- Expo;
    
- Firebase;
    
- Cloudinary;
    
- WebSocket;
    
- WebRTC;
    
- SQLite.
    

---

# 7. Modelo de dominio

## Session

Representa la sesión temporal multicámara.

Estados mínimos:

```
draft
joining
preparing
ready
recording
finishing
completed
failed
```

---

## Node

Representa la participación de un dispositivo en una Session.

Debe contener:

- NodeId;
    
- DeviceId;
    
- SessionId;
    
- role;
    
- status;
    
- capabilities;
    
- health.
    

Roles iniciales:

```
main-camera
side-camera
detail-camera
audio
unassigned
```

No limitar el dominio a estos roles.

---

## Take

Representa una grabación coordinada.

Una Session puede contener varias Takes.

Cada Take agrupa los MediaAssets generados por diferentes Nodes.

---

## MediaAsset

Representa un medio perteneciente a NEXUS.

Tipos:

```
video
audio
image
```

Origen:

```
capture
import
output
```

Estados de transferencia:

```
local
queued
uploading
uploaded
failed
```

Cloudinary `public_id` nunca reemplaza el MediaAssetId de NEXUS.

---

# 8. Identidad

Se mantienen separadas:

```
UserId
DeviceId
NodeId
ConnectionId
```

### UserId

Cuenta del usuario.

### DeviceId

Identidad persistente de la instalación/dispositivo.

### NodeId

Participación de DeviceId en una Session.

### ConnectionId

Conexión WebSocket actual.

Nunca son intercambiables.

---

# 9. Protocolo NEXUS

Todas las comunicaciones remotas usan un envelope común.

```
interface NexusMessage<T> {
  protocolVersion: number;

  messageId: string;
  type: string;

  sessionId: string;

  senderId: string;
  targetId?: string;

  sentAt: number;

  payload: T;
}
```

No se permiten mensajes WebSocket construidos directamente desde pantallas.

---

# 10. Routing

El relay broadcast actual es considerado infraestructura heredada.

La arquitectura objetivo exige:

```
SessionId
+
target NodeId
```

El Gateway:

- conoce las conexiones de la Session;
    
- conoce cada NodeId;
    
- puede enviar a un Node;
    
- puede enviar a un grupo;
    
- puede enviar a todos los Nodes de una Session cuando el comando lo requiera.
    

Ejemplo:

START_RECORDING puede dirigirse al grupo completo.

CAMERA_SETTING puede dirigirse a un Node específico.

---

# 11. ACK e idempotencia

Comandos críticos requieren ACK:

- START_RECORDING;
    
- STOP_RECORDING;
    
- ASSIGN_ROLE;
    
- REMOVE_NODE.
    

Todo comando crítico posee `messageId`.

Un Node no ejecutará dos veces el mismo comando por retransmisión accidental.

---

# 12. Capture Engine

Debe estar detrás de:

`CaptureEngine`

Responsabilidades:

- permisos;
    
- inicialización;
    
- start;
    
- stop;
    
- archivo local;
    
- metadata;
    
- errores.
    

Baseline recomendado:

```
MP4
H.264
AAC
1080p
30fps
```

si el dispositivo lo soporta.

La red no controla la existencia del archivo maestro.

---

# 13. Recording resiliente

Si un Node está grabando y pierde:

- Controller;
    
- Gateway;
    
- Internet;
    
- Preview;
    

debe continuar grabando localmente.

Debe existir STOP local de emergencia.

---

# 14. Preview

Contrato:

`PreviewTransport`

Implementación objetivo:

WebRTC.

Target inicial:

- preview de baja calidad;
    
- prioridad inferior a grabación;
    
- degradable;
    
- descartable.
    

La pérdida de preview nunca es equivalente a pérdida del Node.

---

# 15. Persistencia

## Estado actual permitido

AsyncStorage puede permanecer temporalmente para:

- demo;
    
- preferencias;
    
- catálogo actual;
    
- configuración.
    

## Arquitectura objetivo

SQLite para:

- Sessions;
    
- Nodes;
    
- Takes;
    
- MediaAssets;
    
- Upload jobs.
    

Los archivos binarios permanecen en filesystem.

La migración a SQLite se implementará solo si no compromete el camino crítico.

---

# 16. Media Storage

Contrato:

```
interface MediaStorage {
  upload(...)
  getStatus(...)
  delete(...)
}
```

Adapter actual:

`CloudinaryMediaStorage`

Demo:

unsigned upload preset permitido.

Producción futura:

signed upload / autorización temporal.

Ningún secret vive en la aplicación cliente.

---

# 17. Firebase

Firebase Auth permanece como subsistema existente.

Durante el MVP académico:

- no es requisito para que un Node participe;
    
- no será reescrito;
    
- no representa autorización de una Session.
    

Debe permanecer aislado detrás de IdentityProvider cuando se evolucione esta capa.

---

# 18. Joining

Flujo objetivo:

```
Controller
 ↓
Create Session
 ↓
Join code / QR
 ↓
Node requests join
 ↓
Controller accepts
 ↓
Node becomes Session member
```

Para el MVP:

**join code textual puede ser suficiente.**

QR es prioridad alta pero no bloqueante.

Manual IP no debe ser parte visible del producto final de demostración si puede evitarse.

---

# 19. Readiness

Antes de REC cada Node reportará como mínimo:

- camera available;
    
- permissions;
    
- recording engine ready;
    
- network status;
    
- storage when available;
    
- battery when available.
    

Controller debe mostrar estado individual.

---

# 20. Sincronización

NEXUS no afirmará sincronización frame-perfect.

Primera estrategia:

- Controller calcula inicio futuro;
    
- envía `START_AT`;
    
- Nodes programan grabación;
    
- se guardan timestamps.
    

Metadata mínima:

```
scheduledStartAt
commandReceivedAt
recordingStartedAt
```

Target académico:

suficiente alineación para demostrar grabación coordinada.

Target futuro:

≤250 ms p95.

---

# 21. Seguridad

Durante MVP académico:

- no exponer secretos;
    
- validar mensajes;
    
- HTTPS para Cloudinary;
    
- permisos de cámara/mic;
    
- separación de Sessions;
    
- NodeId real.
    

Arquitectura de producción:

- WSS;
    
- SessionToken;
    
- secure storage;
    
- server-side authorization.
    

La falta de hardening productivo deberá documentarse, nunca ocultarse.

---

# 22. Protected Architecture

Cambios requieren acuerdo humano de ambos desarrolladores:

- Domain models;
    
- protocolo;
    
- interfaces públicas;
    
- Session lifecycle;
    
- identidad;
    
- routing;
    
- persistencia estructural;
    
- seguridad;
    
- topología;
    
- WebRTC architecture.
    

Codex no modifica unilateralmente estas decisiones.

---

# 23. MVP universitario obligatorio

Debe demostrarse:

```
Controller crea Session
        ↓
mínimo dos Nodes se incorporan
        ↓
Controller identifica cada Node
        ↓
cada Node tiene rol
        ↓
cada Node llega a READY
        ↓
Controller pulsa REC
        ↓
Nodes reciben START
        ↓
cada Node graba localmente
        ↓
Controller pulsa STOP
        ↓
Nodes producen MediaAssets
        ↓
Take agrupa los medios
        ↓
medios aparecen en biblioteca
        ↓
Cloudinary puede almacenarlos
```

---

# 24. Target de calidad de tres semanas

Después de asegurar el camino principal, priorizar:

1. WebRTC preview.
    
2. 3–4 Nodes.
    
3. automatic reconnect.
    
4. QR join.
    
5. health avanzado.
    
6. sincronización mejorada.
    
7. pulido visual.
    

---

# 25. Non-Goals

No implementar durante este proyecto:

- N↔N;
    
- marketplace;
    
- vigilancia;
    
- robótica;
    
- streaming social;
    
- editor profesional;
    
- IA de edición;
    
- ProRes/RAW obligatorio;
    
- genlock;
    
- invitados Internet;
    
- microservicios.
    

---

# 26. ADR

Toda desviación estructural debe generar ADR:

```
ADR-ID
Context
Decision
Alternatives
Consequences
Status
```

---

# 27. Rule of Interpretation

Si el código contradice este documento:

**el código debe corregirse.**

Si la arquitectura necesita cambiar:

**primero cambia este documento mediante decisión humana y después el código.**