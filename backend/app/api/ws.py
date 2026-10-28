from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from backend.app.services.websocket_manager import ws_manager
import logging

logger = logging.getLogger("smartirrigate.ws")
router = APIRouter(tags=["WebSocket"])

@router.websocket("/ws/live")
async def websocket_live_endpoint(websocket: WebSocket):
    await ws_manager.connect(websocket)
    try:
        while True:
            # Keep connection alive, listen for any client messages or pings
            data = await websocket.receive_text()
            logger.debug(f"WS client sent: {data}")
    except WebSocketDisconnect:
        ws_manager.disconnect(websocket)
    except Exception as e:
        logger.debug(f"WS connection error: {e}")
        ws_manager.disconnect(websocket)
