function Websocket({ onmessage, onopen, url, reconnecttime = 5, onclose }) {

  this.reconnecttime = reconnecttime

  this.start = () => {
    // console.log("Start WebSocket: " + url)
    let socket = null
    try {
      socket = new WebSocket(url)
    } catch (e) {
      console.log("Connection WebSocket error")
    }
    if (!socket) return
    this.freeing = false
    socket.onopen = () => {
      console.log("ws connection");
      if (typeof (onopen) == 'function') {
        onopen(socket)
      }
    }

    socket.onmessage = (evt) => {
      if (typeof (onmessage) == 'function') {
        onmessage(evt, socket)
      }
    }

    socket.onerror = function () {
      console.log("ws error");
    }

    socket.onclose = () => {
      console.log("ws close..");
      if (!this.freeing && this.reconnecttime > 0 && !this.reconnecting) {
        this.reconnecting = true
        setTimeout(() => {
          this.reconnecting = false
          this.start()
        }, 1000);
        this.reconnecttime--
      }
      if (typeof (onclose) == 'function') {
        onclose()
      }
    }

    this.socket = socket

  }

  this.close = () => {
    this.freeing = true
    if (this.socket) {
      this.socket.close()
    }
    this.socket = null
  }

}

export default Websocket