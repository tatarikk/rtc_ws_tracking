import json
import time

import cv2
import mediapipe as mp
from aiortc import RTCPeerConnection, RTCSessionDescription
from fastapi import FastAPI, WebSocket, Request, WebSocketDisconnect
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

app = FastAPI()

# Мы предполагаем, что ваши статические файлы (HTML, JS) находятся в папке 'static'
app.mount("/static", StaticFiles(directory="static"), name="static")

pcs = set()
pcs_ws = set()

mpPose = mp.solutions.pose
pose = mpPose.Pose(static_image_mode=False, model_complexity=0, smooth_landmarks=False, enable_segmentation=False)
mpDraw = mp.solutions.drawing_utils

jump_started = False
repetitions_count = 0
pTime = 0


def process_image(frame):
    global jump_started, repetitions_count, pTime

    imgRGB = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
    results = pose.process(imgRGB)

    if results.pose_landmarks:
        point_30_y = results.pose_landmarks.landmark[30].y
        point_29_y = results.pose_landmarks.landmark[29].y
        point_25_y = results.pose_landmarks.landmark[25].y
        point_26_y = results.pose_landmarks.landmark[26].y
        point_15_y = results.pose_landmarks.landmark[15].y
        point_16_y = results.pose_landmarks.landmark[16].y
        point_13_y = results.pose_landmarks.landmark[13].y
        point_14_y = results.pose_landmarks.landmark[14].y

        if (
                (point_30_y < point_25_y or point_29_y < point_26_y) and
                (point_15_y < point_13_y and point_16_y < point_14_y) and
                not jump_started
        ):
            jump_started = True
            repetitions_count += 1
            # print("Выполнен прыжок:", repetitions_count)
        elif point_30_y >= point_25_y and point_29_y >= point_26_y:
            jump_started = False

        mpDraw.draw_landmarks(imgRGB, results.pose_landmarks, mpPose.POSE_CONNECTIONS)
        for id, lm in enumerate(results.pose_landmarks.landmark):
            h, w, c = imgRGB.shape
            cx, cy = int(lm.x * w), int(lm.y * h)
            cv2.circle(imgRGB, (int(cx), int(cy)), 5, (255, 0, 0), cv2.FILLED)

    cTime = time.time()
    fps = 1 / (cTime - pTime)
    pTime = cTime

    # time.sleep(1 / desired_fps)

    cv2.putText(imgRGB, f'FPS: {int(fps)}', (10, 30), cv2.FONT_HERSHEY_SIMPLEX, 1, (0, 255, 0), 2)

    return imgRGB, fps, repetitions_count


@app.get("/")
async def get_index():
    with open("static/index.html", "r") as file:
        print("Read index.html")
        return HTMLResponse(content=file.read())


@app.get("/client.js")
async def get_javascript():
    with open("static/client.js", "r") as file:
        return HTMLResponse(content=file.read(), media_type="application/javascript")


@app.post("/offer")
async def post_offer(request: Request):
    params = await request.json()
    offer = RTCSessionDescription(sdp=params["sdp"], type=params["type"])

    pc = RTCPeerConnection()
    pcs.add(pc)

    @pc.on("track")
    async def on_track(track):
        if track.kind == "video":
            while True:
                start_time = time.time()
                frame = await track.recv()
                image = frame.to_ndarray(format="bgr24")

                processed_image, fps, repetitions_count = process_image(image)
                #cv2.imwrite("frame.jpg", processed_image)
                print(f"Repetitions: {repetitions_count}")

                end_time = time.time()
                print(end_time - start_time)
                # Здесь можно реализовать логику отправки данных о количестве повторений через веб-сокеты
                for ws in pcs_ws:
                    await ws.send_text(json.dumps({"repetitions_count": repetitions_count}))

    await pc.setRemoteDescription(offer)
    answer = await pc.createAnswer()
    await pc.setLocalDescription(answer)

    return JSONResponse(content={"sdp": pc.localDescription.sdp, "type": pc.localDescription.type})


@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    print("Connected to websocket")
    pcs_ws.add(websocket)
    try:
        while True:
            data = await websocket.receive_bytes()

            # Обработка сообщений от клиента
            if data == "close":
                await websocket.close()
    except WebSocketDisconnect:
        pcs_ws.remove(websocket)


# Для on_shutdown аналога, можно использовать события жизненного цикла FastAPI
@app.on_event("shutdown")
async def shutdown_event():
    for pc in pcs:
        await pc.close()
    pcs.clear()
