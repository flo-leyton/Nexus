# NEXUS Studio — DEVELOPMENT_MASTER.md

**Horizonte:** 3 semanas  
**Equipo:** DEV-A + DEV-B + Codex  
**Objetivo:** máxima velocidad manteniendo arquitectura, pruebas y un vertical multicámara funcional.

---

# 1. Modelo de trabajo

Los humanos:

- deciden;
    
- priorizan;
    
- revisan;
    
- prueban físicamente;
    
- aceptan.
    

Codex:

- analiza;
    
- implementa;
    
- prueba;
    
- documenta;
    
- reporta.
    

Codex no decide unilateralmente arquitectura o producto.

---

# 2. Regla principal del proyecto

La prioridad es:

**terminar un vertical multicámara completo sin convertir NEXUS en una demo trivial.**

Se preservan explícitamente:

- arquitectura 1→N;
    
- routing por Node;
    
- múltiples Nodes;
    
- WebRTC como preview objetivo;
    
- grabación local;
    
- Take;
    
- MediaAssets;
    
- Cloudinary;
    
- reconnect cuando sea posible.
    

---

# 3. Development Tracks

El desarrollo se divide en dos tracks paralelos.

## TRACK A — Critical Product Path

Nunca puede quedar bloqueado por features de calidad.

Incluye:

```
Session
Node
Join
Routing
Ready
Recording
REC/STOP
Take
Media
Cloudinary
```

## TRACK B — Quality Features

Avanza en paralelo.

Incluye:

```
WebRTC
3–4 Nodes
QR
Reconnect
Health
Synchronization
UI polish
```

Si Track B causa regresiones:

se aisla o feature-flaggea.

No se sacrifica Track A.

---

# 4. Ownership

## DEV-A — Controller / Product / Media

Responsable principal:

- Studio;
    
- Session Application;
    
- Controller;
    
- Session UI;
    
- Take;
    
- Media;
    
- Cloudinary;
    
- catálogo;
    
- persistencia;
    
- multiview UI.
    

---

## DEV-B — Nodes / Transport / Capture

Responsable principal:

- Node Runtime;
    
- protocol implementation;
    
- WebSocket;
    
- Gateway;
    
- routing;
    
- CaptureEngine;
    
- device health;
    
- reconnect;
    
- PreviewTransport;
    
- WebRTC.
    

---

## Shared

Cambios requieren revisión mutua:

- domain;
    
- protocol;
    
- interfaces;
    
- architecture;
    
- database schema;
    
- security;
    
- Session lifecycle.
    

---

# 5. MOD-01 — Domain

Owner: SHARED

Paths:

```
domain/session
domain/node
domain/take
domain/media
```

Solo TypeScript puro.

Prohibido importar:

- Expo;
    
- React;
    
- React Native;
    
- Firebase;
    
- Cloudinary;
    
- WebSocket;
    
- SQLite.
    

Tests unitarios obligatorios.

---

# 6. MOD-02 — Protocol

Owner: SHARED  
Implementación principal: DEV-B.

Contiene:

- NexusMessage;
    
- commands;
    
- events;
    
- validation;
    
- ACK;
    
- versioning.
    

Todo mensaje debe contener:

```
protocolVersion
messageId
type
sessionId
senderId
targetId cuando corresponda
sentAt
payload
```

No cambiar protocolo durante una tarea UI.

---

# 7. MOD-03 — Session

Owner: DEV-A

Responsabilidades:

```
createSession
loadSession
endSession
manageNodes
associateTake
```

No accede directamente a:

- WebSocket;
    
- Firebase;
    
- Cloudinary.
    

---

# 8. MOD-04 — Controller

Owner: DEV-A

Responsabilidades:

- Nodes list;
    
- role assignment;
    
- readiness;
    
- REC/STOP;
    
- Take state;
    
- preview layout;
    
- media results.
    

Controller no supone que:

`send command == command executed`

Debe consumir estados/ACK.

---

# 9. MOD-05 — Node Runtime

Owner: DEV-B

Responsabilidades:

- join Session;
    
- Node identity;
    
- receive commands;
    
- report readiness;
    
- CaptureEngine;
    
- report recording state;
    
- reconnect.
    

Debe soportar múltiples Nodes conectados simultáneamente.

---

# 10. MOD-06 — ControlTransport

Owner: DEV-B

Responsabilidades:

- socket lifecycle;
    
- message send;
    
- message receive;
    
- status;
    
- validation boundary;
    
- reconnect.
    

No contiene lógica de cámara.

---

# 11. MOD-07 — Gateway

Owner: DEV-B

Debe evolucionar relay actual hacia:

```
Session Registry
Node Registry
Connection Registry
Targeted Routing
Group Routing
Presence
Signaling
```

Debe soportar:

```
Controller
 ├── Node 1
 ├── Node 2
 ├── Node 3
 └── Node N
```

Tests automáticos deben incluir mínimo cuatro clientes simulados cuando corresponda.

---

# 12. MOD-08 — CaptureEngine

Owner: DEV-B

Funciones:

```
initialize
getReadiness
startRecording
stopRecording
getRecordingState
```

Master local obligatorio.

Baseline:

MP4 / H.264 / AAC.

Pérdida de red no detiene grabación.

---

# 13. MOD-09 — Media

Owner: DEV-A

Gestiona:

- MediaAsset;
    
- catálogo;
    
- Session association;
    
- Take association;
    
- Node association;
    
- upload state.
    

---

# 14. MOD-10 — MediaStorage

Owner: DEV-A

Adapter actual:

Cloudinary.

Debe mantenerse detrás de interfaz.

No acoplar UI a Cloudinary.

---

# 15. MOD-11 — Persistence

Owner: DEV-A

Durante este proyecto:

AsyncStorage puede permanecer si funciona.

SQLite se implementará cuando:

- aporte valor claro;
    
- no ponga en riesgo el vertical.
    

No hacer migraciones simplemente por perfección arquitectónica.

---

# 16. MOD-12 — Preview

Owner: DEV-B  
Consumer: DEV-A

Contrato:

`PreviewTransport`

Objetivo:

WebRTC.

La primera implementación puede comenzar con un Node.

Después escalar a varios previews.

Requisitos:

- preview no bloquea recording;
    
- preview puede detenerse sin afectar Take;
    
- calidad de preview inferior al master.
    

Si WebRTC requiere cambios nativos significativos:

Codex debe reportar plan antes de implementarlos.

---

# 17. MOD-13 — Identity

Firebase queda congelado inicialmente.

No modificar Auth salvo Backlog específico.

NEXUS usa:

```
DeviceId
NodeId
ConnectionId
```

independientemente de Firebase UID.

---

# 18. MOD-14 — Device Health

Owner: DEV-B

MUST básico:

- camera;
    
- permission;
    
- recording ready;
    
- connection.
    

SHOULD:

- battery;
    
- storage;
    
- thermal;
    
- network quality.
    

---

# 19. Time-Box Rules

El proyecto dura tres semanas.

Una tarea no puede convertirse en investigación infinita.

Si Codex encuentra un bloqueo durante una tarea:

1. identificarlo;
    
2. probar máximo una solución razonable adicional;
    
3. reportar;
    
4. proponer fallback;
    
5. detener expansión de scope.
    

---

# 20. WebRTC Time Box

WebRTC tiene prioridad alta.

Se le asignará trabajo específico.

Pero:

- no puede bloquear recording;
    
- no puede romper ControlTransport;
    
- debe vivir detrás de PreviewTransport.
    

Checkpoint recomendado:

final de la segunda semana.

Si WebRTC básico funciona:

continuar multiview.

Si no:

conservar implementación parcial aislada y activar fallback de preview.

La arquitectura WebRTC permanece documentada aunque el target académico no llegue a completarse.

---

# 21. 1→N Validation

Toda feature relacionada con Sessions, routing o Nodes deberá considerar N desde el inicio.

Prohibido:

```
remoteDevice
otherDevice
targetRole === 'B'
```

como modelo central.

Preferir:

```
nodes: Node[]
targetNodeId
targetNodeIds[]
```

Pruebas del Gateway:

- Controller;
    
- Node 1;
    
- Node 2;
    
- Node 3.
    

Debe comprobarse que:

- directed message llega solo al target;
    
- group message llega al grupo;
    
- Session isolation funciona.
    

---

# 22. AI Coding Rules

Codex debe:

- leer fuentes de verdad;
    
- inspeccionar código actual;
    
- limitarse al Backlog Item;
    
- reutilizar código compatible;
    
- crear tests;
    
- reportar contradicciones.
    

Codex no debe:

- reescribir módulos no relacionados;
    
- cambiar arquitectura;
    
- hacer refactors oportunistas;
    
- instalar dependencias sin justificar;
    
- tocar Firebase Auth sin autorización;
    
- exponer secrets;
    
- reemplazar tecnología estable sin pedido;
    
- convertir WebSocket en media transport.
    

---

# 23. Task Classes

## SMALL

Un módulo.

Sin contratos públicos.

Implementación directa permitida.

## MEDIUM

Varios archivos del mismo módulo.

Codex presenta plan breve antes de editar.

## ARCHITECTURAL

Toca:

- Domain;
    
- Protocol;
    
- public interfaces;
    
- routing;
    
- database schema;
    
- security;
    
- multiple modules.
    

Requiere ExecPlan y revisión humana.

---

# 24. Quality Gates

Antes de merge:

```
npm run lint
npx tsc --noEmit
tests
```

Todos deben pasar salvo excepción humana explícitamente documentada.

---

# 25. Testing Strategy

## Domain

Unit tests.

## Protocol

Valid/invalid message tests.

## Gateway

Automated multi-client tests.

## Session

Use-case/integration tests.

## Capture

Physical device.

## 1→N

Physical + simulated clients.

## WebRTC

Minimum:

Node → Controller physical preview.

Target:

multiple simultaneous previews.

## Cloudinary

Small real asset upload.

---

# 26. Daily Integration Rule

Las ramas no deben permanecer separadas durante muchos días.

Ideal:

merge frecuente.

Evitar dos ramas grandes que diverjan durante una semana completa.

---

# 27. Branches

Formato:

```
feature/NX-###-short-name
fix/NX-###-short-name
```

No ramas permanentes por módulo.

---

# 28. Pull Requests

PR pequeño y focalizado.

PR debe indicar:

```
Backlog ID
Goal
Files
Tests
Manual validation
Known limitations
```

Domain / Protocol requieren review del otro developer.

---

# 29. Definition of Done

Una tarea está DONE cuando:

- funciona;
    
- cumple acceptance criteria;
    
- tests pasan;
    
- lint pasa;
    
- TypeScript pasa;
    
- no contiene cambios ajenos;
    
- diff fue revisado;
    
- limitaciones están documentadas.
    

---

# 30. MVP Protection Rule

Si aparece una feature nueva:

preguntar:

**¿mejora directamente la demostración Session → Nodes → Record → Media?**

Si NO:

no implementar ahora.

---

# 31. Prompt Standard

Cada prompt a Codex deberá incluir únicamente:

```
TASK
NX-ID

MODULE
MOD-ID

GOAL

SOURCE OF TRUTH
Read AGENTS.md and canonical docs.

SCOPE

OUT OF SCOPE

ACCEPTANCE CRITERIA

VALIDATION

DELIVERY
```

No volver a copiar arquitectura completa en cada prompt.

---

# 32. Final Development Principle

La IA puede escribir prácticamente todo el código.

La IA no define unilateralmente:

- producto;
    
- arquitectura;
    
- protocolo;
    
- scope;
    
- aceptación.
    

Los humanos mantienen esas decisiones.