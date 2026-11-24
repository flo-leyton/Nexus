function createPreviewSignalRouter(clients, emit) {
  const negotiations = new Map();

  return {
    forget(sessionId) { negotiations.delete(sessionId); },
    disconnectNode(sessionId, nodeId) {
      const current = negotiations.get(sessionId)?.get(nodeId);
      if (!current) return;
      // Keep the last offer's timestamp while the same Controller socket is online.
      current.closed = true;
      current.nodeSocket = null;
      current.seen.clear();
    },
    route(session, message, client, error) {
      const { payload, senderId, targetId, sentAt, messageId } = message;
      const controller = session.members.get(session.controllerId);
      const node = [...session.members.values()].find((member) => member.kind === 'node' && member.nodeId === payload.nodeId);
      if (!node) return error('PREVIEW_INVALID_NODE');
      const controllerSocket = clients.get(controller?.deviceId);
      const nodeSocket = clients.get(node.deviceId);
      const available = (member, socket) => member?.online && socket?.readyState === 1 &&
        socket.studioIdentity?.uid === member.uid && socket.studioIdentity.expiresAt > Date.now();
      if (!available(controller, controllerSocket) || !available(node, nodeSocket)) return error('PREVIEW_OFFLINE');
      const fromController = senderId === controller.deviceId && client === controllerSocket && targetId === node.nodeId;
      const fromNode = senderId === node.deviceId && client === nodeSocket && targetId === controller.deviceId;
      if (!fromController && !fromNode) return error('PREVIEW_INVALID_TARGET');
      let byNode = negotiations.get(session.sessionId);
      let current = byNode?.get(node.nodeId);
      if (payload.kind === 'offer') {
        if (!fromController) return error('PREVIEW_CONTROLLER_REQUIRED');
        if (current && (payload.connectionId === current.id ||
            (current.controllerSocket === controllerSocket && sentAt <= current.offeredAt))) return true;
        current = { id: payload.connectionId, offeredAt: sentAt, controllerSocket, nodeSocket,
          answered: false, closed: false, seen: new Set() };
        if (!byNode) {
          byNode = new Map();
          negotiations.set(session.sessionId, byNode);
        }
        byNode.set(node.nodeId, current);
      }
      if (!current || current.closed || current.id !== payload.connectionId ||
          current.controllerSocket !== controllerSocket || current.nodeSocket !== nodeSocket ||
          current.seen.has(messageId)) return true;
      if (payload.kind === 'answer') {
        if (!fromNode) return error('PREVIEW_NODE_REQUIRED');
        if (current.answered) return true;
        current.answered = true;
      }
      if (payload.kind === 'close') current.closed = true;
      else if (current.seen.size >= 128) return error('PREVIEW_SIGNAL_LIMIT');
      current.seen.add(messageId);
      emit(fromController ? nodeSocket : controllerSocket, JSON.stringify(message));
      return true;
    },
  };
}

module.exports = { createPreviewSignalRouter };
