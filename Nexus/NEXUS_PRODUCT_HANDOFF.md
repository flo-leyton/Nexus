# NEXUS Product Definition Handoff

## 1. What NEXUS Actually Is Today

NEXUS is an Expo 54 / React Native 0.81.5 mobile prototype connected through a Node `ws` relay. Clients manually connect to a configured LAN address, select local A/B roles, exchange device metadata, and broadcast JSON capability commands. Two device APIs are wired: vibration and rear-camera torch. Firebase supplies a separate account/profile subsystem; it does not authenticate WebSocket connections or authorize commands.

The best topology description is **CLIENT → RELAY → CLIENT**, plus a separate Firebase Auth/RTDB path. It is not peer-to-peer. The relay stores presence only in memory and forwards every non-presence message to every open client except its sender.

Technical audit state: `main` at `a95f34636d9df537fa6df651f3c3eddaa676756d`, clean before report generation. Lint passed, three existing Node tests passed, and strict TypeScript validation failed on incomplete `services/hooks.ts`.

## 2. What Actually Works

- The unmodified relay starts and accepts at least three simultaneous WebSocket clients.
- A message from A reaches other clients and is not echoed to A.
- Valid `DEVICE_INFO` is broadcast, retained for the connection, and replayed after `DEVICE_INFO_REQUEST`.
- A registered disconnect produces server-generated `DEVICE_LEFT` with an ephemeral connection UUID.
- Heartbeat ping/pong works for clients that have published valid device info.
- The app uses one shared socket service with status and message subscriptions.
- Vibration messages are strictly shape/range-validated before calling `Vibration.vibrate`.
- Flashlight messages are validated, require the local B role and camera permission, and drive `CameraView.enableTorch`.
- Firebase email/password registration, login, logout, persisted Auth state, user-profile write/update, and profile observation are connected in code.
- A persistent AsyncStorage device UUID and an RTDB device-record implementation exist, but are not started by the current app.

Relay/presence behavior was locally executed. Physical vibration, physical torch, and live Firebase operations were not performed and must not be described as verified.

## 3. What Does Not Yet Exist

- Automatic device or service discovery.
- Pairing or an accept/reject relationship between devices.
- A trust model or stored trust decision.
- An authenticated WebSocket connection.
- Association between a socket, Firebase UID, persistent device UUID, or physical device.
- Server-side target interpretation or individual routing.
- Server-side command or capability authorization.
- A formal NEXUS session, owner, membership, lease, or lifecycle.
- Capability request/approval or runtime negotiation.
- Command acknowledgement or proof that hardware executed.
- Revocation semantics.
- Automatic socket reconnect/backoff.
- An N-device client presence model; the UI retains only one remote snapshot.
- Passing full TypeScript validation or CI-gated tests.

## 4. Reusable Technical Assets

- Shared WebSocket singleton and observer interface.
- Small Node relay with generic fan-out.
- Ephemeral presence, late-arrival metadata replay, departure notification, and partial heartbeat.
- Strict fixed-shape device metadata validator and Expo metadata collector.
- Capability message validation/execution pattern.
- Firebase Auth/profile services if future product requirements justify accounts.
- Persistent random device-ID and device-record code as an experimental asset, not a finished identity layer.
- Centralized `SERVER_CONFIG` used consistently by app and relay.

## 5. Current Architectural Constraints

1. The endpoint is a manually edited IP/port and uses plain `ws://`.
2. Every command is broadcast to all peers, regardless of `target`.
3. A/B labels are local, self-asserted, ephemeral, and capability-specific.
4. Multiple clients can choose the same target role and all execute one command.
5. Firebase login has no effect on relay admission or capability rights.
6. Presence metadata and connection IDs disappear when the relay/socket ends.
7. The persistent device-ID code is not connected to app startup or transport.
8. The client models one remote device even though the relay accepts many.
9. Heartbeat covers only sockets that published valid device info.
10. Hardware support, permissions, foreground behavior, and platform differences remain real-device unknowns.

## 6. Product-Neutral Core

The current product-neutral core is small: a configurable shared socket, a relay capable of local multi-client fan-out, an ephemeral presence protocol, validated device metadata, and a pattern for mapping validated messages to local device APIs. This is **usable but immature** infrastructure.

Identity, registry, trust, authorization, individual routing, sessions, capability negotiation, and lifecycle are not part of the working core. Firebase is an adjacent account subsystem, not the authority for remote actions.

## 7. Prototype-Specific Pieces

- A/B role selectors and opposite-role assumptions.
- Fixed A→B flashlight direction.
- Five-second vibration command.
- Vibration and flashlight as the chosen demo capabilities.
- Single-remote Devices screen.
- Current tabs, labels, and “Remote Capability Demo” UX.
- Current `CAPABILITY_COMMAND` fields as a product contract.
- Manual LAN endpoint as a user-facing operating model.

These pieces should not constrain product definition through sunk-cost reasoning.

## 8. Technical Opportunities

1. Preserve the verified relay/socket path as an experimental multi-device messaging substrate.
2. Reuse presence replay and validated metadata in device-aware prototypes.
3. Reuse the validator/executor pattern for capabilities selected by product needs.
4. Reuse Firebase accounts only if the product needs persistent users.
5. Investigate the existing persistent device registry as a starting asset, while treating its transport integration as absent.

## 9. Accidental Product Candidates

1. **Synchronized local actuator group.** Broadcast already causes every target-role client to receive one command. It has relay, roles, and two actuators; it lacks consent, group semantics, status, and hardware proof.
2. **Temporary device-status board.** Presence replay, metadata refresh, and departure work. It lacks stable N-device identity/UI, history, and stale-state semantics.
3. **Two-device local remote control.** This most closely matches the implemented A/B behavior. It lacks secure pairing, authorization, reliability, and real-device validation.

These are technical observations, not product recommendations.

## 10. Compatibility Matrix

| Product direction | Reuse | Missing work | Technical fit |
|---|---|---|---|
| Distributed audiovisual production | MEDIUM | Synchronization, media transport, routing, sessions | LOW |
| Distributed sensors/measurement | MEDIUM | Sensor protocol, timestamps, aggregation, N-device identity | MEDIUM |
| Remote observation/monitoring | MEDIUM | Secure remote reach, persistent state, history/alerts | MEDIUM |
| Multi-device education/labs | MEDIUM | Session membership, orchestration, N-device UX | MEDIUM |
| Robotics/research | LOW | Deterministic control, telemetry, safety, authorization | LOW |
| Temporary infrastructure using phones | HIGH | Discovery/onboarding, sessions, routing, resilience | HIGH |
| Remote device-capability control | HIGH | Identity, pairing, authorization, negotiation, acknowledgements | HIGH |

## 11. Cost of Pivot

**MEDIUM.** Transport, presence, metadata, Firebase account utilities, and device-API adapters can be reused. The current interaction semantics cannot: A/B addressing, broadcast routing, one-remote state, and absence of sessions/trust/authorization mean that secure or deterministic multi-device products need a new behavioral core around those assets.

## 12. Questions Product Definition Must Answer

1. What problem genuinely requires more than one device?
2. Is the intended unit exactly two devices, one controller plus many nodes, or symmetric N devices?
3. Are participating devices owned by one person, several people, or an organization?
4. Does participation happen on one local network, across the internet, or both?
5. Who creates, controls, and ends an interaction?
6. Must every device explicitly consent before joining or exposing a capability?
7. Is the relationship temporary, recurring, or permanently trusted?
8. Must a command address one device, a group, or every participant?
9. What outcome requires confirmation: delivery, app acceptance, or physical execution?
10. Which device capabilities are essential to the user problem rather than demonstrations?
11. What happens when a device disconnects during an interaction?
12. Is a persistent user account necessary, optional, or undesirable?
13. Is persistent device identity visible and meaningful to users?
14. What privacy and safety expectations apply to remote sensing or actuation?
15. Which hardware/platform combinations define the supported product boundary?

## 13. Technical Non-Negotiables

- Product definition must not treat A/B roles as identity.
- Product definition must not treat Firebase login as pairing, trust, or remote authorization.
- Any promise of individual device control conflicts with current broadcast behavior.
- Any promise of real actuator reliability requires the manual hardware tests.
- Any N-device concept must account for the current single-remote client state.
- Any remote or sensitive use must account for manual LAN addressing and unauthenticated `ws://` transport as current constraints.

## 14. Final Handoff Statement

“NEXUS technical audit complete. Product definition can begin.”
