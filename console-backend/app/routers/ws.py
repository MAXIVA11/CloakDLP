from fastapi import APIRouter, Query, WebSocket, WebSocketDisconnect

from app.security import decode_access_token
from app.websocket_manager import incident_manager

router = APIRouter(tags=["websocket"])


@router.websocket("/ws/incidents")
async def incidents_ws(websocket: WebSocket, token: str = Query(...)):
    if decode_access_token(token) is None:
        await websocket.close(code=4401)
        return

    await incident_manager.connect(websocket)
    try:
        while True:
            # Client doesn't need to send anything; keep the connection open.
            await websocket.receive_text()
    except WebSocketDisconnect:
        incident_manager.disconnect(websocket)
