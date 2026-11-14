# NEXUS Studio — BACKLOG.md

**Horizonte:** aproximadamente 3 semanas  
**Equipo:** DEV-A + DEV-B + Codex

---

# 1. Prioridad MoSCoW

## MUST

Sin esto no existe el MVP académico.

## SHOULD

Aumenta significativamente la calidad y se desarrollará activamente.

## COULD

Solo cuando MUST y SHOULD críticos estén estables.

## WON'T

Fuera del proyecto actual.

---

# 2. Milestone final

## MVP académico objetivo

```
1 Controller
+
2 Nodes obligatorios
+
3–4 Nodes como target de calidad
```

Flujo:

```
Create Session
 ↓
Nodes Join
 ↓
Assign Roles
 ↓
READY
 ↓
REC
 ↓
Local Recording
 ↓
STOP
 ↓
Take
 ↓
MediaAssets
 ↓
Media Library
 ↓
Cloudinary
```

Quality target:

```
+
WebRTC Preview
+
Reconnect
+
QR
```

---

# EPIC 0 — Baseline

## NX-001 — Freeze Studio baseline

Priority: MUST  
Owner: SHARED

Acceptance:

- repo actualizado;
    
- Cloudinary actual incluido;
    
- commit común;
    
- ambos devs trabajan desde mismo HEAD.
    

---

## NX-002 — Restore TypeScript green baseline

Priority: MUST  
Owner: SHARED

Acceptance:

```
npm run lint PASS
npx tsc --noEmit PASS
```

No feature nueva antes de estabilizar baseline.

---

## NX-003 — Development governance

Priority: MUST  
Owner: SHARED

Crear:

```
AGENTS.md
docs/ARCHITECTURE.md
docs/DEVELOPMENT_MASTER.md
docs/BACKLOG.md
```

---

# EPIC 1 — Domain Foundation

## NX-010 — Session domain

Priority: MUST  
Owner: DEV-A  
Review: DEV-B

Implementar:

- SessionId;
    
- Session;
    
- SessionStatus;
    
- ControllerId;
    
- nodes collection.
    

Tests.

---

## NX-011 — Node domain

Priority: MUST  
Owner: DEV-B  
Review: DEV-A

Implementar:

- NodeId;
    
- DeviceId;
    
- NodeStatus;
    
- NodeRole;
    
- readiness.
    

No límites 1:2 hardcoded.

---

## NX-012 — Take domain

Priority: MUST  
Owner: DEV-A

Implementar:

- TakeId;
    
- sequence;
    
- state;
    
- associated MediaAssets.
    

---

## NX-013 — MediaAsset canonical model

Priority: MUST  
Owner: DEV-A

Adaptar implementación existente.

Mantener compatibilidad con Cloudinary.

---

# EPIC 2 — Protocol

## NX-020 — NexusMessage v1

Priority: MUST  
Owner: DEV-B  
Review: DEV-A

Crear envelope común.

---

## NX-021 — Protocol validation

Priority: MUST  
Owner: DEV-B

Mensajes inválidos no pasan al Application Layer.

---

## NX-022 — Critical commands

Priority: MUST  
Owner: DEV-B

Definir:

```
JOIN_SESSION
NODE_READY
ASSIGN_ROLE
START_RECORDING
STOP_RECORDING
ACK
RECORDING_STARTED
RECORDING_STOPPED
NODE_STATUS
```

---

# EPIC 3 — 1→N Sessions

## NX-030 — Gateway Session Registry

Priority: MUST  
Owner: DEV-B

Gateway debe conocer:

```
Session
Controller
Nodes[]
Connections[]
```

---

## NX-031 — Multi-node connection

Priority: MUST  
Owner: DEV-B

Acceptance automated:

```
1 Controller
3 simulated Nodes
```

simultáneos.

---

## NX-032 — Targeted routing

Priority: MUST  
Owner: DEV-B

Acceptance:

command to Node 2:

```
Node 1 → no receive
Node 2 → receive
Node 3 → no receive
```

---

## NX-033 — Group routing

Priority: MUST  
Owner: DEV-B

Permitir comandos destinados a todos los Nodes de una Session.

START/STOP utiliza este mecanismo.

---

## NX-034 — Session isolation

Priority: MUST  
Owner: DEV-B

Nodes pertenecientes a otra Session no reciben tráfico.

---

# EPIC 4 — Joining

## NX-040 — Create Session real

Priority: MUST  
Owner: DEV-A

---

## NX-041 — Join code

Priority: MUST  
Owner: DEV-A

Código simple y usable.

No manual A/B.

---

## NX-042 — Node join

Priority: MUST  
Owner: DEV-B

---

## NX-043 — Controller membership UI

Priority: MUST  
Owner: DEV-A

Mostrar lista N de Nodes.

---

## NX-044 — QR join

Priority: SHOULD  
Owner: DEV-A

QR representa join payload.

Fallback:

join code.

---

# EPIC 5 — Readiness

## NX-050 — Basic Node readiness

Priority: MUST  
Owner: DEV-B

Checks:

- camera;
    
- permissions;
    
- recording engine;
    
- connection.
    

---

## NX-051 — Extended health

Priority: SHOULD  
Owner: DEV-B

Añadir:

- battery;
    
- storage;
    
- network;
    
- thermal cuando disponible.
    

---

## NX-052 — Controller readiness UI

Priority: MUST  
Owner: DEV-A

Representar cada Node:

```
Node
Role
Connection
Ready
Recording
```

---

# EPIC 6 — Capture

## NX-060 — CaptureEngine

Priority: MUST  
Owner: DEV-B

Contrato + adapter real.

---

## NX-061 — Local recording

Priority: MUST  
Owner: DEV-B

Una grabación física real.

---

## NX-062 — Local emergency stop

Priority: MUST  
Owner: DEV-B

---

## NX-063 — Keep awake while recording

Priority: SHOULD  
Owner: DEV-B

---

# EPIC 7 — Coordinated Recording

## NX-070 — Remote START

Priority: MUST  
Owner: DEV-B

ACK obligatorio.

---

## NX-071 — Remote STOP

Priority: MUST  
Owner: DEV-B

ACK obligatorio.

---

## NX-072 — Controller REC/STOP

Priority: MUST  
Owner: DEV-A

Un único control.

---

## NX-073 — 1→N recording test

Priority: MUST  
Owner: SHARED

Minimum:

```
Controller
Node 1
Node 2
```

Target:

```
Controller
Node 1
Node 2
Node 3
```

Acceptance:

todos producen archivo local.

---

# EPIC 8 — Take + Media

## NX-080 — Create Take

Priority: MUST  
Owner: DEV-A

---

## NX-081 — Register captured MediaAsset

Priority: MUST  
Owner: DEV-B

Cada Node genera MediaAsset.

---

## NX-082 — Aggregate Take

Priority: MUST  
Owner: DEV-A

Take muestra assets de distintos Nodes.

---

## NX-083 — Media library integration

Priority: MUST  
Owner: DEV-A

Reutilizar catálogo existente.

---

# EPIC 9 — Cloudinary

## NX-090 — Stabilize Cloudinary adapter

Priority: MUST  
Owner: DEV-A

Config `.env` real.

No secret.

---

## NX-091 — Captured Media upload

Priority: MUST  
Owner: DEV-A

Permitir subir MediaAssets capturados.

---

## NX-092 — Upload states

Priority: SHOULD  
Owner: DEV-A

```
local
queued
uploading
uploaded
failed
```

---

## NX-093 — Retry

Priority: SHOULD  
Owner: DEV-A

---

# EPIC 10 — Reliability

## NX-100 — Automatic reconnect

Priority: SHOULD-HIGH  
Owner: DEV-B

Exponential backoff.

---

## NX-101 — Recording survives disconnect

Priority: MUST  
Owner: DEV-B

Physical test.

Un Node grabando no debe detener master por pérdida de Control Plane.

---

## NX-102 — State republish after reconnect

Priority: SHOULD-HIGH  
Owner: DEV-B

---

# EPIC 11 — WebRTC Preview

## NX-110 — PreviewTransport

Priority: SHOULD-HIGH  
Owner: DEV-B  
Review: DEV-A

Contrato desacoplado.

---

## NX-111 — Single Node WebRTC preview

Priority: SHOULD-HIGH  
Owner: DEV-B

Target:

```
Node → Controller live preview
```

Debe probarse en dispositivos reales.

---

## NX-112 — Controller preview card

Priority: SHOULD-HIGH  
Owner: DEV-A

Integrar preview al Node card.

---

## NX-113 — Multi-node WebRTC preview

Priority: SHOULD  
Owner: DEV-B + DEV-A

Target mínimo:

2 previews simultáneos.

Target calidad:

3–4 previews.

---

## NX-114 — Preview degradation handling

Priority: COULD

Preview falla:

recording sigue funcionando.

---

# EPIC 12 — Synchronization

## NX-120 — Scheduled START_AT

Priority: SHOULD-HIGH  
Owner: DEV-B

Controller genera timestamp futuro.

---

## NX-121 — Capture timing metadata

Priority: SHOULD-HIGH  
Owner: DEV-B

Guardar:

```
scheduledStartAt
commandReceivedAt
recordingStartedAt
```

---

## NX-122 — Sync measurement

Priority: SHOULD

Medir diferencia real entre Nodes.

No prometer frame-perfect.

---

# EPIC 13 — UI Quality

## NX-130 — Studio dashboard

Priority: MUST  
Owner: DEV-A

---

## NX-131 — Session screen

Priority: MUST  
Owner: DEV-A

Mostrar claramente:

Controller;  
Nodes;  
roles;  
readiness;  
recording;  
Take.

---

## NX-132 — Recording state UX

Priority: MUST  
Owner: DEV-A

Estados claros:

```
READY
RECORDING
STOPPING
DONE
ERROR
```

---

## NX-133 — Multiview layout

Priority: SHOULD  
Owner: DEV-A

Especialmente cuando WebRTC esté disponible.

---

## NX-134 — Presentation polish

Priority: SHOULD  
Owner: DEV-A

Sin rediseños estructurales tardíos.

---

# EPIC 14 — Persistence Improvement

## NX-140 — SQLite evaluation

Priority: COULD  
Owner: DEV-A

Solo ejecutar si AsyncStorage empieza a limitar el sistema.

---

## NX-141 — SQLite migration

Priority: COULD

No forma parte del camino crítico.

---

# EPIC 15 — Security

## NX-150 — Input validation

Priority: MUST  
Owner: DEV-B

---

## NX-151 — Session isolation

Priority: MUST  
Owner: DEV-B

---

## NX-152 — No secrets in client

Priority: MUST  
Owner: SHARED

---

## NX-153 — Session tokens

Priority: COULD / POST-ACADEMIC

---

## NX-154 — WSS production deployment

Priority: COULD / POST-ACADEMIC

---

# WEEK 1 — FOUNDATION + 1→N

## Shared

NX-001  
NX-002  
NX-003

## DEV-A

NX-010  
NX-012  
NX-013  
NX-040  
NX-041

## DEV-B

NX-011  
NX-020  
NX-021  
NX-022  
NX-030  
NX-031

### Week 1 target

```
Controller creates Session

3 simulated Nodes can connect

Nodes have IDs

Controller can display multiple Nodes
```

---

# WEEK 2 — PRODUCT EXISTS

## DEV-A

NX-043  
NX-052  
NX-072  
NX-080  
NX-082  
NX-083

## DEV-B

NX-032  
NX-033  
NX-034  
NX-042  
NX-050  
NX-060  
NX-061  
NX-070  
NX-071

## Shared

NX-073

### Week 2 hard target

```
Controller
   │
   ├── Node 1
   │     └── local video
   │
   └── Node 2
         └── local video

One REC
One STOP

Both clips
→ one Take
```

---

# WEEK 2 PARALLEL QUALITY TRACK

As soon as critical dependencies permit:

DEV-B begins:

NX-110  
NX-111  
NX-120

DEV-A prepares:

NX-112

WebRTC does not block Critical Track.

---

# WEEK 3 — QUALITY + INTEGRATION

Primary:

NX-090  
NX-091  
NX-101  
NX-130  
NX-131  
NX-132

High priority quality:

NX-100  
NX-102  
NX-111  
NX-112  
NX-113  
NX-120  
NX-121  
NX-044  
NX-051  
NX-133  
NX-134

---

# FINAL ACCEPTANCE — MUST

Project is accepted when:

- application identifies as NEXUS Studio;
    
- Session is real;
    
- architecture is 1→N;
    
- at least 2 physical Nodes participate;
    
- Controller identifies each separately;
    
- roles exist;
    
- READY exists;
    
- START is remote;
    
- STOP is remote;
    
- each Node records locally;
    
- Take contains MediaAssets from multiple Nodes;
    
- media library works;
    
- Cloudinary works;
    
- one Node disconnect does not destroy already-running recording;
    
- TypeScript passes;
    
- lint passes;
    
- protocol/routing tests pass.
    

---

# FINAL ACCEPTANCE — QUALITY TARGET

Excellent result if additionally:

- 3 Nodes recorded simultaneously;
    
- WebRTC preview works;
    
- 2+ previews visible;
    
- QR joining works;
    
- reconnect works;
    
- health includes battery/storage;
    
- scheduled START improves sync;
    
- interface is polished.
    

---

# WON'T — CURRENT PROJECT

Explicitly excluded:

- N↔N;
    
- social streaming;
    
- complete video editor;
    
- AI editing;
    
- marketplace;
    
- security monitoring;
    
- robotics;
    
- ProRes;
    
- RAW;
    
- genlock;
    
- Internet guests;
    
- microservices;
    
- production-grade cloud security architecture.
    

---

# Scope Protection

No feature may enter the current project unless:

1. improves Controller → Nodes → Record → Media;
    
2. does not jeopardize MUST items;
    
3. has an assigned owner;
    
4. can be validated within the remaining timeline.
    

When in doubt:

finish existing vertical before starting another.