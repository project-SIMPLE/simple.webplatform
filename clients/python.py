import tkinter as tk
import websockets
import asyncio

class WebSocketClient:
    def __init__(self, uri, model, message_callback):
        self.uri = uri
        self.websocket = None
        self.message_callback = message_callback
        self.model = model

    async def connect(self):
        print('La')
        try:
            self.websocket = await websockets.connect(self.uri)
            print('Connected to WebSocket server')
            self.model.ui.receive_message('Connected to WebSocket server')
        except Exception as e:
            print(f'Error connecting to WebSocket server: {e}')
            self.model.ui.receive_message(f'Error connecting to WebSocket server: {e}')

    async def disconnect(self):
        if self.websocket:
            await self.websocket.close()
            print('Disconnected from WebSocket server')
            self.model.ui.receive_message('Disconnected from WebSocket server')

    async def send_message(self, message):
        if self.websocket:
            await self.websocket.send(message)

    async def receive_messages(self):
        while True:
            if self.websocket:
                try:
                    message = await self.websocket.recv()
                    if self.message_callback:
                        self.message_callback(message)
                except websockets.exceptions.ConnectionClosed:
                    print('WebSocket connection closed')
                    self.model.ui.receive_message('WebSocket connection closed')
                    break

class UI:
    def __init__(self, model):
        self.master = tk.Tk()
        self.model = model

        self.connect_button = tk.Button(self.master, text="Connect", command=self.model.connect)
        self.connect_button.pack(pady=10)

        self.disconnect_button = tk.Button(self.master, text="Disconnect", command=self.model.disconnect)
        self.disconnect_button.pack(pady=10)

        self.button1 = tk.Button(self.master, text="Button 1", command=self.model.button1_function)
        self.button1.pack(pady=10)

        self.button2 = tk.Button(self.master, text="Button 2", command=self.model.button2_function)
        self.button2.pack(pady=10)

        self.message_text = tk.Text(self.master, height=10, width=40)
        self.message_text.pack(pady=10)

        self.master.mainloop()

    def receive_message(self, message):
        self.message_text.insert(tk.END, f"{message}\n")
        self.message_text.see(tk.END)

class Model:
    def __init__(self, uri):
        self.websocket_client = WebSocketClient(uri, self, self.receive_message)
        self.ui = UI(self)

    def connect(self):
        asyncio.ensure_future(self.websocket_client.connect())

    def disconnect(self):
        asyncio.ensure_future(self.websocket_client.disconnect())

    def button1_function(self):
        asyncio.ensure_future(self.websocket_client.send_message("Button 1 pressed"))

    def button2_function(self):
        asyncio.ensure_future(self.websocket_client.send_message("Button 2 pressed"))

    def receive_message(self, message):
        if self.ui:
            self.ui.receive_message(message)

async def main():
    uri = "ws://localhost:8080"

    model = Model(uri)

if __name__ == "__main__":
    loop = asyncio.get_event_loop()
    loop.run_until_complete(main())
