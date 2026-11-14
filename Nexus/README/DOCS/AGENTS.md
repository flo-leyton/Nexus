# NEXUS Studio — Agent Instructions

NEXUS Studio is developed by two human developers with Codex acting as the primary coding agent.

Humans own product decisions, architecture, priorities, acceptance and physical QA.

Codex owns implementation, tests, scoped refactoring and reporting.

The current project horizon is approximately **3 weeks**.

The objective is to deliver a convincing university MVP without damaging the architecture required for NEXUS Studio to evolve beyond the academic prototype.

---

# 1. Mandatory Sources of Truth

Before modifying code, read:

1. `docs/ARCHITECTURE.md`
    
2. `docs/DEVELOPMENT_MASTER.md`
    
3. the relevant item in `docs/BACKLOG.md`
    

Do not rely only on the user prompt.

The prompt defines the current task.

The repository documentation defines how that task is allowed to be implemented.

---

# 2. Authority Order

When instructions appear to conflict, use this order:

1. explicit human decision in the current task;
    
2. approved ADR;
    
3. `docs/ARCHITECTURE.md`;
    
4. `docs/DEVELOPMENT_MASTER.md`;
    
5. active `docs/BACKLOG.md` item;
    
6. existing implementation;
    
7. Codex suggestion.
    

Existing code does not override architecture.

If current code contradicts the architecture, do not reproduce the contradiction in new code.

---

# 3. Product Definition

NEXUS Studio is:

**“Un estudio de grabación para el bolsillo.”**

Core model:

```
1 Controller
      ↓
    Session
      ↓
   N Nodes
      ↓
    Takes
      ↓
 MediaAssets
```

The architecture is **1→N**, not 1→1, not A/B and not N↔N.

Never introduce a design that fundamentally assumes only two devices.

---

# 4. Current Academic MVP

The critical product path is:

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

Minimum final physical demonstration:

- 1 Controller;
    
- 2 real Nodes;
    
- individually identifiable Nodes;
    
- remote START;
    
- remote STOP;
    
- local recording on each Node;
    
- shared Take;
    
- resulting MediaAssets;
    
- media library;
    
- Cloudinary integration.
    

Target quality:

- 3–4 Nodes;
    
- WebRTC preview;
    
- reconnect;
    
- QR joining;
    
- improved synchronization;
    
- health information;
    
- polished multicamera UI.
    

Quality features must never make the critical path unusable.

---

# 5. Architectural Invariants

Do not violate these rules.

## 5.1 Topology

One active Controller coordinates N Nodes.

Nodes do not need direct Node-to-Node communication.

Do not reintroduce A/B as architecture or identity.

Use collections:

```
nodes: Node[]
```

and identities such as:

```
nodeId
targetNodeId
targetNodeIds
```

---

## 5.2 Three Communication Planes

NEXUS separates:

### Control Plane

WebSocket.

Used for:

- Session communication;
    
- status;
    
- JOIN;
    
- READY;
    
- START;
    
- STOP;
    
- ACK;
    
- health;
    
- signaling.
    

### Preview Plane

Target technology:

WebRTC.

Used only for low-quality live preview.

### Media Plane

Local recording + file transfer.

The original/master video must never be transported through WebSocket.

---

## 5.3 Local Master

Each Node records its master media locally.

A running recording must not stop simply because:

- Controller disconnects;
    
- WebSocket disconnects;
    
- Internet disappears;
    
- Cloudinary fails;
    
- WebRTC preview fails.
    

Preview quality and connectivity are secondary to local recording integrity.

---

## 5.4 Provider Independence

Domain code must not directly depend on:

- Firebase;
    
- Cloudinary;
    
- WebSocket;
    
- WebRTC;
    
- Expo;
    
- React Native;
    
- SQLite;
    
- AsyncStorage.
    

These belong to infrastructure/adapters.

---

## 5.5 Dependencies

Allowed dependency direction:

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

Domain must remain pure.

Circular dependencies are forbidden.

---

# 6. Protected Areas

Do not unilaterally change:

- Domain models;
    
- Protocol contracts;
    
- Session lifecycle;
    
- public interfaces;
    
- identity model;
    
- routing semantics;
    
- persistence schema;
    
- security model;
    
- 1→N topology;
    
- WebRTC architecture;
    
- CaptureEngine contract.
    

If the active task requires one of these changes:

1. identify the change;
    
2. explain why it is necessary;
    
3. produce an implementation plan;
    
4. wait for explicit human approval when requested.
    

Do not silently evolve architecture while implementing another feature.

---

# 7. Module Ownership

The canonical ownership is defined in `docs/DEVELOPMENT_MASTER.md`.

General division:

## DEV-A

Main ownership:

- Studio;
    
- Controller;
    
- Session application;
    
- Session UI;
    
- Take;
    
- Media;
    
- Cloudinary;
    
- persistence;
    
- multiview UI.
    

## DEV-B

Main ownership:

- Node Runtime;
    
- Protocol implementation;
    
- WebSocket;
    
- Gateway;
    
- routing;
    
- CaptureEngine;
    
- reconnect;
    
- Device Health;
    
- PreviewTransport;
    
- WebRTC.
    

## Shared

Requires review from both developers:

- Domain;
    
- Protocol;
    
- public interfaces;
    
- architecture;
    
- database schema;
    
- security;
    
- Session lifecycle.
    

Do not modify another developer's active area unnecessarily.

---

# 8. Protocol Rules

Do not build arbitrary WebSocket payloads inside screens.

All remote messages must use the NEXUS protocol.

Canonical envelope concept:

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

Critical commands require ACK and must support deduplication.

Important critical commands include:

- START_RECORDING;
    
- STOP_RECORDING;
    
- ASSIGN_ROLE;
    
- REMOVE_NODE.
    

Invalid messages must be rejected before entering Application logic.

---

# 9. Routing Rules

The old relay broadcast behavior is legacy infrastructure.

Directed commands must use targeted routing.

The Gateway must support:

```
Controller → individual Node
Controller → selected Nodes
Controller → all Nodes in Session
```

Traffic from Session A must never leak into Session B.

Whenever transport/routing is modified, tests should include multiple simulated clients.

Preferred baseline test:

```
1 Controller
3 Nodes
```

Validate that a targeted message reaches only its intended destination.

---

# 10. WebRTC Rules

WebRTC is a high-priority quality feature.

It must be implemented behind:

```
PreviewTransport
```

Do not couple Session, recording or CaptureEngine to WebRTC.

If WebRTC fails:

- control still works;
    
- recording still works;
    
- Session still works;
    
- Media still works.
    

Start with one Node preview.

Then expand to multiple simultaneous previews.

If native changes or major dependency changes are required:

report them before broad implementation.

Do not replace the Control Plane with WebRTC unless architecture is explicitly changed.

---

# 11. Capture Rules

Capture functionality belongs behind:

```
CaptureEngine
```

Expected responsibilities:

```
initialize
getReadiness
startRecording
stopRecording
getRecordingState
```

Initial media baseline:

```
MP4
H.264
AAC
1080p/30 when supported
```

Do not promise unsupported capture characteristics.

Real capture features require physical-device validation.

---

# 12. Media Rules

A `MediaAsset` belongs to NEXUS.

A Cloudinary asset belongs to Cloudinary.

Do not use Cloudinary `public_id` as the domain identifier.

Media may exist in states such as:

```
local
queued
uploading
uploaded
failed
```

Do not store video binaries in structured databases.

Cloudinary must remain behind the MediaStorage abstraction.

Never expose Cloudinary secrets in client code.

---

# 13. Firebase Rules

Firebase Auth already exists.

Treat it as frozen unless the active Backlog Item explicitly authorizes modifications.

Do not refactor Firebase while implementing:

- Sessions;
    
- Nodes;
    
- media;
    
- routing;
    
- capture;
    
- WebRTC.
    

Firebase UID is not:

- NodeId;
    
- DeviceId;
    
- ConnectionId;
    
- Session authorization.
    

Do not conflate these identities.

---

# 14. Scope Protection

This project has a short academic deadline.

Do not expand tasks because additional improvements appear useful.

Before implementing additional work, ask:

> Does this directly improve Session → Nodes → Record → Media?

If not, do not add it unless the active Backlog Item requires it.

Explicit current non-goals include:

- N↔N topology;
    
- marketplace;
    
- generic device control;
    
- robotics;
    
- surveillance;
    
- social live streaming;
    
- professional video editor;
    
- AI-first editing;
    
- ProRes/RAW requirements;
    
- genlock;
    
- Internet guests;
    
- microservices.
    

---

# 15. Critical Track vs Quality Track

The project has two tracks.

## Critical Track

Must remain operational:

```
Session
Node identity
Join
Routing
READY
Capture
REC/STOP
Take
Media
Cloudinary
```

## Quality Track

Implemented aggressively when possible:

```
WebRTC
Reconnect
QR
3–4 Nodes
Synchronization
Advanced health
Multiview
UI polish
```

A Quality Track feature must not break Critical Track functionality.

If necessary, isolate incomplete quality features behind interfaces, feature flags or fallbacks.

---

# 16. Time-Box Behavior

Do not loop indefinitely on a problem.

When blocked:

1. diagnose the actual cause;
    
2. attempt one reasonable corrective approach;
    
3. if still blocked, report the blocker;
    
4. identify a safe fallback if one exists;
    
5. stop expanding scope.
    

Do not repeatedly reinstall packages, rewrite unrelated files or retry the same failing approach without new evidence.

---

# 17. Before Coding

For every task:

1. read canonical documentation;
    
2. locate the active Backlog Item;
    
3. inspect relevant current code;
    
4. inspect `git diff` / repository state;
    
5. identify dependencies and existing implementation;
    
6. classify task as SMALL, MEDIUM or ARCHITECTURAL;
    
7. avoid editing until scope is understood.
    

For MEDIUM tasks:

provide a concise execution plan.

For ARCHITECTURAL tasks:

produce an ExecPlan when required.

---

# 18. Existing Code

Prefer incremental migration.

Do not perform large repository-wide reorganizations merely to make the folder structure match target architecture.

Working legacy functionality should not be deleted unless explicitly requested.

When migrating:

1. establish new contract;
    
2. adapt existing implementation;
    
3. test;
    
4. remove old path only when safe.
    

---

# 19. Dependency Changes

Do not install a dependency automatically merely because it makes implementation easier.

Before adding one, verify:

- existing dependency cannot solve the problem;
    
- compatibility with current Expo/React Native version;
    
- maintenance status;
    
- whether native rebuild is required;
    
- whether it affects both developers.
    

Report significant dependency additions.

---

# 20. Security

Never:

- expose secrets;
    
- log credentials;
    
- commit secrets;
    
- put API secrets behind `EXPO_PUBLIC_*`;
    
- trust client-supplied identity without validation;
    
- bypass Session isolation.
    

Cloudinary client integration may use the currently approved demo mechanism, but production limitations must remain explicit.

---

# 21. Testing Requirements

Testing level depends on module.

## Domain

Unit tests.

## Protocol

Serialization, valid and invalid messages.

## Gateway

Multi-client automated tests.

## Routing

Controller + multiple simulated Nodes.

## Capture

Physical-device validation.

## WebRTC

Real-device preview validation.

## Media

Real small asset upload when appropriate.

## Full flow

Minimum physical test:

```
1 Controller
2 Nodes
```

Target:

```
1 Controller
3 Nodes
```

---

# 22. Quality Gates

Before declaring a coding task complete, run applicable checks.

Mandatory baseline:

```
npm run lint
npx tsc --noEmit
```

Run automated tests relevant to changed modules.

Report every result as:

```
PASS
FAIL
NOT RUN — reason
```

Do not hide failures.

---

# 23. Definition of Done

A task is complete only when:

- requested behavior is implemented;
    
- scope was respected;
    
- acceptance criteria are satisfied;
    
- relevant tests were added/updated;
    
- validation was executed;
    
- no unrelated changes were introduced;
    
- `git diff` was reviewed;
    
- limitations are documented;
    
- architecture remains consistent.
    

---

# 24. Git Discipline

Do not work directly on `main` unless explicitly instructed.

Branches should be short-lived.

Preferred names:

```
feature/NX-###-short-name
fix/NX-###-short-name
refactor/NX-###-short-name
```

One Backlog Item should normally map to one branch / PR.

Do not mix unrelated Backlog Items in the same branch.

---

# 25. Required Final Report

After every implementation task, report:

## Task

Backlog ID and name.

## Implemented

What behavior now exists.

## Files

Created / modified / deleted.

## Tests

Commands and results.

## Manual validation

Exact steps when physical validation is required.

## Limitations

Known incomplete or device-dependent behavior.

## Architecture

Confirm whether architectural contracts were changed.

If changed, identify the approved ADR or human decision.

## Out-of-scope findings

Mention them without fixing them unless they block the requested task.

---

# 26. Conflict Procedure

If repository reality contradicts documentation:

**do not silently choose one.**

Report:

```
DOCUMENT SAYS:
...

CODE DOES:
...

IMPACT:
...

OPTIONS:
...
```

Wait for human decision when the conflict affects architecture or scope.

---

# 27. Completion Rule

Implement the active Backlog Item.

Validate it.

Report it.

Stop.

Do not start the next Backlog Item automatically.