(function () {
  if (window.__tsnSharedChatTapInstalled) return;
  window.__tsnSharedChatTapInstalled = true;

  var NativeWS = window.WebSocket;
  if (!NativeWS) return;

  function emitRaw(data) {
    try {
      window.dispatchEvent(new CustomEvent('__tsn_shared_irc_raw', { detail: data }));
    } catch (_) {}
  }

  function wrapSocket(ws) {
    ws.addEventListener('message', function (ev) {
      var data = ev && ev.data;
      if (typeof data !== 'string') return;
      if (data.indexOf('source-room-id=') === -1) return;
      emitRaw(data);
    });
    return ws;
  }

  function WrappedWebSocket(url, protocols) {
    var ws = protocols === undefined ? new NativeWS(url) : new NativeWS(url, protocols);
    return wrapSocket(ws);
  }

  WrappedWebSocket.prototype = NativeWS.prototype;
  Object.setPrototypeOf(WrappedWebSocket, NativeWS);
  WrappedWebSocket.CONNECTING = NativeWS.CONNECTING;
  WrappedWebSocket.OPEN = NativeWS.OPEN;
  WrappedWebSocket.CLOSING = NativeWS.CLOSING;
  WrappedWebSocket.CLOSED = NativeWS.CLOSED;
  window.WebSocket = WrappedWebSocket;
})();
