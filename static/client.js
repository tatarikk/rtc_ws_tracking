let pc; // Переменная для хранения объекта RTCPeerConnection

function negotiate() {
    return pc.createOffer().then((offer) => {
        console.log("Created offer:", offer);
        return pc.setLocalDescription(offer);
    }).then(() => {
        console.log("Local description set:", pc.localDescription);
        return new Promise((resolve) => {
            if (pc.iceGatheringState === 'complete') {
                console.log("ICE gathering state is complete.");
                resolve();
            } else {
                const checkState = () => {
                    if (pc.iceGatheringState === 'complete') {
                        pc.removeEventListener('icegatheringstatechange', checkState);
                        console.log("ICE gathering state is complete.");
                        resolve();
                    }
                };
                pc.addEventListener('icegatheringstatechange', checkState);
            }
        });
    }).then(() => {
        var offer = pc.localDescription;
        console.log("Sending offer to server:", offer);

        return fetch('/offer', {
            body: JSON.stringify({
                sdp: offer.sdp,
                type: offer.type,
            }),
            headers: {
                'Content-Type': 'application/json'
            },
            method: 'POST'
        });
    }).then((response) => {
        console.log("Received response from server:", response);
        return response.json();
    }).then((answer) => {
        console.log("Received answer from server:", answer);
        return pc.setRemoteDescription(answer).then(() => {
            console.log("Remote description set successfully.");
            // Обновляем переменную repetitions_count при получении ответа от сервера
            document.getElementById('repetitions_count').innerText = answer.repetitions_count;
        });
    }).catch((e) => {
        console.error("Error:", e);
        alert(e);
    });
}

function start() {
    var config = {
        sdpSemantics: 'unified-plan'
    };

    if (document.getElementById('use-stun').checked) {
        config.iceServers = [{urls: ['stun:stun.l.google.com:19302']}];
    }

    pc = new RTCPeerConnection(config);

    pc.ontrack = (evt) => {
        console.log("Track received:", evt);
        if (evt.track.kind === 'video') {
            const stream = evt.streams[0];
            const track = stream.getVideoTracks()[0];
            const constraints = {
                width: {max: 426, ideal: 320},
                height: {max: 240, ideal: 240},
                frameRate: {max: 10}
            };

            track.applyConstraints(constraints)
                .then(() => {
                    console.log("Constraints applied successfully.");
                    document.getElementById('video').srcObject = stream;
                })
                .catch((error) => {
                    console.error('Failed to apply constraints:', error);
                });
        }
    };


    pc.onconnectionstatechange = (event) => {
        if (pc.connectionState === 'connected') {
            console.log("Connection established.");
        }
    };

    // WebSocket соединение
    const ws = new WebSocket((window.location.protocol === 'https:' ? 'wss://' : 'ws://') + window.location.host + '/ws');
    ws.onmessage = function (event) {
        const data = JSON.parse(event.data);
        console.log("Received message from server:", data);
        if (data.repetitions_count !== undefined) {
            // Обновляем переменную repetitions_count при получении сообщения от сервера
            document.getElementById('repetitions_count').innerText = data.repetitions_count;
        }
    };

    navigator.mediaDevices.getUserMedia({video: true, audio: true}).then((stream) => {
        console.log("Got media stream:", stream);
        document.getElementById('localVideo').srcObject = stream;

        stream.getTracks().forEach((track) => {
            pc.addTrack(track, stream);
        });

        document.getElementById('start').style.display = 'none';
        document.getElementById('stop').style.display = 'inline-block';
        negotiate();
    }).catch((err) => {
        console.error('Failed to get media: ', err);
        alert('Ошибка: не удалось получить доступ к камере и микрофону!');
    });
}
