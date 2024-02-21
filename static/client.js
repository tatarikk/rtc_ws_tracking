let pc; // Переменная для хранения объекта RTCPeerConnection

function negotiate() {
    return pc.createOffer().then((offer) => {
        return pc.setLocalDescription(offer);
    }).then(() => {
        return new Promise((resolve) => {
            if (pc.iceGatheringState === 'complete') {
                resolve();
            } else {
                const checkState = () => {
                    if (pc.iceGatheringState === 'complete') {
                        pc.removeEventListener('icegatheringstatechange', checkState);
                        resolve();
                    }
                };
                pc.addEventListener('icegatheringstatechange', checkState);
            }
        });
    }).then(() => {
        var offer = pc.localDescription;
        console.log(offer);

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
        return response.json();
    }).then((answer) => {
        return pc.setRemoteDescription(answer).then(() => {
            // Обновляем переменную repetitions_count при получении ответа от сервера
            document.getElementById('repetitions_count').innerText = answer.repetitions_count;
        });
    }).catch((e) => {
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
    const ws = new WebSocket('ws://' + window.location.host + '/ws');
    ws.onmessage = function (event) {
        const data = JSON.parse(event.data);
        if (data.repetitions_count !== undefined) {
            // Обновляем переменную repetitions_count при получении сообщения от сервера
            document.getElementById('repetitions_count').innerText = data.repetitions_count;
        }
    };

    navigator.mediaDevices.getUserMedia({video: true, audio: true}).then((stream) => {
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
